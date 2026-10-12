// Dashes, blinks and leaps (per-champion data: src/data/dashData.ts).
//  dash  travels along the ground at its speed: stops at walls, a hard CC on the way stops it
//  leap  an arc that crosses terrain;  blink  instant, crosses terrain
// Champions use them the way pros do: to engage onto a target, chase a runner, kite away from a diver, peel
// for a teammate and escape — each from the ability's own cooldown, with recast charges where the kit has them.
import type { MatchSim } from './engine';
import type { SimChamp, SimAbility } from './simtypes';
import { DASHES, type DashDef } from '../../data/dashData';
import { dist, lanePoint, FOUNTAIN, type Vec } from './map';
import { TOWER_RANGE } from './constants';
import { gd } from '../../data/gamedata';
import { cooldownOf } from './combat';

export interface DashState { def: DashDef; charges: number; recastUntil: number }
export interface Dashing { from: Vec; to: Vec; start: number; end: number; kind: DashDef['kind']; name: string }

const DEFAULT_SPEED = 1500;

export function dashesFor(champId: string): DashState[] {
  // map-wide relocations (Shen R, TF R, Ryze R, Taliyah R…) are map plays (globals.ts), not fight dashes
  return (DASHES[champId] ?? []).filter((def) => def.range <= 2500).map((def) => ({ def, charges: def.charges ?? 1, recastUntil: 0 }));
}

const abilityOf = (c: SimChamp, slot: DashDef['slot']): SimAbility | undefined => (slot === 'P' ? undefined : c.abilities.find((a) => a.slot === slot));

/** Ready to dash now: the ability is off cooldown (and learned), or a recast charge is still open. */
function ready(sim: MatchSim, c: SimChamp, d: DashState): boolean {
  if (d.recastUntil > sim.t && d.charges > 0) return true;
  if (d.def.slot === 'P') return true;
  const a = abilityOf(c, d.def.slot);
  return !!a && !!c.ranks[a.slot] && a.cdUntil <= sim.t;
}

/** Spend one use: the first use of a multi-charge dash opens its recast window; the ability goes on cooldown when the charges run out. */
function spend(sim: MatchSim, c: SimChamp, d: DashState) {
  const a = abilityOf(c, d.def.slot);
  const max = d.def.charges ?? 1;
  if (d.recastUntil <= sim.t || d.charges <= 0) { d.charges = max; d.recastUntil = sim.t + (d.def.recastWindow ?? 0); }
  d.charges--;
  if (a && d.charges <= 0) { a.cdUntil = sim.t + (d.def.cooldown ? cooldownOf(c, { ...a, cooldown: d.def.cooldown }) : cooldownOf(c, a)); d.recastUntil = 0; }
  else if (a && max > 1 && d.charges === max - 1) a.cdUntil = sim.t + 0.4; // brief gap between recasts
  if (d.def.slot === 'P') c.passiveDashAt = sim.t + 1.2;
}

/** Where a dash from `from` toward `to` actually ends: ground dashes stop at the first wall. */
function landing(from: Vec, to: Vec, def: DashDef): Vec {
  const nav = gd().nav;
  const crosses = def.kind !== 'dash' || def.overWalls;
  if (crosses) return nav.walkable(to) ? to : nav.snap(to);
  if (nav.los(from, to) && nav.walkable(to)) return to;
  // walk the line until it hits terrain
  const l = dist(from, to);
  let last = from;
  for (let s = 60; s <= l; s += 60) {
    const p = { x: from.x + (to.x - from.x) * s / l, y: from.y + (to.y - from.y) * s / l };
    if (!nav.walkable(p)) break;
    last = p;
  }
  return nav.walkable(last) ? last : nav.snap(last);
}

/** Start the movement (and the visuals). */
export function startDash(sim: MatchSim, c: SimChamp, to: Vec, d: DashState, why: string) {
  const end = landing(c.pos, to, d.def);
  const len = dist(c.pos, end);
  if (len < 80) return false;
  spend(sim, c, d);
  const from = { ...c.pos };
  c.path = []; c.dest = null;
  if (d.def.kind === 'blink') {
    c.pos = end;
    c.fx.push({ kind: 'flash', until: sim.t + 0.5, color: '#e9d5ff' });
  } else {
    const dur = Math.max(0.12, len / (d.def.speed ?? DEFAULT_SPEED));
    c.dashing = { from, to: end, start: sim.t, end: sim.t + dur, kind: d.def.kind, name: d.def.name };
  }
  c.fx.push({ kind: 'dash', until: sim.t + 0.5, to: end });
  sim.dbg(c, 'fight', `${d.def.name}: ${why} (${Math.round(len)} units${d.def.kind === 'blink' ? ', blink' : ''})`);
  return true;
}

/** Advance a dash in progress (from MatchSim.move). Returns true while still dashing. */
export function stepDash(sim: MatchSim, c: SimChamp): boolean {
  const m = c.dashing;
  if (!m) return false;
  if (sim.t >= m.end) { c.pos = { ...m.to }; c.dashing = undefined; return false; }
  const f = (sim.t - m.start) / Math.max(0.01, m.end - m.start);
  c.pos = { x: m.from.x + (m.to.x - m.from.x) * f, y: m.from.y + (m.to.y - m.from.y) * f };
  return true;
}

/** A hard CC lands mid-dash: ground dashes stop where they are (leaps and blinks can't be stopped). */
export function interruptDash(c: SimChamp) {
  if (c.dashing && c.dashing.kind === 'dash') c.dashing = undefined;
}

const toward = (a: Vec, b: Vec, len: number): Vec => { const l = dist(a, b) || 1; return { x: a.x + (b.x - a.x) / l * len, y: a.y + (b.y - a.y) / l * len }; };
const underEnemyTower = (sim: MatchSim, c: SimChamp, p: Vec) => sim.towers.some((tw) => tw.alive && tw.def.side !== c.side && dist(tw.def.pos, p) < TOWER_RANGE);
const has = (d: DashDef, u: DashDef['use'][number]) => d.use.includes(u);
const needsWall = (def: DashDef) => def.target === 'wall';
function wallNear(p: Vec, r: number): boolean {
  const nav = gd().nav;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (!nav.walkable({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r })) return true; }
  return false;
}

/**
 * Offensive dash as part of an ability cast on `e` (combat loop): returns true if the champion dashed.
 * Engage / gap-close onto the target, or — for kiting dashes — reposition to keep spacing.
 */
export function castDash(sim: MatchSim, c: SimChamp, slot: SimAbility['slot'], e: SimChamp, killable: boolean): boolean {
  const ds = c.dashes?.find((x) => x.def.slot === slot);
  if (!ds || c.dashing || (c.rootUntil ?? 0) > sim.t) return false;
  const def = ds.def, d = dist(c.pos, e.pos);
  const melee = c.champ.attackType === 'melee';
  if (needsWall(def) && !wallNear(c.pos, Math.min(def.range, 500))) return false;
  if (has(def, 'engage') || has(def, 'gapclose') || has(def, 'chase')) {
    if (d <= c.stats.range + 60) return false;                                 // already in range: no need to move
    if (def.target === 'enemy' || def.target === 'unit' || def.stopsAtTarget) {
      if (d > def.range + 80) return false;
      const to = toward(e.pos, c.pos, melee ? 90 : Math.min(c.stats.range * 0.7, 300));
      if (underEnemyTower(sim, c, to) && !killable && !((c.diveUntil ?? 0) > sim.t)) return false;
      return startDash(sim, c, to, ds, `onto ${e.input.name}`);
    }
    if (def.target === 'point') {
      const want = melee ? d - 90 : d - c.stats.range * 0.8;
      if (want < 120) return false;
      const to = toward(c.pos, e.pos, Math.min(def.range, want));
      if (underEnemyTower(sim, c, to) && !killable && !((c.diveUntil ?? 0) > sim.t)) return false;
      return startDash(sim, c, to, ds, `closing on ${e.input.name}`);
    }
  }
  if (has(def, 'reposition') && !melee) {
    // kiting: step back from whoever is closest to us while staying in range of the target
    const diver = sim.champs.filter((x) => x.side !== c.side && !x.dead && x.champ.attackType === 'melee' && dist(x.pos, c.pos) < 380).sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0];
    if (!diver) return false;
    const back = toward(c.pos, diver.pos, -Math.min(def.range, 420));
    return startDash(sim, c, back, ds, `kiting ${diver.input.name}`);
  }
  return false;
}

/** Movement-only chase: a runner just out of reach and we can finish them (no damage on the dash itself). */
export function chaseDash(sim: MatchSim, c: SimChamp, e: SimChamp, killable: boolean): boolean {
  if (!c.dashes?.length || c.dashing || (c.rootUntil ?? 0) > sim.t || !killable) return false;
  const d = dist(c.pos, e.pos);
  if (d <= c.stats.range + 80) return false;
  for (const ds of c.dashes) {
    const def = ds.def;
    if (!(has(def, 'chase') || has(def, 'gapclose')) || !ready(sim, c, ds) || needsWall(def)) continue;
    if (def.target === 'ally') continue;
    if (d > def.range + c.stats.range) continue;
    const to = toward(c.pos, e.pos, Math.min(def.range, d - (c.champ.attackType === 'melee' ? 90 : c.stats.range * 0.8)));
    if (underEnemyTower(sim, c, to) && e.hp > 0 && !((c.diveUntil ?? 0) > sim.t) && e.hp > c.stats.ad * 2) continue;
    if (startDash(sim, c, to, ds, `chasing ${e.input.name}`)) return true;
  }
  return false;
}

/** Escape: someone is on us and we're running — dash/blink/leap toward safety (over a wall if the kit allows). */
export function escapeDash(sim: MatchSim, c: SimChamp, safe: Vec): boolean {
  if (!c.dashes?.length || c.dashing || (c.rootUntil ?? 0) > sim.t || c.ccUntil > sim.t) return false;
  const close = sim.champs.filter((x) => x.side !== c.side && !x.dead && dist(x.pos, c.pos) < 650 && sim.isVisibleTo(c.side, x.idx));
  if (!close.length) return false;
  const hunted = close.some((x) => x.combatTarget === c.idx) || c.hp < c.stats.maxHp * 0.35;
  if (!hunted) return false;
  const goal = dist(c.pos, safe) > 200 ? safe : FOUNTAIN[c.side];
  for (const ds of c.dashes) {
    const def = ds.def;
    if (!has(def, 'escape') || !ready(sim, c, ds)) continue;
    if (def.target === 'enemy') continue;                                          // can't run away by dashing onto them
    if (def.target === 'ally') {
      const ally = sim.champs.filter((x) => x.side === c.side && x !== c && !x.dead && dist(x.pos, c.pos) < def.range && dist(x.pos, goal) < dist(c.pos, goal)).sort((a, b) => dist(a.pos, goal) - dist(b.pos, goal))[0];
      if (!ally) continue;
      if (startDash(sim, c, ally.pos, ds, `escaping to ${ally.input.name}`)) return true;
      continue;
    }
    if (def.target === 'unit') {
      // needs something to dash to: a minion wave or a monster camp roughly on the way
      const unit = [...sim.waves.map((w) => gd().nav.snap(lanePoint(w.lane, w.p))), ...sim.camps.filter((k) => k.alive).map((k) => k.def.pos)]
        .filter((p) => dist(p, c.pos) < def.range && dist(p, goal) < dist(c.pos, goal)).sort((a, b) => dist(a, goal) - dist(b, goal))[0];
      if (!unit) continue;
      if (startDash(sim, c, unit, ds, 'escaping')) return true;
      continue;
    }
    if (needsWall(def) && !wallNear(c.pos, Math.min(def.range, 500))) continue;
    if (startDash(sim, c, toward(c.pos, goal, def.range), ds, 'escaping')) return true;
  }
  return false;
}

/** Peel: dash to a teammate who is being dived (Braum W, Lee W, Shen R…). */
export function peelDash(sim: MatchSim, c: SimChamp): boolean {
  if (!c.dashes?.length || c.dashing || c.ccUntil > sim.t) return false;
  for (const ds of c.dashes) {
    const def = ds.def;
    if (def.target !== 'ally' || !ready(sim, c, ds)) continue;
    const ally = sim.champs.find((x) => x.side === c.side && x !== c && !x.dead && dist(x.pos, c.pos) < def.range && dist(x.pos, c.pos) > 300
      && x.hp < x.stats.maxHp * 0.6 && sim.champs.some((e) => e.side !== c.side && !e.dead && e.combatTarget === x.idx && dist(e.pos, x.pos) < 500));
    if (ally && startDash(sim, c, ally.pos, ds, `to protect ${ally.input.name}`)) return true;
  }
  return false;
}

/** Takedown: dashes that reset on kill come back (Irelia Q, Kha'Zix E…). */
export function onTakedown(sim: MatchSim, c: SimChamp) {
  for (const ds of c.dashes ?? []) {
    if (!ds.def.resetOnKill) continue;
    const a = abilityOf(c, ds.def.slot);
    if (a) a.cdUntil = Math.min(a.cdUntil, sim.t + 0.3);
  }
}

/** The ability ranges the cast loop should use for a dash ability (its reach is the dash plus the hit). */
export function dashReach(c: SimChamp, slot: SimAbility['slot']): number {
  const ds = c.dashes?.find((x) => x.def.slot === slot);
  return ds ? ds.def.range + (ds.def.stopsAtTarget || ds.def.target === 'enemy' ? 60 : c.stats.range) : 0;
}

