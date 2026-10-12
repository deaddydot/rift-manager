// User-side handling of sponsor offers and incoming transfer bids.
// Shared by the Sponsors, Inbox (and any other) pages so the bookkeeping stays identical:
// slot checks, inbox action flags and news lines.
import type { GameState, Team, SponsorDeal } from '../types';
import { acceptSponsor, sponsorSlots } from './sponsors';
import { respondIncoming, fmtK } from './transfers';
import { addNews } from './news';

export interface ActionResult { ok: boolean; message: string }

/** Deals that are still running today. */
export const activeSponsors = (state: GameState, team: Team) => team.sponsors.filter((s) => s.endDate >= state.date);

/** Flag every inbox message carrying this action as handled. */
export function markActionDone(state: GameState, type: string, payload: unknown) {
  for (const m of state.inbox) {
    if (m.action && m.action.type === type && m.action.payload === payload) {
      m.action.done = true;
      m.read = true;
    }
  }
}

export function acceptSponsorOffer(state: GameState, offerId: string): ActionResult {
  const team = state.teams[state.userTeamId];
  const offer = state.sponsorOffers.find((o) => o.id === offerId);
  if (!offer) {
    markActionDone(state, 'sponsorOffer', offerId);
    return { ok: false, message: 'This offer has expired or was already handled.' };
  }
  const slots = sponsorSlots(team);
  if (activeSponsors(state, team).length >= slots) {
    return { ok: false, message: `All ${slots} sponsor slots are in use. Upgrade the Content Studio or wait for a deal to expire.` };
  }
  const deal = acceptSponsor(state, team, offer);
  markActionDone(state, 'sponsorOffer', offer.id);
  addNews(state, {
    headline: `${team.name} announce partnership with ${offer.name}`,
    body: `${team.name} have signed a ${offer.months}-month deal with ${offer.name} (${offer.category}), reportedly worth around $${fmtK(offer.monthly * offer.months)} in total.${offer.bonus ? ' The agreement includes performance bonuses.' : ''}`,
    tags: ['sponsor'],
    teamIds: [team.id],
  });
  return { ok: true, message: `Signed ${offer.name}: $${fmtK(offer.monthly)}/month until ${deal.endDate}.` };
}

export function declineSponsorOffer(state: GameState, offerId: string): ActionResult {
  const offer = state.sponsorOffers.find((o) => o.id === offerId);
  state.sponsorOffers = state.sponsorOffers.filter((o) => o.id !== offerId);
  markActionDone(state, 'sponsorOffer', offerId);
  return { ok: true, message: offer ? `Declined the ${offer.name} offer.` : 'Offer dismissed.' };
}

export function respondIncomingOffer(state: GameState, offerId: string, accept: boolean): ActionResult {
  const o = state.transferOffers.find((x) => x.id === offerId);
  if (!o || o.status !== 'pending') {
    markActionDone(state, 'incomingOffer', offerId);
    return { ok: false, message: 'This bid is no longer active.' };
  }
  const p = state.players[o.playerId];
  const buyer = state.teams[o.toTeamId];
  // the player has a say: he may refuse personal terms, and he reacts either way (bidTalks.ts)
  const res = respondIncoming(state, offerId, accept);
  markActionDone(state, 'incomingOffer', offerId);
  if (res) return res;
  const status: string = o.status;
  if (accept && status === 'accepted') return { ok: true, message: `${p?.handle ?? 'Player'} sold to ${buyer?.name ?? 'buyer'} for $${fmtK(o.fee)}.` };
  if (accept) return { ok: false, message: 'The transfer could not be completed.' };
  return { ok: true, message: `Rejected ${buyer?.short ?? 'the'} bid for ${p?.handle ?? 'the player'}.` };
}

// ------------------------------------------------------------------ sponsor bonus helpers
export const BONUS_LABEL: Record<NonNullable<SponsorDeal['bonus']>['type'], string> = {
  win_league: 'Win the domestic league',
  playoffs: 'Reach the playoffs',
  qualify_international: 'Qualify for an international event',
  win_international: 'Win an international event',
  fans: 'Grow the fanbase',
};

export function bonusText(b: NonNullable<SponsorDeal['bonus']>) {
  if (b.type === 'fans' && b.target) return `Reach ${b.target.toLocaleString()} fans`;
  return BONUS_LABEL[b.type];
}

/** 0..1 progress (fans) or achieved flag for display. */
export function bonusProgress(team: Team, b: NonNullable<SponsorDeal['bonus']>): { achieved: boolean; progress: number | null } {
  if (b.achieved) return { achieved: true, progress: 1 };
  if (b.type === 'fans' && b.target) {
    const p = Math.min(1, team.fans / b.target);
    return { achieved: p >= 1, progress: p };
  }
  return { achieved: false, progress: null };
}
