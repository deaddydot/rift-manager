// Match-engine side of the extended traits (traitsMore.ts). Everything is expressed through the levers the
// engine already exposes in sim/hidden.ts: rating deltas at game start, the per-game performance roll and its
// variance, in-game form (time / lead dependent) and death tilt. No RNG is consumed here, so games with no
// extended traits (e.g. scripts/sim-test.ts) play out exactly as before.
import { clamp } from '../../util/rng';
import { gd, matchupEdge } from '../../data/gamedata';
import { metaScore } from '../draft/draft';
import { TRAIT_SPECS, fxTotal, type FxTotal, type SimStat } from '../traitsMore';
import type { Role } from '../types';
import type { MatchSim } from './engine';
import type { SimChamp, SimPlayerInput } from './simtypes';
import { clampSimStat } from '../ratings';

export interface SimTraitProfile {
  any: boolean;
  perf: number; big: number; small: number; sd: number; floor: boolean;
  early: number; late: number; long: number; closing: number; behind: number;
  tilt: number; calm: number;
  champ: { arch: string[]; perf: number }[];
  meta: number; masteryLo: number; masteryHi: number; matchupBad: number; stronger: number; weaker: number;
}

const EMPTY: SimTraitProfile = {
  any: false, perf: 0, big: 0, small: 0, sd: 1, floor: false, early: 0, late: 0, long: 0, closing: 0, behind: 0, tilt: 1, calm: 1,
  champ: [], meta: 0, masteryLo: 0, masteryHi: 0, matchupBad: 0, stronger: 0, weaker: 0,
};

const cache = new WeakMap<FxTotal, SimTraitProfile>();
/** Aggregate the sim effects of a trait list (unknown / original traits are ignored — hidden.ts handles those). Cached. */
export function profileOf(traits: readonly string[]): SimTraitProfile {
  const t = fxTotal(traits);
  if (!t.any) return EMPTY;
  let q = cache.get(t);
  if (q) return q;
  const n = t.num;
  q = {
    any: true, perf: n.perf, big: n.big, small: n.small, sd: n.sd, floor: false, early: n.early, late: n.late, long: n.long, closing: n.closing, behind: n.behind,
    tilt: n.tilt, calm: n.calm, champ: [], meta: n.meta, masteryLo: 0, masteryHi: 0, matchupBad: 0, stronger: 0, weaker: 0,
  };
  for (const { fx } of t.list) {
    q.floor ||= !!fx.floor;
    if (fx.champ) q.champ.push(fx.champ);
    q.masteryLo += fx.mastery?.lo ?? 0; q.masteryHi += fx.mastery?.hi ?? 0; q.matchupBad += fx.matchup?.bad ?? 0;
    q.stronger += fx.opp?.stronger ?? 0; q.weaker += fx.opp?.weaker ?? 0;
  }
  cache.set(t, q);
  return q;
}

const profiles = new WeakMap<SimPlayerInput, SimTraitProfile>();
export function simProfile(p: SimPlayerInput): SimTraitProfile {
  let q = profiles.get(p);
  if (!q) { q = profileOf(p.traits); profiles.set(p, q); }
  return q;
}

/** Rating deltas of the extended traits (called at the end of applyTraitInputs on its copy). */
export function applyMoreTraitInputs(q: SimPlayerInput): SimPlayerInput {
  for (const id of q.traits) {
    const d = TRAIT_SPECS[id]?.fx.in;
    if (!d) continue;
    for (const [k, v] of Object.entries(d) as [SimStat, number][]) q[k] = clampSimStat(k, q[k] + v);
  }
  return q;
}

/** Does a champion fit one of the archetype / class lists of a specialist trait? */
export function champFits(champId: string, arch: string[]): boolean {
  const c = gd().championById[champId];
  if (!c) return false;
  return (!!c.archetype && arch.includes(c.archetype)) || c.classes.some((k) => arch.includes(k));
}

export interface PerfCtx { champ: string; role: Role; mastery: number; oppChamp?: string; big: boolean; gap: number }

/**
 * Pre-game performance edge of a trait profile in context (shared by the full engine and the quick sim):
 * big-stage / regular, champion specialists, meta fit, mastery comfort, lane matchup, opponent strength.
 * `gap` = opponents' average rating minus ours.
 */
export function contextPerf(q: SimTraitProfile, x: PerfCtx): number {
  if (!q.any) return 0;
  let d = q.perf + (x.big ? q.big : q.small);
  for (const c of q.champ) if (champFits(x.champ, c.arch)) d += c.perf;
  if (q.meta) d += q.meta * clamp((metaScore(x.champ, x.role) - 0.42) / 0.25, -1, 1);
  if (x.mastery < 110) d += q.masteryLo; // below pro-ready comfort (0..200 scale)
  else if (x.mastery >= 160) d += q.masteryHi;
  if (q.matchupBad && x.oppChamp && x.role !== 'jungle') {
    const e = matchupEdge(x.champ, x.oppChamp, x.role);
    if (e < 0) d += -e * q.matchupBad;
  }
  if (x.gap >= 3) d += q.stronger;
  else if (x.gap <= -3) d += q.weaker;
  return d;
}

const strength = (ps: SimPlayerInput[]) => ps.reduce((s, p) => s + (p.mech + p.lane + p.tf + p.macro + p.farm) / 5, 0) / Math.max(1, ps.length);

/** Variance multiplier for the per-game performance roll. */
export const traitSd = (p: SimPlayerInput) => simProfile(p).sd;

/** Added to the per-game performance roll (rollPerf). */
export function traitPerfBonus(sim: MatchSim, p: SimPlayerInput): number {
  const q = simProfile(p);
  if (!q.any) return 0;
  const side = sim.teams.findIndex((t) => t.input.players.some((x) => x.playerId === p.playerId));
  const mine = sim.teams[side]?.input.players ?? [], theirs = sim.teams[1 - side]?.input.players ?? [];
  const oppChamp = theirs.find((x) => x.role === p.role)?.championId;
  return contextPerf(q, { champ: p.championId, role: p.role, mastery: p.mastery, oppChamp, big: sim.bigMatch, gap: theirs.length ? strength(theirs) - strength(mine) : 0 });
}

/** Floor Raiser: soften bad rolls. */
export function traitFloor(p: SimPlayerInput, perf: number): number {
  return simProfile(p).floor && perf < 0.97 ? 0.97 - (0.97 - perf) * 0.4 : perf;
}

/** In-game form delta (updateForm): game phase, closing out leads, fighting from behind. `lead` is -1..1. */
export function traitForm(sim: MatchSim, c: SimChamp, lead: number): number {
  const q = simProfile(c.input);
  if (!q.any) return 0;
  const t = sim.t;
  let f = 0;
  if (t < 840) f += q.early;
  if (t > 1680) { f += q.late; if (lead > 0.05) f += q.closing; }
  if (t > 2100) f += q.long;
  if (lead < 0) f += q.behind * Math.min(1, -lead * 2);
  return f;
}

/** Multiplier on tilt gained per death. */
export const traitTiltMul = (c: SimChamp) => simProfile(c.input).tilt;
/** Multiplier on tilt recovery over time. */
export const traitCalm = (c: SimChamp) => simProfile(c.input).calm;
