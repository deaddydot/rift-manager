// Finances: weekly salaries, monthly sponsors / upkeep / revenue share / content, ledger & monthly summaries.
import type { GameState, Team } from '../types';
import { FACILITY_INFO, type FacilityKey } from '../types';
import { RNG } from '../../util/rng';
import { weeklyMerchSales } from './merch';
import { LEAGUE_ECON } from '../setup';
import { streamWeight } from './traitEffects';

const monthKey = (d: string) => d.slice(0, 7);
/** Monthly league revenue share (Global Revenue Pool / partner stipends), USD. */
export const LEAGUE_REVENUE_SHARE: Record<string, number> = { LCK: 140_000, LPL: 170_000, LEC: 110_000, LCS: 120_000, LCP: 45_000, CBLOL: 35_000 };

export function addLedger(state: GameState, team: Team, category: string, amount: number, note?: string) {
  if (!amount) return;
  team.balance += amount;
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

export function facilityUpkeepMonthly(team: Team) {
  let s = 0;
  for (const k of Object.keys(team.facilities) as FacilityKey[]) s += FACILITY_INFO[k].upkeep * team.facilities[k];
  return s;
}

export function upgradeCost(team: Team, key: FacilityKey) {
  const lvl = team.facilities[key];
  return Math.round(FACILITY_INFO[key].baseCost * Math.pow(1.75, lvl));
}

/** Weekly: salaries, merch, streaming/content. */
export function weeklyFinance(state: GameState, team: Team, rng: RNG) {
  addLedger(state, team, 'Player & staff salaries', -payrollYearly(state, team) / 52);
  const merch = weeklyMerchSales(state, team, rng);
  if (merch) addLedger(state, team, 'Merchandise sales', merch);
  // streaming & content: streamers on roster + content studio
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const streamers = streamWeight(state, team); // appeal-weighted (looks, humor, charisma…): an average streamer counts ~1
  const content = Math.round((team.fans / 1000) * (0.9 + team.facilities.contentStudio * 0.35) * (1 + streamers * 0.08) * (0.8 + team.hype / 250) * (tier === 1 ? 1 : 0.6));
  if (content) addLedger(state, team, 'Streaming & content', content);
}

/** Monthly: sponsors, facility upkeep, league revenue share, ticketing. */
export function monthlyFinance(state: GameState, team: Team) {
  for (const s of team.sponsors) {
    if (s.endDate < state.date) continue;
    addLedger(state, team, 'Sponsorships', s.monthly, s.name);
  }
  team.sponsors = team.sponsors.filter((s) => s.endDate >= state.date);
  addLedger(state, team, 'Facility upkeep', -facilityUpkeepMonthly(team));
  const league = state.leagues[team.leagueId];
  const tier = league?.tier ?? 3;
  if (tier === 1) {
    // Global Revenue Pool / league revenue share (franchised & partner leagues)
    const share = LEAGUE_REVENUE_SHARE[team.leagueId] ?? 40_000;
    addLedger(state, team, 'League revenue share', share * (team.franchise ? 1 : 0.7));
  } else if (tier === 2) addLedger(state, team, 'League stipend', 6_000);
  // operations (travel, admin) scale with tier
  addLedger(state, team, 'Operations & travel', -(LEAGUE_ECON[tier].budget * 0.012));
}

export function financeSummary(team: Team, months = 1) {
  const recent = team.monthly.slice(-months);
  let income = 0, expense = 0;
  for (const m of recent) { income += Object.values(m.income).reduce((a, b) => a + b, 0); expense += Object.values(m.expense).reduce((a, b) => a + b, 0); }
  return { income, expense, net: income - expense };
}
