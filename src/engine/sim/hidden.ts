// Hidden attributes & traits inside a match: tilt, snowball / comeback form,
// punishable mistakes, and big-stage effects. Far-sight macro lives in ai.ts (endgame calls).
import { clamp } from '../../util/rng';
import { clampSimStat, lack } from '../ratings';
import { ascension } from '../mastery';
import { dist, FOUNTAIN, lanePoint, type Side } from './map';
import type { MatchSim } from './engine';
import type { SimChamp, SimPlayerInput } from './simtypes';
import { applyMoreTraitInputs, traitSd, traitPerfBonus, traitFloor, traitForm, traitTiltMul, traitCalm } from './traitSim';

export const has = (c: SimChamp | SimPlayerInput, trait: string) => ('input' in c ? c.input.traits : c.traits).includes(trait);

/** Trait adjustments applied once to a player's effective ratings at game start. */
export function applyTraitInputs(p: SimPlayerInput): SimPlayerInput {
  const q = { ...p };
  const t = new Set(p.traits);
  if (t.has('lane_kingdom')) q.lane = clampSimStat('lane', q.lane + 6);
  if (t.has('farming_machine')) q.farm = clampSimStat('farm', q.farm + 5);
  if (t.has('vision_wizard')) q.vision = clampSimStat('vision', q.vision + 8);
  if (t.has('teamfight_maestro')) q.tf = clampSimStat('tf', q.tf + 5);
  if (t.has('shotcaller')) q.shotcalling = clampSimStat('shotcalling', q.shotcalling + 5);
  if (t.has('veteran')) q.macro = clampSimStat('macro', q.macro + 2);
  if (t.has('coinflip')) q.aggression = Math.min(99, q.aggression + 10);
  if (t.has('baron_thief')) q.obj = clampSimStat('obj', q.obj + 8);
  if (t.has('game_ender')) q.farsight = Math.max(q.farsight, 86);
  if (t.has('throw_merchant')) q.mistakes = Math.max(q.mistakes, 62);
  if (t.has('comeback_king')) q.resilience = Math.max(q.resilience, 82);
  if (t.has('snowballer')) q.snowball = Math.max(q.snowball, 82);
  if (t.has('tilter')) q.composure = Math.min(q.composure, 25);
  return applyMoreTraitInputs(q); // extended traits (traitsMore.ts)
}

/** Base performance multiplier for this game (consistency variance, big-stage traits). */
export function rollPerf(sim: MatchSim, p: SimPlayerInput): number {
  let sd = lack(p.consistency) / 100 * 0.09;
  if (has(p, 'coinflip')) sd *= 2;
  sd *= traitSd(p);
  let perf = 1 + sim.rng.normal(0, sd);
  if (sim.bigMatch) {
    perf += (Math.min(p.clutch, 120) - 60) / 100 * 0.05;
    if (has(p, 'ice_veins')) perf += 0.035;
    if (has(p, 'big_stage_nerves')) perf -= 0.045;
    if (has(p, 'rookie')) perf -= 0.015;
    if (has(p, 'veteran')) perf += 0.01;
  }
  perf = traitFloor(p, perf + traitPerfBonus(sim, p)); // extended traits: specialists, matchups, big stage…
  return clamp(perf, 0.78, 1.18);
}

/** Recompute in-game form every few seconds: tilt from deaths, playing from ahead/behind. */
export function updateForm(sim: MatchSim, c: SimChamp, dt: number) {
  c.tilt = Math.max(0, c.tilt - 0.0012 * dt * traitCalm(c));
  const myGold = sim.champs.filter((x) => x.side === c.side).reduce((s, x) => s + x.goldEarned, 0);
  const theirGold = sim.champs.filter((x) => x.side !== c.side).reduce((s, x) => s + x.goldEarned, 0);
  const lead = clamp((myGold - theirGold) / 8000, -1, 1);
  let f = 1;
  if (lead > 0) f += lead * (c.input.snowball - 50) / 100 * 0.08;
  else f += -lead * (c.input.resilience - 50) / 100 * 0.08;
  // carry mentality: wants the gold, sulks without it
  if (has(c, 'carry_mentality')) {
    const share = c.goldEarned / Math.max(1, myGold);
    f += share > 0.24 ? 0.02 : share < 0.18 ? -0.03 : 0;
  }
  f += traitForm(sim, c, lead); // extended traits: early / late game, closing, fighting from behind
  // lore: the destined side rises the further behind it falls; the other side feels history closing
  // in, and every time the Nexus refuses to fall it cracks a little more
  if (sim.destiny !== null) {
    if (c.side === sim.destiny) f += 0.05 + Math.max(0, -lead) * 0.16;
    else f -= 0.02 + sim.curse * 0.12;
  }
  // cheat: a throwing team stays tilted and plays far below itself
  const throwing = sim.throwSide === c.side;
  if (throwing) { f -= 0.55; c.tilt = Math.max(c.tilt, 0.3); }
  c.perf = clamp(c.basePerf * f * (1 - c.tilt), throwing ? 0.2 : sim.destiny !== null ? 0.6 : 0.7, throwing ? 0.35 : sim.destiny !== null ? 1.3 : 1.22);
}

export function onDeathTilt(c: SimChamp) {
  const t = (1 - c.input.composure / 100) * 0.03 * (has(c, 'tilter') ? 2.2 : 1) * traitTiltMul(c);
  c.tilt = Math.min(0.15, c.tilt + t);
}

/**
 * Punishable mistakes. Called on each decision; with a small probability (scaled by the
 * hidden "mistakes" attribute, more often late for throw merchants) the champion starts a
 * mistake: face-checking fog, overextending a side lane, blowing Flash, or a bad engage.
 */
export function maybeMistake(sim: MatchSim, c: SimChamp): boolean {
  const t = sim.t;
  if (c.mistakeUntil > t) return true;
  if (t < 150 || c.dead) return false;
  const m = c.input.mistakes / 100;
  let p = 0.00011 * (m / 0.4) ** 2 * (1 + c.tilt * 6);
  if (has(c, 'throw_merchant') && t > 1680) p *= 2.5;
  if (has(c, 'coinflip')) p *= 1.4;
  if (has(c, 'survivor')) p *= 0.5;
  if (sim.throwSide === c.side) p *= 3; // cheat: the throw is on
  p *= 1 - ascension(c.input.mastery) * 0.35; // fewer mistakes on a champion they know inside out
  if (!sim.rng.chance(p)) return false;
  const enemy = (1 - c.side) as Side;
  const kinds = ['facecheck', 'overextend', 'flash', 'engage'];
  const kind = sim.rng.pick(kinds);
  const tm = sim.teams[c.side];
  switch (kind) {
    case 'facecheck': {
      // walk into the fog toward where enemies were last seen
      let target = null as null | { x: number; y: number };
      for (const [idx, seen] of tm.lastSeen) if (!sim.isVisibleTo(c.side, idx) && sim.t - seen.t < 25 && !sim.champs[idx].dead) { target = seen.pos; break; }
      if (!target) return false;
      sim.setDest(c, target);
      c.mistakeUntil = t + 6; c.mistakeKind = 'facecheck';
      if (sim.enemiesOf(c.side).some((e) => !e.dead && dist(e.pos, target!) < 1500)) sim.event('info', `${c.input.name} face-checks into the fog...`, c.side);
      return true;
    }
    case 'overextend': {
      if (c.role === 'support' || c.role === 'jungle') return false;
      const lane = c.task.lane ?? 'bot';
      sim.setDest(c, lanePoint(lane, enemy === 1 ? 0.78 : 0.22));
      c.mistakeUntil = t + 12; c.mistakeKind = 'overextend';
      return true;
    }
    case 'flash': {
      if (c.flashReadyAt > t) return false;
      c.flashReadyAt = t + 300;
      sim.analyst?.onMistakeStart(c, 'flash');
      if (sim.rng.chance(0.5)) sim.event('info', `${c.input.name} burns Flash for nothing`, c.side);
      return false;
    }
    case 'engage': {
      const near = sim.enemiesOf(c.side).filter((e) => !e.dead && dist(e.pos, c.pos) < 1400 && sim.isVisibleTo(c.side, e.idx));
      if (!near.length || dist(c.pos, FOUNTAIN[c.side]) < 3000) return false;
      c.combatTarget = near[0].idx; c.tradeUntil = t + 5; c.tradeMode = false;
      c.mistakeUntil = t + 4; c.mistakeKind = 'engage';
      sim.event('info', `${c.input.name} goes in alone on ${near[0].input.name}!`, c.side);
      return true;
    }
  }
  return false;
}
