// Champion comfort ("mastery"), 0..200 per champion.
//   ~100  can operate it like a solid soloQ player: knows the combos, the spikes, the basic matchups
//   ~130  pro-ready: matchup knowledge, wave and trading patterns, plays it on stage without thinking
//   165+  signature: their own tricks, every matchup solved, the split-second flash-ult that swings games
//   200   the best anyone has ever played it
// The draft and both match sims read it as a fraction (value / 200); above 100 the match engine adds the
// "ascended" effects (precision, flash plays, matchup knowledge, fewer mistakes on that champion).
import type { GameState, Player, PlayerAttributes } from './types';

export const MASTERY_MAX = 200;
/** Default comfort on a champion a player has never touched (in their role). */
export const MASTERY_UNKNOWN = 70;

export interface MasteryTier { min: number; label: string; color: string }
export const MASTERY_TIERS: MasteryTier[] = [
  { min: 190, label: 'Ascended', color: '#f0c674' },
  { min: 165, label: 'Signature', color: '#facc15' },
  { min: 130, label: 'Mastered', color: '#22c55e' },
  { min: 100, label: 'Comfortable', color: '#84cc16' },
  { min: 60, label: 'Learning', color: '#eab308' },
  { min: 0, label: 'Unfamiliar', color: '#ef4444' },
];
export const masteryTier = (v: number): MasteryTier => MASTERY_TIERS.find((t) => v >= t.min) ?? MASTERY_TIERS[MASTERY_TIERS.length - 1];
/** 0..1 beyond solid soloQ level — what makes a signature pick more than "comfortable". */
export const ascension = (v: number) => Math.max(0, Math.min(1, (v - 100) / 100));

const roughOvr = (a: PlayerAttributes) => {
  const ks = (Object.keys(a) as (keyof PlayerAttributes)[]).filter((k) => k !== 'aggression');
  return ks.reduce((s, k) => s + a[k], 0) / ks.length;
};

/**
 * Convert a pool from the old 0..100 scale. How far up the 200 scale a player's best champions reach
 * depends on how good the player is: a world-class mid's signature picks land near 190, a tier-3 laner's
 * best champions around 130 (pro-ready, nothing more).
 */
export function upgradeMasteryScale(p: Player) {
  if (p.masteryScale === MASTERY_MAX) return;
  // years on stage and trophies won are thousands of games on these champions: legends' signature picks
  // sit at the very top of the scale even after their peak
  // (reputation carries that history for real players; careers played in the save add to it)
  const seasons = p.career?.length ?? 0, titles = (p.career ?? []).reduce((n, c) => n + (c.titles?.length ?? 0), 0);
  const legacy = Math.min(22, Math.max(0, (p.reputation ?? 0) - 72) * 0.75 + seasons * 0.5 + titles * 1);
  const reach = Math.max(118, Math.min(197, 125 + (roughOvr(p.attributes) - 50) * 1.6 + legacy));
  for (const [cid, v] of Object.entries(p.champions)) {
    const nv = v <= 40 ? v * 1.75 : 70 + (Math.min(99, v) - 40) / 59 * (reach - 70);
    p.champions[cid] = Math.max(1, Math.min(MASTERY_MAX, Math.round(nv)));
  }
  p.masteryScale = MASTERY_MAX;
}

/** Bring every player onto the 0..200 scale (new games, old saves, players generated on the old scale). */
export function ensureMasteryScale(state: GameState) {
  for (const p of Object.values(state.players)) if (p.masteryScale !== MASTERY_MAX) upgradeMasteryScale(p);
}

/** Comfort gained from one pro game on the champion: quick up to soloQ level, slow towards signature. */
export function masteryGain(cur: number, won: boolean) {
  const g = (won ? 1.6 : 0.9) * Math.max(0.12, 1 - cur / 215);
  return Math.min(MASTERY_MAX, cur + g);
}
