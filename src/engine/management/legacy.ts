// Title-history awareness: back-to-backs, three-peats and dynasties, title defences, droughts and curses,
// finals rematches ("history repeats itself"), revenge arcs, players chasing their Nth ring, the manager's
// trophy count, semi-final hoodoos and anniversaries. Real pre-2026 history comes from legacyData.ts; everything
// after is learned in-save (team.titles / team.history, player careers and the finals this module records).
// Hooks: legacyAfterSeries (reactions.onSeriesFinished), legacyDaily (reactions.reactionsDaily) and legacyChat
// (LiveChat.tsx). The content lives in legacyTemplates.ts and is merged into the fan / owner tables at load.
import type { GameState, Team, Player, MatchFixture, Competition, LegacyState } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addNews } from './news';
import { emit, baseCtx, fanMood, fill, rivalry, type Ctx } from './fans';
import { FAN_TEMPLATES, SCENARIO_META, type Templates } from './fanTemplates';
import { OWNER_T, QUIRK_T } from './ownerTemplates';
import { ownerMail, ownerAsk, ownerHas, registerOwnerQuirk } from './owner';
import { addDays, weekday, daysBetween } from '../season/formats';
import { ageOn } from '../setup';
import { ord } from './fixtureinfo';
import { REAL_FINALS, REAL_EDITIONS, REAL_COMPLETE, REAL_DOMESTIC, REAL_PLAYER_TITLES, PLAYER_TITLE_CLUB, type RealEv } from './legacyData';
import { LEG_META, LEG_TEMPLATES, LEG_OWNER_T, LEG_QUIRK_T, LEG_NEWS } from './legacyTemplates';

/** First in-save season: real data covers everything before it. */
const FIRST_SEASON = 2026;
type FanPersonaKey = keyof Templates;

// ------------------------------------------------------------------ content registration (once per module load)
if (!SCENARIO_META.leg_win_b2b) {
  for (const [scen, t] of Object.entries(LEG_TEMPLATES)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t) as [FanPersonaKey, string[]][]) (base[p] ??= []).push(...lines);
  }
  Object.assign(SCENARIO_META, LEG_META);
  Object.assign(OWNER_T, LEG_OWNER_T);
  Object.assign(QUIRK_T, LEG_QUIRK_T);
}
let quirkReady = false;
/** Owner request "the parade question" before a history-making final (registered lazily if owner.ts was still loading). */
function ensureQuirk() {
  if (quirkReady) return;
  registerOwnerQuirk('leg_parade', {
    cd: 120,
    make: (state, _o, team) => {
      const f = nextUserFinal(state, 2);
      if (!f) return null;
      const st = finalStories(state, f, team.id)[0];
      return st ? {
        data: { hook: String(st.ctx.hook ?? 'history'), oppShort: state.teams[f.teamA === team.id ? f.teamB! : f.teamA!]?.short ?? 'them' },
        options: [
          { id: 'plan', label: 'Plan the parade route now', hint: 'Owner thrilled · hype up · pressure on the nervy ones' },
          { id: 'replicas', label: 'Bring the old trophies to the team hotel', hint: 'Squad morale up' },
          { id: 'jinx', label: 'Not a word about parades — don’t jinx it', hint: 'Superstitious owners approve' },
        ],
        fallback: 'jinx', days: 2,
      } : null;
    },
    resolve: (state, o, _req, opt) => {
      const has = (t: string) => o.traits.includes(t as never);
      if (opt === 'plan') {
        for (const id of state.teams[o.teamId]?.roster ?? []) { const p = state.players[id]; if (p && p.hidden.composure < 45) p.morale = clamp(p.morale - 2, 5, 100); }
        return { out: 'plan', fx: { owner: has('publicity') || has('ambitious') ? 10 : 6, hype: 4 } };
      }
      if (opt === 'replicas') return { out: 'replicas', fx: { morale: 2, owner: has('sentimental') ? 6 : 2 } };
      return { out: 'jinx', fx: { owner: has('superstitious') ? 8 : has('publicity') ? -4 : 0, morale: 1 } };
    },
  }, 'the parade');
  quirkReady = true;
}
try { ensureQuirk(); } catch { /* owner.ts still initialising (import cycle): registered on the first daily tick */ }

// ------------------------------------------------------------------ state & classification
export function legacyState(state: GameState): LegacyState {
  return (state.legacy ??= { finals: [], mgr: [], flags: {} });
}

export type Ev = 'worlds' | 'msi' | 'fst' | 'ewc' | 'dom' | 'cup' | 'other';
const INTL = new Set<Ev>(['worlds', 'msi', 'fst', 'ewc']);
const EV_LABEL: Record<string, string> = { worlds: 'Worlds', msi: 'MSI', fst: 'First Stand', ewc: 'EWC' };
const EV_FULL: Record<string, string> = { worlds: 'World Championship', msi: 'Mid-Season Invitational', fst: 'First Stand', ewc: 'Esports World Cup' };
type CompX = Competition & { specs?: unknown[]; template?: string };

/** What kind of trophy a competition is: the internationals, a domestic title, a cup, or nothing worth a legacy. */
export function compEv(c?: Competition): Ev {
  if (!c) return 'other';
  const t = c.tags ?? [];
  if (t.includes('worlds')) return 'worlds';
  if (t.includes('msi')) return 'msi';
  if (t.includes('fst')) return 'fst';
  if (t.includes('ewc')) return 'ewc';
  if (c.kind === 'league' || c.kind === 'qualifier' || t.includes('promotion') || t.includes('emea_masters')) return 'other';
  if (t.includes('cup')) return 'cup';
  return (c.kind === 'playoffs' || c.kind === 'cup') && c.leagueId ? 'dom' : 'other';
}
const keyOf = (c: Competition, ev: Ev) => (INTL.has(ev) ? ev : (c as CompX).template ?? c.short);
/** Display name of the trophy: "Worlds", "MSI", "the LCK" … */
function evName(state: GameState, ev: Ev, c?: Competition): string {
  if (INTL.has(ev)) return EV_LABEL[ev];
  const l = c?.leagueId ? state.leagues[c.leagueId]?.name ?? c.leagueId : undefined;
  return l ?? c?.short ?? 'league';
}

const byName = new WeakMap<GameState, { n: number; map: Map<string, Competition> }>();
function compByName(state: GameState, name: string): Competition | undefined {
  const n = Object.keys(state.competitions).length;
  let e = byName.get(state);
  if (!e || e.n !== n) { e = { n, map: new Map(Object.values(state.competitions).map((c) => [c.name, c])) }; byName.set(state, e); }
  return e.map.get(name);
}

/** A trophy on record (real or in-save). */
export interface Hon { s: number; ev: Ev; key: string; name: string; d: string; real?: boolean; league?: string }
export function honours(state: GameState, teamId: string): Hon[] {
  const out: Hon[] = [];
  for (const f of REAL_FINALS) if (f.w === teamId && f.s < FIRST_SEASON) out.push({ s: f.s, ev: f.ev, key: f.ev, name: `${EV_FULL[f.ev]} ${f.s}`, d: `${f.s}-${f.d ?? '12-31'}`, real: true });
  for (const t of state.teams[teamId]?.titles ?? []) {
    const c = compByName(state, t.competition);
    const ev = compEv(c);
    if (!c || ev === 'other') continue;
    out.push({ s: t.season, ev, key: keyOf(c, ev), name: t.competition, d: c.endDate, league: c.leagueId });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

/** Seasons in which an international event was held (newest first). */
function editions(state: GameState, ev: Ev): number[] {
  const set = new Set<number>(INTL.has(ev) ? REAL_EDITIONS[ev as RealEv] : []);
  for (const c of Object.values(state.competitions)) if (compEv(c) === ev) set.add(c.season);
  return [...set].sort((a, b) => b - a);
}
/** Consecutive editions of an international event won right before `season` (T1 enter 2026 on 3 at Worlds). */
export function streakBefore(state: GameState, teamId: string, ev: Ev, season: number): number {
  const won = new Set(honours(state, teamId).filter((h) => h.ev === ev).map((h) => h.s));
  let n = 0;
  for (const s of editions(state, ev)) { if (s >= season) continue; if (won.has(s)) n++; else break; }
  return n;
}
/** Consecutive domestic titles of a league won by the team before a date (in-save; T1 had none in 2025). */
export function domStreak(state: GameState, teamId: string, leagueId: string | undefined, before: string): number {
  if (!leagueId) return 0;
  const evs = Object.values(state.competitions).filter((c) => c.leagueId === leagueId && compEv(c) === 'dom' && c.status === 'done' && c.winner && c.endDate < before).sort((a, b) => b.endDate.localeCompare(a.endDate));
  let n = 0;
  for (const c of evs) { if (c.winner === teamId) n++; else break; }
  return n;
}
const streakOf = (state: GameState, teamId: string, ev: Ev, c: Competition) => (INTL.has(ev) ? streakBefore(state, teamId, ev, c.season) : domStreak(state, teamId, c.leagueId, c.startDate));

/** Last domestic title before a date: in-save first, then the safe real data. null = known never, undefined = unknown. */
function lastDomestic(state: GameState, teamId: string, leagueId: string | undefined, before: string): { s: number; name: string } | null | undefined {
  const mine = honours(state, teamId).filter((h) => h.ev === 'dom' && h.d < before && (!leagueId || h.league === leagueId));
  if (mine.length) return { s: mine[mine.length - 1].s, name: mine[mine.length - 1].name };
  const r = REAL_DOMESTIC[teamId];
  if (r?.last) return { s: r.last[0], name: r.last[1] };
  return r?.never ? null : undefined;
}
/** Years without any trophy before `season`, when that is actually known (international data is complete, domestic only for some clubs). */
export function trophyDrought(state: GameState, teamId: string, season: number): { years: number; last?: { s: number; name: string } } | null {
  const hs = honours(state, teamId).filter((h) => h.s < season && h.ev !== 'cup');
  const r = REAL_DOMESTIC[teamId];
  let last: { s: number; name: string } | undefined = hs.length ? { s: hs[hs.length - 1].s, name: hs[hs.length - 1].name } : undefined;
  if (r?.last && (!last || r.last[0] > last.s)) last = { s: r.last[0], name: r.last[1] };
  if (last && (last.s >= FIRST_SEASON || r)) return { years: season - last.s, last };
  if (!last && r?.never) return { years: 99 };
  return null;
}

/** All finals on record: real internationals + those recorded in-save. */
export interface Fin { s: number; ev: Ev; key: string; w: string | null; l: string | null; sc?: string; wAs?: string; lAs?: string; d: string; real?: boolean }
function allFinals(state: GameState): Fin[] {
  const out: Fin[] = REAL_FINALS.filter((f) => f.s < FIRST_SEASON).map((f) => ({ s: f.s, ev: f.ev, key: f.ev, w: f.w, l: f.l, sc: f.sc, wAs: f.wAs, lAs: f.lAs, d: `${f.s}-${f.d ?? '12-31'}`, real: true }));
  for (const f of state.legacy?.finals ?? []) out.push({ s: f.s, ev: f.ev as Ev, key: f.key, w: f.w, l: f.l, sc: f.sc, d: f.d });
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
const inFinal = (f: Fin, id: string) => f.w === id || f.l === id;
const samePair = (f: Fin, a: string, b: string) => (f.w === a && f.l === b) || (f.w === b && f.l === a);
/** Name a club had in a final ("SK Telecom T1" in 2016). */
const nameThen = (state: GameState, f: Fin, id: string | null) => (id && f.w === id ? f.wAs : id && f.l === id ? f.lAs : undefined) ?? (id ? state.teams[id]?.short : undefined) ?? '?';

/** Personal international titles of a player: real (pre-2026) + won in-save. [season, team id] */
export function playerRings(state: GameState, p: Player, ev: 'worlds' | 'msi' | 'fst'): [number, string | null][] {
  const real = !p.generated && !p.isCustom ? REAL_PLAYER_TITLES[p.id]?.[ev] ?? [] : [];
  const rx = ev === 'worlds' ? /^World Championship \d{4}$/ : ev === 'msi' ? /^Mid-Season Invitational \d{4}$/ : /^First Stand \d{4}$/;
  const mine: [number, string | null][] = [];
  for (const c of p.career) for (const t of c.titles) if (rx.test(t) && !real.some(([s]) => s === c.season)) mine.push([c.season, c.teamId]);
  return [...real, ...mine];
}
const clubName = (state: GameState, p: Player, id: string | null) => (id ? state.teams[id]?.name : undefined) ?? PLAYER_TITLE_CLUB[p.id] ?? 'another club';

// ------------------------------------------------------------------ helpers
const peat = (n: number) => (n <= 2 ? 'back-to-back' : n === 3 ? 'three-peat' : n === 4 ? 'four-peat' : n === 5 ? 'five-peat' : `${n}-peat`);
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => NUM[n] ?? String(n);
/** {count} as a word plus {Count} capitalised for the start of a sentence. */
const W = (n: number): Ctx => { const w = word(n); return { count: w, Count: w[0].toUpperCase() + w.slice(1) }; };
function scoreOf(f: MatchFixture, teamId: string): [number, number] {
  const r = f.result!;
  return f.teamA === teamId ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA];
}
const winnerScore = (f: MatchFixture) => { const r = f.result!; return `${Math.max(r.scoreA, r.scoreB)}-${Math.min(r.scoreA, r.scoreB)}`; };

/** The grand final of a competition: labelled Final / Grand Final in its last stage. */
export function isFinalFixture(state: GameState, f: MatchFixture): boolean {
  const comp = state.competitions[f.competitionId] as CompX | undefined;
  if (!comp) return false;
  const lastStage = (comp.specs?.length ?? comp.stages.length) === comp.stages.length && comp.stages[comp.stages.length - 1]?.id === f.stageId;
  return lastStage && /^(Grand )?Final$/.test((f.label ?? '').trim());
}
/** Out of the competition after this loss (same rule as the fan module). */
function eliminated(state: GameState, f: MatchFixture, teamId: string) {
  const stage = state.competitions[f.competitionId]?.stages.find((s) => s.id === f.stageId);
  if (!stage) return false;
  if (stage.format === 'swiss') return stage.fixtures.filter((id) => state.fixtures[id]?.result?.loser === teamId).length >= 3;
  if (stage.format !== 'singleElim' && stage.format !== 'doubleElim' && stage.format !== 'gsl') return false;
  return !stage.fixtures.some((id) => { const x = state.fixtures[id]; return x && !x.result && (x.teamA === teamId || x.teamB === teamId); });
}
/** Grand finals of the competitions running now (cheap: only active competitions' last stages). */
function activeFinals(state: GameState): MatchFixture[] {
  const out: MatchFixture[] = [];
  for (const c of Object.values(state.competitions) as CompX[]) {
    if (c.status !== 'active' || (c.specs?.length ?? c.stages.length) !== c.stages.length) continue;
    const st = c.stages[c.stages.length - 1];
    for (const id of st?.fixtures ?? []) { const f = state.fixtures[id]; if (f && !f.result && /^(Grand )?Final$/.test((f.label ?? '').trim())) out.push(f); }
  }
  return out;
}
function nextUserFinal(state: GameState, within: number): MatchFixture | undefined {
  const u = state.userTeamId, until = addDays(state.date, within);
  let best: MatchFixture | undefined;
  for (const f of activeFinals(state)) if (f.teamA && f.teamB && (f.teamA === u || f.teamB === u) && f.date >= state.date && f.date <= until && (!best || f.date < best.date)) best = f;
  return best;
}
function cool(L: LegacyState, key: string, date: string, n: number) {
  const d = L.flags[key];
  if (d && daysBetween(d, date) < n) return false;
  L.flags[key] = date;
  return true;
}
function once(L: LegacyState, key: string, date: string) {
  if (L.flags[key]) return false;
  L.flags[key] = date;
  return true;
}

/** Fan posts for one scenario on a team's feed (the shared emit: personas, likes, replies, morale). */
function posts(state: GameState, rng: RNG, team: Team, scen: string, ctx: Ctx, n: number, o: { stakes?: number; fixtureId?: string; intl?: boolean; playerId?: string; start?: number } = {}) {
  const c = { ...baseCtx(state, team), ...ctx };
  let mins = o.start ?? rng.int(9 * 60, 20 * 60), wrote = 0;
  for (let i = 0; i < n; i++) {
    if (emit(state, rng, team, scen, c, { mins: Math.min(1439, mins), stakes: o.stakes ?? 1.5, fixtureId: o.fixtureId, intl: o.intl, playerId: o.playerId, replyChance: 0.45 })) wrote++;
    mins += rng.int(3, 40);
  }
  return wrote;
}
function news(state: GameState, rng: RNG, kind: string, ctx: Ctx, teamIds?: string[], playerIds?: string[]): boolean {
  const t = LEG_NEWS[kind];
  if (!t) return false;
  const pick = (arr: string[]) => { for (let i = 0; i < 6; i++) { const s = fill(rng.pick(arr), ctx); if (s) return s; } return arr.map((x) => fill(x, ctx)).find(Boolean) ?? null; };
  const headline = pick(t.headline), body = pick(t.body);
  if (!headline || !body) return false;
  addNews(state, { headline, body, tags: ['legacy'], teamIds, playerIds });
  return true;
}

// ------------------------------------------------------------------ storylines of a final
export interface Story { key: string; w: number; ctx: Ctx; chat: string; win: string; loss: string }
/** History around a (coming) final for one side: N-peat chase, title defence, rematch, revenge, return, first final… */
export function finalStories(state: GameState, f: MatchFixture, teamId: string): Story[] {
  const comp = state.competitions[f.competitionId];
  const ev = compEv(comp);
  const oppId = f.teamA === teamId ? f.teamB : f.teamA;
  const team = state.teams[teamId], opp = oppId ? state.teams[oppId] : undefined;
  if (!comp || !team || !opp || ev === 'other' || ev === 'cup') return [];
  const s = comp.season, key = keyOf(comp, ev), event = evName(state, ev, comp), intl = INTL.has(ev);
  const out: Story[] = [];
  const base: Ctx = { event, oppShort: opp.short, opp: opp.name };
  const add = (k: string, w: number, ctx: Ctx, chat: string, win = 'leg_chat_title_win', loss = 'leg_chat_final_loss') => out.push({ key: k, w, ctx: { ...base, ...ctx }, chat, win, loss });
  const mine = intl ? streakOf(state, teamId, ev, comp) : domStreak(state, teamId, comp.leagueId, comp.startDate);
  const theirs = intl ? streakOf(state, opp.id, ev, comp) : domStreak(state, opp.id, comp.leagueId, comp.startDate);
  if (mine >= 2) add('leg_eve_npeat', 6 + mine, { npeat: peat(mine + 1), ...W(mine + 1), hook: `a ${peat(mine + 1)}` }, 'leg_chat_npeat_start', 'leg_chat_npeat_win', 'leg_chat_npeat_loss');
  else if (mine === 1) add('leg_eve_defend', 4.5, { lastyear: s - 1, hook: `the defence of the ${event} title` }, 'leg_chat_defend_start');
  if (theirs >= 1) add('leg_eve_stop_dynasty', theirs >= 2 ? 5 : 3, { npeat: peat(theirs + 1), ...W(theirs + 1), hook: `the chance to end ${opp.short}’s run` }, 'leg_chat_dynasty_start');
  const finals = allFinals(state).filter((x) => x.d <= state.date);
  const prevSame = [...finals].reverse().find((x) => x.key === key);
  const rematch = prevSame && samePair(prevSame, teamId, opp.id) ? prevSame : undefined;
  const lastVs = [...finals].reverse().find((x) => samePair(x, teamId, opp.id));
  if (rematch) {
    const weWon = rematch.w === teamId;
    add('leg_eve_rematch', 5.5, { lastyear: rematch.s, lastscore: rematch.sc, lastwinner: nameThen(state, rematch, rematch.w), them: nameThen(state, rematch, opp.id), hook: `a rematch of the ${rematch.s} final` }, 'leg_chat_rematch_start', weWon ? 'leg_chat_repeat_win' : 'leg_chat_revenge_win', weWon ? 'leg_chat_final_loss' : 'leg_chat_repeat_loss');
  } else if (lastVs && lastVs.w === opp.id) {
    add('leg_eve_revenge', 4.5, { year: lastVs.s, lastscore: lastVs.sc, then: nameThen(state, lastVs, opp.id), lastevent: INTL.has(lastVs.ev) ? EV_LABEL[lastVs.ev] : event, hook: `revenge for ${lastVs.s}` }, 'leg_chat_revenge_start', 'leg_chat_revenge_win', 'leg_chat_repeat_loss');
  }
  const ourFinals = finals.filter((x) => x.key === key && inFinal(x, teamId));
  const lastOurs = ourFinals[ourFinals.length - 1];
  if (lastOurs && s - lastOurs.s >= 3 && (REAL_COMPLETE[ev] || !intl || lastOurs.s >= FIRST_SEASON)) add('leg_eve_return', 3.5, { lastyear: lastOurs.s, gap: s - lastOurs.s, hook: `our first ${event} final since ${lastOurs.s}` }, 'leg_chat_return_start', 'leg_chat_drought_win');
  else if (!lastOurs && intl && REAL_COMPLETE[ev]) add('leg_eve_first_final', 4, { hook: `our first ever ${event} final` }, 'leg_chat_first_start', 'leg_chat_first_win');
  // the ghost of a failed N-peat: the last time we chased one at this event
  if (mine >= 2) {
    const ghost = [...ourFinals].reverse().find((x) => x.l === teamId && intl && streakBefore(state, teamId, ev, x.s) >= 2);
    if (ghost) add('leg_eve_ghost', 4, { year: ghost.s, lastscore: ghost.sc, then: nameThen(state, ghost, ghost.w), npeatthen: peat(streakBefore(state, teamId, ev, ghost.s) + 1), hook: `exorcising ${ghost.s}` }, 'leg_chat_ghost_start', 'leg_chat_npeat_win', 'leg_chat_npeat_loss');
  }
  // trophy drought before this final
  const hs = honours(state, teamId).filter((h) => h.s < s);
  const lastEv = [...hs].reverse().find((h) => h.key === key || (intl && h.ev === ev));
  const domKnown = !intl ? lastDomestic(state, teamId, comp.leagueId, comp.startDate) : undefined;
  if (intl && REAL_COMPLETE[ev] && lastEv && s - lastEv.s >= 3) add('leg_eve_drought', 3.5, { years: s - lastEv.s, lastyear: lastEv.s, hook: `the end of a ${s - lastEv.s}-year ${event} wait` }, 'leg_chat_drought_start', 'leg_chat_drought_win');
  else if (!intl && domKnown && s - domKnown.s >= 3) add('leg_eve_drought', 3.5, { years: s - domKnown.s, lastyear: domKnown.s, hook: `a first ${event} title since ${domKnown.s}` }, 'leg_chat_drought_start', 'leg_chat_drought_win');
  // players chasing their Nth ring (Worlds / MSI)
  if (ev === 'worlds' || ev === 'msi') {
    let best: { p: Player; n: number } | undefined;
    for (const id of Object.values(team.lineup)) {
      const p = id ? state.players[id] : undefined;
      if (!p) continue;
      const n = playerRings(state, p, ev).length;
      if (n >= 1 && (!best || n > best.n)) best = { p, n };
    }
    if (best) add('leg_eve_player', 2.5 + Math.min(3, best.n * 0.6), { player: best.p.handle, count: best.n + 1, nth: ord(best.n + 1), hook: `${best.p.handle}’s ${ord(best.n + 1)} ${event} title` }, 'leg_chat_player_start');
  }
  return out.sort((a, b) => b.w - a.w);
}

// ------------------------------------------------------------------ after a series
/** From reactions.onSeriesFinished: reactions for the user's series, world-level storylines, and the finals record. */
export function legacyAfterSeries(state: GameState, f: MatchFixture) {
  if (!f.result?.loser || !f.teamA || !f.teamB) return;
  const comp = state.competitions[f.competitionId];
  const ev = compEv(comp);
  if (!comp || ev === 'other') return;
  const L = legacyState(state);
  const final = isFinalFixture(state, f);
  const user = state.userTeamId;
  const rng = new RNG(hashString(f.id + 'legacy') ^ state.seq);
  const mine = f.teamA === user || f.teamB === user;
  if (mine) userSeries(state, L, f, comp, ev, final, rng);
  else if (final && (INTL.has(ev) || (ev === 'dom' && comp.tier <= 1))) worldFinal(state, L, f, comp, ev, rng);
  // defending champions knocked out (internationals): a headline wherever it happens
  if (INTL.has(ev) && ev !== 'ewc' && !final) {
    const loser = f.result.loser;
    if (streakBefore(state, loser, ev, comp.season) >= 1 && eliminated(state, f, loser) && once(L, `defout:${comp.id}`, state.date)) {
      const t = state.teams[loser], w = state.teams[f.result.winner];
      if (t && w) news(state, rng, 'defending_out', { team: t.name, short: t.short, oppShort: w.short, event: evName(state, ev, comp), score: winnerScore(f), stage: (f.label ?? 'the group stage').replace(/\s*\(bye\)/, '') }, [t.id, w.id]);
    }
  }
  if (final && (comp.tier <= 1 || mine) && ev !== 'cup') {
    L.finals.push({ s: comp.season, ev, key: keyOf(comp, ev), w: f.result.winner, l: f.result.loser, sc: winnerScore(f), d: state.date, name: comp.name, league: comp.leagueId });
    if (L.finals.length > 200) L.finals.splice(0, L.finals.length - 200);
  }
}

interface Scene { key: string; w: number; ctx: Ctx; n: number; playerId?: string }

function userSeries(state: GameState, L: LegacyState, f: MatchFixture, comp: Competition, ev: Ev, final: boolean, rng: RNG) {
  const team = state.teams[state.userTeamId];
  const oppId = f.teamA === team.id ? f.teamB! : f.teamA!;
  const opp = state.teams[oppId];
  if (!team || !opp) return;
  const won = f.result!.winner === team.id;
  const [my, their] = scoreOf(f, team.id);
  const s = comp.season, key = keyOf(comp, ev), intl = INTL.has(ev), event = evName(state, ev, comp);
  const fm = fanMood(state, team.id);
  const base: Ctx = { oppShort: opp.short, opp: opp.name, event, score: `${my}-${their}`, mgr: state.manager.name || 'the manager' };
  const scenes: Scene[] = [];
  const add = (k: string, w: number, ctx: Ctx = {}, n = 2, playerId?: string) => { if (!scenes.some((x) => x.key === k)) scenes.push({ key: k, w, ctx: { ...base, ...ctx }, n, playerId }); };
  let ownerKey: string | null = null, ownerCtx: Ctx = {}, newsKey: string | null = null, newsCtx: Ctx = {};
  if (final && ev !== 'cup') {
    const streak = intl ? streakOf(state, team.id, ev, comp) : domStreak(state, team.id, comp.leagueId, comp.startDate);
    const finals = allFinals(state).filter((x) => x.s < s || (x.s === s && x.d < state.date));
    const prevSame = [...finals].reverse().find((x) => x.key === key);
    const rematch = prevSame && samePair(prevSame, team.id, opp.id) ? prevSame : undefined;
    const lastVs = [...finals].reverse().find((x) => samePair(x, team.id, opp.id));
    const hs = honours(state, team.id).filter((h) => h.d < state.date);
    if (won) {
      const n = streak + 1;
      const count = hs.filter((h) => (intl ? h.ev === ev : h.key === key || (h.ev === 'dom' && h.league === comp.leagueId))).length + 1;
      if (n >= 3) {
        add('leg_win_npeat', 10, { npeat: peat(n), ...W(n) }, 5);
        fm.mood = clamp(fm.mood + 12, -100, 100); team.hype = clamp(team.hype + 8, 0, 100); team.fans = Math.round(team.fans * 1.03);
        ownerKey = 'leg_owner_npeat'; ownerCtx = { npeat: peat(n), ...W(n) }; newsKey = 'npeat'; newsCtx = { npeat: peat(n), ...W(n) };
      } else if (n === 2) {
        add('leg_win_b2b', 8, {}, 3);
        fm.mood = clamp(fm.mood + 6, -100, 100); team.hype = clamp(team.hype + 4, 0, 100);
        ownerKey = 'leg_owner_b2b'; newsKey = 'b2b';
      }
      if (intl && count >= 3) add('leg_win_dynasty', 4.5, { count, nth: ord(count) }, 2);
      const domFirst = !intl && lastDomestic(state, team.id, comp.leagueId, state.date) === null;
      if (count === 1 && ((intl && REAL_COMPLETE[ev]) || domFirst)) {
        add('leg_win_first', 9, {}, 4);
        fm.mood = clamp(fm.mood + 8, -100, 100);
        ownerKey ??= 'leg_owner_first'; newsKey ??= 'first';
      }
      // drought / curse broken
      const prevEv = [...hs].reverse().find((h) => (intl ? h.ev === ev : h.ev === 'dom' && h.league === comp.leagueId));
      const domLast = !intl ? lastDomestic(state, team.id, comp.leagueId, comp.startDate) : undefined;
      const lastS = intl ? (REAL_COMPLETE[ev] ? prevEv?.s : prevEv && prevEv.s >= FIRST_SEASON ? prevEv.s : undefined) : domLast?.s;
      const drought = trophyDrought(state, team.id, s);
      if (lastS && s - lastS >= 3) { add('leg_win_drought', 8, { years: s - lastS, lastyear: lastS }, 3); ownerKey ??= 'leg_owner_drought'; ownerCtx = { ...ownerCtx, years: s - lastS, lastyear: lastS }; newsKey ??= 'drought'; newsCtx = { ...newsCtx, years: s - lastS, lastyear: lastS }; }
      else if (drought && drought.years >= 3 && drought.years < 90 && drought.last && !hs.some((h) => h.s === s && h.ev !== 'cup')) { add('leg_win_drought', 7, { years: drought.years, lastyear: drought.last.s, event: 'a trophy' }, 3); ownerKey ??= 'leg_owner_drought'; ownerCtx = { ...ownerCtx, years: drought.years, lastyear: drought.last.s }; }
      // history repeats / revenge
      if (rematch) {
        if (rematch.w === team.id) {
          add('leg_win_repeat', 7, { lastyear: rematch.s, lastscore: rematch.sc }, 3);
          if (rematch.sc === `${my}-${their}`) add('leg_win_same_score', 6, { lastyear: rematch.s }, 2);
          newsKey ??= 'repeat'; newsCtx = { ...newsCtx, lastyear: rematch.s };
        } else { add('leg_win_revenge', 7.5, { year: rematch.s, lastscore: rematch.sc, then: nameThen(state, rematch, opp.id) }, 3); newsKey ??= 'revenge'; newsCtx = { ...newsCtx, year: rematch.s }; }
      } else if (lastVs && lastVs.w === opp.id) add('leg_win_revenge', 5.5, { year: lastVs.s, lastscore: lastVs.sc, then: nameThen(state, lastVs, opp.id) }, 2);
      // players: Nth ring, first ring for a veteran, a ring with a new club
      if (ev === 'worlds' || ev === 'msi') {
        const ids = new Set<string>();
        for (const g of f.result!.games) for (const l of g.players ?? []) if (l.teamId === team.id) ids.add(l.playerId);
        if (!ids.size) for (const id of Object.values(team.lineup)) if (id) ids.add(id);
        let top: { p: Player; n: number } | undefined, vet: Player | undefined, mover: { p: Player; club: string } | undefined;
        for (const id of ids) {
          const p = state.players[id];
          if (!p) continue;
          const rings = playerRings(state, p, ev);
          const n = rings.length + 1;
          if (n >= 2 && (!top || n > top.n)) top = { p, n };
          if (n === 1 && ((ageOn(p.birthdate, state.date) ?? 22) >= 25 || p.reputation >= 80) && (!vet || p.reputation > vet.reputation)) vet = p;
          const other = rings.find(([, t]) => t !== team.id);
          if (other && !mover) mover = { p, club: clubName(state, p, other[1]) };
        }
        if (top) {
          add('leg_win_player', 4 + Math.min(4, top.n), { player: top.p.handle, count: top.n, nth: ord(top.n) }, 2, top.p.id);
          const rec = Math.max(0, ...Object.values(state.players).filter((q) => q.id !== top!.p.id).map((q) => playerRings(state, q, ev).length));
          if (top.n >= 3 && (top.n > rec || ev === 'worlds')) news(state, rng, 'player_record', { player: top.p.handle, team: team.name, short: team.short, count: top.n, nth: ord(top.n), event, record: top.n > rec ? 'a record' : 'an elite' }, [team.id], [top.p.id]);
        }
        if (vet) add('leg_win_player_first', 4, { player: vet.handle }, 1, vet.id);
        if (mover) add('leg_win_player_newclub', 4.5, { player: mover.p.handle, oldclub: mover.club }, 1, mover.p.id);
      }
      // the manager's trophy cabinet
      const mgrN = L.mgr.length + 1;
      if (mgrN === 1 || [3, 5, 10, 15, 20, 25, 30].includes(mgrN)) {
        add(mgrN === 1 ? 'leg_win_manager_first' : 'leg_win_manager', mgrN === 1 ? 5 : 4, { count: mgrN, nth: ord(mgrN) }, 2);
        if (!ownerKey) { ownerKey = 'leg_owner_manager'; ownerCtx = { count: mgrN, nth: ord(mgrN) }; }
      }
      L.mgr.push({ s, comp: comp.name, team: team.id, d: state.date });
    } else {
      if (streak >= 2) { add('leg_loss_npeat_denied', 9, { npeat: peat(streak + 1), ...W(streak) }, 4); ownerKey = 'leg_owner_dethroned'; ownerCtx = { npeat: peat(streak + 1) }; newsKey = 'dynasty_ends'; newsCtx = { npeat: peat(streak + 1) }; }
      else if (streak === 1) { add('leg_loss_dethroned', 7, {}, 3); ownerKey = 'leg_owner_dethroned'; }
      if (rematch && rematch.w === opp.id) add('leg_loss_repeat', 7, { lastyear: rematch.s, lastscore: rematch.sc }, 3);
      else if (lastVs && lastVs.w === opp.id) add('leg_loss_repeat', 5, { lastyear: lastVs.s, lastscore: lastVs.sc }, 2);
      let row = 1;
      for (const x of [...finals].reverse().filter((y) => inFinal(y, team.id))) { if (x.l === team.id) row++; else break; }
      if (row >= 2) { add('leg_loss_finals_curse', 5.5 + row, W(row), 3); ownerKey ??= 'leg_owner_finals_curse'; ownerCtx = { ...ownerCtx, ...W(row) }; }
    }
  } else if (!won && eliminated(state, f, team.id)) {
    const defending = intl ? streakOf(state, team.id, ev, comp) >= 1 : ev === 'dom' && domStreak(state, team.id, comp.leagueId, comp.startDate) >= 1 && honours(state, team.id).some((h) => h.key === key && h.s === s - 1);
    if (defending) { add('leg_loss_defending_out', 7, { stage: (f.label ?? 'the group stage').replace(/\s*\(bye\)/, '') }, 3); ownerKey = 'leg_owner_dethroned'; }
    if (/^(Semifinal|Lower Final)$/.test((f.label ?? '').trim())) {
      const recent = (team.history ?? []).filter((h) => h.season >= s - 2 && (h.placement === 3 || h.placement === 4) && compEv(compByName(state, h.competition)) !== 'other').length + 1;
      const finalsLately = allFinals(state).filter((x) => inFinal(x, team.id) && x.s >= s - 1).length;
      if (recent >= 2 && finalsLately <= 1 && cool(L, 'semis', state.date, 60)) { add('leg_semis_curse', 6, { ...W(recent), comp: comp.name.replace(/\s\d{4}$/, '') }, 3); ownerKey ??= 'leg_owner_semis'; ownerCtx = W(recent); }
    }
  }
  if (!scenes.length) return;
  // the fans react after the result (the regular post-match feed is around 19:00-21:00)
  let start = 20 * 60 + rng.int(20, 90);
  const top = scenes.sort((a, b) => b.w - a.w).slice(0, final ? 4 : 2);
  for (const sc of top) {
    posts(state, rng, team, sc.key, sc.ctx, sc.n, { stakes: final ? 2.4 : 1.6, fixtureId: f.id, intl, playerId: sc.playerId, start });
    start = Math.min(1380, start + rng.int(10, 35));
  }
  if (ownerKey) ownerMail(state, ownerKey, { ...base, ...ownerCtx }, { pri: 2, tone: won ? 2 : -1, cd: ['legacy', 3] });
  if (newsKey) news(state, rng, newsKey, { ...base, ...newsCtx, team: team.name, short: team.short, score: winnerScore(f) }, [team.id, opp.id]);
}

/** Someone else's final: dynasty news, first-time champions, rematches; and our fans have opinions. */
function worldFinal(state: GameState, L: LegacyState, f: MatchFixture, comp: Competition, ev: Ev, rng: RNG) {
  const w = state.teams[f.result!.winner], l = state.teams[f.result!.loser], user = state.teams[state.userTeamId];
  if (!w || !l || !user) return;
  const intl = INTL.has(ev), s = comp.season, key = keyOf(comp, ev), event = evName(state, ev, comp);
  if (!intl && w.leagueId !== user.leagueId) return; // domestic finals: only our own league
  const wStreak = (intl ? streakOf(state, w.id, ev, comp) : domStreak(state, w.id, comp.leagueId, comp.startDate)) + 1;
  const lStreak = intl ? streakOf(state, l.id, ev, comp) : domStreak(state, l.id, comp.leagueId, comp.startDate);
  const ctx: Ctx = { team: w.name, short: w.short, opp: l.name, oppShort: l.short, event, score: winnerScore(f) };
  const prev = [...allFinals(state)].reverse().find((x) => x.key === key && x.s < s);
  const count = honours(state, w.id).filter((h) => (intl ? h.ev === ev : h.key === key)).length + 1;
  let wrote = 0;
  if (intl && ev !== 'ewc') {
    if (wStreak >= 3) wrote += news(state, rng, 'npeat', { ...ctx, npeat: peat(wStreak), count: word(wStreak) }, [w.id, l.id]) ? 1 : 0;
    else if (wStreak === 2) wrote += news(state, rng, 'b2b', ctx, [w.id, l.id]) ? 1 : 0;
    else if (count === 1 && REAL_COMPLETE[ev]) wrote += news(state, rng, 'first', ctx, [w.id, l.id]) ? 1 : 0;
    if (lStreak >= 2) wrote += news(state, rng, 'dynasty_ends', { ...ctx, team: l.name, short: l.short, oppShort: w.short, npeat: peat(lStreak + 1) }, [w.id, l.id]) ? 1 : 0;
    if (wrote < 2 && prev && samePair(prev, w.id, l.id)) news(state, rng, prev.w === w.id ? 'repeat' : 'revenge', { ...ctx, lastyear: prev.s, year: prev.s }, [w.id, l.id]);
  } else if (!intl && wStreak >= 3) news(state, rng, 'npeat', { ...ctx, npeat: peat(wStreak), count: word(wStreak) }, [w.id, l.id]);
  // our fanbase reacts: rival dynasties hurt, fallen dynasties are fun, first-timers are lovely
  const uctx: Ctx = { ...ctx, short: user.short, team: user.name, champ: w.short, loser: l.short };
  if (rivalry(state, user.id, w.id) && wStreak >= 2 && cool(L, 'wRival', state.date, 20)) posts(state, rng, user, 'leg_world_rival_dynasty', { ...uctx, npeat: peat(wStreak) }, 2);
  else if (lStreak >= 2 && cool(L, 'wFall', state.date, 20)) posts(state, rng, user, 'leg_world_dynasty_falls', { ...uctx, npeat: peat(lStreak + 1) }, rivalry(state, user.id, l.id) ? 2 : 1);
  else if (intl && wStreak >= 3 && cool(L, 'wPeat', state.date, 20)) posts(state, rng, user, 'leg_world_npeat', { ...uctx, npeat: peat(wStreak) }, 1);
  else if (intl && count === 1 && REAL_COMPLETE[ev] && cool(L, 'wFirst', state.date, 20)) posts(state, rng, user, 'leg_world_first', uctx, 1);
}

// ------------------------------------------------------------------ daily
/** From reactions.reactionsDaily: season turn, qualification, final eves, anniversaries, drought talk. */
export function legacyDaily(state: GameState) {
  const user = state.teams[state.userTeamId];
  if (!user) return;
  const L = legacyState(state);
  if (L.flags.day === state.date) return;
  L.flags.day = state.date;
  try { ensureQuirk(); } catch { /* not ready */ }
  const rng = new RNG(hashString(state.date + 'legacy') ^ state.seq);
  reconcileManager(state, L);
  seasonTurn(state, L, rng, user);
  qualified(state, L, rng, user);
  finalEve(state, L, rng, user);
  worldEve(state, L, rng, user);
  anniversary(state, L, rng, user);
  if (weekday(state.date) === 1) {
    droughtTalk(state, L, rng, user);
    const cutoff = addDays(state.date, -800);
    for (const [k, v] of Object.entries(L.flags)) if (/^\d{4}-\d\d-\d\d$/.test(v) && v < cutoff) delete L.flags[k];
  }
}

/** Trophies the manager won (titles not caught by the final hook, e.g. old saves). */
function reconcileManager(state: GameState, L: LegacyState) {
  const team = state.teams[state.userTeamId];
  for (const t of team.titles) {
    if (L.mgr.some((m) => m.comp === t.competition && m.team === team.id)) continue;
    const c = compByName(state, t.competition);
    if (!c || compEv(c) === 'other' || c.endDate < addDays(state.date, -30)) continue; // only fresh ones: older ones predate this manager's tracking
    L.mgr.push({ s: t.season, comp: t.competition, team: team.id, d: c.endDate });
  }
}

function seasonTurn(state: GameState, L: LegacyState, rng: RNG, team: Team) {
  if (L.flags.season === String(state.season)) return;
  const first = L.flags.season === undefined;
  L.flags.season = String(state.season);
  const s = state.season, prev = s - 1;
  const ws = streakBefore(state, team.id, 'worlds', s), ms = streakBefore(state, team.id, 'msi', s);
  const hs = honours(state, team.id);
  const lastYear = hs.filter((h) => h.s === prev && h.ev !== 'cup');
  const recent = hs.filter((h) => h.s >= prev - 2 && h.ev !== 'cup');
  const ctx: Ctx = { season: s, prev };
  if (ws >= 1 || ms >= 1) {
    const ev = ws >= 1 ? 'worlds' : 'msi', n = ws >= 1 ? ws : ms;
    posts(state, rng, team, 'leg_season_defending', { ...ctx, event: EV_LABEL[ev], npeat: peat(n + 1), ...W(n + 1), streak: word(n) }, n >= 2 ? 3 : 2);
    if (!first || n >= 2) ownerMail(state, 'leg_owner_season_defending', { event: EV_LABEL[ev], npeat: peat(n + 1) }, { pri: 1, tone: 1, cd: ['legSeason', 200] });
  } else if (recent.length >= 3) {
    posts(state, rng, team, 'leg_season_dynasty', { ...ctx, count: recent.length, years: 3 }, 2);
    ownerMail(state, 'leg_owner_season_dynasty', { count: recent.length }, { pri: 1, tone: 1, cd: ['legSeason', 200] });
  }
  if (!lastYear.length && !first) {
    const d = trophyDrought(state, team.id, s);
    if (d && d.years >= 2 && d.years < 90 && d.last) {
      posts(state, rng, team, 'leg_season_drought', { ...ctx, years: d.years, lastyear: d.last.s }, 2);
      ownerMail(state, 'leg_owner_season_drought', { years: d.years, lastyear: d.last.s }, { pri: 1, tone: -1, cd: ['legSeason', 200] });
    }
  }
  // the manager's tally at the end of a trophy season
  const mgrLast = L.mgr.filter((m) => m.s === prev).length;
  if (!first && mgrLast >= 2) posts(state, rng, team, 'leg_season_manager', { count: mgrLast, total: L.mgr.length, mgr: state.manager.name || 'the manager', prev }, 1);
}

const QUAL: [string, Ev][] = [['WORLDS', 'worlds'], ['WORLDS-PI', 'worlds'], ['MSI', 'msi'], ['FST', 'fst']];
function qualified(state: GameState, L: LegacyState, rng: RNG, team: Team) {
  const running = Object.values(state.competitions).filter((c) => c.status === 'active' && c.tier === 0 && c.teams.includes(team.id)).map((c) => compEv(c));
  for (const [q, ev] of QUAL) {
    const inList = state.qualified[q]?.some((x) => x.teamId === team.id);
    const inComp = running.includes(ev);
    if ((!inList && !inComp) || !once(L, `q:${state.season}:${ev}`, state.date)) continue;
    const n = streakBefore(state, team.id, ev, state.season);
    const event = EV_LABEL[ev];
    if (n >= 1) {
      posts(state, rng, team, 'leg_qualify_defending', { event, npeat: peat(n + 1), ...W(n + 1), lastyear: state.season - 1 }, n >= 2 ? 3 : 2, { intl: true });
      ownerMail(state, 'leg_owner_defence', { event, npeat: peat(n + 1) }, { pri: 1, tone: 0, cd: ['legDef', 60] });
      // the weight of the crown: expectations up, the nervy ones feel it
      const fm = fanMood(state, team.id);
      fm.expectation = clamp(fm.expectation + 4, 0, 100);
      for (const id of Object.values(team.lineup)) { const p = id ? state.players[id] : undefined; if (p && p.hidden.composure < 45) p.morale = clamp(p.morale - 1.5, 5, 100); }
      continue;
    }
    const seen = (team.history ?? []).filter((h) => compEv(compByName(state, h.competition)) === ev).map((h) => h.season);
    const last = Math.max(0, ...seen.filter((x) => x < state.season));
    if (last && state.season - last >= 2) posts(state, rng, team, 'leg_qualify_return', { event, gap: state.season - last, lastyear: last }, 2, { intl: true });
  }
}

function finalEve(state: GameState, L: LegacyState, rng: RNG, team: Team) {
  const f = nextUserFinal(state, 1);
  if (!f || !once(L, 'eve:' + f.id, state.date)) return;
  const stories = finalStories(state, f, team.id);
  if (!stories.length) return;
  const comp = state.competitions[f.competitionId];
  const intl = INTL.has(compEv(comp));
  let start = rng.int(10 * 60, 13 * 60);
  stories.slice(0, 3).forEach((st, i) => { posts(state, rng, team, st.key, st.ctx, i === 0 ? 2 : 1, { intl, stakes: 1.8, start }); start += rng.int(40, 120); });
  const top = stories[0];
  const opp = state.teams[f.teamA === team.id ? f.teamB! : f.teamA!];
  news(state, rng, 'preview', { ...top.ctx, team: team.name, short: team.short, oppShort: opp?.short, hook: String(top.ctx.hook ?? 'history').replace(/\bour\b/g, 'their') }, [team.id, opp?.id ?? '']);
  ownerMail(state, 'leg_owner_final_eve', { ...top.ctx, hook: String(top.ctx.hook ?? 'history') }, { pri: 1, tone: 1, cd: ['legEve', 20] });
  if (top.w >= 5 && rng.chance(ownerHas(state, 'superstitious') || ownerHas(state, 'publicity') ? 0.7 : 0.35)) ownerAsk(state, 'leg_parade', rng);
}

/** Other teams' international finals: a preview headline when history is on the line. */
function worldEve(state: GameState, L: LegacyState, rng: RNG, user: Team) {
  const tomorrow = addDays(state.date, 1);
  for (const f of activeFinals(state)) {
    if (!f.teamA || !f.teamB || f.teamA === user.id || f.teamB === user.id || f.date < state.date || f.date > tomorrow) continue;
    const comp = state.competitions[f.competitionId];
    const ev = compEv(comp);
    if (!INTL.has(ev) || ev === 'ewc' || !once(L, 'weve:' + f.id, state.date)) continue;
    const a = finalStories(state, f, f.teamA)[0], b = finalStories(state, f, f.teamB)[0];
    const top = !a ? b : !b ? a : a.w >= b.w ? a : b;
    if (!top || top.w < 4) continue;
    const side = top === a ? f.teamA : f.teamB;
    const t = state.teams[side], o = state.teams[side === f.teamA ? f.teamB : f.teamA];
    news(state, rng, 'preview', { ...top.ctx, team: t.name, short: t.short, oppShort: o.short, hook: String(top.ctx.hook ?? 'history').replace(/\bour\b/g, 'their') }, [t.id, o.id]);
  }
}

function anniversary(state: GameState, L: LegacyState, rng: RNG, team: Team) {
  const md = state.date.slice(5), y = Number(state.date.slice(0, 4));
  const wins = allFinals(state).filter((f) => f.w === team.id && f.d.slice(5) === md && (INTL.has(f.ev) && f.ev !== 'ewc'));
  for (const f of wins) {
    const ago = y - f.s;
    if (ago < 1 || (ago > 3 && ago % 5 !== 0) || !once(L, `ann:${f.key}:${f.s}:${y}`, state.date)) continue;
    const ya = ago === 1 ? 'one year' : `${word(ago)} years`;
    posts(state, rng, team, 'leg_anniversary', { yearsago: ya, Yearsago: ya[0].toUpperCase() + ya.slice(1), year: f.s, event: EV_LABEL[f.ev], oppShort: nameThen(state, f, f.l), lastscore: f.sc, then: nameThen(state, f, team.id) }, rng.int(1, 2), { start: rng.int(8 * 60, 11 * 60) });
    return; // one a day
  }
}

function droughtTalk(state: GameState, L: LegacyState, rng: RNG, team: Team) {
  const wonThisSeason = honours(state, team.id).some((h) => h.s === state.season && h.ev !== 'cup');
  const d = wonThisSeason ? null : trophyDrought(state, team.id, state.season);
  if (d && d.years >= 2 && d.years < 90 && d.last && rng.chance(0.4) && cool(L, 'drought', state.date, 75)) {
    posts(state, rng, team, 'leg_drought', { years: d.years, lastyear: d.last.s, last: d.last.name }, rng.int(1, 2));
    return;
  }
  // the domestic itch of an international dynasty (T1: Worlds after Worlds, no LCK title since 2022)
  const dom = lastDomestic(state, team.id, team.leagueId, state.date);
  const intl = honours(state, team.id).filter((h) => INTL.has(h.ev) && h.s >= state.season - 3).length;
  if (dom && state.season - dom.s >= 3 && intl >= 2 && rng.chance(0.3) && cool(L, 'domItch', state.date, 90)) posts(state, rng, team, 'leg_dom_drought', { years: state.season - dom.s, lastyear: dom.s, league: state.leagues[team.leagueId]?.name ?? 'league', count: intl }, 1);
}

// ------------------------------------------------------------------ live chat (LiveChat.tsx)
export interface LegacyChat { start: string[]; win: string; loss: string; ctx: Ctx; final: boolean }
/** Chat categories for the user's series: storylines of a final (or a revenge match in a big series). */
export function legacyChat(state: GameState, f: MatchFixture | undefined): LegacyChat | null {
  if (!f || !f.teamA || !f.teamB) return null;
  const me = state.userTeamId;
  if (f.teamA !== me && f.teamB !== me) return null;
  const comp = state.competitions[f.competitionId];
  const ev = compEv(comp);
  if (ev === 'other' || ev === 'cup') return null;
  if (isFinalFixture(state, f)) {
    const st = finalStories(state, f, me);
    if (!st.length) return { start: [], win: 'leg_chat_title_win', loss: 'leg_chat_final_loss', ctx: { event: evName(state, ev, comp) }, final: true };
    const start = [...new Set(st.slice(0, 2).map((x) => x.chat))];
    return { start, win: st[0].win, loss: st[0].loss, ctx: Object.assign({}, ...st.slice(0, 3).reverse().map((x) => x.ctx)), final: true };
  }
  // a big series against the team that beat us in our last final
  const big = comp && (comp.tier === 0 || comp.kind === 'playoffs');
  const oppId = f.teamA === me ? f.teamB : f.teamA;
  const last = [...allFinals(state)].reverse().find((x) => inFinal(x, me));
  if (big && last && last.w === oppId && state.season - last.s <= 2) return { start: ['leg_chat_revenge_start'], win: 'leg_chat_revenge_win', loss: 'leg_chat_repeat_loss', ctx: { year: last.s, lastscore: last.sc, lastevent: INTL.has(last.ev) ? EV_LABEL[last.ev] : 'final', event: evName(state, ev, comp) }, final: false };
  return null;
}
