// Small, dependency-free hooks for the content systems (content.ts: creator videos, orgContent.ts: the club channel),
// read by fanbase.ts, finance.ts, merch.ts, sponsors.ts and development.ts. Kept apart so those modules don't import
// the content modules (which import the fan modules) — no import cycles.
//
// Engagement 0..1 is how alive a club's online presence is. AI clubs get a baseline from their content studio,
// calibrated so their loyalty, fan form and content revenue are exactly what they were before the club channel
// existed. The user's club earns it with uploads: `momentum` (regular, good uploads → reach / casual fans) and
// `community` (vlogs, Q&As, spotlights → die-hard loyalty); with no uploads only a little studio output remains.
import type { GameState, Team } from '../types';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** AI clubs' implied engagement (and the yardstick for the user's): content studio level 0..5 → 0..0.58. */
export const aiEngagement = (team: Team) => Math.min(0.6, team.facilities.contentStudio * 0.117);

const userChannel = (state: GameState, team: Team) => (team.id === state.userTeamId ? state.content?.channel : undefined);
/** Reach side: momentum of the channel (platforms push regular, good uploads). */
export function reachEngagement(state: GameState, team: Team): number {
  const ch = userChannel(state, team);
  if (!ch) return team.id === state.userTeamId ? team.facilities.contentStudio * 0.06 : aiEngagement(team);
  return clamp01(team.facilities.contentStudio * 0.06 + ch.momentum / 100 * 0.9);
}
/** Community side: fans who feel close to the club (vlogs, Q&As, spotlights). */
export function communityEngagement(state: GameState, team: Team): number {
  const ch = userChannel(state, team);
  if (!ch) return team.id === state.userTeamId ? team.facilities.contentStudio * 0.06 : aiEngagement(team);
  return clamp01(team.facilities.contentStudio * 0.06 + ch.community / 100 * 0.9);
}

/** Loyalty from the community (fanbase.ts): equals the old studio-only value (level × 0.015) for AI clubs; up to ~0.1. */
export const communityLoyalty = (state: GameState, team: Team) => team.facilities.contentStudio * 0.008 + communityEngagement(state, team) * 0.06;
/** Casual-fan form multiplier (fanbase.ts fanForm): 1 for AI clubs, about 0.99 … 1.09 for the user's. */
export const contentForm = (state: GameState, team: Team) => 1 + 0.12 * (reachEngagement(state, team) - aiEngagement(team));
/** Streaming & content revenue multiplier (finance.ts). */
export const contentRevenueMult = (state: GameState, team: Team) => Math.max(0.5, 1 + 0.6 * (reachEngagement(state, team) - aiEngagement(team)));
/** Sponsor appeal from an active channel (sponsors.ts): brands pay for an engaged audience. */
export const contentSponsorAppeal = (state: GameState, team: Team) => 0.1 * (reachEngagement(state, team) - aiEngagement(team));
/** Merch demand boost after a photoshoot / kit reveal (merch.ts). */
export function contentMerchBoost(state: GameState, team: Team): number {
  const m = userChannel(state, team)?.merch;
  return m && m.until >= state.date ? m.boost : 0;
}
/** Fan bond from appearing in the club's videos (fanbase.ts playerBond): +0.05 charm per recent appearance, max +0.45. */
export function appearanceCharm(state: GameState, team: Team, playerId: string): number {
  const n = userChannel(state, team)?.appear[playerId] ?? 0;
  return Math.min(0.45, n * 0.05);
}
/** Training lost to shoots in the last week (development.ts): −3% per shoot, at most −12%. */
export function shootPenalty(state: GameState, playerId: string): number {
  const dates = state.content?.channel.shoots[playerId];
  if (!dates?.length) return 1;
  const since = new Date(new Date(state.date).getTime() - 7 * 864e5).toISOString().slice(0, 10);
  return 1 - Math.min(0.12, dates.filter((d) => d >= since).length * 0.03);
}

/** Something creators may make a video about (handled by content.ts the next day). */
export function contentEvent(state: GameState, kind: string, data: Record<string, string | number> = {}) {
  const c = state.content;
  if (!c) return; // created on first use of the content page / first daily tick
  c.events.push({ kind, date: state.date, data });
  if (c.events.length > 30) c.events.splice(0, c.events.length - 30);
}

// ------------------------------------------------------------------ scrims (scrims.ts)
const daysBefore = (date: string, n: number) => new Date(new Date(date).getTime() - n * 864e5).toISOString().slice(0, 10);
/**
 * Scrim quality of the last 7 days (1 = the usual partners the staff arrange at your level). Three or more blocks
 * give the full effect; fewer blend toward 1.
 */
export function scrimWeek(state: GameState): { blocks: number; q: number; w: number; l: number } {
  const since = daysBefore(state.date, 7);
  const played = (state.scrims?.blocks ?? []).filter((b) => b.status === 'played' && b.result && b.date >= since && b.date < state.date);
  if (!played.length) return { blocks: 0, q: 1, w: 0, l: 0 };
  const avg = played.reduce((s, b) => s + b.result!.q, 0) / played.length;
  const cover = Math.min(1, played.length / 3);
  return { blocks: played.length, q: 1 + cover * (avg - 1), w: played.reduce((s, b) => s + b.result!.w, 0), l: played.reduce((s, b) => s + b.result!.l, 0) };
}
/** Training-rate multiplier from this week's scrims for the user's club: the scrim share of the plan carries it. */
export function scrimTrainingMult(state: GameState, scrimShare: number): number {
  const q = scrimWeek(state).q;
  return 1 + Math.min(0.8, Math.max(0, scrimShare / 100)) * (q - 1) * 2;
}
