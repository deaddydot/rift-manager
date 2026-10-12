// Player rating scale: skill attributes, overall and potential run 1..200.
//   ~35–50 tier-3 regulars · ~50–65 tier-2 · ~65–90 tier-1 · 90–100 the best players in the world today
//   100+ beyond anything seen so far · 200 the ceiling (only a once-in-a-generation talent, developed perfectly).
// Aggression is a style dial, not a skill, and stays 1..99; hidden personality stats (composure, ego…) stay 1..99.
import { clamp } from '../util/rng';
import type { GameState, PlayerAttributes, Role } from './types';
import { ROLES } from './types';

export const RATING_MAX = 200;
export const clampRating = (v: number) => clamp(v, 1, RATING_MAX);

/** Attribute weights of the overall rating per role. */
export const ROLE_WEIGHTS: Record<Role, Partial<Record<keyof PlayerAttributes, number>>> = {
  top: { mechanics: 0.22, laning: 0.22, teamfight: 0.16, farming: 0.12, macro: 0.12, consistency: 0.08, vision: 0.04, objectives: 0.04 },
  jungle: { pathing: 0.2, objectives: 0.15, macro: 0.17, mechanics: 0.15, teamfight: 0.13, vision: 0.1, farming: 0.05, consistency: 0.05 },
  mid: { mechanics: 0.24, laning: 0.2, teamfight: 0.15, macro: 0.14, farming: 0.1, consistency: 0.07, pathing: 0.05, vision: 0.05 },
  adc: { mechanics: 0.24, teamfight: 0.22, farming: 0.16, laning: 0.16, consistency: 0.1, macro: 0.08, vision: 0.04 },
  support: { vision: 0.18, teamfight: 0.18, macro: 0.16, laning: 0.12, mechanics: 0.12, pathing: 0.1, shotcalling: 0.08, consistency: 0.06 },
};

/** Overall rating for a role: weighted mean of the attributes that matter there. */
export function overall(a: PlayerAttributes, role: Role): number {
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(ROLE_WEIGHTS[role])) { s += a[k as keyof PlayerAttributes] * v!; t += v!; }
  return Math.round(s / t);
}

/** Ceiling of simRating(): the match engine never sees a stat above this. */
export const SIM_RATING_MAX = 150;
/**
 * What a rating is worth inside a match. Unchanged up to 100 (the range the match engine is tuned on); above it
 * every point still helps but a little less: 110 → 109, 120 → 116.5, 150 → 132, 200 → 143.
 */
export function simRating(r: number) {
  return r <= 100 ? r : 100 + (SIM_RATING_MAX - 100) * (1 - Math.exp(-(r - 100) / (SIM_RATING_MAX - 100)));
}

/** Skill inputs of the match engine (on the simRating scale; aggression & hidden stats stay 1..99). */
export const SIM_SKILLS = new Set(['mech', 'lane', 'farm', 'tf', 'macro', 'vision', 'pathing', 'obj', 'consistency', 'clutch', 'shotcalling']);
/** Clamp for a match-engine input: skills to 1..SIM_RATING_MAX, comfort 1..200, everything else 1..99. */
export const clampSimStat = (k: string, v: number) => clamp(v, 1, SIM_SKILLS.has(k) ? SIM_RATING_MAX : k === 'mastery' ? 200 : 99);
/** "How far below 100" for the engine's noise / hesitation terms; never negative for players above 100. */
export const lack = (v: number) => Math.max(0, 100 - v);

/** Economic weight of a rating (salaries, fees): as-is up to 90, then slower — 100 → 93.5, 150 → 104.7, 200 → 108.5. */
export function econRating(r: number) {
  return Math.min(r, 90) + Math.max(0, simRating(r) - 90) * 0.35;
}

export interface RatingBand { min: number; label: string; color: string; blurb: string }
/** Highest first. Colours below 100 match the long-standing rating colours. */
export const RATING_BANDS: RatingBand[] = [
  { min: 180, label: 'Immortal', color: '#fff4c2', blurb: 'the ceiling of the game' },
  { min: 150, label: 'Mythic', color: '#f472b6', blurb: 'a once-in-a-generation player at their peak' },
  { min: 125, label: 'Legendary', color: '#a78bfa', blurb: 'dynasty-defining' },
  { min: 100, label: 'Elite', color: '#38bdf8', blurb: 'better than anyone playing in 2026' },
  { min: 88, label: 'World-class', color: '#f0c674', blurb: 'among the best in the world' },
  { min: 80, label: 'Star', color: '#22c55e', blurb: 'a star of a major league' },
  { min: 70, label: 'Major league', color: '#84cc16', blurb: 'a solid tier-1 starter' },
  { min: 60, label: 'Fringe major', color: '#eab308', blurb: 'tier-1 depth or a top tier-2 player' },
  { min: 50, label: 'Pro', color: '#f97316', blurb: 'a tier-2 regular' },
  { min: 0, label: 'Semi-pro', color: '#ef4444', blurb: 'tier-3 / amateur level' },
];
export const ratingBand = (v: number): RatingBand => RATING_BANDS.find((b) => v >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];

// ------------------------------------------------------------------ the world's level
/**
 * Median starter overall in tier-1 and tier-2 leagues right now (cached per day). Players develop on the 0..200
 * scale, so "good enough for a major league" follows the world instead of fixed 2026 numbers (64 / 44 at the start).
 */
const levelsCache = new WeakMap<GameState, { date: string; t1: number; t2: number }>();
export function worldLevels(state: GameState): { t1: number; t2: number } {
  const c = levelsCache.get(state);
  if (c && c.date === state.date) return c;
  const xs: [number[], number[]] = [[], []];
  for (const t of Object.values(state.teams)) {
    const tier = state.leagues[t.leagueId]?.tier ?? 3;
    if (tier > 2) continue;
    for (const r of ROLES) { const p = t.lineup[r] ? state.players[t.lineup[r]!] : undefined; if (p) xs[tier - 1].push(overall(p.attributes, r)); }
  }
  const med = (a: number[], d: number) => (a.length >= 20 ? a.sort((x, y) => x - y)[a.length >> 1] : d);
  const out = { date: state.date, t1: Math.max(64, med(xs[0], 64)), t2: Math.max(44, med(xs[1], 44)) };
  levelsCache.set(state, out);
  return out;
}

/**
 * How far tier-1 starters have moved past 2026 (median 64). Wages and market values follow a player's standing in
 * the market, not the raw number — a world that develops as a whole doesn't multiply every payroll.
 */
export const marketDrift = (state: GameState) => Math.max(0, worldLevels(state).t1 - 64);
