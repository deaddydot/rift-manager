// Contracts, transfer windows, AI roster management, user offers & negotiations, prospects.
import type { GameState, Player, Team, TransferOffer, Role, RegionId } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { overall, salaryFor, marketValue, ageOn } from '../setup';
import { addInbox, addNews } from './news';
import { newIdentity, newChampionPool } from './freeAgents';
import { addLedger, payrollYearly } from './finance';
import { fansFollowPlayer } from './fanbase';
import { bidStance, bidSalary, bidPull, newBid, bidTerms, bidSold, bidRejected } from './bidTalks';
import { traitContractMod } from './traitEffects';
import { noteDeparture, noteArrival, aiSquadDaily, aiSquadWeekly, teamLevel, aiNeeds, neededRoles } from './aiSquad';
import { rollPotential } from './potential';
import { RATING_MAX, marketDrift } from '../ratings';

export function inTransferWindow(date: string) {
  const md = date.slice(5);
  return md >= '11-15' || md <= '01-15' || (md >= '06-01' && md <= '06-30');
}
/** Window key of a date: '2026-off' (Nov 15 – Jan 15 of the next year) or '2026-mid' (June); null when closed. */
export function windowKey(date: string): string | null {
  if (!inTransferWindow(date)) return null;
  const y = Number(date.slice(0, 4)), md = date.slice(5);
  return md >= '11-15' ? `${y}-off` : md <= '01-15' ? `${y - 1}-off` : `${y}-mid`;
}

export const playerOvr = (p: Player) => overall(p.attributes, p.role);
const tierOf = (state: GameState, t?: Team | null) => (t ? state.leagues[t.leagueId]?.tier ?? 3 : 3);

/** Salary a player asks for from a given team (yearly USD). */
export function salaryDemand(state: GameState, p: Player, team: Team): number {
  const base = salaryFor(playerOvr(p), tierOf(state, team), team.leagueId, p.traits, marketDrift(state));
  const ego = 1 + (p.hidden.ego - 50) / 250;
  const loyalty = p.teamId === team.id ? 1 - p.hidden.loyalty / 600 : 1;
  const prestigeDiscount = 1 - clamp((team.prestige - 60) / 300, -0.1, 0.12);
  // personal traits: One-Club Player gives his own club a discount, Hometown Hero one at a home-region club
  const home = (/north america/i.test(p.country) ? 'NA' : regionOfCountry(p.country)) === team.region;
  const traits = traitContractMod(p, { ownClub: p.teamId === team.id, homeRegion: home });
  return Math.round(base * ego * loyalty * prestigeDiscount * traits / 1000) * 1000;
}

/** Fee the owning team wants (or the buyout). */
export function askingFee(state: GameState, p: Player, owner: Team | null): number {
  if (!owner) return 0;
  const starter = Object.values(owner.lineup).includes(p.id);
  const yearsLeft = p.contract ? Math.max(0.2, (new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)) : 0;
  const fee = p.value * (starter ? 1.25 : 0.85) * (0.6 + Math.min(1.2, yearsLeft) * 0.5);
  return Math.round(Math.min(fee, p.contract?.buyout || Infinity) / 5000) * 5000;
}

/** Interest of a player in joining a team (0..1). */
export function interest(state: GameState, p: Player, team: Team): number {
  const curTier = tierOf(state, p.teamId ? state.teams[p.teamId] : null);
  const tTier = tierOf(state, team);
  let x = 0.5 + (team.prestige - (p.teamId ? state.teams[p.teamId]?.prestige ?? 30 : 30)) / 100 + (curTier - tTier) * 0.15;
  x += (team.facilities.gamingHouse - 2) * 0.03;
  // regional loyalty: players prefer home regions
  const home = regionOfCountry(p.country);
  if (home && home !== team.region) x -= 0.18;
  if (p.isSub || !p.teamId) x += 0.15;
  // loyal players under contract are harder to prise away
  if (p.teamId && !p.isSub) x -= (p.hidden.loyalty - 50) / 400;
  return clamp(x, 0.02, 0.98);
}

const KR = ['South Korea'], CN = ['China', 'Taiwan', 'Hong Kong'], BR = ['Brazil'], NA = ['United States', 'Canada', 'Mexico'];
export function regionOfCountry(c: string): string | null {
  if (KR.includes(c)) return 'KR';
  if (CN.includes(c)) return 'CN';
  if (BR.includes(c)) return 'BR';
  if (NA.includes(c)) return 'NA';
  if (['Vietnam', 'Japan', 'Philippines', 'Thailand', 'Australia', 'Singapore', 'Malaysia', 'Indonesia'].includes(c)) return 'APAC';
  return 'EMEA';
}

// ------------------------------------------------------------------ moves
export function movePlayer(state: GameState, p: Player, to: Team | null, salary: number, years: number, fee = 0) {
  const from = p.teamId ? state.teams[p.teamId] : null;
  if (from) {
    noteDeparture(state, from, p, to); // an AI club that loses a starter starts looking for a replacement (aiSquad.ts)
    fansFollowPlayer(state, from, to, p); // some die-hards follow a beloved player out (fanbase.ts)
    from.roster = from.roster.filter((id) => id !== p.id);
    for (const r of ROLES) if (from.lineup[r] === p.id) from.lineup[r] = null;
    if (fee) addLedger(state, from, 'Transfer income', fee, p.handle);
    from.chemistry = clamp(from.chemistry - 6, 10, 100);
    autoFillLineup(state, from);
  }
  p.teamId = to ? to.id : null;
  if (to) {
    to.roster.push(p.id);
    p.joinedOn = state.date;
    if (fee) addLedger(state, to, 'Transfer fees', -fee, p.handle);
    p.contract = { salary, expires: `${new Date(state.date).getUTCFullYear() + years + (state.date.slice(5) > '11-18' ? 0 : -1)}-11-18`, buyout: Math.round(p.value * 1.6 / 10000) * 10000, signedOn: state.date };
    to.chemistry = clamp(to.chemistry - 5, 10, 100);
    if (!to.lineup[p.role] || playerOvr(state.players[to.lineup[p.role]!]) < playerOvr(p)) {
      if (to.id !== state.userTeamId || !to.lineup[p.role]) to.lineup[p.role] = p.id;
    }
    p.isSub = !Object.values(to.lineup).includes(p.id);
    noteArrival(state, to, p);
  } else p.contract = null;
  p.morale = clamp(p.morale + 5, 5, 100);
}

export function autoFillLineup(state: GameState, team: Team) {
  for (const r of ROLES) {
    const cur = team.lineup[r];
    if (cur && state.players[cur]?.teamId === team.id) continue;
    const best = team.roster.map((id) => state.players[id]).filter((p) => p && p.role === r && !Object.values(team.lineup).includes(p.id)).sort((a, b) => playerOvr(b) - playerOvr(a))[0];
    team.lineup[r] = best?.id ?? null;
  }
}

// ------------------------------------------------------------------ contract expiry
export function processExpiries(state: GameState, rng: RNG) {
  for (const p of Object.values(state.players)) {
    if (!p.contract || p.retired || p.contract.expires > state.date) continue;
    const team = p.teamId ? state.teams[p.teamId] : null;
    if (!team) { p.contract = null; continue; }
    if (team.id === state.userTeamId) {
      addInbox(state, { from: 'Contracts', subject: `${p.handle} is now a free agent`, body: `${p.handle}'s contract expired and they have left the team.`, kind: 'transfer' });
      movePlayer(state, p, null, 0, 0);
      continue;
    }
    // AI renewal: clubs keep their core starters if affordable; fringe starters, ageing ones and most subs are let
    // go (a departing starter leaves a need the club works on within days, aiSquad.ts)
    const starter = Object.values(team.lineup).includes(p.id);
    const demand = salaryDemand(state, p, team);
    const affordable = team.balance > demand * 0.8;
    const ovr = playerOvr(p), age = ageOn(p.birthdate, state.date) ?? 22;
    const level = teamLevel(state, team);
    const chance = starter ? (ovr >= level + 3 ? 0.96 : ovr >= level - 4 ? 0.88 : 0.62) * (age >= 29 ? 0.85 : 1) : age <= 21 && p.hidden.potential - ovr >= 25 ? 0.5 : 0.22;
    const keep = affordable && rng.chance(chance);
    if (keep) p.contract = { salary: demand, expires: `${Number(state.date.slice(0, 4)) + rng.int(1, 2)}-11-18`, buyout: Math.round(p.value * 1.5 / 10000) * 10000, signedOn: state.date };
    else movePlayer(state, p, null, 0, 0);
  }
}

/** Remind the user about expiring contracts (60 days ahead). */
export function expiryReminders(state: GameState) {
  const team = state.teams[state.userTeamId];
  for (const days of [60, 14]) {
    const soon = new Date(state.date); soon.setUTCDate(soon.getUTCDate() + days);
    const lo = soon.toISOString().slice(0, 10);
    soon.setUTCDate(soon.getUTCDate() + 6);
    const hi = soon.toISOString().slice(0, 10);
    for (const id of team.roster) {
      const p = state.players[id];
      if (p?.contract && p.contract.expires >= lo && p.contract.expires <= hi) addInbox(state, { from: 'Contracts', subject: `${days === 14 ? 'FINAL WARNING: ' : ''}${p.handle}'s contract expires ${days === 14 ? 'in two weeks' : 'in ~2 months'}`, body: `${p.handle}'s contract ends on ${p.contract.expires}. Open their profile (or the Transfers page) to offer a renewal, otherwise they leave as a free agent.`, kind: 'transfer', action: { type: 'openPlayer', payload: p.id, label: 'Open profile' } });
    }
  }
}

// ------------------------------------------------------------------ AI market activity (weekly during windows)
/**
 * Weekly in transfer windows: AI clubs replace departures, upgrade weak roles, add depth and tidy rosters.
 * The logic lives in aiSquad.ts (replacements also run daily, see resolveOffers).
 */
export function aiTransfers(state: GameState, rng: RNG) {
  aiSquadWeekly(state, rng);
}

// ------------------------------------------------------------------ user offers
export function makeOffer(state: GameState, playerId: string, fee: number, salary: number, years: number): TransferOffer {
  const p = state.players[playerId];
  const o: TransferOffer = {
    id: `to_${state.seq++}`, date: state.date, playerId, fromTeamId: p.teamId, toTeamId: state.userTeamId, fee, salary, years,
    status: 'pending', direction: 'outgoing', expires: addDays(state.date, 3),
  };
  state.transferOffers.unshift(o);
  return o;
}

/** Resolve pending user offers, then let AI clubs work on their open needs (called daily from endDay). */
export function resolveOffers(state: GameState, rng: RNG) {
  resolveUserOffers(state, rng);
  aiSquadDaily(state, rng); // replacements within days of a departure, emergency signings for empty slots (aiSquad.ts)
}

function resolveUserOffers(state: GameState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  for (const o of state.transferOffers) {
    if (o.status !== 'pending' || o.direction !== 'outgoing' || o.expires > state.date) continue;
    const p = state.players[o.playerId];
    const owner = p.teamId ? state.teams[p.teamId] : null;
    if (!inTransferWindow(state.date) && owner) { o.status = 'rejected'; o.message = 'The transfer window is closed.'; notify(state, o, p); continue; }
    const ask = askingFee(state, p, owner);
    const demand = salaryDemand(state, p, user);
    const int = interest(state, p, user);
    if (owner && o.fee < ask * (0.92 + rng.next() * 0.1)) { o.status = 'rejected'; o.message = `${owner.name} want around $${fmtK(ask)}.`; }
    else if (o.salary < demand * (0.95 - int * 0.15)) { o.status = 'rejected'; o.message = `${p.handle} wants about $${fmtK(demand)} per year.`; }
    else if (rng.next() > int + 0.25) { o.status = 'rejected'; o.message = `${p.handle} is not interested in joining ${user.name} right now.`; }
    else if (user.balance < o.fee) { o.status = 'rejected'; o.message = 'Insufficient funds.'; }
    else {
      o.status = 'accepted';
      movePlayer(state, p, user, o.salary, o.years, o.fee);
      addNews(state, { headline: `${user.short} sign ${p.handle}`, body: `${user.name} complete the signing of ${p.handle}${o.fee ? ` for $${fmtK(o.fee)}` : ''}.`, tags: ['transfer'], teamIds: [user.id], playerIds: [p.id] });
    }
    notify(state, o, p);
  }
}

function notify(state: GameState, o: TransferOffer, p: Player) {
  addInbox(state, { from: 'Transfers', subject: `Offer for ${p.handle}: ${o.status}`, body: o.status === 'accepted' ? `${p.handle} has joined the team on $${fmtK(o.salary)}/yr for ${o.years} year(s).` : o.message ?? 'Offer rejected.', kind: 'transfer' });
}

/** Contract renewal for one of the user's players. */
export function offerRenewal(state: GameState, playerId: string, salary: number, years: number): { ok: boolean; message: string } {
  const p = state.players[playerId];
  const team = state.teams[state.userTeamId];
  const demand = salaryDemand(state, p, team);
  const happy = p.morale / 100;
  if (salary >= demand * (1.02 - happy * 0.12 - p.hidden.loyalty / 1000)) {
    const y = Number(state.date.slice(0, 4)) + years - (state.date.slice(5) > '11-18' ? 0 : 1);
    p.contract = { salary, expires: `${y}-11-18`, buyout: Math.round(p.value * 1.6 / 10000) * 10000, signedOn: state.date };
    p.morale = clamp(p.morale + 6, 5, 100);
    return { ok: true, message: `${p.handle} signs a new deal until ${p.contract.expires}.` };
  }
  return { ok: false, message: `${p.handle} rejects the offer and asks for about $${fmtK(demand)} per year.` };
}

export function releasePlayer(state: GameState, playerId: string) {
  const p = state.players[playerId];
  const team = state.teams[state.userTeamId];
  if (!p || p.teamId !== team.id) return;
  const remaining = p.contract ? Math.max(0, (new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)) * p.contract.salary : 0;
  addLedger(state, team, 'Contract termination', -Math.round(remaining * 0.5), p.handle);
  movePlayer(state, p, null, 0, 0);
}

// incoming bids for the user's players (weekly in windows). Each bid carries the player's own view of the move
// (bidTalks.ts): he may turn it down himself, ask to go, or offer to stay for a new deal.
export function incomingBids(state: GameState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  const wanted = neededRoles(state); // AI clubs hunting a replacement at a role bid more often (aiSquad.ts)
  for (const id of [...user.roster]) {
    const p = state.players[id];
    if (!p || p.teamId !== user.id || !rng.chance((0.04 + p.reputation / 2000) * bidPull(state, p) * (wanted.has(p.role) ? 1.6 : 1))) continue;
    if (state.transferOffers.some((o) => o.direction === 'incoming' && o.playerId === p.id && o.status === 'pending')) continue;
    const buyers = Object.values(state.teams).filter((t) => t.id !== user.id && tierOf(state, t) <= tierOf(state, user) && t.balance > p.value);
    if (!buyers.length) continue;
    // clubs that need the position (and can sell the project) bid more often
    const ovr = playerOvr(p);
    const buyer = rng.weighted(buyers, (t) => {
      const st = t.lineup[p.role] ? state.players[t.lineup[p.role]!] : undefined;
      const need = (!st ? 3 : playerOvr(st) < ovr - 2 ? 2 : playerOvr(st) < ovr + 2 ? 0.7 : 0.25) * (aiNeeds(state, t.id).some((n) => n.role === p.role) ? 2 : 1);
      return need * (0.4 + t.prestige / 100) * (t.aiBudget ?? 1);
    });
    const fee = Math.round(askingFee(state, p, user) * (0.75 + rng.next() * 0.5) / 5000) * 5000;
    const salary = bidSalary(state, p, buyer, rng);
    const o: TransferOffer = { id: `to_${state.seq++}`, date: state.date, playerId: p.id, fromTeamId: user.id, toTeamId: buyer.id, fee, salary, years: 2, status: 'pending', direction: 'incoming', expires: addDays(state.date, 7), stance: bidStance(state, p, buyer, salary) };
    state.transferOffers.unshift(o);
    newBid(state, o, rng); // inbox message with the player's view, loyal refusals, his conversations with you
  }
}

/** Answer an incoming bid. Accepting needs the player to agree personal terms; either way he reacts (bidTalks.ts). */
export function respondIncoming(state: GameState, offerId: string, accept: boolean): { ok: boolean; message: string } | undefined {
  const o = state.transferOffers.find((x) => x.id === offerId);
  if (!o || o.status !== 'pending') return;
  const p = state.players[o.playerId];
  const buyer = state.teams[o.toTeamId];
  const rng = new RNG(hashString(o.id + state.date + (accept ? 'a' : 'r')) ^ state.seq);
  if (accept && p.teamId === state.userTeamId && buyer) {
    const terms = bidTerms(state, o, rng);
    if (!terms.ok) return { ok: false, message: terms.message ?? `${p.handle} refused personal terms.` };
    const note = bidSold(state, o, rng);
    movePlayer(state, p, buyer, o.salary, o.years, o.fee);
    o.status = 'accepted';
    addNews(state, { headline: `${buyer.short} sign ${p.handle}`, body: `${p.handle} moves for $${fmtK(o.fee)}.`, tags: ['transfer'], playerIds: [p.id] });
    return { ok: true, message: `${p.handle} sold to ${buyer.name} for $${fmtK(o.fee)}.${note}` };
  }
  o.status = 'rejected';
  const note = bidRejected(state, o, rng);
  return { ok: true, message: `Rejected ${buyer?.short ?? 'the'} bid for ${p?.handle ?? 'the player'}.${note}` };
}

// ------------------------------------------------------------------ prospects

export function generateProspects(state: GameState, rng: RNG, perRegion = 14) {
  const year = Number(state.date.slice(0, 4));
  for (const region of ['KR', 'CN', 'EMEA', 'NA', 'BR', 'APAC']) {
    for (let i = 0; i < perRegion; i++) {
      const role = ROLES[i % 5] as Role;
      const ident = newIdentity(state, rng, region as RegionId);
      const handle = ident.handle;
      const id = `pr:${region}-${year}-${i}-${hashString(handle) % 997}`;
      if (state.players[id]) continue;
      const regionBase = { KR: 50, CN: 49, EMEA: 44, NA: 40, BR: 39, APAC: 41 }[region]!;
      const base = regionBase + rng.normal(0, 6);
      const a = () => clamp(Math.round(base + rng.normal(0, 6)), 15, 80);
      const attrs = { mechanics: a() + 4, laning: a(), farming: a(), teamfight: a() - 3, macro: a() - 6, vision: a() - 4, pathing: a() - 3, objectives: a() - 4, shotcalling: a() - 8, consistency: a() - 6, clutch: a() - 5, adaptability: a(), aggression: clamp(Math.round(rng.normal(58, 15)), 10, 95) };
      const champs = newChampionPool(rng, role, Math.round(base), rng.int(8, 13));
      const birthdate = `${year - rng.int(16, 18)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
      // ceiling on the 0..200 scale: most prospects sit around 85–120, the rare one far higher (management/potential.ts)
      const potential = rollPotential(overall(attrs, role), ageOn(birthdate, state.date) ?? 17, rng);
      const p: Player = {
        id, handle, name: ident.name, country: ident.country, birthdate,
        role, teamId: null, attributes: attrs,
        hidden: { potential, farsight: clamp(Math.round(rng.normal(50, 15)), 5, 99), mistakes: clamp(Math.round(rng.normal(52, 12)), 5, 95), composure: clamp(Math.round(rng.normal(48, 15)), 5, 99), snowball: clamp(Math.round(rng.normal(50, 15)), 5, 99), resilience: clamp(Math.round(rng.normal(50, 15)), 5, 99), workEthic: clamp(Math.round(rng.normal(62, 15)), 5, 99), professionalism: clamp(Math.round(rng.normal(58, 15)), 5, 99), ego: clamp(Math.round(rng.normal(45, 15)), 5, 99), loyalty: clamp(Math.round(rng.normal(55, 15)), 5, 99), injuryProne: clamp(Math.round(rng.normal(15, 8)), 1, 90) },
        traits: ['rookie'], champions: champs, playstyle: ['Solo queue prospect'], morale: 70, form: 0, fatigue: 0, contract: null, reputation: 5, value: 0,
        season: { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0, minutes: 0, mvps: 0, champions: {} },
        history: [], career: [], personality: { professionalism: 58, ambition: 60, loyalty: 55, temperament: 50 }, ratingScale: RATING_MAX,
      };
      p.value = marketValue(p, state.date, marketDrift(state));
      state.players[id] = p;
    }
  }
}

function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
void payrollYearly; void ageOn;
