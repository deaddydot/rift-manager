// Paths up the league pyramid for tier-2 and tier-3 clubs:
//   1. Promotion series — tier-3 champions challenge the last-placed tier-2 club (season/calendar.ts), tier-2
//      champions the last-placed LCS / LCP / CBLOL club.
//   2. League-spot sales — struggling clubs sell their place; the user may buy in, die-hards may crowdfund part
//      of it (management/franchise.ts).
//   3. Big-chance brand backing (here): when a tier-2/3 club dominates (a domestic title, a big win rate, repeat
//      titles) a global brand may offer a naming-rights partnership — the club plays under a branded name for a
//      few seasons ("Bedrull Wolves"), the brand pays a big monthly fee and funds most of a buyout of a spot in the
//      league above. The weakest club there sells and drops down at season rollover. AI clubs get offers too.
import type { GameState, Team, Competition, BrandDeal } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';
import { sponsorPool, type SponsorBrand } from './sponsors';
import { LEAGUE_ECON } from '../setup';
import { slotValue, weakestIn, swapLeagues, sales, fmtM, canBuyInto, isFranchised, userPrice, buyFranchise, type FranchiseSale } from './franchise';
import { ACADEMY_LEAGUES } from '../season/calendar';
import { sameOrg } from '../season/season';
import { markActionDone, type ActionResult } from './offerActions';
import { fanEvent } from './fans';
import { FAN_TEMPLATES, SCENARIO_META, type Templates } from './fanTemplates';
import { OWNER_T } from './ownerTemplates';
import { ownerMail } from './owner';
import { boostFans } from './fanbase';
import { ASC_META, ASC_TEMPLATES, ASC_OWNER_T } from './ascensionTemplates';

// ------------------------------------------------------------------ content (registered on first use: avoids load-order issues)
let contentReady = false;
function ensureContent() {
  if (contentReady) return;
  contentReady = true;
  if (SCENARIO_META.brand_rename) return;
  for (const [scen, t] of Object.entries(ASC_TEMPLATES)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t) as [keyof Templates, string[]][]) (base[p] ??= []).push(...lines);
  }
  Object.assign(SCENARIO_META, ASC_META);
  Object.assign(OWNER_T, ASC_OWNER_T);
}

// ------------------------------------------------------------------ state
export interface AscensionOption {
  style: 'title' | 'cobrand'; name: string; short: string;
  /** share of the buyout the brand pays (0..1) */
  fund: number; brandPays: number; teamPays: number;
  monthly: number; signing: number; seasons: number;
}
export interface AscensionOffer {
  id: string; date: string; teamId: string; fromLeague: string;
  brandId: string; brand: string; color: string; category: string; pitch: string;
  targetLeague: string; sellerId: string; price: number; reason: string;
  options: AscensionOption[]; expires: string; status: 'open' | 'accepted' | 'declined' | 'expired';
  accepted?: 'title' | 'cobrand';
}
interface AscensionState { offers: AscensionOffer[]; cooldown: Record<string, string>; aiDeals: Record<string, number> }
type WithAsc = GameState & { ascension?: AscensionState };
export const ascState = (state: GameState): AscensionState => ((state as WithAsc).ascension ??= { offers: [], cooldown: {}, aiDeals: {} });

const tierOf = (state: GameState, league: string) => state.leagues[league]?.tier ?? 3;
const lname = (state: GameState, league: string) => state.leagues[league]?.name ?? league;
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MAX_AI_DEALS = 4; // per season, so the pyramid doesn't churn
const OFFER_DAYS = 21;

/** The league a club would step up into (academy leagues are skipped: LCK AS → LCK). */
export function targetLeagueFor(state: GameState, team: Team): string | null {
  const mine = state.leagues[team.leagueId];
  if (!mine || mine.tier === 1 || team.parentTeamId) return null;
  let up = mine.parent;
  if (up && ACADEMY_LEAGUES.has(up)) up = state.leagues[up]?.parent;
  return up && state.leagues[up] && tierOf(state, up) < mine.tier ? up : null;
}

// ------------------------------------------------------------------ dominance
export interface Dominance { wins: number; losses: number; winRate: number; recentTitles: number; reasons: string[]; score: number }
/** How dominant a club has been in its own league: this season's series record and titles over the last two seasons. */
export function dominance(state: GameState, team: Team): Dominance {
  let wins = 0, losses = 0;
  for (const f of Object.values(state.fixtures)) {
    if (!f.result || (f.teamA !== team.id && f.teamB !== team.id)) continue;
    const c = state.competitions[f.competitionId];
    if (!c || c.season !== state.season || c.leagueId !== team.leagueId) continue;
    if (f.result.winner === team.id) wins++; else losses++;
  }
  const own = new Set(Object.values(state.competitions).filter((c) => c.leagueId === team.leagueId).map((c) => c.name));
  const recentTitles = team.titles.filter((t) => t.season >= state.season - 1 && own.has(t.competition)).length;
  const winRate = wins + losses ? wins / (wins + losses) : 0;
  const reasons: string[] = [];
  if (recentTitles) reasons.push(recentTitles >= 2 ? `${recentTitles} ${lname(state, team.leagueId)} titles in two seasons` : `a ${lname(state, team.leagueId)} title`);
  if (wins + losses >= 6) reasons.push(`a ${wins}-${losses} record this season`);
  if (team.hype >= 65) reasons.push('a buzzing fanbase');
  const score = clamp((recentTitles ? 0.35 + (recentTitles - 1) * 0.25 : 0) + clamp(winRate - 0.55, 0, 0.45) * 1.1 + Math.max(0, team.hype - 60) / 200, 0, 1);
  return { wins, losses, winRate, recentTitles, reasons, score };
}

/** Chance that winning a domestic playoff title brings a big brand to the door (shown on the Path up panel too). */
export function brandChance(state: GameState, team: Team, d = dominance(state, team), afterTitle = true): number {
  if (!targetLeagueFor(state, team) || team.brandDeal) return 0;
  const tier = tierOf(state, team.leagueId);
  const titles = d.recentTitles + (afterTitle ? 0 : 1); // a preview assumes they win the next one
  let p = (tier === 3 ? 0.32 : 0.2) + (titles - 1) * 0.22 + clamp(d.winRate - 0.6, 0, 0.4) * 1.2 + Math.max(0, team.hype - 60) / 250;
  if (d.winRate < 0.55 && titles < 2) p *= 0.4;
  const franchisedLeap = isFranchised(targetLeagueFor(state, team) ?? '');
  return clamp(team.id === state.userTeamId ? p * 1.3 : p * 0.45 * (franchisedLeap ? 0.5 : 1), 0, 0.9);
}

// ------------------------------------------------------------------ offers
const NAMING_WORD: Record<string, string> = { monstar: 'Monstar', logitack: 'Logitack G', samsong: 'Samsong', lenavo: 'Legion', dhx: 'DHX', awz: 'AWZ', kai: 'Kai', mercedez: 'Mercedez-Benx', steelserious: 'SteelSerious' };
const brandWord = (b: SponsorBrand) => NAMING_WORD[b.id] ?? b.name;
/** Same organisation: an academy / sister team ("Movistar KOI" and "Movistar KOI Fénix"). */
/** The organisation word of a name, when it's distinctive enough to compare (≥ 4 letters, or a tag like G2 / KT / T1). */
const orgWord = (n: string) => { const w = coreName(n).split(/\s+/)[0]; return w.length >= 4 || (w.length >= 2 && (/\d/.test(w) || w === w.toUpperCase())) ? w.toLowerCase() : null; };
const affiliated = (state: GameState, a: Team, b: Team) => sameOrg(state, a.id, b.id)
  || b.name.toLowerCase().startsWith(a.name.toLowerCase() + ' ') || a.name.toLowerCase().startsWith(b.name.toLowerCase() + ' ')
  || (orgWord(a.name) !== null && orgWord(a.name) === orgWord(b.name)); // "KaBuM! Esports" / "KaBuM! Ilha das Lendas", "G2 Esports" / "G2 NORD"
/** "Team Vitality Esports" → "Vitality": what stays of the club's own name next to a brand. */
const coreName = (name: string) => name.replace(/^Team\s+/i, '').replace(/\s+(Esports|eSports|e-Sports|Gaming|Club|Team)$/i, '').trim() || name;

function pickBrand(state: GameState, team: Team, rng: RNG, targetTier: number): SponsorBrand | null {
  const taken = new Set(Object.values(state.teams).map((t) => t.brandDeal?.brandId).filter(Boolean) as string[]);
  const pool = sponsorPool().filter((b) => b.tier >= 2 && !taken.has(b.id) && (!b.home || b.home.includes(team.region)));
  if (!pool.length) return null;
  return rng.weighted(pool, (b) => (b.tier === 3 ? (targetTier === 1 ? 2.4 : 1.4) : 1) * (b.home ? 1.5 : 1));
}

/** What a club can put towards a buyout: its cash (an AI club's investors add half a season's budget). */
function meansOf(state: GameState, team: Team) {
  return Math.max(0, team.balance) + (team.id === state.userTeamId ? 0 : (LEAGUE_ECON[tierOf(state, team.leagueId)]?.budget ?? 250_000) * 0.5);
}

function buildOptions(state: GameState, team: Team, brand: SponsorBrand, target: string, price: number, rng: RNG): AscensionOption[] {
  const means = meansOf(state, team);
  const tt = tierOf(state, target);
  const titleFund = tt === 2 ? 0.92 + rng.next() * 0.08 : isFranchised(target) ? 0.88 + rng.next() * 0.08 : 0.85 + rng.next() * 0.1;
  const coFund = Math.max(0.25, titleFund - 0.28 - rng.next() * 0.07);
  const base = LEAGUE_ECON[tt]?.sponsor ?? LEAGUE_ECON[2].sponsor;
  const word = brandWord(brand), core = coreName(team.name);
  const titleShort = (word[0] + (team.short.length >= 4 ? team.short.slice(0, 3) : team.short)).toUpperCase().slice(0, 5);
  const opt = (style: AscensionOption['style'], fund: number, monthly: number, seasons: number, name: string, short: string): AscensionOption => {
    // the brand wants its flagship team: the title deal is structured so the club can afford its share
    const share = Math.round((style === 'title' ? Math.min(price * (1 - fund), means * 0.6) : price * (1 - fund)) / 5_000) * 5_000;
    const brandPays = price - share;
    return { style, name, short, fund: brandPays / price, brandPays, teamPays: share, monthly: Math.round(monthly / 500) * 500, signing: Math.round(monthly * (style === 'title' ? 3 : 1.5) / 1000) * 1000, seasons };
  };
  return [
    opt('title', titleFund, base * (0.9 + rng.next() * 0.3), 3, `${word} ${core}`, titleShort),
    opt('cobrand', coFund, base * 0.45 * (0.9 + rng.next() * 0.3), 2, `${core} ${word}`, team.short),
  ];
}

/** Called when a domestic playoff of a tier-2/3 league finishes: maybe a big brand comes knocking for the champion. */
export function onLowerLeagueTitle(state: GameState, comp: Competition, championId: string) {
  ensureContent();
  const team = state.teams[championId];
  if (!team || comp.kind !== 'playoffs' || (comp.tier !== 2 && comp.tier !== 3) || team.brandDeal || team.parentTeamId) return;
  const a = ascState(state);
  if ((a.cooldown[team.id] ?? '') > state.date || a.offers.some((o) => o.teamId === team.id && o.status === 'open')) return;
  const user = team.id === state.userTeamId;
  if (!user && (a.aiDeals[state.season] ?? 0) >= MAX_AI_DEALS) return;
  const target = targetLeagueFor(state, team);
  if (!target) return;
  // an academy / sister team whose organisation already plays there can't be bought in next to it
  if (Object.values(state.teams).some((t) => t.leagueId === target && affiliated(state, t, team))) return;
  // one brokered buyout per league a season (AI clubs; the user's offer always gets through)
  const slotKey = `${state.season}:${target}`;
  if (!user && a.aiDeals[slotKey]) return;
  const rng = new RNG(hashString(`asc|${comp.id}|${team.id}`) ^ state.rngState);
  const d = dominance(state, team);
  if (!rng.chance(brandChance(state, team, d))) return;
  const moved = new Set<string>();
  const seller = weakestIn(state, target, moved, team);
  const brand = pickBrand(state, team, rng, tierOf(state, target));
  if (!seller || !brand) return;
  const price = Math.round(slotValue(state, seller) * 1.15 / 10_000) * 10_000;
  if (!price) return;
  const offer: AscensionOffer = {
    id: `asc_${state.seq++}`, date: state.date, teamId: team.id, fromLeague: team.leagueId,
    brandId: brand.id, brand: brand.name, color: brand.color, category: brand.category, pitch: brand.pitch,
    targetLeague: target, sellerId: seller.id, price, reason: [`won the ${comp.name}`, ...d.reasons.filter((r) => !r.includes('title'))].join(', '),
    options: buildOptions(state, team, brand, target, price, rng), expires: addDays(state.date, OFFER_DAYS), status: 'open',
  };
  a.offers.push(offer);
  if (a.offers.length > 40) a.offers.splice(0, a.offers.length - 40);
  if (user) return offerToUser(state, team, offer);
  // an AI club: most say yes — title naming when its share is affordable (cash plus what investors put up), else
  // co-branding; a franchised league is a bigger leap, so fewer go for it
  const means = meansOf(state, team);
  const pick = offer.options.find((o) => o.style === 'title' && o.teamPays <= means * 0.8) ?? offer.options.find((o) => o.teamPays <= means * 0.6);
  if (!pick || !rng.chance(isFranchised(target) ? 0.3 : 0.75)) { offer.status = 'declined'; a.cooldown[team.id] = addDays(state.date, 200); return; }
  a.aiDeals[state.season] = (a.aiDeals[state.season] ?? 0) + 1;
  a.aiDeals[slotKey] = 1;
  applyDeal(state, team, offer, pick);
}

function offerToUser(state: GameState, team: Team, offer: AscensionOffer) {
  const [title, co] = offer.options;
  const seller = state.teams[offer.sellerId];
  const ctx = { brand: offer.brand, category: offer.category.toLowerCase(), oldName: team.name, newName: title.name, target: lname(state, offer.targetLeague), league: lname(state, team.leagueId) };
  addInbox(state, {
    from: `${offer.brand} (global partnerships)`, kind: 'sponsor',
    subject: `Big chance: ${offer.brand} want to take ${team.short} to the ${ctx.target}`,
    body: `${team.name} ${offer.reason}. ${offer.brand} (${offer.category}) want to make the club their flagship team and have agreed a buyout of ${seller?.name ?? 'a club'}'s place in the ${ctx.target} (${fmtM(offer.price)}).\n\n`
      + `• Title naming — the club plays as “${title.name}” for ${title.seasons} seasons. ${offer.brand} pay ${Math.round(title.fund * 100)}% of the buyout (you pay ${fmtM(title.teamPays)}), ${fmtM(title.monthly)}/month and a ${fmtM(title.signing)} signing fee.\n`
      + `• Co-branding — “${co.name}” for ${co.seasons} seasons. ${offer.brand} pay ${Math.round(co.fund * 100)}% (you pay ${fmtM(co.teamPays)}), ${fmtM(co.monthly)}/month and ${fmtM(co.signing)} up front.\n\n`
      + `The move happens at the end of the season (${seller?.name ?? 'the seller'} drop to the ${ctx.league}). If the club is relegated from the ${ctx.target}, ${offer.brand} walk away and the name reverts. “${offer.pitch}” Offer open until ${offer.expires}.`,
    action: { type: 'ascensionOffer', payload: offer.id, label: 'Review the deal' },
  });
  fanEvent(state, 'brand_rumor', ctx, 2);
  ownerMail(state, 'brand_offer', ctx, { pri: 2, tone: 1 });
}

export const offerById = (state: GameState, id: string) => ascState(state).offers.find((o) => o.id === id);
/** Open and still possible (not expired, the club hasn't moved, no other move lined up). */
export function offerLive(state: GameState, o: AscensionOffer | undefined): boolean {
  if (!o || o.status !== 'open') return false;
  const team = state.teams[o.teamId];
  return o.expires >= state.date && !!team && team.leagueId === o.fromLeague && !team.brandDeal;
}

export function acceptAscension(state: GameState, offerId: string, style: 'title' | 'cobrand'): ActionResult {
  ensureContent();
  const o = offerById(state, offerId);
  const team = o ? state.teams[o.teamId] : undefined;
  if (!o || !team || !offerLive(state, o)) { markActionDone(state, 'ascensionOffer', offerId); return { ok: false, message: 'This offer is no longer on the table.' }; }
  const opt = o.options.find((x) => x.style === style)!;
  if (team.balance < opt.teamPays) return { ok: false, message: `Not enough funds: your share of the buyout is ${fmtM(opt.teamPays)}.` };
  if (sales(state).some((s) => s.status === 'sold' && s.buyerId === team.id)) return { ok: false, message: 'You already bought a league spot this offseason.' };
  applyDeal(state, team, o, opt);
  markActionDone(state, 'ascensionOffer', offerId);
  return { ok: true, message: `Deal signed — the club is now ${opt.name} and moves up to the ${lname(state, o.targetLeague)} at the end of the season.` };
}

export function declineAscension(state: GameState, offerId: string): ActionResult {
  ensureContent();
  const o = offerById(state, offerId);
  markActionDone(state, 'ascensionOffer', offerId);
  if (!o || o.status !== 'open') return { ok: false, message: 'This offer is no longer on the table.' };
  o.status = 'declined';
  ascState(state).cooldown[o.teamId] = addDays(state.date, 200);
  const team = state.teams[o.teamId];
  const ctx = { brand: o.brand, oldName: team?.name, target: lname(state, o.targetLeague), league: lname(state, o.fromLeague) };
  fanEvent(state, 'brand_declined', ctx, 3);
  ownerMail(state, 'brand_no', ctx, { pri: 2, tone: -1 });
  return { ok: true, message: `Declined ${o.brand}. The club keeps its name — promotion will have to come the hard way.` };
}

function applyDeal(state: GameState, team: Team, o: AscensionOffer, opt: AscensionOption) {
  o.status = 'accepted';
  o.accepted = opt.style;
  const user = team.id === state.userTeamId;
  const oldName = team.name, target = lname(state, o.targetLeague), from = lname(state, team.leagueId);
  if (opt.teamPays) addLedger(state, team, 'League slot buyout', -opt.teamPays, `${o.targetLeague} spot via ${o.brand}`);
  addLedger(state, team, 'Naming rights', opt.signing, `${o.brand} signing fee`);
  const until = `${state.season + opt.seasons}-11-30`;
  const deal: BrandDeal = {
    brandId: o.brandId, brand: o.brand, color: o.color, category: o.category, style: opt.style, originalName: team.name, originalShort: team.short,
    start: state.date, until, monthly: opt.monthly, targetLeague: o.targetLeague,
    slot: { sellerId: o.sellerId, price: o.price, brandPays: opt.brandPays, teamPays: opt.teamPays, status: 'pending' },
  };
  team.brandDeal = deal;
  team.sponsors.push({ id: `nr_${o.id}`, sponsorId: o.brandId, name: o.brand, category: 'Naming rights', tier: 3, monthly: opt.monthly, startDate: state.date, endDate: until, logoColor: o.color });
  team.name = opt.name;
  team.short = opt.short;
  team.hype = Math.min(100, team.hype + 8);
  boostFans(team, 0.06); // the brand's reach brings casual fans
  for (const s of sales(state)) if (s.status === 'open' && s.sellerId === o.sellerId) s.status = 'expired'; // that spot is spoken for
  const seller = state.teams[o.sellerId];
  addNews(state, {
    headline: `${o.brand} back ${oldName}: “${opt.name}” to buy into the ${target}`,
    body: `${oldName} (${from}) ${o.reason}. ${o.brand} sign a ${opt.seasons}-season naming-rights deal — the club becomes ${opt.name} — and fund most of a buyout of ${seller?.name ?? 'a club'}'s ${target} place. The move happens at the end of the season.`,
    tags: ['sponsor', 'franchise'], teamIds: [team.id, o.sellerId],
  });
  if (user) {
    const ctx = { brand: o.brand, category: o.category.toLowerCase(), oldName, newName: opt.name, target, league: from };
    fanEvent(state, 'brand_rename', ctx, 4);
    ownerMail(state, 'brand_yes', ctx, { pri: 2, tone: 1 });
  }
}

// ------------------------------------------------------------------ daily / rollover
/** Daily: offers past their date expire. */
export function ascensionDaily(state: GameState) {
  const a = (state as WithAsc).ascension;
  if (!a) return;
  for (const o of a.offers) if (o.status === 'open' && o.expires < state.date) { o.status = 'expired'; markActionDone(state, 'ascensionOffer', o.id); }
}

/**
 * Season rollover (after promotion series, before ordinary spot sales): brokered buyouts change hands; a club that
 * already went up through the series gets its share back plus a brand bonus; deals that ran out — or whose club was
 * relegated from the league the brand paid for — end and the name reverts.
 */
export function applyAscensionMoves(state: GameState, moved: Set<string>) {
  ensureContent();
  for (const team of Object.values(state.teams)) {
    const d = team.brandDeal;
    if (!d) continue;
    const user = team.id === state.userTeamId;
    const target = lname(state, d.targetLeague);
    if (d.slot?.status === 'pending') {
      const slot = d.slot;
      if (moved.has(team.id) || tierOf(state, team.leagueId) <= tierOf(state, d.targetLeague)) {
        // promoted the hard way: the buyout isn't needed
        slot.status = 'void';
        if (slot.teamPays) addLedger(state, team, 'Slot buyout refund', slot.teamPays, d.brand);
        addLedger(state, team, 'Brand promotion bonus', Math.round(slot.brandPays * 0.2 / 5_000) * 5_000, d.brand);
        addNews(state, { headline: `${team.name} go up on merit — ${d.brand} cancel the buyout`, body: `${team.name} won promotion to the ${lname(state, team.leagueId)} on the Rift, so ${d.brand} drop the planned buyout and pay the club a bonus instead.`, tags: ['sponsor'], teamIds: [team.id] });
      } else {
        let seller: Team | undefined = state.teams[slot.sellerId];
        if (!seller || seller.leagueId !== d.targetLeague || moved.has(seller.id)) seller = weakestIn(state, d.targetLeague, moved, team);
        if (!seller) {
          slot.status = 'void';
          if (slot.teamPays) addLedger(state, team, 'Slot buyout refund', slot.teamPays, d.brand);
        } else {
          const from = lname(state, team.leagueId);
          swapLeagues(state, team, seller, moved);
          slot.status = 'done';
          slot.sellerId = seller.id;
          addLedger(state, seller, 'League spot sold', slot.price, `to ${team.name}`); // paid by the brand and the club, not conjured
          addNews(state, { headline: `${team.name} complete their move into the ${target}`, body: `${team.name} take ${seller.name}'s place in the ${target}; ${seller.name} drop to the ${from}.`, tags: ['franchise'], teamIds: [team.id, seller.id] });
          if (user) {
            fanEvent(state, 'ascension_complete', { target, from }, 4);
            addInbox(state, { from: 'The Board', kind: 'board', subject: `Welcome to the ${target}`, body: `The ${d.brand}-funded buyout is complete: ${team.name} play in the ${target} this season. Revenue share, sponsors and crowds step up — and so does the opposition.` });
          }
        }
      }
    }
    // the brand paid for (or celebrated) the step up: dropping back out of that league ends it
    const relegated = d.slot?.status !== 'pending' && tierOf(state, team.leagueId) > tierOf(state, d.targetLeague);
    if (relegated || d.until <= state.date) endBrandDeal(state, team, relegated ? 'relegated' : 'expired');
  }
}

/** The name reverts and the naming money stops. AI clubs that stayed up usually extend instead. */
export function endBrandDeal(state: GameState, team: Team, why: 'relegated' | 'expired') {
  const d = team.brandDeal;
  if (!d) return;
  const user = team.id === state.userTeamId;
  const rng = new RNG(hashString(`ascend|${team.id}|${state.date}`) ^ state.rngState);
  if (why === 'expired' && !user && rng.chance(0.55)) { // AI: the brand renews for two more seasons
    d.until = `${state.season + 2}-11-30`;
    const nr = team.sponsors.find((s) => s.id.startsWith('nr_') && s.sponsorId === d.brandId);
    if (nr) nr.endDate = d.until;
    return;
  }
  const brandedName = team.name;
  team.name = d.originalName;
  team.short = d.originalShort;
  for (const s of team.sponsors) if (s.category === 'Naming rights' && s.sponsorId === d.brandId && s.endDate >= state.date) s.endDate = addDays(state.date, -1);
  team.brandDeal = undefined;
  addNews(state, {
    headline: why === 'relegated' ? `${d.brand} pull out after ${brandedName}'s relegation` : `${brandedName} become ${team.name} again`,
    body: why === 'relegated' ? `${d.brand} end their naming-rights deal; the club returns to its old name, ${team.name}.` : `The ${d.brand} naming-rights deal has run its course; the club returns to its old name.`,
    tags: ['sponsor'], teamIds: [team.id],
  });
  if (user) {
    fanEvent(state, 'brand_exit', { brand: d.brand, oldName: team.name }, 3);
    addInbox(state, { from: d.brand, kind: 'sponsor', subject: `${d.brand} naming-rights deal ended`, body: why === 'relegated' ? `After the relegation, ${d.brand} have exercised their exit clause. The club plays as ${team.name} again and the ${fmtM(d.monthly)}/month stops.` : `Our partnership has run its course — thank you. The club plays as ${team.name} again. Brands keep watching winners: dominate again and the phone will ring.` });
  }
}

/** Fan reactions for the user's club changing league through the promotion series (called at rollover). */
export function reactToLeagueChange(state: GameState, up: boolean, from: string, to: string) {
  ensureContent();
  fanEvent(state, up ? 'league_promoted' : 'league_relegated', { target: lname(state, to), league: lname(state, from) }, 4);
}
/** The user buys a listed spot (franchise.ts) — and the fans react. */
export function buySpot(state: GameState, saleId: string): ActionResult {
  const r = buyFranchise(state, saleId);
  const sale = sales(state).find((s) => s.id === saleId);
  if (r.ok && sale) { reactToSlotPurchase(state, sale); markActionDone(state, 'franchiseOffer', saleId); }
  return r;
}

/** Fan reactions to buying a spot (and to a crowdfunding campaign). */
export function reactToSlotPurchase(state: GameState, sale: FranchiseSale) {
  ensureContent();
  const ctx = { target: lname(state, sale.league), pledge: sale.pledge ? fmtM(sale.pledge) : undefined };
  if (sale.pledge) fanEvent(state, 'crowdfund', ctx, 2);
  fanEvent(state, 'slot_bought', ctx, 3);
}

// ------------------------------------------------------------------ the "Path up" panel
export interface PathUp {
  league: string; tier: number; target: string | null; targetName: string | null;
  promotion: { name: string; start: string; status: string; inField: boolean } | null;
  how: string;
  sales: (FranchiseSale & { pay: number })[];
  dominance: Dominance; chance: number;
  deal: BrandDeal | null; offer: AscensionOffer | null;
}
export function pathUp(state: GameState, team: Team): PathUp {
  const mine = state.leagues[team.leagueId];
  const target = targetLeagueFor(state, team);
  const promoComp = Object.values(state.competitions).filter((c) => c.season === state.season && c.seedRule?.startsWith('promotion:') && c.seedRule.split(':')[2]?.split(',').includes(team.leagueId)).pop();
  const how = !target ? (mine?.tier === 1 ? 'Already in a tier-1 league.' : 'Academy teams move up with their parent organisation.')
    : promoComp ? `Finish in the top ${promoComp.seedRule!.split(':')[2].split(',').length === 1 ? 3 : 1} of the ${mine?.name} summer playoffs to reach the ${promoComp.name}, where the last-placed ${lname(state, target)} club defends its spot.`
      : `The ${lname(state, target)} has no promotion: clubs buy their way in when a spot is for sale, or a big brand brokers a buyout.`;
  const live = ascState(state).offers.find((o) => o.teamId === team.id && offerLive(state, o)) ?? null;
  return {
    league: team.leagueId, tier: mine?.tier ?? 3, target, targetName: target ? lname(state, target) : null,
    promotion: promoComp ? { name: promoComp.name, start: promoComp.startDate, status: promoComp.status, inField: promoComp.teams.includes(team.id) } : null,
    how,
    sales: sales(state).filter((s) => s.status === 'open' && s.expires >= state.date && canBuyInto(state, team, s.league)).map((s) => ({ ...s, pay: userPrice(s) })),
    dominance: dominance(state, team), chance: brandChance(state, team, undefined, false),
    deal: team.brandDeal ?? null, offer: live,
  };
}
