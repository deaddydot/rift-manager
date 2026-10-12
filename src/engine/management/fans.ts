// Fan Pulse: per-team fan sentiment (mood, patience, expectation, streaks) that reacts to results vs
// expectations, roster moves and club decisions, plus a social feed of persona-flavoured posts.
// Feeds back lightly into the game: hype, fan growth, matchday income and player morale
// (big egos and low composure take toxic posts harder).
import type { GameState, Team, MatchFixture, FanPersona, FanMood, FanPost, FanPulse, Player, Competition, SeriesGame, FacilityKey } from '../types';
import { ROLES, ROLE_LABEL, FACILITY_INFO } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { gd } from '../../data/gamedata';
import { overall, ageOn } from '../setup';
import { standings, weekday, addDays } from '../season/formats';
import { rankByStrength, placementLabel, type CompExt } from '../season/season';
import { headCoach, staffBonus } from '../season/prep';
import { gameWinProb, seriesWinProb, seasonRecord, ord } from './fixtureinfo';
import { addLedger, payrollYearly } from './finance';
import { MERCH_TEMPLATES } from './merch';
import { inTransferWindow } from './transfers';
import { FAN_TEMPLATES, SCENARIO_META, USERNAMES, REPLIES } from './fanTemplates';
import { archivePost, buzzSeriesScenes } from './buzzCore';

export type Ctx = Record<string, string | number | undefined>;
const MAX_POSTS = 150;
const FACILITY_KEYS = Object.keys(FACILITY_INFO) as FacilityKey[];
const FACILITY_BENEFIT: Record<FacilityKey, string> = { gamingHouse: 'morale and chemistry', trainingFacility: 'training gains', analyticsLab: 'draft prep', contentStudio: 'content and sponsor appeal', wellness: 'consistency', academy: 'prospect development' };
const SELLOUT = ['Finance', 'Fintech', 'Luxury', 'Automotive', 'Telecom', 'Cloud services', 'Travel'];
const INTL_EVENT: Record<string, [string, string]> = { FST: ['fst', 'First Stand'], MSI: ['msi', 'MSI'], WORLDS: ['worlds', 'Worlds'], 'WORLDS-PI': ['worlds', 'Worlds'], EWC: ['ewc', 'the Esports World Cup'], 'EM-spring': ['em-spring', 'EMEA Masters'], 'EM-summer': ['em-summer', 'EMEA Masters'] };

// ------------------------------------------------------------------ state
export function fanPulse(state: GameState): FanPulse {
  return (state.fanPulse ??= { teams: {}, posts: [] });
}

/** Fan mood of a team (created lazily; expectations reset when a new season starts). */
export function fanMood(state: GameState, teamId: string): FanMood {
  const fp = fanPulse(state);
  const m = (fp.teams[teamId] ??= { mood: 10, patience: 65, expectation: 50, streak: 0, form: '' });
  if (m.season !== state.season) newSeasonMood(state, teamId, m);
  return m;
}

function newSeasonMood(state: GameState, teamId: string, m: FanMood) {
  const team = state.teams[teamId];
  if (!team) return;
  const same = Object.values(state.teams).filter((t) => t.leagueId === team.leagueId).map((t) => t.id);
  const rank = rankByStrength(state, same).indexOf(teamId) + 1;
  const rel = same.length > 1 ? 1 - (rank - 1) / (same.length - 1) : 0.5;
  m.expectation = Math.round(clamp(rel * 75 + team.prestige * 0.25, 5, 98));
  m.preRank = rank;
  m.leagueSize = same.length;
  if (m.season === undefined) m.patience = clamp(80 - m.expectation * 0.3, 35, 85);
  else { m.patience = clamp(m.patience * 0.5 + 35 + (100 - m.expectation) * 0.15, 20, 95); m.mood = clamp(m.mood * 0.5 + 12, -100, 100); }
  m.season = state.season;
}

export function moodLabel(m: number): { label: string; color: string } {
  if (m >= 70) return { label: 'Euphoric', color: '#f0c674' };
  if (m >= 40) return { label: 'Buzzing', color: '#22c55e' };
  if (m >= 15) return { label: 'Content', color: '#84cc16' };
  if (m >= -15) return { label: 'Restless', color: '#eab308' };
  if (m >= -40) return { label: 'Frustrated', color: '#f97316' };
  if (m >= -70) return { label: 'Furious', color: '#ef4444' };
  return { label: 'Meltdown', color: '#b91c1c' };
}
export const expectationLabel = (e: number) => (e >= 85 ? 'Title or bust' : e >= 70 ? 'Contenders' : e >= 50 ? 'Playoff hopefuls' : e >= 30 ? 'Mid-table' : 'Rebuild year');
/** What the fans want, as a phrase for posts and mail. */
export const expectationPhrase = (e: number) => (e >= 85 ? 'a title, or bust' : e >= 70 ? 'a real title challenge' : e >= 50 ? 'a playoff spot' : e >= 30 ? 'a respectable mid-table finish' : 'patience and progress in a rebuild year');

const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
const leagueName = (state: GameState, t: Team) => state.leagues[t.leagueId]?.name ?? t.leagueId;
const champName = (id: string) => gd().championById[id]?.name ?? id;
const compName = (c?: Competition) => c?.name.replace(/\s\d{4}$/, '');
const days = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);

/** Average lineup rating without creating stand-ins. */
export function lineupStrength(state: GameState, team: Team): number {
  let s = 0;
  for (const r of ROLES) { const p = team.lineup[r] ? state.players[team.lineup[r]!] : undefined; s += p ? overall(p.attributes, r) : 40; }
  return s / ROLES.length;
}
function lineupAge(state: GameState, team: Team) {
  let s = 0, n = 0;
  for (const r of ROLES) { const p = team.lineup[r] ? state.players[team.lineup[r]!] : undefined; const a = p ? ageOn(p.birthdate, state.date) : null; if (a) { s += a; n++; } }
  return n ? s / n : 22;
}
const trustProcess = (state: GameState, team: Team, fm: FanMood) => lineupAge(state, team) <= 21 || fm.expectation < 35;

/** One-shot flag: true the first time a key is seen. */
function once(fm: FanMood, key: string, date: string) {
  const f = (fm.flags ??= {});
  if (f[key]) return false;
  f[key] = date;
  return true;
}
/** Cooldown flag: true when the key was not used in the last `n` days. */
function cool(fm: FanMood, key: string, date: string, n: number) {
  const f = (fm.flags ??= {});
  if (f[key] && days(f[key], date) < n) return false;
  f[key] = date;
  return true;
}

// ------------------------------------------------------------------ rivalries
const CLASSICS: [string, string, string][] = [
  ['t1-lck', 'gen-lck', 'T1–Gen.G rivalry'], ['t1-lck', 'kt-lck', 'Telecom War'], ['gen-lck', 'hle-lck', 'GEN–HLE rivalry'],
  ['blg-lpl', 'tes-lpl', 'BLG–TES rivalry'], ['jdg-lpl', 'tes-lpl', 'JDG–TES rivalry'], ['edg-lpl', 'ig-lpl', 'EDG–IG rivalry'], ['blg-lpl', 'al-lpl', 'BLG–AL rivalry'],
  ['g2-lec', 'fnc-lec', 'European Clásico'], ['kc-lec', 'vit-lec', 'French derby'], ['g2-lec', 'kc-lec', 'G2–KC rivalry'],
  ['tl-lcs', 'c9-lcs', 'TL–C9 rivalry'], ['fly-lcs', 'tl-lcs', 'FLY–TL rivalry'], ['c9-lcs', 'fly-lcs', 'C9–FLY rivalry'],
  ['loud-cblol', 'pain-gaming', 'Brazilian Clásico'], ['fur-cblol', 'loud-cblol', 'FURIA–LOUD rivalry'],
  ['gam-lcp', 'tsw-lcp', 'Vietnamese derby'], ['dfm-lcp', 'shg-lcp', 'Japanese derby'], ['cfo-lcp', 'gam-lcp', 'CFO–GAM rivalry'],
];
/** Rivalry name between two teams: classic derbies, a grudge after an elimination, or (for clubs without a
 *  classic derby) the league's top-3 prestige clubs. */
export function rivalry(state: GameState, a: string, b: string): string | null {
  const c = CLASSICS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (c) return c[2];
  const ta = state.teams[a], tb = state.teams[b];
  if (!ta || !tb) return null;
  if (state.fanPulse?.teams[a]?.nemesis === b) return `${ta.short}–${tb.short} grudge match`;
  if (CLASSICS.some(([x, y]) => x === a || y === a || x === b || y === b)) return null;
  if (ta.leagueId === tb.leagueId && (state.leagues[ta.leagueId]?.tier ?? 3) <= 2) {
    const top = Object.values(state.teams).filter((t) => t.leagueId === ta.leagueId).sort((x, y) => y.prestige - x.prestige).slice(0, 3).map((t) => t.id);
    if (top.includes(a) && top.includes(b)) return `${ta.short}–${tb.short} rivalry`;
  }
  return null;
}

/** Short name of a rival club (classic derby first, else the most prestigious league rival). */
function rivalOf(state: GameState, team: Team): string | undefined {
  const c = CLASSICS.find(([x, y]) => x === team.id || y === team.id);
  if (c) return state.teams[c[0] === team.id ? c[1] : c[0]]?.short;
  return Object.values(state.teams).filter((t) => t.leagueId === team.leagueId && t.id !== team.id).sort((a, b) => b.prestige - a.prestige)[0]?.short;
}

// ------------------------------------------------------------------ text generation
/** Fill {placeholders}; ALL-CAPS keys upper-case the value. Returns null if something is missing. */
export function fill(tpl: string, ctx: Ctx): string | null {
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const upper = k.length > 1 && k === k.toUpperCase() && k !== k.toLowerCase();
    let v = ctx[k];
    if (v === undefined && upper) { const key = Object.keys(ctx).find((x) => x.toLowerCase() === k.toLowerCase()); v = key ? ctx[key] : undefined; }
    if (v === undefined || v === '') { ok = false; return ''; }
    return upper ? String(v).toUpperCase() : String(v);
  });
  return ok ? out : null;
}

const alnum = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '') || 'Team';
/** Usernames: a few stable "regulars" per persona and fanbase, plus random accounts. */
function username(rng: RNG, persona: FanPersona, ctx: Ctx, teamId: string): string {
  const pats = USERNAMES[persona];
  const regular = persona !== 'rival' && persona !== 'intl' && rng.chance(0.55);
  const h = regular ? hashString(teamId + persona + rng.int(0, 2)) : rng.int(0, 1e6);
  return pats[h % pats.length].replace('{short}', alnum(ctx.short)).replace('{opp}', alnum(ctx.oppShort ?? ctx.rivalShort ?? 'Rival')).replace('{player}', alnum(ctx.fav ?? ctx.short)).replace('{n}', String((h % 97) + 2));
}

const REACH: Record<FanPersona, number> = { diehard: 1.1, casual: 0.5, analyst: 1, memer: 1.7, doomer: 0.8, toxic: 0.9, rival: 0.7, intl: 0.8, wholesome: 1, insider: 1.3 };

function personaWeights(fm: FanMood, base: number, o: { intl?: boolean; rival?: boolean }): Record<FanPersona, number> {
  const w: Record<FanPersona, number> = { diehard: 3, casual: 1.5, analyst: 2, memer: 2.2, doomer: 1, toxic: 1, rival: 1, intl: 0.4, wholesome: 1.4, insider: 0.4 };
  if (base < 0) {
    w.toxic += (100 - fm.patience) / 30 + (fm.mood < -30 ? 1 : 0);
    w.doomer += 1 + (fm.mood < -30 ? 1.5 : 0);
    w.wholesome *= 0.4 + fm.patience / 100;
    w.rival += 0.8;
  } else if (base > 0) { w.diehard += 1.5; w.memer += 0.8; w.doomer *= 0.5; w.toxic *= 0.4; }
  if (o.intl) { w.intl += 2.5; w.rival += 0.5; }
  if (o.rival) w.rival += 2.5;
  return w;
}

/** Sentiment of a post towards the team, from the scenario's base tone and the persona. */
function sentimentOf(p: FanPersona, base: number, harsh?: boolean): number {
  const s = p === 'diehard' ? (harsh ? -2 : base < 0 ? -1 : base)
    : p === 'casual' ? clamp(base, -1, 1)
    : p === 'analyst' ? (Math.abs(base) >= 2 ? Math.sign(base) : 0)
    : p === 'memer' ? Math.sign(base)
    : p === 'doomer' ? (base > 0 ? -1 : -2)
    : p === 'toxic' ? (base > 0 ? 0 : -2)
    : p === 'rival' ? (base > 0 ? -1 : -2)
    : p === 'intl' ? clamp(base, -1, 2)
    : p === 'wholesome' ? (base < 0 ? 1 : 2) : 0;
  return Math.round(clamp(s, -2, 2));
}

/** Morale reaction of a mentioned player (user team only): egos and low composure feel it more. */
function sensitivity(state: GameState, team: Team, p: Player) {
  return (1 - p.hidden.composure / 130) * (0.6 + p.hidden.ego / 120) * (staffBonus(state, team).hasPsychologist ? 0.6 : 1);
}
/** Fan-post morale already applied today per player: a pile-on hurts, but one bad day of posts has a ceiling. */
const postMorale = { date: '', by: new Map<string, number>() };
function moraleFromPost(state: GameState, team: Team, post: FanPost) {
  if (team.id !== state.userTeamId || !post.playerId) return;
  const p = state.players[post.playerId];
  if (!p || p.teamId !== team.id) return;
  const reach = Math.min(1.5, 0.4 + Math.log10(Math.max(10, post.likes)) / 4);
  let d = post.sentiment < 0 ? -0.6 * -post.sentiment * sensitivity(state, team, p) * reach : post.sentiment > 0 ? 0.5 * (0.5 + p.hidden.ego / 100) * reach : 0;
  if (postMorale.date !== state.date) { postMorale.date = state.date; postMorale.by.clear(); }
  const sofar = postMorale.by.get(p.id) ?? 0;
  d = clamp(sofar + d, -1.5, 1.2) - sofar;
  postMorale.by.set(p.id, sofar + d);
  p.morale = clamp(p.morale + d, 5, 100);
}

export interface EmitOpts { stakes?: number; fixtureId?: string; intl?: boolean; rival?: boolean; playerId?: string; mins?: number; persona?: FanPersona; replyChance?: number }

/** Write one post for a scenario (and maybe a reply). Returns null when no template fits the context. */
export function emit(state: GameState, rng: RNG, team: Team, scen: string, ctx: Ctx, o: EmitOpts = {}): FanPost | null {
  const tpls = FAN_TEMPLATES[scen], meta = SCENARIO_META[scen];
  if (!tpls || !meta) return null;
  const fp = fanPulse(state);
  const recent = (fp.recent ??= []);
  const w = personaWeights(fanMood(state, team.id), meta.s, o);
  const personas = (Object.keys(tpls) as FanPersona[]).filter((p) => tpls[p]?.length);
  for (let tries = 0; tries < 7; tries++) {
    const persona = o.persona && tpls[o.persona] && tries === 0 ? o.persona : rng.weighted(personas, (p) => w[p]);
    const tpl = rng.pick(tpls[persona]!);
    const h = hashString(tpl);
    if (recent.includes(h) && tries < 5) continue;
    const text = fill(tpl, ctx);
    if (!text) continue;
    recent.push(h);
    if (recent.length > 90) recent.splice(0, recent.length - 90);
    const likes = Math.max(0, Math.round(Math.exp(rng.normal(0, 0.8)) * REACH[persona] * Math.sqrt(Math.max(1000, team.fans)) * 0.5 * (o.stakes ?? 1)));
    const post: FanPost = {
      id: `fp_${state.seq++}`, date: state.date, teamId: team.id, user: username(rng, persona, ctx, team.id), persona, text,
      likes, reposts: Math.round(likes * (0.04 + rng.next() * 0.15)), sentiment: sentimentOf(persona, meta.s, meta.harsh), topic: scen,
      mins: o.mins ?? rng.int(9 * 60, 23 * 60), playerId: o.playerId, fixtureId: o.fixtureId,
    };
    if (rng.chance(o.replyChance ?? 0.3)) {
      const r = rng.next();
      const up = meta.s > 0;
      const [rp, pool]: [FanPersona, string[]] = r < 0.3 ? ['memer', REPLIES.meme] : r < 0.5 || post.sentiment === 0 || meta.s === 0 ? [persona === 'rival' ? 'rival' : 'diehard', REPLIES.agree]
        : post.sentiment > 0 ? [rng.pick(['doomer', 'rival', 'toxic'] as FanPersona[]), up ? REPLIES.toPositive : REPLIES.toSupportive]
        : [rng.pick(['diehard', 'wholesome'] as FanPersona[]), up ? REPLIES.toNegativeWin : REPLIES.toNegative];
      const rt = fill(rng.pick(pool), ctx) ?? rng.pick(REPLIES.agree);
      let ru = username(rng, rp, ctx, team.id);
      for (let i = 0; i < 3 && ru === post.user; i++) ru = username(rng, rp, ctx, team.id + i);
      post.replies = [{ user: ru, persona: rp, text: rt, likes: Math.round(likes * (0.05 + rng.next() * 0.45)) }];
    }
    fp.posts.unshift(post);
    if (fp.posts.length > MAX_POSTS) fp.posts.length = MAX_POSTS;
    if (post.playerId) archivePost(state, post); // the player page keeps its own, longer memory
    moraleFromPost(state, team, post);
    return post;
  }
  return null;
}

export function baseCtx(state: GameState, team: Team): Ctx {
  const fav = team.roster.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.reputation - a.reputation)[0];
  const fm = fanMood(state, team.id);
  const owner = state.owner?.teamId === team.id ? state.owner : undefined;
  return {
    team: team.name, short: team.short, league: leagueName(state, team), fav: fav?.handle, coach: headCoach(state, team)?.handle,
    patch: state.patch, season: state.season, prerank: fm.preRank ? ord(fm.preRank).replace(/\D+$/, '') : undefined, n: fm.leagueSize,
    expect: expectationPhrase(fm.expectation), owner: owner?.name, rivalShort: rivalOf(state, team),
  };
}

/** Fan posts about a club event (owner antics, decisions). Used by the owner module. */
export function fanEvent(state: GameState, scen: string, ctx: Ctx = {}, n = 3) {
  const team = state.teams[state.userTeamId];
  if (!team) return;
  const rng = new RNG(hashString(scen + state.date) ^ state.seq);
  const c = { ...baseCtx(state, team), ...ctx };
  let mins = rng.int(10 * 60, 20 * 60);
  for (let i = 0; i < n; i++) { emit(state, rng, team, scen, c, { mins }); mins = Math.min(1439, mins + rng.int(3, 50)); }
}

// ------------------------------------------------------------------ series reactions
export interface SeriesInfo {
  f: MatchFixture; comp?: Competition; teamId: string; oppId: string; won: boolean; my: number; their: number;
  winProb: number; stakes: number; big: boolean; intl: boolean; final: boolean; elim: boolean; swissAdvance: boolean;
  rival: string | null; revenge: boolean; prevStreak: number; streak: number;
}

const sideOf = (g: SeriesGame, teamId: string) => (g.blue === teamId ? 0 : 1);

/** Out of the competition after this loss: no pending fixture left in the bracket (or 3 Swiss losses). */
function isEliminated(state: GameState, f: MatchFixture, teamId: string) {
  const stage = state.competitions[f.competitionId]?.stages.find((s) => s.id === f.stageId);
  if (!stage) return false;
  if (stage.format === 'swiss') return stage.fixtures.filter((id) => state.fixtures[id]?.result?.loser === teamId).length >= 3;
  if (stage.format !== 'singleElim' && stage.format !== 'doubleElim' && stage.format !== 'gsl') return false;
  return !stage.fixtures.some((id) => { const x = state.fixtures[id]; return x && !x.result && (x.teamA === teamId || x.teamB === teamId); });
}

function analyseSeries(state: GameState, f: MatchFixture, teamId: string): SeriesInfo | null {
  const res = f.result!;
  const oppId = f.teamA === teamId ? f.teamB! : f.teamA!;
  const team = state.teams[teamId], opp = state.teams[oppId];
  if (!team || !opp) return null;
  const comp = state.competitions[f.competitionId];
  const stage = comp?.stages.find((s) => s.id === f.stageId);
  const won = res.winner === teamId;
  const my = f.teamA === teamId ? res.scoreA : res.scoreB, their = f.teamA === teamId ? res.scoreB : res.scoreA;
  const winProb = seriesWinProb(gameWinProb(lineupStrength(state, team), lineupStrength(state, opp)), f.bestOf);
  const lastStage = !!comp && ((comp as CompExt).specs?.length ?? comp.stages.length) === comp.stages.length && comp.stages[comp.stages.length - 1]?.id === f.stageId;
  const final = /^(Grand )?Final$/.test((f.label ?? '').trim()) && lastStage;
  const intl = comp?.tier === 0;
  const playoff = comp?.kind === 'playoffs' || (!!stage && ['singleElim', 'doubleElim', 'gsl'].includes(stage.format));
  const fm = state.fanPulse?.teams[teamId];
  return {
    f, comp, teamId, oppId, won, my, their, winProb, final, intl,
    big: intl || playoff || final, stakes: 1 + (playoff ? 0.4 : 0) + (intl ? 0.5 : 0) + (final ? 0.8 : 0),
    elim: !won && !final && isEliminated(state, f, teamId),
    swissAdvance: won && stage?.format === 'swiss' && stage.fixtures.filter((id) => state.fixtures[id]?.result?.winner === teamId).length === 3,
    rival: rivalry(state, teamId, oppId), revenge: won && fm?.nemesis === oppId, prevStreak: fm?.streak ?? 0, streak: 0,
  };
}

function updateMood(state: GameState, info: SeriesInfo, fm: FanMood) {
  const team = state.teams[info.teamId];
  const surprise = info.won ? 1 - info.winProb : info.winProb;
  const need = Math.ceil(info.f.bestOf / 2);
  let d = (info.won ? 1 : -1) * (4 + 12 * surprise) * info.stakes;
  if (info.f.bestOf > 1 && Math.min(info.my, info.their) === 0 && Math.max(info.my, info.their) === need) d *= 1.15;
  if (info.rival) d *= 1.25;
  fm.mood = clamp(fm.mood * 0.97 + d, -100, 100);
  const slow = trustProcess(state, team, fm) ? 0.5 : 1;
  fm.patience = clamp(fm.patience + (info.won ? 1 + 3 * surprise : -(1.5 + 7 * surprise) * (0.6 + fm.expectation / 125) * slow), 0, 100);
  fm.streak = info.won ? Math.max(1, fm.streak + 1) : Math.min(-1, fm.streak - 1);
  info.streak = fm.streak;
  fm.form = (fm.form + (info.won ? 'W' : 'L')).slice(-10);
  if (info.elim || (info.final && !info.won)) fm.nemesis = info.oppId;
  else if (info.revenge) fm.nemesis = undefined;
}

interface PLine { p: Player; k: number; d: number; a: number; games: number; mvps: number; champ: string; bestK: number; maxD: number }

/** Posts for the user's series: picks scenarios from the result, the games and the context. */
function userSeriesPosts(state: GameState, info: SeriesInfo) {
  const team = state.teams[info.teamId], opp = state.teams[info.oppId];
  const fm = fanMood(state, team.id);
  const rng = new RNG(hashString(info.f.id + state.date) ^ state.seq);
  const games = info.f.result!.games;
  const need = Math.ceil(info.f.bestOf / 2), ng = Math.max(1, games.length);
  (fm.flags ??= {}).lastMatch = state.date;
  // series aggregates from our side
  let gk = 0, okk = 0, gdiff = 0, tw = 0, otw = 0, dr = 0, odr = 0, dur = 0;
  let comeback: { game: number; killdef?: number } | null = null, thrown: { game: number; killdef?: number } | null = null;
  let long = 0, fast = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i], s = sideOf(g, team.id), o = 1 - s, won = g.winner === team.id;
    gk += g.kills[s]; okk += g.kills[o]; gdiff += g.gold[s] - g.gold[o]; tw += g.towers[s]; otw += g.towers[o]; dr += g.dragons[s]; odr += g.dragons[o]; dur += g.duration;
    if (won && !comeback && (g.kills[s] <= g.kills[o] - 3 || g.dragons[s] + 2 <= g.dragons[o])) comeback = { game: i + 1, killdef: g.kills[o] - g.kills[s] >= 3 ? g.kills[o] - g.kills[s] : undefined };
    if (!won && !thrown && (g.kills[s] >= g.kills[o] + 4 || g.barons[s] > g.barons[o])) thrown = { game: i + 1, killdef: g.kills[s] - g.kills[o] >= 3 ? g.kills[s] - g.kills[o] : undefined };
    if (g.duration > 44 * 60) long = Math.round(g.duration / 60);
    if (won && g.duration < 23 * 60) fast = Math.round(g.duration / 60);
  }
  const seq = games.map((g) => (g.winner === team.id ? 'W' : 'L')).join('');
  // player lines
  const lines = new Map<string, PLine>();
  for (const g of games) for (const l of g.players ?? []) {
    if (l.teamId !== team.id || !state.players[l.playerId]) continue;
    const x = lines.get(l.playerId) ?? { p: state.players[l.playerId], k: 0, d: 0, a: 0, games: 0, mvps: 0, champ: l.champion, bestK: 0, maxD: 0 };
    x.k += l.k; x.d += l.d; x.a += l.a; x.games++; if (g.mvp === l.playerId) x.mvps++;
    if (l.k >= x.bestK) { x.bestK = l.k; x.champ = l.champion; }
    x.maxD = Math.max(x.maxD, l.d);
    lines.set(l.playerId, x);
  }
  const all = [...lines.values()];
  const kda = (x: PLine) => (x.k + x.a) / Math.max(1, x.d);
  const score = (x: PLine) => (x.k * 3 + x.a * 1.5 - x.d * 2) / Math.max(1, x.games);
  const star = [...all].sort((a, b) => score(b) - score(a))[0];
  const pctx = (x: PLine): Ctx => ({ player: x.p.handle, champ: champName(x.champ), k: x.k, d: x.d, a: x.a, kda: kda(x).toFixed(1), age: Math.floor(ageOn(x.p.birthdate, state.date) ?? 22), role: ROLE_LABEL[x.p.role] });
  const lastG = games[games.length - 1];
  const oppLine = lastG?.players?.filter((l) => l.teamId === opp.id).sort((a, b) => (b.k * 3 + b.a - b.d) - (a.k * 3 + a.a - a.d))[0];
  const rec = seasonRecord(state, team.id, state.season);
  const h2h = Object.values(state.fixtures).filter((x) => x.result?.loser && state.competitions[x.competitionId]?.season === state.season && (x.teamA === team.id || x.teamB === team.id) && (x.teamA === opp.id || x.teamB === opp.id));
  const h2hW = h2h.filter((x) => x.result!.winner === team.id).length;
  const last10 = fm.form.slice(-8);
  const ctx: Ctx = {
    ...baseCtx(state, team), opp: opp.name, oppShort: opp.short, oppLeague: leagueName(state, opp), score: `${info.my}-${info.their}`,
    comp: compName(info.comp), winpct: Math.round(info.winProb * 100), gold: (Math.abs(gdiff) / ng / 1000).toFixed(1),
    kills: `${gk}-${okk}`, mins: Math.round(dur / ng / 60), towers: tw, opptowers: otw, drakes: dr, oppdrakes: odr, game: games.length,
    oppchamp: oppLine ? champName(oppLine.champion) : undefined, record: `${rec.w}-${rec.l}`, h2h: `${h2hW}-${h2h.length - h2hW}`,
    losses: [...last10].filter((c) => c === 'L').length, lastn: last10.length, ...(star ? pctx(star) : {}),
  };
  const scenes: { key: string; w: number; ctx?: Ctx; playerId?: string }[] = [];
  const add = (key: string, w: number, extra?: Ctx, playerId?: string) => { if (FAN_TEMPLATES[key] && !scenes.some((s) => s.key === key)) scenes.push({ key, w, ctx: extra, playerId }); };
  const upsetWin = info.won && info.winProb < 0.38, upsetLoss = !info.won && info.winProb > 0.62;
  const sweep = info.f.bestOf > 1 && (info.won ? info.their === 0 : info.my === 0);
  const avgGd = gdiff / ng, avgKd = (gk - okk) / ng, avgMin = dur / ng / 60;
  const process = trustProcess(state, team, fm);
  const rage = fm.patience < 25 || fm.streak <= -4 || (rec.w + rec.l >= 8 && rec.w / (rec.w + rec.l) < 0.35 && fm.mood < -30);
  const copium = fm.expectation >= 55 && fm.patience >= 35 && fm.streak > -3 && fm.mood > -35;
  // ---- primary result
  if (info.won) {
    if (info.f.bestOf >= 5 && seq.startsWith('LL') && seq.endsWith('WWW')) add('win_reverse_sweep', 5);
    else if (sweep && (avgGd > 6000 || avgKd > 9 || avgMin < 26)) { add('win_stomp', info.winProb > 0.7 ? 3 : 4); if (info.winProb > 0.7) add('win_routine', 2); }
    else if (upsetWin) add('win_upset', 4);
    else if (comeback) add('win_comeback', 4, comeback);
    else if (info.f.bestOf > 1 && info.their === need - 1) add('win_close', 3.5);
    else add('win_routine', 3);
    if (upsetWin) add('win_upset', 2);
    if (comeback) add('win_comeback', 1.5, comeback);
  } else {
    if (info.f.bestOf >= 5 && seq.startsWith('WW') && seq.endsWith('LLL')) add('loss_reverse_swept', 5);
    else if (rage && !info.final) add('rage', 4);
    else if (sweep && (avgGd < -6000 || avgKd < -9)) add('loss_stomped', 4);
    else if (thrown) add('loss_throw', 4, thrown);
    else if (info.winProb >= 0.55) add(copium ? 'copium' : 'loss_upset', 4);
    else if (info.f.bestOf > 1 && info.my === need - 1) add('loss_close', 3.5);
    else add('loss_expected', 3);
    if (upsetLoss && copium) add('copium', 1.5);
    if (thrown) add('loss_throw', 1.5, thrown);
    if (process && !info.big) add('trust_process', 1.5);
  }
  // ---- context: stakes, streaks, rivals, region
  const st = info.streak;
  if ([3, 5, 7, 10, 13, 15, 20].includes(st)) add('win_streak', 3, { streak: st });
  if ([-3, -4, -5, -7, -10].includes(st)) add('loss_streak', 3, { streak: -st });
  if (!info.won && info.prevStreak >= 4) add('streak_snapped_win', 2, { n: info.prevStreak });
  if (info.won && info.prevStreak <= -3) add('streak_snapped_loss', 3, { n: -info.prevStreak });
  if (info.rival) add(info.won ? 'rival_win' : 'rival_loss', 3, { rival: info.rival });
  if (info.revenge) add('revenge_win', 3);
  if (info.intl && team.leagueId !== opp.leagueId) add(info.won ? 'intl_win' : 'intl_loss', 3);
  const flags = (fm.flags ??= {});
  if (info.final) {
    flags['comp:' + info.f.competitionId] = state.date;
    if (info.won) add(info.comp?.tags?.includes('worlds') ? 'title_worlds' : 'title', 7);
    else add('runner_up', 6);
  }
  if (info.elim) {
    flags['comp:' + info.f.competitionId] = state.date;
    const lbl = (info.f.label ?? '').replace(/\s*\(bye\)/, '') || 'group stage';
    add('playoffs_elim', 6, { verdict: info.winProb > 0.55 ? `an early exit in the ${lbl}, below expectations` : `out in the ${lbl}` });
  }
  if (info.swissAdvance) add('swiss_advance', 4);
  // ---- players & draft
  if (star && ((kda(star) >= 7 && star.k >= 3.5 * star.games) || star.bestK >= 11)) add('player_popoff', 2.2, pctx(star), star.p.id);
  const mvp = all.find((x) => x.mvps >= 2);
  if (mvp) add('player_mvp', 2, { ...pctx(mvp), mvps: mvp.mvps }, mvp.p.id);
  const inter = [...all].sort((a, b) => b.d - a.d)[0];
  if (inter && ((inter.d >= 4 * inter.games && kda(inter) < 1.5) || inter.maxD >= 8)) add('player_int', 2.5, pctx(inter), inter.p.id);
  const age = (p: Player) => ageOn(p.birthdate, state.date) ?? 22;
  const rookie = all.find((x) => info.won && (age(x.p) < 20 || x.p.traits.includes('rookie')) && kda(x) >= 4);
  if (rookie) add('player_rookie', 2, pctx(rookie), rookie.p.id);
  const vet = all.find((x) => !info.won && (age(x.p) >= 27 || x.p.traits.includes('veteran')) && kda(x) < 1.3);
  if (vet) add('player_veteran_decline', 1.5, pctx(vet), vet.p.id);
  const ff = all.find((x) => info.won && x.p.traits.includes('fan_favorite') && kda(x) >= 5);
  if (ff && rng.chance(0.35)) add('player_fan_fav', 1.2, pctx(ff), ff.p.id);
  games.forEach((g, i) => {
    const won = g.winner === team.id;
    for (const l of g.players ?? []) {
      if (l.teamId !== team.id) continue;
      const p = state.players[l.playerId];
      if (!p) continue;
      const m = p.champions[l.champion] ?? 70; // comfort 0..200
      const top = Object.entries(p.champions).sort((a, b) => b[1] - a[1])[0]?.[0];
      const c = { player: p.handle, champ: champName(l.champion), game: i + 1 };
      if (won && m < 95 && l.k + l.a >= 5) add('pocket_pick', 1.5, c, p.id);
      else if (won && top === l.champion && (l.k + l.a) / Math.max(1, l.d) >= 5) add('signature_champ', 0.6, c, p.id);
      if (!won && (m < 90 || (info.f.fearless !== false && i >= 2 && l.d >= 4))) add('draft_blame', 1.2, c);
    }
  });
  if (info.won && info.f.fearless !== false && games.length >= 4) add('fearless_depth', 1.5);
  for (const s of buzzSeriesScenes(state, info, team)) add(s.key, s.w, s.ctx, s.playerId); // milestones, picks, lanes, anomalies
  if (ctx.coach && !info.won && (fm.streak <= -3 || fm.patience < 35)) add('coach_blame', 2);
  if (ctx.coach && upsetWin) add('coach_praise', 1.5);
  if (long) add('long_game', 1.2, { mins: long });
  if (fast) add('speedrun', 1.5, { mins: fast });
  // ---- table
  const stage = info.comp?.stages.find((s) => s.id === info.f.stageId);
  if (info.comp?.kind === 'league' && stage?.format === 'roundRobin') {
    const table = standings(stage, state.fixtures);
    const idx = table.findIndex((r) => r.teamId === team.id), row = table[idx];
    if (row && row.w + row.l >= 4) {
      const rank = idx + 1, n = table.length, d = (fm.preRank ?? rank) - rank;
      const tctx = { rank, record: `${row.w}-${row.l}`, prerank: fm.preRank };
      if (rank === 1 && cool(fm, 'top', state.date, 14)) add('standings_top', 2, tctx);
      if (rank === n && cool(fm, 'bottom', state.date, 14)) add('standings_bottom', 2.5, tctx);
      const promo = Object.values(state.competitions).filter((c) => c.season === state.season && c.seedRule?.startsWith('promotion:'));
      if (rank === n && promo.some((c) => c.seedRule!.split(':')[1] === team.leagueId) && cool(fm, 'releg', state.date, 21)) add('relegation_danger', 2.5, tctx);
      if (rank <= 2 && promo.some((c) => (c.seedRule!.split(':')[2] ?? '').split(',').includes(team.leagueId)) && cool(fm, 'promo', state.date, 21)) add('promotion_push', 2, tctx);
      if (row.w + row.l >= 5 && d >= 3 && cool(fm, 'over', state.date, 21)) add('overperform', 2, { ...tctx, diff: d });
      if (row.w + row.l >= 5 && d <= -3 && cool(fm, 'under', state.date, 21)) add('underperform', 2, { ...tctx, diff: -d });
    }
  }
  // ---- write the feed
  let n = 3 + (info.big ? 1 : 0) + (info.final ? 2 : 0) + (info.elim ? 1 : 0) + (upsetWin || upsetLoss ? 1 : 0) + Math.min(2, Math.floor((scenes.length - 1) / 2)) + rng.int(-1, 1);
  n = clamp(n, 2, 9);
  let mins = 19 * 60 + rng.int(0, 120);
  for (let i = 0; i < n && scenes.length; i++) {
    const s = rng.weighted(scenes, (x) => x.w);
    s.w *= 0.45;
    emit(state, rng, team, s.key, { ...ctx, ...s.ctx }, { stakes: info.stakes, fixtureId: info.f.id, intl: info.intl, rival: !!info.rival, playerId: s.playerId, mins: Math.min(1439, mins), replyChance: info.big ? 0.45 : 0.3 });
    mins += rng.int(2, 30);
  }
  // ---- matchday attendance (league & playoff series; internationals are run by the organiser)
  if (info.comp && info.comp.tier > 0) {
    const tier = tierOf(state, team);
    const cap = (tier === 1 ? 600 : tier === 2 ? 200 : 60) * (info.final ? 4 : info.comp.kind === 'playoffs' ? 1.8 : 1);
    const fillRate = clamp(0.3 + (fm.mood + 100) / 400 + team.hype / 300 + (info.rival ? 0.08 : 0), 0.08, 1);
    fm.attendance = Math.round(fillRate * 100);
    addLedger(state, team, 'Ticketing & matchday', Math.round(cap * fillRate * (team.ticketPrice ?? 20) * 0.22), `vs ${opp.short} (${fm.attendance}% full)`);
  }
}

/** Occasional posts about other teams' big moments, and our fans gloating when a rival loses. */
function worldPosts(state: GameState, f: MatchFixture, infoW: SeriesInfo | null) {
  const res = f.result!;
  const comp = state.competitions[f.competitionId];
  const w = state.teams[res.winner], l = state.teams[res.loser];
  const user = state.teams[state.userTeamId];
  if (!comp || comp.tier > 1 || !w || !l || !user) return;
  const um = fanMood(state, user.id);
  const flags = (um.flags ??= {});
  const [day, cnt] = (flags.world ?? '').split('|');
  let count = day === state.date ? Number(cnt) : 0;
  if (count >= 3) return;
  const rng = new RNG(hashString(f.id + 'world') ^ state.seq);
  const score = `${Math.max(res.scoreA, res.scoreB)}-${Math.min(res.scoreA, res.scoreB)}`;
  const ctx: Ctx = { team: w.name, short: w.short, opp: l.name, oppShort: l.short, score, comp: compName(comp), league: leagueName(state, w), oppLeague: leagueName(state, l) };
  const post = (team: Team, scen: string, c: Ctx) => { if (emit(state, rng, team, scen, c, { replyChance: 0.15, fixtureId: f.id })) count++; };
  if (w.id !== user.id && rivalry(state, user.id, l.id) && rng.chance(0.35) && cool(um, 'schaden', state.date, 4)) post(user, 'rival_schadenfreude', { ...ctx, short: user.short, team: w.short, opp: l.short });
  else if (infoW?.final && rng.chance(0.7)) post(w, 'world_title', ctx);
  else if (comp.tier === 0 && w.leagueId !== l.leagueId && rng.chance(0.3)) post(w, 'world_intl', ctx);
  else if (comp.tier === 1 && infoW && infoW.winProb < 0.25 && rng.chance(0.25)) post(w, 'world_upset', ctx);
  flags.world = `${state.date}|${count}`;
}

/** Post-series hook: updates fan moods of both teams (user + tier-1), writes posts; returns the user's view. */
export function fansAfterSeries(state: GameState, f: MatchFixture): SeriesInfo | null {
  if (!f.result?.loser || !f.teamA || !f.teamB) return null;
  let mine: SeriesInfo | null = null, winner: SeriesInfo | null = null;
  for (const id of [f.teamA, f.teamB]) {
    const t = state.teams[id];
    if (!t || (id !== state.userTeamId && tierOf(state, t) > 1 && state.competitions[f.competitionId]?.tier !== 0)) continue;
    const info = analyseSeries(state, f, id);
    if (!info) continue;
    updateMood(state, info, fanMood(state, id));
    if (info.won) winner = info;
    if (id === state.userTeamId) { mine = info; userSeriesPosts(state, info); }
  }
  if (!mine) worldPosts(state, f, winner);
  return mine;
}

// ------------------------------------------------------------------ daily: club changes, competitions, weekly drift
export interface ClubEvent { kind: string; playerId?: string; data?: Record<string, string | number> }

const topChamps = (p: Player, n: number) => Object.entries(p.champions).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);
function merchRatio(team: Team) {
  let price = 0, base = 0;
  for (const m of team.merch) { const t = MERCH_TEMPLATES.find((x) => x.type === m.type); if (t) { price += m.price; base += t.basePrice; } }
  return base ? price / base : 1;
}
function takeSnap(state: GameState, team: Team): NonNullable<FanPulse['snap']> {
  const pow: Record<string, number> = {};
  for (const r of ROLES) { const p = team.lineup[r] ? state.players[team.lineup[r]!] : undefined; if (p) for (const c of topChamps(p, 3)) pow[c] = state.championPower[c] ?? 0; }
  return {
    teamId: team.id, roster: [...team.roster], lineup: ROLES.map((r) => team.lineup[r] ?? ''), sponsors: team.sponsors.map((s) => s.id),
    facilities: FACILITY_KEYS.map((k) => team.facilities[k] ?? 0), coach: headCoach(state, team)?.id, patch: state.patch,
    merch: merchRatio(team), merchLines: team.merch.length, pow, payroll: payrollYearly(state, team),
  };
}

function diffSnap(state: GameState, rng: RNG, team: Team, old: NonNullable<FanPulse['snap']>, cur: NonNullable<FanPulse['snap']>, ctx: Ctx, events: ClubEvent[]) {
  const fm = fanMood(state, team.id);
  const avg = lineupStrength(state, team);
  const post = (scen: string, c: Ctx, n = 2, playerId?: string) => { let mins = rng.int(10 * 60, 21 * 60); for (let i = 0; i < n; i++) { emit(state, rng, team, scen, { ...ctx, ...c }, { playerId, mins }); mins += rng.int(5, 60); } };
  for (const id of cur.roster.filter((x) => !old.roster.includes(x))) {
    const p = state.players[id];
    if (!p) continue;
    const ovr = overall(p.attributes, p.role), age = ageOn(p.birthdate, state.date) ?? 22;
    const kind = p.reputation >= 75 || ovr >= avg + 4 || p.traits.includes('fan_favorite') ? 'sign_star' : age < 20 || p.traits.includes('rookie') ? 'sign_rookie'
      : age >= 27 || p.traits.includes('veteran') ? 'sign_veteran' : ovr < avg - 6 ? 'sign_cheap' : 'sign_solid';
    post(kind, { player: p.handle, role: ROLE_LABEL[p.role], age: Math.floor(age) }, kind === 'sign_star' ? 4 : 2);
    if (kind === 'sign_star') fm.mood = clamp(fm.mood + 8, -100, 100);
    events.push({ kind, playerId: id });
  }
  for (const id of old.roster.filter((x) => !cur.roster.includes(x))) {
    const p = state.players[id];
    if (!p || p.retired) continue;
    const dest = p.teamId ? state.teams[p.teamId] : null;
    const starter = old.lineup.includes(id);
    const kind = dest && rivalry(state, team.id, dest.id) ? 'depart_traitor' : p.traits.includes('fan_favorite') || p.reputation >= 80 ? 'depart_fanfav'
      : starter || overall(p.attributes, p.role) >= avg + 2 ? 'depart_star' : 'depart_dud';
    post(kind, { player: p.handle, role: ROLE_LABEL[p.role], oppShort: dest?.short }, kind === 'depart_fanfav' || kind === 'depart_traitor' ? 4 : 2);
    if (kind === 'depart_fanfav') { fm.mood = clamp(fm.mood - 12, -100, 100); fm.patience = clamp(fm.patience - 6, 0, 100); }
    events.push({ kind, playerId: id, data: dest ? { to: dest.id } : undefined });
  }
  // lineup changes (players still on the roster)
  for (const id of old.lineup.filter((x) => x && !cur.lineup.includes(x) && cur.roster.includes(x))) {
    const p = state.players[id];
    if (p && (p.reputation >= 70 || p.traits.includes('fan_favorite')) && cool(fm, 'bench:' + id, state.date, 14)) post('bench_star', { player: p.handle }, 2, id);
  }
  for (const id of cur.lineup.filter((x) => x && !old.lineup.includes(x) && old.roster.includes(x))) {
    const p = state.players[id];
    if (p && cool(fm, 'promote:' + id, state.date, 14)) post('promote_sub', { player: p.handle }, 1, id);
  }
  if (cur.coach !== old.coach) {
    const c = cur.coach ? state.staff[cur.coach] : undefined, prev = old.coach ? state.staff[old.coach] : undefined;
    if (c) { post('coach_new', { coach: c.handle }, 2); events.push({ kind: 'coach_new', data: { coach: c.handle } }); }
    else if (prev) post('coach_fired', { coach: prev.handle }, 2);
  }
  for (const sid of cur.sponsors.filter((x) => !old.sponsors.includes(x))) {
    const s = team.sponsors.find((x) => x.id === sid);
    if (!s || s.startDate !== state.date && days(s.startDate, state.date) > 2) continue;
    const kind = SELLOUT.includes(s.category) && rng.chance(0.75) ? 'sponsor_sellout' : 'sponsor_w';
    post(kind, { sponsor: s.name, category: s.category.toLowerCase() }, 2);
    events.push({ kind, data: { sponsor: s.name } });
  }
  FACILITY_KEYS.forEach((k, i) => {
    if ((cur.facilities[i] ?? 0) <= (old.facilities[i] ?? 0)) return;
    post('facility', { facility: FACILITY_INFO[k].name, benefit: FACILITY_BENEFIT[k] }, 2);
    events.push({ kind: 'facility', data: { facility: FACILITY_INFO[k].name, key: k } });
  });
  if (cur.merch >= 1.35 && old.merch < 1.35 && cool(fm, 'merch', state.date, 45)) {
    post('merch_greed', { price: Math.max(...team.merch.map((m) => m.price)) }, 2);
    fm.mood = clamp(fm.mood - 3, -100, 100);
  }
  if (cur.merchLines > old.merchLines) {
    const m = team.merch[team.merch.length - 1];
    const who = m?.playerId ? state.players[m.playerId]?.handle : undefined;
    if (m) post('merch_new', { item: who ? `${who} ${m.name.toLowerCase()}` : `${team.short} ${m.name.toLowerCase()}` }, 2);
  }
  if (cur.payroll > old.payroll * 1.2 && cur.payroll - old.payroll > 100_000 * (tierOf(state, team) === 1 ? 1 : 0.15)) events.push({ kind: 'payroll', data: { amount: Math.round(cur.payroll) } });
  // patch notes: champions in our players' pools that got buffed / nerfed
  if (cur.patch !== old.patch && rng.chance(0.7)) {
    let best: [string, number] | null = null;
    for (const [c, prev] of Object.entries(old.pow)) { const d = (state.championPower[c] ?? 0) - prev * 0.6; if (Math.abs(d) >= 0.03 && (!best || Math.abs(d) > Math.abs(best[1]))) best = [c, d]; }
    const owner = best ? ROLES.map((r) => state.players[team.lineup[r] ?? '']).find((p) => p && topChamps(p, 3).includes(best![0])) : undefined;
    if (best && owner) post(best[1] > 0 ? 'patch_buff' : 'patch_nerf', { champ: champName(best[0]), player: owner.handle }, 2, owner.id);
  }
}

function seasonPosts(state: GameState, rng: RNG, team: Team, prevSeason: number | undefined, ctx: Ctx) {
  const fm = fanMood(state, team.id);
  const post = (scen: string, c: Ctx, n: number) => { let mins = rng.int(9 * 60, 18 * 60); for (let i = 0; i < n; i++) { emit(state, rng, team, scen, { ...ctx, ...c }, { mins }); mins += rng.int(10, 90); } };
  if (prevSeason) {
    const rec = seasonRecord(state, team.id, prevSeason);
    const comps = Object.values(state.competitions).filter((c) => c.season === prevSeason && c.kind !== 'league' && c.placements?.[team.id]);
    const best = comps.sort((a, b) => a.placements![team.id] - b.placements![team.id] || a.tier - b.tier || b.prizePool - a.prizePool)[0];
    const titles = team.titles.filter((t) => t.season === prevSeason).length;
    const wr = rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0.5;
    const sc = wr * 100 - (fm.expectation - 50) * 0.4 + titles * 15;
    const grade = sc >= 85 ? 'A+' : sc >= 72 ? 'A' : sc >= 60 ? 'B' : sc >= 48 ? 'C' : sc >= 38 ? 'D' : 'F';
    if (rec.w + rec.l > 0) post('season_review', {
      season: prevSeason, record: `${rec.w}-${rec.l}`, grade, best: best ? (best.placements![team.id] === 1 ? `won the ${compName(best)}` : `${placementLabel(best.placements![team.id], best).toLowerCase()} at the ${compName(best)}`) : 'no playoff run',
      verdict: grade.startsWith('A') ? 'a season to remember' : grade === 'B' ? 'a solid year' : grade === 'C' ? 'a mixed bag' : 'one to forget',
    }, 3);
  }
  post('season_preview', { season: state.season }, 3);
}

function compPosts(state: GameState, rng: RNG, team: Team, ctx: Ctx, events: ClubEvent[]) {
  const fm = fanMood(state, team.id);
  const post = (scen: string, c: Ctx, n: number, intl = false) => { let mins = rng.int(12 * 60, 22 * 60); for (let i = 0; i < n; i++) { emit(state, rng, team, scen, { ...ctx, ...c }, { mins, intl, stakes: 1.5 }); mins += rng.int(3, 40); } };
  const target = fm.expectation >= 80 ? 'the title' : fm.expectation >= 60 ? 'a deep run' : fm.expectation >= 40 ? 'a series win or two' : 'enjoy the experience';
  for (const c of Object.values(state.competitions)) {
    if (c.season < state.season - 1) continue;
    if (c.status !== 'upcoming' && c.teams.includes(team.id) && (c.kind === 'playoffs' || c.tier === 0) && once(fm, 'start:' + c.id, state.date)) {
      if (c.tier === 0) {
        const key = (c.tags ?? []).find((t) => ['fst', 'msi', 'worlds', 'ewc'].includes(t)) ?? c.id;
        if (once(fm, `intl:${c.season}:${key}`, state.date)) { post('qualify_intl', { event: compName(c), target }, 3, true); events.push({ kind: 'qualify_intl', data: { event: compName(c) ?? '' } }); }
      } else { post('playoffs_qualified', { comp: compName(c), target }, 2); events.push({ kind: 'playoffs', data: { comp: compName(c) ?? '' } }); }
    }
    const place = c.placements?.[team.id];
    if (c.status === 'done' && place && once(fm, 'done:' + c.id, state.date)) {
      events.push({ kind: 'comp_done', data: { comp: c.id, place } });
      if (fm.flags?.['comp:' + c.id]) continue;
      fm.flags!['comp:' + c.id] = state.date;
      const cc = { comp: compName(c), record: `${place}${ord(place).replace(/^\d+/, '')} place` };
      if (c.kind === 'league') { if (place === 1) post('standings_top', { ...cc, rank: 1, record: 'first place' }, 2); else if (place === c.teams.length && c.teams.length > 3) post('standings_bottom', { ...cc, record: 'last place' }, 2); }
      else if (place === 1) post(c.tags?.includes('worlds') ? 'title_worlds' : 'title', cc, 5, c.tier === 0);
      else if (place === 2) post('runner_up', cc, 3, c.tier === 0);
      else post('playoffs_elim', { ...cc, verdict: placementLabel(place, c).toLowerCase() }, 3, c.tier === 0);
    }
  }
  for (const [ev, list] of Object.entries(state.qualified)) {
    const info = INTL_EVENT[ev];
    if (!info || !list.some((x) => x.teamId === team.id) || !once(fm, `intl:${state.season}:${info[0]}`, state.date)) continue;
    post('qualify_intl', { event: info[1], target }, 3, true);
    events.push({ kind: 'qualify_intl', data: { event: info[1] } });
  }
}

function weekly(state: GameState, rng: RNG, team: Team, fm: FanMood, ctx: Ctx) {
  for (const m of Object.values(fanPulse(state).teams)) {
    m.mood += (0 - m.mood) * 0.05;
    if (m.mood > -20) m.patience = clamp(m.patience + 1.2, 0, 100);
  }
  (fm.trend ??= []).push(Math.round(fm.mood));
  if (fm.trend.length > 30) fm.trend.splice(0, fm.trend.length - 30);
  // light feedback: buzz follows the mood, the fanbase slowly grows or shrinks, egos feel the noise
  const target = clamp(50 + fm.mood * 0.35, 5, 100);
  team.hype = clamp(team.hype + (target - team.hype) * 0.15, 0, 100);
  team.fans = Math.max(100, Math.round(team.fans * (1 + fm.mood * 0.00003)));
  if (Math.abs(fm.mood) > 40) for (const r of ROLES) {
    const p = team.lineup[r] ? state.players[team.lineup[r]!] : undefined;
    if (p) p.morale = clamp(p.morale + Math.sign(fm.mood) * (fm.mood > 0 ? 0.4 : 0.7) * sensitivity(state, team, p), 5, 100);
  }
  const post = (scen: string, c: Ctx, n: number, playerId?: string) => { let mins = rng.int(9 * 60, 22 * 60); for (let i = 0; i < n; i++) { emit(state, rng, team, scen, { ...ctx, ...c }, { mins, playerId }); mins += rng.int(10, 120); } };
  const rec = seasonRecord(state, team.id, state.season);
  if (rec.w + rec.l >= 12 && rec.w / (rec.w + rec.l) < 0.3 && cool(fm, 'losing', state.date, 45)) post('losing_season', { record: `${rec.w}-${rec.l}` }, 2);
  const last = fm.flags?.lastMatch;
  if (last && days(last, state.date) >= 10 && rng.chance(0.45)) post('drought', { n: days(last, state.date) }, rng.int(1, 2));
  if (inTransferWindow(state.date) && rng.chance(0.5)) {
    const stars = Object.values(state.players).filter((p) => p.teamId && p.teamId !== team.id && !p.retired && p.reputation >= 75).sort((a, b) => b.reputation - a.reputation).slice(0, 20);
    const s = stars.length ? rng.pick(stars) : undefined;
    if (s) post('offseason_rumor', { star: s.handle, role: ROLE_LABEL[s.role].toLowerCase(), initial: s.handle[0].toUpperCase() }, 2);
  }
}

/** Daily hook: season turnover, roster / club changes, competition milestones, weekly drift. Returns events for the owner. */
export function fansDaily(state: GameState): ClubEvent[] {
  const team = state.teams[state.userTeamId];
  if (!team) return [];
  const fp = fanPulse(state);
  const known = fp.teams[team.id];
  const prevSeason = known?.season;
  const fm = fanMood(state, team.id);
  const rng = new RNG(hashString(state.date + 'fans') ^ state.seq);
  const events: ClubEvent[] = [];
  const ctx = baseCtx(state, team);
  if (prevSeason !== state.season) {
    const rec = seasonRecord(state, team.id, state.season);
    if (prevSeason !== undefined || rec.w + rec.l === 0) seasonPosts(state, rng, team, prevSeason, ctx);
  }
  const snap = takeSnap(state, team);
  if (fp.snap && fp.snap.teamId === team.id && fp.snap.pow) diffSnap(state, rng, team, fp.snap, snap, ctx, events);
  fp.snap = snap;
  compPosts(state, rng, team, ctx, events);
  if (weekday(state.date) === 1) weekly(state, rng, team, fm, ctx);
  // forget one-shot flags after a year
  const cutoff = addDays(state.date, -400);
  for (const [k, v] of Object.entries(fm.flags ?? {})) if (k !== 'world' && v < cutoff) delete fm.flags![k];
  return events;
}
