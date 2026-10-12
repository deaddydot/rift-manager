// AI squad building: how computer-run clubs replace departures, upgrade weak spots and keep sane rosters.
//
//   - Every starter who leaves an AI club (sold, released, contract ended, poached by the user) is noted as a
//     *need* for that role at the level of the player who left (movePlayer → noteDeparture); an empty lineup slot
//     is an urgent need too (daily scan). A need is worked on 1–3 days later (the next day late in a window, at
//     once when nobody can play the role and a match is within two days).
//   - The club ranks a shortlist for the role: its own subs, its academy (promotion, also outside windows), free
//     agents, and — only in a window — players at other clubs. Utility = level at the role (secondary roles −5;
//     unknown fictional free agents rated a little lower, so they stay depth options) − regional fit (an LCK club
//     fields Koreans, the LPL takes Korean imports…) + youth/potential − age − transfer hassle − fee share of the
//     club's wallet (balance, payroll, aiBudget, urgency). It goes down the list until the deal works: the salary
//     fits, the selling club gets its price and the player wants the move (interest() for free agents — stars
//     expect a club near their level — and bidStance() for players under contract; near misses get +30% salary).
//   - Sellers: starters go to bigger clubs (more prestige / a higher league) at the asking fee plus premiums
//     (same league, rival, late or mid-season); to peers, when the seller can't see a replacement, already sold a
//     starter this window, or the window is about to shut, only for the release clause — and then the player must
//     push for it. Nobody else leaves a club that sold two starters.
//   - It doesn't settle far below the level it lost while time remains (the tolerance widens each day); an empty
//     slot with a match close, or a shut / closing window, forces the best available option (a forced stopgap far
//     below the level keeps the search open while the window is). The selling club has a hole of its own (domino):
//     one link down it can't raid peers, from the third link it only signs free agents / academy / substitutes.
//   - Weekly in windows: the best free agents choose among the clubs that would start them (player's choice),
//     lineups re-sorted by level, the odd upgrade at the weakest role (bigger clubs first, at most two a window), a
//     cheap sub for thin tier-1/2 rosters in the off-season, no 3rd player at a role, rosters capped at 8 / 7
//     (young surplus goes down to the academy).
// Market lists (per role, sorted by level) are built lazily once per pass. State lives in `state.aiSquad`
// (needs + per-window counters); AI_MOVES / AI_TRACE are debug hooks (scripts/debug/aimarket.ts).
import type { GameState, Player, Team, Role } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { overall, ageOn } from '../setup';
import { worldLevels } from '../ratings';
import { addNews } from './news';
import { addLedger, payrollYearly } from './finance';
import { salaryDemand, askingFee, interest, movePlayer, autoFillLineup, inTransferWindow, windowKey, regionOfCountry, fmtK } from './transfers';
import { bidStance } from './bidTalks';
import { rivalry } from './fans';
import { addDays, daysBetween } from '../season/formats';

// ------------------------------------------------------------------ state
export interface AiNeed {
  role: Role;
  level: number;          // level the club wants back (the departed starter's, or its lineup average)
  since: string;
  due: string;            // next date the club works on it
  lost?: string;          // departed player
  lostHandle?: string;
  to?: string | null;     // where he went (null = released / free agent)
  tries: number;
  depth?: number;         // domino depth: 0 = first hole, n = sold to fill the hole of a club at depth n-1
}
interface AiSquadState {
  needs: Record<string, AiNeed[]>;
  win: string;                    // window key the counters below belong to ('closed' between windows)
  moved: Record<string, 1>;       // players who changed clubs in this window (not for sale again)
  sold: Record<string, number>;   // starters sold per club this window
  buys: Record<string, number>;   // upgrade signings per club this window
  released?: Record<string, string>; // player → the club that let him go this window (it won't re-sign him)
}
type WithAI = GameState & { aiSquad?: AiSquadState };

function aiState(state: GameState): AiSquadState {
  const s = state as WithAI;
  const key = windowKey(state.date) ?? 'closed';
  const a = (s.aiSquad ??= { needs: {}, win: key, moved: {}, sold: {}, buys: {} });
  if (a.win !== key) { a.win = key; a.moved = {}; a.sold = {}; a.buys = {}; a.released = {}; }
  return a;
}
const dropNeed = (a: AiSquadState, teamId: string, role: Role) => {
  const list = a.needs[teamId];
  if (!list) return;
  a.needs[teamId] = list.filter((n) => n.role !== role);
  if (!a.needs[teamId].length) delete a.needs[teamId];
};
/** Open needs of an AI club (UI / debug). */
export const aiNeeds = (state: GameState, teamId: string): AiNeed[] => (state as WithAI).aiSquad?.needs[teamId] ?? [];
/** Roles some AI club is currently trying to fill (incoming bids for the user's players lean on these). */
export function neededRoles(state: GameState): Set<Role> {
  const out = new Set<Role>();
  for (const list of Object.values((state as WithAI).aiSquad?.needs ?? {})) for (const n of list) out.add(n.role);
  return out;
}

/** Debug / tooling log of AI squad moves (module memory, not saved). */
export interface AiMove {
  date: string; team: string; player: string; handle: string; ovr: number; role: Role;
  kind: 'replace' | 'fill' | 'upgrade' | 'depth' | 'release' | 'demote';
  source: 'fa' | 'sub' | 'academy' | 'buy' | 'out'; from?: string; fee: number; replaces?: string; prevOvr?: number;
  depth?: number; clause?: boolean;
}
export const AI_MOVES: AiMove[] = [];
/** Debug: set `team` to a club id to trace its shortlists and why candidates were passed over. */
export const AI_TRACE: { team?: string; out: string[] } = { out: [] };
const logMove = (m: AiMove) => { AI_MOVES.push(m); if (AI_MOVES.length > 3000) AI_MOVES.splice(0, 1000); };

let departures = 0; // starter departures noted (lets the daily pass rescan after its own deals)
let moves = 0;      // any departure (lineups only change through moves; the daily scan skips quiet days)
/** movePlayer hook, before the player leaves `from`: a departing AI starter leaves a need at his slot. */
export function noteDeparture(state: GameState, from: Team, p: Player, to: Team | null) {
  moves++;
  if (from.id === state.userTeamId || !state.teams[from.id]) return;
  if (!to) (aiState(state).released ??= {})[p.id] = from.id;
  const role = ROLES.find((r) => from.lineup[r] === p.id);
  if (!role) return; // a sub leaving leaves no hole
  departures++;
  const a = aiState(state);
  const list = (a.needs[from.id] ??= []);
  const level = overall(p.attributes, role);
  const ex = list.find((n) => n.role === role);
  if (ex) { ex.level = Math.max(ex.level, level); return; }
  const closing = inTransferWindow(state.date) && windowDaysLeft(state.date) <= 10; // little time left: act tomorrow
  const delay = closing ? 1 : 1 + (hashString(from.id + p.id) % 3);
  // sold to a club that was itself replacing someone at this role: one link further down the domino
  const up = to && to.id !== state.userTeamId ? a.needs[to.id]?.find((n) => n.role === role) : undefined;
  list.push({ role, level, since: state.date, due: addDays(state.date, delay), lost: p.id, lostHandle: p.handle, to: to?.id ?? null, tries: 0, depth: up ? (up.depth ?? 0) + 1 : 0 });
}
/** movePlayer hook, after the player joined `to`: he can't be resold this window; a newcomer who starts settles the need. */
export function noteArrival(state: GameState, to: Team, p: Player) {
  const a = aiState(state);
  a.moved[p.id] = 1;
  if (!a.needs[to.id]) return;
  const role = ROLES.find((r) => to.lineup[r] === p.id);
  if (role) dropNeed(a, to.id, role);
}

// ------------------------------------------------------------------ helpers
const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
const isStarter = (team: Team, id: string) => ROLES.some((r) => team.lineup[r] === id);
function starterOf(state: GameState, team: Team, r: Role): Player | undefined {
  const id = team.lineup[r];
  const p = id ? state.players[id] : undefined;
  return p && p.teamId === team.id && !p.retired ? p : undefined;
}
const DEFAULT_LEVEL: Record<number, number> = { 1: 68, 2: 52, 3: 42 };
/** Average level of a club's starters (optionally without one role). */
export function teamLevel(state: GameState, team: Team, skip?: Role): number {
  let s = 0, n = 0;
  for (const r of ROLES) {
    if (r === skip) continue;
    const p = starterOf(state, team, r);
    if (p) { s += overall(p.attributes, r); n++; }
  }
  return n ? s / n : DEFAULT_LEVEL[tierOf(state, team)] ?? 42;
}
function fixSubs(state: GameState, team: Team) {
  for (const id of team.roster) { const p = state.players[id]; if (p) p.isSub = !isStarter(team, id); }
}
const ROLE_NOUN: Record<Role, string> = { top: 'top laner', jungle: 'jungler', mid: 'mid laner', adc: 'bot laner', support: 'support' };
/** Unknown fictional free agents are scouted for two weeks first; leftovers of an earlier window are about to go. */
const freshGen = (state: GameState, p: Player) => !!p.generated && (addDays(p.generated, 14) > state.date || windowKey(p.generated) !== windowKey(state.date));
const unknown = (p: Player) => !!p.generated && !p.career.length;

const homeOf = (p: Player) => (/north america/i.test(p.country) ? 'NA' : regionOfCountry(p.country));
/**
 * Cheap first read of whether a player under contract would even consider the move (the stature, league,
 * home/abroad and playing-time parts of bidStance); clubs don't waste calls on stars who'd never come.
 */
function quickPull(state: GameState, p: Player, owner: Team, buyer: Team, starterThere: boolean, wouldStart: boolean): number {
  let v = clamp((buyer.prestige - owner.prestige) / 70 + (tierOf(state, owner) - tierOf(state, buyer)) * 0.22, -0.4, 0.45);
  const home = homeOf(p);
  if (home !== owner.region && home === buyer.region) v += 0.3;
  else if (home === owner.region && home !== buyer.region) v -= 0.28;
  if (!starterThere && wouldStart) v += 0.28;
  else if (starterThere && !wouldStart) v -= 0.22;
  return v;
}
/**
 * A free agent's willingness to sign: interest(), but a player well above the club's level, or good enough for a
 * higher league, wants a bigger stage (a released LCK starter doesn't join a tier-2 side the next morning).
 */
function faInterest(state: GameState, p: Player, team: Team, ovr: number): number {
  const lv = worldLevels(state);
  const expects = ovr >= lv.t1 + 2 ? 1 : ovr >= lv.t2 + 8 ? 2 : 3;
  return interest(state, p, team) - Math.max(0, tierOf(state, team) - expects) * 0.25 - Math.max(0, ovr - teamLevel(state, team) - 4) * 0.04;
}
/** Utility malus for a player from another region / language (LCK clubs field Koreans, LPL a few Korean imports…). */
function fitPenalty(team: Team, p: Player): number {
  const home = homeOf(p);
  const t = team.region;
  if (home === t) return t === 'APAC' && team.country && p.country !== team.country ? 3 : 0;
  if (t === 'KR') return 8;
  if (home === 'KR') return t === 'CN' ? 1 : 2;
  if (t === 'CN') return 6;
  if ((t === 'NA' && home === 'EMEA') || (t === 'EMEA' && home === 'NA')) return 1.5;
  return 4;
}

// ------------------------------------------------------------------ market (built once per pass)
interface Entry { p: Player; ovr: number }
interface Market {
  inWindow: boolean; mid: boolean; daysLeft: number;
  groups: Record<Role, Player[]>;
  lists: Partial<Record<Role, Entry[]>>;
  faLists: Partial<Record<Role, Entry[]>>;
  ages: Map<string, number>;
  academies: Record<string, string[]>;   // parent id → academy team ids
  taken: Set<string>;                    // moved during this pass
  pending: Set<string>;                  // the user has an offer out for them
  next: Record<string, string> | null;   // team → next fixture date (lazy)
}
function windowDaysLeft(date: string): number {
  const key = windowKey(date);
  if (!key) return 0;
  const [y, kind] = key.split('-');
  return daysBetween(date, kind === 'off' ? `${Number(y) + 1}-01-15` : `${y}-06-30`);
}
function newMarket(state: GameState): Market {
  const groups = { top: [], jungle: [], mid: [], adc: [], support: [] } as Record<Role, Player[]>;
  for (const p of Object.values(state.players)) {
    if (p.retired || p.teamId === state.userTeamId || p.id.startsWith('standin_')) continue;
    groups[p.role].push(p);
    if (p.secondaryRoles) for (const r of p.secondaryRoles) if (r !== p.role && groups[r]) groups[r].push(p);
  }
  const academies: Record<string, string[]> = {};
  for (const t of Object.values(state.teams)) if (t.parentTeamId && state.teams[t.parentTeamId]) (academies[t.parentTeamId] ??= []).push(t.id);
  const pending = new Set<string>();
  for (const o of state.transferOffers) if (o.status === 'pending' && o.direction === 'outgoing') pending.add(o.playerId);
  return { inWindow: inTransferWindow(state.date), mid: !!windowKey(state.date)?.endsWith('-mid'), daysLeft: windowDaysLeft(state.date), groups, lists: {}, faLists: {}, ages: new Map(), academies, taken: new Set(), pending, next: null };
}
const ageOf = (state: GameState, mk: Market, p: Player) => {
  let a = mk.ages.get(p.id);
  if (a === undefined) { a = ageOn(p.birthdate, state.date) ?? 22; mk.ages.set(p.id, a); }
  return a;
};
/** Free agents who can play `r`, best first. */
const faList = (mk: Market, r: Role): Entry[] => (mk.faLists[r] ??= roleList(mk, r).filter((e) => !e.p.teamId));
/** Everyone who can play `r`, best first (secondary roles at −5, like the match engine's off-role malus). */
const roleList = (mk: Market, r: Role): Entry[] =>
  (mk.lists[r] ??= mk.groups[r].map((p) => ({ p, ovr: overall(p.attributes, r) - (p.role === r ? 0 : 5) })).sort((a, b) => b.ovr - a.ovr));
let nextCache: { date: string; season: number; map: Record<string, string> } | null = null;
function daysToMatch(state: GameState, mk: Market, teamId: string): number {
  if (!mk.next) {
    if (!nextCache || nextCache.date !== state.date || nextCache.season !== state.season) {
      const map: Record<string, string> = {};
      const put = (t: string | null | undefined, d: string) => { if (t && (!map[t] || d < map[t])) map[t] = d; };
      for (const f of Object.values(state.fixtures)) if (!f.result && f.date >= state.date) { put(f.teamA, f.date); put(f.teamB, f.date); }
      // stages / competitions whose fixtures don't exist yet (created when they start)
      for (const c of Object.values(state.competitions)) {
        if (c.status === 'done') continue;
        if (c.startDate >= state.date) for (const t of c.teams) put(t, c.startDate);
        for (const st of c.stages) if (st.status === 'pending' && st.startDate >= state.date) for (const t of st.teams) put(t, st.startDate);
      }
      nextCache = { date: state.date, season: state.season, map };
    }
    mk.next = nextCache.map;
  }
  const d = mk.next[teamId];
  return d ? daysBetween(state.date, d) : 99;
}
/** Best level a club could put at `role` without buying: its other players there, its academy, a known free agent. */
function cheapCover(state: GameState, mk: Market, team: Team, role: Role, except: string): number {
  let best = 0;
  const at = (p: Player | undefined) => (p && !p.retired && p.id !== except && !mk.taken.has(p.id) && (p.role === role || p.secondaryRoles?.includes(role)) ? overall(p.attributes, role) - (p.role === role ? 0 : 5) : 0);
  for (const id of team.roster) if (!isStarter(team, id)) best = Math.max(best, at(state.players[id]));
  for (const aid of mk.academies[team.id] ?? []) for (const id of state.teams[aid]?.roster ?? []) best = Math.max(best, at(state.players[id]));
  for (const e of faList(mk, role)) {
    if (e.ovr <= best) break;
    const p = e.p;
    if (p.teamId || p.id === except || mk.taken.has(p.id)) continue;
    best = Math.max(best, e.ovr - (unknown(p) ? 5 : 0) - fitPenalty(team, p));
  }
  return best;
}

// ------------------------------------------------------------------ the selling club
/** Clubs let starters go to bigger clubs (more prestige, or a higher league), not to peers. */
const isStepUp = (state: GameState, buyer: Team, owner: Team) => buyer.prestige >= owner.prestige + 5 || tierOf(state, buyer) < tierOf(state, owner);
/** What an AI club wants for one of its players (Infinity = not for sale); `clause` = only the release clause. */
function sellerFee(state: GameState, mk: Market, p: Player, owner: Team, buyer: Team, ovr: number): { fee: number; clause: boolean } {
  const base = askingFee(state, p, owner);
  if (!isStarter(owner, p.id)) return { fee: base, clause: false };
  const a = aiState(state);
  const buyout = p.contract?.buyout ?? 0;
  const sold = a.sold[owner.id] ?? 0;
  if (sold >= 2) return { fee: Infinity, clause: true }; // the squad is being gutted: nobody else leaves
  const covered = cheapCover(state, mk, owner, p.role, p.id) >= ovr - 8;
  // only the release clause will do when: it already lost a starter this window, the window is about to shut (no
  // time to replace him), it can't see a replacement, or the buyer isn't a step up (clubs sell their starters to
  // bigger clubs, not to peers). A clause move also needs the player to push for it (fillRole).
  const stepUp = isStepUp(state, buyer, owner);
  if (sold >= 1 || !stepUp || mk.daysLeft <= 4 || !covered) return { fee: buyout || Infinity, clause: true };
  let prem = 1.1;
  if (owner.leagueId === buyer.leagueId) prem += 0.2;
  if (rivalry(state, owner.id, buyer.id)) prem += 0.25;
  if (mk.daysLeft <= 5) prem += 0.2;
  if (mk.mid) prem += 0.15;
  return { fee: Math.round(Math.min(base * prem, buyout || Infinity) / 5000) * 5000, clause: false };
}

// ------------------------------------------------------------------ shortlist & signing
type Kind = 'fa' | 'sub' | 'academy' | 'buy';
interface Cand { p: Player; ovr: number; q: number; u: number; kind: Kind; owner?: Team; fee: number }
interface FillOpts { mode: 'replace' | 'fill' | 'upgrade' | 'depth'; target: number; tol: number; forced?: boolean; minGain?: number; need?: AiNeed }
const MIN_ROOM: Record<number, number> = { 1: 150_000, 2: 25_000, 3: 8_000 };
const contractYears = (age: number, pot: number, ovr: number) => (age <= 22 && pot - ovr >= 20 ? 3 : age >= 28 ? 1 : 2);

/** Find and sign the best realistic player for `role`. Returns true when someone was signed / promoted. */
function fillRole(state: GameState, rng: RNG, mk: Market, team: Team, role: Role, o: FillOpts): boolean {
  const a = aiState(state);
  const tier = tierOf(state, team);
  const cur = starterOf(state, team, role);
  const curOvr = o.mode === 'depth' ? 0 : cur ? overall(cur.attributes, role) : 0;
  const urgent = !cur && o.mode !== 'depth';
  const minGain = o.minGain ?? 1;
  const payroll = payrollYearly(state, team);
  const urg = o.mode === 'upgrade' ? 0.6 : o.mode === 'depth' ? 0.1 : urgent ? 1.5 : 1.2;
  const depth = o.need?.depth ?? 0;
  const wallet = (Math.max(0, team.balance - payroll * 0.35) * 0.35 * team.aiBudget * urg) / (1 + depth * 0.35);
  const room = Math.max(MIN_ROOM[tier] ?? 8_000, (team.balance - payroll * 0.25) * 0.3 * team.aiBudget * (urgent ? 1.3 : 1)) * (o.mode === 'depth' ? 0.35 : 1);
  const acad = mk.academies[team.id] ?? [];
  const floor = o.forced || o.mode === 'upgrade' ? -Infinity : o.target - o.tol;
  const short: Cand[] = [];
  const stop = (e: Entry) => e.ovr + 4 < curOvr + minGain || e.ovr < floor; // lists are sorted: nobody further down helps
  const consider = (e: Entry, kind: Kind, owner?: Team, fee = 0, lateral = false) => {
    const p = e.p;
    if (mk.taken.has(p.id) || mk.pending.has(p.id) || p.retired || p.id === o.need?.lost || a.released?.[p.id] === team.id) return;
    let q = e.ovr;
    if (unknown(p)) {
      if (!urgent && freshGen(state, p)) return;
      q -= tier === 1 ? 5 : tier === 2 ? 3 : 1;
    }
    const fit = fitPenalty(team, p) * (tier === 1 ? 1 : 1.4);
    // the level it holds out for is what he'd bring here (an import costs a little: language, adaptation)
    if (q < curOvr + minGain || q - fit < floor) return;
    const age = ageOf(state, mk, p);
    let u = q - fit;
    if (age < 22) u += clamp((p.hidden.potential - e.ovr) * 0.05, 0, 3) * (urgent ? 0.5 : o.mode === 'depth' ? 2 : 1);
    if (age >= 28) u -= (age - 27) * 0.5;
    if (kind === 'sub') u += 1; else if (kind === 'academy') u += 1.5;
    if (kind === 'buy') u -= 1.5 + depth * 1.5 + (lateral ? 3 : 0) + (5 * fee) / Math.max(1, wallet); // a transfer is hassle; deeper in a domino, more so
    short.push({ p, ovr: e.ovr, q, u, kind, owner, fee });
  };
  const atRole = (p: Player | undefined): Entry | null =>
    p && !p.retired && (p.role === role || p.secondaryRoles?.includes(role)) ? { p, ovr: overall(p.attributes, role) - (p.role === role ? 0 : 5) } : null;
  if (o.mode !== 'depth') {
    // own substitutes, then the academy (promotion is allowed in or out of a window)
    for (const id of team.roster) { const e = atRole(state.players[id]); if (e && !isStarter(team, id) && !stop(e)) consider(e, 'sub'); }
    for (const aid of acad) {
      const at = state.teams[aid];
      if (at) for (const id of at.roster) { const e = atRole(state.players[id]); if (e && e.p.teamId === aid && !stop(e)) consider(e, 'academy', at); }
    }
  }
  // free agents
  let n = 0;
  for (const e of faList(mk, role)) {
    if (stop(e) || n >= 24) break;
    if (e.p.teamId) continue; // signed earlier in this pass
    const before = short.length;
    consider(e, 'fa');
    if (short.length > before) n++;
  }
  // players at other clubs: only in a window
  if (mk.inWindow && o.mode !== 'depth') {
    n = 0;
    for (const e of roleList(mk, role)) {
      if (stop(e) || n >= 24) break;
      const p = e.p;
      if (!p.teamId || p.teamId === team.id || p.teamId === state.userTeamId || a.moved[p.id] || mk.taken.has(p.id)) continue;
      const owner = state.teams[p.teamId];
      if (!owner || acad.includes(owner.id) || team.parentTeamId === owner.id) continue;
      const st = isStarter(owner, p.id);
      if (st && tierOf(state, owner) < tier) continue; // a bigger league's starter won't step down
      if (st && o.mode === 'upgrade' && mk.daysLeft <= 4) continue; // no deadline-day raids for a mere upgrade
      if (quickPull(state, p, owner, team, st, e.ovr >= curOvr - 1) < -0.3) continue; // he'd never come
      // prising a starter from a peer takes the release clause: a last resort, and never in a domino; from the
      // third link on, clubs make do with free agents, their academy or other clubs' substitutes (chains stay short)
      const lateral = st && !isStepUp(state, team, owner);
      if (st && (depth >= 2 || (lateral && depth >= 1))) continue;
      const fee = Math.min(p.value * (st ? 1.25 : 0.85) * 1.1, p.contract?.buyout || Infinity); // ≈ askingFee (exact price later)
      if (fee > wallet) continue;
      const before = short.length;
      consider(e, 'buy', owner, fee, lateral);
      if (short.length > before) n++;
    }
  }
  const trace = AI_TRACE.team === team.id ? (t: string) => AI_TRACE.out.push(`${state.date} ${team.short} ${role} ${o.mode}: ${t}`) : null;
  trace?.(`cur ${cur?.handle ?? '-'} ${curOvr}, target ${o.target}±${o.tol}${o.forced ? ' forced' : ''}, wallet ${fmtK(wallet)}, room ${fmtK(room)}, ${short.length} shortlisted`);
  if (!short.length) return false;
  short.sort((x, y) => y.u - x.u);
  let checks = 0;
  for (const c of short) {
    if (c.kind === 'buy' && ++checks > 20) continue; // calls to other clubs are limited; free agents & own players always get a look
    const p = c.p;
    const tag = `${p.handle} ${c.ovr} ${c.kind}${c.owner ? '@' + c.owner.short : ''} u=${c.u.toFixed(1)}`;
    let salary = 0, fee = 0, clause = false;
    if (c.kind !== 'sub') {
      salary = Math.round((salaryDemand(state, p, team) * (urgent && c.kind !== 'academy' ? 1.1 : 1)) / 1000) * 1000;
      if (salary > room && !(o.forced && c.kind === 'fa')) { trace?.(`  ${tag}: salary ${fmtK(salary)} > room`); continue; }
    }
    if (c.kind === 'fa') {
      const it = faInterest(state, p, team, c.ovr) + (rng.next() - 0.5) * 0.1;
      if (it < (o.forced ? 0.12 : 0.3)) { trace?.(`  ${tag}: not interested (${it.toFixed(2)})`); continue; }
    } else if (c.kind === 'buy') {
      const sf = sellerFee(state, mk, p, c.owner!, team, c.ovr);
      fee = sf.fee;
      if (!(fee <= wallet)) { trace?.(`  ${tag}: ${c.owner!.short} want ${fee === Infinity ? 'no sale' : fmtK(fee)} (ask ${fmtK(c.fee)})`); continue; }
      const st = isStarter(c.owner!, p.id);
      // against the club's will (release clause) the player has to push for it
      const need = !st ? -0.2 : sf.clause ? (o.mode === 'upgrade' ? 0.3 : 0.2) : 0.02, noise = (rng.next() - 0.5) * 0.16;
      clause = sf.clause;
      let v = bidStance(state, p, team, salary).v + noise;
      // a club that really needs him sweetens the offer for a near miss (+30% salary, if it fits)
      if (v < need && v >= need - 0.15 && o.mode !== 'upgrade' && salary * 1.3 <= room) {
        salary = Math.round((salary * 1.3) / 1000) * 1000;
        v = bidStance(state, p, team, salary).v + noise;
      }
      if (v < need) { trace?.(`  ${tag}: player says no (${v.toFixed(2)}) fee ${fmtK(fee)}`); continue; }
    }
    trace?.(`  ${tag}: SIGNED fee ${fmtK(fee)}${clause ? ' (release clause)' : ''} salary ${fmtK(salary)}`);
    sign(state, mk, team, c, role, salary, fee, o, clause);
    return true;
  }
  return false;
}

function sign(state: GameState, mk: Market, team: Team, c: Cand, role: Role, salary: number, fee: number, o: FillOpts, clause = false) {
  const a = aiState(state);
  const p = c.p;
  const from = p.teamId && p.teamId !== team.id ? state.teams[p.teamId] : undefined;
  const fromStarter = from ? isStarter(from, p.id) : false;
  const prev = starterOf(state, team, role);
  const age = ageOn(p.birthdate, state.date) ?? 22;
  if (c.kind === 'sub') {
    for (const r of ROLES) if (team.lineup[r] === p.id) team.lineup[r] = null;
    team.lineup[role] = p.id;
  } else {
    movePlayer(state, p, team, salary, contractYears(age, p.hidden.potential, c.ovr), fee);
    for (const r of ROLES) if (r !== role && team.lineup[r] === p.id) team.lineup[r] = null;
    if (o.mode !== 'depth') team.lineup[role] = p.id;
  }
  autoFillLineup(state, team);
  fixSubs(state, team);
  mk.taken.add(p.id);
  if (from && fromStarter && c.kind === 'buy') a.sold[from.id] = (a.sold[from.id] ?? 0) + 1;
  if (o.mode === 'upgrade') a.buys[team.id] = (a.buys[team.id] ?? 0) + 1;
  const n = o.need;
  logMove({ date: state.date, team: team.id, player: p.id, handle: p.handle, ovr: c.ovr, role, kind: o.mode, source: c.kind, from: from?.id, fee, replaces: n?.lost, prevOvr: o.mode === 'replace' || o.mode === 'fill' ? n?.level : prev ? overall(prev.attributes, role) : undefined, depth: n?.depth, clause });
  newsFor(state, team, p, role, c.kind, from, fee, o, prev, clause);
  tidy(state, mk, team);
}

function newsFor(state: GameState, team: Team, p: Player, role: Role, kind: Kind, from: Team | undefined, fee: number, o: FillOpts, prev?: Player, clause = false) {
  const tier = tierOf(state, team);
  const ovr = overall(p.attributes, role);
  const notable = tier === 1 || (from && tierOf(state, from) === 1) || fee >= 150_000 || ovr >= worldLevels(state).t1 + 6;
  if (!notable || (o.mode === 'depth' && tier > 1)) return;
  const n = o.need;
  const lost = n?.lostHandle;
  const dest = n?.to ? state.teams[n.to] : undefined;
  const exit = lost ? (dest ? `${lost}’s move to ${dest.name}` : `${lost}’s departure`) : '';
  const age = Math.floor(ageOn(p.birthdate, state.date) ?? 0);
  const who = `${age ? `the ${age}-year-old ` : ''}${ROLE_NOUN[role]}`;
  const ids = [team.id, ...(from ? [from.id] : []), ...(dest ? [dest.id] : [])];
  const pids = [p.id, ...(n?.lost ? [n.lost] : [])];
  let headline: string, body: string;
  if (kind === 'buy' && from) {
    headline = `${team.short} sign ${p.handle} from ${from.short}${lost ? ` as ${lost}’s replacement` : ''}`;
    body = `${team.name} ${clause ? `trigger ${p.handle}’s $${fmtK(fee)} release clause at ${from.name}` : `pay ${from.name} a reported $${fmtK(fee)} for ${p.handle}`}, ${who}${exit ? `, to fill the hole left by ${exit}` : o.mode === 'upgrade' && prev ? `, an upgrade on ${prev.handle}` : ''}.`;
  } else if (kind === 'academy' && from) {
    headline = `${team.short} promote ${p.handle} from ${from.short}${lost ? ` to replace ${lost}` : ''}`;
    body = `${team.name} call up ${who} ${p.handle} from their academy${exit ? ` after ${exit}` : ''}.`;
  } else if (kind === 'sub') {
    if (tier > 1) return;
    headline = `${p.handle} steps into ${team.short}’s starting lineup`;
    body = `${team.name} hand the ${ROLE_NOUN[role]} spot to ${p.handle}${exit ? ` after ${exit}` : ''}.`;
  } else if (o.mode === 'depth') {
    headline = `${team.short} add ${p.handle} as a substitute`;
    body = `${team.name} sign free agent ${p.handle} (${ROLE_NOUN[role]}) for depth.`;
  } else {
    headline = `${team.short} sign free agent ${p.handle}${lost ? ` to replace ${lost}` : ''}`;
    body = `${team.name} sign ${who} ${p.handle}${exit ? ` after ${exit}` : prev && o.mode === 'upgrade' ? `, an upgrade on ${prev.handle}` : ''}.`;
  }
  addNews(state, { headline, body, tags: ['transfer'], teamIds: ids, playerIds: pids });
}

// ------------------------------------------------------------------ roster hygiene
function letGo(state: GameState, mk: Market, team: Team, p: Player, depth: number) {
  const age = ageOn(p.birthdate, state.date) ?? 22;
  const ovr = overall(p.attributes, p.role);
  const acad = (mk.academies[team.id] ?? []).map((id) => state.teams[id]).find((t) => t && t.roster.length < 7 && t.id !== state.userTeamId);
  mk.taken.add(p.id);
  if (acad && age <= 22 && depth < 1) {
    movePlayer(state, p, acad, salaryDemand(state, p, acad), 1);
    fixSubs(state, acad);
    logMove({ date: state.date, team: acad.id, player: p.id, handle: p.handle, ovr, role: p.role, kind: 'demote', source: 'out', from: team.id, fee: 0 });
    tidy(state, mk, acad, depth + 1);
    return;
  }
  const remaining = p.contract ? Math.max(0, daysBetween(state.date, p.contract.expires) / 365) * p.contract.salary : 0;
  addLedger(state, team, 'Contract termination', -Math.round(remaining * 0.3), p.handle);
  movePlayer(state, p, null, 0, 0);
  logMove({ date: state.date, team: team.id, player: p.id, handle: p.handle, ovr, role: p.role, kind: 'release', source: 'out', fee: 0 });
  if (tierOf(state, team) === 1 && ovr >= worldLevels(state).t1 + 6) addNews(state, { headline: `${team.short} release ${p.handle}`, body: `${team.name} part ways with ${ROLE_NOUN[p.role]} ${p.handle}, who becomes a free agent.`, tags: ['transfer'], teamIds: [team.id], playerIds: [p.id] });
}
/** No 3rd player at a role, roster capped (8 in tier 1, 7 below); the weakest substitute goes. */
function tidy(state: GameState, mk: Market, team: Team, depth = 0) {
  if (team.id === state.userTeamId) return;
  const cap = tierOf(state, team) === 1 ? 8 : 7;
  for (let guard = 0; guard < 6; guard++) {
    const by = { top: [], jungle: [], mid: [], adc: [], support: [] } as Record<Role, Player[]>;
    for (const id of team.roster) { const p = state.players[id]; if (p && by[p.role]) by[p.role].push(p); }
    const worst = (ps: Player[]) => ps.filter((p) => !isStarter(team, p.id)).sort((x, y) => overall(x.attributes, x.role) - overall(y.attributes, y.role))[0];
    let out: Player | undefined;
    for (const r of ROLES) if (by[r].length >= 3) { out = worst(by[r]); if (out) break; }
    if (!out && team.roster.length > cap) out = worst(ROLES.flatMap((r) => (by[r].length >= 2 ? by[r] : []))) ?? worst(ROLES.flatMap((r) => by[r]));
    if (!out) break;
    letGo(state, mk, team, out, depth);
  }
}
/** Start the best player at each role (a clearly better substitute takes the spot). */
function bestLineup(state: GameState, team: Team) {
  autoFillLineup(state, team);
  for (const r of ROLES) {
    const cur = starterOf(state, team, r);
    let best = cur, bo = cur ? overall(cur.attributes, r) : -1;
    for (const id of team.roster) {
      const p = state.players[id];
      if (!p || p.role !== r || p === cur || isStarter(team, p.id)) continue;
      const o = overall(p.attributes, r);
      if (o >= bo + 4) { best = p; bo = o; }
    }
    if (best && best !== cur) team.lineup[r] = best.id;
  }
  fixSubs(state, team);
}

// ------------------------------------------------------------------ free agents choose
/**
 * Weekly in windows: the best free agents (real ones, or fictional ones scouted for two weeks) look at the clubs
 * that would start them with a clear gain and can pay them, and sign for the one they like best — stature, money,
 * a home club (interest(), with stars expecting a club near their level). Keeps top free agents from waiting for
 * whoever happens to have a hole, and sends them to realistic destinations.
 */
function freeAgentMarket(state: GameState, rng: RNG, mk: Market, teams: Team[]) {
  const a = aiState(state);
  const info = new Map<string, { level: number; at: Record<Role, number> }>();
  const infoOf = (t: Team) => {
    let x = info.get(t.id);
    if (!x) {
      const at = {} as Record<Role, number>;
      for (const r of ROLES) { const s = starterOf(state, t, r); at[r] = s ? overall(s.attributes, r) : 0; }
      x = { level: teamLevel(state, t), at };
      info.set(t.id, x);
    }
    return x;
  };
  const fas: Entry[] = [];
  for (const r of ROLES) {
    let k = 0;
    for (const e of roleList(mk, r)) {
      if (e.ovr < worldLevels(state).t2 + 8 || k >= 6) break;
      const p = e.p;
      if (p.teamId || p.role !== r || mk.taken.has(p.id) || mk.pending.has(p.id) || (unknown(p) && freshGen(state, p))) continue;
      fas.push(e); k++;
    }
  }
  fas.sort((x, y) => y.ovr - x.ovr);
  for (const e of fas) {
    const p = e.p, role = p.role;
    if (p.teamId || mk.taken.has(p.id)) continue;
    const pre: [number, Team, number][] = [];
    for (const t of teams) {
      if ((a.buys[t.id] ?? 0) >= 2 || a.released?.[p.id] === t.id) continue;
      const tier = tierOf(state, t);
      const fit = fitPenalty(t, p) * (tier === 1 ? 1 : 1.4);
      const q = e.ovr - (unknown(p) ? (tier === 1 ? 5 : tier === 2 ? 3 : 1) : 0) - fit; // what he'd bring to this club
      const inf = infoOf(t);
      const gain = q - inf.at[role];
      if (gain < (tier === 1 ? 4 : 3) || e.ovr - inf.level > 10) continue;
      const n = a.needs[t.id]?.find((x) => x.role === role);
      if (n && q < n.level - 6 - Math.max(0, daysBetween(n.since, state.date)) * 2 - (n.depth ?? 0) * 3) continue; // it holds out for better
      pre.push([t.prestige / 100 - fit * 0.04 + Math.min(gain, 10) * 0.005, t, gain]);
    }
    if (!pre.length) continue;
    pre.sort((x, y) => y[0] - x[0]);
    let best: Team | null = null, bs = 0.3, bsal = 0, bgain = 0;
    for (const [, t, gain] of pre.slice(0, 6)) {
      const payroll = payrollYearly(state, t);
      const room = Math.max(MIN_ROOM[tierOf(state, t)] ?? 8_000, (t.balance - payroll * 0.25) * 0.3 * t.aiBudget);
      const salary = Math.round(salaryDemand(state, p, t) / 1000) * 1000;
      if (salary > room) continue;
      const v = faInterest(state, p, t, e.ovr) - fitPenalty(t, p) * 0.03 + (rng.next() - 0.5) * 0.1;
      if (v > bs) { bs = v; best = t; bsal = salary; bgain = gain; }
    }
    if (!best) continue;
    const cur = starterOf(state, best, role);
    const c: Cand = { p, ovr: e.ovr, q: e.ovr, u: 0, kind: 'fa', fee: 0 };
    const need = a.needs[best.id]?.find((x) => x.role === role);
    sign(state, mk, best, c, role, bsal, 0, { mode: need ? (need.lost ? 'replace' : 'fill') : cur ? 'upgrade' : 'fill', target: e.ovr - bgain, tol: 0, need });
    info.delete(best.id);
  }
}

// ------------------------------------------------------------------ passes
function processNeed(state: GameState, rng: RNG, mk: Market, team: Team, n: AiNeed) {
  const a = aiState(state);
  const cur = starterOf(state, team, n.role);
  const curOvr = cur ? overall(cur.attributes, n.role) : 0;
  if (cur && curOvr >= n.level - 2) { dropNeed(a, team.id, n.role); return; } // covered as well as before
  const days = Math.max(0, daysBetween(n.since, state.date));
  const forced = !cur && (!mk.inWindow || mk.daysLeft <= 2 || daysToMatch(state, mk, team.id) <= 3 || n.tries >= 4);
  const ok = fillRole(state, rng, mk, team, n.role, { mode: n.lost ? 'replace' : 'fill', target: n.level, tol: forced ? 99 : 6 + days * 2 + (n.depth ?? 0) * 3, forced, need: n });
  if (ok) {
    dropNeed(a, team.id, n.role);
    // a forced stopgap far below the level lost: he plays, the club keeps looking while the window is open
    const now = starterOf(state, team, n.role);
    if (forced && mk.inWindow && mk.daysLeft > 5 && (!now || overall(now.attributes, n.role) < n.level - 8)) (a.needs[team.id] ??= []).push({ ...n, due: addDays(state.date, 3), tries: 0 });
    return;
  }
  n.tries++;
  n.due = addDays(state.date, cur ? 3 : 1);
  // with someone from its own roster in the slot, a club stops looking once the window is shut (or after ~6 weeks)
  if (cur && ((!mk.inWindow && n.tries >= 2) || days > 42)) dropNeed(a, team.id, n.role);
}

function runNeeds(state: GameState, rng: RNG, mk: Market | null): Market | null {
  const a = aiState(state);
  const due: [Team, AiNeed][] = [];
  for (const [tid, list] of Object.entries(a.needs)) {
    const team = state.teams[tid];
    if (!team || tid === state.userTeamId) { delete a.needs[tid]; continue; }
    for (const n of list) if (n.due <= state.date) due.push([team, n]);
  }
  if (!due.length) return mk;
  mk ??= newMarket(state);
  due.sort((x, y) => y[0].prestige - x[0].prestige); // the big clubs get first pick
  for (const [team, n] of due) if (a.needs[team.id]?.includes(n)) processNeed(state, rng, mk, team, n);
  return mk;
}

/**
 * Daily (cheap): every AI club with an empty lineup slot gets an urgent need; due needs are worked on
 * (in a window: anyone; outside: free agents, own subs and the academy only).
 */
let lastScan = { id: '', date: '', moves: -1 };
export function aiSquadDaily(state: GameState, rng: RNG) {
  const a = aiState(state);
  let mk: Market | null = null;
  // a club that sells a starter during this pass may play tomorrow: rescan (bounded) while new holes appear
  for (let pass = 0; pass < 3; pass++) {
    const later: [Team, AiNeed][] = [];
    // empty-slot scan: after any move, on another save, or weekly (lineups only change through moves / the editor)
    const scan = lastScan.moves !== moves || lastScan.id !== state.id || daysBetween(lastScan.date || state.date, state.date) >= 7 || !lastScan.date;
    if (scan) lastScan = { id: state.id, date: state.date, moves };
    if (scan) for (const team of Object.values(state.teams)) {
      if (team.id === state.userTeamId) continue;
      for (const r of ROLES) {
        if (starterOf(state, team, r)) continue;
        autoFillLineup(state, team);
        if (starterOf(state, team, r)) continue;
        const list = (a.needs[team.id] ??= []);
        const n = list.find((x) => x.role === r);
        if (!n) list.push({ role: r, level: Math.round(teamLevel(state, team, r)), since: state.date, due: state.date, tries: 0 });
        else if (n.due > state.date) later.push([team, n]);
      }
    }
    // nobody to play the role and a match within two days: act now
    if (later.length) {
      mk ??= newMarket(state);
      for (const [team, n] of later) if (daysToMatch(state, mk, team.id) <= 2) n.due = state.date;
    }
    const before = departures;
    mk = runNeeds(state, rng, mk);
    if (departures === before) break;
  }
}

/** Weekly in transfer windows: due needs, lineups, the odd upgrade, depth and roster hygiene. */
export function aiSquadWeekly(state: GameState, rng: RNG) {
  const a = aiState(state);
  const mk = runNeeds(state, rng, null) ?? newMarket(state);
  const off = !mk.mid;
  const upgradeRate = off ? (state.date.slice(5, 7) === '01' ? 0.04 : 0.12) : 0.05;
  const teams = Object.values(state.teams).filter((t) => t.id !== state.userTeamId).sort((x, y) => y.prestige - x.prestige);
  freeAgentMarket(state, rng, mk, teams);
  for (const team of teams) {
    bestLineup(state, team);
    const tier = tierOf(state, team);
    // upgrade the weakest role now and then (a meaningful gain only; at most two per window)
    if (!a.needs[team.id]?.length && (a.buys[team.id] ?? 0) < 2 && rng.chance(upgradeRate * team.aiBudget * (tier === 1 ? 1 : tier === 2 ? 0.7 : 0.45))) {
      let role: Role = ROLES[0], gap = -Infinity;
      for (const r of ROLES) {
        const s = starterOf(state, team, r);
        const d = teamLevel(state, team, r) - (s ? overall(s.attributes, r) : 0);
        if (d > gap) { gap = d; role = r; }
      }
      if (gap < 3) role = rng.pick(ROLES); // a balanced lineup: only a clear star upgrade anywhere
      fillRole(state, rng, mk, team, role, { mode: 'upgrade', target: 0, tol: 0, minGain: gap < 3 ? 6 : tier === 1 ? 4 : 3 });
    }
    // a cheap substitute for a thin tier-1/2 roster in the off-season
    if (off && tier <= 2 && team.roster.length < 6 && rng.chance(0.2 * team.aiBudget)) {
      let role: Role = ROLES[0], lo = Infinity;
      for (const r of ROLES) { const s = starterOf(state, team, r); const o = s ? overall(s.attributes, r) : 0; if (o < lo) { lo = o; role = r; } }
      fillRole(state, rng, mk, team, role, { mode: 'depth', target: 0, tol: 0, minGain: Math.round(Math.max(teamLevel(state, team) - 12, tier === 1 ? 52 : 42)) });
    }
    tidy(state, mk, team);
  }
}
