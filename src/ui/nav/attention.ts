// "Needs attention" signals shown as nav badges and in the command palette.
import type { GameState, InboxMessage } from '../../engine/types';
import { ROLES } from '../../engine/types';
import { ownerRequestLive } from '../../engine/management/owner';
import { sales } from '../../engine/management/franchise';

/**
 * live  = pulsing red dot (something is happening right now, e.g. match day)
 * alert = red pill: a decision / problem waiting for you
 * info  = gold pill (with a count) or teal dot (without one)
 */
export type AttentionLevel = 'live' | 'alert' | 'info';
export interface Attention {
  page: string; level: AttentionLevel; text: string; n?: number; route?: [string, string?, string?];
  /** false = badge only; hidden from the To-do list / palette because an inbox decision already covers it */
  todo?: boolean;
}

/** Mirrors Inbox's notion of an open action (the offer behind it still exists / is pending). */
export function inboxActionLive(state: GameState, m: InboxMessage) {
  const a = m.action;
  if (!a || a.done) return false;
  if (a.type === 'sponsorOffer') return state.sponsorOffers.some((o) => o.id === a.payload);
  if (a.type === 'incomingOffer') {
    const o = state.transferOffers.find((x) => x.id === a.payload);
    return !!o && o.status === 'pending' && state.players[o.playerId]?.teamId === state.userTeamId;
  }
  if (a.type === 'franchiseOffer') { const sale = sales(state).find((x) => x.id === a.payload); return !!sale && sale.status === 'open' && sale.expires >= state.date; }
  if (a.type === 'openPlayer') { const p = state.players[String(a.payload)]; return !!p?.contract && p.teamId === state.userTeamId; }
  if (a.type === 'ownerChoice') return ownerRequestLive(state, String(a.payload));
  return true;
}

export function computeAttention(state: GameState): Attention[] {
  const out: Attention[] = [];
  const team = state.teams[state.userTeamId];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  if (state.pendingMatch) {
    const f = state.fixtures[state.pendingMatch];
    const opp = f ? state.teams[f.teamA === team.id ? f.teamB ?? '' : f.teamA ?? '']?.name : undefined;
    out.push({ page: 'match', level: 'live', text: opp ? `Match day vs ${opp}` : 'Match day' });
  }

  // each open inbox decision is its own to-do (bids, sponsor offers, owner requests, expiring contracts...)
  const decisions = state.inbox.filter((m) => inboxActionLive(state, m));
  const SHOW = 4;
  decisions.slice(0, decisions.length > SHOW ? SHOW - 1 : SHOW).forEach((m) => out.push({ page: 'inbox', level: 'alert', n: 1, text: m.subject }));
  if (decisions.length > SHOW) out.push({ page: 'inbox', level: 'alert', n: decisions.length - SHOW + 1, text: `${plural(decisions.length - SHOW + 1, 'more decision')} in your inbox` });
  const unread = state.inbox.filter((m) => !m.read).length;
  if (unread) out.push({ page: 'inbox', level: 'info', n: unread, text: `${plural(unread, 'unread message')}` });

  const missing = ROLES.filter((r) => !team.lineup[r] || state.players[team.lineup[r]!]?.teamId !== team.id);
  if (missing.length) out.push({ page: 'squad', level: 'alert', text: `Starting lineup incomplete (${missing.join(', ')})` });

  if (!team.staff.some((id) => state.staff[id]?.role === 'headCoach')) out.push({ page: 'staff', level: 'alert', text: 'No head coach hired' });

  const incoming = state.transferOffers.filter((o) => o.direction === 'incoming' && o.status === 'pending' && state.players[o.playerId]?.teamId === team.id).length;
  if (incoming) out.push({ page: 'transfers', level: 'alert', n: incoming, text: `${plural(incoming, 'bid')} for your players`, todo: false });
  if (state.transferWindowOpen) out.push({ page: 'transfers', level: 'info', text: 'Transfer window is open' });

  if (state.sponsorOffers.length) out.push({ page: 'sponsors', level: 'info', n: state.sponsorOffers.length, text: `${plural(state.sponsorOffers.length, 'sponsor offer')} on the table`, todo: false });

  if (team.balance < 0) out.push({ page: 'finances', level: 'alert', text: 'Balance is negative' });

  const o = state.owner;
  const requests = o ? o.requests.filter((r) => ownerRequestLive(state, r.id)).length : 0;
  if (requests) out.push({ page: 'boardroom', level: 'alert', n: requests, text: `The owner wants an answer (${plural(requests, 'request')})`, todo: false });
  if (o && o.ultimatum >= 2) out.push({ page: 'boardroom', level: 'alert', text: o.ultimatum >= 3 ? 'Owner: final warning' : 'Owner ultimatum issued' });
  else if (state.board.confidence < 30) out.push({ page: 'boardroom', level: 'alert', text: 'Board confidence is low' });

  return out;
}

/** Summarise a set of attention items into what a badge should show. */
export function summarize(items: Attention[]) {
  const live = items.some((i) => i.level === 'live');
  const alerts = items.filter((i) => i.level === 'alert');
  const infos = items.filter((i) => i.level === 'info');
  const alertN = alerts.reduce((s, i) => s + (i.n ?? 0), 0);
  const infoN = infos.reduce((s, i) => s + (i.n ?? 0), 0);
  return { live, alert: alerts.length > 0, alertN, info: infos.length > 0, infoN, title: items.map((i) => i.text).join('\n') };
}
