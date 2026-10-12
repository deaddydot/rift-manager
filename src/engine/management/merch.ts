// Merchandise: product lines with unit cost, price, stock and production runs.
// Weekly demand depends on fans, hype, star players, results, price and quality.
import type { GameState, Team, MerchProduct, Player } from '../types';
import { RNG, clamp } from '../../util/rng';
import { merchAppeal } from './traitEffects';
import { merchAudience } from './fanbase';

export const MERCH_TEMPLATES: { type: string; name: string; unitCost: number; basePrice: number; appeal: number }[] = [
  { type: 'jersey', name: 'Team Jersey', unitCost: 22, basePrice: 75, appeal: 1.0 },
  { type: 'hoodie', name: 'Team Hoodie', unitCost: 28, basePrice: 85, appeal: 0.7 },
  { type: 'tee', name: 'Logo T-Shirt', unitCost: 8, basePrice: 30, appeal: 1.2 },
  { type: 'cap', name: 'Snapback Cap', unitCost: 7, basePrice: 28, appeal: 0.6 },
  { type: 'mousepad', name: 'XL Mousepad', unitCost: 6, basePrice: 35, appeal: 0.8 },
  { type: 'figure', name: 'Collector Figure', unitCost: 18, basePrice: 65, appeal: 0.35 },
  { type: 'signature', name: 'Signature Jersey', unitCost: 26, basePrice: 95, appeal: 0.5 },
];

export function defaultMerch(tier: number, rng: RNG): MerchProduct[] {
  const lines = tier === 1 ? ['jersey', 'hoodie', 'tee', 'mousepad'] : tier === 2 ? ['jersey', 'tee'] : ['tee'];
  return lines.map((type, i) => {
    const t = MERCH_TEMPLATES.find((m) => m.type === type)!;
    const stock = tier === 1 ? 2000 : tier === 2 ? 300 : 60;
    return { id: `m${i}_${type}`, name: t.name, type, unitCost: t.unitCost, price: t.basePrice, stock: Math.round(stock * (0.6 + rng.next() * 0.6)), produced: 0, sold: 0, quality: 60 };
  });
}

/** Merch star power of the roster: reputation, Fan Favourites, looks / style / streaming (merchAppeal). */
export const starPowerOf = (state: GameState, team: Team) =>
  (team.roster.map((id) => state.players[id]).filter(Boolean) as Player[]).reduce((s, p) => s + Math.max(0, p.reputation - 50) / 50 + (p.traits.includes('fan_favorite') ? 2 : 0) + merchAppeal(p), 0);

/** Expected weekly units of a product line (before the ±25% weekly noise and stock limits). */
export function merchDemand(state: GameState, team: Team, m: MerchProduct, starPower = starPowerOf(state, team)): number {
  const t = MERCH_TEMPLATES.find((x) => x.type === m.type);
  if (!t) return 0;
  const priceFactor = clamp(Math.pow(t.basePrice / Math.max(1, m.price), 1.6), 0.15, 2.5);
  let demand = merchAudience(team) / 10_000 * t.appeal * (0.6 + team.hype / 100) * (1 + starPower * 0.08) * (0.7 + m.quality / 200) * priceFactor * (0.8 + team.facilities.contentStudio * 0.06);
  if (m.type === 'signature' && m.playerId) {
    const p = state.players[m.playerId];
    demand *= p && p.teamId === team.id ? (0.5 + p.reputation / 60) * (1 + merchAppeal(p) * 0.3) : 0.05;
  }
  return Math.max(0, demand);
}

/** Weekly sales. Returns revenue (and updates stock / sold). */
export function weeklyMerchSales(state: GameState, team: Team, rng: RNG): number {
  const starPower = starPowerOf(state, team);
  let revenue = 0;
  for (const m of team.merch) {
    if (m.stock <= 0 || !MERCH_TEMPLATES.some((x) => x.type === m.type)) continue;
    const demand = merchDemand(state, team, m, starPower);
    const sold = Math.min(m.stock, Math.max(0, Math.round(demand * (0.75 + rng.next() * 0.5))));
    m.stock -= sold;
    m.sold += sold;
    revenue += sold * m.price;
  }
  return Math.round(revenue);
}

/** AI clubs keep their lines stocked: below ~6 weeks of expected sales, order ~4 months' worth. Returns the production cost. */
export function aiRestockMerch(state: GameState, team: Team): number {
  const starPower = starPowerOf(state, team);
  let cost = 0;
  for (const m of team.merch) {
    const weekly = merchDemand(state, team, m, starPower);
    if (weekly < 1 || m.stock >= weekly * 6) continue;
    cost += produceMerch(team, m.id, Math.max(50, Math.round((weekly * 17 - m.stock) / 50) * 50));
  }
  return cost;
}

export function produceMerch(team: Team, productId: string, qty: number): number {
  const m = team.merch.find((x) => x.id === productId);
  if (!m || qty <= 0) return 0;
  // bulk discount
  const unit = m.unitCost * (qty >= 5000 ? 0.8 : qty >= 1000 ? 0.9 : 1) * (0.8 + m.quality / 250);
  const cost = Math.round(unit * qty);
  m.stock += qty;
  m.produced += qty;
  return cost;
}

export function addMerchLine(team: Team, type: string, playerId?: string): MerchProduct | null {
  const t = MERCH_TEMPLATES.find((x) => x.type === type);
  if (!t) return null;
  const p: MerchProduct = { id: `m${Date.now().toString(36)}_${type}`, name: t.name, type, unitCost: t.unitCost, price: t.basePrice, stock: 0, produced: 0, sold: 0, quality: 60, playerId };
  team.merch.push(p);
  return p;
}
