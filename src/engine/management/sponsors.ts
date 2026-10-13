// Sponsorships: a pool of parody brands. Brands approach the club every few weeks (more often after big
// results, fan growth or with few partners); offer size scales with the audience (die-hards count extra), prestige,
// hype and the league, and bonus clauses pay for results.
import type { GameState, Team, SponsorOffer, SponsorDeal, Competition, RegionId } from '../types';
import { addLedger } from './finance';
import { addInbox } from './news';
import { RNG, clamp, hashString } from '../../util/rng';
import { LEAGUE_ECON } from '../setup';
import { sponsorAppeal } from './traitEffects';
import { sponsorAudience, audienceBenchmark } from './fanbase';

export interface SponsorBrand { id: string; name: string; category: string; tier: 1 | 2 | 3; color: string; pitch: string; home?: RegionId[] }

// light parodies of real esports sponsors; brands in the same category are exclusive competitors
const BRANDS: SponsorBrand[] = [
  { id: 'bedrull', name: 'Bedrull', category: 'Energy drink', tier: 3, color: '#dc2626', pitch: 'Gives your jungler wings.' },
  { id: 'monstar', name: 'Monstar Energy', category: 'Energy drink', tier: 2, color: '#84cc16', pitch: 'Unleash the late-game beast.' },
  { id: 'jfuel', name: 'J-Fuel', category: 'Energy drink', tier: 1, color: '#c084fc', pitch: 'The official drink of 3 a.m. solo queue.' },
  { id: 'logitack', name: 'Logitack G', category: 'Peripherals', tier: 2, color: '#38bdf8', pitch: 'Precise clicks for precise Flashes.' },
  { id: 'razr', name: 'Razr', category: 'Peripherals', tier: 2, color: '#22c55e', pitch: 'For gamers. By gamers. With extra RGB.' },
  { id: 'steelserious', name: 'SteelSerious', category: 'Headsets', tier: 1, color: '#f97316', pitch: 'Hear the jungler coming.' },
  { id: 'hyperecks', name: 'HyperEcks', category: 'Headsets', tier: 1, color: '#f43f5e', pitch: 'Comms so clear you can hear the tilt.' },
  { id: 'corsaire', name: 'Corsaire', category: 'PC components', tier: 2, color: '#facc15', pitch: 'Components that never tilt.' },
  { id: 'noctuah', name: 'Noctuah', category: 'PC cooling', tier: 1, color: '#b45309', pitch: 'Silent fans, loud wins.' },
  { id: 'elgatto', name: 'Elgatto', category: 'Streaming gear', tier: 1, color: '#60a5fa', pitch: 'One button to go live after the win.' },
  { id: 'antel', name: 'Antel', category: 'Processors', tier: 3, color: '#3b82f6', pitch: 'Antel Inside. Victory outside.' },
  { id: 'amb', name: 'AMB', category: 'Processors', tier: 3, color: '#ef4444', pitch: 'More cores than your team has excuses.' },
  { id: 'nvidea', name: 'Nvidea', category: 'Graphics cards', tier: 3, color: '#76b900', pitch: 'Every frame counts.' },
  { id: 'alienwear', name: 'Alienwear', category: 'Monitors', tier: 2, color: '#06b6d4', pitch: 'Out-of-this-world refresh rates.' },
  { id: 'lenavo', name: 'Lenavo Legion', category: 'PCs & laptops', tier: 2, color: '#e11d48', pitch: 'Bootcamp-ready laptops for travel days.' },
  { id: 'secretlav', name: 'Secretlav', category: 'Gaming chairs', tier: 1, color: '#f472b6', pitch: 'Sit like a champion.' },
  { id: 'nuke', name: 'Nuke', category: 'Apparel', tier: 3, color: '#f5f5f5', pitch: 'Just click it.' },
  { id: 'adibas', name: 'Adibas', category: 'Apparel', tier: 3, color: '#a3a3a3', pitch: 'Three stripes. Three lanes.' },
  { id: 'pooma', name: 'Pooma', category: 'Apparel', tier: 2, color: '#fbbf24', pitch: 'Pounce on every pick.' },
  { id: 'samsong', name: 'Samsong Galaxsea', category: 'Smartphones', tier: 3, color: '#2563eb', pitch: 'Flagship phones for flagship players.', home: ['KR'] },
  { id: 'teemobil', name: 'Tee-Mobil', category: 'Telecom', tier: 2, color: '#ec4899', pitch: 'Low ping. No excuses.', home: ['NA', 'EMEA'] },
  { id: 'verison', name: 'Verison', category: 'Telecom', tier: 2, color: '#ef4444', pitch: 'Can you hear the shotcall now?', home: ['NA'] },
  { id: 'mastercart', name: 'Mastercart', category: 'Payments', tier: 3, color: '#f97316', pitch: 'Winning the split: priceless.' },
  { id: 'viza', name: 'Viza', category: 'Payments', tier: 3, color: '#6366f1', pitch: 'Everywhere you want to queue.' },
  { id: 'revolute', name: 'Revolute', category: 'Fintech', tier: 2, color: '#94a3b8', pitch: 'Banking that rotates as fast as you do.', home: ['EMEA'] },
  { id: 'mercedez', name: 'Mercedez-Benx', category: 'Automotive', tier: 3, color: '#d4d4d8', pitch: 'The best or nothing, in lane too.' },
  { id: 'kai', name: 'Kai Motors', category: 'Automotive', tier: 2, color: '#b91c1c', pitch: 'Movement that inspires rotations.', home: ['KR', 'EMEA'] },
  { id: 'hondo', name: 'Hondo', category: 'Automotive', tier: 2, color: '#f43f5e', pitch: 'The power of draft dreams.', home: ['NA', 'APAC'] },
  { id: 'cocakola', name: 'Coca-Kola', category: 'Soft drinks', tier: 3, color: '#ef4444', pitch: 'Open happiness after every win.' },
  { id: 'mountaindue', name: 'Mountain Due', category: 'Soft drinks', tier: 2, color: '#a3e635', pitch: 'Do the Due. Do the dive.', home: ['NA'] },
  { id: 'kfg', name: 'KFG', category: 'Fast food', tier: 2, color: '#dc2626', pitch: 'Finger-lickin’ good mechanics.', home: ['CN', 'APAC', 'NA'] },
  { id: 'pringels', name: 'Pringels', category: 'Snacks', tier: 1, color: '#f87171', pitch: 'Once you pop, you can’t stop farming.' },
  { id: 'emirats', name: 'Emirats', category: 'Airline', tier: 3, color: '#d97706', pitch: 'Flying teams to international events.' },
  { id: 'dhx', name: 'DHX Express', category: 'Delivery', tier: 2, color: '#facc15', pitch: 'Faster than a Teleport.', home: ['EMEA'] },
  { id: 'spotifly', name: 'Spotifly', category: 'Music streaming', tier: 2, color: '#22c55e', pitch: 'Scrim playlists, zero ads.' },
  { id: 'rolax', name: 'Rolax', category: 'Luxury watches', tier: 3, color: '#16a34a', pitch: 'Timing is everything.' },
  { id: 'awz', name: 'AWZ Cloud', category: 'Cloud services', tier: 3, color: '#f59e0b', pitch: 'Your VODs, everywhere.' },
];
export const sponsorPool = () => BRANDS;

// ------------------------------------------------------------------ offer pacing
/** Pacing memory on the save (optional, created lazily): last approach, weekly fan snapshots, brands that recently approached. */
interface SponsorPacing { teamId: string; lastOffer?: string; fans: number[]; recent?: string[] }
type WithPacing = GameState & { sponsorPacing?: SponsorPacing };
const COOLDOWN_DAYS = 21, BIG_RESULT_COOLDOWN = 10, MAX_PENDING = 2;

function pacing(state: GameState, team: Team): SponsorPacing {
  const s = state as WithPacing;
  if (!s.sponsorPacing || s.sponsorPacing.teamId !== team.id) s.sponsorPacing = { teamId: team.id, fans: [] };
  return s.sponsorPacing;
}

/** Results signal (only ever a bonus): winning run over the last 3 weeks, titles / finals / deep international runs in the last 2. */
function resultsBoost(state: GameState, team: Team) {
  const since = addDaysIso(state.date, -21), recent = addDaysIso(state.date, -14);
  let w = 0, n = 0, boost = 0, big = false;
  for (const f of Object.values(state.fixtures)) {
    if (!f.result || f.date < since || (f.teamA !== team.id && f.teamB !== team.id)) continue;
    n++;
    if (f.result.winner === team.id) w++;
  }
  if (n >= 3) boost += Math.max(0, w / n - 0.5) * 0.16;
  for (const c of Object.values(state.competitions)) {
    if (c.status !== 'done' || c.endDate < recent || c.endDate > state.date || !c.teams.includes(team.id)) continue;
    const place = c.winner === team.id ? 1 : c.placements?.[team.id];
    if (place === 1) { boost += c.tier === 0 ? 0.3 : 0.2; big = true; }
    else if (place === 2 || (c.tier === 0 && place && place <= 4)) boost += 0.1;
  }
  return { boost, big };
}

/** Weekly chance that a brand approaches the club, and the first date a new approach is possible. */
export function sponsorOutlook(state: GameState, team: Team): { chance: number; nextFrom: string | null } {
  const pace = pacing(state, team);
  const pending = state.sponsorOffers.filter((o) => o.expires >= state.date);
  if (pending.length >= MAX_PENDING) return { chance: 0, nextFrom: pending.map((o) => o.expires).sort()[0] };
  const { boost, big } = resultsBoost(state, team);
  if (pace.lastOffer) {
    const next = addDaysIso(pace.lastOffer, big ? BIG_RESULT_COOLDOWN : COOLDOWN_DAYS);
    if (next > state.date) return { chance: 0, nextFrom: next };
  }
  const active = team.sponsors.filter((s) => s.endDate >= state.date).length;
  let p = 0.19 + 0.06 * clamp(3 - active, 0, 3) + boost + Math.max(0, team.hype - 50) / 600;
  const ref = pace.fans[0]; // ~5 weeks ago
  if (ref) p += clamp((team.fans / ref - 1) * 1.2, 0, 0.18);
  if (active >= sponsorSlots(team)) p *= 0.6;
  return { chance: clamp(p, 0.05, 0.8), nextFrom: null };
}

// tier-1 leagues attract global giants, tier-3 clubs mostly local / niche brands
const TIER_FIT: Record<number, [number, number, number]> = { 1: [0.6, 1, 1.3], 2: [1.2, 1.1, 0.6], 3: [1.5, 0.8, 0.25] };

function pickBrand(state: GameState, team: Team, rng: RNG, recent: string[]): SponsorBrand | null {
  const live = team.sponsors.filter((s) => s.endDate >= state.date);
  const pending = team.id === state.userTeamId ? state.sponsorOffers.filter((o) => o.expires >= state.date) : []; // offers on the table are the user's
  const taken = new Set([...live.map((s) => s.sponsorId), ...pending.map((o) => o.sponsorId), ...recent]);
  const cats = new Set([...live.map((s) => s.category), ...pending.map((o) => o.category)]);
  const cands = BRANDS.filter((b) => !taken.has(b.id) && !cats.has(b.category));
  if (!cands.length) return null;
  const fit = TIER_FIT[state.leagues[team.leagueId]?.tier ?? 3] ?? TIER_FIT[3];
  return rng.weighted(cands, (b) => fit[b.tier - 1] * (b.home ? (b.home.includes(team.region) ? 2 : 0.6) : 1));
}

/**
 * Sponsor appeal 0.2..3 and its parts: the audience is the big one (absolute size vs the tier's benchmark — brands
 * pay for eyeballs, die-hards count half again), then prestige, hype, the content studio and the faces on the roster.
 */
export function sponsorAppealParts(state: GameState, team: Team) {
  const fans = (sponsorAudience(team) / audienceBenchmark(state, team)) * 0.6;
  const prestige = team.prestige / 150, hype = team.hype / 250, studio = team.facilities.contentStudio * 0.05, faces = sponsorAppeal(state, team);
  return { fans, prestige, hype, studio, faces, total: clamp(fans + prestige + hype + studio + faces, 0.2, 3) };
}
const DEAL_RATE: [number, number] = [0.08, 0.18]; // × league sponsor level × brand tier × appeal, per month
/** Typical monthly fee range from a brand of this tier (Sponsors page). */
export function offerRange(state: GameState, team: Team, brandTier: number): [number, number] {
  const base = LEAGUE_ECON[state.leagues[team.leagueId]?.tier ?? 3].sponsor * brandTier * sponsorAppealParts(state, team).total;
  return [base * DEAL_RATE[0], base * DEAL_RATE[1]];
}
/** Monthly fee a brand pays this club (offers to the user and AI renewals alike). */
function dealMonthly(state: GameState, team: Team, brand: SponsorBrand, rng: RNG) {
  const [lo, hi] = offerRange(state, team, brand.tier);
  return Math.max(500, Math.round((lo + (hi - lo) * rng.next()) / 500) * 500);
}

/** Partners an AI club usually carries (setup.ts hands out the same numbers): tier 1 three to five, tier 2 one or two, tier 3 none or one. */
const aiSponsorTarget = (state: GameState, team: Team) => {
  const tier = state.leagues[team.leagueId]?.tier ?? 3, h = hashString(team.id);
  return Math.min(sponsorSlots(team), tier === 1 ? 3 + (h % 3) : tier === 2 ? 1 + (h % 2) : h % 2);
};

/**
 * Monthly (1st) for AI clubs below their usual number of partners: half the time a brand signs on at the going rate
 * (same pricing as offers to the user, no bonus clause). About two months to replace an expired deal.
 */
export function aiSponsorRenewals(state: GameState, team: Team, rng: RNG) {
  const live = team.sponsors.filter((s) => s.endDate >= state.date).length;
  if (live >= aiSponsorTarget(state, team) || !rng.chance(0.5)) return;
  const brand = pickBrand(state, team, rng, []);
  if (!brand) return;
  team.sponsors.push({
    id: `${team.id}-sp${state.seq++}`, sponsorId: brand.id, name: brand.name, category: brand.category, tier: brand.tier,
    monthly: dealMonthly(state, team, brand, rng), startDate: state.date, endDate: addDaysIso(state.date, rng.pick([12, 12, 24]) * 30), logoColor: brand.color,
  });
}

/**
 * Weekly (Mondays) for the user's team: at most one new offer, usually every few weeks (~6–12 a year),
 * never two pending offers from the same category or a category the club already has a partner in.
 */
export function generateSponsorOffers(state: GameState, team: Team, rng: RNG): SponsorOffer[] {
  const pace = pacing(state, team);
  const { chance } = sponsorOutlook(state, team);
  pace.fans = [...pace.fans, team.fans].slice(-5);
  if (!chance || !rng.chance(chance)) return [];
  const brand = pickBrand(state, team, rng, pace.recent ?? []);
  if (!brand) return [];
  pace.lastOffer = state.date;
  pace.recent = [...(pace.recent ?? []), brand.id].slice(-6); // the last few brands don't come straight back
  const monthly = dealMonthly(state, team, brand, rng);
  const bonusType = rng.pick(['win_league', 'playoffs', 'qualify_international', 'fans'] as const);
  return [{
    id: `so_${state.seq++}`, sponsorId: brand.id, name: brand.name, category: brand.category, tier: brand.tier,
    monthly, months: rng.pick([6, 12, 12, 24]), logoColor: brand.color, pitch: brand.pitch,
    expires: addDaysIso(state.date, 14),
    // results pay: a clause is worth ~5–13 months of the base fee
    bonus: { type: bonusType, amount: Math.round(monthly * (bonusType === 'fans' ? 5 : bonusType === 'qualify_international' ? 10 : bonusType === 'win_league' ? 13 : 5) / 1000) * 1000, target: bonusType === 'fans' ? Math.round(team.fans * 1.25) : undefined },
  }];
}

export function acceptSponsor(state: GameState, team: Team, offer: SponsorOffer): SponsorDeal {
  const deal: SponsorDeal = {
    id: offer.id, sponsorId: offer.sponsorId, name: offer.name, category: offer.category, tier: offer.tier,
    monthly: offer.monthly, startDate: state.date, endDate: addDaysIso(state.date, offer.months * 30), bonus: offer.bonus, logoColor: offer.logoColor,
  };
  team.sponsors.push(deal);
  state.sponsorOffers = state.sponsorOffers.filter((o) => o.id !== offer.id);
  return deal;
}

/** Max sponsors a team can hold depends on its content studio (a naming-rights partner comes on top). */
export const sponsorSlots = (team: Team) => 3 + team.facilities.contentStudio + (team.brandDeal ? 1 : 0);

function addDaysIso(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/** Evaluate sponsor bonus clauses when a competition ends (and monthly for fan targets). */
export function checkSponsorBonuses(state: GameState, team: Team, comp: Competition | null, order: string[] = []) {
  for (const d of team.sponsors) {
    const b = d.bonus;
    if (!b || b.achieved || d.endDate < state.date) continue;
    let hit = false;
    if (comp) {
      const placed = order.indexOf(team.id);
      if (b.type === 'win_league' && comp.leagueId === team.leagueId && comp.kind !== 'league' && placed === 0 && comp.tier > 0) hit = true;
      if (b.type === 'playoffs' && comp.kind === 'playoffs' && comp.leagueId === team.leagueId && placed >= 0) hit = true;
      if (b.type === 'qualify_international' && comp.tier === 0 && placed >= 0) hit = true;
      if (b.type === 'win_international' && comp.tier === 0 && placed === 0) hit = true;
    } else if (b.type === 'fans' && b.target && team.fans >= b.target) hit = true;
    if (!hit) continue;
    b.achieved = true;
    addLedger(state, team, 'Sponsor bonuses', b.amount, d.name);
    if (team.id === state.userTeamId) addInbox(state, { from: d.name, subject: `Bonus clause achieved: $${Math.round(b.amount / 1000)}k`, body: `${d.name} pay a $${b.amount.toLocaleString()} bonus for ${b.type.replace('_', ' ')}. Great work!`, kind: 'sponsor' });
  }
}
