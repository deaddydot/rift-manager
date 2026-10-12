// Potential on the 0..200 rating scale (engine/ratings.ts): how far a player can still grow.
// Rolled from age (young players have the most room), current level (good-for-their-age players have more) and a
// random talent factor (median ×1, top ~2% ×2) — so a 21-year-old tier-1 star usually has a ceiling around 130–170
// and the rare prodigy can reach 200, while tier-2/3 kids mostly sit around 75–110 with room to climb leagues.
// Reaching the ceiling takes good coaching, facilities and winning (management/development.ts); unrealised room
// fades once a player is past ~25, and winners who hit their ceiling can still break through it.
import type { GameState, Player } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { RATING_MAX, overall } from '../ratings';

/** Typical room to grow by age (before level and talent). */
const AGE_ROOM: [number, number][] = [[16, 80], [17, 76], [18, 70], [19, 62], [20, 54], [21, 47], [22, 40], [23, 33], [24, 27], [25, 21], [26, 15], [27, 10], [28, 6], [29, 4], [30, 2]];
export function ageRoom(age: number) {
  if (age <= AGE_ROOM[0][0]) return AGE_ROOM[0][1];
  for (let i = 1; i < AGE_ROOM.length; i++) {
    const [a1, r1] = AGE_ROOM[i];
    if (age <= a1) { const [a0, r0] = AGE_ROOM[i - 1]; return r0 + (r1 - r0) * (age - a0) / (a1 - a0); }
  }
  return AGE_ROOM[AGE_ROOM.length - 1][1];
}

/**
 * A ceiling for a player of this level and age. `talentShift` moves the talent roll (log scale): +0.35 for a
 * hidden gem, negative for journeymen.
 */
export function rollPotential(ovr: number, age: number, rng: RNG, talentShift = 0): number {
  const talent = clamp(Math.exp(rng.normal(talentShift, 0.33)), 0.45, 2.6);
  const level = clamp(0.85 + (ovr - 50) / 250, 0.7, 1.05); // lower-league players keep most of the room
  const prodigy = clamp((ovr - (45 + (age - 17) * 3)) / 60, 0, 0.35); // already good for their age
  return clamp(Math.round(ovr + ageRoom(age) * talent * (level + prodigy)), ovr, RATING_MAX);
}

const ageAt = (birth: string | undefined, date: string) => (birth ? (new Date(date).getTime() - new Date(birth).getTime()) / (365.25 * 864e5) : 22);

/** Put one player's ceiling on the 0..200 scale (once; never lowers it). Deterministic per player. */
export function upgradePotential(p: Player, date: string) {
  if (p.ratingScale === RATING_MAX) return;
  const rng = new RNG(hashString(`${p.id}|potential`));
  p.hidden.potential = Math.max(p.hidden.potential, rollPotential(overall(p.attributes, p.role), ageAt(p.birthdate, date), rng));
  p.ratingScale = RATING_MAX;
}

/** New games, saves from before the 0..200 scale, players generated on the old scale. */
export function ensureRatingScale(state: GameState) {
  for (const p of Object.values(state.players)) if (p.ratingScale !== RATING_MAX) upgradePotential(p, state.date);
}

/** Unrealised room fades from the mid-twenties (yearly). */
export function settlePotential(p: Player, age: number) {
  const ovr = overall(p.attributes, p.role);
  const room = p.hidden.potential - ovr;
  if (age <= 25 || room <= 0) return;
  p.hidden.potential = Math.max(ovr, p.hidden.potential - Math.max(1, room * (age > 28 ? 0.35 : 0.2)));
}

/**
 * Winning lifts a ceiling that has nearly been reached: `amount` is the full push for a player sitting at their
 * ceiling (it tapers off as room opens up). Called after official wins and titles.
 */
export function breakthrough(p: Player, amount: number) {
  const room = p.hidden.potential - overall(p.attributes, p.role);
  if (room >= 8 || amount <= 0) return;
  p.hidden.potential = Math.min(RATING_MAX, p.hidden.potential + amount * (1 - Math.max(0, room) / 8));
}
