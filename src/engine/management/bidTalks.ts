// The player's side of incoming transfer bids. Each bid carries the player's own view of the move (bidStance:
// the bidder's stature and league, the money vs his current deal, whether he'd start there, the trophies on
// offer, loyalty, ego, age, a move home or abroad, morale, trust in you and his friendships in the squad).
// What follows depends on it:
//   - loyal players can turn a big offer down themselves; tempted ones (or their agents) offer to stay for a new
//     deal (approach `bid_agent`); eager ones ask you to let them go before you decide (`bid_push`);
//   - accept a move he doesn't want → he may refuse personal terms (the deal collapses and he knows you tried) or
//     leave unhappily (his friends in the squad notice);
//   - reject a move he wanted → morale / trust drop, he may come back with "Coach, I want that move" (`bid_wants`:
//     let him go / new deal / a starting spot / ask a friend to talk him round / stand firm), which can end in a
//     transfer request, agent pressure and the bidder returning with a raised offer.
// AI-to-AI moves use the same stance as a light filter (transfers.ts). Content: bidTemplates.ts.
import type { GameState, Player, Team, TransferOffer, BidStance } from '../types';
import { ROLES, REGION_LABEL, type RegionId } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addInbox, addNews } from './news';
import { EXTRA_APPROACHES } from './extraApproaches';
import { APPROACH_T } from './peopleTemplates';
import { ISSUE_INFO } from './peopleFx';
import { person, pairKey, openPlayerApproach, playerRequestLive, type ApproachDef, type ApproachCx } from './people';
import { salaryDemand, playerOvr, regionOfCountry, movePlayer, offerRenewal, inTransferWindow, fmtK } from './transfers';
import { lineupStrength, rivalry, fanEvent, fill, type Ctx } from './fans';
import { FAN_TEMPLATES, SCENARIO_META, type Templates } from './fanTemplates';
import { markActionDone } from './offerActions';
import { ageOn } from '../setup';
import { addDays, daysBetween } from '../season/formats';
import { BID_APPROACH_T, BID_LINES, BID_META, BID_TEMPLATES, BID_NEWS } from './bidTemplates';

// ------------------------------------------------------------------ content registration
Object.assign(APPROACH_T, BID_APPROACH_T);
ISSUE_INFO.unsettled ??= { label: 'Wants a move', mood: 'Unsettled', perSev: 0.45, color: '#fb923c' };
if (!SCENARIO_META.bid_loyal) {
  for (const [scen, t] of Object.entries(BID_TEMPLATES)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t) as [keyof Templates, string[]][]) (base[p] ??= []).push(...lines);
  }
  Object.assign(SCENARIO_META, BID_META);
}

const $ = (n: number) => `$${fmtK(n)}`;
const r1000 = (n: number) => Math.round(n / 1000) * 1000;
const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
const homeRegion = (c: string) => (/north america/i.test(c) ? 'NA' : regionOfCountry(c));
const starting = (team: Team, id: string) => ROLES.some((r) => team.lineup[r] === id);
const active = (state: GameState, pid: string, kind: string) => !!state.people?.players[pid]?.issues.some((i) => i.kind === kind && i.until >= state.date && i.sev > 0);

// ------------------------------------------------------------------ the player's view of a move
export const STANCE_INFO: Record<BidStance['label'], { label: string; phrase: string; color: string }> = {
  eager: { label: 'Desperate to go', phrase: 'is desperate to go', color: '#f97316' },
  keen: { label: 'Keen on the move', phrase: 'is keen', color: '#fbbf24' },
  open: { label: 'Tempted', phrase: 'is tempted but torn', color: '#94a3b8' },
  reluctant: { label: 'Reluctant', phrase: 'isn’t keen on leaving', color: '#38bdf8' },
  refuses: { label: 'Wants to stay', phrase: 'doesn’t want to leave', color: '#22c55e' },
};
export function stanceLabel(v: number): BidStance['label'] {
  return v >= 0.4 ? 'eager' : v >= 0.15 ? 'keen' : v > -0.15 ? 'open' : v > -0.4 ? 'reluctant' : 'refuses';
}
const recentTitles = (state: GameState, t: Team) => t.titles.filter((x) => x.season >= state.season - 1).length;

/**
 * How much a player wants to join `buyer` on `salary` (−1 won't go … +1 desperate to go), with the reasons.
 * Deterministic for a given situation (a small per-pair hash adds personal taste). Cheap enough for AI moves.
 */
export function bidStance(state: GameState, p: Player, buyer: Team, salary: number): BidStance {
  const team = p.teamId ? state.teams[p.teamId] : undefined;
  if (!team) return { v: 0.6, label: 'eager', why: 'he is a free agent' };
  const parts: [number, string][] = [];
  const add = (v: number, why: string) => { if (Math.abs(v) >= 0.02) parts.push([v, why]); };
  const age = ageOn(p.birthdate, state.date) ?? 22;
  const ego = (p.hidden.ego - 50) / 50, amb = (p.personality.ambition - 50) / 50;
  const loyalty = (p.hidden.loyalty + p.personality.loyalty) / 2;
  // the club: stature and stage
  const club = clamp((buyer.prestige - team.prestige) / 70 + (tierOf(state, team) - tierOf(state, buyer)) * 0.22, -0.4, 0.45);
  add(club, club > 0 ? `${buyer.short} are a bigger club` : `${buyer.short} would be a step down`);
  // money
  const cur = p.contract?.salary || salaryDemand(state, p, team);
  const ratio = salary / Math.max(1000, cur);
  const money = clamp(Math.log2(Math.max(0.25, ratio)) * 0.38 * (1 + Math.max(0, ego) * 0.4 + (age >= 27 ? 0.3 : 0)), -0.35, 0.5);
  add(money, ratio >= 2.6 ? `${buyer.short}’s offer nearly triples his salary` : ratio >= 1.85 ? `${buyer.short}’s offer doubles his salary` : ratio >= 1.12 ? `a ${Math.round((ratio - 1) * 100)}% pay rise` : ratio < 0.92 ? 'it would mean a pay cut' : '');
  // playing time
  const starterHere = starting(team, p.id);
  const theirs = buyer.lineup[p.role] ? state.players[buyer.lineup[p.role]!] : undefined;
  const wouldStart = !theirs || playerOvr(p) >= playerOvr(theirs) - 1;
  const youth = age < 21 ? 1.3 : 1;
  if (!starterHere && wouldStart) add((0.28 + Math.max(0, ego) * 0.12) * youth, `he’d start at ${buyer.short}`);
  else if (starterHere && !wouldStart) add(-0.22 * youth, `he’d have to fight ${theirs!.handle} for a spot`);
  else if (!starterHere) add(0.06, 'he isn’t starting here either');
  // trophies & ambition
  const power = (t: Team) => lineupStrength(state, t) + t.prestige * 0.15 + recentTitles(state, t) * 2.5;
  const chase = clamp((power(buyer) - power(team)) / 18, -0.35, 0.35) * (0.6 + Math.max(-0.4, amb) * 0.5 + (age >= 25 && age <= 29 ? 0.2 : 0));
  add(chase, chase > 0 ? 'a better shot at trophies' : 'fewer trophies to play for');
  // loyalty & attachment
  add(-(loyalty - 45) / 100 * 0.75, loyalty >= 62 ? `he’s loyal to ${team.short}` : loyalty <= 35 ? 'loyalty isn’t his thing' : '');
  if (p.traits.includes('fan_favorite')) add(-0.12, 'he’s a fan favourite here');
  if (p.career.filter((c) => c.teamId === team.id).length >= 3) add(-0.08, `${p.career.filter((c) => c.teamId === team.id).length} seasons at the club`);
  // home or abroad
  const home = homeRegion(p.country);
  if (home !== team.region && home === buyer.region) add(0.3 + (active(state, p.id, 'homesick') ? 0.2 : 0), `a move home to ${REGION_LABEL[home as RegionId] ?? home}`);
  else if (home === team.region && home !== buyer.region) add(-0.28 * (1 - (p.attributes.adaptability - 50) / 150) - (age >= 26 ? 0.06 : 0), 'he’d have to move abroad');
  // mood, trust and friendships (the user's club only carries locker-room state)
  // a happy dressing room keeps players (a little); an unhappy one pushes them out (a lot)
  add(clamp((55 - p.morale) / 100 * 0.6, -0.12, 0.3), p.morale < 40 ? 'he’s unhappy here' : p.morale > 80 ? 'he’s happy here' : '');
  const ps = state.people?.teamId === team.id ? state.people : undefined;
  const me = ps?.players[p.id];
  if (ps && me) {
    add((50 - me.trust) / 100 * 0.55, me.trust < 35 ? 'he doesn’t trust you' : me.trust > 70 ? 'he believes in your project' : '');
    if (active(state, p.id, 'unsettled')) add(0.2, 'he’s already unsettled');
    let best: [number, string] = [-999, ''], worst: [number, string] = [999, ''];
    for (const q of team.roster) {
      if (q === p.id) continue;
      const pr = ps.pairs[pairKey(p.id, q)];
      if (!pr) continue;
      const h = state.players[q]?.handle ?? '?';
      if (pr.aff > best[0]) best = [pr.aff, h];
      if (pr.aff - pr.heat < worst[0]) worst = [pr.aff - pr.heat, h];
    }
    if (best[0] >= 40) add(-0.08 - (best[0] - 40) / 300, `he’s close with ${best[1]}`);
    if (worst[0] <= -30) add(0.1, `friction with ${worst[1]}`);
  }
  if (rivalry(state, team.id, buyer.id)) add(-(loyalty / 100) * 0.35, `${buyer.short} are the rival`);
  // personal traits (traits agent): mercenaries follow the money, one-club men stay, hometown heroes want home
  if (p.traits.includes('mercenary')) add(0.08, 'he goes where the offer is best');
  if (p.traits.includes('one_club')) add(-0.15, `a one-club man at ${team.short}`);
  if (p.traits.includes('hometown_hero')) add(home === buyer.region ? 0.08 : -0.08, home === buyer.region ? 'a hometown hero going home' : 'a hometown hero far from home');
  parts.push([((hashString(p.id + buyer.id) % 1000) / 1000 - 0.5) * 0.12, '']);
  const v = Math.round(clamp(parts.reduce((s, x) => s + x[0], 0), -1, 1) * 100) / 100;
  const label = stanceLabel(v);
  const named = parts.filter(([, w]) => w);
  const pos = named.filter(([x]) => x > 0).sort((a, b) => b[0] - a[0]), neg = named.filter(([x]) => x < 0).sort((a, b) => a[0] - b[0]);
  const why = label === 'open' ? (pos[0] && neg[0] ? `${pos[0][1]}, but ${neg[0][1]}` : (pos[0] ?? neg[0])?.[1] ?? 'he hasn’t made up his mind')
    : (v > 0 ? pos : neg).slice(0, 2).map((x) => x[1]).join(' and ') || (v > 0 ? 'he likes the project' : 'he’s settled here');
  const reasons = named.filter(([x]) => Math.abs(x) >= 0.05).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 5).map(([x, w]) => `${x > 0 ? '+' : '−'} ${w}`);
  return { v, label, why, reasons };
}
/** "Keria is keen — HLE’s offer doubles his salary." */
export const stanceLine = (p: Player, st: BidStance) => `${p.handle} ${STANCE_INFO[st.label].phrase} — ${st.why}.`;
function restance(state: GameState, o: TransferOffer, nudge = 0) {
  const p = state.players[o.playerId], buyer = state.teams[o.toTeamId];
  if (!p || !buyer) return;
  const st = bidStance(state, p, buyer, o.salary);
  const v = Math.round(clamp(st.v + nudge, -1, 1) * 100) / 100;
  o.stance = { ...o.stance, ...st, v, label: stanceLabel(v) };
}

/** Bid frequency multiplier: unsettled players and those you promised to let go attract more offers. */
export function bidPull(state: GameState, p: Player): number {
  const me = state.people?.teamId === p.teamId ? state.people?.players[p.id] : undefined;
  if (!me) return 1;
  let m = active(state, p.id, 'unsettled') ? 2 : 1;
  for (const k of ['bid:push', 'bid:free']) if (me.cd[k] && daysBetween(me.cd[k], state.date) <= (k === 'bid:free' ? 240 : 90)) m = Math.max(m, 2.5);
  return m;
}
/** Salary a bidder offers the player: their demand plus a premium (rich, ambitious clubs pay over the odds). */
export function bidSalary(state: GameState, p: Player, buyer: Team, rng: RNG): number {
  const demand = salaryDemand(state, p, buyer), cur = p.contract?.salary ?? demand;
  const premium = rng.range(0, 0.3) + (rng.chance(0.2) ? 0.35 : 0) + clamp(((buyer.aiBudget ?? 1) - 1) * 0.4, -0.1, 0.25);
  return r1000(Math.max(demand * (1 + premium * 0.6), cur * (0.95 + premium)));
}

// ------------------------------------------------------------------ helpers: effects, notes, contracts
function fx(state: GameState, p: Player, d: { morale?: number; trust?: number; feel?: string }) {
  if (d.morale) p.morale = clamp(p.morale + d.morale, 5, 100);
  if (state.people?.teamId !== p.teamId) return;
  const me = person(state, p.id);
  if (d.trust) me.trust = clamp(me.trust + d.trust, 0, 100);
  if (d.feel) me.feel = { k: d.feel, until: addDays(state.date, 6) };
}
function unsettle(state: GameState, p: Player, sev: number, len: number) {
  const me = person(state, p.id);
  const ex = me.issues.find((i) => i.kind === 'unsettled' && i.until >= state.date && i.sev > 0);
  const until = addDays(state.date, len);
  if (ex) { ex.sev = Math.max(ex.sev, sev); if (until > ex.until) ex.until = until; return; }
  me.issues.push({ id: `iss_${state.seq++}`, kind: 'unsettled', sev, since: state.date, until });
}
function settle(state: GameState, p: Player, toSev = 0, maxDays?: number) {
  const i = person(state, p.id).issues.find((x) => x.kind === 'unsettled' && x.until >= state.date && x.sev > 0);
  if (!i) return;
  i.sev = Math.min(i.sev, toSev);
  i.treated = true;
  if (i.sev <= 0) i.until = addDays(state.date, -1);
  else if (maxDays !== undefined) { const cap = addDays(state.date, maxDays); if (cap < i.until) i.until = cap; }
}
function feedNote(state: GameState, text: string, tone: number, pids: string[]) {
  const ps = state.people;
  if (!ps) return;
  ps.feed.unshift({ date: state.date, text, tone, pids });
  if (ps.feed.length > 80) ps.feed.length = 80;
}
function line(rng: RNG, key: string, ctx: Ctx): string {
  const pool = BID_LINES[key] ?? [];
  for (let i = 0; i < 6 && pool.length; i++) { const s = fill(rng.pick(pool), ctx); if (s) return s; }
  return pool.map((x) => fill(x, ctx)).find(Boolean) ?? '';
}
function bidNews(state: GameState, rng: RNG, kind: string, ctx: Ctx, teamIds: string[], playerIds: string[]) {
  const t = BID_NEWS[kind];
  if (!t) return;
  const h = fill(rng.pick(t.headline), ctx), b = fill(rng.pick(t.body), ctx);
  if (h && b) addNews(state, { headline: h, body: b, tags: ['transfer'], teamIds, playerIds });
}
/** Teammates with a strong bond (affinity ≥ 40). */
function friendsOf(state: GameState, p: Player): Player[] {
  const ps = state.people, team = p.teamId ? state.teams[p.teamId] : undefined;
  if (!ps || !team || ps.teamId !== team.id) return [];
  return team.roster.filter((q) => q !== p.id && (ps.pairs[pairKey(p.id, q)]?.aff ?? 0) >= 40).map((q) => state.players[q]).filter(Boolean);
}
function bestMate(state: GameState, p: Player): Player | undefined {
  const ps = state.people, team = p.teamId ? state.teams[p.teamId] : undefined;
  if (!ps || !team) return undefined;
  let best: Player | undefined, aff = 39;
  for (const q of team.roster) { const a = ps.pairs[pairKey(p.id, q)]?.aff ?? -999; if (q !== p.id && a > aff) { aff = a; best = state.players[q]; } }
  return best;
}
/** New contract through the normal renewal (falls back to writing it directly — the player already agreed). */
function signExtension(state: GameState, p: Player, salary: number, years: number) {
  const r = offerRenewal(state, p.id, salary, years);
  if (r.ok) return;
  const y = Number(state.date.slice(0, 4)) + years - (state.date.slice(5) > '11-18' ? 0 : 1);
  p.contract = { salary, expires: `${y}-11-18`, buyout: Math.round(p.value * 1.6 / 10000) * 10000, signedOn: state.date };
}
const untilYear = (state: GameState, years: number) => String(Number(state.date.slice(0, 4)) + years - (state.date.slice(5) > '11-18' ? 0 : 1));
/** A live bid conversation with this player already waiting for an answer? */
const talking = (state: GameState, pid: string) => !!state.people?.requests.some((r) => r.playerId === pid && r.kind.startsWith('bid_') && playerRequestLive(state, r.id));
const offerOf = (state: GameState, id: unknown) => state.transferOffers.find((x) => x.id === String(id ?? ''));
/** Once the bid is decided, the conversations about it (push / agent talk) are moot. */
function closeTalks(state: GameState, o: TransferOffer) {
  for (const r of state.people?.requests ?? []) {
    if (r.resolved || r.data?.offerId !== o.id || r.kind === 'bid_wants') continue;
    r.resolved = 'moot';
    r.outcome = 'The bid is no longer on the table.';
    markActionDone(state, 'playerChoice', r.id);
  }
}
/** The player says no to the bid himself (after a new deal or a loyal refusal). */
function closeBid(state: GameState, o: TransferOffer, message: string, note: string) {
  if (o.status !== 'pending') return;
  o.status = 'rejected';
  o.message = message;
  if (o.stance) { o.stance.note = note; o.stance.done = true; }
  markActionDone(state, 'incomingOffer', o.id);
  closeTalks(state, o);
}

// ------------------------------------------------------------------ a bid arrives
/** Inbox message for a new bid (with the player's view), loyal self-refusals and the conversations it starts. */
export function newBid(state: GameState, o: TransferOffer, rng: RNG) {
  const p = state.players[o.playerId], buyer = state.teams[o.toTeamId], user = state.teams[state.userTeamId];
  if (!p || !buyer || !user) return;
  const st = (o.stance ??= bidStance(state, p, buyer, o.salary));
  const me = person(state, p.id);
  if (me.cd['bid:free'] && daysBetween(me.cd['bid:free'], state.date) <= 240) st.promised = true;
  const ctx: Ctx = { me: p.handle, player: p.handle, club: buyer.short, clubName: buyer.name, short: user.short, team: user.name };
  // the loyal ones answer for themselves
  if (st.label === 'refuses' && p.hidden.loyalty >= 70 && !st.promised && rng.chance(0.6)) {
    closeBid(state, o, `${p.handle} turned the move down himself.`, 'He told the bidder no before it reached you.');
    addInbox(state, { from: p.handle, kind: 'player', subject: line(rng, 'loyal_subj', ctx), body: line(rng, 'loyal_body', ctx) });
    fx(state, p, { trust: 2, morale: 1 });
    feedNote(state, `${p.handle} turned down ${buyer.short} without being asked.`, 1, [p.id]);
    if (p.reputation >= 55) { fanEvent(state, 'bid_loyal', { player: p.handle, club: buyer.short }, 2); bidNews(state, rng, 'loyal', ctx, [user.id, buyer.id], [p.id]); }
    return;
  }
  const cur = p.contract?.salary;
  const terms = `${buyer.name} offer ${$(o.fee)} for ${p.handle}${o.stance?.raised ? ' (an improved bid)' : ''}. He would earn ${$(o.salary)}/yr there${cur ? ` (${$(cur)} now)` : ''} on a ${o.years}-year deal.`;
  const promise = st.promised ? '\n\nYou promised to let him go if a fair offer came. Turning this down would break your word.' : '';
  const hint = st.label === 'eager' ? ' Turning it down will hurt.' : st.label === 'refuses' || st.label === 'reluctant' ? ' He may refuse personal terms if you accept.' : '';
  addInbox(state, { from: buyer.name, subject: `${o.stance?.raised ? 'Improved bid' : 'Bid'} for ${p.handle}: ${$(o.fee)}`, body: `${terms}\n\n${stanceLine(p, st)}${hint}${promise}`, kind: 'transfer', action: { type: 'incomingOffer', payload: o.id, label: 'Review offer' } });
  // conversations before you decide
  if (!talking(state, p.id)) {
    let req = null;
    if (st.label === 'eager' && !st.promised && rng.chance(0.65)) req = openPlayerApproach(state, p.id, 'bid_push', { club: buyer.short, clubName: buyer.name, offerId: o.id });
    else if ((st.label === 'keen' || st.label === 'open') && p.contract && (st.label === 'keen' || p.hidden.ego >= 55 || p.personality.ambition >= 60 || o.salary >= (cur ?? 0) * 1.25) && rng.chance(0.5)) req = openPlayerApproach(state, p.id, 'bid_agent', agentData(state, p, o));
    if (req) st.req = req.id;
  }
  if (p.reputation >= 65 && st.v >= 0.15 && rng.chance(0.5)) fanEvent(state, 'bid_rumour', { player: p.handle, club: buyer.short }, 2);
}

function agentData(state: GameState, p: Player, o: TransferOffer): Record<string, string | number> {
  const team = state.teams[state.userTeamId], buyer = state.teams[o.toTeamId];
  const cur = p.contract?.salary ?? salaryDemand(state, p, team);
  const v = Math.max(0, o.stance?.v ?? 0);
  const ask = r1000(clamp(Math.max(cur * (1.12 + 0.25 * v), salaryDemand(state, p, team) * 1.05, Math.min(o.salary * 0.9, cur * 1.8)), cur * 1.08, cur * 2.2));
  const counter = r1000((cur + ask) / 2);
  const years = p.hidden.loyalty >= 60 ? 3 : 2;
  return { club: buyer?.short ?? 'them', clubName: buyer?.name ?? 'the club', offerId: o.id, ask: $(ask), askN: ask, counter: $(counter), counterN: counter, years, until: untilYear(state, years) };
}

// ------------------------------------------------------------------ you accept / reject
/** Accepting a bid: does the player agree personal terms? Call before the move. */
export function bidTerms(state: GameState, o: TransferOffer, rng: RNG): { ok: boolean; message?: string } {
  const st = o.stance, p = state.players[o.playerId], buyer = state.teams[o.toTeamId];
  if (!st || !p || !buyer) return { ok: true };
  const pRefuse = st.label === 'reluctant' ? 0.35 + (-st.v - 0.15) * 1.2 : st.label === 'refuses' ? 0.65 + (-st.v - 0.4) * 0.8 : 0;
  if (pRefuse <= 0 || !rng.chance(clamp(pRefuse, 0, 0.9))) return { ok: true };
  const hard = st.label === 'refuses';
  fx(state, p, { trust: hard ? -15 : -10, morale: hard ? -10 : -7, feel: 'betrayed' });
  for (const q of friendsOf(state, p)) fx(state, q, { trust: -2 });
  closeBid(state, o, `${p.handle} refused personal terms with ${buyer.name}.`, 'He refused personal terms — and knows you were ready to sell him.');
  const ctx: Ctx = { me: p.handle, club: buyer.short, clubName: buyer.name };
  addInbox(state, { from: p.handle, kind: 'player', subject: line(rng, 'refused_subj', ctx), body: line(rng, 'refused_body', ctx) });
  feedNote(state, `${p.handle} refused to join ${buyer.short} after the club accepted their bid.`, -1, [p.id]);
  return { ok: false, message: `${p.handle} refused personal terms with ${buyer.short} — the deal collapsed. He knows you were ready to sell him (trust −${hard ? 15 : 10}).` };
}

/** A sale goes through: the farewell and the squad's reaction. Call BEFORE movePlayer (needs his relationships). */
export function bidSold(state: GameState, o: TransferOffer, rng: RNG): string {
  const st = o.stance, p = state.players[o.playerId], buyer = state.teams[o.toTeamId], user = state.teams[state.userTeamId];
  if (!st || !p || !buyer) return '';
  st.done = true;
  closeTalks(state, o);
  const ctx: Ctx = { me: p.handle, player: p.handle, club: buyer.short, clubName: buyer.name, short: user.short, team: user.name };
  const friends = friendsOf(state, p);
  const unwilling = st.label === 'reluctant' || st.label === 'refuses';
  for (const q of friends) fx(state, q, unwilling ? { morale: -4, trust: -3 } : { morale: -2 });
  const key = st.label === 'eager' || st.label === 'keen' ? 'farewell_happy' : st.label === 'open' ? 'farewell_neutral' : 'farewell_bitter';
  addInbox(state, { from: p.handle, kind: 'player', subject: unwilling ? 'Goodbye' : 'Thank you, coach', body: line(rng, key, ctx) });
  if (unwilling && p.reputation >= 55) fanEvent(state, 'bid_sold_unwilling', { player: p.handle, club: buyer.short }, 2);
  st.note = unwilling ? 'Left against his wishes.' : st.label === 'open' ? 'Left on good terms.' : 'Got the move he wanted.';
  const names = friends.map((q) => q.handle).slice(0, 3).join(', ');
  return unwilling ? ` He didn’t want to go${names ? ` — ${names} are upset` : ''}.` : st.label === 'eager' || st.label === 'keen' ? ' He leaves happy.' : '';
}

/** You turned the bid down (or let it expire): the player's reaction and what happens next. */
export function bidRejected(state: GameState, o: TransferOffer, rng: RNG, expired = false): string {
  const st = o.stance, p = state.players[o.playerId], buyer = state.teams[o.toTeamId];
  if (!st || st.done || !p || !buyer || p.teamId !== state.userTeamId) return '';
  st.done = true;
  closeTalks(state, o);
  const ctx: Ctx = { me: p.handle, player: p.handle, club: buyer.short, clubName: buyer.name, short: state.teams[state.userTeamId].short };
  const k = expired ? 0.6 : 1;
  if (st.promised) {
    fx(state, p, { trust: -14, morale: -8, feel: 'betrayed' });
    unsettle(state, p, 2, rng.int(30, 45));
    addInbox(state, { from: p.handle, kind: 'player', subject: line(rng, 'broken_subj', ctx), body: line(rng, 'broken_body', ctx) });
    feedNote(state, `${p.handle} feels betrayed: you promised to let him go and turned down ${buyer.short}.`, -1, [p.id]);
    st.next = addDays(state.date, rng.int(1, 3)); st.step = 'wants';
    st.note = 'You broke your word — he wanted this move.';
    return ` You had promised to let him go — trust −14.`;
  }
  switch (st.label) {
    case 'eager': {
      const m = Math.round((6 + 6 * st.v) * k), t = Math.round((5 + 6 * st.v) * k);
      fx(state, p, { morale: -m, trust: -t, feel: expired ? 'ignored' : 'resentful' });
      unsettle(state, p, 2, rng.int(25, 40));
      if (rng.chance(0.85)) { st.next = addDays(state.date, rng.int(1, 2)); st.step = 'wants'; }
      else if (rng.chance(0.4)) { st.next = addDays(state.date, rng.int(4, 7)); st.step = 'raise'; }
      st.note = 'He wanted this move badly.';
      feedNote(state, `${p.handle} is upset that the club turned down ${buyer.short}.`, -1, [p.id]);
      return ` ${p.handle} wanted this move: morale −${m}, trust −${t}.`;
    }
    case 'keen': {
      const m = Math.round((3 + 5 * st.v) * k), t = Math.round((2 + 5 * st.v) * k);
      fx(state, p, { morale: -m, trust: -t, feel: expired ? 'ignored' : 'hurt' });
      if (rng.chance(0.5)) unsettle(state, p, 1, rng.int(20, 30));
      if (rng.chance(0.3 + Math.max(0, p.hidden.ego - 50) / 200 + Math.max(0, p.personality.ambition - 50) / 300)) { st.next = addDays(state.date, rng.int(1, 3)); st.step = 'wants'; }
      else if (rng.chance(0.2)) { st.next = addDays(state.date, rng.int(5, 9)); st.step = 'raise'; }
      st.note = 'He was keen on the move.';
      return ` ${p.handle} was keen on it: morale −${m}, trust −${t}.`;
    }
    case 'open':
      fx(state, p, { morale: -1 });
      st.note = 'He shrugged it off.';
      return '';
    case 'reluctant':
      if (!expired) fx(state, p, { trust: 2, morale: 2, feel: 'reassured' });
      st.note = 'He’s relieved to stay.';
      return expired ? '' : ` ${p.handle} is relieved (trust +2).`;
    default:
      fx(state, p, { trust: expired ? 1 : 3, morale: 2, feel: 'grateful' });
      if (!expired && rng.chance(0.4)) addInbox(state, { from: p.handle, kind: 'player', subject: 'Thanks, coach', body: line(rng, 'thanks_kept', ctx) });
      if (!expired && p.reputation >= 70 && rng.chance(0.5)) fanEvent(state, 'bid_kept', { player: p.handle, club: buyer.short }, 2);
      st.note = 'He wanted to stay — he’s grateful.';
      return ` ${p.handle} is grateful you kept him (trust +${expired ? 1 : 3}).`;
  }
}

// ------------------------------------------------------------------ follow-ups (daily)
/** Daily (reactions.reactionsDaily): unanswered bids, "I want that move" talks, raised bids, agent pressure. */
export function bidsDaily(state: GameState) {
  const user = state.teams[state.userTeamId];
  if (!user) return;
  const rng = new RNG(hashString(state.date + 'bids') ^ state.seq);
  for (const o of [...state.transferOffers]) {
    if (o.direction !== 'incoming' || !o.stance) continue;
    if (o.status === 'withdrawn' && !o.stance.done) { bidRejected(state, o, rng, true); continue; }
    if (!o.stance.next || o.stance.next > state.date) continue;
    const step = o.stance.step;
    o.stance.next = undefined; o.stance.step = undefined;
    const p = state.players[o.playerId];
    if (!p || p.teamId !== user.id) continue;
    if (step === 'wants') {
      if (talking(state, p.id)) { o.stance.next = addDays(state.date, 2); o.stance.step = 'wants'; continue; }
      const req = openPlayerApproach(state, p.id, 'bid_wants', wantsData(state, p, o));
      if (req) o.stance.req = req.id;
    } else if (step === 'raise') raisedBid(state, o, rng);
    else if (step === 'agent') agentPressure(state, o, rng);
  }
}

function wantsData(state: GameState, p: Player, o: TransferOffer): Record<string, string | number> {
  const team = state.teams[state.userTeamId], buyer = state.teams[o.toTeamId];
  const cur = p.contract?.salary ?? salaryDemand(state, p, team);
  const raise = r1000(Math.max(cur * 1.3, salaryDemand(state, p, team) * 1.1, Math.min(o.salary * 0.95, cur * 2)));
  const mate = bestMate(state, p);
  const d: Record<string, string | number> = { club: buyer?.short ?? 'them', clubName: buyer?.name ?? 'the club', offerId: o.id, fee: $(o.fee), raise: $(raise), raiseN: raise, years: 2, until: untilYear(state, 2) };
  if (mate) { d.mate = mate.handle; d.mateId = mate.id; }
  return d;
}

/** The bidder comes back with an improved offer (the player told them he wants to come). */
function raisedBid(state: GameState, o: TransferOffer, rng: RNG) {
  const p = state.players[o.playerId], buyer = state.teams[o.toTeamId], user = state.teams[state.userTeamId];
  if (!p || !buyer || p.teamId !== user.id) return;
  if (!inTransferWindow(state.date)) { person(state, p.id).cd['bid:push'] = state.date; return; }
  if (state.transferOffers.some((x) => x.direction === 'incoming' && x.playerId === p.id && x.status === 'pending')) return;
  const fee = Math.round(o.fee * rng.range(1.12, 1.3) / 5000) * 5000;
  if (buyer.balance < fee * 1.1) return;
  const salary = r1000(o.salary * rng.range(1.04, 1.15));
  const n: TransferOffer = { id: `to_${state.seq++}`, date: state.date, playerId: p.id, fromTeamId: user.id, toTeamId: buyer.id, fee, salary, years: o.years, status: 'pending', direction: 'incoming', expires: addDays(state.date, 7) };
  state.transferOffers.unshift(n);
  restance(state, n, 0.1);
  n.stance!.raised = (o.stance?.raised ?? 0) + 1;
  newBid(state, n, rng);
}

/** After a transfer request: his agent writes, bids become more likely, and the bidder returns if the window is open. */
function agentPressure(state: GameState, o: TransferOffer, rng: RNG) {
  const p = state.players[o.playerId], buyer = state.teams[o.toTeamId];
  if (!p || !buyer || p.teamId !== state.userTeamId) return;
  person(state, p.id).cd['bid:push'] = state.date;
  const ctx: Ctx = { me: p.handle, club: buyer.short, clubName: buyer.name };
  addInbox(state, { from: `${p.handle}’s agent`, kind: 'transfer', subject: line(rng, 'agent_subj', ctx), body: line(rng, 'agent_body', ctx) });
  raisedBid(state, o, rng);
}

// ------------------------------------------------------------------ the conversations (player approaches)
const chance = (rng: RNG, x: number) => rng.chance(clamp(x, 0.05, 0.95));
const loyalZ = (p: Player) => (p.hidden.loyalty - 50) / 50;

const push: ApproachDef = {
  title: 'Wants the move', cd: 0, weight: () => 0,
  opts: () => [
    { id: 'consider', label: 'I’ll weigh it up — no promises', hint: 'Honest · nothing changes yet' },
    { id: 'yes', label: 'If the fee is right, you can go', hint: 'Morale & trust up · turning the bid down later breaks your word' },
    { id: 'no', label: 'You’re not for sale', hint: 'Morale & trust drop · he may push harder' },
  ],
  fallback: 'consider',
  resolve: (c, req, opt) => {
    const o = offerOf(c.state, req.data?.offerId);
    if (opt === 'yes') { if (o?.stance) o.stance.promised = true; return { out: 'yes', fx: { morale: 5, trust: 3, feel: 'hopeful' } }; }
    if (opt === 'no') { if (o?.stance) o.stance.v = Math.min(1, o.stance.v + 0.05); return { out: 'no', fx: { morale: -5, trust: c.egoZ > 0.3 ? -5 : -3, feel: 'resentful' } }; }
    return { out: 'consider', fx: { trust: 1 } };
  },
};

const agent: ApproachDef = {
  title: 'New contract to stay', cd: 0, weight: () => 0,
  opts: (c) => [
    { id: 'agree', label: 'Agree: {ask}/yr until {until}', hint: 'He signs and turns the bid down himself' },
    { id: 'counter', label: 'Counter at {counter}/yr', hint: 'Works on loyal players who trust you' },
    ...(!c.starter ? [{ id: 'role', label: 'Guarantee him starts instead of a raise', hint: 'Promise: two starts in three weeks' }] : []),
    { id: 'decide', label: 'The club decides on the bid first', hint: 'Trust drops a little' },
  ],
  fallback: 'decide',
  resolve: (c, req, opt, rng) => {
    const o = offerOf(c.state, req.data?.offerId);
    const years = Number(req.data?.years ?? 2);
    const commit = (salary: number) => {
      signExtension(c.state, c.p, salary, years);
      settle(c.state, c.p);
      if (o) { restance(c.state, o); closeBid(c.state, o, `${c.p.handle} signed a new contract and turned the move down.`, 'Signed a new deal to stay.'); }
      const user = c.team, buyer = o ? c.state.teams[o.toTeamId] : undefined;
      if (c.p.reputation >= 55) { fanEvent(c.state, 'bid_new_deal', { player: c.p.handle, club: buyer?.short ?? 'them' }, 2); bidNews(c.state, rng, 'new_deal', { player: c.p.handle, club: buyer?.short ?? 'rivals', team: user.name, short: user.short }, [user.id], [c.p.id]); }
    };
    if (opt === 'agree') { commit(Number(req.data?.askN ?? 0)); return { out: 'agree', fx: { morale: 3, trust: 4, feel: 'grateful' }, note: `New contract: ${req.data?.ask}/yr until ${req.data?.until}.` }; }
    if (opt === 'counter') {
      const v = Math.max(0, o?.stance?.v ?? 0);
      if (chance(rng, 0.3 + loyalZ(c.p) * 0.25 + c.trustZ * 0.25 + c.proZ * 0.1 - v * 0.5)) { commit(Number(req.data?.counterN ?? 0)); return { out: 'counter_yes', fx: { morale: 2, trust: 3 }, note: `New contract: ${req.data?.counter}/yr until ${req.data?.until}.` }; }
      if (o) restance(c.state, o, 0.08);
      return { out: 'counter_no', fx: { morale: -2, trust: -1 } };
    }
    if (opt === 'role') {
      c.me.promises.unshift({ kind: 'playtime', text: 'two starts within three weeks', made: c.state.date, deadline: addDays(c.state.date, 21), need: 2, got: 0, status: 'open' });
      if (c.me.promises.length > 6) c.me.promises.length = 6;
      if (o) restance(c.state, o, -0.25);
      return { out: 'role', fx: { morale: 4, trust: 3, feel: 'hopeful' } };
    }
    return { out: 'decide', fx: { trust: c.egoZ > 0.3 ? -4 : -2 } };
  },
};

const wants: ApproachDef = {
  title: 'Wants to leave', cd: 0, weight: () => 0,
  opts: (c, d) => [
    { id: 'letgo', label: inTransferWindow(c.state.date) ? 'Fine — call {club} back and sell' : 'Fine — you can go if a fair bid comes', hint: inTransferWindow(c.state.date) ? 'He leaves for the original fee ({fee})' : 'A promise for the next window' },
    c.starter ? { id: 'raise', label: 'Offer a new deal: {raise}/yr until {until}', hint: 'Costs wages · might settle him' } : { id: 'role', label: 'Promise him a starting spot', hint: 'Promise: two starts in three weeks' },
    ...(d.mateId ? [{ id: 'mate', label: 'Ask {mate} to talk him round', hint: 'Depends on their bond' }] : []),
    { id: 'firm', label: 'Stand firm — you’re under contract', hint: 'Professionals accept it; others may hand in a transfer request' },
  ],
  fallback: 'firm',
  resolve: (c, req, opt, rng) => wantsResolve(c, req.data ?? {}, opt, rng),
};

function wantsResolve(c: ApproachCx, d: Record<string, string | number>, opt: string, rng: RNG) {
  const { state, p, team } = c;
  const o = offerOf(state, d.offerId);
  const buyer = o ? state.teams[o.toTeamId] : undefined;
  const v = Math.max(0, o?.stance?.v ?? 0.3);
  if (opt === 'letgo') {
    if (o && buyer && inTransferWindow(state.date) && buyer.balance >= o.fee) {
      const sale: TransferOffer = { ...o, id: `to_${state.seq++}`, date: state.date, status: 'accepted', expires: state.date, stance: { ...(o.stance ?? { v, label: 'eager', why: '' }), note: 'Sold after he asked to leave.', done: true } };
      state.transferOffers.unshift(sale);
      for (const q of friendsOf(state, p)) fx(state, q, { morale: -2 });
      settle(state, p);
      movePlayer(state, p, buyer, o.salary, o.years, o.fee);
      addNews(state, { headline: `${buyer.short} sign ${p.handle}`, body: `${p.handle} moves for $${fmtK(o.fee)}.`, tags: ['transfer'], playerIds: [p.id] });
      bidNews(state, rng, 'forced_exit', { player: p.handle, club: buyer.name, team: team.name, short: team.short }, [team.id, buyer.id], [p.id]);
      return { out: 'letgo_sold', fx: { morale: 4 }, note: `${p.handle} joins ${buyer.name} for ${$(o.fee)}.` };
    }
    person(state, p.id).cd['bid:free'] = state.date;
    settle(state, p, 1, 30);
    return { out: 'letgo_later', fx: { morale: 5, trust: 2, feel: 'hopeful' }, note: 'You promised not to block a fair bid next window.' };
  }
  if (opt === 'raise') {
    if (chance(rng, 0.75 - v * 0.5 + loyalZ(p) * 0.2 + c.trustZ * 0.15)) {
      signExtension(state, p, Number(d.raiseN ?? 0), Number(d.years ?? 2));
      settle(state, p);
      return { out: 'raise_yes', fx: { morale: 4, trust: 4, feel: 'grateful' }, note: `New contract: ${d.raise}/yr until ${d.until}.` };
    }
    if (o && rng.chance(0.4)) { o.stance!.next = addDays(state.date, rng.int(4, 8)); o.stance!.step = 'raise'; }
    return { out: 'raise_no', fx: { morale: -2, trust: -1 } };
  }
  if (opt === 'role') {
    c.me.promises.unshift({ kind: 'playtime', text: 'two starts within three weeks', made: state.date, deadline: addDays(state.date, 21), need: 2, got: 0, status: 'open' });
    if (c.me.promises.length > 6) c.me.promises.length = 6;
    settle(state, p, 1, 21);
    return { out: 'role', fx: { morale: 4, trust: 3, feel: 'hopeful' } };
  }
  if (opt === 'mate') {
    const q = state.players[String(d.mateId ?? '')];
    const pr = q && state.people ? state.people.pairs[pairKey(p.id, q.id)] : undefined;
    if (q && pr && q.teamId === team.id && chance(rng, 0.3 + pr.aff / 200 + (q.hidden.professionalism - 50) / 200 - v * 0.3)) {
      pr.aff = clamp(pr.aff + 5, -100, 100);
      settle(state, p);
      return { out: 'mate_good', fx: { morale: 3, trust: 1 } };
    }
    if (pr) { pr.aff = clamp(pr.aff - 8, -100, 100); pr.heat = clamp(pr.heat + 10, 0, 100); }
    return { out: 'mate_bad', fx: { morale: -2 } };
  }
  // stand firm
  if (chance(rng, 0.45 + c.proZ * 0.3 + c.trustZ * 0.2 - c.egoZ * 0.3 - v * 0.4)) {
    settle(state, p, 1, 14);
    return { out: 'firm_good', fx: { morale: -2 } };
  }
  unsettle(state, p, 3, rng.int(35, 50));
  team.chemistry = clamp(team.chemistry - 1, 10, 100);
  if (o?.stance) { o.stance.next = addDays(state.date, rng.int(7, 12)); o.stance.step = 'agent'; o.stance.note = 'Handed in a transfer request.'; }
  if (p.reputation >= 45) {
    fanEvent(state, 'bid_transfer_request', { player: p.handle, club: buyer?.short ?? 'rivals' }, 3);
    bidNews(state, rng, 'transfer_request', { player: p.handle, club: buyer?.name ?? 'other clubs', team: team.name, short: team.short }, [team.id], [p.id]);
  }
  feedNote(state, `${p.handle} handed in a transfer request.`, -1, [p.id]);
  return { out: 'firm_bad', fx: { morale: -6, trust: -8, feel: 'angry' }, note: `${p.handle} has handed in a transfer request.` };
}

Object.assign(EXTRA_APPROACHES, { bid_push: push, bid_agent: agent, bid_wants: wants });
