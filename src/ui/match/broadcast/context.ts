// What the broadcast knows before a game starts: the competition and stage, the series, both teams (record, form,
// fans), every player on the Rift (season numbers, form, MVPs, titles, comfort on the pick), the pick notes, the
// head-to-head, lore, and the audience model. Built once per game from the save + the live session; pure (no stores),
// so the headless scripts can build it too.
import type { GameState, Team, Role, MatchFixture, SeriesGame } from '../../../engine/types';
import type { MatchSim } from '../../../engine/sim/engine';
import type { DraftState } from '../../../engine/draft/draft';
import { liveFlags, type LiveFlag } from '../../../engine/management/buzzCore';
import { playerRings } from '../../../engine/management/legacy';
import { destinySide } from '../../../engine/season/lore';
import { analyzePicks, comfortTier, type PickReport, type ComfortTier } from './picks';
import { audienceBase, audienceInput, eventOf, stageOf, type AudienceBase, type StageKind } from './audience';
import { hashString } from '../../../util/rng';

export interface PlayerInfo {
  idx: number; side: 0 | 1; role: Role; name: string; champ: string; champId: string; playerId: string;
  country?: string; reputation: number; form: number; formWord: string;
  sg: number; sw: number; skda: string; kpg: string; mvps: number; titles: string[]; rings: number; msis: number;
  comfort: number; tier: ComfortTier; cg: number; cw: number; traits: string[]; flag?: LiveFlag; star: boolean;
}
export interface TeamInfo {
  side: 0 | 1; id: string; name: string; short: string; region: string; leagueId: string; country?: string;
  w: number; l: number; form: string; streak: number; fans: number; hype: number; prestige: number; titles: number;
}
export interface BroadcastCtx {
  comp: string; event: string; tier: number; stage: StageKind; stageLabel: string; leagueId?: string;
  bestOf: number; gameNo: number; wins: [number, number]; need: number; fearless: boolean; patch: string;
  teams: [TeamInfo, TeamInfo];
  players: PlayerInfo[];
  picks: PickReport;
  h2h: { w: string; score: string; comp: string }[];
  lore: { t1: string; lpl: string } | null;
  fav: 0 | 1; favBy: number;
  userSide: 0 | 1;
  audience: AudienceBase | null;
  /** Vietnamese broadcast context (VCS, or a Vietnamese team on stage) */
  vn: boolean; vnTeams: number;
  rivalry?: string;
  fixtureId: string;
  final: boolean;
}

export interface SessionLike { fixtureId: string; gameNo: number; series?: { games: SeriesGame[]; locked: Set<string> }; draft?: DraftState }

const formWord = (f: number) => (f >= 6 ? 'red-hot' : f >= 3 ? 'in great form' : f >= 1 ? 'in decent form' : f > -1 ? 'steady' : f > -3 ? 'a little off the pace' : f > -6 ? 'struggling' : 'ice cold');
const kdaOf = (k: number, d: number, a: number) => ((k + a) / Math.max(1, d)).toFixed(1);

/** Pre-game strength of a side from the sim inputs (ratings + comfort). */
function strength(sim: MatchSim, side: 0 | 1): number {
  const ps = sim.champs.filter((c) => c.side === side);
  return ps.reduce((s, c) => s + (c.input.mech + c.input.lane + c.input.tf + c.input.macro) / 4 + Math.min(200, c.input.mastery) / 40, 0) / Math.max(1, ps.length);
}

export function buildBroadcastCtx(state: GameState | null, sess: SessionLike | null, sim: MatchSim, teams: [Team, Team], userSide: 0 | 1): BroadcastCtx {
  const f: MatchFixture | undefined = state && sess ? state.fixtures[sess.fixtureId] : undefined;
  const c = f && state ? state.competitions[f.competitionId] : undefined;
  const games = sess?.series?.games ?? [];
  const wins: [number, number] = [games.filter((g) => g.winner === teams[0].id).length, games.filter((g) => g.winner === teams[1].id).length];
  const bestOf = f?.bestOf ?? 1;
  const flags = state ? liveFlags(state) : {};
  // players on the Rift
  const players: PlayerInfo[] = sim.champs.map((ch) => {
    const p = state?.players[ch.input.playerId];
    const s = p?.season;
    const onC = s?.champions?.[ch.champ.id];
    const titles = p ? p.career.flatMap((x) => x.titles) : [];
    const comfort = p?.champions?.[ch.champ.id] ?? ch.input.mastery ?? 70;
    return {
      idx: ch.idx, side: ch.side as 0 | 1, role: ch.role, name: ch.input.name, champ: ch.champ.name, champId: ch.champ.id, playerId: ch.input.playerId,
      country: p?.country, reputation: p?.reputation ?? 50, form: p?.form ?? 0, formWord: formWord(p?.form ?? 0),
      sg: s?.games ?? 0, sw: s?.wins ?? 0, skda: s ? kdaOf(s.kills, s.deaths, s.assists) : '—', kpg: s && s.games ? (s.kills / s.games).toFixed(1) : '0', mvps: s?.mvps ?? 0,
      titles, rings: p && state ? playerRings(state, p, 'worlds').length : 0, msis: p && state ? playerRings(state, p, 'msi').length : 0,
      comfort, tier: comfortTier(comfort), cg: onC?.games ?? 0, cw: onC?.wins ?? 0, traits: p?.traits ?? [], flag: flags[ch.input.playerId], star: (p?.reputation ?? 0) >= 85,
    };
  });
  // teams: record in this competition, recent form
  const teamInfo = (side: 0 | 1): TeamInfo => {
    const t = teams[side];
    let w = 0, l = 0;
    const recent: string[] = [];
    if (state) {
      const fx = Object.values(state.fixtures).filter((x) => x.result && x.result.loser && (x.teamA === t.id || x.teamB === t.id)).sort((a, b) => b.date.localeCompare(a.date));
      for (const x of fx) { if (c && x.competitionId === c.id) { if (x.result!.winner === t.id) w++; else l++; } }
      for (const x of fx.slice(0, 5)) recent.push(x.result!.winner === t.id ? 'W' : 'L');
    }
    let streak = 0;
    for (const r of recent) { if (streak === 0) streak = r === 'W' ? 1 : -1; else if ((r === 'W') === streak > 0) streak += streak > 0 ? 1 : -1; else break; }
    return { side, id: t.id, name: t.name, short: t.short, region: t.region, leagueId: t.leagueId, country: t.country, w, l, form: recent.join(''), streak, fans: t.fans, hype: t.hype, prestige: t.prestige, titles: t.titles?.length ?? 0 };
  };
  const tinfo: [TeamInfo, TeamInfo] = [teamInfo(0), teamInfo(1)];
  // head-to-head this save
  const h2h: BroadcastCtx['h2h'] = [];
  if (state) {
    for (const x of Object.values(state.fixtures)) {
      if (!x.result || !x.result.loser || x.id === f?.id) continue;
      if (!((x.teamA === teams[0].id && x.teamB === teams[1].id) || (x.teamA === teams[1].id && x.teamB === teams[0].id))) continue;
      const r = x.result;
      h2h.push({ w: state.teams[r.winner]?.short ?? '?', score: `${Math.max(r.scoreA, r.scoreB)}-${Math.min(r.scoreA, r.scoreB)}`, comp: state.competitions[x.competitionId]?.name ?? '' });
    }
  }
  const picks = analyzePicks({
    champs: sim.champs.map((ch) => ({ idx: ch.idx, side: ch.side as 0 | 1, role: ch.role, playerId: ch.input.playerId, name: ch.input.name, championId: ch.champ.id, mastery: ch.input.mastery })),
    teams: [{ id: teams[0].id, short: teams[0].short }, { id: teams[1].id, short: teams[1].short }],
    state, draft: sess?.draft ?? null, patchPower: state?.championPower, locked: sess?.series?.locked.size ?? 0, gameNo: sess?.gameNo ?? 1, bestOf,
  });
  const s0 = strength(sim, 0), s1 = strength(sim, 1);
  const dest = state ? destinySide(state, teams[0], teams[1]) : null;
  const lore = dest === null ? null : { t1: teams[dest].short, lpl: teams[1 - dest].short };
  let audience: AudienceBase | null = null;
  if (state && f) { const a = audienceInput(state, f, { gameNo: sess?.gameNo, games, blueId: teams[0].id }); if (a) audience = audienceBase(a); }
  const vnTeams = teams.filter((t) => t.country === 'Vietnam' || t.leagueId === 'VCS').length;
  return {
    comp: c?.name ?? 'Match day', event: eventOf(c), tier: c?.tier ?? 1, stage: f ? stageOf(c, f) : 'regular', stageLabel: f?.label ?? c?.stages.find((s) => s.id === f?.stageId)?.name ?? '',
    leagueId: c?.leagueId, bestOf, gameNo: sess?.gameNo ?? games.length + 1, wins, need: Math.ceil(bestOf / 2), fearless: f?.fearless !== false, patch: state?.patch ?? '',
    teams: tinfo, players, picks, h2h, lore, fav: s0 >= s1 ? 0 : 1, favBy: Math.abs(s0 - s1), userSide, audience,
    vn: vnTeams > 0 || c?.leagueId === 'VCS' || state?.teams[state.userTeamId]?.country === 'Vietnam', vnTeams, rivalry: audience?.input.rivalryWhy,
    fixtureId: f?.id ?? `${teams[0].id}-${teams[1].id}`, final: f ? /^(Grand )?Final$/.test((f.label ?? '').trim()) : false,
  };
}

/** Stable per-fixture hash (desk choice etc.). */
export const fixtureHash = (ctx: BroadcastCtx) => hashString(ctx.fixtureId);
