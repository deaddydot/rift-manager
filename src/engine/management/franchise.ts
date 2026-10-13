// League slots: every league above tier 3 has a fixed number of spots, and a club that owns one can sell it.
// - Franchised leagues (LCK, LPL, LEC): partnerships are owned; a struggling owner may sell (any club from the region
//   below can buy in, $12–22M).
// - Open tier-1 leagues (LCS, LCP, CBLOL) and tier-2 leagues: a struggling club may sell its league spot to a club
//   from a league that feeds it (cheaper: ~$0.25–5M).
// Each offseason (Nov 25) a few spots come up. The buyer takes the seller's place at season rollover and the seller
// drops to the buyer's league. Die-hard fans of a winning club may crowdfund part of the price (user only), and big
// brands can broker a buyout outright (management/ascension.ts).
import type { GameState, Team } from '../types';
import { RNG } from '../../util/rng';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';
import { ACADEMY_LEAGUES } from '../season/calendar';

export interface FranchiseSale {
  id: string; league: string; sellerId: string; price: number; expires: string; buyerId?: string; status: 'open' | 'sold' | 'expired';
  /** crowdfunding pledged by the user's die-hard fans towards this slot (paid at purchase) */
  pledge?: number;
}

/** Base value of a spot (before the seller's prestige and fanbase). */
const SLOT_VALUE: Record<string, number> = {
  LCK: 18_000_000, LPL: 22_000_000, LEC: 12_000_000, LCS: 5_000_000, LCP: 1_600_000, CBLOL: 1_400_000,
  NACL: 900_000, LFL: 1_100_000, PRM: 900_000, LES: 750_000, TCL: 600_000, CD: 500_000, PCS: 500_000, VCS: 450_000, LJL: 450_000,
  NLC: 450_000, RL: 450_000, LIT: 400_000, ROL: 400_000, HLL: 300_000, EBL: 250_000, HM: 300_000, LPLOL: 300_000, AL: 350_000,
};
/** Franchised leagues: any non-academy club of the region outside the league may buy in. */
const REGION_FEEDERS: Record<string, string[]> = { LCK: ['KR'], LPL: ['CN'], LEC: ['EMEA'] };

const tierOf = (state: GameState, leagueId: string) => state.leagues[leagueId]?.tier ?? 3;
export const isFranchised = (league: string) => !!REGION_FEEDERS[league];

/** What a club's spot in its league is worth (0 when spots there aren't traded). */
export function slotValue(state: GameState, team: Team): number {
  const base = SLOT_VALUE[team.leagueId];
  if (!base || ACADEMY_LEAGUES.has(team.leagueId)) return 0;
  return Math.round(base * (0.7 + team.prestige / 200 + Math.log10(Math.max(10_000, team.fans)) / 40) / 10_000) * 10_000;
}
/** Kept for older callers: franchised slots only. */
export function franchiseValue(state: GameState, team: Team): number {
  return isFranchised(team.leagueId) && team.franchise ? slotValue(state, team) : 0;
}

/** Can this club buy a spot in `league`? (a lower tier, not an academy; franchised: same region; open: a league that feeds it) */
export function canBuyInto(state: GameState, team: Team, league: string): boolean {
  if (team.leagueId === league || team.parentTeamId || !SLOT_VALUE[league]) return false;
  const mine = state.leagues[team.leagueId];
  if (!mine || mine.tier <= tierOf(state, league)) return false;
  if (isFranchised(league)) return REGION_FEEDERS[league].includes(team.region);
  return mine.parent === league || (ACADEMY_LEAGUES.has(mine.parent ?? '') && state.leagues[mine.parent!]?.parent === league);
}

export const sales = (state: GameState): FranchiseSale[] => ((state as GameState & { franchiseSales?: FranchiseSale[] }).franchiseSales ??= []);
/** What the user actually pays for a sale (crowdfunding pledges come off the price). */
export const userPrice = (sale: FranchiseSale) => Math.max(0, sale.price - (sale.pledge ?? 0));

/** Die-hards of a club that has been winning chip in towards a step up (0 when there's no appetite). */
export function crowdfundPledge(state: GameState, team: Team, price: number): number {
  const recentTitles = team.titles.filter((t) => t.season >= state.season - 1).length;
  const diehard = team.diehard ?? Math.round(team.fans * 0.2);
  if (!recentTitles && team.hype < 65) return 0;
  const perFan = 6 + recentTitles * 4 + Math.max(0, team.hype - 60) / 8;
  return Math.round(Math.min(price * 0.3, diehard * perFan) / 5_000) * 5_000;
}

/** Offseason (Nov 25): a weak club in some leagues lists its spot. */
export function listFranchiseSales(state: GameState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  for (const league of Object.keys(SLOT_VALUE)) {
    if (!state.leagues[league] || ACADEMY_LEAGUES.has(league)) continue;
    if (!rng.chance(isFranchised(league) ? 0.35 : tierOf(state, league) === 1 ? 0.3 : 0.28)) continue;
    const teams = Object.values(state.teams).filter((t) => t.leagueId === league && t.id !== state.userTeamId && !t.brandDeal?.slot);
    const seller = teams.sort((a, b) => (a.balance / 1e6 + a.prestige) - (b.balance / 1e6 + b.prestige))[0];
    if (!seller || sales(state).some((s) => s.status === 'open' && s.sellerId === seller.id)) continue;
    const price = Math.round(slotValue(state, seller) * (0.85 + rng.next() * 0.3) / 10_000) * 10_000;
    const sale: FranchiseSale = { id: `fs_${state.seq++}`, league, sellerId: seller.id, price, expires: addDays(state.date, 21), status: 'open' };
    sales(state).push(sale);
    const what = isFranchised(league) ? `${league} partnership` : `${state.leagues[league].name} spot`;
    addNews(state, { headline: `${seller.name} put their ${what} up for sale`, body: `${seller.name} are looking to sell their ${what} for around ${fmtM(price)}.`, tags: ['franchise'], teamIds: [seller.id] });
    if (canBuyInto(state, user, league)) {
      sale.pledge = crowdfundPledge(state, user, price) || undefined;
      const lname = state.leagues[league].name;
      addInbox(state, {
        from: `${lname} league office`, kind: 'finance',
        subject: `${lname} ${isFranchised(league) ? 'franchise slot' : 'spot'} available: ${fmtM(price)}`,
        body: `${seller.name} are selling their place in the ${lname}. Buying it moves ${user.name} into the ${lname} from next season (${seller.name} drop to your league). Offer open until ${sale.expires}. Your balance: ${fmtM(user.balance)}.`
          + (sale.pledge ? `\n\nOur die-hard fans have started a crowdfunding campaign and pledged ${fmtM(sale.pledge)} towards it — you would pay ${fmtM(userPrice(sale))}.` : ''),
        action: { type: 'franchiseOffer', payload: sale.id, label: `Buy ${lname} ${isFranchised(league) ? 'slot' : 'spot'}` },
      });
    }
  }
}

export function buyFranchise(state: GameState, saleId: string): { ok: boolean; message: string } {
  const sale = sales(state).find((s) => s.id === saleId);
  const user = state.teams[state.userTeamId];
  if (!sale || sale.status !== 'open') return { ok: false, message: 'This slot is no longer available.' };
  if (sale.expires < state.date) { sale.status = 'expired'; return { ok: false, message: 'The offer has expired.' }; }
  if (!canBuyInto(state, user, sale.league)) return { ok: false, message: `${user.name} can't buy into the ${sale.league} from its current league.` };
  if (user.brandDeal?.slot?.status === 'pending') return { ok: false, message: `Your ${user.brandDeal.brand} deal already has a move lined up.` };
  const pay = userPrice(sale);
  if (user.balance < pay) return { ok: false, message: 'Insufficient funds.' };
  addLedger(state, user, 'Franchise purchase', -pay, `${sale.league} slot${sale.pledge ? ` (fans crowdfunded ${fmtM(sale.pledge)})` : ''}`);
  sale.status = 'sold';
  sale.buyerId = user.id;
  const lname = state.leagues[sale.league]?.name ?? sale.league;
  addNews(state, { headline: `${user.name} buy into the ${lname}!`, body: `${user.name} acquire the ${lname} spot of ${state.teams[sale.sellerId]?.name}${sale.pledge ? ', helped by a fan crowdfunding campaign,' : ''} and will compete there next season.`, tags: ['franchise'], teamIds: [user.id, sale.sellerId] });
  return { ok: true, message: `Deal done — ${user.name} join the ${lname} next season.` };
}

/**
 * Season rollover: AI buyers pick up unsold spots, then every sold spot changes hands. `moved` holds teams that already
 * changed league this rollover (promotion series, brand-brokered buyouts); a sale whose seller moved away falls to the
 * next-weakest club of that league, one whose buyer already moved up is refunded.
 */
export function applyFranchiseMoves(state: GameState, rng: RNG, moved: Set<string> = new Set()) {
  for (const sale of sales(state)) {
    if (sale.status === 'open') {
      const buyer = Object.values(state.teams).filter((t) => t.id !== state.userTeamId && !moved.has(t.id) && !t.brandDeal?.slot && canBuyInto(state, t, sale.league)
        && (!isFranchised(sale.league) || tierOf(state, t.leagueId) === 2) && t.balance > -sale.price * 0.2)
        .sort((a, b) => b.prestige + b.titles.filter((x) => x.season >= state.season - 1).length * 8 - (a.prestige + a.titles.filter((x) => x.season >= state.season - 1).length * 8))[0];
      if (buyer && rng.chance(isFranchised(sale.league) ? 0.6 : 0.5)) { sale.status = 'sold'; sale.buyerId = buyer.id; } else { sale.status = 'expired'; continue; }
    }
    if (sale.status !== 'sold' || !sale.buyerId) continue;
    sale.status = 'expired';
    const buyer = state.teams[sale.buyerId];
    let seller: Team | undefined = state.teams[sale.sellerId];
    if (!buyer) continue;
    if (moved.has(buyer.id) || tierOf(state, buyer.leagueId) <= tierOf(state, sale.league)) { // already went up another way
      if (buyer.id === state.userTeamId) {
        const back = userPrice(sale);
        addLedger(state, buyer, 'Franchise purchase refund', back, `${sale.league} slot`);
        addInbox(state, { from: `${sale.league} league office`, kind: 'finance', subject: 'Slot purchase refunded', body: `${buyer.name} have already moved up, so the purchase of the ${sale.league} spot was cancelled and ${fmtM(back)} refunded.` });
      }
      continue;
    }
    if (!seller || seller.leagueId !== sale.league || moved.has(seller.id)) seller = weakestIn(state, sale.league, moved, buyer);
    if (!seller) continue;
    swapLeagues(state, buyer, seller, moved);
    // the slot belongs to the ownership group, which pockets the proceeds (club cash isn't touched); an AI buyer's
    // investors fund its purchase. Crediting the seller here created $12–22M out of nothing whenever an AI club bought.
    addNews(state, { headline: `${buyer.name} officially join the ${state.leagues[sale.league]?.name ?? sale.league}`, body: `${seller.name} move to the ${state.leagues[seller.leagueId]?.name ?? seller.leagueId}.`, tags: ['franchise'], teamIds: [buyer.id, seller.id] });
  }
}

/** The club most likely to give up its spot in `league` (poorest, least prestigious), skipping teams that moved already. */
export function weakestIn(state: GameState, league: string, moved: Set<string>, buyer?: Team): Team | undefined {
  return Object.values(state.teams)
    .filter((t) => t.leagueId === league && t.id !== state.userTeamId && !moved.has(t.id) && t.id !== buyer?.id && !(buyer && (t.parentTeamId === buyer.id || buyer.parentTeamId === t.id)))
    .sort((a, b) => (a.balance / 1e6 + a.prestige) - (b.balance / 1e6 + b.prestige))[0];
}

/** Buyer takes the seller's league (and franchise partnership); the seller drops to the buyer's old league. */
export function swapLeagues(state: GameState, buyer: Team, seller: Team, moved: Set<string>) {
  const from = buyer.leagueId, to = seller.leagueId;
  buyer.leagueId = to; seller.leagueId = from;
  const fr = buyer.franchise; buyer.franchise = seller.franchise || isFranchised(to); seller.franchise = fr && isFranchised(from);
  moved.add(buyer.id); moved.add(seller.id);
}

export const fmtM = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000)}k`);
function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
