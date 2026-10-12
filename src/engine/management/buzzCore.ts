// Fan buzz core: state, Editor edit notes, per-player form vs rating, fan "perception" labels, live-match
// flags and extra series scenes for the fan feed. Kept free of runtime imports from fans.ts (which imports
// this file); the reactions themselves live in buzz.ts.
import type { GameState, Player, Team, BuzzState, BuzzEvent, FanPost, SeriesGame, Role, MatchFixture } from '../types';
import { ROLES, ROLE_LABEL, FACILITY_INFO, type FacilityKey } from '../types';
import { overall, ageOn } from '../setup';
import { staffRating } from './staffMarket';
import { seasonRecord } from './fixtureinfo';
import { standings } from '../season/formats';
import { mvpScore, type MvpLine } from '../sim/mvp';
import { gd } from '../../data/gamedata';
import { destinySide, T1_ID } from '../season/lore';
import type { SeriesInfo, Ctx } from './fans';

export const days = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
export const champName = (id: string) => gd().championById[id]?.name ?? id;
export const facSum = (t: Team) => (Object.keys(FACILITY_INFO) as FacilityKey[]).reduce((s, k) => s + (t.facilities[k] ?? 0), 0);
export const ovrOf = (p: Player) => overall(p.attributes, p.role);
const MAX_ARCHIVE = 120, MAX_EVENTS = 40, MAX_EDITS = 40, FORM_N = 8;
/** Performance model (calibrated on season sims): mvpScore ≈ EXP0 + EXP_SLOPE × (own overall − opposing lineup average). */
const EXP0 = 1.9, EXP_SLOPE = 0.14;
const MILESTONES = [50, 100, 150, 200, 250, 300, 400, 500, 600, 750, 1000];

export function buzzState(state: GameState): BuzzState {
  const fp = (state.fanPulse ??= { teams: {}, posts: [] });
  return (fp.buzz ??= { ovr: {}, base: {}, edits: [], events: [], form: {}, archive: [], flags: {} });
}

/** Cooldown flag in the buzz state: true (and stamps the date) when `key` wasn't used in the last `n` days. */
export function bcool(bz: BuzzState, key: string, date: string, n: number) {
  const d = bz.flags[key];
  if (d && days(d, date) < n) return false;
  bz.flags[key] = date;
  return true;
}

export function addBuzzEvent(state: GameState, e: Omit<BuzzEvent, 'id' | 'date'>): BuzzEvent {
  const bz = buzzState(state);
  const ev: BuzzEvent = { id: `bz_${state.seq++}`, date: state.date, ...e };
  bz.events.unshift(ev);
  if (bz.events.length > MAX_EVENTS) bz.events.length = MAX_EVENTS;
  return ev;
}

/** Called from emit(): posts about a player outlive the 150-post feed (replies dropped to keep saves small). */
export function archivePost(state: GameState, post: FanPost) {
  const bz = state.fanPulse?.buzz;
  if (!bz) return;
  bz.archive.unshift({ ...post, replies: undefined });
  if (bz.archive.length > MAX_ARCHIVE) bz.archive.length = MAX_ARCHIVE;
}

/** Recent posts about a player (main feed + archive), newest first. */
export function playerPosts(state: GameState, playerId: string, n = 6): FanPost[] {
  const seen = new Set<string>(), out: FanPost[] = [];
  for (const p of [...(state.fanPulse?.posts ?? []), ...(state.fanPulse?.buzz?.archive ?? [])]) {
    if (p.playerId !== playerId || seen.has(p.id)) continue;
    seen.add(p.id); out.push(p);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.mins ?? 0) - (a.mins ?? 0)).slice(0, n);
}

// ------------------------------------------------------------------ editor hook
/** Editor hook (custom.ts): remember how an entity looked before an edit so tomorrow's fans can notice. */
export function noteEdit(state: GameState, kind: 'player' | 'staff' | 'team', id: string, created = false) {
  const bz = buzzState(state);
  bz.flags['ed:' + id] = state.date;
  if (bz.edits.some((e) => e.id === id && e.kind === kind && !e.seen)) return; // keep the first "before" of the day
  let before: Record<string, string | number>;
  if (created) before = { created: 1 };
  else if (kind === 'player') { const p = state.players[id]; if (!p) return; before = { ovr: ovrOf(p), handle: p.handle, role: p.role, team: p.teamId ?? '', birth: p.birthdate ?? '' }; }
  else if (kind === 'staff') { const s = state.staff[id]; if (!s) return; before = { rating: staffRating(s), handle: s.handle, team: s.teamId ?? '' }; }
  else { const t = state.teams[id]; if (!t) return; before = { name: t.name, short: t.short, balance: Math.round(t.balance), fac: facSum(t), roster: t.roster.join(',') }; }
  bz.edits.unshift({ kind, id, date: state.date, before });
  if (bz.edits.length > MAX_EDITS) bz.edits.length = MAX_EDITS;
}
export const wasEdited = (state: GameState, id: string, within = 400) => { const d = state.fanPulse?.buzz?.flags['ed:' + id]; return !!d && days(d, state.date) <= within; };

// ------------------------------------------------------------------ form vs rating
const lineOf = (l: { role: Role; k: number; d: number; a: number; damage: number; gold: number; vision: number }): MvpLine => ({ role: l.role, k: l.k, d: l.d, a: l.a, damage: l.damage, gold: l.gold, vision: l.vision });

export interface SeriesForm { res: number; k: number; d: number; a: number; games: number; mvps: number }
/** Score each of our players' games vs what their rating predicts; appends to the rolling form. */
export function updateForm(state: GameState, team: Team, games: SeriesGame[]): Map<string, SeriesForm> {
  const bz = buzzState(state);
  const out = new Map<string, SeriesForm>();
  for (const g of games) {
    if (!g.players?.length) continue;
    const mine = g.players.filter((l) => l.teamId === team.id), theirs = g.players.filter((l) => l.teamId !== team.id);
    const oppAvg = theirs.reduce((s, l) => s + (state.players[l.playerId] ? ovrOf(state.players[l.playerId]) : 60), 0) / Math.max(1, theirs.length);
    for (const l of mine) {
      const p = state.players[l.playerId];
      if (!p) continue;
      const opp = theirs.find((x) => x.role === l.role);
      const s = mvpScore(lineOf(l), mine.map(lineOf), opp ? lineOf(opp) : undefined, g.duration / 60, !g.detailed);
      const res = s - (EXP0 + EXP_SLOPE * (overall(p.attributes, l.role) - oppAvg));
      const mvp = g.mvp === p.id ? 1 : 0;
      const f = (bz.form[p.id] ??= []);
      f.push([Math.round(res * 100) / 100, mvp, l.k, l.d, l.a]);
      if (f.length > FORM_N) f.splice(0, f.length - FORM_N);
      const x = out.get(p.id) ?? { res: 0, k: 0, d: 0, a: 0, games: 0, mvps: 0 };
      x.res += res; x.k += l.k; x.d += l.d; x.a += l.a; x.games++; x.mvps += mvp;
      out.set(p.id, x);
    }
  }
  for (const x of out.values()) x.res /= x.games;
  // forget players who left
  for (const id of Object.keys(bz.form)) if (state.players[id]?.teamId !== team.id) delete bz.form[id];
  return out;
}

/** Rolling form over the last `n` games: mean score vs expectation, MVPs and KDA. */
export function formOf(state: GameState, id: string, n = 6) {
  const f = (state.fanPulse?.buzz?.form[id] ?? []).slice(-n);
  const k = f.reduce((s, x) => s + x[2], 0), d = f.reduce((s, x) => s + x[3], 0), a = f.reduce((s, x) => s + x[4], 0);
  return { games: f.length, res: f.length ? f.reduce((s, x) => s + x[0], 0) / f.length : 0, mvps: f.reduce((s, x) => s + x[1], 0), kda: (k + a) / Math.max(1, d) };
}

export const clubGames = (p: Player, teamId: string) => p.career.filter((c) => c.teamId === teamId).reduce((s, c) => s + c.games, 0);
export function teamAvg(state: GameState, team: Team) {
  let s = 0, n = 0;
  for (const r of ROLES) { const p = team.lineup[r] ? state.players[team.lineup[r]!] : undefined; if (p) { s += ovrOf(p); n++; } }
  return n ? s / n : 60;
}

// ------------------------------------------------------------------ perception & live flags
export interface Perception { label: string; color: string; why: string }
const recentEvent = (state: GameState, id: string, kinds: string[], within: number) => state.fanPulse?.buzz?.events.find((e) => e.playerId === id && kinds.includes(e.kind) && days(e.date, state.date) <= within);

/** How the fans see a player right now: anomalies first, then the tone of recent posts, then context. */
export function perception(state: GameState, id: string): Perception {
  const p = state.players[id];
  if (!p) return { label: 'Unknown', color: '#64748b', why: '' };
  const jump = recentEvent(state, id, ['jump'], 21);
  if (jump) return jump.edited
    ? { label: 'Is this real?', color: '#e879f9', why: `Rated ${jump.data?.old} → ${jump.data?.ovr} overnight. Fans are joking about patch notes for a human being.` }
    : { label: Number(jump.data?.delta) >= 10 ? 'Different person' : 'Is this real?', color: '#e879f9', why: `Rated ${jump.data?.old} → ${jump.data?.ovr} overnight with no explanation. Conspiracy threads everywhere.` };
  const hot = recentEvent(state, id, ['possessed'], 25);
  if (hot) return { label: 'Possessed', color: '#f0c674', why: `Playing far above his rating (${hot.data?.mvps} MVPs, ${hot.data?.kda} KDA in ${hot.data?.games} games). "Who is this?"` };
  const cold = recentEvent(state, id, ['slump'], 25);
  if (cold) return { label: 'In a slump', color: '#f97316', why: `${cold.data?.kda} KDA over his last ${cold.data?.games} games — well below his level.` };
  const drop = recentEvent(state, id, ['drop'], 21);
  if (drop) return { label: 'What happened?', color: '#ef4444', why: `Rated ${drop.data?.old} → ${drop.data?.ovr} overnight. Fans want answers.` };
  const team = p.teamId ? state.teams[p.teamId] : undefined;
  const posts = playerPosts(state, id, 12).filter((x) => days(x.date, state.date) <= 35);
  const ovr = ovrOf(p), avg = team ? teamAvg(state, team) : ovr;
  if (posts.length >= 3) {
    const s = posts.reduce((a, x) => a + x.sentiment, 0) / posts.length;
    const fm = team ? state.fanPulse?.teams[team.id] : undefined;
    if (s >= 0.7 && (p.traits.includes('fan_favorite') || p.reputation >= 72)) return { label: 'Fan favourite', color: '#22c55e', why: `${posts.length} mostly glowing posts in the last month.` };
    if (s >= 0.7 && ovr < avg - 2) return { label: 'Cult hero', color: '#a78bfa', why: 'Not the highest-rated player on the team, but the fans adore him.' };
    if (s >= 0.5) return { label: 'Crowd pleaser', color: '#84cc16', why: 'The feed has been kind to him lately.' };
    if (s <= -0.7 && (fm?.streak ?? 0) <= -2 && formOf(state, id).res > -0.3) return { label: 'Scapegoat', color: '#fb923c', why: 'Taking the blame for the losing run, even though his numbers are fine.' };
    if (s <= -0.5) return { label: 'Under fire', color: '#ef4444', why: `${posts.filter((x) => x.sentiment < 0).length} critical posts in the last month.` };
  }
  if (recentEvent(state, id, ['glow_up'], 45)) return { label: 'On the rise', color: '#84cc16', why: 'Steady gains from training — the grind is paying off.' };
  if (recentEvent(state, id, ['slow_decline'], 45)) return { label: 'Fading', color: '#94a3b8', why: 'His level has been slipping for weeks.' };
  if (wasEdited(state, id, 60)) return { label: 'Under the microscope', color: '#e879f9', why: 'Something about him changed recently, and the community noticed.' };
  if (p.contract && days(p.contract.signedOn, state.date) <= 30 && p.teamId) return { label: 'New arrival', color: '#38bdf8', why: 'Fans are still making up their minds.' };
  if (p.traits.includes('fan_favorite')) return { label: 'Fan favourite', color: '#22c55e', why: 'A long-time crowd favourite.' };
  if (p.reputation >= 85) return { label: 'Superstar', color: '#f0c674', why: 'One of the biggest names in the game.' };
  const age = ageOn(p.birthdate, state.date) ?? 22;
  if (age < 20) return { label: 'Prospect', color: '#2dd4bf', why: 'Young, and the fans want to see more of him.' };
  if (team && !Object.values(team.lineup).includes(id) && (!p.lastPlayed || days(p.lastPlayed, state.date) > 45)) return { label: 'Forgotten man', color: '#64748b', why: 'Hasn’t played in a long time.' };
  return { label: 'Under the radar', color: '#64748b', why: 'Nobody is talking about him much.' };
}

export interface LiveFlag { kind: 'edited' | 'jump' | 'drop' | 'possessed'; delta?: number }
/** Players with a fresh anomaly, for the live chat's "is this real?" flavour. */
export function liveFlags(state: GameState): Record<string, LiveFlag> {
  const out: Record<string, LiveFlag> = {};
  for (const e of [...(state.fanPulse?.buzz?.events ?? [])].reverse()) {
    if (!e.playerId || days(e.date, state.date) > 45) continue;
    if (e.kind === 'jump') out[e.playerId] = { kind: e.edited ? 'edited' : 'jump', delta: Number(e.data?.delta ?? 0) };
    else if (e.kind === 'drop' || e.kind === 'possessed') out[e.playerId] = { kind: e.kind };
  }
  return out;
}

/** T1 vs an LPL side under the lore rules: placeholders for the lore pack ({t1}, {lpl}, {lplname}, {score} from T1's side). */
export function loreCtx(state: GameState, a: Team, b: Team, f?: MatchFixture): Ctx | null {
  if (destinySide(state, a, b) === null) return null;
  const t1 = a.id === T1_ID ? a : b, lpl = t1 === a ? b : a;
  const r = f?.result, s = r ? (f!.teamA === t1.id ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA]) : undefined;
  return { t1: t1.short, lpl: lpl.short, lplname: lpl.name, score: s ? `${s[0]}-${s[1]}` : undefined };
}

// ------------------------------------------------------------------ extra series scenes for the feed
export interface Scene { key: string; w: number; ctx?: Ctx; playerId?: string }
interface Agg { p: Player; k: number; d: number; a: number; games: number; won: number; mvps: number; laneGold: number; laneOpp: Record<string, number>; champs: Record<string, number>; wonOn: Set<string>; lostOn: Set<string>; roles: Set<Role>; bestK: number; bestChamp: string }

/** Extra scenes for userSeriesPosts: milestones, debuts, picks & meta, lane matchups, birthdays, reunions, records. */
export function buzzSeriesScenes(state: GameState, info: SeriesInfo, team: Team): Scene[] {
  const out: Scene[] = [];
  const games = info.f.result?.games ?? [];
  if (!games.length) return out;
  const bz = buzzState(state);
  const opp = state.teams[info.oppId];
  const add = (key: string, w: number, ctx?: Ctx, playerId?: string) => out.push({ key, w, ctx, playerId });
  const aggs = new Map<string, Agg>();
  let perfect: Ctx | null = null, soul = 0, supportCarry: Agg | null = null;
  games.forEach((g, i) => {
    const s = g.blue === team.id ? 0 : 1, won = g.winner === team.id;
    if (won && g.kills[1 - s] === 0 && !perfect) perfect = { game: i + 1, gk: g.kills[s] };
    if (g.dragons[s] >= 4) soul = Math.max(soul, g.dragons[s]);
    const mine = (g.players ?? []).filter((l) => l.teamId === team.id);
    for (const l of mine) {
      const p = state.players[l.playerId];
      if (!p) continue;
      const x = aggs.get(p.id) ?? { p, k: 0, d: 0, a: 0, games: 0, won: 0, mvps: 0, laneGold: 0, laneOpp: {}, champs: {}, wonOn: new Set<string>(), lostOn: new Set<string>(), roles: new Set<Role>(), bestK: -1, bestChamp: l.champion };
      x.k += l.k; x.d += l.d; x.a += l.a; x.games++; if (won) x.won++; if (g.mvp === p.id) x.mvps++;
      x.champs[l.champion] = (x.champs[l.champion] ?? 0) + 1;
      (won ? x.wonOn : x.lostOn).add(l.champion);
      x.roles.add(l.role);
      if (l.k > x.bestK) { x.bestK = l.k; x.bestChamp = l.champion; }
      const o = g.players!.find((y) => y.teamId !== team.id && y.role === l.role);
      if (o) { x.laneGold += l.gold - o.gold; x.laneOpp[o.playerId] = (x.laneOpp[o.playerId] ?? 0) + 1; }
      aggs.set(p.id, x);
    }
    if (won && mine.length) {
      const top = [...mine].sort((a, b) => b.k - a.k)[0];
      if (top.role === 'support' && top.k >= 5) supportCarry = aggs.get(top.playerId) ?? null;
    }
  });
  const pow = state.championPower;
  const meta = Object.entries(pow).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  const md = state.date.slice(5);
  let debutChamp = false, laneW: Agg | null = null, laneL: Agg | null = null;
  for (const x of aggs.values()) {
    const p = x.p, pid = p.id, ctxP: Ctx = { player: p.handle, role: ROLE_LABEL[p.role], champ: champName(x.bestChamp), k: x.k, d: x.d, a: x.a };
    // picks
    for (const [c, n] of Object.entries(x.champs)) {
      const season = p.season.champions[c]?.games ?? 0;
      if (!debutChamp && season === n && (p.champions[c] ?? 0) < 100) { debutChamp = true; add(x.wonOn.has(c) ? 'champ_debut_win' : 'champ_debut_loss', 1.4, { player: p.handle, champ: champName(c) }, pid); }
      if (season >= 6 && season >= p.season.games * 0.5 && bcool(bz, '1trick:' + pid, state.date, 30)) add('one_trick', 1.1, { player: p.handle, champ: champName(c), n: season }, pid);
      if (x.wonOn.has(c) && (pow[c] ?? 0) <= -0.035) add('off_meta_win', 1.3, { player: p.handle, champ: champName(c) }, pid);
      if (x.lostOn.has(c) && meta.includes(c)) add('meta_pick_loss', 0.9, { player: p.handle, champ: champName(c) }, pid);
    }
    // milestones, debuts, reunions, birthdays
    const cg = clubGames(p, team.id), prev = cg - x.games;
    const m = MILESTONES.find((v) => prev < v && cg >= v);
    if (m) add('games_milestone', 3, { player: p.handle, n: m }, pid);
    if (cg === x.games && p.teamId === team.id) add(info.won ? 'debut_win' : 'debut_loss', 2.5, { player: p.handle, role: ROLE_LABEL[p.role] }, pid);
    if (p.birthdate?.slice(5) === md) add(info.won ? 'birthday_win' : 'birthday_loss', 3, { player: p.handle, age: Math.floor(ageOn(p.birthdate, state.date) ?? 22) }, pid);
    if (p.career.some((c) => c.teamId === opp.id) && bcool(bz, 'reunion:' + pid + opp.id, state.date, 60)) add(info.won ? 'former_club_win' : 'former_club_loss', 2, { player: p.handle }, pid);
    // performances
    const mvpRun = (bz.form[pid] ?? []).slice(-Math.max(0, 5 - x.games)).reduce((s, f) => s + f[1], 0) + x.mvps;
    if (mvpRun >= 3 && bcool(bz, 'mvprun:' + pid, state.date, 21)) add('mvp_run', 2, { player: p.handle, mvps: mvpRun }, pid);
    if (x.games >= 2 && x.d === 0 && x.k + x.a >= 8 && bcool(bz, 'deathless:' + pid, state.date, 14)) add('deathless', 2.2, { ...ctxP }, pid);
    const age = ageOn(p.birthdate, state.date) ?? 22;
    if (info.won && age >= 27 && (x.k + x.a) / Math.max(1, x.d) >= 6 && bcool(bz, 'vet:' + pid, state.date, 21)) add('veteran_masterclass', 1.5, { ...ctxP, age: Math.floor(age) }, pid);
    const lg = x.laneGold / x.games;
    if (lg >= 2500 && x.won && (!laneW || lg > laneW.laneGold / laneW.games)) laneW = x;
    if (lg <= -2500 && (!laneL || lg < laneL.laneGold / laneL.games)) laneL = x;
    // anomaly: off-role
    const off = [...x.roles].find((r) => r !== p.role && !(p.secondaryRoles ?? []).includes(r));
    if (off && bcool(bz, 'offrole:' + pid, state.date, 30)) add('out_of_role', 2.5, { player: p.handle, role: ROLE_LABEL[off], mainrole: ROLE_LABEL[p.role] }, pid);
  }
  const laneCtx = (x: Agg): Ctx => {
    const oid = Object.entries(x.laneOpp).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { player: x.p.handle, oppplayer: oid ? state.players[oid]?.handle : undefined, role: ROLE_LABEL[x.p.role].toLowerCase(), gold: (Math.abs(x.laneGold / x.games) / 1000).toFixed(1) };
  };
  if ((laneW || laneL) && bcool(bz, 'lane', state.date, 7)) {
    if (laneW) add('lane_diff_win', 1.2, laneCtx(laneW), laneW.p.id);
    if (laneL) add('lane_diff_loss', 1.2, laneCtx(laneL), laneL.p.id);
  }
  if (perfect) add('perfect_game', 2, perfect);
  if (soul) add('dragon_soul', 0.9, { drakes: soul });
  if (supportCarry) { const sc: Agg = supportCarry; add('support_carry', 1.5, { player: sc.p.handle, k: sc.k, champ: champName(sc.bestChamp) }, sc.p.id); }
  // the lore: T1 never loses to an LPL side (and sometimes the Nexus simply refuses to fall)
  const lore = loreCtx(state, team, opp, info.f);
  if (lore && info.won === (team.id === T1_ID)) {
    add(team.id === T1_ID ? 'lore_win_t1' : 'lore_loss_lpl', 4, lore);
    const lplId = team.id === T1_ID ? opp.id : team.id;
    if (games.some((g) => { const s = g.blue === lplId ? 0 : 1; return g.towers[s] >= g.towers[1 - s] || g.gold[s] > g.gold[1 - s]; })) add('lore_nexus', 2.5, lore);
  }
  // season record moments
  const rec = seasonRecord(state, team.id, state.season);
  if (info.won && rec.w === 1) add('first_win_season', 2.5);
  if (!info.won && rec.l === 1 && rec.w >= 3) add('first_loss_season', 2.5, { n: rec.w });
  if (!info.won && rec.w === 0 && rec.l >= 3) add('winless_start', 2.5);
  if (bz.flags.lastMatch && days(bz.flags.lastMatch, state.date) === 1) add('back_to_back', 0.6);
  // giant killing: underdogs beat the league leader or the reigning champion
  if (info.won && info.winProb < 0.42) {
    const stage = info.comp?.stages.find((s) => s.id === info.f.stageId);
    const leader = info.comp?.kind === 'league' && stage?.format === 'roundRobin' ? standings(stage, state.fixtures)[0] : undefined;
    const champ = opp.titles.some((t) => t.season === state.season - 1);
    if ((leader && leader.teamId === opp.id && leader.w + leader.l >= 4) || champ) add('giant_killing', 3);
  }
  return out;
}
