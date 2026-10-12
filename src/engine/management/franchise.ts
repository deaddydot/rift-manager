// Franchise slots: in franchised leagues (LCK, LPL, LEC) spots are owned. Each offseason a
// struggling owner may sell its slot. If the user's team is outside a franchised league
// (tier 2 or a non-franchised tier-1 league in the same region) it can buy in; the move
// happens at season rollover.
import type { GameState, Team } from '../types';
import { RNG } from '../../util/rng';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';

export interface FranchiseSale { id: string; league: string; sellerId: string; price: number; expires: string; buyerId?: string; status: 'open' | 'sold' | 'expired' }

const SLOT_VALUE: Record<string, number> = { LCK: 18_000_000, LPL: 22_000_000, LEC: 12_000_000 };
const REGION_FEEDERS: Record<string, string[]> = { LCK: ['KR'], LPL: ['CN'], LEC: ['EMEA'] };

export function franchiseValue(state: GameState, team: Team): number {
  const base = SLOT_VALUE[team.leagueId];
  if (!base || !team.franchise) return 0;
  return Math.round(base * (0.7 + team.prestige / 200 + Math.log10(Math.max(10_000, team.fans)) / 40) / 100_000) * 100_000;
}

export const sales = (state: GameState): FranchiseSale[] => ((state as GameState & { franchiseSales?: FranchiseSale[] }).franchiseSales ??= []);

/** Offseason (Nov 25): a weak franchised team may list its slot. */
export function listFranchiseSales(state: GameState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  for (const league of Object.keys(SLOT_VALUE)) {
    if (!state.leagues[league]) continue;
    if (!rng.chance(0.35)) continue;
    const teams = Object.values(state.teams).filter((t) => t.leagueId === league && t.id !== state.userTeamId);
    const seller = teams.sort((a, b) => (a.balance / 1e6 + a.prestige) - (b.balance / 1e6 + b.prestige))[0];
    if (!seller) continue;
    const price = Math.round(franchiseValue(state, seller) * (0.85 + rng.next() * 0.3) / 100_000) * 100_000;
    const sale: FranchiseSale = { id: `fs_${state.seq++}`, league, sellerId: seller.id, price, expires: addDays(state.date, 21), status: 'open' };
    sales(state).push(sale);
    addNews(state, { headline: `${seller.name} put their ${league} slot up for sale`, body: `The ownership of ${seller.name} is looking to sell its ${league} partnership for around $${(price / 1e6).toFixed(1)}M.`, tags: ['franchise'], teamIds: [seller.id] });
    const eligible = user.leagueId !== league && REGION_FEEDERS[league].includes(user.region);
    if (eligible) {
      addInbox(state, {
        from: `${league} league office`, kind: 'finance',
        subject: `${league} franchise slot available: $${(price / 1e6).toFixed(1)}M`,
        body: `${seller.name} are selling their ${league} slot. Buying it moves ${user.name} into the ${league} from next season (the seller drops to the regional league). Offer open until ${sale.expires}. Your balance: $${(user.balance / 1e6).toFixed(2)}M.`,
        action: { type: 'franchiseOffer', payload: sale.id, label: 'Buy franchise slot' },
      });
    }
  }
}

export function buyFranchise(state: GameState, saleId: string): { ok: boolean; message: string } {
  const sale = sales(state).find((s) => s.id === saleId);
  const user = state.teams[state.userTeamId];
  if (!sale || sale.status !== 'open') return { ok: false, message: 'This slot is no longer available.' };
  if (sale.expires < state.date) { sale.status = 'expired'; return { ok: false, message: 'The offer has expired.' }; }
  if (user.balance < sale.price) return { ok: false, message: 'Insufficient funds.' };
  addLedger(state, user, 'Franchise purchase', -sale.price, `${sale.league} slot`);
  sale.status = 'sold';
  sale.buyerId = user.id;
  addNews(state, { headline: `${user.name} buy into the ${sale.league}!`, body: `${user.name} acquire the ${sale.league} slot of ${state.teams[sale.sellerId]?.name} and will compete there next season.`, tags: ['franchise'], teamIds: [user.id, sale.sellerId] });
  return { ok: true, message: `Deal done — ${user.name} join the ${sale.league} next season.` };
}

/** AI buyers pick up unsold slots; apply all sold slots (called at season rollover). */
export function applyFranchiseMoves(state: GameState, rng: RNG) {
  for (const sale of sales(state)) {
    if (sale.status === 'open') {
      // an AI tier-2 team from the region buys it
      const feeders = Object.values(state.teams).filter((t) => t.region === state.teams[sale.sellerId]?.region && state.leagues[t.leagueId]?.tier === 2 && t.id !== state.userTeamId && !t.parentTeamId);
      const buyer = feeders.sort((a, b) => b.prestige - a.prestige)[0];
      if (buyer && rng.chance(0.6)) { sale.status = 'sold'; sale.buyerId = buyer.id; } else { sale.status = 'expired'; continue; }
    }
    if (sale.status !== 'sold' || !sale.buyerId) continue;
    const buyer = state.teams[sale.buyerId], seller = state.teams[sale.sellerId];
    if (!buyer || !seller) continue;
    const buyerLeague = buyer.leagueId;
    buyer.leagueId = sale.league; buyer.franchise = true;
    seller.leagueId = buyerLeague; seller.franchise = false;
    // the slot belongs to the ownership group, which pockets the proceeds (club cash isn't touched); an AI buyer's
    // investors fund its purchase. Crediting the seller here created $12–22M out of nothing whenever an AI club bought.
    addNews(state, { headline: `${buyer.name} officially join the ${sale.league}`, body: `${seller.name} move to the ${state.leagues[buyerLeague]?.name ?? buyerLeague}.`, tags: ['franchise'], teamIds: [buyer.id, seller.id] });
    sale.status = 'expired';
  }
}

function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
