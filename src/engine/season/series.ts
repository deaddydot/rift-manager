// Series simulation: Fearless draft across games, full engine or fast statistical sim,
// and recording results into fixtures, players and teams.
import type { GameState, MatchFixture, SeriesGame, GamePlayerLine, Role, Team, Player } from '../types';
import { masteryGain, MASTERY_UNKNOWN } from '../mastery';
import { destinySide } from './lore';
import { ROLES } from '../types';
import { pickMvp } from '../sim/mvp';
import { RNG, clamp, sigmoid, hashString } from '../../util/rng';
import { gd, matchupEdge } from '../../data/gamedata';
import { newDraft, runAIDraft, picksOf, bansOf, comfort, metaScore, type DraftState, type DraftTeam } from '../draft/draft';
import { draftTeam, simTeam, lineupPlayers, effective } from './prep';
import { MatchSim } from '../sim/engine';
import type { MatchResult } from '../sim/simtypes';
import { overall } from '../setup';
import { simRating } from '../ratings';
import { gameExperience, stageWeight } from '../management/development';
import { feedResult } from './formats';
import { onSeriesFinished } from '../management/reactions';
import { peopleAfterSeries } from '../management/people';
import { traitPower } from '../management/traitEffects';
import { boostFans } from '../management/fanbase';

// ------------------------------------------------------------------ quick draft (background matches)
export function quickDraft(blue: DraftTeam, red: DraftTeam, locked: Set<string>, rng: RNG, patch: Record<string, number>): DraftState {
  const d = newDraft(blue, red, [...locked]);
  const taken = new Set(locked);
  // bans: each side bans the opponent's most comfortable strong picks
  const bans: [string[], string[]] = [[], []];
  for (const side of [0, 1] as const) {
    const opp = side === 0 ? red : blue;
    const cands: [string, number][] = [];
    for (const p of opp.players) for (const [c, m] of Object.entries(p.champions)) if (!taken.has(c) && gd().championById[c]) cands.push([c, m / 100 * 0.6 + metaScore(c, p.role, patch) * 0.4 + (p.rating - 70) / 200 + rng.next() * 0.1]);
    cands.sort((x, y) => y[1] - x[1]);
    for (const [c] of cands) { if (bans[side].length >= 5) break; if (!taken.has(c)) { bans[side].push(c); taken.add(c); } }
  }
  // picks: each player takes their best available champion
  const picks: [Record<Role, string>, Record<Role, string>] = [{} as Record<Role, string>, {} as Record<Role, string>];
  const order: [0 | 1, Role][] = [];
  const rolesShuffled = [rng.shuffle([...ROLES]), rng.shuffle([...ROLES])];
  for (let i = 0; i < 5; i++) { order.push([0, rolesShuffled[0][i]]); order.push([1, rolesShuffled[1][i]]); }
  for (const [side, role] of order) {
    const team = side === 0 ? blue : red;
    const p = team.players.find((x) => x.role === role)!;
    let best = '', bv = -Infinity;
    const pool = new Set([...Object.keys(p.champions), ...gd().championsByRole[role].map((c) => c.id)]);
    for (const c of pool) {
      if (taken.has(c)) continue;
      const m = metaScore(c, role, patch);
      if (m <= 0) continue;
      const v = comfort(p, c, role) * 0.6 + m * 0.4 + rng.normal(0, 0.05 + (100 - team.drafting) / 1500);
      if (v > bv) { bv = v; best = c; }
    }
    if (!best) best = gd().championsByRole[role].find((c) => !taken.has(c.id))?.id ?? gd().champions.find((c) => !taken.has(c.id))!.id;
    picks[side][role] = best;
    taken.add(best);
  }
  for (const side of [0, 1] as const) {
    for (const b of bans[side]) d.actions.push({ side, type: 'ban', champion: b });
    for (const r of ROLES) d.actions.push({ side, type: 'pick', champion: picks[side][r], role: r });
  }
  d.done = true;
  d.step = 20;
  return d;
}

export const draftPicks = (d: DraftState, side: 0 | 1): Record<Role, string> => {
  const out = {} as Record<Role, string>;
  for (const a of picksOf(d, side)) out[a.role!] = a.champion!;
  return out;
};

// ------------------------------------------------------------------ quick statistical sim
const ROLE_SHARE: Record<Role, { k: number; a: number; d: number; csm: number; gold: number; dmg: number; vs: number }> = {
  top: { k: 0.2, a: 0.17, d: 0.21, csm: 8.2, gold: 0.22, dmg: 0.22, vs: 1.0 },
  jungle: { k: 0.19, a: 0.25, d: 0.2, csm: 5.6, gold: 0.19, dmg: 0.16, vs: 1.6 },
  mid: { k: 0.25, a: 0.2, d: 0.19, csm: 9.0, gold: 0.24, dmg: 0.28, vs: 1.1 },
  adc: { k: 0.29, a: 0.17, d: 0.17, csm: 9.4, gold: 0.25, dmg: 0.27, vs: 1.0 },
  support: { k: 0.07, a: 0.32, d: 0.23, csm: 1.2, gold: 0.1, dmg: 0.07, vs: 3.4 },
};

export function teamPowerFor(state: GameState, team: Team, picks: Record<Role, string>, d: DraftState, side: 0 | 1, big: boolean): number {
  const lp = lineupPlayers(state, team);
  const dt = d.teams[side];
  let s = 0;
  for (const r of ROLES) {
    const p = lp[r];
    const e = effective(state, p, team, r);
    let ovr = simRating(overall(e, r)); // ratings past 100 are worth a little less per point (engine/ratings.ts)
    if (big) ovr += (simRating(e.clutch) - 60) * 0.06 + (p.traits.includes('ice_veins') ? 2 : 0) - (p.traits.includes('big_stage_nerves') ? 3 : 0);
    const dp = dt.players.find((x) => x.role === r)!;
    const m = comfort(dp, picks[r], r);
    const opp = d.teams[1 - side] ? picksOf(d, (1 - side) as 0 | 1).find((a) => a.role === r)?.champion : undefined;
    ovr += traitPower(state, p, { role: r, champ: picks[r], mastery: m * 200, oppChamp: opp, big, d, side }); // extended traits
    s += ovr + (m - 0.7) * 10 + metaScore(picks[r], r, state.championPower) * 3 + (opp && r !== 'jungle' ? matchupEdge(picks[r], opp, r) * 12 : 0);
  }
  return s / 5;
}

export function quickSim(state: GameState, blue: Team, red: Team, d: DraftState, rng: RNG, big: boolean): SeriesGame {
  const pb = draftPicks(d, 0), pr = draftPicks(d, 1);
  const powB = teamPowerFor(state, blue, pb, d, 0, big), powR = teamPowerFor(state, red, pr, d, 1, big);
  // variance from consistency: random swing on each side
  const swing = rng.normal(0, 2.4);
  const p = sigmoid((powB - powR + swing) / 5.2 + 0.06);
  const fate = destinySide(state, blue, red);
  const blueWins = rng.chance(p) ? fate !== 1 : fate === 0;
  const winner = blueWins ? blue : red, loser = blueWins ? red : blue;
  const gap = Math.abs(powB - powR);
  const tempo = avgTempo(blueWins ? pb : pr);
  const duration = clamp(rng.normal(31.5 - gap * 0.25 - tempo * 1.5, 4.8), 19, 52) * 60;
  const mins = duration / 60;
  const totalKills = Math.max(6, Math.round(rng.normal(25 + (mins - 31) * 0.4, 7)));
  const winShare = clamp(0.66 + gap / 60 + rng.normal(0, 0.07), 0.5, 0.92);
  const kW = Math.round(totalKills * winShare), kL = totalKills - kW;
  const towersW = clamp(Math.round(rng.normal(8.5 + gap / 8, 1.5)), 5, 11), towersL = clamp(Math.round(rng.normal(3 - gap / 10, 1.8)), 0, 8);
  const dragonsTotal = clamp(Math.round(rng.normal(3.6 + (mins - 30) / 8, 1)), 1, 7);
  const dW = clamp(Math.round(dragonsTotal * clamp(0.68 + rng.normal(0, 0.15), 0.3, 1)), 0, dragonsTotal), dL = dragonsTotal - dW;
  const baronW = mins > 22 ? (rng.chance(0.8) ? 1 + (mins > 34 && rng.chance(0.4) ? 1 : 0) : 0) : 0;
  const baronL = mins > 26 && rng.chance(0.18) ? 1 : 0;
  const goldW = Math.round((mins * 2050 + kW * 300) * (1 + gap / 200)), goldL = Math.round(mins * 1900 + kL * 300);
  const lines: GamePlayerLine[] = [];
  for (const [team, picks, isWinner, side] of [[blue, pb, blueWins, 0], [red, pr, !blueWins, 1]] as [Team, Record<Role, string>, boolean, 0 | 1][]) {
    const lp = lineupPlayers(state, team);
    const kills = isWinner ? kW : kL, enemyKills = isWinner ? kL : kW;
    const teamGold = isWinner ? goldW : goldL;
    for (const r of ROLES) {
      const pl = lp[r];
      const e = effective(state, pl, team, r);
      const sh = ROLE_SHARE[r];
      const perf = clamp(1 + (simRating(overall(e, r)) - 70) / 120 + rng.normal(0, 0.18), 0.4, 1.8);
      const k = Math.max(0, Math.round(kills * sh.k * perf + rng.normal(0, 1)));
      const dd = Math.max(0, Math.round(enemyKills * sh.d / perf + rng.normal(0, 1)));
      const a = Math.max(0, Math.round(kills * sh.a * 1.6 * (0.7 + perf * 0.3) + rng.normal(0, 1.5)));
      const cs = Math.max(0, Math.round(sh.csm * mins * (0.82 + Math.min(1.15, simRating(e.farming) / 100) * 0.25) * (isWinner ? 1.04 : 0.96)));
      const gold = Math.round(teamGold * sh.gold * (0.9 + perf * 0.1));
      const dmg = Math.round(mins * 620 * sh.dmg * 5 * (0.85 + perf * 0.15));
      const vision = Math.round(mins * sh.vs * (0.8 + simRating(e.vision) / 250));
      lines.push({ playerId: pl.id, teamId: team.id, role: r, champion: picks[r], k, d: dd, a: Math.min(a, kills), cs, gold, damage: dmg, vision });
    }
  }
  // MVP judged against role norms (see sim/mvp.ts), same rule as full simulations
  const idx = lines.map((_, i) => i);
  const mvp = lines[pickMvp(lines.map((l) => ({ role: l.role, k: l.k, d: l.d, a: l.a, damage: l.damage, gold: l.gold, vision: l.vision })), idx.filter((i) => lines[i].teamId === winner.id), idx.filter((i) => lines[i].teamId !== winner.id), duration / 60, true)];
  return {
    blue: blue.id, red: red.id, winner: winner.id, duration: Math.round(duration),
    kills: blueWins ? [kW, kL] : [kL, kW], gold: blueWins ? [goldW, goldL] : [goldL, goldW], towers: blueWins ? [towersW, towersL] : [towersL, towersW],
    dragons: blueWins ? [dW, dL] : [dL, dW], barons: blueWins ? [baronW, baronL] : [baronL, baronW],
    picks: [ROLES.map((r) => pb[r]), ROLES.map((r) => pr[r])], bans: [bansOf(d, 0), bansOf(d, 1)], players: lines, mvp: mvp?.playerId,
  };
}

function avgTempo(picks: Record<Role, string>) {
  let s = 0;
  for (const r of ROLES) { const c = gd().championById[picks[r]]; if (c) s += (c.profile.early - c.profile.late) / 10; }
  return s / 5;
}

/** Convert a full engine MatchResult into a SeriesGame. */
export function fromMatchResult(res: MatchResult, blue: Team, red: Team, d: DraftState): SeriesGame {
  const t0 = res.teams[0], t1 = res.teams[1];
  return {
    blue: blue.id, red: red.id, winner: res.winner === 0 ? blue.id : red.id, duration: Math.round(res.duration),
    kills: [t0.kills, t1.kills], gold: [t0.gold, t1.gold], towers: [t0.towers, t1.towers], dragons: [t0.dragons.length, t1.dragons.length], barons: [t0.barons, t1.barons],
    picks: [res.players.filter((p) => p.side === 0).map((p) => p.championId), res.players.filter((p) => p.side === 1).map((p) => p.championId)],
    bans: [bansOf(d, 0), bansOf(d, 1)], detailed: true,
    players: res.players.map((p) => ({ playerId: p.playerId, teamId: p.side === 0 ? blue.id : red.id, role: p.role, champion: p.championId, k: p.k, d: p.d, a: p.a, cs: p.cs, gold: p.gold, damage: p.damage, vision: p.vision, items: p.items })),
    mvp: res.players[res.mvp]?.playerId,
  };
}

// ------------------------------------------------------------------ series
export interface SeriesContext { fixture: MatchFixture; games: SeriesGame[]; locked: Set<string>; blueNext: string; done: boolean; winner?: string }

export function newSeries(state: GameState, f: MatchFixture): SeriesContext {
  // first selection: higher seed (team A) takes blue side in game 1
  return { fixture: f, games: [], locked: new Set(), blueNext: f.teamA!, done: false };
}

export function isBigMatch(state: GameState, f: MatchFixture) {
  const c = state.competitions[f.competitionId];
  return !!c && (c.tier === 0 || c.kind === 'playoffs' || (f.label ?? '').includes('Final'));
}

/** Play the next game of a series. `full` uses the tick engine (with AI draft). */
export function playNextGame(state: GameState, s: SeriesContext, rng: RNG, full: boolean, preset?: { draft: DraftState; result?: MatchResult }): SeriesGame {
  const f = s.fixture;
  const blueId = s.blueNext;
  const redId = blueId === f.teamA ? f.teamB! : f.teamA!;
  const blue = state.teams[blueId], red = state.teams[redId];
  const big = isBigMatch(state, f);
  let game: SeriesGame;
  let d: DraftState;
  if (preset) {
    d = preset.draft;
    game = preset.result ? fromMatchResult(preset.result, blue, red, d) : quickSim(state, blue, red, d, rng, big);
  } else if (full) {
    d = newDraft(draftTeam(state, blue), draftTeam(state, red), f.fearless === false ? [] : [...s.locked]);
    runAIDraft(d, rng, state.championPower);
    const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: rng.int(1, 2 ** 31), bigMatch: big, destiny: destinySide(state, blue, red) ?? undefined });
    game = fromMatchResult(sim.runToEnd(), blue, red, d);
  } else {
    d = quickDraft(draftTeam(state, blue), draftTeam(state, red), f.fearless === false ? new Set() : s.locked, rng, state.championPower);
    game = quickSim(state, blue, red, d, rng, big);
  }
  s.games.push(game);
  for (const side of [0, 1] as const) for (const a of picksOf(d, side)) if (a.champion) s.locked.add(a.champion);
  // loser of the game picks side next game (takes blue)
  const loser = game.winner === blueId ? redId : blueId;
  s.blueNext = loser;
  const need = Math.ceil(f.bestOf / 2);
  const winsA = s.games.filter((g) => g.winner === f.teamA).length, winsB = s.games.filter((g) => g.winner === f.teamB).length;
  if (winsA >= need || winsB >= need) { s.done = true; s.winner = winsA > winsB ? f.teamA! : f.teamB!; }
  recordGame(state, f, game);
  return game;
}

/** Finalise a series into its fixture and propagate bracket links. */
export function finishSeries(state: GameState, s: SeriesContext) {
  const f = s.fixture;
  const winsA = s.games.filter((g) => g.winner === f.teamA).length, winsB = s.games.filter((g) => g.winner === f.teamB).length;
  const winner = winsA > winsB ? f.teamA! : f.teamB!;
  const loser = winner === f.teamA ? f.teamB! : f.teamA!;
  // keep only light summaries for background matches
  const tier = state.competitions[f.competitionId]?.tier ?? 3;
  const keepDetail = f.teamA === state.userTeamId || f.teamB === state.userTeamId || tier === 0;
  const games = keepDetail ? s.games : s.games.map((g) => (tier <= 1 ? { ...g, players: undefined } : { blue: g.blue, red: g.red, winner: g.winner, duration: g.duration, kills: g.kills, gold: g.gold, towers: g.towers, dragons: g.dragons, barons: g.barons, picks: [[], []] as [string[], string[]], bans: [[], []] as [string[], string[]] }));
  f.result = { winner, loser, scoreA: winsA, scoreB: winsB, games };
  feedResult(f, state.fixtures);
  // team-level effects
  const w = state.teams[winner], l = state.teams[loser];
  if (w) { w.hype = clamp(w.hype + 2, 0, 100); boostFans(w, 0.002); }
  if (l) { l.hype = clamp(l.hype - 1.5, 0, 100); }
  for (const [team, won] of [[w, true], [l, false]] as [Team, boolean][]) {
    if (!team) continue;
    for (const pid of Object.values(team.lineup)) {
      const p = pid ? state.players[pid] : null;
      if (!p) continue;
      p.morale = clamp(p.morale + (won ? 2 : -2.5) * (1 - p.hidden.composure / 250), 5, 100);
    }
  }
  onSeriesFinished(state, f); // fan & owner reactions
  peopleAfterSeries(state, f); // locker room: recap, blame / bonding moments
}

/** Simulate a whole series at once (background or "sim" button). */
export function simulateSeries(state: GameState, f: MatchFixture, rng: RNG, full: boolean) {
  const s = newSeries(state, f);
  while (!s.done) playNextGame(state, s, rng, full);
  finishSeries(state, s);
  return s;
}

// ------------------------------------------------------------------ recording
export function recordGame(state: GameState, f: MatchFixture, g: SeriesGame) {
  if (!g.players) return;
  const comp = state.competitions[f.competitionId];
  const mins = g.duration / 60;
  // stage experience: lineup strength on both sides (opponent edge) and how big the stage is
  const lineAvg: Record<string, number> = {}, lineN: Record<string, number> = {};
  for (const line of g.players) { const p = state.players[line.playerId]; if (!p) continue; lineAvg[line.teamId] = (lineAvg[line.teamId] ?? 0) + overall(p.attributes, line.role); lineN[line.teamId] = (lineN[line.teamId] ?? 0) + 1; }
  for (const t of Object.keys(lineAvg)) lineAvg[t] /= lineN[t];
  const stage = stageWeight(state, f);
  const xrng = new RNG(hashString(`${f.id}|${g.duration}|${g.winner}|${g.kills.join('-')}`));
  for (const line of g.players) {
    const p: Player | undefined = state.players[line.playerId];
    if (!p) continue;
    const won = g.winner === line.teamId;
    const s = p.season;
    s.games++; if (won) s.wins++;
    s.kills += line.k; s.deaths += line.d; s.assists += line.a; s.cs += line.cs; s.gold += line.gold; s.damage += line.damage; s.vision += line.vision; s.minutes += mins;
    if (g.mvp === p.id) s.mvps++;
    const ch = (s.champions[line.champion] ??= { games: 0, wins: 0 });
    ch.games++; if (won) ch.wins++;
    // champion mastery grows with games played
    p.champions[line.champion] = masteryGain(p.champions[line.champion] ?? MASTERY_UNKNOWN, won);
    const vsTeam = line.teamId === g.blue ? g.red : g.blue;
    p.history.unshift({ date: state.date, event: comp?.short ?? '', team: line.teamId, vs: vsTeam, champion: line.champion, k: line.k, d: line.d, a: line.a, cs: line.cs, win: won, len: Math.round(mins) });
    if (p.history.length > ((comp?.tier ?? 3) <= 1 || line.teamId === state.userTeamId ? 15 : 6)) p.history.length = (comp?.tier ?? 3) <= 1 || line.teamId === state.userTeamId ? 15 : 6;
    // form: performance relative to expectation
    const kdaScore = (line.k * 2 + line.a - line.d * 1.5) / Math.max(1, mins / 10);
    p.form = clamp(p.form * 0.85 + (kdaScore - 4) * 0.25 + (won ? 0.6 : -0.6), -10, 10);
    p.fatigue = clamp(p.fatigue + 2.5, 0, 100);
    p.lastPlayed = state.date;
    // career line
    let car = p.career.find((c) => c.season === state.season && c.teamId === line.teamId);
    if (!car) { car = { season: state.season, teamId: line.teamId, teamName: state.teams[line.teamId]?.name ?? '', games: 0, wins: 0, titles: [] }; p.career.push(car); }
    car.games++; if (won) car.wins++;
    const vs = line.teamId === g.blue ? g.red : g.blue;
    gameExperience(state, p, won, stage, (lineAvg[vs] ?? 0) - (lineAvg[line.teamId] ?? 0), g.mvp === p.id, () => xrng.next());
  }
}
