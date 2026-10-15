// Finances: weekly salaries, monthly sponsors / upkeep / revenue share / content, ledger & monthly summaries.
import type { GameState, Team } from '../types';
import { FACILITY_INFO, type FacilityKey } from '../types';
import { RNG } from '../../util/rng';
import { weeklyMerchSales, aiRestockMerch } from './merch';
import { LEAGUE_ECON } from '../setup';
import { streamWeight } from './traitEffects';
import { contentRevenueMult } from './contentFx';

const monthKey = (d: string) => d.slice(0, 7);
/** Monthly league revenue share (Global Revenue Pool / partner stipends), USD. */
export const LEAGUE_REVENUE_SHARE: Record<string, number> = { LCK: 140_000, LPL: 170_000, LEC: 110_000, LCS: 120_000, LCP: 45_000, CBLOL: 35_000 };

/** Debug hook (scripts/debug/aifinance.ts): sees every movement, including the small AI ones that aren't recorded. */
export const LEDGER_TAP: { fn: ((team: Team, category: string, amount: number) => void) | null } = { fn: null };

export function addLedger(state: GameState, team: Team, category: string, amount: number, note?: string) {
  if (!amount) return;
  team.balance += amount;
  LEDGER_TAP.fn?.(team, category, amount);
  if (team.id !== state.userTeamId && Math.abs(amount) < 5000) return; // keep AI ledgers light
  team.ledger.push({ date: state.date, category, amount: Math.round(amount), note });
  if (team.ledger.length > 400) team.ledger.splice(0, team.ledger.length - 400);
  const mk = monthKey(state.date);
  let m = team.monthly.find((x) => x.month === mk);
  if (!m) { m = { month: mk, income: {}, expense: {} }; team.monthly.push(m); const cap = team.id === state.userTeamId ? 36 : 3; while (team.monthly.length > cap) team.monthly.shift(); }
  if (amount >= 0) m.income[category] = (m.income[category] ?? 0) + amount;
  else m.expense[category] = (m.expense[category] ?? 0) - amount;
}

export function payrollYearly(state: GameState, team: Team) {
  let s = 0;
  for (const id of team.roster) s += state.players[id]?.contract?.salary ?? 0;
  for (const id of team.staff) s += state.staff[id]?.contract?.salary ?? 0;
  return s;
}

/** Facility running costs follow the league's scale (a tier-3 gaming house isn't a tier-1 one). */
export const UPKEEP_TIER_MULT: Record<number, number> = { 1: 1, 2: 0.2, 3: 0.06 };
const tierOf = (state: GameState, team: Team) => state.leagues[team.leagueId]?.tier ?? 3;
/** Monthly upkeep of one facility at `level` for a club in league tier `tier`. */
export const facilityUpkeep = (key: FacilityKey, level: number, tier: number) => FACILITY_INFO[key].upkeep * level * (UPKEEP_TIER_MULT[tier] ?? 1);

export function facilityUpkeepMonthly(state: GameState, team: Team) {
  const tier = tierOf(state, team);
  let s = 0;
  for (const k of Object.keys(team.facilities) as FacilityKey[]) s += facilityUpkeep(k, team.facilities[k], tier);
  return s;
}

/** Building is cheaper down the pyramid (smaller venues, local contractors), so lower-tier clubs can grow; running it costs more once promoted. */
export const UPGRADE_TIER_MULT: Record<number, number> = { 1: 1, 2: 0.5, 3: 0.25 };
export function upgradeCost(state: GameState, team: Team, key: FacilityKey) {
  const lvl = team.facilities[key];
  return Math.round(FACILITY_INFO[key].baseCost * Math.pow(1.75, lvl) * (UPGRADE_TIER_MULT[tierOf(state, team)] ?? 1));
}

/** Operations (travel, admin) scale with the league tier; lower tiers run leaner (local travel, small back offices). */
const OPS_RATE: Record<number, number> = { 1: 0.012, 2: 0.01, 3: 0.006 };
export const operationsMonthly = (tier: number) => (LEAGUE_ECON[tier]?.budget ?? 0) * (OPS_RATE[tier] ?? 0.006);

/** Monthly league money: revenue share in tier 1 (franchise partners get it all), a stipend in tier 2, nothing in tier 3. */
export function leagueIncomeMonthly(state: GameState, team: Team) {
  const tier = tierOf(state, team);
  if (tier === 1) return (LEAGUE_REVENUE_SHARE[team.leagueId] ?? 40_000) * (team.franchise ? 1 : 0.7);
  return tier === 2 ? 8_000 : 0;
}

/** Weekly: salaries, merch, streaming/content. */
export function weeklyFinance(state: GameState, team: Team, rng: RNG) {
  addLedger(state, team, 'Player & staff salaries', -payrollYearly(state, team) / 52);
  const merch = weeklyMerchSales(state, team, rng);
  if (merch) addLedger(state, team, 'Merchandise sales', merch);
  if (team.id !== state.userTeamId) { const made = aiRestockMerch(state, team); if (made) addLedger(state, team, 'Merch production', -made); } // the user runs their own production runs (Merch page)
  // streaming & content: streamers on roster + content studio
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const streamers = streamWeight(state, team); // appeal-weighted (looks, humor, charisma…): an average streamer counts ~1
  const content = Math.round((team.fans / 1000) * (0.9 + team.facilities.contentStudio * 0.35) * (1 + streamers * 0.08) * (0.8 + team.hype / 250) * (tier === 1 ? 1 : 0.6) * contentRevenueMult(state, team));
  if (content) addLedger(state, team, 'Streaming & content', content);
}

/** Monthly: sponsors, facility upkeep, league revenue share, ticketing. */
export function monthlyFinance(state: GameState, team: Team) {
  for (const s of team.sponsors) {
    if (s.endDate < state.date) continue;
    addLedger(state, team, 'Sponsorships', s.monthly, s.name);
  }
  team.sponsors = team.sponsors.filter((s) => s.endDate >= state.date);
  addLedger(state, team, 'Facility upkeep', -facilityUpkeepMonthly(state, team));
  const tier = tierOf(state, team);
  // Global Revenue Pool / league revenue share (franchised & partner leagues), tier-2 stipends
  addLedger(state, team, tier === 1 ? 'League revenue share' : 'League stipend', leagueIncomeMonthly(state, team));
  addLedger(state, team, 'Operations & travel', -operationsMonthly(tier));
  if (team.id !== state.userTeamId) aiClubFinances(state, team, tier);
}

/** What AI clubs build first: tier 1 the competitive edge, lower tiers the academy and training ground (develop, sell, catch up). */
const AI_BUILD: Record<number, Record<FacilityKey, number>> = {
  1: { trainingFacility: 1.2, analyticsLab: 1, gamingHouse: 1, wellness: 0.9, contentStudio: 0.9, academy: 0.7 },
  2: { academy: 1.4, trainingFacility: 1.3, gamingHouse: 0.8, analyticsLab: 0.7, wellness: 0.6, contentStudio: 0.6 },
  3: { academy: 1.5, trainingFacility: 1.3, gamingHouse: 0.6, analyticsLab: 0.5, wellness: 0.5, contentStudio: 0.4 },
};
const AI_BUILD_GAP = 120; // days between two upgrades of the same club

/**
 * AI club finances (monthly, after the books). A club keeps a reserve of about a year of running costs (payroll,
 * upkeep, operations; at least half the tier's budget) and puts money above it into its facilities, one upgrade every
 * few months, as long as it can still pay a year of the extra upkeep. Only far above the reserve (everything built,
 * or a big windfall) do the owners take a fifth of the excess out; in debt they cover a quarter of the hole, so the
 * club can keep signing players.
 */
function aiClubFinances(state: GameState, team: Team, tier: number) {
  const budget = LEAGUE_ECON[tier]?.budget ?? 0;
  const running = payrollYearly(state, team) + 12 * (facilityUpkeepMonthly(state, team) + operationsMonthly(tier));
  if (team.balance < 0) { addLedger(state, team, 'Owner investment', Math.round(-team.balance * 0.25)); return; }
  const reserve = Math.max(running, 0.5 * budget);
  let last = '';
  for (const e of team.ledger) if (e.category === 'Facility upgrades' && e.date > last) last = e.date;
  if (!last || (new Date(state.date).getTime() - new Date(last).getTime()) / 864e5 >= AI_BUILD_GAP) {
    const pref = AI_BUILD[tier] ?? AI_BUILD[3];
    const keys = (Object.keys(team.facilities) as FacilityKey[]).filter((k) => team.facilities[k] < 5);
    const k = keys.sort((a, b) => pref[b] / (1 + team.facilities[b]) - pref[a] / (1 + team.facilities[a]))[0];
    if (k) {
      const cost = upgradeCost(state, team, k);
      if (team.balance - cost - 12 * facilityUpkeep(k, 1, tier) >= reserve) {
        team.facilities[k]++;
        addLedger(state, team, 'Facility upgrades', -cost, FACILITY_INFO[k].name);
        return;
      }
    }
  }
  const ceiling = Math.max(3 * running, 2 * budget);
  if (team.balance > ceiling) addLedger(state, team, 'Owner dividend', -Math.round((team.balance - ceiling) * 0.2));
}

export function financeSummary(team: Team, months = 1) {
  const recent = team.monthly.slice(-months);
  let income = 0, expense = 0;
  for (const m of recent) { income += Object.values(m.income).reduce((a, b) => a + b, 0); expense += Object.values(m.expense).reduce((a, b) => a + b, 0); }
  return { income, expense, net: income - expense };
}
