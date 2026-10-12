// Locker room: the manager's relationship with each of their players (trust, mood, personal issues,
// talks whose reception depends on personality, context and repetition) and player ↔ player
// relationships (duo bonds, friendships, mentors, rivalries for a spot, personality clashes, drama).
// Players approach the manager through Inbox choices (action 'playerChoice'); the staff report
// out-of-game misconduct the same way. Match-day effects live in peopleFx.ts (read by prep.ts).
// Only the user's club is modelled — AI teams keep their plain chemistry number (keeps the sim fast).
import type { GameState, Player, Team, MatchFixture, PeopleState, PersonState, PairState, PairKind, PlayerRequest, PlayerIssue, PersonPromise, PlayerAttributes } from '../types';
import { ROLES, ROLE_LABEL } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { gd } from '../../data/gamedata';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';
import { markActionDone } from './offerActions';
import { regionOfCountry, salaryDemand } from './transfers';
import { staffBonus } from '../season/prep';
import { addDays, daysBetween, weekday } from '../season/formats';
import { ageOn } from '../setup';
import { pairKey, synergy, laneName, ISSUE_INFO } from './peopleFx';
import { traitCompat, traitTrust, approachMult, incidentWeight } from './traitEffects';
import { EXTRA_APPROACHES } from './extraApproaches';
import {
  TALK_LINES, APPROACH_T, IGNORED, RELATIVES, LOST_RELATIVES, PARTNERS, CELEBRATIONS, INCIDENTS, FOLLOW_T, MOMENTS, KIND_NOTE, NEWS_T,
  MEETING_LINES, ACTIVITY_SCENES, FEEL_INFO, type LineSet,
} from './peopleTemplates';
import { clampRating } from '../ratings';

export { ISSUE_INFO, peopleParts, peopleAdj, pairKey, synergy } from './peopleFx';
export { FEEL_INFO } from './peopleTemplates';

type Ctx = Record<string, string | number | undefined>;
export type Reaction = 'pos' | 'meh' | 'neg';
type Staff = ReturnType<typeof staffBonus>;

const days = (a: string, b: string) => daysBetween(a, b);
const has = (p: Player, t: string) => p.traits.includes(t);
const ageOf = (state: GameState, p: Player) => ageOn(p.birthdate, state.date) ?? 22;
const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
/** Money scale by tier: tier-1 prices, ~15% in tier 2, ~4% in tier 3 (same as owner requests). */
const scaleOf = (state: GameState, t: Team) => [1, 1, 0.15, 0.04][tierOf(state, t)] ?? 0.04;
export const money = (n: number) => { const a = Math.abs(n); return `$${a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)}`; };
const signed = (n: number, dp = 0) => `${n >= 0 ? '+' : '−'}${dp ? Math.abs(n).toFixed(dp) : Math.abs(Math.round(n))}`;
export const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const rosterOf = (state: GameState, team: Team) => team.roster.map((id) => state.players[id]).filter(Boolean) as Player[];
const starting = (team: Team, id: string) => ROLES.some((r) => team.lineup[r] === id);
const champName = (id: string) => gd().championById[id]?.name ?? id;

// rough first-language groups: shared language helps two teammates click; imports struggle with comms
const LANG: Record<string, string> = {
  'South Korea': 'ko', China: 'zh', Taiwan: 'zh', 'Hong Kong': 'zh', Macau: 'zh', Japan: 'ja', Vietnam: 'vi', Brazil: 'pt', Portugal: 'pt',
  'United States': 'en', Canada: 'en', 'United Kingdom': 'en', England: 'en', Scotland: 'en', Wales: 'en', Ireland: 'en', Australia: 'en', 'New Zealand': 'en', 'North America': 'en',
  Spain: 'es', Mexico: 'es', Argentina: 'es', Chile: 'es', Peru: 'es', Colombia: 'es', Uruguay: 'es', Paraguay: 'es', Venezuela: 'es', Bolivia: 'es', Ecuador: 'es', 'Costa Rica': 'es', Guatemala: 'es',
  Germany: 'de', Austria: 'de', Switzerland: 'de', France: 'fr', Belgium: 'fr', Netherlands: 'nl', Denmark: 'da', Sweden: 'sv', Norway: 'no', Finland: 'fi', Poland: 'pl',
  'Czech Republic': 'cs', Czechia: 'cs', Slovakia: 'sk', Greece: 'el', Cyprus: 'el', Turkey: 'tr', Türkiye: 'tr', Ukraine: 'uk', Russia: 'ru', Belarus: 'ru', Italy: 'it',
  Egypt: 'ar', 'Saudi Arabia': 'ar', Morocco: 'ar', Tunisia: 'ar', Algeria: 'ar', Jordan: 'ar', Lebanon: 'ar', Iraq: 'ar', 'United Arab Emirates': 'ar',
};
const lang = (c: string) => LANG[c] ?? c;
const homeRegion = (c: string) => (/north america/i.test(c) ? 'NA' : regionOfCountry(c));
const imported = (p: Player, t: Team) => homeRegion(p.country) !== t.region;
const abroad = (p: Player, t: Team) => imported(p, t) || (!!t.country && !t.country.includes(p.country) && lang(p.country) !== lang(t.country));

// ------------------------------------------------------------------ state
/** Locker-room state of the user's club (created on first use, and again after a club change). */
export function people(state: GameState): PeopleState {
  const team = state.teams[state.userTeamId];
  let ps = state.people;
  if (!ps || ps.teamId !== team.id) {
    ps = state.people = { teamId: team.id, players: {}, pairs: {}, requests: [], follow: [], feed: [], cd: {}, sent: [], streak: 0 };
    sync(state, ps, team, true);
  }
  return ps;
}

/** Baseline trust a player settles towards: loyal professionals trust easily, big egos don't. */
export const trustBase = (p: Player) => clamp(50 + (p.hidden.loyalty - 50) * 0.2 + (p.hidden.professionalism - 50) * 0.1 - (p.hidden.ego - 50) * 0.1 + traitTrust(p), 30, 70);

function newPerson(state: GameState, p: Player, initial: boolean): PersonState {
  const r = new RNG(hashString(p.id + state.id));
  return { trust: Math.round(clamp(trustBase(p) + r.int(-6, 6) - (initial ? 0 : 3), 15, 85)), issues: [], log: [], cd: {}, promises: [], joined: state.date };
}

export function person(state: GameState, pid: string): PersonState {
  const ps = people(state);
  return (ps.players[pid] ??= newPerson(state, state.players[pid], false));
}

function pairOf(ps: PeopleState, a: string, b: string, date: string): PairState {
  return (ps.pairs[pairKey(a, b)] ??= { aff: 0, heat: 0, since: date });
}

/** Keep the state in step with the roster: new signings get a relationship with everyone, leavers are dropped. */
function sync(state: GameState, ps: PeopleState, team: Team, initial: boolean) {
  const ids = team.roster.filter((id) => state.players[id]);
  const set = new Set(ids);
  for (const id of ids) {
    if (ps.players[id]) continue;
    const p = state.players[id];
    ps.players[id] = newPerson(state, p, initial);
    const r = new RNG(hashString(id + 'pairs' + state.id));
    for (const q of ids) {
      if (q === id || ps.pairs[pairKey(id, q)]) continue;
      // teammates at the start of the save already know each other; a new signing starts near neutral
      const c = compat(state, p, state.players[q]);
      ps.pairs[pairKey(id, q)] = { aff: Math.round(clamp(c * (initial ? 40 : 10) + r.int(-8, 8), -60, 60)), heat: 0, since: state.date };
    }
    if (!initial) feed(ps, state.date, `${p.handle} joins the squad — first impressions are being formed.`, 0, [id]);
  }
  for (const id of Object.keys(ps.players)) {
    if (set.has(id)) continue;
    delete ps.players[id];
    for (const r of ps.requests) if (r.playerId === id && !r.resolved) { r.resolved = 'left'; r.outcome = 'The player has left the club.'; markActionDone(state, 'playerChoice', r.id); }
  }
  for (const k of Object.keys(ps.pairs)) { const [a, b] = k.split('|'); if (!set.has(a) || !set.has(b)) delete ps.pairs[k]; }
}

function feed(ps: PeopleState, date: string, text: string, tone: number, pids?: string[]) {
  ps.feed.unshift({ date, text, tone, pids });
  if (ps.feed.length > 80) ps.feed.length = 80;
}

/** Cooldown helper on the club-level map: true (and stamps today) if `key` wasn't used in the last `n` days. */
function cool(state: GameState, ps: PeopleState, key: string, n: number) {
  const d = ps.cd[key];
  if (d && days(d, state.date) < n) return false;
  ps.cd[key] = state.date;
  return true;
}

// ------------------------------------------------------------------ compatibility, labels
/** How well two personalities mix (-1..1): language, age, egos, tempers, professionalism, plus unpredictable chemistry. */
export function compat(state: GameState, a: Player, b: Player): number {
  let c = ((hashString(pairKey(a.id, b.id) + state.id) % 1000) / 1000 - 0.5) * 0.6;
  c += a.country === b.country ? 0.2 : lang(a.country) === lang(b.country) ? 0.12 : -0.1;
  const da = Math.abs(ageOf(state, a) - ageOf(state, b));
  c += da <= 2 ? 0.08 : da >= 6 ? -0.05 : 0;
  if (a.hidden.ego > 65 && b.hidden.ego > 65) c -= 0.3;
  c -= Math.max(0, a.personality.temperament + b.personality.temperament - 110) / 100 * 0.5;
  c += (a.hidden.professionalism + b.hidden.professionalism - 120) / 100 * 0.2;
  if ((has(a, 'party_animal') && has(b, 'grinder')) || (has(b, 'party_animal') && has(a, 'grinder'))) c -= 0.15;
  if (has(a, 'hot_headed') || has(b, 'hot_headed')) c -= 0.08;
  if (has(a, 'mentor') || has(b, 'mentor')) c += 0.05;
  c += traitCompat(a, b); // extended traits, humor / charisma, languages (traitEffects.ts)
  return clamp(c, -1, 1);
}

export function pairKind(a: Player, b: Player, pr: PairState): PairKind {
  if (pr.heat >= 30) return 'drama';
  if (pr.mentor && pr.aff > -20) return 'mentor';
  if (a.role === b.role) return pr.aff >= 40 ? 'friends' : 'rivals';
  if (pr.aff >= 35 && synergy(a.role, b.role) >= 0.6) return 'duo';
  if (pr.aff >= 40) return 'friends';
  if (pr.aff <= -30 && ((a.hidden.ego > 60 && b.hidden.ego > 60) || a.personality.temperament + b.personality.temperament > 120)) return 'clash';
  if (pr.aff <= -25) return 'tension';
  return 'neutral';
}

export const PAIR_INFO: Record<PairKind, { label: string; color: string; icon: string }> = {
  duo: { label: 'Duo synergy', color: '#22c55e', icon: '◆' },
  friends: { label: 'Friends', color: '#84cc16', icon: '♥' },
  mentor: { label: 'Mentor', color: '#38bdf8', icon: '✦' },
  rivals: { label: 'Rivals', color: '#eab308', icon: '⚔' },
  clash: { label: 'Clash', color: '#f97316', icon: '✕' },
  tension: { label: 'Tension', color: '#fb923c', icon: '!' },
  drama: { label: 'Drama', color: '#ef4444', icon: '‼' },
  neutral: { label: 'Neutral', color: '#8a97b3', icon: '·' },
};

/** Relationship summary between two teammates for the UI. */
export function pairView(state: GameState, aId: string, bId: string) {
  const ps = people(state);
  const a = state.players[aId], b = state.players[bId];
  const pr = ps.pairs[pairKey(aId, bId)];
  if (!a || !b || !pr) return null;
  const kind = pairKind(a, b, pr);
  const info = PAIR_INFO[kind];
  const label = kind === 'rivals' ? (pr.aff <= -35 ? 'Bitter rivals' : pr.aff >= 0 ? 'Healthy rivalry' : 'Rivals') : kind === 'mentor' ? (pr.mentor === aId ? `Mentoring ${b.handle}` : `Mentored by ${b.handle}`) : info.label;
  return { kind, label, color: kind === 'rivals' && pr.aff <= -35 ? '#f97316' : info.color, icon: info.icon, aff: Math.round(pr.aff), heat: Math.round(pr.heat), duoQ: !!pr.duoQ && pr.duoQ >= state.date, since: pr.since, last: pr.last };
}

export function trustLabel(t: number): { label: string; color: string } {
  if (t >= 80) return { label: 'Would run through walls for you', color: '#f0c674' };
  if (t >= 65) return { label: 'Trusts you', color: '#22c55e' };
  if (t >= 45) return { label: 'Neutral', color: '#eab308' };
  if (t >= 30) return { label: 'Wary', color: '#f97316' };
  return { label: 'Distrustful', color: '#ef4444' };
}

const activeIssues = (state: GameState, me: PersonState) => me.issues.filter((i) => i.until >= state.date && i.sev > 0);
const visibleIssue = (state: GameState, me: PersonState) => activeIssues(state, me).filter((i) => !i.hidden).sort((a, b) => b.sev - a.sev)[0];

/** Current mood of one of the user's players: away / short-lived feeling / worst issue / morale. */
export function moodOf(state: GameState, p: Player): { label: string; color: string } {
  const me = state.people?.players[p.id];
  if (me?.away && me.away.until >= state.date) return { label: `Away (${me.away.reason})`, color: '#8a97b3' };
  if (me?.feel && me.feel.until >= state.date && FEEL_INFO[me.feel.k]) return FEEL_INFO[me.feel.k];
  const i = me ? visibleIssue(state, me) : undefined;
  if (i && i.sev >= 2) return { label: ISSUE_INFO[i.kind]?.mood ?? 'Troubled', color: ISSUE_INFO[i.kind]?.color ?? '#f97316' };
  const m = p.morale;
  if (m >= 82) return { label: 'Buzzing', color: '#f0c674' };
  if (m >= 68) return { label: 'Happy', color: '#22c55e' };
  if (m >= 55) return { label: 'Content', color: '#84cc16' };
  if (m >= 42) return { label: 'Flat', color: '#eab308' };
  if (m >= 30) return { label: 'Low', color: '#f97316' };
  return { label: 'Miserable', color: '#ef4444' };
}

// ------------------------------------------------------------------ text
function fillT(tpl: string, ctx: Ctx): string | null {
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => { const v = ctx[k]; if (v === undefined || v === '') { ok = false; return ''; } return String(v); });
  return ok ? out : null;
}
/** Random line from a pool whose placeholders can be filled, avoiding recently used lines. */
function line(ps: PeopleState | undefined, rng: RNG, pool: string[] | undefined, ctx: Ctx): string {
  if (!pool?.length) return '';
  const recent = ps?.recent ?? [];
  let fallback: string | null = null;
  for (const i of rng.shuffle(pool.map((_, i) => i))) {
    const s = fillT(pool[i], ctx);
    if (!s) continue;
    const h = hashString(pool[i]);
    if (recent.includes(h)) { fallback ??= s; continue; }
    if (ps) { (ps.recent ??= []).push(h); if (ps.recent.length > 40) ps.recent.shift(); }
    return s;
  }
  return fallback ?? '';
}
function baseCtx(state: GameState, ps: PeopleState, p: Player): Ctx {
  const last = recentSeries(state, ps);
  return { coach: state.manager.name || 'coach', me: p.handle, team: state.teams[ps.teamId]?.short, home: p.country, opp: last?.opp, kda: last?.lines[p.id], mistake: last?.mistakes[p.id] };
}
function staffFrom(state: GameState, team: Team, prefer: 'psych' | 'any' = 'any') {
  const st = team.staff.map((id) => state.staff[id]).filter(Boolean);
  const psy = st.find((s) => s.role === 'psychologist');
  if (psy && prefer === 'psych') return `${psy.handle} (Psychologist)`;
  const hc = st.find((s) => s.role === 'headCoach');
  return hc ? `${hc.handle} (Head coach)` : psy ? `${psy.handle} (Psychologist)` : 'Team manager';
}
function notePlayer(state: GameState, ps: PeopleState, p: Player, key: string, extra: Ctx = {}, rng?: RNG) {
  const T = FOLLOW_T[key];
  if (!T) return;
  const r = rng ?? new RNG(hashString(p.id + key + state.date) ^ state.seq);
  const ctx = { ...baseCtx(state, ps, p), ...extra };
  addInbox(state, { from: key === 'psych_hint' ? staffFrom(state, state.teams[ps.teamId], 'psych') : p.handle, subject: line(ps, r, T.subj, ctx) || T.subj[0], body: line(ps, r, T.body, ctx), kind: 'player' });
}

// ------------------------------------------------------------------ effects
interface Fx { morale?: number; trust?: number; form?: number; fatigue?: number; cash?: number; cat?: string; chem?: number; teamMorale?: number; hype?: number; feel?: string }

function applyFx(state: GameState, ps: PeopleState, p: Player, fx: Fx, note?: string): string {
  const team = state.teams[ps.teamId];
  const me = ps.players[p.id];
  const out: string[] = [];
  if (fx.morale) { p.morale = clamp(p.morale + fx.morale, 5, 100); out.push(`Morale ${signed(fx.morale)}`); }
  if (fx.trust && me) { me.trust = clamp(me.trust + fx.trust, 0, 100); out.push(`Trust ${signed(fx.trust)}`); }
  if (fx.form) { p.form = clamp(p.form + fx.form, -10, 10); out.push(`Form ${signed(fx.form, 1)}`); }
  if (fx.fatigue) { p.fatigue = clamp(p.fatigue + fx.fatigue, 0, 100); out.push(`Fatigue ${signed(fx.fatigue)}`); }
  if (fx.cash) { addLedger(state, team, fx.cat ?? 'Player welfare', Math.round(fx.cash), note ?? p.handle); out.push(`Club funds ${fx.cash > 0 ? '+' : '−'}${money(fx.cash)}`); }
  if (fx.chem) { team.chemistry = clamp(team.chemistry + fx.chem, 10, 100); out.push(`Chemistry ${signed(fx.chem)}`); }
  if (fx.teamMorale) { for (const q of rosterOf(state, team)) if (q.id !== p.id) q.morale = clamp(q.morale + fx.teamMorale, 5, 100); out.push(`Squad morale ${signed(fx.teamMorale)}`); }
  if (fx.hype) { team.hype = clamp(team.hype + fx.hype, 0, 100); out.push(`Hype ${signed(fx.hype)}`); }
  if (fx.feel && me) me.feel = { k: fx.feel, until: addDays(state.date, 6) };
  return out.join(' · ');
}
const add = (fx: Fx, more: Fx): Fx => {
  const o: Fx = { ...fx };
  for (const [k, v] of Object.entries(more) as [keyof Fx, number | string][]) {
    if (typeof v === 'number') (o as Record<string, number>)[k] = ((o as Record<string, number>)[k] ?? 0) + v;
    else (o as Record<string, string>)[k] = v;
  }
  return o;
};

function addIssue(state: GameState, me: PersonState, kind: string, sev: number, len: number, hidden = false): PlayerIssue {
  const ex = me.issues.find((i) => i.kind === kind && i.until >= state.date && i.sev > 0);
  const until = addDays(state.date, len);
  if (ex) { ex.sev = Math.max(ex.sev, sev); if (until > ex.until) ex.until = until; if (!hidden) ex.hidden = undefined; return ex; }
  const i: PlayerIssue = { id: `iss_${state.seq++}`, kind, sev, since: state.date, until, hidden: hidden || undefined };
  me.issues.push(i);
  return i;
}
/** Change an active issue's severity (0 ends it) and/or cap how long it lasts. */
function ease(state: GameState, me: PersonState, kind: string, dSev: number, maxDays?: number) {
  const i = me.issues.find((x) => x.kind === kind && x.until >= state.date && x.sev > 0);
  if (!i) return;
  i.sev = clamp(i.sev + dSev, 0, 3);
  i.treated = true;
  if (i.sev <= 0) i.until = addDays(state.date, -1);
  else if (maxDays !== undefined) { const cap = addDays(state.date, maxDays); if (cap < i.until) i.until = cap; }
}

/** Send a player away (leave, illness, benching). A same-role sub steps in and is swapped back on return. */
function sendAway(state: GameState, ps: PeopleState, team: Team, p: Player, n: number, reason: string): string {
  const me = ps.players[p.id];
  const until = addDays(state.date, n - 1);
  // already away: extend the absence rather than lose track of who is standing in
  if (me.away && me.away.until >= state.date) {
    if (until > me.away.until) me.away.until = until;
    me.away.reason = reason;
    return `${p.handle} stays away until ${shortDate(me.away.until)}.`;
  }
  const slot = ROLES.find((r) => team.lineup[r] === p.id);
  me.away = { until, reason, slot };
  if (!slot) return `${p.handle} is away until ${shortDate(until)}.`;
  const sub = rosterOf(state, team).filter((q) => q.id !== p.id && q.role === slot && !starting(team, q.id) && !(ps.players[q.id]?.away && ps.players[q.id].away!.until >= state.date))
    .sort((a, b) => b.morale - a.morale)[0];
  if (sub) {
    team.lineup[slot] = sub.id; sub.isSub = false; p.isSub = true; me.away.standIn = sub.id;
    return `${sub.handle} starts at ${ROLE_LABEL[slot]} until ${shortDate(until)}.`;
  }
  return /leave|funeral|trip|family/.test(reason)
    ? `No ${ROLE_LABEL[slot]} substitute on the roster — ${p.handle} will fly in for matches (expect some rust).`
    : `No ${ROLE_LABEL[slot]} substitute on the roster — ${p.handle} will still have to play matches (below their best).`;
}

function checkReturns(state: GameState, ps: PeopleState, team: Team) {
  for (const [id, me] of Object.entries(ps.players)) {
    const a = me.away;
    if (!a || a.until >= state.date) continue;
    me.away = undefined;
    const p = state.players[id];
    if (!p) continue;
    let back = '';
    if (a.standIn && a.slot && team.lineup[a.slot] === a.standIn) {
      team.lineup[a.slot] = id; p.isSub = false;
      const s = state.players[a.standIn];
      if (s) s.isSub = true;
      back = ` ${p.handle} is back in the starting lineup.`;
    } else if (a.standIn) back = ` (You changed the lineup in the meantime, so ${p.handle} stays where you put them.)`;
    feed(ps, state.date, `${p.handle} is back${a.reason === 'benched' ? ' from their benching' : ''}.${back}`, 0, [id]);
    if (/leave|funeral|trip|family/.test(a.reason)) notePlayer(state, ps, p, 'back');
  }
}

// ------------------------------------------------------------------ recent series context
function recentSeries(state: GameState, ps: PeopleState) {
  return ps.last && days(ps.last.date, state.date) <= 10 ? ps.last : undefined;
}
const openIncident = (state: GameState, me: PersonState) => (me.incident && !me.incident.handled && days(me.incident.date, state.date) <= 14 ? me.incident : undefined);
function mistakeOf(state: GameState, ps: PeopleState, me: PersonState, pid: string): string | null {
  const inc = openIncident(state, me);
  if (inc) return `Off the Rift: ${inc.text}`;
  const last = recentSeries(state, ps);
  const m = last?.mistakes[pid];
  return m && me.cd.addressed !== last!.fixtureId ? `In game: ${m}` : null;
}

// ------------------------------------------------------------------ manager talks (player page)
export type TalkAction = 'praise' | 'encourage' | 'chat' | 'discuss' | 'rest' | 'promise' | 'expect' | 'scold' | 'tough' | 'fine' | 'mentor' | 'pairup' | 'mediate';
export interface TalkMeta { id: TalkAction; label: string; group: 'support' | 'demand' | 'team'; desc: string }
export const TALK_ACTIONS: TalkMeta[] = [
  { id: 'praise', label: 'Praise', group: 'support', desc: 'Recognise their recent work. Lands best when deserved — and not every day.' },
  { id: 'encourage', label: 'Encourage', group: 'support', desc: 'Reassure them. Helps fragile, low or slumping players most.' },
  { id: 'chat', label: 'How are you doing?', group: 'support', desc: 'A private check-in. Builds trust and may uncover something they’re hiding.' },
  { id: 'discuss', label: 'Talk through their issue', group: 'support', desc: 'Help with what they’re dealing with. A psychologist on staff helps.' },
  { id: 'rest', label: 'Give a rest day', group: 'support', desc: 'Cuts fatigue and lifts morale. Grinders may not want it.' },
  { id: 'promise', label: 'Promise playing time', group: 'support', desc: 'Two starts within three weeks. Breaking it costs a lot of trust.' },
  { id: 'expect', label: 'Demand more', group: 'demand', desc: 'Set clear expectations. Ambitious professionals respond; fragile players wilt.' },
  { id: 'scold', label: 'Criticise last match', group: 'demand', desc: 'Hold them to account after a bad series. Unfair criticism backfires.' },
  { id: 'tough', label: 'Be tough about a mistake', group: 'demand', desc: 'Address a specific in-game error or off-the-Rift misconduct.' },
  { id: 'fine', label: 'Fine / discipline', group: 'demand', desc: 'Formal sanction (a week’s wages). Only fair after misconduct.' },
  { id: 'mentor', label: 'Ask to mentor…', group: 'team', desc: 'Have them guide a younger teammate (bond + small development boost).' },
  { id: 'pairup', label: 'Pair up with…', group: 'team', desc: 'Duo queue / room together for a month. Bonds grow faster — if they get along.' },
  { id: 'mediate', label: 'Mediate with…', group: 'team', desc: 'Sit them down with a teammate they’re at odds with.' },
];
const HARSH = new Set(['expect', 'scold', 'tough', 'fine']);
const BASE: Record<TalkAction, number> = { praise: 0.55, encourage: 0.45, chat: 0.5, discuss: 0.3, rest: 0.55, promise: 0.55, expect: 0.1, scold: 0, tough: 0.05, fine: -0.3, mentor: 0.3, pairup: 0.35, mediate: 0.15 };
const TALK_FX: Record<TalkAction, Record<Reaction, Fx>> = {
  praise: { pos: { morale: 4, trust: 3, form: 0.3, feel: 'confident' }, meh: { morale: 1 }, neg: { morale: -1, trust: -2 } },
  encourage: { pos: { morale: 5, trust: 2, form: 0.4, feel: 'reassured' }, meh: { morale: 1 }, neg: { trust: -1 } },
  chat: { pos: { trust: 3, morale: 2 }, meh: { trust: 1 }, neg: { trust: -1 } },
  discuss: { pos: { morale: 3, trust: 4, feel: 'relieved' }, meh: { morale: 1, trust: 1 }, neg: { trust: -2 } },
  rest: { pos: { fatigue: -18, morale: 3, trust: 2, feel: 'grateful' }, meh: { fatigue: -15, morale: 1 }, neg: { fatigue: -12, morale: -1 } },
  promise: { pos: { morale: 6, trust: 4, feel: 'hopeful' }, meh: { morale: 3, trust: 1 }, neg: { trust: -2 } },
  expect: { pos: { form: 0.8, morale: 1, trust: 1, feel: 'focused' }, meh: { morale: -1, form: 0.3 }, neg: { morale: -4, trust: -4, form: -0.5, feel: 'hurt' } },
  scold: { pos: { form: 1.2, morale: -1, trust: 1, feel: 'focused' }, meh: { morale: -3, trust: -1, form: 0.3 }, neg: { morale: -6, trust: -6, form: -0.8, feel: 'resentful' } },
  tough: { pos: { form: 1, morale: -1, trust: 2, feel: 'focused' }, meh: { morale: -3, trust: -1 }, neg: { morale: -7, trust: -7, feel: 'angry' } },
  fine: { pos: { morale: -2 }, meh: { morale: -4, trust: -3 }, neg: { morale: -8, trust: -8, feel: 'resentful' } },
  mentor: { pos: { morale: 2, trust: 1 }, meh: {}, neg: { trust: -1 } },
  pairup: { pos: { morale: 1 }, meh: {}, neg: { morale: -1 } },
  mediate: { pos: { morale: 2, trust: 3, feel: 'relieved' }, meh: { trust: 1 }, neg: { trust: -3, morale: -2 } },
};

export interface TalkCheck { ok: boolean; why?: string; note?: string; targets?: { id: string; label: string }[] }

/** Can the manager use this talk on this player now? (reason when not; teammate targets for pair actions) */
export function talkCheck(state: GameState, pid: string, action: TalkAction): TalkCheck {
  const team = state.teams[state.userTeamId];
  const p = state.players[pid];
  if (!p || p.teamId !== team.id) return { ok: false, why: 'Not one of your players.' };
  const ps = people(state);
  const me = person(state, pid);
  if (me.cd.talk === state.date) return { ok: false, why: `You already spoke with ${p.handle} today.` };
  if (me.away && me.away.until >= state.date && action !== 'chat' && action !== 'discuss') return { ok: false, why: `${p.handle} is away until ${shortDate(me.away.until)}.` };
  const mates = rosterOf(state, team).filter((q) => q.id !== pid);
  const tgt = (list: Player[], why: string): TalkCheck => (list.length ? { ok: true, targets: list.map((q) => ({ id: q.id, label: `${q.handle} (${ROLE_LABEL[q.role]})` })) } : { ok: false, why });
  switch (action) {
    case 'discuss': { const i = visibleIssue(state, me); return i ? { ok: true, note: ISSUE_INFO[i.kind]?.label } : { ok: false, why: 'They haven’t told you about any issue.' }; }
    case 'promise':
      if (starting(team, pid)) return { ok: false, why: 'Already in the starting lineup.' };
      if (me.promises.some((x) => x.kind === 'playtime' && x.status === 'open')) return { ok: false, why: 'You already promised them playing time.' };
      return { ok: true };
    case 'scold': { const last = recentSeries(state, ps); return last && last.perf[pid] !== undefined ? { ok: true, note: `vs ${last.opp} (${last.score})` } : { ok: false, why: 'They haven’t played a series in the last ten days.' }; }
    case 'tough': { const m = mistakeOf(state, ps, me, pid); return m ? { ok: true, note: m } : { ok: false, why: 'No recent mistake or misconduct to address.' }; }
    case 'fine': { const inc = openIncident(state, me); return { ok: true, note: inc ? inc.text : 'No recent misconduct — a fine would look unfair.' }; }
    case 'rest': return me.cd.rest && days(me.cd.rest, state.date) < 5 ? { ok: false, why: 'They had a rest day this week.' } : { ok: true };
    case 'mentor': {
      if (ageOf(state, p) < 20) return { ok: false, why: 'Too young to mentor anyone.' };
      return tgt(mates.filter((q) => (ageOf(state, q) <= ageOf(state, p) - 2 || has(q, 'rookie')) && !ps.pairs[pairKey(pid, q.id)]?.mentor), 'No younger teammate to mentor.');
    }
    case 'pairup': return tgt(mates.filter((q) => { const d = ps.pairs[pairKey(pid, q.id)]?.duoQ; return !d || d < state.date; }), 'Already paired up with everyone.');
    case 'mediate': return tgt(mates.filter((q) => { const pr = ps.pairs[pairKey(pid, q.id)]; return !!pr && (pr.aff <= -15 || pr.heat >= 10); }), 'No teammate they’re at odds with.');
  }
  return { ok: true };
}

export interface TalkResult { ok: boolean; message?: string; reply?: string; reaction?: Reaction; effects?: string }

function pickReply(ps: PeopleState, rng: RNG, set: LineSet, r: Reaction, p: Player, ctx: Ctx, badGame = false) {
  let pool = set[r];
  if (r === 'neg' && badGame && set.negBadGame) pool = set.negBadGame;
  else if (r === 'neg' && p.hidden.ego > 65 && set.egoNeg && rng.chance(0.6)) pool = set.egoNeg;
  else if (r === 'neg' && p.hidden.composure < 45 && set.fragileNeg && rng.chance(0.6)) pool = set.fragileNeg;
  else if (r === 'pos' && p.hidden.professionalism > 75 && set.proPos && rng.chance(0.4)) pool = set.proPos;
  return line(ps, rng, pool, ctx) || line(ps, rng, set[r], ctx);
}

/** One-on-one talk with a player of the user's club. Reception depends on personality, trust, context and repetition. */
export function talkTo(state: GameState, pid: string, action: TalkAction, targetId?: string): TalkResult {
  const chk = talkCheck(state, pid, action);
  if (!chk.ok) return { ok: false, message: chk.why };
  if (chk.targets && (!targetId || !chk.targets.some((t) => t.id === targetId))) return { ok: false, message: 'Pick a teammate first.' };
  const team = state.teams[state.userTeamId];
  const ps = people(state);
  const p = state.players[pid];
  const me = person(state, pid);
  const mate = targetId ? state.players[targetId] : undefined;
  const rng = new RNG(hashString(pid + action + state.date + (targetId ?? '')) ^ state.seq);
  state.seq++;
  const sb = staffBonus(state, team);
  const h = p.hidden;
  const last = recentSeries(state, ps);
  const perf = last?.perf[pid];
  const trustZ = (me.trust - 50) / 50, proZ = (h.professionalism - 50) / 50, egoZ = Math.max(0, (h.ego - 50) / 50), frag = (50 - h.composure) / 50;
  const temperZ = Math.max(0, (p.personality.temperament - 50) / 50);
  const recent = (k: string, n: number) => me.log.filter((l) => l.kind === k && days(l.date, state.date) <= n).length;
  const harsh = me.log.filter((l) => HARSH.has(l.kind) && days(l.date, state.date) <= 21).length;
  const inc = openIncident(state, me);
  const pr = mate ? pairOf(ps, pid, mate.id, state.date) : undefined;
  let s = BASE[action] + rng.normal(0, 0.45) + (sb.motivation - 50) / 100 * 0.4 + (state.manager.reputation - 50) / 250;
  switch (action) {
    case 'praise': s += trustZ * 0.4 + (perf !== undefined ? clamp(perf / 4, -0.8, 0.6) : p.form > 2 ? 0.3 : 0) + Math.max(0, frag) * 0.25 - egoZ * 0.3 - recent('praise', 14) * 0.4; break;
    case 'encourage': s += trustZ * 0.4 + Math.max(0, frag) * 0.35 + (60 - p.morale) / 60 * 0.5 + (p.form < -2 ? 0.25 : 0) - egoZ * 0.3 - recent('encourage', 14) * 0.4; break;
    case 'chat': s += trustZ * 0.3 + (h.loyalty - 50) / 100 - Math.max(0, recent('chat', 14) - 1) * 0.45; break;
    case 'discuss': s += trustZ * 0.6 + (sb.hasPsychologist ? 0.35 : 0) - recent('discuss', 10) * 0.25; break;
    case 'rest': s += (p.fatigue - 40) / 40 * 0.5 - (h.workEthic - 60) / 40 * 0.35 - (has(p, 'grinder') ? 0.25 : 0) + (activeIssues(state, me).some((i) => i.kind === 'burnout') ? 0.4 : 0); break;
    case 'promise': s += trustZ * 0.4 + egoZ * 0.3 - me.promises.filter((x) => x.status === 'broken').length * 0.6; break;
    case 'expect': s += trustZ * 0.6 + proZ * 0.5 + (p.personality.ambition - 50) / 50 * 0.3 - Math.max(0, frag) * 0.7 - egoZ * 0.55 + (p.form < -1 || (perf ?? 0) < -1 ? 0.25 : -0.15) - harsh * 0.3; break;
    case 'scold': {
      const fair = perf === undefined ? 0 : perf < -2 ? 0.45 : perf < 0 ? 0.1 : -0.8;
      s += trustZ * 0.6 + proZ * 0.5 - Math.max(0, frag) * 0.8 - egoZ * 0.7 - temperZ * 0.4 + fair - (last?.won ? 0.3 : 0) - harsh * 0.35 - (has(p, 'tilter') ? 0.2 : 0);
      break;
    }
    case 'tough': s += trustZ * 0.6 + proZ * 0.55 - Math.max(0, frag) * 0.7 - egoZ * 0.7 - temperZ * 0.4 + 0.3 - harsh * 0.3 - (has(p, 'hot_headed') ? 0.25 : 0); break;
    case 'fine': s += trustZ * 0.3 + proZ * 0.6 - egoZ * 0.6 + (inc ? 0.35 : -1) - harsh * 0.3; break;
    case 'mentor': s += proZ * 0.5 - Math.max(0, egoZ - 0.2) * 0.6 + (has(p, 'mentor') ? 0.5 : 0) + (has(p, 'veteran') ? 0.3 : 0) + trustZ * 0.3 + (pr ? pr.aff / 100 * 0.4 : 0); break;
    case 'pairup': s += compat(state, p, mate!) * 0.9 + pr!.aff / 100 * 0.6 + trustZ * 0.2; break;
    case 'mediate': break; // handled by mediation()
  }
  let reaction: Reaction = s >= 0.45 ? 'pos' : s <= -0.25 ? 'neg' : 'meh';
  let fx: Fx = { ...TALK_FX[action][reaction] };
  const extra: string[] = [];
  const ctx: Ctx = { ...baseCtx(state, ps, p), mate: mate?.handle };
  let reply = '';
  // harsh words pile up: constant criticism breaks trust; fragile players get crushed, big egos get offended
  if (HARSH.has(action)) {
    if (harsh >= 2) fx = add(fx, { trust: -2 * (harsh - 1), morale: -1 });
    if (reaction === 'neg' && h.composure < 45) fx = add(fx, { morale: -2, form: -0.4 });
    if (reaction === 'neg' && h.ego > 65) fx = add(fx, { trust: -2 });
  }
  switch (action) {
    case 'chat': {
      const hid = me.issues.find((i) => i.hidden && i.until >= state.date && i.sev > 0);
      if (hid && reaction !== 'neg' && rng.chance(clamp(0.35 + (me.trust - 50) / 100 + (reaction === 'pos' ? 0.3 : 0), 0.15, 0.95))) {
        hid.hidden = undefined;
        reply = line(ps, rng, TALK_LINES.chat.reveal, ctx);
        const req = APPROACHES[hid.kind] ? openApproach(state, ps, team, p, hid.kind, true) : null;
        extra.push(req ? `${p.handle} opened up about something — check your inbox.` : `${p.handle} opened up: ${ISSUE_INFO[hid.kind]?.label ?? hid.kind}.`);
        fx = add(fx, { trust: 2 });
      }
      break;
    }
    case 'discuss': {
      const i = visibleIssue(state, me)!;
      if (reaction === 'pos') { ease(state, me, i.kind, -1); extra.push(i.sev <= 0 ? `${ISSUE_INFO[i.kind]?.label} resolved` : `${ISSUE_INFO[i.kind]?.label} eased`); }
      else if (reaction === 'meh') { i.treated = true; const cap = addDays(i.until, -2); if (cap > state.date) i.until = cap; }
      break;
    }
    case 'rest': me.cd.rest = state.date; ease(state, me, 'burnout', reaction === 'neg' ? 0 : -1); break;
    case 'promise': {
      const pm: PersonPromise = { kind: 'playtime', text: 'two starts within three weeks', made: state.date, deadline: addDays(state.date, 21), need: 2, got: 0, status: 'open' };
      me.promises.unshift(pm); if (me.promises.length > 6) me.promises.length = 6;
      extra.push(`Promise: ${pm.text} (by ${shortDate(pm.deadline)})`);
      break;
    }
    case 'scold': case 'tough': case 'fine': {
      if (action === 'fine') {
        const amt = Math.max(100, Math.round((p.contract?.salary ?? 20000) / 52 / 100) * 100);
        fx = add(fx, { cash: amt, cat: 'Player fines' });
      }
      if (inc && action !== 'scold') { inc.handled = true; if (reaction !== 'neg') me.cd.warned = state.date; }
      if (action === 'tough' && !inc && last) me.cd.addressed = last.fixtureId;
      // the squad watches how misconduct is handled: professionals respect a fair line
      if (action !== 'scold' && inc && reaction !== 'neg') for (const q of rosterOf(state, team)) if (q.id !== pid && q.hidden.professionalism > 70 && ps.players[q.id]) ps.players[q.id].trust = clamp(ps.players[q.id].trust + 1, 0, 100);
      break;
    }
    case 'mentor': {
      if (reaction !== 'neg') {
        pr!.mentor = pid; pr!.aff = clamp(pr!.aff + (reaction === 'pos' ? 10 : 4), -100, 100);
        mate!.morale = clamp(mate!.morale + 2, 5, 100);
        feed(ps, state.date, line(ps, rng, KIND_NOTE.mentor, { a: p.handle, b: mate!.handle }), 1, [pid, mate!.id]);
        extra.push(`${p.handle} now mentors ${mate!.handle}`);
      }
      break;
    }
    case 'pairup': {
      if (reaction === 'neg') { pr!.aff = clamp(pr!.aff - 6, -100, 100); pr!.heat = clamp(pr!.heat + 10, 0, 100); extra.push(`${p.handle} & ${mate!.handle}: affinity −6`); }
      else { pr!.duoQ = addDays(state.date, 30); pr!.aff = clamp(pr!.aff + (reaction === 'pos' ? 8 : 3), -100, 100); extra.push(`${p.handle} & ${mate!.handle} paired up until ${shortDate(pr!.duoQ)}`); }
      break;
    }
    case 'mediate': {
      reaction = mediation(state, ps, team, p, mate!, rng);
      fx = { ...TALK_FX.mediate[reaction] };
      const v = pairView(state, pid, mate!.id);
      extra.push(`${p.handle} & ${mate!.handle}: ${v?.label} (${v ? signed(v.aff) : ''})`);
      break;
    }
  }
  const summary = applyFx(state, ps, p, fx);
  if (!reply) reply = pickReply(ps, rng, TALK_LINES[action], reaction, p, ctx, perf !== undefined && perf < -1);
  me.cd.talk = state.date;
  me.log.unshift({ date: state.date, kind: action, tone: reaction === 'pos' ? 1 : reaction === 'neg' ? -1 : 0, text: TALK_ACTIONS.find((a) => a.id === action)!.label.replace('…', '') + (mate ? ` ${mate.handle}` : ''), reply });
  if (me.log.length > 20) me.log.length = 20;
  return { ok: true, reply, reaction, effects: [summary, ...extra].filter(Boolean).join(' · ') };
}

/** Sit two teammates down. Success depends on their trust in you, tempers, a psychologist and how hot it is. */
function mediation(state: GameState, ps: PeopleState, team: Team, a: Player, b: Player, rng: RNG, bonus = 0): Reaction {
  const pa = ps.players[a.id], pb = ps.players[b.id];
  const pr = pairOf(ps, a.id, b.id, state.date);
  const sb = staffBonus(state, team);
  const s = 0.15 + bonus + ((pa?.trust ?? 50) + (pb?.trust ?? 50) - 100) / 100 * 0.5 - (a.personality.temperament + b.personality.temperament - 100) / 100 * 0.4
    + (sb.hasPsychologist ? 0.3 : 0) - pr.heat / 100 * 0.4 + compat(state, a, b) * 0.4 + (sb.motivation - 50) / 100 * 0.4 + rng.normal(0, 0.45);
  if (s >= 0.45) {
    pr.heat = 0; pr.aff = clamp(Math.max(pr.aff + 22, -10), -100, 100);
    if (pb) pb.trust = clamp(pb.trust + 3, 0, 100);
    const text = line(ps, rng, MOMENTS.made_up, { a: a.handle, b: b.handle });
    pr.last = { date: state.date, text, tone: 1 };
    feed(ps, state.date, text, 1, [a.id, b.id]);
    return 'pos';
  }
  if (s > -0.25) { pr.heat = Math.max(0, pr.heat - 15); pr.aff = clamp(pr.aff + 6, -100, 100); return 'meh'; }
  pr.heat = clamp(pr.heat + 12, 0, 100); pr.aff = clamp(pr.aff - 6, -100, 100);
  if (pb) pb.trust = clamp(pb.trust - 3, 0, 100);
  feed(ps, state.date, `Mediation between ${a.handle} and ${b.handle} went badly.`, -1, [a.id, b.id]);
  return 'neg';
}

// ------------------------------------------------------------------ player approaches (Inbox choices)
interface Cx { state: GameState; ps: PeopleState; team: Team; p: Player; me: PersonState; sb: Staff; age: number; starter: boolean; imp: boolean; abroad: boolean; s: number; trustZ: number; proZ: number; egoZ: number; frag: number }
interface Opt { id: string; label: string; hint?: string }
interface Res { out: string; fx: Fx; note?: string }
type Data = Record<string, string | number>;
interface Approach {
  title: string;
  cd: number;                                         // per-player cooldown (days)
  personal?: boolean;                                 // private matter: low-trust players hide it instead of asking
  issue?: [kind: string, sevMin: number, sevMax: number, lenMin: number, lenMax: number];
  weight: (c: Cx) => number;
  data?: (c: Cx, rng: RNG) => Data | null;
  opts: (c: Cx, d: Data) => Opt[];
  fallback: string;
  resolve: (c: Cx, req: PlayerRequest, opt: string, rng: RNG) => Res;
}

function cxFor(state: GameState, ps: PeopleState, team: Team, p: Player): Cx {
  const me = ps.players[p.id] ?? (ps.players[p.id] = newPerson(state, p, false));
  return {
    state, ps, team, p, me, sb: staffBonus(state, team), age: ageOf(state, p), starter: starting(team, p.id), imp: imported(p, team), abroad: abroad(p, team), s: scaleOf(state, team),
    trustZ: (me.trust - 50) / 50, proZ: (p.hidden.professionalism - 50) / 50, egoZ: Math.max(0, (p.hidden.ego - 50) / 50), frag: Math.max(0, (50 - p.hidden.composure) / 50),
  };
}
const cost = (c: Cx, base: number) => Math.max(100, Math.round(base * c.s / 100) * 100);
const psych = (c: Cx, label: string): Opt => (c.sb.hasPsychologist ? { id: 'psych', label: `${label} with the team psychologist`, hint: 'Issue eases quickly · trust up' } : { id: 'psych', label: `${label} with an outside psychologist`, hint: `${money(cost(c, 3000))} · issue eases quickly` });
const psychFx = (c: Cx): Fx => (c.sb.hasPsychologist ? {} : { cash: -cost(c, 3000), cat: 'Player welfare' });
const away = (c: Cx, n: number, reason: string) => sendAway(c.state, c.ps, c.team, c.p, n, reason);
const follow = (c: Cx, n: number, key: string, data?: Data) => { c.ps.follow.push({ date: addDays(c.state.date, n), pid: c.p.id, key, data }); };
const chance = (rng: RNG, x: number) => rng.chance(clamp(x, 0.05, 0.95));
/** Does tough love land? Professionals and composed players take it; fragile players and big egos don't. */
const toughLands = (c: Cx, rng: RNG, base = 0.45) => chance(rng, base + c.proZ * 0.3 - c.frag * 0.4 - c.egoZ * 0.3 + c.trustZ * 0.2);
const matchesWithin = (state: GameState, teamId: string, n: number) => {
  const until = addDays(state.date, n);
  let next: MatchFixture | undefined;
  for (const f of Object.values(state.fixtures)) if (!f.result && (f.teamA === teamId || f.teamB === teamId) && f.date >= state.date && f.date <= until && (!next || f.date < next.date)) next = f;
  return next;
};
const isBig = (state: GameState, f: MatchFixture) => { const c = state.competitions[f.competitionId]; return !!c && (c.tier === 0 || c.kind === 'playoffs' || /Final/.test(f.label ?? '')); };
function worstPair(c: Cx) {
  let best: { q: Player; pr: PairState } | null = null;
  for (const q of rosterOf(c.state, c.team)) {
    if (q.id === c.p.id) continue;
    const pr = c.ps.pairs[pairKey(c.p.id, q.id)];
    if (pr && (!best || pr.aff - pr.heat < best.pr.aff - best.pr.heat)) best = { q, pr };
  }
  return best;
}
function bestPair(c: Cx) {
  let best: { q: Player; pr: PairState } | null = null;
  for (const q of rosterOf(c.state, c.team)) {
    if (q.id === c.p.id) continue;
    const pr = c.ps.pairs[pairKey(c.p.id, q.id)];
    if (pr && (!best || pr.aff > best.pr.aff)) best = { q, pr };
  }
  return best;
}
const mateOf = (c: Cx, req: PlayerRequest) => c.state.players[String(req.data?.mateId ?? '')];
function newPromise(c: Cx, pm: Omit<PersonPromise, 'made' | 'status'>) {
  c.me.promises.unshift({ ...pm, made: c.state.date, status: 'open' });
  if (c.me.promises.length > 6) c.me.promises.length = 6;
}

const APPROACHES: Record<string, Approach> = {
  slump: {
    title: 'Not feeling it', cd: 40, personal: true, issue: ['slump', 1, 2, 10, 18],
    weight: (c) => (c.p.form < -3 ? 0.35 + (-c.p.form - 3) / 5 : 0) + (c.p.morale < 40 ? 0.4 : 0),
    opts: (c) => [
      { id: 'rest', label: 'Take a few days off', hint: 'Away 3 days · fatigue down · eases the slump' },
      { id: 'vod', label: 'One-on-one VOD sessions with you', hint: 'Form up if they buy in · trust up' },
      psych(c, 'Sessions'),
      { id: 'tough', label: 'Grind through it — that’s the job', hint: 'Works on professionals; risky otherwise' },
    ],
    fallback: 'tough',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'rest') { ease(c.state, c.me, 'slump', -1); return { out: 'rest', fx: { fatigue: -20, morale: 4, trust: 2 }, note: away(c, 3, 'rest days') }; }
      if (opt === 'vod') { const g = chance(rng, 0.55 + c.proZ * 0.25 + c.trustZ * 0.2); if (g) ease(c.state, c.me, 'slump', -1); return { out: 'vod', fx: { form: g ? 1.5 : 0.5, trust: 3, fatigue: 4, morale: 2 } }; }
      if (opt === 'psych') { ease(c.state, c.me, 'slump', c.sb.hasPsychologist ? -2 : -1); return { out: 'psych', fx: { morale: 4, trust: 2, ...psychFx(c) } }; }
      return toughLands(c, rng) ? { out: 'tough_good', fx: { form: 1, trust: 1 } } : { out: 'tough_bad', fx: { morale: -5, trust: -4, feel: 'hurt' } };
    },
  },
  burnout: {
    title: 'Burnout', cd: 30, issue: ['burnout', 1, 2, 10, 16],
    weight: (c) => (c.p.fatigue > 62 ? (c.p.fatigue - 58) / 10 : 0),
    opts: () => [
      { id: 'break', label: 'Three days off', hint: 'Away 3 days · fatigue −30 · ends the burnout' },
      { id: 'lighten', label: 'Lighter personal schedule for two weeks', hint: 'Fatigue −15 · eases it' },
      { id: 'push', label: 'We need you now — push through', hint: 'Risky: it can get worse' },
    ],
    fallback: 'push',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'break') { ease(c.state, c.me, 'burnout', -3); return { out: 'break', fx: { fatigue: -30, morale: 4, trust: 3, feel: 'grateful' }, note: away(c, 3, 'rest days') }; }
      if (opt === 'lighten') { ease(c.state, c.me, 'burnout', -1); return { out: 'lighten', fx: { fatigue: -15, morale: 2, trust: 2 } }; }
      if (chance(rng, 0.35 + c.proZ * 0.3 + (c.p.hidden.workEthic - 50) / 100)) return { out: 'push_good', fx: { morale: -1 } };
      ease(c.state, c.me, 'burnout', 1);
      return { out: 'push_bad', fx: { morale: -4, trust: -4, fatigue: 5 } };
    },
  },
  family: {
    title: 'Family emergency', cd: 90, personal: true, issue: ['family', 2, 2, 10, 16],
    weight: () => 0.12,
    data: (_c, rng) => ({ relative: rng.pick(RELATIVES) }),
    opts: (c) => [
      { id: 'leave', label: 'Go home — take the time you need', hint: 'Away 5 days · a sub starts if available' },
      { id: 'help', label: 'Go home — the club pays the flights', hint: `${money(cost(c, 6000))} · away 5 days · big trust boost` },
      { id: 'remote', label: 'Stay, with a flexible schedule and daily calls home', hint: 'Plays distracted for a while' },
      { id: 'wait', label: 'Ask them to wait until after the next match', hint: 'Trust drops · badly distracted' },
    ],
    fallback: 'remote',
    resolve: (c, req, opt, rng) => {
      const better = () => { if (rng.chance(0.7)) follow(c, 12, 'family_better', { relative: String(req.data?.relative ?? 'family') }); };
      if (opt === 'leave' || opt === 'help') {
        const i = c.me.issues.find((x) => x.kind === 'family' && x.until >= c.state.date);
        if (i) { i.sev = 1; i.until = addDays(c.state.date, 9); i.treated = true; }
        better();
        return { out: opt, fx: opt === 'help' ? { trust: 9, morale: 3, feel: 'grateful', cash: -cost(c, 6000), cat: 'Player welfare' } : { trust: 6, morale: 2, feel: 'grateful' }, note: away(c, 5, 'family leave') };
      }
      if (opt === 'remote') { better(); return { out: 'remote', fx: { trust: 2 } }; }
      addIssue(c.state, c.me, 'family', 3, 7);
      return { out: 'wait', fx: { trust: -6, morale: -3, feel: 'hurt' } };
    },
  },
  grief: {
    title: 'Bereavement', cd: 200, personal: true, issue: ['grief', 3, 3, 10, 14],
    weight: () => 0.04,
    data: (_c, rng) => ({ relative: rng.pick(LOST_RELATIVES) }),
    opts: (c) => [
      { id: 'leave', label: 'Of course — go home for a week', hint: 'Away 7 days' },
      { id: 'decide', label: 'Tell them it’s completely their call', hint: 'They choose whether to play' },
      psych(c, 'Go home, then grief counselling'),
    ],
    fallback: 'leave',
    resolve: (c, _r, opt, rng) => {
      const i = c.me.issues.find((x) => x.kind === 'grief' && x.until >= c.state.date);
      if (opt === 'leave') { if (i) { i.sev = 2; i.until = addDays(c.state.date, 14); } return { out: 'leave', fx: { trust: 8, feel: 'grateful' }, note: away(c, 7, 'funeral') }; }
      if (opt === 'decide') {
        if (rng.chance(0.6)) { if (i) i.sev = 2; return { out: 'decide_go', fx: { trust: 7 }, note: away(c, 4, 'funeral') }; }
        if (i) i.sev = 2;
        return { out: 'decide_stay', fx: { trust: 5, morale: 2 } };
      }
      if (i) { i.sev = 1; i.until = addDays(c.state.date, 12); i.treated = true; }
      return { out: 'psych', fx: { trust: 8, ...psychFx(c) }, note: away(c, 6, 'funeral') };
    },
  },
  breakup: {
    title: 'Relationship trouble', cd: 120, personal: true, issue: ['breakup', 1, 2, 12, 20],
    weight: (c) => (c.age >= 19 ? 0.12 : 0.04),
    data: (_c, rng) => ({ partner: rng.pick(PARTNERS) }),
    opts: (c) => [
      { id: 'listen', label: 'Take them for a coffee and just listen', hint: 'Trust up · eases it' },
      { id: 'dayoff', label: 'Give them two days off', hint: 'Away 2 days' },
      { id: 'focus', label: 'Tell them to channel it into the game', hint: 'Can work on composed pros' },
      psych(c, 'A session'),
    ],
    fallback: 'focus',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'listen') { ease(c.state, c.me, 'breakup', -1); follow(c, 12, 'breakup_better'); return { out: 'listen', fx: { trust: 5, morale: 3 } }; }
      if (opt === 'dayoff') { ease(c.state, c.me, 'breakup', -1, 10); return { out: 'dayoff', fx: { morale: 3, trust: 3, fatigue: -8 }, note: away(c, 2, 'personal leave') }; }
      if (opt === 'psych') { ease(c.state, c.me, 'breakup', c.sb.hasPsychologist ? -2 : -1); return { out: 'psych', fx: { morale: 2, trust: 2, ...psychFx(c) } }; }
      if (chance(rng, 0.35 + c.proZ * 0.3 + (c.p.hidden.composure - 50) / 100)) { ease(c.state, c.me, 'breakup', -1); return { out: 'focus_good', fx: { form: 0.8, morale: 1 } }; }
      return { out: 'focus_bad', fx: { trust: -4, morale: -3 } };
    },
  },
  sick: {
    title: 'Illness', cd: 30, issue: ['sick', 2, 2, 4, 6],
    weight: (c) => 0.22 * (/-(12|01|02)-/.test(c.state.date) ? 1.6 : 1) * (1 + c.p.fatigue / 100),
    opts: (c) => [
      { id: 'rest', label: 'Rest until you’re better', hint: 'Away 3 days · a sub starts if available' },
      { id: 'doctor', label: 'Club doctor and light practice', hint: `${money(cost(c, 1500))} · milder, shorter illness` },
      { id: 'play', label: 'Play through it', hint: 'Ill for longer · may get worse' },
    ],
    fallback: 'play',
    resolve: (c, _r, opt) => {
      if (opt === 'rest') { ease(c.state, c.me, 'sick', 0, 3); return { out: 'rest', fx: { fatigue: -10, trust: 2 }, note: away(c, 3, 'illness') }; }
      if (opt === 'doctor') { ease(c.state, c.me, 'sick', -1, 4); return { out: 'doctor', fx: { trust: 2, cash: -cost(c, 1500), cat: 'Player welfare' } }; }
      follow(c, 3, 'sick_check');
      return { out: 'play', fx: { fatigue: 5 } };
    },
  },
  sick_worse: {
    title: 'Illness (worse)', cd: 0, issue: ['sick', 3, 3, 5, 7],
    weight: () => 0,
    opts: () => [{ id: 'rest', label: 'Rest now', hint: 'Away 3 days' }, { id: 'play', label: 'Keep playing', hint: 'Badly ill for a week · trust drops' }],
    fallback: 'rest',
    resolve: (c, _r, opt) => {
      if (opt === 'rest') { ease(c.state, c.me, 'sick', -1, 3); return { out: 'rest', fx: { trust: 1, fatigue: -10 }, note: away(c, 3, 'illness') }; }
      return { out: 'play', fx: { morale: -3, trust: -3 } };
    },
  },
  wrist: {
    title: 'Wrist pain', cd: 60, issue: ['wrist', 1, 2, 12, 20],
    weight: (c) => (c.p.hidden.injuryProne / 100) * 0.45 * (1 + c.p.fatigue / 80),
    opts: (c) => [
      { id: 'physio', label: 'Physio and reduced practice', hint: `${money(cost(c, 2500))} · eases within ~10 days` },
      { id: 'rest', label: 'Full rest for a week', hint: 'Away 7 days · heals properly' },
      { id: 'play', label: 'Painkillers and play', hint: 'Risk of a worse injury' },
    ],
    fallback: 'play',
    resolve: (c, _r, opt) => {
      if (opt === 'physio') { ease(c.state, c.me, 'wrist', -1, 10); return { out: 'physio', fx: { fatigue: -5, trust: 2, cash: -cost(c, 2500), cat: 'Player welfare' } }; }
      if (opt === 'rest') { ease(c.state, c.me, 'wrist', -1, 7); return { out: 'rest', fx: { trust: 3, fatigue: -12 }, note: away(c, 7, 'injury rest') }; }
      follow(c, 6, 'wrist_check');
      return { out: 'play', fx: { morale: -1 } };
    },
  },
  wrist_worse: {
    title: 'Wrist injury (worse)', cd: 0, issue: ['wrist', 3, 3, 14, 21],
    weight: () => 0,
    opts: () => [{ id: 'rest', label: 'Shut it down for ten days', hint: 'Away 10 days · heals' }, { id: 'play', label: 'Keep playing with tape', hint: 'Badly hampered for weeks · trust drops' }],
    fallback: 'rest',
    resolve: (c, _r, opt) => {
      if (opt === 'rest') { ease(c.state, c.me, 'wrist', -2, 12); return { out: 'rest', fx: { trust: 2 }, note: away(c, 10, 'injury rest') }; }
      return { out: 'play', fx: { trust: -4, morale: -4 } };
    },
  },
  back: {
    title: 'Back pain', cd: 90, issue: ['back', 1, 1, 14, 24],
    weight: (c) => (c.p.hidden.injuryProne / 100) * 0.22 + (c.age > 24 ? 0.08 : 0),
    opts: (c) => [
      { id: 'chair', label: 'Buy them a proper ergonomic setup', hint: `${money(cost(c, 1500))} · fixes it within days` },
      { id: 'physio', label: 'Physio sessions', hint: `${money(cost(c, 2500))} · eases over a week` },
      { id: 'ignore', label: 'Stretch more — you’ll be fine', hint: 'Free' },
    ],
    fallback: 'ignore',
    resolve: (c, _r, opt) => {
      if (opt === 'chair') { ease(c.state, c.me, 'back', 0, 4); return { out: 'chair', fx: { trust: 2, morale: 2, cash: -cost(c, 1500), cat: 'Player welfare' } }; }
      if (opt === 'physio') { ease(c.state, c.me, 'back', 0, 8); return { out: 'physio', fx: { trust: 2, cash: -cost(c, 2500), cat: 'Player welfare' } }; }
      return { out: 'ignore', fx: { trust: -2 } };
    },
  },
  homesick: {
    title: 'Homesick', cd: 75, personal: true, issue: ['homesick', 1, 2, 21, 35],
    weight: (c) => (c.imp ? 0.5 + (days(c.me.joined, c.state.date) < 120 ? 0.35 : 0) + (c.p.hidden.composure < 50 ? 0.2 : 0) : c.abroad ? 0.12 : 0),
    opts: (c) => [
      { id: 'family', label: 'Fly their family over for a week', hint: `${money(cost(c, 10000))} · ends it · big morale boost` },
      { id: 'trip', label: 'A short trip home', hint: 'Away 4 days' },
      { id: 'chef', label: 'Hire a cook who makes food from home', hint: `${money(cost(c, 5000))} · whole squad enjoys it` },
      { id: 'tough', label: 'It’s part of being a pro abroad', hint: 'Free · lands only with composed players' },
    ],
    fallback: 'tough',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'family') { ease(c.state, c.me, 'homesick', 0, 7); follow(c, 8, 'family_visit'); return { out: 'family', fx: { trust: 7, morale: 6, feel: 'happy', cash: -cost(c, 10000), cat: 'Player welfare' } }; }
      if (opt === 'trip') { ease(c.state, c.me, 'homesick', -1, 10); return { out: 'trip', fx: { morale: 5, trust: 4 }, note: away(c, 4, 'trip home') }; }
      if (opt === 'chef') { ease(c.state, c.me, 'homesick', -1); return { out: 'chef', fx: { morale: 4, trust: 3, teamMorale: 1, cash: -cost(c, 5000), cat: 'Player welfare' } }; }
      if (chance(rng, 0.3 + (c.p.hidden.composure - 50) / 100 + c.trustZ * 0.2)) { ease(c.state, c.me, 'homesick', -1); return { out: 'tough_good', fx: {} }; }
      return { out: 'tough_bad', fx: { trust: -4, morale: -4 } };
    },
  },
  playtime: {
    title: 'Playing time', cd: 30,
    weight: (c) => (!c.starter && !(c.me.away && c.me.away.until >= c.state.date) && !c.me.promises.some((x) => x.kind === 'playtime' && x.status === 'open') ? 0.6 + Math.max(0, c.p.hidden.ego - 50) / 25 + (c.p.personality.ambition - 50) / 100 : 0),
    opts: () => [
      { id: 'promise', label: 'Promise them starts in the next three weeks', hint: 'Two starts in 21 days — or trust collapses' },
      { id: 'explain', label: 'Explain honestly where they stand', hint: 'Respected by professionals' },
      { id: 'earn', label: 'Tell them to earn it in scrims', hint: 'Motivates hard workers; big egos resent it' },
      { id: 'free', label: 'Say you won’t block a move if a team comes in', hint: 'Morale up · they start looking around' },
    ],
    fallback: 'earn',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'promise') { newPromise(c, { kind: 'playtime', text: 'two starts within three weeks', deadline: addDays(c.state.date, 21), need: 2, got: 0 }); return { out: 'promise', fx: { morale: 6, trust: 4, feel: 'hopeful' } }; }
      if (opt === 'explain') return chance(rng, 0.4 + c.proZ * 0.3 + c.trustZ * 0.2 - c.egoZ * 0.2) ? { out: 'explain_good', fx: { trust: 3, morale: -1 } } : { out: 'explain_bad', fx: { morale: -4, trust: -2 } };
      if (opt === 'earn') return chance(rng, 0.35 + (c.p.hidden.workEthic - 50) / 100 * 0.6 - c.egoZ * 0.3) ? { out: 'earn_good', fx: { form: 0.8, morale: 1 } } : { out: 'earn_bad', fx: { morale: -5, trust: -3, feel: 'resentful' } };
      c.p.hidden.loyalty = clamp(c.p.hidden.loyalty - 3, 1, 99);
      return { out: 'free', fx: { morale: 3, trust: 1 } };
    },
  },
  stream: {
    title: 'Streaming', cd: 100,
    weight: (c) => (c.p.streamer ? 0.25 : 0) + (has(c.p, 'fan_favorite') ? 0.15 : 0) + (c.p.reputation > 75 ? 0.08 : 0),
    opts: () => [
      { id: 'allow', label: 'Sure — go live more', hint: 'Hype & fans up · a bit more fatigue' },
      { id: 'limit', label: 'Weekends and off-days only', hint: 'A fair middle ground' },
      { id: 'refuse', label: 'No — focus on practice', hint: 'They won’t love it' },
    ],
    fallback: 'limit',
    resolve: (c, _r, opt) => {
      if (opt === 'allow') { c.team.fans = Math.round(c.team.fans * 1.004); return { out: 'allow', fx: { hype: 3, morale: 4, trust: 2, fatigue: 4 } }; }
      if (opt === 'limit') return { out: 'limit', fx: { morale: 1, trust: 1 } };
      return { out: 'refuse', fx: { morale: -3, trust: c.proZ > 0.4 ? -1 : -2 } };
    },
  },
  champ: {
    title: 'Champion pool', cd: 45,
    weight: (c) => (has(c.p, 'one_trick') ? 0.5 : 0) + Math.max(0, c.p.hidden.ego - 55) / 60 + (c.p.form < -1 ? 0.15 : 0),
    data: (c) => { const top = Object.entries(c.p.champions).sort((a, b) => b[1] - a[1])[0]; return top ? { champ: champName(top[0]), champId: top[0] } : null; },
    opts: () => [
      { id: 'main', label: 'Draft around their comfort picks more', hint: 'Mastery & morale up' },
      { id: 'meta', label: 'The meta comes first — learn the picks', hint: 'Adaptable players accept it' },
      { id: 'compromise', label: 'Meta first, {champ} when it fits', hint: 'A fair middle ground' },
    ],
    fallback: 'compromise',
    resolve: (c, req, opt, rng) => {
      const id = String(req.data?.champId ?? '');
      if (opt === 'main') { if (id) c.p.champions[id] = clamp((c.p.champions[id] ?? 110) + 5, 1, 200); return { out: 'main', fx: { morale: 5, trust: 3 } }; }
      if (opt === 'meta') return chance(rng, 0.35 + (c.p.attributes.adaptability - 60) / 60 + c.proZ * 0.2 - c.egoZ * 0.3) ? { out: 'meta_good', fx: { form: 0.3 } } : { out: 'meta_bad', fx: { morale: -4, trust: -3 } };
      if (id) c.p.champions[id] = clamp((c.p.champions[id] ?? 110) + 2, 1, 200);
      return { out: 'compromise', fx: { morale: 2, trust: 2 } };
    },
  },
  conflict: {
    title: 'Conflict with a teammate', cd: 21,
    weight: (c) => { const w = worstPair(c); return w && (w.pr.aff <= -25 || w.pr.heat >= 30) ? 1.1 + w.pr.heat / 50 : 0; },
    data: (c) => { const w = worstPair(c); return w ? { mate: w.q.handle, mateId: w.q.id } : null; },
    opts: () => [
      { id: 'mediate', label: 'Sit them both down and mediate', hint: 'Can fix it — or make it worse' },
      { id: 'side', label: 'Back them — talk to {mate}', hint: 'Trust up with them, down with {mate}' },
      { id: 'sortout', label: 'Tell them to sort it out like adults', hint: 'Coin flip' },
      { id: 'meeting', label: 'Address it in a team meeting', hint: 'Clears the air for everyone — or not' },
    ],
    fallback: 'sortout',
    resolve: (c, req, opt, rng) => {
      const q = mateOf(c, req);
      if (!q || q.teamId !== c.team.id) return { out: 'sortout_good', fx: {} };
      const pr = pairOf(c.ps, c.p.id, q.id, c.state.date);
      if (opt === 'mediate') { const r = mediation(c.state, c.ps, c.team, c.p, q, rng, 0.1); return r === 'neg' ? { out: 'mediate_bad', fx: { trust: -2 } } : { out: 'mediate_good', fx: { trust: 3, morale: 2 } }; }
      if (opt === 'side') {
        pr.aff = clamp(pr.aff - 8, -100, 100); pr.heat = clamp(pr.heat + 10, 0, 100);
        const pq = c.ps.players[q.id]; if (pq) pq.trust = clamp(pq.trust - 6, 0, 100);
        return { out: 'side', fx: { trust: 4, morale: 2 }, note: `${q.handle}’s trust −6` };
      }
      if (opt === 'meeting') {
        if (chance(rng, 0.5 + c.trustZ * 0.2)) { pr.heat = Math.max(0, pr.heat - 25); pr.aff = clamp(pr.aff + 8, -100, 100); return { out: 'meeting', fx: { chem: 1 } }; }
        pr.heat = clamp(pr.heat + 5, 0, 100);
        return { out: 'meeting', fx: { chem: -1 } };
      }
      if (chance(rng, 0.35 + compat(c.state, c.p, q) * 0.4 + (c.p.hidden.professionalism + q.hidden.professionalism - 120) / 200)) { pr.heat = Math.max(0, pr.heat - 20); pr.aff = clamp(pr.aff + 8, -100, 100); return { out: 'sortout_good', fx: {} }; }
      pr.heat = clamp(pr.heat + 15, 0, 100); pr.aff = clamp(pr.aff - 6, -100, 100);
      return { out: 'sortout_bad', fx: { trust: -1 } };
    },
  },
  contract: {
    title: 'Contract worries', cd: 45, issue: ['contract', 1, 1, 30, 60],
    weight: (c) => {
      const exp = c.p.contract?.expires;
      if (!exp || c.me.promises.some((x) => x.kind === 'renew' && x.status === 'open')) return 0;
      const left = days(c.state.date, exp);
      return left > 0 && left < 150 ? 0.55 + (c.p.personality.ambition - 50) / 100 : 0;
    },
    data: (c) => ({ months: Math.max(1, Math.round(days(c.state.date, c.p.contract!.expires) / 30)) }),
    opts: () => [
      { id: 'talks', label: 'Promise renewal talks soon', hint: 'Renew before it runs out — or trust drops' },
      { id: 'honest', label: 'Be honest: no decision yet', hint: 'Professionals respect it' },
      { id: 'deflect', label: 'Focus on the games for now', hint: 'Trust drops' },
    ],
    fallback: 'deflect',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'talks') {
        const exp = c.p.contract!.expires;
        newPromise(c, { kind: 'renew', text: 'contract talks before your deal runs out', deadline: [addDays(c.state.date, 60), addDays(exp, -3)].sort()[0], base: Number(exp.replace(/-/g, '')) });
        ease(c.state, c.me, 'contract', -3);
        return { out: 'talks', fx: { trust: 4, morale: 3 } };
      }
      if (opt === 'honest') return chance(rng, 0.45 + c.proZ * 0.3 + c.trustZ * 0.2) ? { out: 'honest_good', fx: { trust: 2 } } : { out: 'honest_bad', fx: { morale: -3, trust: -1 } };
      return { out: 'deflect', fx: { trust: -3, morale: -2 } };
    },
  },
  raise: {
    title: 'Salary', cd: 90,
    weight: (c) => {
      if (!c.p.contract || c.me.promises.some((x) => x.kind === 'raise' && x.status === 'open')) return 0;
      const performing = c.p.form > 2 || c.p.season.mvps >= 2;
      return performing && c.p.contract.salary < salaryDemand(c.state, c.p, c.team) * 0.75 ? 0.45 + c.egoZ * 0.4 : 0;
    },
    data: (c) => ({ amount: money(Math.round((c.p.contract?.salary ?? 0) * 0.1 / 1000) * 1000), amountN: Math.round((c.p.contract?.salary ?? 0) * 0.1 / 1000) * 1000 }),
    opts: () => [
      { id: 'bonus', label: 'One-off performance bonus ({amount})', hint: 'Feels valued' },
      { id: 'later', label: 'We’ll fix it in your next contract', hint: 'A promise — renew with a raise' },
      { id: 'refuse', label: 'Your contract is your contract', hint: 'Trust & morale drop' },
    ],
    fallback: 'refuse',
    resolve: (c, req, opt) => {
      if (opt === 'bonus') return { out: 'bonus', fx: { morale: 6, trust: 5, cash: -Number(req.data?.amountN ?? 0), cat: 'Player bonuses' } };
      if (opt === 'later') { newPromise(c, { kind: 'raise', text: 'a raise in your next contract', deadline: c.p.contract!.expires, base: c.p.contract!.salary }); return { out: 'later', fx: { morale: 2, trust: 1 } }; }
      return { out: 'refuse', fx: { morale: -5, trust: c.proZ > 0.4 ? -2 : -4 } };
    },
  },
  visa: {
    title: 'Visa stress', cd: 150, issue: ['visa', 1, 1, 14, 21],
    weight: (c) => (c.imp ? 0.16 : 0),
    opts: (c) => [
      { id: 'lawyer', label: 'Hire an immigration lawyer', hint: `${money(cost(c, 4000))} · sorted within days` },
      { id: 'personally', label: 'Help them with it personally', hint: 'Trust up · takes a while' },
      { id: 'self', label: 'They’ll have to sort it out themselves', hint: 'Free · stressful' },
    ],
    fallback: 'self',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'lawyer') { ease(c.state, c.me, 'visa', 0, 3); return { out: 'lawyer', fx: { trust: 4, cash: -cost(c, 4000), cat: 'Player welfare' } }; }
      if (opt === 'personally') { ease(c.state, c.me, 'visa', 0, 10); return { out: 'personally', fx: { trust: 6 } }; }
      addIssue(c.state, c.me, 'visa', 2, 14);
      if (rng.chance(0.25)) follow(c, 5, 'visa_trip');
      return { out: 'self', fx: { trust: -2 } };
    },
  },
  celebrate: {
    title: 'Good news', cd: 120,
    weight: () => 0.13,
    data: (_c, rng) => ({ event: rng.pick(CELEBRATIONS) }),
    opts: (c) => [
      { id: 'attend', label: 'Give them two days off to be there', hint: 'Away 2 days · morale & trust up' },
      { id: 'gift', label: 'Send a gift from the club', hint: `${money(cost(c, 800))} · they stay` },
      { id: 'congrats', label: 'Congratulate them warmly', hint: 'But no time off' },
    ],
    fallback: 'congrats',
    resolve: (c, _r, opt) => {
      if (opt === 'attend') { follow(c, 3, 'celebrate_photo'); return { out: 'attend', fx: { morale: 6, trust: 5, feel: 'happy' }, note: away(c, 2, 'family event') }; }
      if (opt === 'gift') return { out: 'gift', fx: { morale: 4, trust: 4, cash: -cost(c, 800), cat: 'Player welfare' } };
      return { out: 'congrats', fx: { morale: -1, trust: -1 } };
    },
  },
  feedback: {
    title: 'Asking for feedback', cd: 40,
    weight: (c) => (c.p.hidden.professionalism > 70 ? 0.15 : 0.04) + (has(c.p, 'rookie') || c.age < 20 ? 0.18 : 0) + (c.p.hidden.workEthic > 70 ? 0.08 : 0),
    opts: () => [
      { id: 'honest', label: 'Give blunt, detailed feedback', hint: 'Form up if they can take it' },
      { id: 'positive', label: 'Focus on the positives', hint: 'Morale up' },
      { id: 'vod', label: 'Book a VOD session together', hint: 'Form & trust up · fatigue +5' },
      { id: 'later', label: 'Maybe later — busy week', hint: 'Trust drops' },
    ],
    fallback: 'later',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'honest') return chance(rng, 0.45 + c.proZ * 0.35 - c.egoZ * 0.3 - c.frag * 0.3) ? { out: 'honest_good', fx: { form: 1.2, trust: 4 } } : { out: 'honest_bad', fx: { morale: -4, trust: -1 } };
      if (opt === 'positive') return { out: 'positive', fx: { morale: 3, trust: 1 } };
      if (opt === 'vod') return { out: 'vod', fx: { form: 1, trust: 4, fatigue: 5 } };
      return { out: 'later', fx: { trust: -3, morale: -1 } };
    },
  },
  fans: {
    title: 'Online abuse', cd: 30, issue: ['fans', 1, 2, 7, 12],
    weight: (c) => {
      const cut = addDays(c.state.date, -5);
      const toxic = (c.state.fanPulse?.posts ?? []).filter((x) => x.playerId === c.p.id && x.sentiment <= -1 && x.date >= cut).length;
      const last = recentSeries(c.state, c.ps);
      return Math.min(2, toxic * 0.5) + (last && (last.perf[c.p.id] ?? 0) <= -3 && c.p.reputation > 55 ? 0.25 : 0);
    },
    opts: () => [
      { id: 'break', label: 'Social media break — staff run their accounts', hint: 'Ends it · tiny hype dip' },
      { id: 'statement', label: 'Public club statement backing them', hint: 'Trust & morale up' },
      { id: 'ignore', label: 'Tell them to grow a thick skin', hint: 'Lands only with composed players' },
    ],
    fallback: 'ignore',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'break') { ease(c.state, c.me, 'fans', -3); return { out: 'break', fx: { morale: 3, trust: 2, hype: -1 } }; }
      if (opt === 'statement') { ease(c.state, c.me, 'fans', -1); return { out: 'statement', fx: { morale: 4, trust: 6, hype: 1 } }; }
      if (chance(rng, c.p.hidden.composure / 100)) { ease(c.state, c.me, 'fans', -1); return { out: 'ignore_good', fx: {} }; }
      ease(c.state, c.me, 'fans', 1);
      return { out: 'ignore_bad', fx: { trust: -3, morale: -3 } };
    },
  },
  confession: {
    title: 'Apology after a loss', cd: 21,
    weight: (c) => { const l = recentSeries(c.state, c.ps); return l && !l.won && l.worst === c.p.id && days(l.date, c.state.date) <= 2 && c.p.hidden.professionalism > 55 ? 1.2 : 0; },
    opts: () => [
      { id: 'reassure', label: 'Reassure them — we win and lose as a team', hint: 'Morale & trust up' },
      { id: 'review', label: 'Agree, and review it together tomorrow', hint: 'Form & trust up' },
      { id: 'scold', label: 'Yes — and it can’t happen again', hint: 'Lands only with tough pros' },
    ],
    fallback: 'reassure',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'reassure') return { out: 'reassure', fx: { morale: 4, trust: 4, feel: 'reassured' } };
      if (opt === 'review') return { out: 'review', fx: { form: 1, trust: 3, morale: 1 } };
      return toughLands(c, rng, 0.3) ? { out: 'scold_good', fx: { form: 0.8 } } : { out: 'scold_bad', fx: { morale: -6, trust: -5, feel: 'hurt' } };
    },
  },
  nerves: {
    title: 'Big-match nerves', cd: 30, issue: ['nerves', 1, 2, 4, 6],
    weight: (c) => {
      if (!(c.age < 20 || has(c.p, 'rookie') || has(c.p, 'big_stage_nerves')) || !c.starter) return 0;
      const f = matchesWithin(c.state, c.team.id, 4);
      return f && isBig(c.state, f) ? 1 + (has(c.p, 'big_stage_nerves') ? 0.6 : 0) : 0;
    },
    data: (c) => { const f = matchesWithin(c.state, c.team.id, 4); const o = f ? c.state.teams[f.teamA === c.team.id ? f.teamB! : f.teamA!] : undefined; return o ? { opp: o.name } : null; },
    opts: (c) => [
      { id: 'calm', label: 'Calm talk: you’ve earned this', hint: 'Works if they trust you' },
      { id: 'routine', label: 'Give them a pre-game routine', hint: 'Eases the nerves' },
      psych(c, 'A session'),
    ],
    fallback: 'calm',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'calm') { if (chance(rng, 0.45 + c.trustZ * 0.3 + (c.sb.motivation - 50) / 100)) { ease(c.state, c.me, 'nerves', -3); return { out: 'calm_good', fx: { morale: 2, trust: 1 } }; } return { out: 'calm_bad', fx: {} }; }
      if (opt === 'routine') { ease(c.state, c.me, 'nerves', -1); return { out: 'routine', fx: { trust: 2 } }; }
      ease(c.state, c.me, 'nerves', -3);
      return { out: 'psych', fx: { trust: 2, ...psychFx(c) } };
    },
  },
  leader: {
    title: 'Wants more responsibility', cd: 120,
    weight: (c) => ((has(c.p, 'shotcaller') || has(c.p, 'veteran')) && c.p.personality.ambition > 55 ? 0.22 : c.p.personality.ambition > 75 ? 0.07 : 0),
    opts: () => [
      { id: 'yes', label: 'Give them the comms lead', hint: 'Trust & morale up · other leaders may bristle' },
      { id: 'share', label: 'More say in draft prep, comms unchanged', hint: 'A middle ground' },
      { id: 'no', label: 'Keep the current structure', hint: 'They’ll be disappointed' },
    ],
    fallback: 'share',
    resolve: (c, _r, opt) => {
      if (opt === 'yes') {
        c.p.attributes.shotcalling = clampRating(c.p.attributes.shotcalling + 1);
        for (const q of rosterOf(c.state, c.team)) if (q.id !== c.p.id && has(q, 'shotcaller')) q.morale = clamp(q.morale - 3, 5, 100);
        return { out: 'yes', fx: { trust: 5, morale: 5, feel: 'fired' } };
      }
      if (opt === 'share') return { out: 'share', fx: { trust: 2, morale: 2 } };
      return { out: 'no', fx: { trust: c.egoZ > 0.3 ? -4 : -2, morale: -3 } };
    },
  },
  bond: {
    title: 'Teammate request', cd: 60,
    weight: (c) => { const b = bestPair(c); return b && b.pr.aff >= 40 && !(b.pr.duoQ && b.pr.duoQ >= c.state.date) ? (synergy(c.p.role, b.q.role) >= 0.6 ? 0.55 : 0.3) : 0; },
    data: (c) => { const b = bestPair(c); return b ? { mate: b.q.handle, mateId: b.q.id } : null; },
    opts: () => [{ id: 'yes', label: 'Go for it', hint: 'Paired up for a month · bond grows faster' }, { id: 'no', label: 'Keep the current setup', hint: 'Slight disappointment' }],
    fallback: 'yes',
    resolve: (c, req, opt) => {
      const q = mateOf(c, req);
      if (opt === 'yes' && q && q.teamId === c.team.id) {
        const pr = pairOf(c.ps, c.p.id, q.id, c.state.date);
        pr.duoQ = addDays(c.state.date, 30); pr.aff = clamp(pr.aff + 6, -100, 100);
        q.morale = clamp(q.morale + 2, 5, 100);
        return { out: 'yes', fx: { morale: 2, trust: 1 } };
      }
      return { out: 'no', fx: { morale: -1 } };
    },
  },
  schedule: {
    title: 'Training load', cd: 45,
    weight: (c) => (c.p.fatigue > 50 && c.state.trainingPlan?.intensity === 'intense' ? 0.6 : c.p.fatigue > 60 ? 0.22 : 0),
    opts: () => [
      { id: 'ease', label: 'Give them a lighter personal schedule', hint: 'Fatigue −12' },
      { id: 'explain', label: 'Explain why the schedule is what it is', hint: 'Professionals accept it' },
      { id: 'refuse', label: 'The schedule stays', hint: 'Trust drops' },
    ],
    fallback: 'refuse',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'ease') return { out: 'ease', fx: { fatigue: -12, morale: 2, trust: 3 } };
      if (opt === 'explain') return chance(rng, 0.45 + c.proZ * 0.3 + c.trustZ * 0.2) ? { out: 'explain_good', fx: { trust: 2 } } : { out: 'explain_bad', fx: { morale: -2 } };
      return { out: 'refuse', fx: { morale: -3, trust: -3 } };
    },
  },
  military: {
    title: 'Military service', cd: 180, personal: true, issue: ['military', 1, 1, 20, 30],
    weight: (c) => (c.p.country === 'South Korea' && c.age >= 24 ? 0.2 + (c.age >= 26 ? 0.15 : 0) : 0),
    opts: () => [
      { id: 'support', label: 'The club will support whatever you decide', hint: 'Trust up · ends the worry' },
      { id: 'plan', label: 'Plan your career around it together', hint: 'Trust & morale up' },
      { id: 'focus', label: 'Let’s not think about that now', hint: 'The worry lingers' },
    ],
    fallback: 'focus',
    resolve: (c, _r, opt) => {
      if (opt === 'support') { ease(c.state, c.me, 'military', -3); return { out: 'support', fx: { trust: 6 } }; }
      if (opt === 'plan') { ease(c.state, c.me, 'military', -3); return { out: 'plan', fx: { trust: 4, morale: 2 } }; }
      return { out: 'focus', fx: { trust: -2 } };
    },
  },
  housing: {
    title: 'Living situation', cd: 180,
    weight: (c) => (c.team.facilities.gamingHouse <= 2 ? 0.12 : 0.04) + (c.age > 23 ? 0.06 : 0),
    opts: (c) => [
      { id: 'allow', label: 'Housing allowance to live outside the house', hint: `${money(cost(c, 12000))} · morale up · a bit less team bonding` },
      { id: 'upgrade', label: 'Fix up their room instead', hint: `${money(cost(c, 2500))}` },
      { id: 'refuse', label: 'Everyone lives in the house', hint: 'Free' },
    ],
    fallback: 'refuse',
    resolve: (c, _r, opt) => {
      if (opt === 'allow') {
        for (const q of rosterOf(c.state, c.team)) if (q.id !== c.p.id) { const pr = c.ps.pairs[pairKey(c.p.id, q.id)]; if (pr) pr.aff = clamp(pr.aff - 3, -100, 100); }
        return { out: 'allow', fx: { morale: 6, trust: 4, chem: -1, cash: -cost(c, 12000), cat: 'Player welfare' } };
      }
      if (opt === 'upgrade') return { out: 'upgrade', fx: { morale: 3, trust: 2, fatigue: -5, cash: -cost(c, 2500), cat: 'Player welfare' } };
      return { out: 'refuse', fx: { morale: -3, trust: -2 } };
    },
  },
  gear: {
    title: 'Equipment', cd: 120,
    weight: () => 0.06,
    opts: (c) => [
      { id: 'buy', label: 'Buy them new gear', hint: `${money(cost(c, 1500))}` },
      { id: 'sponsor', label: 'Use what the sponsor provides', hint: 'Free' },
      { id: 'refuse', label: 'Make do for now', hint: 'Free' },
    ],
    fallback: 'sponsor',
    resolve: (c, _r, opt) => (opt === 'buy' ? { out: 'buy', fx: { morale: 3, trust: 2, cash: -cost(c, 1500), cat: 'Player welfare' } } : opt === 'sponsor' ? { out: 'sponsor', fx: { morale: -1 } } : { out: 'refuse', fx: { morale: -2, trust: -1 } }),
  },
  offer: {
    title: 'Interest from another club', cd: 120,
    weight: (c) => (c.p.hidden.loyalty < 50 && c.p.reputation > 60 ? 0.22 * (c.state.transferWindowOpen ? 2 : 1) : 0),
    data: (c, rng) => {
      const clubs = Object.values(c.state.teams).filter((t) => t.id !== c.team.id && tierOf(c.state, t) <= tierOf(c.state, c.team) && t.prestige >= c.team.prestige - 5);
      return clubs.length ? { club: rng.pick(clubs).name } : null;
    },
    opts: () => [
      { id: 'commit', label: 'Tell them they’re central to the project', hint: 'Trust & loyalty up' },
      { id: 'open', label: 'Thank them — we’ll talk if a bid comes', hint: 'Calm and honest' },
      { id: 'warn', label: 'Remind them they’re under contract', hint: 'Can sour things' },
    ],
    fallback: 'open',
    resolve: (c, _r, opt, rng) => {
      if (opt === 'commit') { c.p.hidden.loyalty = clamp(c.p.hidden.loyalty + 2, 1, 99); return { out: 'commit', fx: { trust: 5, morale: 3 } }; }
      if (opt === 'open') return { out: 'open', fx: { trust: 2 } };
      if (chance(rng, 0.4 + c.proZ * 0.3)) return { out: 'warn_good', fx: {} };
      c.p.hidden.loyalty = clamp(c.p.hidden.loyalty - 2, 1, 99);
      return { out: 'warn_bad', fx: { trust: -4, morale: -3 } };
    },
  },
  language: {
    title: 'Language barrier', cd: 120, issue: ['language', 1, 1, 30, 50],
    weight: (c) => (c.imp && lang(c.p.country) !== lang(c.team.country ?? '') && lang(c.p.country) !== 'en' && days(c.me.joined, c.state.date) < 200 ? 0.3 : 0),
    data: (c) => { const b = bestPair(c); return b ? { mate: b.q.handle, mateId: b.q.id } : null; },
    opts: (c) => [
      { id: 'tutor', label: 'Pay for language lessons', hint: `${money(cost(c, 3000))} · eases it within two weeks` },
      { id: 'buddy', label: 'Ask {mate} to help them out', hint: 'Bond with {mate} · eases it' },
      { id: 'tough', label: 'Immersion — they’ll pick it up', hint: 'Free · lands with composed players' },
    ],
    fallback: 'tough',
    resolve: (c, req, opt, rng) => {
      if (opt === 'tutor') {
        ease(c.state, c.me, 'language', 0, 14);
        for (const q of rosterOf(c.state, c.team)) if (q.id !== c.p.id) { const pr = c.ps.pairs[pairKey(c.p.id, q.id)]; if (pr) pr.aff = clamp(pr.aff + 2, -100, 100); }
        return { out: 'tutor', fx: { trust: 4, cash: -cost(c, 3000), cat: 'Player welfare' } };
      }
      if (opt === 'buddy') { const q = mateOf(c, req); if (q) { const pr = pairOf(c.ps, c.p.id, q.id, c.state.date); pr.aff = clamp(pr.aff + 8, -100, 100); } ease(c.state, c.me, 'language', 0, 20); return { out: 'buddy', fx: { trust: 2 } }; }
      if (chance(rng, 0.35 + (c.p.hidden.composure - 50) / 100)) { ease(c.state, c.me, 'language', 0, 20); return { out: 'tough_good', fx: {} }; }
      return { out: 'tough_bad', fx: { trust: -3, morale: -2 } };
    },
  },
  health: {
    title: 'Health & fitness', cd: 180,
    weight: (c) => (c.p.hidden.workEthic > 65 ? 0.06 : 0.02),
    opts: (c) => [
      { id: 'pay', label: 'Cover a gym membership and nutritionist', hint: `${money(cost(c, 2000))} · fatigue down` },
      { id: 'team', label: 'Make it a programme for the whole squad', hint: `${money(cost(c, 8000))} · squad morale up · fatigue down` },
      { id: 'no', label: 'Not in the budget', hint: 'Free' },
    ],
    fallback: 'no',
    resolve: (c, _r, opt) => {
      if (opt === 'pay') return { out: 'pay', fx: { morale: 3, trust: 2, fatigue: -6, cash: -cost(c, 2000), cat: 'Player welfare' } };
      if (opt === 'team') { for (const q of rosterOf(c.state, c.team)) q.fatigue = clamp(q.fatigue - 5, 0, 100); return { out: 'team', fx: { morale: 3, trust: 3, teamMorale: 1, cash: -cost(c, 8000), cat: 'Player welfare' } }; }
      return { out: 'no', fx: { morale: -1 } };
    },
  },
  incident: {
    title: 'Misconduct', cd: 14,
    weight: () => 0,
    opts: (c) => [
      { id: 'fine', label: 'Fine them a week’s wages', hint: 'Clear line · ego players resent it' },
      { id: 'talk', label: 'Private, serious talk', hint: 'Depends on their trust in you' },
      ...(rosterOf(c.state, c.team).some((q) => q.id !== c.p.id && q.role === c.p.role && !starting(c.team, q.id)) && c.starter ? [{ id: 'bench', label: 'Bench them for the next match', hint: 'Strong message · morale & trust hit' }] : []),
      { id: 'slide', label: 'Let it slide this time', hint: 'The squad notices' },
    ],
    fallback: 'slide',
    resolve: (c, _r, opt, rng) => {
      const inc = c.me.incident;
      if (inc) inc.handled = true;
      const respect = () => { for (const q of rosterOf(c.state, c.team)) if (q.id !== c.p.id && q.hidden.professionalism > 70 && c.ps.players[q.id]) c.ps.players[q.id].trust = clamp(c.ps.players[q.id].trust + 1, 0, 100); };
      if (opt === 'fine') {
        c.me.cd.warned = c.state.date; respect();
        const amt = Math.max(100, Math.round((c.p.contract?.salary ?? 20000) / 52 / 100) * 100);
        return chance(rng, 0.4 + c.proZ * 0.35 - c.egoZ * 0.35 + c.trustZ * 0.15) ? { out: 'fine_good', fx: { morale: -2, cash: amt, cat: 'Player fines' } } : { out: 'fine_bad', fx: { morale: -6, trust: -6, feel: 'resentful', cash: amt, cat: 'Player fines' } };
      }
      if (opt === 'talk') {
        if (chance(rng, 0.5 + c.trustZ * 0.3 + c.proZ * 0.2 - c.egoZ * 0.2)) { c.me.cd.warned = c.state.date; return { out: 'talk_good', fx: { trust: 2 } }; }
        return { out: 'talk_bad', fx: { trust: -1 } };
      }
      if (opt === 'bench') {
        c.me.cd.warned = c.state.date; respect();
        const f = matchesWithin(c.state, c.team.id, 10);
        const n = f ? days(c.state.date, f.date) + 1 : 4;
        return { out: 'bench', fx: { morale: -6, trust: c.egoZ > 0.3 ? -8 : -4, feel: 'angry' }, note: sendAway(c.state, c.ps, c.team, c.p, n, 'benched') };
      }
      for (const q of rosterOf(c.state, c.team)) if (q.id !== c.p.id && q.hidden.professionalism > 70 && c.ps.players[q.id]) c.ps.players[q.id].trust = clamp(c.ps.players[q.id].trust - 1, 0, 100);
      return { out: 'slide', fx: { morale: 1, chem: -1 } };
    },
  },
};
// approach kinds registered by other modules (transfer-bid conversations, bidTalks.ts) are found through the
// prototype: lookups see them, the random approach roll (own entries only) never picks them
Object.setPrototypeOf(APPROACHES, EXTRA_APPROACHES);
/** Extension points for other modules (bidTalks.ts): approach definitions and an event-driven opener. */
export type ApproachDef = Approach;
export type ApproachCx = Cx;
export type ApproachFx = Fx;
/** Open an approach for one of the user's players now (event-driven, e.g. a transfer bid): skips the rate limit. */
export function openPlayerApproach(state: GameState, pid: string, kind: string, extra: Record<string, string | number> = {}): PlayerRequest | null {
  const team = state.teams[state.userTeamId], p = state.players[pid];
  if (!team || !p || p.teamId !== team.id) return null;
  const ps = people(state);
  sync(state, ps, team, false);
  return openApproach(state, ps, team, p, kind, true, extra);
}

/** Title of an approach kind (for logs and the UI). */
export const approachTitle = (kind: string) => APPROACHES[kind]?.title ?? kind;
/** Number of distinct approach kinds and message variants (for the debug script). */
export function approachStats() {
  return Object.entries(APPROACHES).map(([k, a]) => ({ kind: k, title: a.title, subj: APPROACH_T[k]?.subj.length ?? 0, body: APPROACH_T[k]?.body.length ?? 0, replies: Object.values(APPROACH_T[k]?.out ?? {}).reduce((s, x) => s + x.length, 0) }));
}

function openApproach(state: GameState, ps: PeopleState, team: Team, p: Player, kind: string, force = false, extra: Data = {}): PlayerRequest | null {
  const A = APPROACHES[kind];
  if (!A) return null;
  const c = cxFor(state, ps, team, p);
  const rng = new RNG(hashString(p.id + kind + state.date) ^ state.seq);
  const data = { ...(A.data ? A.data(c, rng) : {}), ...extra };
  if (A.data && !Object.keys(data).length) return null;
  // personal matters stay hidden from a manager they don't trust (until a private chat draws them out)
  if (A.personal && !force && A.issue && rng.chance(clamp((50 - c.me.trust) / 40, 0, 0.85))) {
    addIssue(state, c.me, A.issue[0], rng.int(A.issue[1], A.issue[2]), rng.int(A.issue[3], A.issue[4]), true);
    c.me.cd['a:' + kind] = state.date;
    return null;
  }
  if (A.issue) addIssue(state, c.me, A.issue[0], rng.int(A.issue[1], A.issue[2]), rng.int(A.issue[3], A.issue[4]));
  const ctx: Ctx = { ...baseCtx(state, ps, p), ...data };
  const fillOpt = (s?: string) => (s ? fillT(s, ctx) ?? s.replace(/\{\w+\}/g, '') : undefined);
  const options = A.opts(c, data).map((o) => ({ id: o.id, label: fillOpt(o.label)!, hint: fillOpt(o.hint) }));
  const req: PlayerRequest = { id: `preq_${state.seq++}`, playerId: p.id, kind, date: state.date, expires: addDays(state.date, kind === 'incident' ? 4 : 5), options, fallback: A.fallback, data };
  ps.requests.unshift(req);
  if (ps.requests.length > 40) ps.requests.length = 40;
  const T = APPROACH_T[kind];
  addInbox(state, {
    from: kind === 'incident' ? staffFrom(state, team) : p.handle, kind: 'player',
    subject: line(ps, rng, T.subj, ctx) || A.title, body: line(ps, rng, T.body, ctx),
    action: { type: 'playerChoice', payload: req.id, label: 'Respond' },
  });
  if (kind !== 'incident' && !force) ps.sent.push(state.date);
  if (ps.sent.length > 30) ps.sent.splice(0, ps.sent.length - 30);
  c.me.cd['a:' + kind] = state.date;
  ps.cd['a:' + kind] = state.date;
  return req;
}

/** Inbox/UI: is this player conversation still waiting for an answer? */
export function playerRequestLive(state: GameState, id: string) {
  const r = state.people?.requests.find((x) => x.id === id);
  return !!r && !r.resolved && r.expires >= state.date;
}
export const playerRequest = (state: GameState, id: string) => state.people?.requests.find((x) => x.id === id);

/** Answer a player approach (Inbox). `ignored` = it expired: the fallback happens and they feel ignored. */
export function resolvePlayerChoice(state: GameState, reqId: string, optId: string, ignored = false): { ok: boolean; message: string } {
  const ps = state.people;
  const req = ps?.requests.find((r) => r.id === reqId);
  if (!ps || !req || req.resolved) { markActionDone(state, 'playerChoice', reqId); return { ok: false, message: 'This conversation is closed.' }; }
  if (!req.options.some((o) => o.id === optId)) return { ok: false, message: 'Unknown option.' };
  const team = state.teams[ps.teamId];
  const p = state.players[req.playerId];
  if (!p || p.teamId !== team?.id) { req.resolved = 'left'; req.outcome = 'The player has left the club.'; markActionDone(state, 'playerChoice', reqId); return { ok: false, message: 'The player has left the club.' }; }
  const A = APPROACHES[req.kind];
  const c = cxFor(state, ps, team, p);
  const rng = new RNG(hashString(req.id + optId) ^ state.seq);
  const res = A.resolve(c, req, optId, rng);
  if (ignored) res.fx = add(res.fx, { trust: -4, morale: -2, feel: 'ignored' });
  const summary = applyFx(state, ps, p, res.fx, `${p.handle}: ${A.title.toLowerCase()}`);
  const ctx: Ctx = { ...baseCtx(state, ps, p), ...(req.data ?? {}) };
  const reply = ignored && req.kind !== 'incident' ? line(ps, rng, IGNORED, ctx) : line(ps, rng, APPROACH_T[req.kind]?.out[res.out], ctx);
  const label = req.options.find((o) => o.id === optId)?.label ?? optId;
  req.resolved = optId;
  req.outcome = [reply ? (req.kind === 'incident' ? reply : `${p.handle}: “${reply}”`) : '', res.note, summary].filter(Boolean).join('\n');
  markActionDone(state, 'playerChoice', req.id);
  const tone = (res.fx.trust ?? 0) > 0 ? 1 : (res.fx.trust ?? 0) < 0 ? -1 : 0;
  c.me.log.unshift({ date: state.date, kind: 'a:' + req.kind, tone, text: `${A.title}: ${ignored ? 'no reply (expired)' : label}`, reply: reply || undefined });
  if (c.me.log.length > 20) c.me.log.length = 20;
  if (req.kind === 'incident') feed(ps, state.date, `${p.handle}’s misconduct: ${ignored ? 'nothing was done' : label.toLowerCase()}.`, tone, [p.id]);
  return { ok: true, message: [res.note, summary].filter(Boolean).join(' · ') || 'Reply sent.' };
}

// ------------------------------------------------------------------ follow-ups
function dueFollowUps(state: GameState, ps: PeopleState, team: Team, rng: RNG) {
  const due = ps.follow.filter((f) => f.date <= state.date);
  if (!due.length) return;
  ps.follow = ps.follow.filter((f) => f.date > state.date);
  for (const f of due) {
    const p = state.players[f.pid];
    const me = ps.players[f.pid];
    if (!p || !me || p.teamId !== team.id) continue;
    switch (f.key) {
      case 'family_better': notePlayer(state, ps, p, 'family_better', f.data, rng); ease(state, me, 'family', -1); p.morale = clamp(p.morale + 3, 5, 100); break;
      case 'breakup_better': notePlayer(state, ps, p, 'breakup_better', f.data, rng); ease(state, me, 'breakup', -1); p.morale = clamp(p.morale + 2, 5, 100); break;
      case 'celebrate_photo': notePlayer(state, ps, p, 'celebrate_photo', f.data, rng); team.chemistry = clamp(team.chemistry + 0.5, 10, 100); break;
      case 'family_visit': notePlayer(state, ps, p, 'family_visit', f.data, rng); p.morale = clamp(p.morale + 2, 5, 100); break;
      case 'sick_check':
        if (me.issues.some((i) => i.kind === 'sick' && i.until >= state.date && i.sev > 0) && rng.chance(0.3)) openApproach(state, ps, team, p, 'sick_worse', true);
        break;
      case 'wrist_check':
        if (rng.chance(0.35 + p.hidden.injuryProne / 300)) openApproach(state, ps, team, p, 'wrist_worse', true);
        break;
      case 'visa_trip': {
        const note = sendAway(state, ps, team, p, 2, 'embassy trip');
        addInbox(state, { from: p.handle, kind: 'player', subject: 'Embassy trip', body: `Coach, the immigration office wants me in person — I have to fly to the embassy for two days. Sorry about this.\n\n${note}` });
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ promises
function checkPromises(state: GameState, ps: PeopleState, team: Team) {
  for (const [id, me] of Object.entries(ps.players)) {
    const p = state.players[id];
    if (!p) continue;
    for (const pm of me.promises) {
      if (pm.status !== 'open') continue;
      let kept: boolean | null = null;
      if (pm.kind === 'playtime') kept = (pm.got ?? 0) >= (pm.need ?? 2) ? true : state.date > pm.deadline ? false : null;
      else if (pm.kind === 'renew') kept = p.contract && Number(p.contract.expires.replace(/-/g, '')) > (pm.base ?? 0) ? true : state.date > pm.deadline ? false : null;
      else if (pm.kind === 'raise') kept = p.contract && p.contract.salary >= (pm.base ?? 0) * 1.08 ? true : state.date > pm.deadline || !p.contract ? false : null;
      if (kept === null) continue;
      pm.status = kept ? 'kept' : 'broken';
      applyFx(state, ps, p, kept ? { trust: 6, morale: 4, feel: 'grateful' } : { trust: -14, morale: -8, feel: 'betrayed' });
      notePlayer(state, ps, p, kept ? 'promise_kept' : 'promise_broken', { promise: pm.text });
      feed(ps, state.date, `${kept ? 'Promise kept' : 'Promise broken'}: ${p.handle} (${pm.text}).`, kept ? 1 : -1, [id]);
      me.log.unshift({ date: state.date, kind: 'promise_' + pm.status, tone: kept ? 1 : -1, text: `${kept ? 'Kept' : 'Broke'} your promise: ${pm.text}` });
      if (me.log.length > 20) me.log.length = 20;
    }
  }
  void team;
}

// ------------------------------------------------------------------ teammate moments
function moment(state: GameState, ps: PeopleState, team: Team, a: Player, b: Player, key: string, tone: number, rng: RNG, inbox: boolean) {
  const pr = pairOf(ps, a.id, b.id, state.date);
  const text = line(ps, rng, MOMENTS[key], { a: a.handle, b: b.handle, lane: laneName(a.role, b.role), team: team.name });
  if (!text) return;
  pr.last = { date: state.date, text, tone };
  feed(ps, state.date, text, tone, [a.id, b.id]);
  if (inbox && cool(state, ps, 'note', 9)) {
    addInbox(state, { from: staffFrom(state, team), kind: 'player', subject: `${tone > 0 ? 'Locker room' : 'Locker room tension'}: ${a.handle} & ${b.handle}`, body: text });
  }
}

function negMoment(state: GameState, ps: PeopleState, team: Team, a: Player, b: Player, rng: RNG) {
  const pool: [string, number][] = [['comms_argument', 2], ['roommate', 1]];
  if (a.role === b.role) pool.push(['rival_jab', 3]);
  if (a.hidden.ego > 60 && b.hidden.ego > 60) pool.push(['ego_clash', 3]);
  if (starting(team, a.id) && starting(team, b.id) && a.role !== 'support' && b.role !== 'support' && a.role !== 'jungle' && b.role !== 'jungle') pool.push(['resource_fight', 1.5]);
  if (a.streamer || b.streamer) pool.push(['stream_comment', 1.5]);
  const [key] = rng.weighted(pool, (x) => x[1]);
  const [x, y] = key === 'stream_comment' && !a.streamer ? [b, a] : rng.chance(0.5) ? [a, b] : [b, a];
  const pr = pairOf(ps, a.id, b.id, state.date);
  const heat: Record<string, [number, number]> = { comms_argument: [20, 35], roommate: [10, 20], rival_jab: [15, 30], ego_clash: [25, 40], resource_fight: [20, 35], stream_comment: [25, 45] };
  pr.aff = clamp(pr.aff - rng.int(5, 12), -100, 100);
  pr.heat = clamp(pr.heat + rng.int(...heat[key]), 0, 100);
  moment(state, ps, team, x, y, key, -1, rng, pr.heat >= 30);
  maybeSpatNews(state, ps, team, x, y, rng);
}

function maybeSpatNews(state: GameState, ps: PeopleState, team: Team, a: Player, b: Player, rng: RNG) {
  const pr = ps.pairs[pairKey(a.id, b.id)];
  if (!pr || pr.heat < 55 || !rng.chance(0.3) || !cool(state, ps, 'news', 21)) return;
  const ctx = { a: a.handle, b: b.handle, team: team.name };
  addNews(state, { headline: line(ps, rng, NEWS_T.spat.head, ctx), body: line(ps, rng, NEWS_T.spat.body, ctx), tags: ['drama'], teamIds: [team.id], playerIds: [a.id, b.id] });
  team.hype = clamp(team.hype + 1, 0, 100); // drama is content
}

function posMoment(state: GameState, ps: PeopleState, team: Team, a: Player, b: Player, rng: RNG) {
  const pr = pairOf(ps, a.id, b.id, state.date);
  const both = starting(team, a.id) && starting(team, b.id);
  const pool: [string, number][] = [['dinner', 1], ['gaming_night', 1], ['inside_joke', 1], ['gym', 0.7]];
  if (both && synergy(a.role, b.role) >= 0.6) pool.push(['duo_queue', 3]);
  if (pr.mentor) pool.push(['mentor_session', 3]);
  if (a.role === b.role) pool.push(['healthy_rivalry', 2]);
  const [key] = rng.weighted(pool, (x) => x[1]);
  const [x, y] = key === 'mentor_session' ? (pr.mentor === a.id ? [a, b] : [b, a]) : rng.chance(0.5) ? [a, b] : [b, a];
  pr.aff = clamp(pr.aff + rng.int(4, 8), -100, 100);
  moment(state, ps, team, x, y, key, 1, rng, key === 'duo_queue' && pr.aff >= 40);
  if (key === 'duo_queue' && pr.aff >= 70 && cool(state, ps, 'bondnews:' + pairKey(a.id, b.id), 300) && cool(state, ps, 'news', 21)) {
    const ctx = { a: x.handle, b: y.handle, team: team.name, lane: laneName(a.role, b.role) };
    addNews(state, { headline: line(ps, rng, NEWS_T.bond.head, ctx), body: line(ps, rng, NEWS_T.bond.body, ctx), tags: ['feature'], teamIds: [team.id], playerIds: [a.id, b.id] });
  }
}

// ------------------------------------------------------------------ weekly
function weekly(state: GameState, ps: PeopleState, team: Team, rng: RNG) {
  const sb = staffBonus(state, team);
  const rs = rosterOf(state, team);
  const personal = new Set(['family', 'grief', 'breakup', 'homesick', 'slump', 'fans', 'military']);
  let hinted = false;
  for (const p of rs) {
    const me = ps.players[p.id];
    if (!me) continue;
    me.trust = clamp(me.trust + (trustBase(p) - me.trust) * 0.03, 0, 100);
    if (me.trust >= 70) p.morale = clamp(p.morale + 0.4, 5, 100);
    else if (me.trust <= 30) p.morale = clamp(p.morale - 0.6, 5, 100);
    for (const i of activeIssues(state, me)) {
      p.morale = clamp(p.morale - (i.treated ? 0.3 : 0.5) * i.sev, 5, 100);
      if (sb.hasPsychologist && personal.has(i.kind) && !i.hidden && rng.chance(0.25)) ease(state, me, i.kind, -1);
      // a psychologist notices what players hide
      if (i.hidden && sb.hasPsychologist && !hinted && rng.chance(0.4) && cool(state, ps, 'hint:' + p.id, 14)) { notePlayer(state, ps, p, 'psych_hint', {}, rng); hinted = true; }
    }
    me.issues = me.issues.filter((i) => i.until >= addDays(state.date, -2) && i.sev > 0);
    if (me.feel && me.feel.until < state.date) me.feel = undefined;
    me.promises = me.promises.filter((x) => x.status === 'open' || days(x.deadline, state.date) < 90);
    for (const [k, d] of Object.entries(me.cd)) if (days(d, state.date) > 240) delete me.cd[k];
  }
  weeklyPairs(state, ps, team, rng, sb);
  weeklyIncident(state, ps, team, rng);
  // the starting five's relationships nudge team chemistry
  const st = ROLES.map((r) => team.lineup[r]).filter((x): x is string => !!x);
  let sum = 0, n = 0, drama = 0;
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const pr = ps.pairs[pairKey(st[i], st[j])];
    if (!pr) continue;
    sum += pr.aff; n++;
    if (pr.heat >= 30) drama++;
  }
  team.chemistry = clamp(team.chemistry + clamp((n ? sum / n : 0) / 100 * 0.8 - drama * 0.6, -2, 1), 10, 100);
  ps.follow = ps.follow.filter((f) => days(f.date, state.date) < 60);
  for (const [k, d] of Object.entries(ps.cd)) if (days(d, state.date) > 400) delete ps.cd[k];
}

function weeklyPairs(state: GameState, ps: PeopleState, team: Team, rng: RNG, sb: Staff) {
  const rs = rosterOf(state, team);
  const trend = clamp(ps.streak, -4, 4);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    const pr = pairOf(ps, a.id, b.id, state.date);
    const c = compat(state, a, b);
    const sa = starting(team, a.id), sbb = starting(team, b.id), both = sa && sbb;
    const w = synergy(a.role, b.role);
    // affinity drifts toward what their personalities and shared work support
    let target = c * 70 + (both ? 6 + w * 14 : 0);
    if (a.role === b.role && sa !== sbb) target -= 8 + Math.max(0, a.hidden.ego + b.hidden.ego - 100) * 0.3 - Math.max(0, a.hidden.professionalism + b.hidden.professionalism - 140) * 0.3;
    if (pr.mentor) target += 15;
    const duo = !!pr.duoQ && pr.duoQ >= state.date;
    if (duo) target += c > -0.15 ? 15 : -10;
    if (pr.duoQ && !duo) pr.duoQ = undefined;
    const rate = 0.06 * (duo ? 1.6 : 1) * (both ? 1.2 : 0.8);
    pr.aff = clamp(pr.aff + (target - pr.aff) * rate + rng.normal(0, 1.5) + (both ? trend * 0.4 : 0), -100, 100);
    pr.heat = Math.max(0, pr.heat - (12 + (sb.hasPsychologist ? 6 : 0)));
    if (pr.heat >= 30) { a.morale = clamp(a.morale - 1, 5, 100); b.morale = clamp(b.morale - 1, 5, 100); }
    else if (pr.aff >= 50 && both) { a.morale = clamp(a.morale + 0.3, 5, 100); b.morale = clamp(b.morale + 0.3, 5, 100); }
    if (pr.mentor && pr.aff < -30) { pr.mentor = undefined; feed(ps, state.date, `The mentorship between ${a.handle} and ${b.handle} has broken down.`, -1, [a.id, b.id]); }
    if (pr.mentor) {
      // mentees pick up the habits of their mentor (small, only where the mentor is better)
      const [mentor, mentee] = pr.mentor === a.id ? [a, b] : [b, a];
      for (const k of ['macro', 'laning', 'consistency'] as (keyof PlayerAttributes)[]) if (mentor.attributes[k] > mentee.attributes[k] + 3) mentee.attributes[k] = clampRating(mentee.attributes[k] + 0.05);
      mentee.morale = clamp(mentee.morale + 0.3, 5, 100);
    }
    // moments
    const pPos = 0.006 + Math.max(0, c) * 0.03 + (pr.aff > 30 ? 0.015 : 0) + (duo ? 0.04 : 0) + (both && w >= 0.6 ? 0.01 : 0) + (trend > 0 ? 0.005 : 0) + (pr.mentor ? 0.03 : 0);
    const pNeg = 0.003 + Math.max(0, -c) * 0.03 + (pr.aff < -20 ? 0.02 : 0) + (trend < 0 ? 0.003 * -trend : 0) + (has(a, 'hot_headed') || has(b, 'hot_headed') ? 0.01 : 0) - (sb.hasPsychologist ? 0.002 : 0);
    const roll = rng.next();
    if (pr.heat >= 30 && c > -0.25 && rng.chance(0.12)) {
      pr.heat = 0; pr.aff = clamp(pr.aff + 10, -100, 100);
      moment(state, ps, team, a, b, 'made_up', 1, rng, false);
    } else if (roll < pNeg) negMoment(state, ps, team, a, b, rng);
    else if (roll < pNeg + pPos) posMoment(state, ps, team, a, b, rng);
    // announce relationship changes
    const k = pairKind(a, b, pr);
    if (k !== pr.kind) {
      const notable = k === 'duo' || k === 'friends' || k === 'clash' || k === 'tension';
      if (pr.kind !== undefined && notable && KIND_NOTE[k] && cool(state, ps, `kind:${pairKey(a.id, b.id)}:${k}`, 60)) {
        const text = line(ps, rng, KIND_NOTE[k], { a: a.handle, b: b.handle, lane: laneName(a.role, b.role), role: ROLE_LABEL[a.role] });
        feed(ps, state.date, text, k === 'duo' || k === 'friends' ? 1 : -1, [a.id, b.id]);
        if ((k === 'duo' || k === 'clash') && cool(state, ps, 'note', 9)) addInbox(state, { from: staffFrom(state, team), kind: 'player', subject: `Locker room: ${a.handle} & ${b.handle}`, body: text });
      }
      pr.kind = k;
    }
  }
}

function weeklyIncident(state: GameState, ps: PeopleState, team: Team, rng: RNG) {
  const cands: [Player, number][] = [];
  for (const p of rosterOf(state, team)) {
    const me = ps.players[p.id];
    if (!me || (me.away && me.away.until >= state.date) || (me.cd['a:incident'] && days(me.cd['a:incident'], state.date) < 21)) continue;
    let w = 0.004 + Math.max(0, 70 - p.hidden.professionalism) / 100 * 0.035 + (has(p, 'party_animal') ? 0.05 : 0) + (has(p, 'hot_headed') ? 0.02 : 0) + (p.streamer && p.hidden.ego > 60 ? 0.01 : 0);
    if (me.cd.warned && days(me.cd.warned, state.date) < 30) w *= 0.4;
    w = incidentWeight(p, w); // online presence, media savvy, Model Professional, Foot-in-Mouth…
    cands.push([p, w]);
  }
  for (const [p, w] of rng.shuffle(cands)) {
    if (!rng.chance(w)) continue;
    const pool = INCIDENTS.filter((x) => x.w === 'prof' || (x.w === 'party' && has(p, 'party_animal')) || (x.w === 'temper' && (has(p, 'hot_headed') || p.personality.temperament > 60)) || (x.w === 'stream' && p.streamer) || (x.w === 'ethic' && p.hidden.workEthic < 60));
    const inc = rng.pick(pool.length ? pool : INCIDENTS);
    const me = ps.players[p.id];
    me.incident = { date: state.date, kind: inc.kind, text: inc.text };
    openApproach(state, ps, team, p, 'incident', false, { incident: inc.text });
    feed(ps, state.date, `${p.handle} ${inc.text}.`, -1, [p.id]);
    return; // one per week at most
  }
}

// ------------------------------------------------------------------ approaches: rate-limited daily roll
function maybeApproach(state: GameState, ps: PeopleState, team: Team, rng: RNG) {
  const open = ps.requests.filter((r) => !r.resolved && r.expires >= state.date).length;
  if (open >= 2) return;
  const recent = ps.sent.filter((d) => days(d, state.date) < 30);
  if (recent.length >= 5 || (recent.length && days(recent[recent.length - 1], state.date) < 3)) return;
  const rs = rosterOf(state, team);
  if (!rs.length) return;
  const avgMorale = rs.reduce((s, p) => s + p.morale, 0) / rs.length;
  // more knocks on the door when things are going badly
  const bad = clamp(Math.max(0, -ps.streak) * 0.22 + Math.max(0, 58 - avgMorale) / 30, 0, 1.5);
  if (!rng.chance(0.065 * (1 + bad))) return;
  const pool: [Player, string, number][] = [];
  for (const p of rs) {
    const me = ps.players[p.id];
    if (!me || (me.away && me.away.until >= state.date) || ps.requests.some((r) => r.playerId === p.id && !r.resolved && r.expires >= state.date)) continue;
    const c = cxFor(state, ps, team, p);
    for (const [k, A] of Object.entries(APPROACHES)) {
      const last = me.cd['a:' + k], tl = ps.cd['a:' + k];
      if ((last && days(last, state.date) < A.cd) || (tl && days(tl, state.date) < 14)) continue;
      if (A.issue && me.issues.some((i) => i.kind === A.issue![0] && i.until >= state.date && i.sev > 0)) continue;
      const w = A.weight(c) * approachMult(p, k); // traits & profile: Wrist Issues, Homebody, stamina, languages…
      if (w > 0) pool.push([p, k, w]);
    }
  }
  if (!pool.length) return;
  const [p, kind] = rng.weighted(pool, (x) => x[2]);
  openApproach(state, ps, team, p, kind);
}

// ------------------------------------------------------------------ hooks
/** Daily hook (endDay): roster sync, returns from leave, follow-ups, expiries, promises, weekly drift, approaches. */
export function peopleDaily(state: GameState, rng: RNG) {
  const team = state.teams[state.userTeamId];
  if (!team) return;
  const ps = people(state);
  sync(state, ps, team, false);
  checkReturns(state, ps, team);
  dueFollowUps(state, ps, team, rng);
  for (const r of [...ps.requests]) if (!r.resolved && r.expires < state.date) resolvePlayerChoice(state, r.id, r.fallback, true);
  checkPromises(state, ps, team);
  if (weekday(state.date) === 1) weekly(state, ps, team, rng);
  maybeApproach(state, ps, team, rng);
}

/** Post-series hook (finishSeries): performance recap, promises, blame / bonding moments. */
export function peopleAfterSeries(state: GameState, f: MatchFixture) {
  const team = state.teams[state.userTeamId];
  if (!team || !f.result?.loser || (f.teamA !== team.id && f.teamB !== team.id)) return;
  const ps = people(state);
  const won = f.result.winner === team.id;
  ps.streak = won ? Math.max(1, ps.streak + 1) : Math.min(-1, ps.streak - 1);
  const opp = state.teams[f.teamA === team.id ? f.teamB! : f.teamA!];
  const tot: Record<string, { s: number; n: number; k: number; d: number; a: number; worstD: number }> = {};
  const mistakes: Record<string, string> = {};
  f.result.games.forEach((g, gi) => {
    const mins = g.duration / 60;
    for (const l of g.players ?? []) {
      if (l.teamId !== team.id) continue;
      const t = (tot[l.playerId] ??= { s: 0, n: 0, k: 0, d: 0, a: 0, worstD: 0 });
      // same yardstick as form in recordGame: kills, assists and deaths per 10 minutes vs an expectation of 4
      t.s += (l.k * 2 + l.a - l.d * 1.5) / Math.max(1, mins / 10) - 4 + (g.winner === team.id ? 0.5 : -0.5);
      t.n++; t.k += l.k; t.d += l.d; t.a += l.a;
      if (l.d >= 6 && l.d > t.worstD) { t.worstD = l.d; mistakes[l.playerId] = `died ${l.d} times on ${champName(l.champion)} in game ${gi + 1}`; }
    }
  });
  const perf: Record<string, number> = {}, lines: Record<string, string> = {};
  let best: string | undefined, worst: string | undefined;
  for (const [id, t] of Object.entries(tot)) {
    perf[id] = Math.round(t.s / t.n * 10) / 10;
    lines[id] = `${t.k}/${t.d}/${t.a}`;
    if (!best || perf[id] > perf[best]) best = id;
    if (!worst || perf[id] < perf[worst]) worst = id;
  }
  if (worst && perf[worst] > -1.5) worst = undefined;
  if (worst && !won && !mistakes[worst] && perf[worst] < -2.5) mistakes[worst] = `went ${lines[worst]} across the series`;
  const c = state.competitions[f.competitionId];
  const big = !!c && (c.tier === 0 || c.kind === 'playoffs' || /Final/.test(f.label ?? ''));
  const my = f.teamA === team.id ? f.result.scoreA : f.result.scoreB, their = f.teamA === team.id ? f.result.scoreB : f.result.scoreA;
  ps.last = { fixtureId: f.id, date: state.date, won, score: `${my}-${their}`, opp: opp?.name ?? '?', big, perf, lines, mistakes, best, worst };
  // personal performance on top of the series result
  if (best && state.players[best]) state.players[best].morale = clamp(state.players[best].morale + 1, 5, 100);
  if (worst && state.players[worst]) state.players[worst].morale = clamp(state.players[worst].morale - 1, 5, 100);
  for (const [id, me] of Object.entries(ps.players)) {
    if (perf[id] === undefined) continue;
    for (const pm of me.promises) if (pm.kind === 'playtime' && pm.status === 'open') pm.got = (pm.got ?? 0) + 1;
    for (const i of me.issues) if (i.kind === 'nerves' && i.until >= state.date) i.until = addDays(state.date, -1);
  }
  const rng = new RNG(hashString(f.id + 'people') ^ state.seq);
  const played = Object.keys(perf).map((id) => state.players[id]).filter(Boolean) as Player[];
  if (!won && worst) {
    // someone hot-headed blames the weakest link
    const w = state.players[worst];
    const blamer = played.filter((q) => q.id !== worst).sort((a, b) => b.personality.temperament - a.personality.temperament)[0];
    if (w && blamer) {
      const pr = pairOf(ps, blamer.id, w.id, state.date);
      const avgTrust = played.reduce((s, q) => s + (ps.players[q.id]?.trust ?? 50), 0) / Math.max(1, played.length);
      const p = 0.035 + Math.max(0, blamer.personality.temperament - 55) / 100 * 0.2 + (ps.streak <= -3 ? 0.04 : 0) + (pr.aff < 0 ? 0.04 : 0) + (big ? 0.03 : 0) - (avgTrust - 50) / 500 + (has(blamer, 'hot_headed') ? 0.06 : 0);
      if (rng.chance(clamp(p, 0.02, 0.5))) {
        pr.aff = clamp(pr.aff - rng.int(8, 14), -100, 100);
        pr.heat = clamp(pr.heat + rng.int(28, 48), 0, 100);
        moment(state, ps, team, blamer, w, 'blame', -1, rng, true);
        maybeSpatNews(state, ps, team, blamer, w, rng);
      }
    }
  } else if (won && best && rng.chance(big ? 0.22 : 0.12)) {
    const b = state.players[best];
    const partner = b && played.filter((q) => q.id !== best).sort((x, y) => synergy(b.role, y.role) - synergy(b.role, x.role))[0];
    if (b && partner) { const pr = pairOf(ps, b.id, partner.id, state.date); pr.aff = clamp(pr.aff + rng.int(4, 7), -100, 100); moment(state, ps, team, b, partner, 'win_bond', 1, rng, false); }
  }
}

// ------------------------------------------------------------------ team meetings
export type MeetingKind = 'rally' | 'celebrate' | 'callout' | 'clear';
export const MEETINGS: { id: MeetingKind; label: string; desc: string }[] = [
  { id: 'rally', label: 'Rally the team', desc: 'After a rough patch: we stick together. Lands when they trust you and results have been poor.' },
  { id: 'celebrate', label: 'Celebrate the wins', desc: 'Enjoy a good run together. Feels hollow when results are bad.' },
  { id: 'callout', label: 'Call the team out', desc: 'Demand higher standards. Professionals respond; fragile players and big egos may not.' },
  { id: 'clear', label: 'Clear the air', desc: 'Put the tensions on the table. Can defuse drama — or make it awkward.' },
];
const MEET_FX: Record<MeetingKind, Record<Reaction, Fx>> = {
  rally: { pos: { morale: 4, trust: 1 }, meh: { morale: 1 }, neg: { morale: -1, trust: -1 } },
  celebrate: { pos: { morale: 3, trust: 1 }, meh: { morale: 1 }, neg: { trust: -2 } },
  callout: { pos: { form: 0.6, morale: -1 }, meh: { morale: -2 }, neg: { morale: -5, trust: -4 } },
  clear: { pos: { morale: 2, trust: 1 }, meh: {}, neg: { morale: -2, trust: -1 } },
};
export function meetingCheck(state: GameState): { ok: boolean; why?: string } {
  const ps = people(state);
  const d = ps.cd.meeting;
  return d && days(d, state.date) < 7 ? { ok: false, why: `Last team meeting was ${days(d, state.date) || 'earlier'} day(s) ago — wait a week between meetings.` } : { ok: true };
}
export interface TeamResult { ok: boolean; message: string; lines?: { pid: string; text: string; tone: number }[]; effects?: string; scene?: string }

export function teamMeeting(state: GameState, kind: MeetingKind): TeamResult {
  const chk = meetingCheck(state);
  if (!chk.ok) return { ok: false, message: chk.why! };
  const team = state.teams[state.userTeamId];
  const ps = people(state);
  const sb = staffBonus(state, team);
  const rng = new RNG(hashString('meeting' + kind + state.date) ^ state.seq);
  state.seq++;
  ps.cd.meeting = state.date;
  const rs = rosterOf(state, team);
  const out: { pid: string; text: string; tone: number }[] = [];
  let net = 0, pairsFixed = 0, pairsWorse = 0;
  if (kind === 'clear') {
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const pr = ps.pairs[pairKey(rs[i].id, rs[j].id)];
      if (!pr || (pr.heat < 10 && pr.aff > -20)) continue;
      const trustAvg = ((ps.players[rs[i].id]?.trust ?? 50) + (ps.players[rs[j].id]?.trust ?? 50)) / 2;
      if (rng.chance(clamp(0.45 + (trustAvg - 50) / 100 + (sb.hasPsychologist ? 0.15 : 0), 0.15, 0.9))) { pr.heat = Math.max(0, pr.heat - 30); pr.aff = clamp(pr.aff + 10, -100, 100); pairsFixed++; }
      else { pr.heat = clamp(pr.heat + 8, 0, 100); pairsWorse++; }
    }
  }
  for (const p of rs) {
    const me = ps.players[p.id];
    if (!me || (me.away && me.away.until >= state.date)) continue;
    const trustZ = (me.trust - 50) / 50, proZ = (p.hidden.professionalism - 50) / 50, egoZ = Math.max(0, (p.hidden.ego - 50) / 50), frag = Math.max(0, (50 - p.hidden.composure) / 50);
    let s = rng.normal(0, 0.45) + (sb.motivation - 50) / 100 * 0.4;
    if (kind === 'rally') s += 0.3 + trustZ * 0.5 + (ps.streak < 0 ? 0.35 : ps.streak > 1 ? -0.3 : 0) + frag * 0.15 - egoZ * 0.2;
    else if (kind === 'celebrate') s += 0.4 + (ps.streak > 0 ? 0.4 : -0.6) + trustZ * 0.3;
    else if (kind === 'callout') s += 0.05 + trustZ * 0.5 + proZ * 0.5 - frag * 0.4 - egoZ * 0.4 + (ps.streak < 0 ? 0.25 : -0.25);
    else s += 0.2 + trustZ * 0.3 + (pairsFixed - pairsWorse) * 0.15;
    const r: Reaction = s >= 0.45 ? 'pos' : s <= -0.25 ? 'neg' : 'meh';
    applyFx(state, ps, p, MEET_FX[kind][r]);
    net += r === 'pos' ? 1 : r === 'neg' ? -1 : 0;
    out.push({ pid: p.id, text: line(ps, rng, MEETING_LINES[kind][r], { me: p.handle }), tone: r === 'pos' ? 1 : r === 'neg' ? -1 : 0 });
  }
  const chem = kind === 'callout' ? (net < 0 ? -1 : 0) : clamp(Math.round(net * 0.5), -2, 3);
  if (chem) team.chemistry = clamp(team.chemistry + chem, 10, 100);
  const label = MEETINGS.find((m) => m.id === kind)!.label;
  const effects = [`${out.filter((x) => x.tone > 0).length} bought in, ${out.filter((x) => x.tone < 0).length} didn’t`, chem ? `Chemistry ${signed(chem)}` : '', kind === 'clear' ? `${pairsFixed} tension(s) eased${pairsWorse ? `, ${pairsWorse} flared` : ''}` : ''].filter(Boolean).join(' · ');
  feed(ps, state.date, `Team meeting — ${label.toLowerCase()}: ${effects}.`, net > 0 ? 1 : net < 0 ? -1 : 0);
  // show a mix of reactions rather than five of the same
  const sample = [...out.filter((x) => x.tone < 0).slice(0, 1), ...out.filter((x) => x.tone > 0).slice(0, 2), ...out.filter((x) => x.tone === 0).slice(0, 1)].slice(0, 4);
  return { ok: true, message: `${label}: ${effects}`, lines: sample, effects };
}

// ------------------------------------------------------------------ team building
export type ActivityKind = 'dinner' | 'night' | 'outdoor' | 'retreat';
export const ACTIVITIES: { id: ActivityKind; label: string; base: number; cd: number; desc: string }[] = [
  { id: 'dinner', label: 'Team dinner', base: 2500, cd: 10, desc: 'A relaxed evening out. Small boost to bonds and morale.' },
  { id: 'night', label: 'Escape room & karaoke night', base: 6000, cd: 14, desc: 'A fun night out. Moderate boost; cools mild tension.' },
  { id: 'outdoor', label: 'Go-karting / paintball day', base: 12000, cd: 21, desc: 'Competitive fun. Big boost to bonds — but big egos may clash.' },
  { id: 'retreat', label: 'Weekend retreat', base: 45000, cd: 45, desc: 'Two days away from screens. Strong boost to bonds, chemistry and fatigue; cools drama.' },
];
export function activityCost(state: GameState, id: ActivityKind) {
  const a = ACTIVITIES.find((x) => x.id === id)!;
  return Math.max(100, Math.round(a.base * scaleOf(state, state.teams[state.userTeamId]) / 100) * 100);
}
export function activityCheck(state: GameState, id: ActivityKind): { ok: boolean; why?: string } {
  const ps = people(state);
  const a = ACTIVITIES.find((x) => x.id === id)!;
  const last = ps.cd['act:' + id], any = ps.cd.activity;
  if (any && days(any, state.date) < 7) return { ok: false, why: 'The squad just had a team activity — give it a week.' };
  if (last && days(last, state.date) < a.cd) return { ok: false, why: `Available again on ${shortDate(addDays(last, a.cd))}.` };
  if (state.teams[state.userTeamId].balance < activityCost(state, id)) return { ok: false, why: 'Not enough money.' };
  return { ok: true };
}
export function teamBuilding(state: GameState, id: ActivityKind): TeamResult {
  const chk = activityCheck(state, id);
  if (!chk.ok) return { ok: false, message: chk.why! };
  const team = state.teams[state.userTeamId];
  const ps = people(state);
  const a = ACTIVITIES.find((x) => x.id === id)!;
  const rng = new RNG(hashString('activity' + id + state.date) ^ state.seq);
  state.seq++;
  const price = activityCost(state, id);
  addLedger(state, team, 'Team building', -price, a.label);
  ps.cd['act:' + id] = state.date; ps.cd.activity = state.date;
  const P = { dinner: { aff: 3, heat: 5, morale: 2, chem: 1, fatigue: 0 }, night: { aff: 5, heat: 12, morale: 3, chem: 2, fatigue: -3 }, outdoor: { aff: 6, heat: 8, morale: 3, chem: 2, fatigue: 2 }, retreat: { aff: 10, heat: 35, morale: 5, chem: 5, fatigue: -15 } }[id];
  const rs = rosterOf(state, team).filter((p) => !(ps.players[p.id]?.away && ps.players[p.id].away!.until >= state.date));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const pr = pairOf(ps, rs[i].id, rs[j].id, state.date);
    pr.aff = clamp(pr.aff + P.aff * (1 - Math.max(0, pr.aff) / 120), -100, 100); // close pairs gain less
    pr.heat = Math.max(0, pr.heat - P.heat);
  }
  for (const p of rs) { p.morale = clamp(p.morale + P.morale, 5, 100); if (P.fatigue) p.fatigue = clamp(p.fatigue + P.fatigue, 0, 100); }
  team.chemistry = clamp(team.chemistry + P.chem, 10, 100);
  const shuffled = rng.shuffle([...rs]);
  const [x, y] = [shuffled[0], shuffled[1] ?? shuffled[0]];
  let scene = x ? line(ps, rng, ACTIVITY_SCENES[id], { a: x.handle, b: y.handle }) : '';
  let extra = '';
  if (id === 'outdoor') {
    const egos = [...rs].sort((p, q) => q.hidden.ego - p.hidden.ego);
    if (egos.length >= 2 && egos[1].hidden.ego > 60 && rng.chance(0.3)) {
      const pr = pairOf(ps, egos[0].id, egos[1].id, state.date);
      pr.aff = clamp(pr.aff - 6, -100, 100); pr.heat = clamp(pr.heat + 15, 0, 100);
      extra = ` ${egos[0].handle} and ${egos[1].handle} took the competition a little too seriously.`;
      scene += extra;
    }
  }
  const effects = `Cost ${money(price)} · bonds +${P.aff} · morale +${P.morale} · chemistry +${P.chem}${P.fatigue ? ` · fatigue ${signed(P.fatigue)}` : ''}`;
  feed(ps, state.date, `${a.label}: ${scene}`, 1);
  return { ok: true, message: `${a.label} done. ${effects}`, effects, scene };
}
