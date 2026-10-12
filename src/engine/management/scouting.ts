// Scouting: knowledge of other players' hidden attributes and hidden traits.
// Knowledge (0..100) lives in state.scoutedPlayers; the user's own players are always fully known.
import type { GameState, Player, HiddenAttributes, Team, Staff } from '../types';
import { TRAITS } from '../traits';
import { RNG, clamp, hashString } from '../../util/rng';
import { addLedger } from './finance';
import { addInbox } from './news';
import { playerOvr } from './transfers';
import { RATING_MAX } from '../ratings';

export const HIDDEN_KEYS: (keyof HiddenAttributes)[] = ['potential', 'farsight', 'mistakes', 'composure', 'snowball', 'resilience', 'workEthic', 'professionalism', 'ego', 'loyalty', 'injuryProne'];

/** Hidden attributes where a HIGH value is bad (for colouring). */
export const HIDDEN_NEGATIVE: Partial<Record<keyof HiddenAttributes, true>> = { mistakes: true, ego: true, injuryProne: true };

/** Knowledge level needed before hidden traits are revealed. */
export const TRAIT_REVEAL_KNOWLEDGE = 70;

/** Scouting knowledge 0..100 for a player (own players = 100; famous players have a small public baseline). */
export function knowledgeOf(state: GameState, p: Player): number {
  if (p.teamId && p.teamId === state.userTeamId) return 100;
  const scouted = state.scoutedPlayers?.[p.id] ?? 0;
  const publicInfo = Math.min(20, Math.round((p.reputation ?? 0) * 0.2));
  return clamp(Math.round(Math.max(scouted, publicInfo)), 0, 100);
}

export function knowledgeLabel(k: number) {
  return k >= 100 ? 'Complete' : k >= 85 ? 'Detailed' : k >= 70 ? 'Good' : k >= 40 ? 'Partial' : k >= 15 ? 'Basic' : 'Unknown';
}

/** A [min,max] estimate around `value`. Width shrinks linearly with knowledge; the true value's position inside the range is stable per seed. */
export function estimateRange(value: number, knowledge: number, seed: string, lo = 1, hi = 100, scale = 1): [number, number] {
  const width = Math.round((100 - clamp(knowledge, 0, 100)) * 0.5 * scale);
  if (width <= 0) return [Math.round(value), Math.round(value)];
  const offset = (hashString(seed) % 1000) / 1000;
  let a = Math.round(value - width * offset);
  let b = a + width;
  if (a < lo) { b += lo - a; a = lo; }
  if (b > hi) { a -= b - hi; b = hi; }
  return [clamp(a, lo, hi), clamp(b, lo, hi)];
}

export interface ScoutedView {
  knowledge: number;
  label: string;
  /** true when every hidden value is known exactly */
  exact: boolean;
  hidden: Record<keyof HiddenAttributes, [number, number]>;
  /** revealed trait ids (non-hidden traits always, hidden traits only with knowledge >= 70) */
  traits: string[];
  hiddenTraitsRevealed: boolean;
  /** potential estimate, never below current overall */
  potential: [number, number];
  overall: number;
}

/** What the user's club knows about a player. */
export function scoutedView(state: GameState, p: Player): ScoutedView {
  const k = knowledgeOf(state, p);
  const hidden = {} as Record<keyof HiddenAttributes, [number, number]>;
  for (const key of HIDDEN_KEYS) hidden[key] = key === 'potential'
    ? estimateRange(p.hidden.potential, k, `${p.id}|${key}`, 1, RATING_MAX, 1.5) // the 0..200 ceiling: wider guesses
    : estimateRange(p.hidden[key], k, `${p.id}|${key}`);
  const ovr = playerOvr(p);
  let [pl, ph] = hidden.potential;
  pl = Math.max(pl, ovr);
  ph = Math.max(ph, pl);
  hidden.potential = [pl, ph];
  const reveal = k >= TRAIT_REVEAL_KNOWLEDGE;
  const traits = p.traits.filter((t) => !TRAITS[t]?.hidden || reveal);
  return { knowledge: k, label: knowledgeLabel(k), exact: k >= 100, hidden, traits, hiddenTraitsRevealed: reveal, potential: hidden.potential, overall: ovr };
}

/** Format a range as "62" or "55–71". */
export const fmtRange = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

// ------------------------------------------------------------------ scouting assignments
const tierOfPlayer = (state: GameState, p: Player): number | null => {
  const t = p.teamId ? state.teams[p.teamId] : null;
  return t ? state.leagues[t.leagueId]?.tier ?? 3 : null;
};

/** Cost of one scouting assignment ($2k–$15k depending on the league tier). */
export function scoutCost(state: GameState, p: Player): number {
  const tier = tierOfPlayer(state, p);
  if (tier === 1) return 15_000;
  if (tier === 2) return 7_000;
  if (tier === 3) return 4_000;
  return clamp(2_000 + Math.round((p.reputation * 50) / 500) * 500, 2_000, 6_000); // free agents
}

export function scoutingStaff(state: GameState, team: Team): Staff[] {
  return team.staff.map((id) => state.staff[id]).filter((s): s is Staff => !!s && (s.role === 'scout' || s.role === 'analyst'));
}

/** Knowledge gained per assignment: 35..60 with analytics lab level and scouting staff. */
export function scoutingPower(state: GameState, team: Team) {
  const lab = team.facilities.analyticsLab ?? 0;
  const staff = scoutingStaff(state, team);
  const best = staff.reduce((m, s) => Math.max(m, s.attributes.scouting), 0);
  const labBonus = lab * 3;
  const staffBonus = best ? Math.round(clamp((best - 40) / 6, 0, 10)) : 0;
  const extra = Math.min(2, Math.max(0, staff.length - 1)); // a deeper scouting department helps a little
  const base = clamp(35 + labBonus + staffBonus + extra, 35, 57);
  return { lab, staff, bestScouting: best, labBonus, staffBonus: staffBonus + extra, min: base, max: clamp(base + 3, 35, 60) };
}

/** Send a scout: charges the user's club and raises knowledge. */
export function scoutPlayer(state: GameState, playerId: string): { ok: boolean; message: string; gain?: number; cost?: number } {
  const p = state.players[playerId];
  const team = state.teams[state.userTeamId];
  if (!p || !team) return { ok: false, message: 'Unknown player.' };
  if (p.teamId === team.id) return { ok: false, message: `${p.handle} is already fully known.` };
  const before = knowledgeOf(state, p);
  if (before >= 100) return { ok: false, message: `${p.handle} has been fully scouted.` };
  const cost = scoutCost(state, p);
  if (team.balance < cost) return { ok: false, message: `Not enough funds (scouting costs $${Math.round(cost / 1000)}k).` };
  const power = scoutingPower(state, team);
  const rng = new RNG(state.rngState ^ hashString(p.id + state.date));
  const gain = rng.int(power.min, power.max);
  state.scoutedPlayers[p.id] = clamp(before + gain, 0, 100);
  addLedger(state, team, 'Scouting', -cost, p.handle);
  const after = state.scoutedPlayers[p.id];
  const v = scoutedView(state, p);
  const newTraits = v.hiddenTraitsRevealed && before < TRAIT_REVEAL_KNOWLEDGE ? p.traits.filter((t) => TRAITS[t]?.hidden) : [];
  addInbox(state, {
    from: 'Scouting department', kind: 'info',
    subject: `Scouting report: ${p.handle} (${after}% known)`,
    body: [
      `Knowledge of ${p.handle} rose from ${before}% to ${after}%.`,
      `Estimated potential: ${fmtRange(v.potential)}.`,
      `Composure ${fmtRange(v.hidden.composure)} · Work ethic ${fmtRange(v.hidden.workEthic)} · Mistake-proneness ${fmtRange(v.hidden.mistakes)} · Ego ${fmtRange(v.hidden.ego)}.`,
      newTraits.length ? `Hidden traits uncovered: ${newTraits.map((t) => TRAITS[t]?.name ?? t).join(', ')}.` : v.hiddenTraitsRevealed ? 'No further hidden traits were found.' : `Hidden traits will be uncovered at ${TRAIT_REVEAL_KNOWLEDGE}% knowledge.`,
    ].join('\n'),
  });
  return { ok: true, gain, cost, message: `Scouted ${p.handle}: knowledge ${before}% → ${after}% (−$${Math.round(cost / 1000)}k)` };
}
