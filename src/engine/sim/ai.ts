// Decision making: team macro (objectives, sieges, rotations, lane swaps) and
// champion micro (laning, trading, farming, ganking, fighting, fleeing, recalling, warding).
// Player attributes drive decision quality throughout.
import { clamp, sigmoid } from '../../util/rng';
import { escapeDash, peelDash } from './dash';
import {
  type Vec, type Side, type Lane, LANES, FOUNTAIN, CAMPS, DRAGON_PIT, BARON_PIT, WARD_SPOTS, NEXUS,
  lanePoint, laneProgress, laneDistance, dist, dist2, nearestLane,
} from './map';
import { T, TOWER_RANGE } from './constants';
import type { MatchSim } from './engine';
import type { SimChamp, Task, ObjectiveKind, SimTower, TeamRuntime } from './simtypes';
import { dpsEstimate, burstEstimate, dealDamage } from './combat';
import { gd, matchupEdge } from '../../data/gamedata';
import { maybeMistake, has } from './hidden';
import { mapPlays, joinUlt, JOIN_ULT_CHAMPS } from './globals';
import { lack } from '../ratings';

// ------------------------------------------------------------------ evaluation helpers
export function champPower(c: SimChamp): number {
  if (c.dead) return 0;
  const s = c.stats;
  const ehp = (c.hp + c.shield) * (1 + (s.armor + s.mr) / 220);
  const dps = dpsEstimate(c);
  const prof = c.champ.profile;
  const util = 1 + (prof.cc + prof.engage + prof.peel) / 60;
  return Math.sqrt(ehp * dps) * util * (0.85 + c.input.tf / 100 * 0.3) * c.perf;
}

function groupPower(list: SimChamp[]) {
  let p = 0;
  for (const c of list) p += champPower(c);
  return p;
}

function towerSupport(sim: MatchSim, side: Side, p: Vec): number {
  let best = 0;
  for (const tw of sim.towers) {
    if (!tw.alive || tw.def.side !== side) continue;
    const d = dist(tw.def.pos, p);
    if (d < TOWER_RANGE + 250) best = Math.max(best, 1 - d / (TOWER_RANGE + 250));
  }
  // towers matter a lot early, less later
  const scale = sim.t < 840 ? 1.1 : sim.t < 1500 ? 0.8 : 0.5;
  return best * scale;
}

function nearEnemyTower(sim: MatchSim, side: Side, p: Vec, margin = 0): SimTower | null {
  for (const tw of sim.towers) if (tw.alive && tw.def.side !== side && dist2(tw.def.pos, p) < (TOWER_RANGE + margin) ** 2) return tw;
  return null;
}

/** Most advanced alive tower of `side` on a lane. */
function frontTower(sim: MatchSim, side: Side, lane: Lane): SimTower | null {
  const order = ['outer', 'inner', 'inhib'] as const;
  for (const tier of order) {
    const tw = sim.towers.find((x) => x.alive && x.def.side === side && x.def.lane === lane && x.def.tier === tier);
    if (tw) return tw;
  }
  return null;
}

/** Zoned: a step back from the usual spot toward our tower — still close enough to pick up some farm. */
function zonedSpot(sim: MatchSim, c: SimChamp, lane: Lane): Vec {
  const p = lanePosition(sim, c, lane);
  const len = lane === 'mid' ? 11800 : 20000;
  const g = laneProgress(lane, p) + (c.side === 0 ? -1 : 1) * 650 / len;
  const tw = frontTower(sim, c.side, lane);
  const towerG = tw ? laneProgress(lane, tw.def.pos) : (c.side === 0 ? 0.05 : 0.95);
  return lanePoint(lane, c.side === 0 ? Math.max(g, towerG - 0.01) : Math.min(g, towerG + 0.01));
}

/** Where a side's laners should stand: just behind their own wave front / the clash point. */
function lanePosition(sim: MatchSim, c: SimChamp, lane: Lane): Vec {
  const side = c.side;
  const mine = sim.waves.filter((w) => w.lane === lane && w.side === side);
  const theirs = sim.waves.filter((w) => w.lane === lane && w.side !== side);
  const myFront = mine.length ? (side === 0 ? Math.max(...mine.map((w) => w.p)) : Math.min(...mine.map((w) => w.p))) : null;
  const theirFront = theirs.length ? (side === 0 ? Math.min(...theirs.map((w) => w.p)) : Math.max(...theirs.map((w) => w.p))) : null;
  const myTower = frontTower(sim, side, lane);
  const towerP = myTower ? laneProgress(lane, myTower.def.pos) : side === 0 ? 0.05 : 0.95;
  // after laning: walk out to meet the incoming enemy wave (on our half / near our towers)
  if (sim.t > 840 && theirFront !== null) {
    // hard push: walk up to the wave wherever it is on our side of the map; careful: stay at the
    // edge of ability range and let deep waves come to us (the more alert, the further back)
    const depth = side === 0 ? theirFront : 1 - theirFront;
    const careful = c.waveIntent === 'careful';
    const limit = careful ? 0.6 - c.alert * 0.2 : c.waveIntent === 'push' ? 0.7 : 0.63;
    const len0 = lane === 'mid' ? 11800 : 20000;
    const ranged = c.champ.attackType === 'ranged';
    const reach = Math.max(c.stats.range + 200, 550);
    const back0 = careful ? Math.min(reach - 60, (ranged ? 450 : 250) + 150 + c.alert * 300) : (ranged ? 450 : 250) - (c.waveIntent === 'push' ? 60 : 0);
    const dir = side === 0 ? -1 : 1;
    if (depth <= limit) return lanePoint(lane, theirFront + dir * back0 / len0);
    if (careful) return lanePoint(lane, (side === 0 ? limit : 1 - limit) + dir * back0 / len0);
  }
  let p: number;
  if (myFront !== null && theirFront !== null) p = (myFront + theirFront) / 2;
  else if (myFront !== null) p = myFront;
  else if (theirFront !== null) p = theirFront;
  else p = side === 0 ? Math.max(towerP, 0.42) : Math.min(towerP, 0.58);
  // stand slightly behind the front; ranged further back, passive players further
  const ranged = c.champ.attackType === 'ranged';
  const back = (ranged ? 520 : 380) + (50 - c.input.aggression) * 3;
  const len = lane === 'mid' ? 11800 : 20000;
  p += (side === 0 ? -1 : 1) * back / len;
  // don't stand under the enemy tower without a wave tanking
  const enemyTower = frontTower(sim, (1 - side) as Side, lane);
  if (enemyTower) {
    const etp = laneProgress(lane, enemyTower.def.pos);
    const limit = etp + (side === 0 ? -1 : 1) * (TOWER_RANGE + 150) / len;
    const myWaveUnder = mine.some((w) => w.stopped && dist(lanePoint(lane, w.p), enemyTower.def.pos) < TOWER_RANGE + 200);
    if (myWaveUnder && sim.towerVulnerable(enemyTower)) {
      // our wave is tanking the tower: step in and hit it (plates!). The tower shoots minions first, so a
      // defender standing there only stops it if they'd win the trade we're offering by stepping up
      const defs = enemiesWithin(sim, side, enemyTower.def.pos, 1300, true);
      const mates = alliesWithin(sim, side, enemyTower.def.pos, 1500);
      const hpOk = c.hp > c.stats.maxHp * 0.55;
      if (defs.length === 0 || mates.length > defs.length + 1 || (hpOk && mates.length >= defs.length && groupPower(mates) >= groupPower(defs) * 1.05)) {
        const r = c.champ.attackType === 'ranged' ? c.stats.range * 0.85 : 160;
        return lanePoint(lane, etp + (side === 0 ? -1 : 1) * r / len);
      }
    }
    if (side === 0 ? p > limit : p < limit) {
      if (!myWaveUnder) p = limit;
    }
  }
  return lanePoint(lane, p);
}

function enemiesWithin(sim: MatchSim, side: Side, p: Vec, r: number, visibleOnly = false) {
  const out: SimChamp[] = [];
  for (const e of sim.champs) {
    if (e.side === side || e.dead) continue;
    if (visibleOnly && !sim.isVisibleTo(side, e.idx)) continue;
    if (dist2(e.pos, p) < r * r) out.push(e);
  }
  return out;
}
function alliesWithin(sim: MatchSim, side: Side, p: Vec, r: number) {
  const out: SimChamp[] = [];
  for (const e of sim.champs) if (e.side === side && !e.dead && dist2(e.pos, p) < r * r) out.push(e);
  return out;
}

const objPos = (k: ObjectiveKind) => (k === 'dragon' || k === 'elder' ? DRAGON_PIT : BARON_PIT);

/** Don't walk into a visibly bigger enemy group alone: wait for teammates first. */
function shouldRegroup(sim: MatchSim, c: SimChamp, target: Vec, lane?: Lane): Vec | null {
  const enemies = enemiesWithin(sim, c.side, target, 2600, true).length;
  if (enemies < 2) return null;
  const alliesThere = alliesWithin(sim, c.side, target, 2600).length;
  const alliesWithMe = alliesWithin(sim, c.side, c.pos, 1600).length; // includes self
  if (alliesThere + alliesWithMe - 1 >= enemies) return null;
  if (dist(c.pos, target) < 1800) return null; // already committed
  // discipline: poor macro players sometimes walk in alone instead of waiting for the team
  if (timingUniform(c, Math.floor(sim.t / 12) * 31 + 5) > 0.55 + c.input.macro / 220) return null;
  // wait on our side of the target: back down the lane for lane plays (a straight line to the
  // fountain would cut through the jungle and park the player next to a buff camp)
  if (lane) {
    const len = lane === 'mid' ? 11800 : 20000;
    const g = laneProgress(lane, target);
    return lanePoint(lane, clamp(g + (c.side === 0 ? -1 : 1) * 2200 / len, 0.02, 0.98));
  }
  const back = { x: target.x + (FOUNTAIN[c.side].x - target.x) * 0.3, y: target.y + (FOUNTAIN[c.side].y - target.y) * 0.3 };
  return gd().nav.snap(back);
}

// ------------------------------------------------------------------ team macro
/** Champion power at game time t from its authored curve (early / mid / late), 1..10. */
function curveAt(c: SimChamp, t: number): number {
  const p = c.champ.profile;
  const m = t / 60;
  if (m < 14) return p.early;
  if (m < 25) return p.early + (p.mid - p.early) * ((m - 14) / 11);
  if (m < 35) return p.mid + (p.late - p.mid) * ((m - 25) / 10);
  return p.late * 0.8 + p.scaling * 0.2;
}
/**
 * Composition game plan: compare our draft's power curve to theirs at this point in the game.
 * In-window teams play a bit more aggressively and look to siege/end; out-scaled-for-now teams
 * play a bit safer and stall. Deliberately a small nudge (±10 aggression).
 */
export function compWindow(sim: MatchSim, side: Side): number {
  const t = sim.t;
  const ours = sim.alliesOf(side).reduce((s, c) => s + curveAt(c, t), 0) / 5;
  const theirs = sim.enemiesOf(side).reduce((s, c) => s + curveAt(c, t), 0) / 5;
  // also look ahead: if we out-scale them in 10 minutes, waiting is attractive
  const later = sim.alliesOf(side).reduce((s, c) => s + curveAt(c, t + 600), 0) / 5 - sim.enemiesOf(side).reduce((s, c) => s + curveAt(c, t + 600), 0) / 5;
  return clamp((ours - theirs) * 0.6 - Math.max(0, later - (ours - theirs)) * 0.3, -1, 1);
}

export function teamMacro(sim: MatchSim, side: Side) {
  teamPlan(sim, side);
  objectiveStance(sim, side);
  answerBaseWaves(sim, side);
  catchSideWaves(sim, side);
  lookForPicks(sim, side);
}

/**
 * Playing the objective once we're on it: read who is coming and from where, then pick a stance —
 *  burn:    nobody contesting, take it fast
 *  race:    they're stronger but haven't found us and we kill it before they arrive
 *  smite:   it's low — finish it, the jungler holds smite for the last hit
 *  bait:    even fight — keep hitting it and hold the pit, make them engage into us
 *  fight:   we're clearly stronger — turn on them first, then finish it
 *  retreat: they've spotted us and have the better fight / position — back off
 */
function objectiveStance(sim: MatchSim, side: Side) {
  const t = sim.t;
  const tm = sim.teams[side];
  const enemy = (1 - side) as Side;
  const o = sim.objectives.find((x) => x.alive && sim.champs.some((c) => c.side === side && !c.dead && c.task.kind === 'objective' && c.task.objective === x.kind && dist(c.pos, x.pos) < 2600));
  if (!o) { if (tm.objStance && tm.objStance.until < t) tm.objStance = undefined; return; }
  const ours = sim.living(side).filter((c) => dist(c.pos, o.pos) < 2600);
  const theirs = sim.living(enemy).filter((e) => sim.isVisibleTo(side, e.idx) && dist(e.pos, o.pos) < 4200);
  const set = (stance: NonNullable<TeamRuntime['objStance']>['stance'], why: string) => {
    const cur = tm.objStance;
    // bait ↔ fight: don't flip-flop on every fog update; urgent changes (smite, retreat, enemies arriving) go through
    if (cur && cur.kind === o.kind && cur.until > t && (cur.stance === 'bait' || cur.stance === 'fight') && (stance === 'bait' || stance === 'fight')) return;
    if (cur?.stance !== stance || cur.kind !== o.kind) sim.dbg(side, 'call', `${o.kind}: ${stance.toUpperCase()} — ${why}`);
    tm.objStance = { kind: o.kind, stance, why, until: t + (stance === 'bait' || stance === 'fight' ? 7 : 3) };
  };
  const hpf = o.hp / o.maxHp;
  const hitting = [...o.attackers].some((i) => sim.champs[i].side === side);
  if (hitting && hpf < 0.25) return set('smite', `${Math.round(hpf * 100)}% left — finish it, ${sim.champs.find((c) => c.side === side && c.role === 'jungle')?.input.name ?? 'jungler'} on smite`);
  if (!theirs.length) return set('burn', 'nobody contesting — take it fast');
  // fight value: power with the setup / position edge, and whether they know we're here
  const hold = ((tm.setup[o.kind] ?? 0) - (sim.teams[enemy].setup[o.kind] ?? 0)) / 60;
  const edge = 1 + clamp(hold * 0.06 + (tm.macro - sim.teams[enemy].macro) / 400, -0.12, 0.12);
  const ratio = groupPower(ours) * edge / Math.max(1, groupPower(theirs)) * Math.exp(sim.rng.normal(0, 0.05 + lack(tm.macro) / 400));
  const spotted = ours.some((c) => sim.isVisibleTo(enemy, c.idx));
  const dps = ours.reduce((s2, c) => s2 + sim.monsterDps(c) * (o.kind === 'baron' ? 0.55 : 0.7), 0);
  const ttk = o.hp / Math.max(1, dps);
  const arrive = Math.min(...theirs.map((e) => Math.max(0, dist(e.pos, o.pos) - 700) / Math.max(330, e.stats.ms)));
  if (ratio > 1.35) return set('fight', `we're stronger (×${ratio.toFixed(2)}) — turn on them first`);
  if (ratio < 0.8) {
    if (!spotted && ttk < arrive + 1) return set('race', `they're coming (${Math.round(arrive)}s) but haven't seen us — ${Math.round(ttk)}s to kill it`);
    if (hitting && ttk < arrive + 3 && hpf < 0.45) return set('race', `too late to stop now — ${Math.round(ttk)}s left on it`);
    set('retreat', `${spotted ? 'spotted' : 'they collapse first'}, ${theirs.length} coming with the better fight (×${ratio.toFixed(2)})`);
    tm.objCalls[o.kind] = { d: 'concede', until: t + 15, score: -1 };
    return;
  }
  return set('bait', `even fight (×${ratio.toFixed(2)}) — keep hitting, hold the pit and make them engage`);
}

/**
 * Picks: an enemy farming alone on our half of the map, with two or more of us close by in the fog,
 * gets collapsed on. This is what makes deep side waves dangerous — and careful clearing worth it.
 */
function lookForPicks(sim: MatchSim, side: Side) {
  const t = sim.t;
  const tm = sim.teams[side];
  if (t <= 840 || tm.plan.kind === 'endcall' || tm.plan.kind === 'defend' || tm.baronUntil > t) return;
  const enemy = (1 - side) as Side;
  const mine = sim.living(side);
  if (mine.some((c) => c.task.kind === 'gank' && c.role !== 'jungle' && (c.task.until ?? 0) > t)) return; // one collapse at a time
  for (const v of sim.living(enemy)) {
    if (!sim.isVisibleTo(side, v.idx) || (v.task.kind !== 'lane' && v.task.kind !== 'jungle')) continue;
    const lane = v.task.lane ?? nearestLane(v.pos);
    if (depthOf(v, lane, v.pos) < 0.52) continue; // still on their own half
    if (sim.living(enemy).some((e) => e !== v && sim.isVisibleTo(side, e.idx) && dist(e.pos, v.pos) < 2600)) continue;
    if (sim.towers.some((tw) => tw.alive && tw.def.side === enemy && dist(tw.def.pos, v.pos) < 1100)) continue;
    const free = (c: SimChamp) => c.task.kind === 'lane' || c.task.kind === 'jungle' || c.task.kind === 'group' || c.task.kind === 'base'
      || (c.task.kind === 'objective' && !sim.objectives.find((o) => o.kind === c.task.objective)?.alive);
    const hunters = mine.filter((c) => c.recallUntil <= t && c.combatTarget === null && c.hp > c.stats.maxHp * 0.5 && dist(c.pos, v.pos) < 4500 && free(c))
      .sort((a, b) => dist(a.pos, v.pos) - dist(b.pos, v.pos)).slice(0, 3);
    if (hunters.length < 2 || hunters.every((c) => sim.isVisibleTo(enemy, c.idx))) continue; // they'd see it coming
    const ratio = groupPower(hunters) / Math.max(1, champPower(v)) * Math.exp(sim.rng.normal(0, 0.15 + lack(tm.macro) / 250));
    if (ratio < 1.8 || !sim.rng.chance(0.35 + tm.aggression / 200)) continue;
    for (const c of hunters) c.task = { kind: 'gank', lane, targetIdx: v.idx, until: t + 12, reason: `collapse: ${v.input.name} alone on our half (${hunters.length}v1, power ×${ratio.toFixed(1)})` };
    if (sim.rng.chance(0.5)) sim.event('gank', `${tm.input.short} collapse on ${v.input.name} in the ${lane} lane`, side);
    return;
  }
}

/**
 * Side waves don't farm themselves: when an enemy wave is walking into our half with nobody on it,
 * send whoever can best afford to — a laner between waves, someone waiting on an objective that
 * isn't up yet, a player holding a group spot. They clear it and rotate back. Teams with better
 * macro notice more reliably.
 */
/**
 * Super minions: with one of our inhibitors down, every wave on that lane carries super minions that
 * walk through our turrets and on to the Nexus. Someone has to meet them — ideally a waveclear carry
 * as they cross into our half; poor macro teams notice when they're already hitting the base. Any
 * wave walking into an open base gets the same answer. The player sent holds that lane (team calls
 * don't pull them away), and the super minions are worth the trip (90g each).
 */
function answerBaseWaves(sim: MatchSim, side: Side) {
  const t = sim.t;
  const tm = sim.teams[side];
  if (tm.plan.kind === 'endcall') return; // racing to end it
  const mine = sim.living(side);
  for (const lane of LANES) {
    const waves = sim.waves.filter((w) => w.lane === lane && w.side !== side && w.count >= 2);
    if (!waves.length) continue;
    const w = waves.reduce((a, b) => (side === 0 ? (a.p <= b.p ? a : b) : (a.p >= b.p ? a : b))); // the deepest one
    const depth = side === 0 ? w.p : 1 - w.p; // below 0: past our inhibitor, inside the base
    const inhibDown = sim.inhibs.some((ih) => ih.side === side && ih.lane === lane && !ih.alive);
    // super waves: as they cross into our half (good macro) or at our inner turret (poor); other
    // waves only once they're past a dead inhibitor (a living inhibitor turret handles them)
    const notice = w.supers > 0 ? 0.22 + tm.macro / 100 * 0.26 : inhibDown ? 0 : -1;
    if (depth > notice) continue;
    const wp = lanePoint(lane, w.p);
    const answering = mine.filter((c) => dist(c.pos, wp) < 1600
      || ((c.anchorUntil ?? 0) > t && c.anchorLane === lane && (c.recallUntil > t || (c.task.kind === 'lane' && c.task.lane === lane))));
    let clear = answering.reduce((n, c) => n + sim.waveClearDps(c, w.count), 0);
    const need = w.hp / 22; // clear it in ~20s, before it does real damage
    if (clear >= need) continue;
    if (!sim.rng.chance(0.5 + tm.macro / 200)) continue; // good teams don't need reminding
    const urgent = depth < 0.03;
    for (let sent = 0; sent < (urgent ? 2 : 1) && clear < need; sent++) {
      let best: SimChamp | null = null, bestCost = Infinity, bestEta = 0, bestFar = false;
      for (const c of mine) {
        if (answering.includes(c) || c.recallUntil > t || c.combatTarget !== null || c.lastCombatAt > t - 3) continue;
        if ((c.anchorUntil ?? 0) > t && c.anchorLane !== lane) continue; // holding another lane
        if (c.task.kind === 'objective') {
          const o = sim.objectives.find((x) => x.kind === c.task.objective);
          if (o && o.alive && [...o.attackers].some((i) => sim.champs[i].side === side) && !urgent) continue; // finish the Baron first
        }
        const d = dist(c.pos, wp);
        const ms = Math.max(330, c.stats.ms);
        const far = d > 7000;
        const eta = far ? (c.role === 'mid' ? T.recallTimeMid : T.recallTime) + dist(FOUNTAIN[side], wp) / (ms * 1.3) : d / ms;
        let cost = eta - c.champ.profile.waveclear * 0.7;
        cost += c.role === 'support' ? 9 : c.role === 'jungle' ? 3 : 0;
        if (c.hp < c.stats.maxHp * 0.35) cost += 5;
        if (c.task.kind === 'objective' || c.task.kind === 'defend') cost += 6;
        if (enemiesWithin(sim, side, c.pos, 1600, true).length) cost += far ? 30 : 8; // can't just walk off
        if (cost < bestCost) { bestCost = cost; best = c; bestEta = eta; bestFar = far; }
      }
      if (!best) break;
      const c = best;
      const what = w.supers > 0 ? `${w.supers > 1 ? 'super minions' : 'a super minion'} (${w.count} minions)` : `${w.count} minions in our base`;
      const fresh = !((c.anchorUntil ?? 0) > t && c.anchorLane === lane);
      c.anchorUntil = t + bestEta + 25; c.anchorLane = lane;
      c.waveIntent = 'push'; c.waveIntentUntil = t + bestEta + 6; c.waveReason = 'clearing super minions';
      if (bestFar) {
        if (c.summ2 === 'teleport' && t >= c.summ2ReadyAt && urgent) {
          c.summ2ReadyAt = t + 240;
          const tw = sim.towers.filter((x) => x.alive && x.def.side === side).sort((a, b) => dist(a.def.pos, wp) - dist(b.def.pos, wp))[0];
          const to = tw ? tw.def.pos : FOUNTAIN[side];
          c.pos = gd().nav.snap({ x: to.x + (FOUNTAIN[side].x - to.x) * 0.1, y: to.y + (FOUNTAIN[side].y - to.y) * 0.1 });
          c.path = []; c.dest = null; c.moveLockUntil = t + 4;
          c.fx.push({ kind: 'tp', until: t + 4, color: '#a855f7' });
          c.task = { kind: 'lane', lane, until: t + 30, reason: `teleporting home to stop ${what}` };
          sim.event('tp', `${c.input.name} teleports back to stop the super minions`, side);
        } else {
          c.recallUntil = t + (c.role === 'mid' ? T.recallTimeMid : T.recallTime);
          c.path = []; c.dest = null; c.combatTarget = null;
          c.task = { kind: 'recall', reason: `recalling to stop ${what} on ${lane}` };
        }
      } else {
        c.task = { kind: 'lane', lane, until: t + bestEta + 20, reason: `holding ${lane}: ${what}` };
      }
      if (fresh) sim.dbg(c, 'base', `sent to ${lane}: ${what} at ${depth < 0 ? 'our Nexus' : depth < 0.1 ? 'our inhibitor turret' : depth < 0.3 ? 'our inner turret' : 'our side of the map'}${bestFar ? ' (recalling first)' : ''}`);
      answering.push(c); clear += sim.waveClearDps(c, w.count);
    }
  }
}

function catchSideWaves(sim: MatchSim, side: Side) {
  const t = sim.t;
  const tm = sim.teams[side];
  if (t <= 840 || tm.plan.kind === 'endcall' || tm.plan.kind === 'defend' || tm.baronUntil > t) return;
  const mine = sim.living(side);
  for (const lane of LANES) {
    const waves = sim.waves.filter((w) => w.lane === lane && w.side !== side && w.count >= 3);
    if (!waves.length) continue;
    const w = waves.reduce((a, b) => (side === 0 ? (a.p <= b.p ? a : b) : (a.p >= b.p ? a : b)));
    const wp = lanePoint(lane, w.p);
    const g = laneProgress(lane, wp), depth = side === 0 ? g : 1 - g;
    // good macro teams send someone as the wave crosses the river; poor ones notice it at the tower
    if (depth > 0.47 + tm.macro / 100 * 0.24) continue;
    const covered = mine.some((c) => c.role !== 'support' && ((c.task.kind === 'lane' && c.task.lane === lane) || (c.task.kind === 'push' && c.task.lane === lane) || dist(c.pos, wp) < 1500));
    if (covered) continue;
    if (!sim.rng.chance(0.45 + tm.macro / 180)) continue;
    let best: SimChamp | null = null, bestCost = Infinity;
    for (const c of mine) {
      if (c.role === 'support' || c.recallUntil > t || c.combatTarget !== null) continue;
      const k = c.task.kind;
      const ms = Math.max(320, c.stats.ms);
      const travel = dist(c.pos, wp) / ms;
      if (travel > 28) continue;
      const clearTime = w.hp / Math.max(60, sim.waveClearDps(c, w.count));
      let cost = travel;
      if (k === 'lane') {
        if (sim.waves.some((x) => x.lane === c.task.lane && x.side !== side && dist(lanePoint(x.lane, x.p), c.pos) < 2600)) continue; // busy farming
      } else if (k === 'jungle' || k === 'base') cost += c.role === 'jungle' ? 4 : 1;
      else if (k === 'group') cost += 4;
      else if (k === 'objective') {
        const o = sim.objectives.find((x) => x.kind === c.task.objective);
        if (!o || o.alive) continue;
        const slack = o.spawnAt - t - (travel + clearTime + dist(wp, o.pos) / ms) - timingNoise(c, o.spawnAt + 7) * (1 + lack(c.input.macro) / 10);
        if (slack < 4) continue;
        cost += 3;
      } else continue;
      if (c.role === 'jungle') cost += 6;
      if (ambushRisk(sim, c, lane, wp) > 0.55) cost += 10;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    if (best && bestCost < 30) {
      const travel = dist(best.pos, wp) / Math.max(320, best.stats.ms);
      best.task = { kind: 'lane', lane, until: t + travel + 18, reason: `catching the unattended ${lane} wave (${w.count} minions)` };
      best.waveIntentUntil = 0;
    }
  }
}

function teamPlan(sim: MatchSim, side: Side) {
  const tm = sim.teams[side];
  const t = sim.t;
  {
    const w = compWindow(sim, side);
    tm.aggression = sim.throwSide === side ? 95 : clamp(tm.input.tactics.aggression + w * 10, 5, 95); // a throwing team forces everything
    tm.compWindow = w;
  }
  const enemy = (1 - side) as Side;
  const mine = sim.living(side);
  const theirs = sim.living(enemy);
  const macroNoise = lack(tm.macro) / 100;
  const laningPhaseV = t < 840 && sim.towers.filter((x) => !x.alive && x.def.tier === 'outer').length < 2;
  const laningPhase = () => laningPhaseV;

  // ---------------- objective decisions (sticky team calls: take / hover / concede)
  let best: { kind: ObjectiveKind; util: number } | null = null;
  let hover: ObjectiveKind | null = null;
  let conceded: ObjectiveKind | null = null;
  let committedKind: ObjectiveKind | null = null; // the one we're already hitting
  for (const o of sim.objectives) {
    const kind = o.kind;
    const pit = o.pos;
    const reach = (c: SimChamp) => dist(c.pos, pit) / Math.max(300, c.stats.ms);
    const soon = o.alive || (o.spawnAt > 0 && o.spawnAt - t < 32);
    if (!soon) { delete tm.objCalls[kind]; continue; }
    let value = kind === 'dragon' ? 1.0 : kind === 'elder' ? 3.2 : kind === 'baron' ? 2.6 : kind === 'herald' ? 0.75 : 0.7;
    const prio = tm.input.tactics.objectivePriority;
    if (kind === 'dragon') {
      if (tm.dragons.length >= 2) value += 0.6;
      if (sim.teams[enemy].dragons.length >= 3) value += 1.0; // deny soul
      if (prio === 'dragons') value *= 1.3;
    }
    if (kind === 'grubs' || kind === 'herald') { if (prio === 'grubs') value *= 1.4; if (prio === 'dragons') value *= 0.8; }
    if (kind === 'baron' && prio === 'baron') value *= 1.2;
    // players who live for these objectives pull the calls their way
    if ((kind === 'dragon' || kind === 'grubs') && tm.input.players.some((p) => has(p, 'dragon_hunter'))) value += 0.1;
    let call = tm.objCalls[kind];
    // already on it: finish what we started — the call holds until it's taken or our read says retreat
    const onIt = o.alive && ([...o.attackers].some((i) => sim.champs[i].side === side) || (o.lastHitSide === side && t - (o.lastHitAt ?? -99) < 8));
    if (onIt && !(tm.objStance?.kind === kind && tm.objStance.stance === 'retreat' && tm.objStance.until > t)) {
      call = { d: 'take', until: t + 5, score: Math.max(call?.d === 'take' ? call.score : 0.6, 0.6) };
      tm.objCalls[kind] = call;
      if (o.hp < o.maxHp * 0.95) committedKind = kind;
    }
    if (!call || call.until <= t) {
      const ours = mine.filter((c) => reach(c) < 30);
      // who can contest? Unseen enemies are a read of the map (wave states, timers, who's missing):
      // good macro teams usually read it right, poor ones guess
      const mapRead = 0.2 + tm.macro / 250 + teamFarsight(sim, side) / 500;
      const est = theirs.filter((e) => {
        const seen = tm.lastSeen.get(e.idx);
        if (sim.isVisibleTo(side, e.idx)) return reach(e) < 30;
        if (seen && t - seen.t < 20) return dist(seen.pos, pit) / e.stats.ms < 30 + (t - seen.t);
        return sim.rng.chance(mapRead) ? reach(e) < 30 : sim.rng.chance(0.5);
      });
      const myPow = groupPower(ours.length ? ours : mine.slice(0, 1)) * 1.12;
      const enPow = groupPower(est) + 1;
      const nDiff = ours.length - est.length;
      const lanePrio = laneprio(sim, side, kind === 'dragon' || kind === 'elder' ? 'bot' : 'top');
      const vision = sim.wards.filter((w) => dist(w.pos, pit) < 2500).reduce((a, w) => a + (w.side === side ? 1 : -1), 0);
      let x = Math.log(myPow / enPow) * 2 + nDiff * 0.5 + lanePrio * 0.8 + clamp(vision, -4, 4) * 0.28 + (tm.aggression - 50) / 120;
      x += sim.rng.normal(0, 0.25 + macroNoise * 0.7);
      // Baron into a full, unseen enemy team is a coin flip on the game: pros start it after a pick, a won
      // fight or with deep vision — not on a whim the moment it spawns
      if (kind === 'baron' && theirs.length >= 4 && nDiff <= 0) x -= 1.2;
      if (kind === 'baron' && t < 1500 && theirs.length >= 4) x -= 0.7;
      if (kind === 'baron' && theirs.length === 5) x -= 0.5; // nobody down: someone will come check
      if (kind === 'baron' && tm.input.players.some((p) => has(p, 'baron_gambler') && (p.role === 'jungle' || p.shotcalling >= 70))) x += 0.1;
      // enemy already on it with the objective low: only a big edge contests
      const enemyOnIt = [...o.attackers].some((i) => sim.champs[i].side === enemy);
      if (enemyOnIt && o.hp < o.maxHp * 0.4) x -= 1.2;
      if (ours.length < (kind === 'baron' || kind === 'elder' ? 3 : 2)) x -= 1.5;
      const d: 'take' | 'hover' | 'concede' = x > 0.45 ? 'take' : x < -0.25 ? 'concede' : 'hover';
      call = { d, until: t + 10 + sim.rng.next() * 8, score: x };
      tm.objCalls[kind] = call;
    }
    if (call.d === 'take') {
      const util = value * sigmoid(call.score);
      if (!best || util > best.util) best = { kind, util };
    } else if (call.d === 'hover') { if (!hover || value > 1) hover = kind; }
    else conceded = kind;
  }

  // ---------------- base under attack: everyone comes home (recall / Teleport), unless racing for the win
  if (!laningPhase() && baseDefense(sim, side, mine, theirs)) return;

  // finishing an objective we started beats starting a new one
  if (committedKind) best = { kind: committedKind, util: 99 };

  // ---------------- far-sight: game-ending reads (surprise baron, end calls, backdoors)
  if (!laningPhase() && endgameCalls(sim, side, mine, theirs)) return;

  // ---------------- big numbers advantage: push it (take baron first only if it's right there)
  const deadEnemies = sim.champs.filter((e) => e.side === enemy && e.dead && e.respawnAt - t > 18).length;
  if (deadEnemies >= 2 && mine.length >= 3 && !laningPhase()) {
    const baronUp = sim.objectives.find((o) => o.kind === 'baron' && o.alive);
    if (!(best && (best.kind === 'baron' || best.kind === 'elder') && baronUp)) best = null;
  }

  // ---------------- baron power play: group and siege with empowered minions
  if (tm.baronUntil > t && mine.length >= 3 && !best) {
    let lane: Lane = tm.siege.lane ?? 'mid', bestP = -Infinity;
    for (const l of LANES) {
      if (!siegeTarget(sim, enemy, l)) continue;
      const ws = sim.waves.filter((w) => w.lane === l && w.side === side);
      const front = ws.length ? (side === 0 ? Math.max(...ws.map((w) => w.p)) : 1 - Math.min(...ws.map((w) => w.p))) : 0;
      const tier = siegeTarget(sim, enemy, l)!.def.tier;
      const sc = front + (tier === 'inhib' ? 0.2 : tier === 'nexus' ? 0.4 : 0) - dist(centerOf(mine), siegeTarget(sim, enemy, l)!.def.pos) / 30000;
      if (sc > bestP) { bestP = sc; lane = l; }
    }
    tm.siege = { lane, until: t + 25 };
    tm.plan = { kind: 'siege', target: lane, until: t + 25, label: `Baron power play — ${lane} lane` };
    for (const c of mine) {
      if (c.recallUntil > t) continue;
      // empowered recall then walk back if far away and hurt
      if (c.hp < c.stats.maxHp * 0.5 && dist(c.pos, FOUNTAIN[side]) > 5000 && c.task.kind !== 'recall' && !enemiesWithin(sim, side, c.pos, 1400, true).length) {
        c.recallUntil = t + 4; c.task = { kind: 'recall', reason: 'empowered recall before the Baron push' }; c.path = []; c.dest = null; continue;
      }
      assign(sim, c, { kind: 'push', lane, until: t + 25, reason: 'Baron power play' });
    }
    return;
  }

  // ---------------- siege / group decisions (after laning phase)
  let siegeLane: Lane | null = null;
  if (!best && !laningPhase() && mine.length >= 3) {
    let bestS = -Infinity;
    for (const lane of LANES) {
      const tw = siegeTarget(sim, enemy, lane);
      if (!tw) continue;
      const near = mine.filter((c) => dist(c.pos, tw.def.pos) < 6000);
      // sieges need a reason: numbers advantage nearby, baron, herald, or late-game grouping
      const nDiffNow = mine.length - theirs.length;
      const reason = tm.baronUntil > t || (nDiffNow >= 1 && near.length >= 3) || nDiffNow >= 2 || (tm.herald && near.length >= 3) || (t > 1560 && near.length >= 3);
      if (!reason) continue;
      const defenders = theirs.filter((e) => dist(e.pos, tw.def.pos) < 4500 || !sim.isVisibleTo(side, e.idx));
      const adv = Math.log((groupPower(mine) + 1) / (groupPower(defenders) + 1)) * 2 + (mine.length - theirs.length) * 0.7 + (tm.baronUntil > t ? 1.2 : 0) + (tm.herald ? 0.4 : 0);
      const tierV = tw.def.tier === 'outer' ? 0.8 : tw.def.tier === 'inner' ? 1 : tw.def.tier === 'inhib' ? 1.5 : 2.2;
      const late = Math.min(1, Math.max(0, (t - 1500) / 900)) * 0.4; // late game: grouping & sieging is the default
      const score = adv + (tierV - 1) * 0.3 + near.length * 0.04 + late - dist(centerOf(mine), tw.def.pos) / 12000 + sim.rng.normal(0, 0.25 + macroNoise * 0.5);
      if (score > bestS) { bestS = score; siegeLane = lane; }
    }
    // only commit to a siege with a real edge (numbers, baron, herald, big gold lead)
    if (bestS < 0.85 - (tm.aggression - 50) / 120) siegeLane = null;
    // stick with the current siege target for a while unless it fell apart
    if (tm.siege.until > t && tm.siege.lane && siegeTarget(sim, enemy, tm.siege.lane)) {
      if (siegeLane !== null || bestS > -0.2) siegeLane = tm.siege.lane;
    } else if (siegeLane) tm.siege = { lane: siegeLane, until: t + 25 };
  }

  // ---------------- assign plan
  if (best) {
    const label = best.kind === 'dragon' ? 'Setting up for dragon' : best.kind === 'elder' ? 'Elder Dragon fight' : best.kind === 'baron' ? 'Going for Baron' : best.kind === 'herald' ? 'Rift Herald' : 'Voidgrubs';
    if (tm.plan.kind !== 'objective' || tm.plan.target !== best.kind) {
      tm.plan = { kind: 'objective', target: best.kind, until: t + 40, label };
    }
    const pit = objPos(best.kind);
    // participants: jungler + support + closest others
    const prioOf = (c: SimChamp) => (c.task.lane ? lanePriority(sim, side, c.task.lane) : 0);
    const sorted = [...mine].sort((a, b) => dist(a.pos, pit) / 1000 - prioOf(a) * 1.5 - (dist(b.pos, pit) / 1000 - prioOf(b) * 1.5));
    // dragons / herald / grubs: 3 players (jungle, support + closest); the rest keep catching side waves
    const contested = theirs.filter((e) => sim.isVisibleTo(side, e.idx) && dist(e.pos, pit) < 4000).length;
    const need = best.kind === 'baron' || best.kind === 'elder' ? 5 : Math.min(5, 3 + (contested >= 3 ? 1 : 0));
    const chosen = new Set<number>();
    for (const c of mine) if (c.role === 'jungle' || c.role === 'support') chosen.add(c.idx);
    const live = sim.objectives.find((x) => x.kind === best!.kind);
    if (live) for (const i of live.attackers) if (sim.champs[i].side === side) chosen.add(i); // whoever is hitting it stays on it
    for (const c of sorted) { if (chosen.size >= need) break; chosen.add(c.idx); }
    // splitpusher stays out in late game if team plays split
    const split = (tm.input.tactics.playstyle === 'splitpush' || tm.input.tactics.playstyle === 'balanced') && !laningPhase();
    for (const c of mine) {
      if (!chosen.has(c.idx)) continue;
      if (split && c.role === 'top' && c.champ.profile.splitpush >= 7 && best.kind !== 'elder' && mine.length >= 5 && sim.rng.chance(0.5)) continue;
      if (c.task.kind === 'recall' || c.recallUntil > t) continue;
      if (c.hp < c.stats.maxHp * 0.35 && dist(c.pos, pit) > 3000) continue;
      const o = sim.objectives.find((x) => x.kind === best!.kind)!;
      const travel = dist(c.pos, pit) / Math.max(300, c.stats.ms);
      const misread = timingNoise(c, o.spawnAt) * (1 + lack(c.input.macro) / 8);
      if (!o.alive && o.spawnAt - t > travel + (laningPhase() ? 4 : 6) + misread && c.role !== 'jungle' && c.role !== 'support') continue;
      // better macro teams take the zone earlier (jungle/support move up sooner)
      if (!o.alive && o.spawnAt - t > travel + 12 + tm.macro / 4) continue;
      assign(sim, c, { kind: 'objective', objective: best.kind, pos: pit, until: t + 35, reason: `team call: take ${best.kind} (score ${tm.objCalls[best.kind]?.score.toFixed(2)})` });
    }
    return;
  }
  if (hover) {
    // set up vision on our side of the pit with jungle + support; others keep farming close by
    const pit = objPos(hover);
    const hold = { x: pit.x + (FOUNTAIN[side].x - pit.x) * 0.36, y: pit.y + (FOUNTAIN[side].y - pit.y) * 0.36 };
    tm.plan = { kind: 'hover', target: hover, until: t + 10, label: `Setting up vision for ${hover}` };
    const enemiesAtPit = theirs.filter((e) => sim.isVisibleTo(side, e.idx) && dist(e.pos, pit) < 3000).length;
    if (enemiesAtPit < 2) for (const c of mine) {
      if (c.role !== 'jungle' && c.role !== 'support') continue;
      if (c.task.kind === 'recall' || c.recallUntil > t) continue;
      if (c.task.kind === 'objective' || c.task.kind === 'gank') continue;
      if (c.role === 'jungle' && campNear(sim, c, pit, 4200, `farming near ${hover} while the support holds vision`)) continue;
      assign(sim, c, { kind: 'group', pos: gd().nav.snap(hold), until: t + 12, reason: `hovering ${hover}: vision setup` });
    }
    for (const c of mine) if (c.task.kind === 'objective' && c.task.objective === hover) c.task = { kind: 'group', pos: gd().nav.snap(hold), until: t + 12, reason: `${hover} call downgraded to hover` };
  }
  if (conceded) {
    // give it up: release anyone heading to the pit and look for a cross-map play
    for (const c of mine) if (c.task.kind === 'objective' && c.task.objective === conceded) c.task = { kind: 'base', reason: `${conceded} conceded` };
    const o = sim.objectives.find((x) => x.kind === conceded)!;
    const enemyOnIt = [...o.attackers].some((i) => sim.champs[i].side === enemy) || theirs.filter((e) => sim.isVisibleTo(side, e.idx) && dist(e.pos, o.pos) < 2500).length >= 3;
    if (enemyOnIt && !laningPhase()) {
      const far: Lane = conceded === 'dragon' || conceded === 'elder' ? 'top' : 'bot';
      const tw = frontTower(sim, enemy, far);
      if (tw) {
        tm.plan = { kind: 'crossmap', target: far, until: t + 25, label: `Trading: pressure ${far} lane` };
        const sorted = mine.filter((c) => c.recallUntil <= t && c.role !== 'jungle').sort((a, b) => dist(a.pos, tw.def.pos) - dist(b.pos, tw.def.pos));
        for (const c of sorted.slice(0, 2)) if (dist(c.pos, tw.def.pos) < 7000) assign(sim, c, { kind: 'push', lane: far, until: t + 20, reason: `cross-map trade for the conceded ${conceded}` });
      }
    }
  }
  if (tm.plan.kind === 'objective' && tm.plan.until > t) {
    // objective gone / taken: release
    const o = sim.objectives.find((x) => x.kind === tm.plan.target);
    if (!o || !o.alive) tm.plan = { kind: 'free', until: 0, label: 'Resetting' };
  }
  for (const c of mine) if (c.task.kind === 'objective') {
    const o = sim.objectives.find((x) => x.kind === c.task.objective);
    if (!o || (!o.alive && !(o.spawnAt > 0 && o.spawnAt - t < 45))) c.task = { kind: 'base' };
  }

  if (siegeLane) {
    tm.plan = { kind: 'siege', target: siegeLane, until: t + 30, label: `Sieging ${siegeLane} lane` };
    const tw = siegeTarget(sim, enemy, siegeLane)!;
    const splitTop = tm.input.tactics.playstyle === 'splitpush' || (tm.input.tactics.playstyle === 'balanced' && t > 1500);
    for (const c of mine) {
      if (c.task.kind === 'recall' || c.recallUntil > t) continue;
      if (c.hp < c.stats.maxHp * 0.3) continue;
      if (splitTop && c.role === 'top' && c.champ.profile.splitpush >= 6) {
        const side_lane: Lane = siegeLane === 'bot' ? 'top' : 'bot';
        assign(sim, c, { kind: 'push', lane: side_lane, reason: `split pushing while the team sieges ${siegeLane}` });
        continue;
      }
      assign(sim, c, { kind: 'push', lane: siegeLane, pos: tw.def.pos, reason: `siege ${siegeLane} ${tw.def.tier}` });
    }
    return;
  }

  // ---------------- defend: enemies sieging one of our towers
  for (const lane of LANES) {
    const tw = frontTower(sim, side, lane);
    if (!tw) continue;
    const attackers = enemiesWithin(sim, side, tw.def.pos, 1600, true);
    if (attackers.length >= 2 && !laningPhase()) {
      const defenders = mine.filter((c) => dist(c.pos, tw.def.pos) < 7000);
      const ratio = (groupPower(defenders) * (1 + towerSupport(sim, side, tw.def.pos))) / (groupPower(attackers) + 1);
      if (ratio > 0.7 || tw.def.tier !== 'outer') {
        tm.plan = { kind: 'defend', target: lane, until: t + 20, label: `Defending ${lane}` };
        for (const c of defenders) if (c.recallUntil <= t) assign(sim, c, { kind: 'defend', lane, pos: tw.def.pos, reason: `${attackers.length} enemies hitting our ${lane} ${tw.def.tier} turret` });
        return;
      }
    }
  }

  // ---------------- default: laning / farming / grouping
  if (tm.plan.kind !== 'laning' && laningPhase()) tm.plan = { kind: 'laning', until: 0, label: 'Laning phase' };
  if (!laningPhase() && tm.plan.kind !== 'farm') {
    const w = tm.compWindow ?? 0;
    tm.plan = { kind: 'farm', until: 0, label: w > 0.35 ? 'In their power window — forcing plays' : w < -0.35 ? 'Scaling comp — playing safe for late game' : t > 1500 ? 'Grouping mid, farming sides' : 'Farming & rotating' };
  }
  for (const c of mine) {
    if (c.task.kind === 'objective' || c.task.kind === 'push' || c.task.kind === 'defend' || c.task.kind === 'group') {
      if ((c.task.until ?? 0) < t) c.task = { kind: 'base' };
    }
  }
}

/**
 * Enemies inside our base (at an inhibitor turret, inhibitor, nexus turret or the nexus): bring
 * players home. Far away → recall (or Teleport) and walk out of the fountain; close → defend.
 * A split-pusher already hitting their nexus may race instead; tunnel-visioned players with poor
 * macro occasionally keep pushing (and the base falls behind them).
 */
function baseDefense(sim: MatchSim, side: Side, mine: SimChamp[], theirs: SimChamp[]): boolean {
  const t = sim.t;
  const tm = sim.teams[side];
  const enemy = (1 - side) as Side;
  const structs: { pos: Vec; label: string; lane: Lane }[] = [];
  for (const tw of sim.towers) if (tw.alive && tw.def.side === side && (tw.def.tier === 'inhib' || tw.def.tier === 'nexus')) structs.push({ pos: tw.def.pos, label: `${tw.def.tier === 'nexus' ? 'nexus' : tw.def.lane + ' inhibitor'} turret`, lane: tw.def.lane === 'base' ? 'mid' : tw.def.lane });
  for (const ih of sim.inhibs) if (ih.alive && ih.side === side) structs.push({ pos: ih.pos, label: `${ih.lane} inhibitor`, lane: ih.lane });
  structs.push({ pos: NEXUS[side], label: 'Nexus', lane: 'mid' });
  let threat: (typeof structs)[number] | null = null;
  let attackers: SimChamp[] = [];
  for (const st of structs) {
    const a = theirs.filter((e) => dist(e.pos, st.pos) < 1700 && sim.isVisibleTo(side, e.idx));
    if (a.length > attackers.length) { attackers = a; threat = st; }
  }
  if (!threat || !attackers.length) return false;
  const need = attackers.length >= 3 ? 5 : attackers.length + 1;
  const label = `Base under attack — defending the ${threat.label}`;
  if (tm.plan.label !== label) sim.dbg(side, 'base', `${attackers.map((e) => e.input.name).join(', ')} at our ${threat.label}: calling ${need >= 5 ? 'everyone' : need} back`);
  tm.plan = { kind: 'defend', target: threat.lane, until: t + 15, label };
  const ms = (c: SimChamp) => Math.max(330, c.stats.ms);
  const eta = (c: SimChamp) => { const d = dist(c.pos, threat!.pos); return d > 6500 ? T.recallTime + dist(FOUNTAIN[side], threat!.pos) / (ms(c) * 1.3) : d / ms(c); };
  const sorted = [...mine].sort((a, b) => eta(a) - eta(b)).slice(0, need);
  const enemyNexusOpen = !sim.towers.some((tw) => tw.alive && tw.def.side === enemy && tw.def.tier === 'nexus');
  for (const c of sorted) {
    if (c.recallUntil > t || (c.task.kind === 'defend' && c.task.pos && dist(c.task.pos, threat.pos) < 300)) continue;
    // racing: already on their nexus with their base open → keep hitting it
    if (enemyNexusOpen && dist(c.pos, NEXUS[enemy]) < 1400 && attackers.length < 5) { sim.dbg(c, 'base', 'racing: staying on their Nexus'); continue; }
    // tunnel vision: aggressive, low-macro side laners sometimes keep pushing
    if (c.task.kind === 'push' && c.role === 'top' && dist(c.pos, threat.pos) > 7000 && timingUniform(c, Math.floor(t / 30) + 911) < lack(c.input.macro) / 400 + (c.input.aggression - 50) / 500) {
      sim.dbg(c, 'base', `ignores the base call and keeps pushing ${c.task.lane} (tunnel vision)`);
      continue;
    }
    const d = dist(c.pos, threat.pos);
    const safe = !enemiesWithin(sim, side, c.pos, 1400, true).length;
    if (d > 6500 && safe && c.combatTarget === null) {
      if (c.summ2 === 'teleport' && t >= c.summ2ReadyAt) {
        c.summ2ReadyAt = t + 240;
        c.pos = gd().nav.snap({ x: threat.pos.x + (FOUNTAIN[side].x - threat.pos.x) * 0.15, y: threat.pos.y + (FOUNTAIN[side].y - threat.pos.y) * 0.15 });
        c.path = []; c.dest = null; c.moveLockUntil = t + 4;
        c.fx.push({ kind: 'tp', until: t + 4, color: '#a855f7' });
        c.task = { kind: 'defend', lane: threat.lane, pos: threat.pos, until: t + 15, reason: `teleporting home to defend the ${threat.label}` };
        sim.event('tp', `${c.input.name} teleports back to defend!`, side, { important: true });
        continue;
      }
      c.recallUntil = t + (c.role === 'mid' ? T.recallTimeMid : T.recallTime);
      c.path = []; c.dest = null; c.combatTarget = null;
      c.task = { kind: 'recall', reason: `base under attack: recalling to defend the ${threat.label}` };
      continue;
    }
    assign(sim, c, { kind: 'defend', lane: threat.lane, pos: threat.pos, until: t + 15, reason: `${attackers.length} enemies at our ${threat.label}` });
  }
  return true;
}

/** Next structure to siege on a lane: tower, then inhibitor, then nexus towers / nexus (as pseudo-towers). */
function siegeTarget(sim: MatchSim, enemy: Side, lane: Lane): { def: { pos: Vec; tier: string } } | null {
  const tw = frontTower(sim, enemy, lane);
  if (tw) return tw;
  const ih = sim.inhibs.find((i) => i.side === enemy && i.lane === lane);
  if (ih && ih.alive) return { def: { pos: ih.pos, tier: 'inhib' } };
  const nt = sim.towers.find((x) => x.alive && x.def.side === enemy && x.def.tier === 'nexus');
  if (nt) return nt;
  return { def: { pos: enemy === 0 ? { x: 1551, y: 1659 } : { x: 13300, y: 13300 }, tier: 'nexus' } };
}

function centerOf(list: SimChamp[]): Vec {
  if (!list.length) return { x: 7435, y: 7435 };
  let x = 0, y = 0;
  for (const c of list) { x += c.pos.x; y += c.pos.y; }
  return { x: x / list.length, y: y / list.length };
}

/** Lane priority near an objective: positive if our nearby waves are pushed in. */
function laneprio(sim: MatchSim, side: Side, half: 'top' | 'bot'): number {
  const lanes: Lane[] = half === 'bot' ? ['bot', 'mid'] : ['top', 'mid'];
  let prio = 0;
  for (const lane of lanes) {
    const mine = sim.waves.filter((w) => w.lane === lane && w.side === side);
    if (!mine.length) continue;
    const front = side === 0 ? Math.max(...mine.map((w) => w.p)) : 1 - Math.min(...mine.map((w) => w.p));
    prio += front - 0.5;
  }
  return clamp(prio * 2, -1, 1);
}

function assign(sim: MatchSim, c: SimChamp, task: Task) {
  if (c.dead) return;
  // reading the call: good macro players rotate as soon as it's made, poor ones finish what
  // they were doing first (and arrive late / staggered)
  const key = `${task.kind}:${task.objective ?? task.lane ?? ''}`;
  if (`${c.task.kind}:${c.task.objective ?? c.task.lane ?? ''}` !== key) {
    if (c.rotateKey !== key) { c.rotateKey = key; c.rotateAt = sim.t + Math.abs(sim.rng.normal(0, 1)) * lack(c.input.macro) / 100 * 9; }
    if (sim.t < (c.rotateAt ?? 0)) return;
  }
  if (c.combatTarget !== null && c.task.kind !== 'lane') return; // don't yank someone out of a fight
  if ((c.anchorUntil ?? 0) > sim.t && task.kind !== 'defend' && !(task.kind === 'lane' && task.lane === c.anchorLane)) return; // holding the super minion lane
  // let an in-progress camp clear finish (unless the objective is already up)
  if (c.task.kind === 'jungle' && c.task.campId && (c.task.until ?? 0) > (task.until ?? 0) - 40 && task.kind === 'objective') return;
  c.task = task;
}

// ------------------------------------------------------------------ champion decisions
export function champDecide(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  if (c.dead) return;
  if (c.ccUntil > t) return;
  if (sim.throwSide === c.side) { runItDown(sim, c); return; } // cheat: no thinking, just int

  // a committed bad engage plays out
  if (c.mistakeUntil > t && c.mistakeKind === 'engage' && c.combatTarget !== null) return;
  // tower aggro: step out unless a kill is imminent or minions are about to take the hits again
  const aggroTower = sim.towers.find((tw) => tw.alive && tw.def.side !== c.side && tw.targetIdx === c.idx && dist(tw.def.pos, c.pos) < TOWER_RANGE + 80);
  if (aggroTower) {
    const target = c.combatTarget !== null ? sim.champs[c.combatTarget] : null;
    const killing = target && !target.dead && target.hp < burstEstimate(c, target, t) * 0.8;
    const tanky = c.hp > c.stats.maxHp * 0.7 && c.champ.profile.tankiness >= 7 && aggroTower.shotsOnTarget < 3;
    if (!killing && !tanky) {
      const out = { x: c.pos.x + (c.pos.x - aggroTower.def.pos.x) * 0.9, y: c.pos.y + (c.pos.y - aggroTower.def.pos.y) * 0.9 };
      sim.setDest(c, gd().nav.snap(out));
      c.combatTarget = null; c.tradeUntil = t;
      return;
    }
  }
  // ---------- combat awareness (someone who just stepped out of the fog takes a moment to react to —
  // that moment is what makes ganks land; wards spot them earlier)
  const react = 0.25 + lack(c.input.macro) / 180 + (c.task.kind === 'lane' ? 0.25 : 0);
  const seenSince = sim.teams[c.side].seenSince;
  let threats = enemiesWithin(sim, c.side, c.pos, 1350, true).filter((e) =>
    c.combatTarget !== null || e.combatTarget === c.idx || dist(e.pos, c.pos) < 450 || t - (seenSince.get(e.idx) ?? -99) >= react);
  // channelling a recall: no fighting (and no target others would read as a threat) unless someone comes for us
  if (c.recallUntil > t) {
    c.combatTarget = null;
    if (!threats.some((e) => e.combatTarget === c.idx || dist(e.pos, c.pos) < 600)) threats = [];
  }
  if (!threats.length && maybeMistake(sim, c)) return;
  if (!threats.length && t - c.lastDecisionAt < 0.75 && mapPlays(sim, c)) return;
  if (threats.length && JOIN_ULT_CHAMPS.has(c.champ.id) && joinUlt(sim, c, true)) return; // Galio onto a teammate in this fight, Pantheon behind them...
  if (threats.length && (c.role === 'support' || c.champ.profile.peel >= 6) && peelDash(sim, c)) return; // dash to a teammate being dived
  if (threats.length) {
    if (fightDecision(sim, c, threats)) return;
  } else if (c.combatTarget !== null) {
    const e = sim.champs[c.combatTarget];
    if (!e || e.dead || dist(e.pos, c.pos) > 1500 || !sim.isVisibleTo(c.side, e.idx)) c.combatTarget = null;
  }
  if (!threats.length && c.task.kind !== 'flee' && maybeHelp(sim, c)) return;
  if (c.task.kind === 'help') { doHelp(sim, c); return; }
  if (c.task.kind === 'flee') {
    const close = t < (c.fleeUntil ?? 0) ? 1 : enemiesWithin(sim, c.side, c.pos, 1450, true).length;
    const underTower = sim.towers.some((tw) => tw.alive && tw.def.side === c.side && dist(tw.def.pos, c.pos) < 700);
    if (!close || dist(c.pos, FOUNTAIN[c.side]) < 1500 || (underTower && c.hp > c.stats.maxHp * 0.4)) {
      c.task = { kind: 'base' };
      // just got chased off: come back to the wave from behind, not straight into whoever chased us
      c.zonedUntil = t + 5 + sim.rng.next() * 3;
    } else { const safe = safeSpot(sim, c); if (!escapeDash(sim, c, safe)) sim.setDest(c, safe); return; }
  }
  if (c.recallUntil > t) {
    if (!cancelRecallForWave(sim, c)) return;
  }

  // ---------- recall logic
  const recallWhy = shouldRecall(sim, c);
  if (recallWhy) {
    if (dist(c.pos, FOUNTAIN[c.side]) < 2200) { sim.setDest(c, FOUNTAIN[c.side]); c.task = { kind: 'base', reason: `walking home: ${recallWhy}` }; }
    else {
      c.recallUntil = t + (c.role === 'mid' ? T.recallTimeMid : T.recallTime) * (sim.teams[c.side].baronUntil > t ? 0.5 : 1);
      c.path = []; c.dest = null; c.task = { kind: 'recall', reason: recallWhy };
      c.combatTarget = null;
    }
    return;
  }

  // ---------- base: leave fountain when healthy
  if (c.task.kind === 'base' || c.task.kind === 'recall') {
    if (dist(c.pos, FOUNTAIN[c.side]) < 1000 && c.hp < c.stats.maxHp * 0.92) { sim.setDest(c, FOUNTAIN[c.side]); return; }
    c.task = defaultTask(sim, c);
    // teleport back to lane
    if (c.summ2 === 'teleport' && t >= c.summ2ReadyAt && c.task.kind === 'lane' && t > 180) {
      const lane = c.task.lane!;
      const tw = frontTower(sim, c.side, lane);
      if (tw && dist(c.pos, tw.def.pos) > 6000) {
        c.summ2ReadyAt = t + (t < 840 ? 360 : 240);
        c.pos = gd().nav.snap({ x: tw.def.pos.x + (c.side === 0 ? -150 : 150), y: tw.def.pos.y + (c.side === 0 ? -150 : 150) });
        c.path = []; c.dest = null;
        c.fx.push({ kind: 'tp', until: t + 1.2, color: '#a855f7' });
      }
    }
  }

  // ---------- warding opportunistically
  maybeWard(sim, c);

  if (c.task.kind === 'lane' && c.task.until && c.task.until < t) c.task = defaultTask(sim, c);
  switch (c.task.kind) {
    case 'lane': return doLane(sim, c, c.task.lane!);
    case 'jungle': return doJungle(sim, c);
    case 'gank': return doGank(sim, c);
    case 'objective': return doObjective(sim, c);
    case 'push': return doPush(sim, c, c.task.lane!);
    case 'defend': return doDefend(sim, c);
    case 'roam': return doGank(sim, c);
    case 'ward': {
      if (c.task.pos && dist(c.pos, c.task.pos) < 500) { sim.placeWard(c, c.task.pos, c.controlWards > 0 && sim.rng.chance(0.5)); c.task = defaultTask(sim, c); }
      else if (c.task.pos) sim.setDest(c, c.task.pos);
      return;
    }
    case 'group': if (c.task.pos) sim.setDest(c, c.task.pos); return;
    case 'invade': return doJungle(sim, c);
    default: c.task = defaultTask(sim, c);
  }
}

/**
 * Cheat (Settings easter egg, MatchSim.forceThrow): the throwing team runs it down — straight at the nearest enemy,
 * or down mid into the enemy towers and fountain. No fleeing, no recalls, no waiting for teammates.
 */
const runNotes = new WeakMap<SimChamp, number>();
function runItDown(sim: MatchSim, c: SimChamp) {
  const enemy = (1 - c.side) as Side;
  c.recallUntil = 0;
  c.task = { kind: 'group', reason: 'running it down' };
  const foes = sim.champs.filter((e) => e.side === enemy && !e.dead);
  const near = foes.sort((a, b) => dist2(a.pos, c.pos) - dist2(b.pos, c.pos))[0];
  if (near && dist(near.pos, c.pos) < 3200) {
    c.combatTarget = near.idx; c.tradeUntil = sim.t + 5; c.tradeMode = false;
    sim.setDest(c, near.pos);
  } else {
    c.combatTarget = null;
    const ahead = laneProgress('mid', c.pos) + (enemy === 1 ? 0.25 : -0.25); // a quarter of the lane at a time, towards the enemy base
    sim.setDest(c, ahead >= 1 || ahead <= 0 ? FOUNTAIN[enemy] : lanePoint('mid', ahead));
  }
  if (sim.t - (runNotes.get(c) ?? -999) > 75 && dist(c.pos, FOUNTAIN[c.side]) < 3000) {
    runNotes.set(c, sim.t);
    sim.event('info', `${c.input.name} walks out of the fountain and runs it down mid`, c.side);
  }
}

function defaultTask(sim: MatchSim, c: SimChamp): Task {
  const t = sim.t;
  if (c.role === 'jungle') return { kind: 'jungle' };
  let lane: Lane = c.laneAssignment === 'jungle' ? 'mid' : c.laneAssignment;
  // lane swaps end around first back / 6 minutes
  if (t > 330 + (c.side * 7)) lane = c.role === 'top' ? 'top' : c.role === 'mid' ? 'mid' : 'bot';
  // mid game: pick the best side wave to farm (sticky), support follows the adc
  if (t > 840) {
    if (c.role === 'support') {
      const adc = sim.champs.find((x) => x.side === c.side && x.role === 'adc' && !x.dead);
      if (adc && adc.task.kind === 'lane') return { kind: 'lane', lane: adc.task.lane, until: t + 30, reason: 'following the ADC' };
      return { kind: 'lane', lane: 'mid', until: t + 20, reason: 'default: mid' };
    }
    return { kind: 'lane', lane: chooseFarmLane(sim, c), until: t + 50, reason: 'best side wave to farm' };
  }
  return { kind: 'lane', lane, reason: 'laning phase' };
}

/** Mid/late game wave assignment: value of incoming minions vs travel time, sharing and danger. */
function chooseFarmLane(sim: MatchSim, c: SimChamp): Lane {
  const pref: Record<string, Lane> = { top: 'top', mid: 'mid', adc: 'bot', jungle: 'mid', support: 'bot' };
  let best: Lane = pref[c.role], bs = -Infinity;
  for (const lane of LANES) {
    const waves = sim.waves.filter((w) => w.lane === lane && w.side !== c.side);
    const minions = waves.reduce((s, w) => s + w.count, 0);
    const pos = lanePosition(sim, c, lane);
    const travel = dist(c.pos, pos) / Math.max(320, c.stats.ms);
    const mates = sim.champs.filter((x) => x.side === c.side && x !== c && !x.dead && x.role !== 'support' && x.task.kind === 'lane' && x.task.lane === lane).length;
    const danger = enemiesWithin(sim, c.side, pos, 2500, true).length;
    const myTower = frontTower(sim, c.side, lane);
    const safety = myTower ? 0 : -0.6;
    let s = minions / (8 + travel * 0.9) - mates * 0.9 - danger * 0.6 + safety + (lane === pref[c.role] ? 0.5 : 0) + (c.task.lane === lane ? 0.4 : 0);
    if (c.role === 'adc' && lane === 'mid') s += 0.25; // adc likes the safer mid wave later on
    s += timingNoise(c, Math.floor(sim.t / 40) * 7 + LANES.indexOf(lane)) * lack(c.input.macro) / 70; // poor macro: wrong wave
    if (s > bs) { bs = s; best = lane; }
  }
  return best;
}

/**
 * Mid-recall, a big enemy wave crashes into our tower and nobody is around: cancel, clear it under
 * the tower (resetting the wave instead of losing it and a plate's worth of tower HP), back after.
 * Not if the recall is almost done or we're too low. Spotting it in time is macro.
 */
function cancelRecallForWave(sim: MatchSim, c: SimChamp): boolean {
  const t = sim.t;
  if (c.role !== 'top' && c.role !== 'mid' && c.role !== 'adc') return false;
  if (c.recallUntil - t < 2 || c.hp < c.stats.maxHp * 0.25 || t > 1500) return false;
  if ((c.recallWaveCheck ?? -99) > t - 3) return false;
  const tw = sim.towers.find((x) => x.alive && x.def.side === c.side && dist(x.def.pos, c.pos) < 1600);
  if (!tw) return false;
  const wave = sim.waves.find((w) => w.side !== c.side && (w.count >= 5 || (w.cannon && w.count >= 4)) && dist(lanePoint(w.lane, w.p), tw.def.pos) < TOWER_RANGE + 600);
  if (!wave) return false;
  c.recallWaveCheck = t;
  if (enemiesWithin(sim, c.side, c.pos, 2000, true).length) return false;
  if (!sim.rng.chance(0.25 + c.input.macro / 150)) return false;
  c.recallUntil = 0;
  c.task = { kind: 'lane', lane: wave.lane, until: t + 20, reason: `cancelled the recall to clear the ${wave.count}-minion wave crashing into our tower` };
  c.waveIntent = 'push'; c.waveIntentUntil = t + 6; c.waveReason = 'clearing the crash under tower';
  return true;
}

/**
 * Recalling is a trade: what we gain (an item spike, HP back) against what we give up (a wave to
 * clear, a lane opponent who is dead or recalling, an objective coming up, a siege the team is on,
 * camps still up for a jungler who sustains off them, enemies dead to push against). Nobody bases
 * just because a fight ended if there's still a wave to shove or a clear to finish. Good macro
 * players weigh it well. Returns why the player recalls now, or null to stay.
 */
function shouldRecall(sim: MatchSim, c: SimChamp): string | null {
  const t = sim.t;
  if (c.task.kind === 'recall' || c.task.kind === 'base') return null;
  if (dist(c.pos, FOUNTAIN[c.side]) < 1500) return null;
  const underTower = sim.towers.some((tw) => tw.alive && tw.def.side === c.side && dist(tw.def.pos, c.pos) < 800);
  if (enemiesWithin(sim, c.side, c.pos, underTower ? 750 : 1400, true).length) return null;
  const hpf = c.hp / c.stats.maxHp;
  const pct = Math.round(hpf * 100);
  // emergency: unplayable HP, or low with a stronger enemy group close by (after a won fight the
  // fleeing survivors don't count). Junglers sustain off camps, so they can go lower.
  const threat = groupPower(enemiesWithin(sim, c.side, c.pos, 3000, true).filter((e) => e.task.kind !== 'flee' && e.hp > e.stats.maxHp * 0.35));
  const friends = groupPower(alliesWithin(sim, c.side, c.pos, 2200));
  if (hpf < (c.role === 'jungle' ? 0.12 : 0.15) || (hpf < 0.3 && threat > friends * 0.8)) return `low HP (${pct}%)`;
  if (t < 200) return null;
  if (c.task.kind === 'objective') {
    const o = sim.objectives.find((x) => x.kind === c.task.objective);
    if (o && (o.alive || o.spawnAt - t < 30) && hpf > 0.25) return null; // stay for the objective
    if (o && o.alive && o.lastHitSide === c.side && t - (o.lastHitAt ?? -99) < 8 && hpf > 0.1) return null; // finish it first
  }
  // ---- what going back buys
  const next = c.items.find((i) => i.frac < 1);
  const nextId = next?.id ?? c.order[c.items.filter((i) => !i.starter).length];
  const item = nextId ? gd().itemById[nextId] : null;
  const need = item ? item.cost * (1 - (next?.frac ?? 0)) : 1300;
  let gain = 0;
  const why: string[] = [];
  if (item && c.gold >= need) { gain += 1.0; why.push(`${Math.round(c.gold)}g completes ${item.name}`); }
  else if (c.gold >= 1250) { gain += 0.45; why.push(`${Math.round(c.gold)}g to spend`); }
  else if (c.gold >= 850) gain += 0.2;
  if (c.gold >= 2500) gain += 0.35;
  gain += hpf < 0.35 ? 0.75 : hpf < 0.5 ? 0.4 : hpf < 0.65 ? 0.12 : 0;
  if (hpf < 0.5) why.push(`HP ${pct}%`);
  if (!why.length && gain < 0.3) return null;
  // ---- what leaving now costs
  let cost = 0;
  const stay: string[] = [];
  const tm = sim.teams[c.side];
  if (c.task.kind === 'lane' && c.task.lane) {
    const lane = c.task.lane;
    const incoming = sim.waves.filter((w) => w.lane === lane && w.side !== c.side && dist(lanePoint(lane, w.p), c.pos) < 1800).reduce((n, w) => n + w.count, 0);
    if (incoming >= 4) { cost += 0.25 + incoming * 0.03; stay.push(`a ${incoming}-minion wave`); }
    const opp = sim.champs.find((e) => e.side !== c.side && e.role !== 'jungle' && e.task.lane === lane && (e.task.kind === 'lane' || e.dead || e.recallUntil > t));
    if (opp && (opp.dead || opp.recallUntil > t)) { cost += 0.45; stay.push(`${opp.input.name} is ${opp.dead ? 'dead' : 'recalling'} — free pressure`); }
  }
  if (c.role === 'jungle' && hpf > 0.3) {
    const up = sim.camps.filter((k) => k.alive && k.def.side === c.side && dist(k.def.pos, c.pos) < 5000).length;
    if (up >= 2) { cost += 0.2 + up * 0.08; stay.push(`${up} camps still up`); }
  }
  for (const o of sim.objectives) {
    const soon = o.alive || (o.spawnAt > 0 && o.spawnAt - t < 50);
    if (!soon || dist(o.pos, c.pos) > 6500) continue;
    const call = tm.objCalls[o.kind]?.d;
    if (call !== 'take' && call !== 'hover') continue;
    cost += o.kind === 'baron' || o.kind === 'elder' ? 0.9 : 0.55;
    stay.push(`${o.kind} ${o.alive ? 'is up' : `in ${Math.round(o.spawnAt - t)}s`}`);
  }
  const dead = sim.champs.filter((e) => e.side !== c.side && e.dead && e.respawnAt - t > 15).length;
  if (dead >= 2) { cost += 0.5; stay.push(`${dead} enemies dead — push it`); } else if (dead === 1 && t > 840) cost += 0.15;
  if ((tm.plan.kind === 'siege' || tm.plan.kind === 'endcall') && c.task.kind === 'push') { cost += 0.55; stay.push('the team is sieging'); }
  // the read: good macro players weigh it right
  const score = gain - cost + sim.rng.normal(0, 0.06 + lack(c.input.macro) / 250);
  if (score < 0.7) {
    if (stay.length && gain >= 0.7 && sim.rng.chance(0.08)) sim.dbg(c, 'recall', `holds the back: ${stay.join(', ')} > ${why.join(', ')}`);
    return null;
  }
  // after a won fight (nobody left to threaten us) laners shove the wave in before backing, so it
  // crashes into their tower while we shop instead of bouncing back to ours
  const laner = c.role === 'top' || c.role === 'mid' || c.role === 'adc';
  const enemyWave = sim.waves.find((w) => w.side !== c.side && w.count >= 3 && dist(lanePoint(w.lane, w.p), c.pos) < 1800);
  if (laner && enemyWave && hpf > 0.3 && threat === 0) {
    const last = c.shoveBackUntil ?? -99;
    if (t > last + 25) {
      c.shoveBackUntil = t + 14;
      c.waveIntentUntil = 0;
      sim.dbg(c, 'recall', `shoves the ${enemyWave.lane} wave in before backing (${why.join(', ')})`);
      return null;
    }
    if (t < last) return null;
  }
  // not instantly: finish the current wave / find a safe spot
  if (!sim.rng.chance(0.3 + c.input.macro / 300)) return null;
  return `${why.join(', ')}${stay.length ? ` (over ${stay.join(', ')})` : ''}`;
}

function safeSpot(sim: MatchSim, c: SimChamp): Vec {
  // nearest allied tower, falling back to the fountain
  let best: Vec = FOUNTAIN[c.side], bd = dist(c.pos, FOUNTAIN[c.side]);
  for (const tw of sim.towers) {
    if (!tw.alive || tw.def.side !== c.side) continue;
    const d = dist(c.pos, tw.def.pos);
    // must be "behind" us relative to enemies: prefer towers closer to our base
    const toBase = dist(tw.def.pos, FOUNTAIN[c.side]) < dist(c.pos, FOUNTAIN[c.side]) + 500;
    if (toBase && d < bd) { bd = d; best = tw.def.pos; }
  }
  return best;
}

// ------------------------------------------------------------------ fights
function fightDecision(sim: MatchSim, c: SimChamp, threats: SimChamp[]): boolean {
  const t = sim.t;
  const side = c.side;
  const center = c.pos;
  let allies = alliesWithin(sim, side, center, 1250);
  const enemies = enemiesWithin(sim, side, center, 1500, true);
  if (!enemies.length) return false;
  // in a teamfight the read is the whole fight, not the few champions next to us: a carry at the back
  // with one diver on them is still in a 5v5 — and their team is right there
  const wideAllies = sim.t > 840 ? alliesWithin(sim, side, center, 2100) : allies;
  const wideEnemies = sim.t > 840 ? enemiesWithin(sim, side, center, 2300, true) : enemies;
  const bigFight = wideAllies.length >= 3 && wideEnemies.length >= 3;
  if (bigFight) allies = wideAllies;
  const tm = sim.teams[side];
  // presence: it's not only who is in the fight — teammates on their way and enemies we can see
  // closing in change the picture (a 2v1 that's about to become 2v2 is no longer worth taking)
  const pres = presence(sim, c, center);
  // tower protection where the fight happens — including where the enemies stand (chasing a target
  // that sits under its tower means fighting the tower too)
  const closest = enemies.reduce((a, b) => (dist2(a.pos, center) <= dist2(b.pos, center) ? a : b));
  const enemyTower = Math.max(towerSupport(sim, (1 - side) as Side, center), towerSupport(sim, (1 - side) as Side, closest.pos) * 0.9);
  const myPow = (groupPower(allies) + pres.ally) * (1 + towerSupport(sim, side, center));
  const enPow = (groupPower(bigFight ? wideEnemies : enemies) + pres.enemy) * (1 + enemyTower);
  // perception error depends on teamfight / macro skill; shared by allies in the same area so teams act together
  const skill = (c.input.tf * 0.4 + c.input.macro * 0.3) / 100 + tm.macro / 100 * 0.3;
  let ratio = myPow / Math.max(1, enPow) * Math.exp(areaNoise(sim, side, center) * 0.28 * (1.2 - skill));
  const hpf = c.hp / c.stats.maxHp;
  const aggression = (c.input.aggression * 0.6 + tm.aggression * 0.4) / 100;
  const inLaning = t < 840 && c.role !== 'jungle' && (c.task.kind === 'lane' || c.task.kind === 'base');
  const contesting = c.task.kind === 'objective' && dist(c.pos, objPos(c.task.objective!)) < 2200;
  const ganking = ((c.task.kind === 'gank' || c.task.kind === 'roam') && c.task.targetIdx !== undefined && enemies.some((e) => e.idx === c.task.targetIdx))
    || (c.gankAssistUntil ?? 0) > t; // following up a teammate's gank
  const sieging = c.task.kind === 'push' || c.task.kind === 'defend';
  const underAttack = threatened(sim, c, enemies);
  // how much of an edge is needed to start a fight in this context
  let engageThreshold = 1.65 - aggression * 0.4;
  if (contesting) engageThreshold = 1.08 - aggression * 0.2;
  const stance = contesting && tm.objStance && tm.objStance.kind === c.task.objective && tm.objStance.until > t ? tm.objStance.stance : null;
  const inPit = enemies.some((e) => dist(e.pos, objPos(c.task.objective!)) < 900);
  if (stance === 'burn' || stance === 'race' || stance === 'smite') engageThreshold = underAttack || inPit ? 1.0 : 3; // stay on it
  else if (stance === 'bait') engageThreshold = underAttack || inPit ? 0.9 - aggression * 0.1 : 2.2; // let them come
  else if (stance === 'fight') engageThreshold = 0.95 - aggression * 0.1;
  // committed to a big objective elsewhere: don't get pulled into side skirmishes on the way
  const committed0 = c.task.kind === 'objective' && !contesting && (c.task.objective === 'baron' || c.task.objective === 'elder') && sim.objectives.some((o) => o.kind === c.task.objective && o.alive);
  if (committed0 && !underAttack) engageThreshold += 0.6;
  else if (sieging) engageThreshold = 1.3 - aggression * 0.25;
  if (ganking) engageThreshold = enemies.length + pres.enemyNames.length > 1 ? 1.1 : 0.75;
  if (c.task.kind === 'help') engageThreshold = Math.min(engageThreshold, 1.0 - aggression * 0.15);
  if (t < 90) engageThreshold += 1; // no level-1 brawls unless invading
  let fleeThreshold = (contesting ? 0.66 : 0.8) - aggression * 0.2;
  // a real teamfight (3v3 or bigger) is hard to walk out of — CC, slows and zones everywhere — so
  // players fight it out unless it's clearly lost; skirmishes and 2v2s stay easy to disengage
  const teamfight = bigFight || (allies.length >= 2 && enemies.length >= 3 && t > 840);
  if (teamfight) fleeThreshold -= 0.14 + (allies.length + 1 + enemies.length >= 8 ? 0.06 : 0);
  if (has(c, 'survivor')) fleeThreshold += 0.08;
  if (has(c, 'overextender')) fleeThreshold -= 0.05;
  if (has(c, 'calculated') || has(c, 'patient_hunter')) fleeThreshold += 0.04;
  if (has(c, 'coinflip')) fleeThreshold -= 0.08;

  // just called off a gank: walk away rather than trade at their tower (unless it's clearly won)
  if ((c.disengageUntil ?? 0) > t && ratio < 1.7) {
    if (c.combatTarget !== null) sim.dbg(c, 'fight', `disengages — gank called off (power ×${ratio.toFixed(2)})`);
    c.combatTarget = null; c.tradeUntil = t;
    const f = FOUNTAIN[side], l = dist(closest.pos, c.pos) || 1;
    const away = { x: c.pos.x + (c.pos.x - closest.pos.x) / l * 600 + (f.x - c.pos.x) * 0.08, y: c.pos.y + (c.pos.y - closest.pos.y) / l * 600 + (f.y - c.pos.y) * 0.08 };
    sim.setDest(c, gd().nav.snap(away));
    return true;
  }
  // laning, healthy, nobody hitting us: the weaker lane gives space and farms from behind instead of running
  if (inLaning && !ganking && hpf > 0.5 && !underAttack && ratio < fleeThreshold && ratio > 0.3 && c.task.kind === 'lane') {
    if (!((c.zonedUntil ?? 0) > t)) sim.dbg(c, 'fight', `zoned by ${enemies.map((e) => e.input.name).join(' + ')}: giving space (power ×${ratio.toFixed(2)})`);
    c.zonedUntil = t + 4 + sim.rng.next() * 2;
    c.combatTarget = null; c.tradeMode = false;
    sim.setDest(c, zonedSpot(sim, c, c.task.lane!));
    return true;
  }
  if (stance === 'smite' && c.summ2 === 'smite' && hpf > 0.25) {
    c.combatTarget = null; // stay on the monster for the smite
    sim.setDest(c, objPos(c.task.objective!));
    return true;
  }
  if (stance === 'retreat' && ratio < 1.2) {
    c.task = { kind: 'group', pos: gd().nav.snap({ x: c.pos.x + (FOUNTAIN[side].x - c.pos.x) * 0.25, y: c.pos.y + (FOUNTAIN[side].y - c.pos.y) * 0.25 }), until: t + 8, reason: `backing off ${tm.objStance!.kind}: ${tm.objStance!.why}` };
    c.combatTarget = null;
    sim.setDest(c, c.task.pos!);
    return true;
  }
  // being chased by a much stronger force → flee
  if (ratio < fleeThreshold || (hpf < 0.22 && ratio < 1.8) || (hpf < 0.35 && ratio < 1 && !contesting)) {
    if (c.task.kind !== 'flee') {
      c.fleeUntil = t + 2 + sim.rng.next() * 1.5;
      // running from a gank gone wrong calls it off: no walking straight back into the same lane
      if ((c.task.kind === 'gank' || c.task.kind === 'roam') && c.task.lane) { c.nextGankAt = t + 25; c.gankOffLane = c.task.lane; c.gankOffUntil = t + 50; }
      if (pres.enemyNames.length) sim.dbg(c, 'help', `retreats: ${pres.enemyNames.join(', ')} closing in`);
    }
    c.task = { kind: 'flee', reason: `outnumbered/outpowered (power ratio ${ratio.toFixed(2)}, HP ${Math.round(hpf * 100)}%)` };
    c.combatTarget = pickTarget(sim, c, enemies.filter((e) => dist(e.pos, c.pos) < c.stats.range + 100)); // shoot while running if possible
    const safe = safeSpot(sim, c);
    if (!escapeDash(sim, c, safe)) sim.setDest(c, safe);
    return true;
  }
  // laning: short trades instead of all-ins
  if (inLaning && !ganking && !(underAttack && ratio > 1.1)) {
    if (c.combatTarget !== null && c.tradeUntil > t) {
      const e = sim.champs[c.combatTarget];
      if (e && !e.dead && !(nearEnemyTower(sim, c.side, e.pos, 50) && c.tradeMode)) { positionInFight(sim, c, e, allies, enemies); return true; }
      c.combatTarget = null; c.tradeMode = false;
    }
    if (c.combatTarget !== null && c.tradeUntil <= t) { c.combatTarget = null; c.tradeMode = false; }
    if (underAttack && ratio < 0.95) { c.combatTarget = null; c.tradeMode = false; sim.setDest(c, safeSpot(sim, c)); c.tradeUntil = t; return true; }
    // answer a trade: hit back briefly
    if (underAttack && ratio >= 0.95 && c.combatTarget === null) {
      const attacker = enemies.find((e) => e.combatTarget === c.idx);
      if (attacker) { c.combatTarget = attacker.idx; c.tradeUntil = t + 1.5; c.tradeMode = true; c.tradeCasts = 0; return true; }
    }
    return laneTrade(sim, c, enemies, ratio);
  }
  // an ongoing engagement continues while it still looks winnable
  const committed = c.combatTarget !== null && c.tradeUntil > t && ratio > fleeThreshold + 0.15;
  if (c.combatTarget !== null && !committed && pres.enemyNames.length && ratio < engageThreshold && !(underAttack && ratio > 0.85)) {
    sim.dbg(c, 'help', `backs off: ${pres.enemyNames.join(', ')} coming to help (power ×${ratio.toFixed(2)})`);
  }
  if (ratio >= engageThreshold || committed || (underAttack && ratio > 0.85)) {
    // don't dive towers without a clear advantage
    const target = pickTarget(sim, c, enemies);
    if (target === null) return false;
    const e = sim.champs[target];
    const tw = nearEnemyTower(sim, side, e.pos, 50);
    const diveBar = has(c, 'dive_bomber') ? 1.45 : 1.8;
    if (tw && !((c.diveUntil ?? 0) > t) && !(ratio > diveBar + (1 - skill) * 0.4 && e.hp < burstEstimate(c, e, t) * 1.3) && !threatened(sim, c, enemies)) {
      if (c.combatTarget === target) c.combatTarget = null;
      return false;
    }
    // chase limits: a target out of reach — running, or just walking off to its camp — is given up
    // after a few seconds of not gaining on it, near their towers, far from our objective, or when it
    // would drag a laner away from the wave they're responsible for
    const gap = dist(e.pos, c.pos);
    if (gap > c.stats.range + 150) {
      if (c.combatTarget !== target || c.chaseStart === 0) { c.chaseStart = t; c.chaseGap = gap; }
      else if (gap < (c.chaseGap ?? gap) - 40) c.chaseStart = Math.min(t, c.chaseStart + (t - c.lastDecisionAt)); // closing in: not a chase yet
      c.chaseGap = gap;
      const killable = e.hp < burstEstimate(c, e, t) * 1.1;
      const patience = 2.5 + c.input.aggression / 40 + (e.hp < e.stats.maxHp * 0.15 ? 2 : 0) + (killable ? 1 : 0) + (ganking ? 2.5 : 0) + (teamfight ? 1.5 : 0); // a gank runs them down; a won teamfight cleans up
      const farFromObjective = c.task.kind === 'objective' && dist(c.pos, objPos(c.task.objective!)) > 2600;
      const leash = laneLeash(sim, c, e, killable);
      if (t - c.chaseStart > patience || farFromObjective || leash || !sim.isVisibleTo(side, e.idx)) {
        sim.dbg(c, 'fight', `stops chasing ${e.input.name}${leash ? ` (${leash})` : farFromObjective ? ' (too far from the objective)' : !sim.isVisibleTo(side, e.idx) ? ' (lost vision)' : ''}`);
        c.combatTarget = null; c.chaseStart = 0; c.tradeUntil = t;
        return false;
      }
    } else c.chaseStart = 0;
    if (c.combatTarget !== target) sim.dbg(c, 'fight', `${c.combatTarget === null ? 'engages' : 'switches to'} ${e.input.name} — power ×${ratio.toFixed(2)} (${allies.length}v${enemies.length}${underAttack ? ', under attack' : ''}${ganking ? ', gank' : ''}${contesting ? ', objective' : ''})`);
    c.combatTarget = target;
    c.tradeMode = false;
    if (c.tradeUntil < t + 3) c.tradeUntil = t + 5;
    positionInFight(sim, c, e, allies, enemies);
    return true;
  }
  if (c.combatTarget !== null && c.tradeUntil <= t) c.combatTarget = null;
  return false;
}

/**
 * A laner on lane / push duty doesn't follow a target far from that lane: the wave they're leaving is
 * the gold they're paid in. A kill that's right there is worth a little more rope; a wave crashing
 * into our tower while we're away is worth less. Returns why to stop, or null.
 */
function laneLeash(sim: MatchSim, c: SimChamp, e: SimChamp, killable: boolean): string | null {
  const k = c.task.kind;
  if ((k !== 'lane' && k !== 'push') || !c.task.lane || c.role === 'jungle' || (c.gankAssistUntil ?? 0) > sim.t) return null;
  const lane = c.task.lane;
  const off = laneDistance(lane, e.pos);
  let limit = killable ? 2600 : sim.t < 840 ? 1250 : 1700;
  const losing = sim.waves.some((w) => w.lane === lane && w.side !== c.side && w.count >= 5 && dist(lanePoint(lane, w.p), c.pos) > 2000
    && sim.towers.some((tw) => tw.alive && tw.def.side === c.side && dist(tw.def.pos, lanePoint(lane, w.p)) < TOWER_RANGE + 400));
  if (losing) limit *= 0.75;
  return off > limit ? `leaving the ${lane} wave${losing ? ' crashing into our tower' : ''}` : null;
}

/** Reinforcements beyond the fight radius, weighted by how soon they arrive (power units). */
function presence(sim: MatchSim, c: SimChamp, center: Vec) {
  let ally = 0, enemy = 0;
  const allyNames: string[] = [], enemyNames: string[] = [];
  for (const x of sim.champs) {
    if (x.dead || x === c || x.recallUntil > sim.t || x.task.kind === 'flee') continue;
    const d = dist(x.pos, center);
    if (x.side === c.side) {
      if (d <= 1250 || d > 3200) continue;
      // only teammates actually on their way (or idle right next to it) count
      const helping = x.task.kind === 'help' && x.task.targetIdx !== undefined && dist(sim.champs[x.task.targetIdx].pos, center) < 1500;
      if (!helping && !(d < 2200 && x.combatTarget === null && x.lastCombatAt < sim.t - 2)) continue;
      const w = clamp(1 - (d - 1250) / 1950, 0, 1) * (helping ? 0.7 : 0.35);
      if (w <= 0.05) continue;
      ally += champPower(x) * w; allyNames.push(x.input.name);
    } else {
      if (d <= 1500 || d > 3200 || !sim.isVisibleTo(c.side, x.idx)) continue;
      const w = clamp(1 - (d - 1500) / 1700, 0, 1) * (x.task.kind === 'help' ? 0.85 : 0.6);
      if (w <= 0.05) continue;
      enemy += champPower(x) * w; enemyNames.push(x.input.name);
    }
  }
  return { ally, enemy, allyNames, enemyNames };
}

/**
 * A teammate nearby is being collapsed on: go help — unless it's hopeless (don't throw a second
 * life away). Noticing in time is macro; tunnel vision on farm happens to everyone sometimes.
 */
function maybeHelp(sim: MatchSim, c: SimChamp): boolean {
  const t = sim.t;
  if ((c.helpCheckAt ?? 0) > t || c.task.kind === 'help' || c.task.kind === 'defend') return false;
  c.helpCheckAt = t + (has(c, 'counter_ganker') ? 0.5 : 1);
  if (c.hp < c.stats.maxHp * 0.4) return false;
  if (c.task.kind === 'objective' && sim.objectives.some((o) => o.kind === c.task.objective && [...o.attackers].includes(c.idx))) return false;
  const bigCall = c.task.kind === 'objective' && (c.task.objective === 'baron' || c.task.objective === 'elder') ? sim.objectives.find((o) => o.kind === c.task.objective && o.alive) : undefined;
  const ms = Math.max(330, c.stats.ms);
  let best: { a: SimChamp; ratio: number; attackers: SimChamp[]; score: number } | null = null;
  for (const a of sim.champs) {
    if (a.side !== c.side || a === c || a.dead || a.recallUntil > t) continue;
    const d = dist(a.pos, c.pos);
    if (d < 1300 || d > ms * 5.5) continue; // closer than that: the fight logic already sees it
    if (bigCall && dist(a.pos, bigCall.pos) > 3000) continue; // the team is on Baron: no side skirmishes
    // a real attack, not a poke: two or more on them, or an all-in
    const attackers = sim.champs.filter((e) => e.side !== c.side && !e.dead && e.combatTarget === a.idx && dist(e.pos, a.pos) < 1400);
    if (!attackers.length || (attackers.length < 2 && attackers.every((e) => e.tradeMode))) continue;
    const near = sim.champs.filter((x) => x.side === c.side && !x.dead && x !== c && dist(x.pos, a.pos) < 1300);
    const enemiesThere = sim.champs.filter((e) => e.side !== c.side && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, a.pos) < 1600);
    const arrive = d / ms;
    const ratio = (groupPower(near) + champPower(c) * clamp(1.2 - arrive / 6, 0.4, 1)) / Math.max(1, groupPower(enemiesThere));
    if (ratio < 0.95) continue; // arriving into a lost fight just feeds a second kill
    const score = ratio - arrive / 6 + (a.role === 'adc' || a.role === 'mid' ? 0.15 : 0);
    if (!best || score > best.score) best = { a, ratio, attackers, score };
  }
  if (!best) return false;
  const { a, ratio, attackers } = best;
  const p = 0.4 + c.input.macro / 250 + c.input.aggression / 400 + (has(c, 'survivor') ? -0.1 : 0) + (t < 840 && c.task.kind === 'lane' ? -0.12 : 0);
  if (!sim.rng.chance(p)) {
    sim.dbg(c, 'help', `doesn't rotate to ${a.input.name} (tunnel vision on ${c.task.kind})`);
    c.helpCheckAt = t + 5;
    return false;
  }
  if (c.recallUntil > t) c.recallUntil = 0; // cancel the recall
  c.combatTarget = null;
  c.task = { kind: 'help', targetIdx: a.idx, until: t + 9, reason: `${a.input.name} jumped by ${attackers.map((e) => e.input.name).join(' + ')} — joining (projected ×${ratio.toFixed(2)})` };
  sim.setDest(c, a.pos);
  return true;
}

function doHelp(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  const a = c.task.targetIdx !== undefined ? sim.champs[c.task.targetIdx] : null;
  const stillHot = a && !a.dead && sim.champs.some((e) => e.side !== c.side && !e.dead && dist(e.pos, a.pos) < 1500 && (e.combatTarget === a.idx || e.lastCombatAt > t - 2));
  if (!a || a.dead || !stillHot || (c.task.until ?? 0) < t) {
    if (a?.dead) sim.dbg(c, 'help', `too late: ${a.input.name} died`);
    c.task = defaultTask(sim, c);
    return;
  }
  sim.setDest(c, a.pos);
}

function threatened(sim: MatchSim, c: SimChamp, enemies: SimChamp[]) {
  for (const e of enemies) if (e.combatTarget === c.idx && e.lastCombatAt > sim.t - 1.5) return true;
  return c.lastCombatAt > sim.t - 1 && c.lastDamagedBy.size > 0;
}

function laneTrade(sim: MatchSim, c: SimChamp, enemies: SimChamp[], ratio: number): boolean {
  const t = sim.t;
  if (c.tradeUntil > t && c.combatTarget !== null) {
    const e = sim.champs[c.combatTarget];
    if (e && !e.dead) { positionInFight(sim, c, e, [], enemies); return true; }
  }
  if (t < c.nextTradeCheck || t < 75) {
    if (c.combatTarget !== null && c.tradeUntil < t) { c.combatTarget = null; c.tradeMode = false; }
    return false;
  }
  c.nextTradeCheck = t + 3.5 + sim.rng.next() * 4;
  const e = enemies.sort((a, b) => dist2(a.pos, c.pos) - dist2(b.pos, c.pos))[0];
  if (!e || dist(e.pos, c.pos) > Math.max(c.stats.range + 300, 700)) return false;
  if (nearEnemyTower(sim, c.side, e.pos, 100)) return false;
  const hpf = c.hp / c.stats.maxHp, ehpf = e.hp / e.stats.maxHp;
  const laneAdv = (c.input.lane - e.input.lane) / 100 + (c.champ.profile.laning - e.champ.profile.laning) / 20 + (c.level - e.level) * 0.08 + (hpf - ehpf) * 0.5
    + matchupEdge(c.champ.id, e.champ.id, c.role) * 4.5; // a favourable lane matchup trades more
  const killable = e.hp < burstEstimate(c, e, t) * (0.6 + c.input.mech / 500) && hpf > 0.35;
  const p = clamp(0.1 + laneAdv * 0.7 + (c.input.aggression - 50) / 220 + (ratio - 1) * 0.2, 0.01, 0.6);
  if (killable && ratio > 1.05 && sim.rng.chance(0.35 + c.input.aggression / 300)) {
    c.combatTarget = e.idx; c.tradeUntil = t + 6; c.tradeMode = false; // all in
    sim.dbg(c, 'fight', `all-in on ${e.input.name}: killable (enemy HP ${Math.round(ehpf * 100)}%)`);
    return true;
  }
  if (hpf > 0.45 && sim.rng.chance(p)) {
    sim.dbg(c, 'fight', `short trade on ${e.input.name} (lane edge ${laneAdv.toFixed(2)})`);
    c.combatTarget = e.idx;
    c.tradeUntil = t + 1.5 + sim.rng.next() * 1.2;
    c.tradeMode = true; c.tradeCasts = 0;
    return true;
  }
  return false;
}

function pickTarget(sim: MatchSim, c: SimChamp, enemies: SimChamp[]): number | null {
  if (!enemies.length) return null;
  const tf = c.input.tf / 100;
  const melee = c.champ.attackType === 'melee';
  const mobility = c.champ.profile.mobility / 10;
  let best: SimChamp | null = null, bs = -Infinity;
  for (const e of enemies) {
    const d = dist(e.pos, c.pos);
    const hpf = e.hp / e.stats.maxHp;
    const carry = e.role === 'adc' || e.role === 'mid' ? 1 : e.role === 'support' ? 0.2 : 0.5;
    let s = (1 - hpf) * 1.0 + carry * tf * 0.8 - d / 1400;
    if (melee) s -= Math.max(0, d - 450) / 1000 * (1 - mobility);
    if (d <= c.stats.range + 130) s += 0.5;
    if (e.ccUntil > sim.t) s += 0.3;
    if (c.combatTarget === e.idx) s += 0.25; // stickiness
    // focus fire: teams that play together hit the same target — that's what turns a fight into kills
    let focus = 0;
    for (const a of sim.champs) if (a.side === c.side && a !== c && !a.dead && a.combatTarget === e.idx && dist2(a.pos, c.pos) < 1600 * 1600) focus++;
    s += Math.min(3, focus) * (0.12 + tf * 0.22 + sim.teams[c.side].macro / 100 * 0.1);
    // peel: supports/tanks punish divers on their carries
    if ((c.role === 'support' || c.champ.profile.peel >= 7) && e.combatTarget !== null) {
      const victim = sim.champs[e.combatTarget];
      if (victim && victim.side === c.side && (victim.role === 'adc' || victim.role === 'mid')) s += 0.6 * tf;
    }
    if (s > bs) { bs = s; best = e; }
  }
  return best ? best.idx : null;
}

function positionInFight(sim: MatchSim, c: SimChamp, e: SimChamp, _allies: SimChamp[], enemies: SimChamp[]) {
  const d = dist(c.pos, e.pos);
  const range = c.stats.range;
  if (c.champ.attackType === 'ranged') {
    // kite: keep at ~90% range, step back from nearby melee threats
    const closeMelee = enemies.find((x) => x.champ.attackType === 'melee' && dist(x.pos, c.pos) < 280);
    if (closeMelee && c.input.mech + c.input.tf > 110) {
      const away = { x: c.pos.x + (c.pos.x - closeMelee.pos.x) * 0.8, y: c.pos.y + (c.pos.y - closeMelee.pos.y) * 0.8 };
      sim.steer(c, gd().nav.snap(away));
    } else if (d > range * 0.92) sim.steer(c, e.pos, range * 0.85);
    else { c.path = []; c.dest = null; }
  } else {
    if (d > range + 80) sim.steer(c, e.pos, range * 0.6);
    else { c.path = []; c.dest = null; }
  }
}

// ------------------------------------------------------------------ laning
function doLane(sim: MatchSim, c: SimChamp, lane: Lane) {
  const t = sim.t;
  // jungler awareness: back off when an unseen jungler could be around and we're pushed up
  const tm = sim.teams[c.side];
  const enemyJg = sim.champs.find((x) => x.side !== c.side && x.role === 'jungle');
  let caution = 0;
  if (t <= 840 && enemyJg && !enemyJg.dead) {
    const seen = tm.lastSeen.get(enemyJg.idx);
    const visibleNear = sim.isVisibleTo(c.side, enemyJg.idx) && dist(enemyJg.pos, c.pos) < 3200;
    const shownFar = seen && t - seen.t < 30 && dist(seen.pos, c.pos) > 7000;
    const prog = laneProgress(lane, c.pos);
    const overextended = c.side === 0 ? prog > 0.56 : prog < 0.44;
    if (visibleNear && sim.rng.chance(0.4 + c.input.macro / 200 - (enemyJg.input.pathing - 50) / 250)) caution = 1;
    else if (!shownFar && overextended && (!seen || t - seen.t > 20)) {
      // respecting fog when pushed up: good macro players back off a little, poor ones ignore it —
      // but a wave crashing into their turret is the window to take a plate, and it's taken
      const crashing = sim.waves.some((w) => w.side === c.side && w.lane === lane && w.stopped && sim.towers.some((tw) => tw.alive && tw.def.side !== c.side && tw.def.lane === lane && dist(lanePoint(lane, w.p), tw.def.pos) < TOWER_RANGE + 200));
      caution = c.input.macro / 100 * 0.6 * (crashing ? 0.25 : 1);
    }
  }
  let pos = (c.zonedUntil ?? 0) > t ? zonedSpot(sim, c, lane) : lanePosition(sim, c, lane);
  if (caution > 0) {
    const tw = frontTower(sim, c.side, lane);
    if (tw) pos = { x: pos.x + (tw.def.pos.x - pos.x) * 0.5 * caution, y: pos.y + (tw.def.pos.y - pos.y) * 0.5 * caution };
  }
  // support: stick with adc in lane
  if (c.role === 'support') {
    const adc = sim.champs.find((x) => x.side === c.side && x.role === 'adc' && !x.dead && x.task.kind === 'lane');
    if (adc && dist(adc.pos, c.pos) > 600) pos = { x: (pos.x + adc.pos.x) / 2, y: (pos.y + adc.pos.y) / 2 };
  }
  if (t >= c.waveIntentUntil) { if (t > 840) midWaveIntent(sim, c, lane); else decideWaveIntent(sim, c, lane); }
  // mid game: lane empty for now → take a nearby own-side camp (pros farm the jungle between waves)
  if (t > 840 && c.role !== 'support' && c.role !== 'jungle') {
    const enemyWaveNear = sim.waves.some((w) => w.lane === lane && w.side !== c.side && dist(lanePoint(lane, w.p), pos) < 2600);
    if (!enemyWaveNear) {
      const campRange = 1800 + c.input.macro * 22; // good macro players fill the gap between waves
      const camp = sim.camps.filter((k) => k.alive && k.def.side === c.side && k.def.kind !== 'blue' && k.def.kind !== 'red' && dist(k.def.pos, c.pos) < campRange)
        .sort((a, b) => dist(a.def.pos, c.pos) - dist(b.def.pos, c.pos))[0];
      const jgNear = sim.champs.some((x) => x.side === c.side && x.role === 'jungle' && !x.dead && camp && dist(x.pos, camp.def.pos) < 2500);
      if (camp && !jgNear && !enemiesWithin(sim, c.side, camp.def.pos, 2500, true).length) {
        c.task = { kind: 'jungle', campId: camp.def.id, until: t + 25, reason: 'no wave in lane: taking a camp between waves' };
        sim.setDest(c, camp.def.pos);
        return;
      }
    }
  }
  // freezing: hold just in front of our own wave so the enemy has to walk up to farm
  if (c.waveIntent === 'freeze' && c.role !== 'support') {
    const mine = sim.waves.filter((w) => w.lane === lane && w.side === c.side);
    if (mine.length) {
      const front = c.side === 0 ? Math.max(...mine.map((w) => w.p)) : Math.min(...mine.map((w) => w.p));
      pos = lanePoint(lane, front + (c.side === 0 ? -1 : 1) * 250 / (lane === 'mid' ? 11800 : 20000));
    }
  }
  sim.setDest(c, pos);

  // roams / ganks from lane (mid & support): only with lane priority (wave pushed in / opponent absent)
  if ((c.role === 'mid' || c.role === 'support') && t > 210) {
    const prio = lanePriority(sim, c.side, lane);
    if (prio > 0.25 && sim.rng.chance(0.03 * prio * (c.champ.profile.roam / 5) * (0.5 + c.input.pathing / 100) * (has(c, 'roaming_menace') ? 1.7 : has(c, 'roam_timer') ? 1.35 : has(c, 'lane_glued') ? 0.5 : 1))) {
      const target = bestGankLane(sim, c, lane);
      if (target && target.score > 0.5) {
        c.task = { kind: 'roam', lane: target.lane, until: t + 30, targetIdx: target.victim, reason: `lane priority ${prio.toFixed(2)} — roam (score ${target.score.toFixed(2)})` };
        if (sim.rng.chance(0.35)) sim.event('gank', `${c.input.name} uses mid priority to roam ${target.lane}`, c.side);
      }
    }
  }
}

// ------------------------------------------------------------------ mid-game wave clearing
/** How far a point on a lane is toward the enemy base for c's team (0 = our base, 1 = theirs). */
const depthOf = (c: SimChamp, lane: Lane, p: Vec) => (c.side === 0 ? laneProgress(lane, p) : 1 - laneProgress(lane, p));

/**
 * Ambush risk at a spot (0..1). Rises the deeper it is toward their side and the more enemies are
 * missing (or could have walked there since they were last seen); falls with our wards and turrets
 * nearby. Enemies shown far away don't count — that's what lets a team shove safely.
 */
function ambushRisk(sim: MatchSim, c: SimChamp, lane: Lane, p: Vec): number {
  const t = sim.t;
  const tm = sim.teams[c.side];
  const deep = clamp((depthOf(c, lane, p) - 0.36) / 0.4, 0, 1);
  let missing = 0, near = 0;
  for (const e of sim.champs) {
    if (e.side === c.side || e.dead) continue;
    if (sim.isVisibleTo(c.side, e.idx)) { if (dist(e.pos, p) < 3500) near++; continue; }
    const seen = tm.lastSeen.get(e.idx);
    if (!seen) { missing += 1; continue; }
    const slack = dist(seen.pos, p) - e.stats.ms * (t - seen.t); // could they be here by now?
    missing += slack < 1500 ? 1 : slack < 4000 ? 0.5 : 0;
  }
  const wards = sim.wards.filter((w) => w.side === c.side && dist(w.pos, p) < 2600).length;
  const tower = sim.towers.some((tw) => tw.alive && tw.def.side === c.side && dist(tw.def.pos, p) < 1600);
  const cover = Math.min(0.8, Math.min(0.6, wards * 0.2) + (tower ? 0.5 : 0));
  return clamp((deep * (0.1 + missing * 0.18) + near * 0.12) * (1 - cover), 0, 1);
}

/** How soon the team needs this player elsewhere (0..1): objective setups, grouped plays, skirmishes. */
function rotationUrgency(sim: MatchSim, c: SimChamp): number {
  const t = sim.t;
  const tm = sim.teams[c.side];
  let u = 0;
  for (const o of sim.objectives) {
    const until = o.alive ? 0 : o.spawnAt - t;
    if (!o.alive && !(o.spawnAt > 0 && until < 75)) continue;
    if (tm.objCalls[o.kind]?.d === 'concede') continue;
    const value = o.kind === 'baron' || o.kind === 'elder' ? 1 : o.kind === 'dragon' ? 0.8 : 0.55;
    const slack = until - dist(c.pos, o.pos) / Math.max(320, c.stats.ms);
    u = Math.max(u, value * clamp(1 - slack / 50, 0.25, 1));
  }
  if (tm.plan.kind === 'siege' || tm.plan.kind === 'defend' || tm.plan.kind === 'endcall') u = Math.max(u, 0.8);
  if (t > 1500) u = Math.max(u, 0.35); // late game: stay ready to group
  if (sim.champs.some((a) => a.side === c.side && a !== c && !a.dead && a.lastCombatAt > t - 2 && dist(a.pos, c.pos) < 5000)) u = Math.max(u, 0.9);
  return u;
}

/**
 * Mid/late-game wave clearing: farming is clearing waves for gold, so players still walk to side
 * waves and then rotate. Needed elsewhere soon → hard push (fast clear, step up to the wave).
 * Suspecting an ambush → clear carefully from range, and let deep waves come to them; the deeper
 * the wave and the more enemies missing, the more alert they are. Macro is reading the map well:
 * poor macro players face-check deep waves or waste time playing scared on a safe map.
 */
function midWaveIntent(sim: MatchSim, c: SimChamp, lane: Lane) {
  const t = sim.t;
  c.waveIntentUntil = t + 2.5 + sim.rng.next() * 2.5;
  if ((c.shoveBackUntil ?? 0) > t) { c.waveIntent = 'push'; c.alert = 0; c.waveReason = 'shoving before backing'; return; }
  const theirs = sim.waves.filter((w) => w.lane === lane && w.side !== c.side && w.count > 0);
  if (!theirs.length) { c.waveIntent = 'push'; c.alert = 0; c.waveReason = 'waiting for the next wave'; return; }
  const front = theirs.reduce((a, b) => (depthOf(c, lane, lanePoint(lane, a.p)) <= depthOf(c, lane, lanePoint(lane, b.p)) ? a : b));
  if (front.supers > 0 && depthOf(c, lane, lanePoint(lane, front.p)) < 0.5) { c.waveIntent = 'push'; c.alert = 0; c.waveReason = 'clearing super minions'; return; }
  const risk = ambushRisk(sim, c, lane, lanePoint(lane, front.p));
  const read = clamp(risk + sim.rng.normal(0, 0.03 + lack(c.input.macro) / 300), 0, 1);
  const urgency = rotationUrgency(sim, c);
  const tolerance = 0.38 + (c.input.aggression - 50) / 300 + (has(c, 'coinflip') ? 0.08 : 0) - (has(c, 'survivor') ? 0.05 : 0)
    + (has(c, 'overextender') ? 0.05 : 0) - (has(c, 'calculated') || has(c, 'patient_hunter') ? 0.04 : 0);
  c.alert = read;
  if (read > tolerance + urgency * 0.15) { c.waveIntent = 'careful'; c.waveReason = read > 0.65 ? 'letting the wave come (ambush risk)' : 'careful clear — enemies missing'; }
  else if (urgency > 0.45) { c.waveIntent = 'push'; c.waveReason = 'hard push — needed elsewhere'; }
  else if (front.count >= 9) { c.waveIntent = 'push'; c.waveReason = 'shoving a big wave'; }
  else { c.waveIntent = 'hold'; c.waveReason = 'farming'; }
}

/** Consistent per-player uniform draw (0..1) for one decision window. */
function timingUniform(c: SimChamp, key: number): number {
  let h = Math.imul(Math.floor(key) + 0x9e3779b9, 2654435761) ^ Math.imul(c.idx + 17, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

/** Consistent per-player misread (≈N(0,1)) for one decision, e.g. one objective timer. */
function timingNoise(c: SimChamp, key: number): number {
  const u = timingUniform(c, key);
  return Math.log((u + 1e-4) / (1 - u + 1e-4)) * 0.55;
}

/**
 * On the way to an objective: is there a wave worth clearing first? Laners shove a nearby wave
 * when there's time before they're needed, then rotate. Good macro players judge the timing well;
 * poor ones clear when there's no time (arrive late) or walk past free gold.
 */
function waveBeforeObjective(sim: MatchSim, c: SimChamp, o: { kind: ObjectiveKind; pos: Vec; alive: boolean; spawnAt: number; hp: number; maxHp: number; attackers: Set<number> }): { lane: Lane; pos: Vec } | null {
  if (c.role === 'jungle' || c.role === 'support' || sim.t <= 840) return null;
  const t = sim.t;
  const enemy = (1 - c.side) as Side;
  const contested = sim.champs.some((e) => e.side === enemy && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, o.pos) < 3000);
  if (contested || [...o.attackers].some((i) => sim.champs[i].side === enemy)) return null;
  // time until the team needs us at the pit
  let budget: number;
  if (!o.alive) budget = o.spawnAt - t;
  else if ([...o.attackers].some((i) => sim.champs[i].side === c.side)) budget = o.hp / o.maxHp * (o.kind === 'baron' ? 14 : 8) - 4;
  else budget = 6; // called and up: only a wave that's practically on the way
  let best: { lane: Lane; pos: Vec; score: number } | null = null;
  for (const w of sim.waves) {
    if (w.side === c.side || w.count < 3) continue;
    const wp = lanePoint(w.lane, w.p);
    const d = dist(wp, c.pos);
    if (d > 2600 || depthOf(c, w.lane, wp) > 0.66) continue;
    const ms = Math.max(320, c.stats.ms);
    const clearTime = w.hp / Math.max(60, sim.waveClearDps(c, w.count));
    const detour = d / ms + clearTime + dist(wp, o.pos) / ms - dist(c.pos, o.pos) / ms;
    // timing read: good macro players get this right, poor ones misjudge by several seconds
    const err = timingNoise(c, o.spawnAt + w.p * 1000 + Math.floor(t / 20)) * (2 + lack(c.input.macro) / 6);
    if (detour + err > budget) continue;
    const score = w.count * w.goldEach - detour * 10;
    if (!best || score > best.score) best = { lane: w.lane, pos: wp, score };
  }
  return best;
}

/**
 * Lane priority for `side` on a lane (-1..1): our front wave pushed toward their tower and/or
 * the enemy laner absent. A pushed wave pins the enemy laner and frees ours to move first.
 */
export function lanePriority(sim: MatchSim, side: Side, lane: Lane): number {
  const mine = sim.waves.filter((w) => w.lane === lane && w.side === side);
  const theirs = sim.waves.filter((w) => w.lane === lane && w.side !== side);
  const myFront = mine.length ? (side === 0 ? Math.max(...mine.map((w) => w.p)) : 1 - Math.min(...mine.map((w) => w.p))) : 0.3;
  const theirFront = theirs.length ? (side === 0 ? 1 - Math.min(...theirs.map((w) => w.p)) : Math.max(...theirs.map((w) => w.p))) : 0.3;
  let prio = (myFront - theirFront) * 2.2; // wave state
  // our wave crashing into their tower = strong priority
  const crashing = mine.some((w) => w.stopped && sim.towers.some((tw) => tw.alive && tw.def.side !== side && tw.def.lane === lane && dist(lanePoint(lane, w.p), tw.def.pos) < TOWER_RANGE + 200));
  if (crashing) prio += 0.4;
  const enemyLaners = sim.champs.filter((e) => e.side !== side && e.role !== 'jungle' && e.task.kind === 'lane' && e.task.lane === lane);
  if (enemyLaners.length && enemyLaners.every((e) => e.dead || e.recallUntil > sim.t)) prio += 0.5;
  return clamp(prio, -1, 1);
}

/**
 * Wave management. Reads the wave (where it is, who has more minions) and the player's goal:
 *  - push:   crash the wave (before recalling / roaming / an objective on this side)
 *  - slow:   build a big wave that will crash into their tower (setting up a dive or plates)
 *  - freeze: keep the wave near our tower when winning lane or when we fear a gank
 *  - hold:   just last-hit
 * Players with poor macro/laning make worse choices.
 */
function decideWaveIntent(sim: MatchSim, c: SimChamp, lane: Lane) {
  const t = sim.t;
  c.waveIntentUntil = t + 6 + sim.rng.next() * 6;
  if ((c.shoveBackUntil ?? 0) > t) { c.waveIntent = 'push'; c.waveReason = 'shoving before backing'; c.waveIntentUntil = t + 3; return; }
  const mine = sim.waves.filter((w) => w.lane === lane && w.side === c.side);
  const theirs = sim.waves.filter((w) => w.lane === lane && w.side !== c.side);
  const myCount = mine.reduce((s, w) => s + w.count, 0), theirCount = theirs.reduce((s, w) => s + w.count, 0);
  const clash = mine.length && theirs.length ? (c.side === 0 ? (Math.max(...mine.map((w) => w.p)) + Math.min(...theirs.map((w) => w.p))) / 2 : 1 - (Math.min(...mine.map((w) => w.p)) + Math.max(...theirs.map((w) => w.p))) / 2) : 0.5; // 0 = our base .. 1 = theirs
  const opp = sim.champs.find((e) => e.side !== c.side && !e.dead && e.role !== 'jungle' && e.task.kind === 'lane' && e.task.lane === lane);
  const adv = opp ? (c.input.lane - opp.input.lane) / 100 + (c.champ.profile.laning - opp.champ.profile.laning) / 20 + (c.level - opp.level) * 0.06 + (c.hp / c.stats.maxHp - opp.hp / opp.stats.maxHp) * 0.3 + matchupEdge(c.champ.id, opp.champ.id, c.role) * 2 : 0.3;
  const enemyJg = sim.champs.find((e) => e.side !== c.side && e.role === 'jungle');
  const jgSeen = enemyJg ? sim.teams[c.side].lastSeen.get(enemyJg.idx) : undefined;
  const gankRisk = enemyJg && !enemyJg.dead && (!jgSeen || t - jgSeen.t > 20 || dist(jgSeen.pos, c.pos) < 4500);
  const recallSoon = c.gold > 1050 || c.hp < c.stats.maxHp * 0.45;
  const half = lane === 'top' ? 'top' : lane === 'bot' ? 'bot' : 'mid';
  const objSoon = sim.objectives.some((o) => (o.alive || (o.spawnAt > 0 && o.spawnAt - t < 70)) && (half === 'mid' || (o.kind === 'dragon' || o.kind === 'elder' ? 'bot' : 'top') === half));
  const wantsRoam = (c.role === 'mid' || c.role === 'support') && c.champ.profile.roam >= 6 && c.input.aggression > 45;
  let intent: SimChamp['waveIntent'];
  let reason: string;
  if (recallSoon) { intent = 'push'; reason = 'crash before recall'; }
  else if (objSoon) { intent = 'push'; reason = 'priority for objective'; }
  else if (!opp) { intent = 'push'; reason = 'free lane'; }
  else if (adv > 0.12 && clash < 0.42) { intent = 'freeze'; reason = 'freeze to deny'; }
  else if (gankRisk && adv < 0 && clash < 0.5) { intent = 'freeze'; reason = 'freeze near tower (gank threat)'; }
  else if (adv > 0.05 && myCount >= theirCount) { intent = 'slow'; reason = 'slow push for a crash'; }
  else if (wantsRoam) { intent = 'push'; reason = 'push to roam'; }
  else { intent = 'hold'; reason = 'last-hitting'; }
  // decision quality
  const skill = (c.input.macro * 0.6 + c.input.lane * 0.4) / 100;
  if (sim.rng.chance((1 - skill) * 0.45)) { intent = sim.rng.pick(['push', 'slow', 'hold', 'freeze'] as const); reason = 'poor wave management'; }
  c.waveIntent = intent;
  c.waveReason = reason;
}

/** How hard champions hit structures (tuned for structure timings: first tower ~15 min, first inhibitor ~26). */
const STRUCTURE_HIT = 1.4;

/** Champions in lane/push/defend tasks damage enemy waves (last hitting / shoving) and towers. Called every tick. */
export function champActions(sim: MatchSim, dt: number) {
  const t = sim.t;
  for (const c of sim.turnOrder) {
    if (c.dead || c.ccUntil > t || c.recallUntil > t || c.combatTarget !== null) continue;
    const k = c.task.kind;
    // minions inside our base get hit by whoever walks past (heading out, grouping, helping)
    const homeClear = (k === 'base' || k === 'group' || k === 'help' || k === 'jungle' || k === 'gank') && dist2(c.pos, NEXUS[c.side]) < 5200 * 5200;
    if (k !== 'lane' && k !== 'push' && k !== 'defend' && k !== 'objective' && k !== 'roam' && !homeClear) continue;
    const lane = c.task.lane ?? nearestLane(c.pos);
    // enemy wave in reach
    let wave = null as null | (typeof sim.waves)[number];
    let wd = Infinity;
    for (const w of sim.waves) {
      if (w.side === c.side || w.count <= 0) continue;
      const d = dist2(lanePoint(w.lane, w.p), c.pos);
      if (d < wd) { wd = d; wave = w; }
    }
    const reach = Math.max(c.stats.range + 200, 550);
    if (wave && wd < reach * reach) {
      const intent = k === 'push' || k === 'defend' || homeClear ? 'push' : k === 'lane' ? c.waveIntent : t > 840 ? 'push' : 'hold';
      const lastHitDps = c.stats.ad * c.stats.as * 0.75 + c.stats.ap * 0.15;
      const clear = sim.waveClearDps(c, wave.count);
      const dps = intent === 'push' ? clear : intent === 'careful' ? lastHitDps * 0.8 + clear * 0.3 : intent === 'slow' ? lastHitDps + clear * 0.18 : intent === 'freeze' ? lastHitDps * 0.55 : t > 840 ? lastHitDps + clear * 0.35 : lastHitDps;
      sim.damageWave(wave, dps * dt * (c.role === 'support' ? (intent === 'push' ? 0.35 : 0.15) : 1), c);
      continue;
    }
    // towers: attack when our wave tanks, or when no defenders are around
    if (k === 'push' || k === 'lane') {
      for (const tw of sim.towers) {
        if (!tw.alive || tw.def.side === c.side) continue;
        const d = dist(tw.def.pos, c.pos);
        if (d > c.stats.range + 250) continue;
        if (!sim.towerVulnerable(tw)) continue;
        const ourWave = sim.waves.some((w) => w.side === c.side && w.stopped && dist(lanePoint(w.lane, w.p), tw.def.pos) < TOWER_RANGE + 100);
        const defenders = enemiesWithin(sim, c.side, tw.def.pos, 1200).length;
        const attackers = sim.champs.filter((x) => x.side === c.side && !x.dead && dist(x.pos, tw.def.pos) < 1000).length;
        const enemyAlive = sim.living((1 - c.side) as Side).length;
        const dive = attackers >= 3 && attackers >= defenders + 2 && k === 'push' && (enemyAlive <= 2 || sim.teams[c.side].baronUntil > t);
        if (!ourWave && !dive && defenders > 0) continue;
        if (!ourWave && !dive && c.hp < c.stats.maxHp * 0.6) continue;
        const dmg = (c.stats.ad * c.stats.as * 1.3 + c.stats.ap * 0.4) * STRUCTURE_HIT * (1 + c.champ.profile.splitpush / 20) * (sim.teams[c.side].baronUntil > t ? 1.25 : 1) * dt;
        sim.damageStructure(tw, dmg, c.side, c);
        break;
      }
      // inhibitors & nexus when in base
      const enemy = (1 - c.side) as Side;
      for (const ih of sim.inhibs) {
        if (ih.side !== enemy || !ih.alive || dist(ih.pos, c.pos) > c.stats.range + 300) continue;
        sim.damageStructure(ih, (c.stats.ad * c.stats.as * 1.3 + c.stats.ap * 0.4) * STRUCTURE_HIT * dt, c.side, c);
      }
      const nex = enemy === 0 ? { x: 1551, y: 1659 } : { x: 13300, y: 13300 };
      if (dist(nex, c.pos) < c.stats.range + 350) sim.damageStructure('nexus', (c.stats.ad * c.stats.as * 1.3 + c.stats.ap * 0.4) * STRUCTURE_HIT * dt, c.side, c);
    }
    void lane;
  }
  // herald summon: team holding herald uses it when pushing an outer/inner tower
  for (const tm of sim.teams) {
    if (!tm.herald) continue;
    const pusher = sim.champs.find((c) => c.side === tm.side && !c.dead && (c.task.kind === 'push' || c.task.kind === 'lane') && sim.towers.some((tw) => tw.alive && tw.def.side !== c.side && tw.def.tier !== 'nexus' && sim.towerVulnerable(tw) && dist(tw.def.pos, c.pos) < 1300));
    if (pusher && (sim.rng.chance(0.02) || t > T.heraldDespawn + 200)) {
      const tw = sim.towers.filter((x) => x.alive && x.def.side !== pusher.side && sim.towerVulnerable(x)).sort((a, b) => dist(a.def.pos, pusher.pos) - dist(b.def.pos, pusher.pos))[0];
      if (tw && dist(tw.def.pos, pusher.pos) < 1400) {
        tm.herald = false;
        sim.damageStructure(tw, 2600, tm.side, pusher);
        sim.event('herald', `${tm.input.short} summon the Rift Herald into the ${tw.def.lane} ${tw.def.tier} turret`, tm.side, { important: true });
      }
    }
  }
}

// ------------------------------------------------------------------ jungle
function doJungle(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  if (c.role !== 'jungle') {
    const camp = c.task.campId ? sim.camps.find((x) => x.def.id === c.task.campId) : undefined;
    if (!camp || !camp.alive || (c.task.until ?? 0) < t) { c.task = defaultTask(sim, c); return; }
    if (dist(c.pos, camp.def.pos) > 250) sim.setDest(c, camp.def.pos);
    return;
  }
  // gank check
  if (t > 165 && c.role === 'jungle' && t >= (c.nextGankAt ?? 0) && t - (c.task.until ?? 0) > 0) {
    const target = bestGankLane(sim, c, null);
    const threshold = 0.6 - c.input.aggression / 400 - (sim.teams[c.side].input.tactics.earlyFocus !== 'balanced' ? 0.05 : 0)
      + (target && target.lane === c.gankOffLane && t < (c.gankOffUntil ?? 0) ? 0.35 : 0); // just called one off there
    if (target && target.score > threshold) {
      c.task = { kind: 'gank', lane: target.lane, targetIdx: target.victim, until: t + 30, reason: `gank score ${target.score.toFixed(2)} > ${threshold.toFixed(2)}` };
      if (sim.rng.chance(0.4)) sim.event('gank', `${c.input.name} is pathing toward ${target.lane} lane`, c.side);
      return;
    }
  }
  // choose camp
  let campId = c.task.campId;
  let camp = campId ? sim.camps.find((x) => x.def.id === campId) : undefined;
  // a camp about to respawn: wait at it rather than wander
  if (camp && !camp.alive && camp.respawnAt - t < 25 && !chooseCamp(sim, c)) { sim.setDest(c, camp.def.pos); return; }
  if (!camp || !camp.alive) {
    camp = chooseCamp(sim, c) ?? undefined;
    if (!camp) {
      // nothing up: hover a lane / scuttle / ward
      const lane: Lane = sim.teams[c.side].input.tactics.earlyFocus === 'top' ? 'top' : sim.teams[c.side].input.tactics.earlyFocus === 'bot' ? 'bot' : 'mid';
      sim.setDest(c, lanePoint(lane, c.side === 0 ? 0.42 : 0.58));
      c.task = { kind: 'jungle', until: c.task.until };
      return;
    }
    c.task = { kind: 'jungle', campId: camp.def.id, until: c.task.until };
  }
  if (dist(c.pos, camp.def.pos) > 250) sim.setDest(c, camp.def.pos);
}

function chooseCamp(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  let best = null as null | (typeof sim.camps)[number], bs = -Infinity;
  const pathing = c.input.pathing / 100;
  for (const camp of sim.camps) {
    if (!camp.alive) continue;
    const own = camp.def.side === c.side;
    const enemyCamp = camp.def.side !== -1 && !own;
    if (c.role !== 'jungle' && (enemyCamp || camp.def.kind === 'scuttle' || camp.def.kind === 'blue' || camp.def.kind === 'red')) continue;
    const d = dist(camp.def.pos, c.pos);
    let s = -d / 2500;
    const val = camp.def.kind === 'blue' || camp.def.kind === 'red' ? 0.6 : camp.def.kind === 'krugs' ? 0.4 : camp.def.kind === 'scuttle' ? 0.5 : 0.25;
    s += val;
    if (enemyCamp) {
      // invade only when the enemy jungler is known to be far away
      const ej = sim.champs.find((x) => x.side !== c.side && x.role === 'jungle');
      const seen = ej ? sim.teams[c.side].lastSeen.get(ej.idx) : undefined;
      const safe = ej && (ej.dead || (seen && t - seen.t < 15 && dist(seen.pos, camp.def.pos) > 6000));
      if (!safe) continue;
      s += -0.2 + pathing * 0.5 + c.input.aggression / 300;
    }
    if (camp.def.kind === 'scuttle' && t < 200) s += 0.4;
    if (s > bs) { bs = s; best = camp; }
  }
  return best;
}

function bestGankLane(sim: MatchSim, c: SimChamp, exclude: Lane | null): { lane: Lane; victim: number; score: number } | null {
  let best: { lane: Lane; victim: number; score: number } | null = null;
  const tm = sim.teams[c.side];
  for (const lane of LANES) {
    if (lane === exclude) continue;
    const victims = sim.champs.filter((e) => e.side !== c.side && !e.dead && e.task.kind === 'lane' && e.task.lane === lane && sim.isVisibleTo(c.side, e.idx));
    if (!victims.length) continue;
    const allies = sim.champs.filter((a) => a.side === c.side && !a.dead && a !== c && a.task.kind === 'lane' && a.task.lane === lane);
    for (const v of victims) {
      const prog = laneProgress(lane, v.pos);
      const overext = c.side === 0 ? 0.55 - prog : prog - 0.45; // enemy pushed toward our side
      const hpf = v.hp / v.stats.maxHp;
      const dToV = dist(c.pos, v.pos);
      const allyCC = allies.reduce((s, a) => s + a.champ.profile.cc, 0) / 10;
      const flash = v.flashReadyAt <= sim.t ? 0 : 0.25;
      const warded = sim.wards.some((w) => w.side === v.side && dist(w.pos, v.pos) < 2600 && dist(w.pos, c.pos) < 3500) ? 0.3 : 0;
      const counter = sim.champs.find((x) => x.side === v.side && x.role === 'jungle' && !x.dead && dist(x.pos, v.pos) < 3000) ? 0.35 : 0;
      const prof = c.role === 'jungle' ? c.champ.profile.gank / 10 : c.champ.profile.roam / 10;
      const pathing = c.input.pathing / 100;
      let s = 0.25 + overext * 1.3 + (1 - hpf) * 0.6 + allyCC * 0.15 + flash + prof * 0.35 - warded * (1.3 - pathing * 0.6) - counter - dToV / 9000;
      s += (sim.teams[c.side].input.tactics.earlyFocus === lane ? 0.12 : 0);
      // poor pathers misread ganks (noise), good pathers wait for the right moment
      s += sim.rng.normal(0, 0.06 + 0.22 * (1 - pathing));
      if (!best || s > best.score) best = { lane, victim: v.idx, score: s };
    }
  }
  void tm;
  return best;
}

/**
 * Gank / roam: approach through the fog, then decide on arrival. Commit only when it's on (target
 * visible and reachable, not safe under its tower, numbers in our favour) — and the laner follows
 * up. Otherwise don't loiter in the lane taking farm: wait a moment in fog if it could turn on,
 * then ward the area, take the next camp (or wait for its respawn), or look at another lane.
 */
function doGank(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  const v = c.task.targetIdx !== undefined ? sim.champs[c.task.targetIdx] : null;
  if (!v || v.dead || (c.task.until ?? 0) < t) { endGank(sim, c, !v ? 'no target' : v.dead ? `${v.input.name} is dead` : 'took too long'); return; }
  const d = dist(c.pos, v.pos);
  if (d > 1700) { sim.setDest(c, gankApproach(c, v)); return; }
  const verdict = gankVerdict(sim, c, v);
  if (verdict.go) {
    if (c.task.gankOnAt === undefined) c.task.gankOnAt = t;
    if (c.combatTarget !== v.idx) sim.dbg(c, 'fight', `gank ON ${v.input.name}: ${verdict.why}`);
    c.combatTarget = v.idx; c.tradeUntil = t + 7; c.tradeMode = false;
    const dive = verdict.why.includes('dive');
    if (dive) c.diveUntil = t + 6;
    sim.setDest(c, v.pos);
    for (const a of verdict.laners) {
      if (a.combatTarget !== v.idx) sim.dbg(a, 'fight', `follows up ${c.input.name}'s gank on ${v.input.name}`);
      // the laner commits too (a task, not just a target) — otherwise their lane task walks them back to the wave
      if (a.task.kind !== 'gank' && a.task.kind !== 'roam') a.task = { kind: 'gank', lane: c.task.lane, targetIdx: v.idx, until: t + 8, reason: `following up ${c.input.name}'s gank on ${v.input.name}` };
      a.combatTarget = v.idx; a.tradeUntil = t + 6; a.tradeMode = false; a.gankAssistUntil = t + 6;
      if (dive) a.diveUntil = t + 6;
    }
    return;
  }
  if (c.task.gankOnAt !== undefined) { c.task.gankOffAt = t; c.task.gankOnAt = undefined; }
  // not on yet: lurk in the fog a few seconds if it could still turn on, otherwise move on
  if (verdict.wait) {
    c.task.lurkUntil ??= t + 3 + c.input.pathing / 40;
    if (t < c.task.lurkUntil) { c.combatTarget = null; sim.setDest(c, gankApproach(c, v)); return; }
  }
  endGank(sim, c, verdict.why);
}

/** Where to wait/approach from: the river/jungle side of the target, out of the lane. */
function gankApproach(c: SimChamp, v: SimChamp): Vec {
  const cx = 7435, cy = 7435;
  const dx = cx - v.pos.x, dy = cy - v.pos.y, l = Math.hypot(dx, dy) || 1;
  const off = Math.min(800, l * 0.5);
  return gd().nav.snap({ x: v.pos.x + dx / l * off, y: v.pos.y + dy / l * off });
}

function gankVerdict(sim: MatchSim, c: SimChamp, v: SimChamp): { go: boolean; wait: boolean; why: string; laners: SimChamp[] } {
  const t = sim.t;
  if (!sim.isVisibleTo(c.side, v.idx)) return { go: false, wait: true, why: `lost sight of ${v.input.name}`, laners: [] };
  const laners = sim.champs.filter((a) => a.side === c.side && a !== c && !a.dead && a.recallUntil <= t && a.task.kind !== 'flee' && a.hp > a.stats.maxHp * 0.35 && dist(a.pos, v.pos) < 1700);
  const enemies = sim.champs.filter((e) => e.side !== c.side && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, v.pos) < 1600);
  const ratio = groupPower([c, ...laners]) / Math.max(1, groupPower(enemies));
  const underTower = !!nearEnemyTower(sim, c.side, v.pos, 150);
  const ej = sim.champs.find((e) => e.side !== c.side && e.role === 'jungle' && !e.dead);
  const seen = ej ? sim.teams[c.side].lastSeen.get(ej.idx) : undefined;
  const counter = !!ej && ((sim.isVisibleTo(c.side, ej.idx) && dist(ej.pos, v.pos) < 3000) || (!!seen && t - seen.t < 15 && dist(seen.pos, v.pos) < 3500));
  let need = 1.25 + (v.flashReadyAt <= t ? 0.15 : 0) + (counter ? 0.3 : 0) - (v.hp < v.stats.maxHp * 0.5 ? 0.3 : 0) - (c.input.aggression - 50) / 250;
  if (underTower) {
    if (!laners.length) return { go: false, wait: false, why: `${v.input.name} is safe under tower and there's no laner to dive with`, laners };
    // a dive only works if we can kill them before the tower kills us
    const burst = [c, ...laners].reduce((s2, a) => s2 + burstEstimate(a, v, t), 0);
    if (v.hp > burst * 1.1) return { go: false, wait: false, why: `${v.input.name} too healthy to dive (HP ${Math.round(v.hp)} vs ~${Math.round(burst)} burst)`, laners };
    need += 0.5;
  }
  const n = `${1 + laners.length}v${enemies.length}`;
  // hysteresis: once it's on, a small dip doesn't call it off; once it was called off, it takes a clearly
  // better look to go again — no flip-flopping on a laner who sits right at the edge of gankable
  const on = c.task.gankOnAt !== undefined, wasOn = c.task.gankOffAt !== undefined;
  const bar = on && t - c.task.gankOnAt! < 5 && c.hp > c.stats.maxHp * 0.4 ? need * 0.78 : wasOn ? need * 1.12 : need;
  if (ratio >= bar) return { go: true, wait: false, why: `${n}${underTower ? ' tower dive' : ''}, power ×${ratio.toFixed(2)}${laners.length ? '' : ' (solo gank)'}`, laners };
  return { go: false, wait: !underTower && !on && !wasOn && ratio > need * 0.7, why: underTower ? `${v.input.name} too safe under tower (×${ratio.toFixed(2)})` : `not on: ${n}, power ×${ratio.toFixed(2)} < ${bar.toFixed(2)}${counter ? ', their jungler is near' : ''}`, laners };
}

/** Call off a gank and do something useful instead of circling in the lane. */
function endGank(sim: MatchSim, c: SimChamp, why: string) {
  const t = sim.t;
  const lane = c.task.lane;
  c.nextGankAt = t + 20 * (has(c, 'early_jungler') && t < 840 ? 0.75 : has(c, 'farming_jungler') ? 1.4 : 1);
  if (lane) { c.gankOffLane = lane; c.gankOffUntil = t + 50; } // nothing changed there: don't walk straight back
  c.combatTarget = null;
  c.disengageUntil = t + 3.5;
  if (c.role !== 'jungle') { c.task = { ...defaultTask(sim, c), reason: `roam off — ${why}` }; return; }
  // 1) leave vision behind: a river ward near this lane
  if (c.wardCharges > 0 && lane) {
    const spot = WARD_SPOTS.filter((s) => s.tags.includes(lane) && (s.tags.includes('river') || s.tags.includes(c.side === 0 ? 'blue_jungle' : 'red_jungle')) && dist(s.pos, c.pos) < 2500 && !sim.wards.some((w) => w.side === c.side && dist(w.pos, s.pos) < 900))
      .sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0];
    if (spot) { c.task = { kind: 'ward', pos: spot.pos, reason: `gank off (${why}) — warding ${lane} river on the way out` }; return; }
  }
  // 2) back to farming: the best camp, or the one about to respawn
  const camp = chooseCamp(sim, c);
  if (camp) { c.task = { kind: 'jungle', campId: camp.def.id, reason: `gank off (${why}) — back to ${camp.def.kind}` }; return; }
  const soon = sim.camps.filter((k) => !k.alive && k.def.side === c.side && k.respawnAt - t < 25).sort((a, b) => a.respawnAt - b.respawnAt)[0];
  if (soon) { c.task = { kind: 'jungle', campId: soon.def.id, reason: `gank off (${why}) — waiting for ${soon.def.kind} to respawn (${Math.round(soon.respawnAt - t)}s)` }; return; }
  // 3) another lane
  const other = bestGankLane(sim, c, lane ?? null);
  if (other && other.score > 0.7) { c.task = { kind: 'gank', lane: other.lane, targetIdx: other.victim, until: t + 25, reason: `gank off (${why}) — trying ${other.lane} instead` }; return; }
  c.task = { kind: 'jungle', until: t + 15, reason: `gank off (${why})` };
}

function doObjective(sim: MatchSim, c: SimChamp) {
  const k = c.task.objective!;
  const o = sim.objectives.find((x) => x.kind === k);
  if (!o) { c.task = defaultTask(sim, c); return; }
  const pit = o.pos;
  const d = dist(c.pos, pit);
  // laners: clear a wave on the way when the team doesn't need us yet, then rotate
  const detour = waveBeforeObjective(sim, c, o);
  if (detour) {
    const back = c.champ.attackType === 'ranged' ? 420 : 220;
    const f = FOUNTAIN[c.side], l = dist(detour.pos, f) || 1;
    sim.setDest(c, gd().nav.snap({ x: detour.pos.x + (f.x - detour.pos.x) / l * back, y: detour.pos.y + (f.y - detour.pos.y) / l * back }));
    c.waveReason = `clearing ${detour.lane} before ${k}`;
    return;
  }
  // before spawn: junglers keep farming nearby camps until ~30s before; others hold vision
  if (!o.alive && c.role === 'jungle' && o.spawnAt - sim.t > 25) {
    // farm until it's time to walk over (camps that fit the timer); good pathers squeeze in more
    const slack = o.spawnAt - sim.t - 12;
    const ms = Math.max(330, c.stats.ms);
    const camp = sim.camps.filter((cp) => cp.alive && (cp.def.side === c.side || cp.def.kind === 'scuttle') && (dist(c.pos, cp.def.pos) + dist(cp.def.pos, pit)) / ms + 10 < slack)
      .sort((a, b) => dist(a.def.pos, c.pos) - dist(b.def.pos, c.pos))[0];
    if (camp && sim.rng.chance(0.5 + c.input.pathing / 200)) { c.task = { kind: 'jungle', campId: camp.def.id, until: sim.t + 20, reason: `farming before ${k} spawns (${Math.round(o.spawnAt - sim.t)}s)` }; sim.setDest(c, camp.def.pos); return; }
  }
  if (!o.alive) {
    if (sim.teams[c.side].staged?.[k] !== undefined) delete sim.teams[c.side].staged![k];
    const hold = { x: pit.x + (FOUNTAIN[c.side].x - pit.x) * 0.15, y: pit.y + (FOUNTAIN[c.side].y - pit.y) * 0.15 };
    sim.setDest(c, gd().nav.snap(hold));
    if ((c.role === 'support' || c.role === 'jungle') && (c.wardCharges > 0 || c.controlWards > 0)) {
      const spot = WARD_SPOTS.filter((s) => s.tags.includes(k === 'baron' || k === 'herald' || k === 'grubs' ? 'baron' : 'dragon') && !sim.wards.some((w) => w.side === c.side && dist(w.pos, s.pos) < 700))
        .sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0];
      if (spot && dist(spot.pos, c.pos) < 700 && sim.rng.chance(0.3 + c.input.vision / 250)) sim.placeWard(c, spot.pos, c.controlWards > 0);
    }
    return;
  }
  // group up first: start once the players actually coming are there (or a few seconds out).
  // Baron / Elder: not while teammates are fighting elsewhere (no 3 on Baron while 2 fight mid).
  const t = sim.t;
  const tm = sim.teams[c.side];
  const big = k === 'baron' || k === 'elder';
  const assigned = sim.champs.filter((x) => x.side === c.side && !x.dead && x.task.kind === 'objective' && x.task.objective === k);
  const arrived = assigned.filter((x) => dist(x.pos, pit) < 1700);
  const eta = (x: SimChamp) => Math.max(0, dist(x.pos, pit) - 1700) / Math.max(320, x.stats.ms);
  const soon = assigned.filter((x) => eta(x) <= 4);
  const need = Math.max(big ? 3 : 2, assigned.length - 1);
  const fightElsewhere = big && sim.living(c.side).some((x) => !assigned.includes(x) && x.combatTarget !== null && dist(x.pos, pit) > 3000);
  const hitting = [...o.attackers].some((i) => sim.champs[i].side === c.side);
  const stance = tm.objStance && tm.objStance.kind === k && tm.objStance.until > t ? tm.objStance.stance : null;
  let ready = hitting || o.hp < o.maxHp * 0.6 || (soon.length >= need && !fightElsewhere)
    || ((stance === 'fight' || stance === 'bait' || stance === 'race') && arrived.length >= (big ? 3 : 2)); // contested: our read says go
  // waiting too long at the pit: start it if nobody is contesting, otherwise give it up and move on
  tm.staged ??= {};
  if (!ready && arrived.length >= 2) {
    const since = (tm.staged[k] ??= t);
    const contested = sim.champs.some((e) => e.side !== c.side && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, pit) < 3500);
    const restClose = assigned.filter((x) => !arrived.includes(x)).every((x) => eta(x) < 9 && x.combatTarget === null);
    if (t - since > (big ? 14 : 9) && !contested && arrived.length >= (big ? 3 : 2) && (!big || arrived.length >= 4 || restClose)) {
      if (tm.staged[k] !== -1) sim.dbg(c.side, 'call', `${k}: starting with ${arrived.length} — not waiting any longer for ${assigned.filter((x) => !arrived.includes(x)).map((x) => x.input.name).join(', ') || 'the rest'}`);
      tm.staged[k] = -1;
      ready = true;
    } else if (t - since > (big ? 22 : 15) && since !== -1) {
      sim.dbg(c.side, 'call', `${k}: waited ${Math.round(t - since)}s without a go — dropping it, back to the map`);
      tm.objCalls[k] = { d: 'concede', until: t + 20, score: -1 };
      delete tm.staged[k];
      c.task = { kind: 'base', reason: `gave up waiting at ${k}` };
      return;
    }
  } else if (!arrived.length && tm.staged[k] !== undefined) delete tm.staged[k];
  if (tm.staged[k] === -1) ready = true;
  if (!ready && c.role === 'jungle' && !big) {
    // the team is still rotating to a dragon / herald: a good pather clears a camp next to the pit instead of waiting
    const latest = Math.max(0, ...assigned.filter((x) => dist(x.pos, pit) >= 1700).map(eta));
    const contested = sim.champs.some((e) => e.side !== c.side && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, pit) < 3500);
    if (!contested && latest > 10 && campNear(sim, c, pit, 2800, `clearing a camp while the team rotates to ${k}`)) return;
  }
  if (!ready) {
    const stage = { x: pit.x + (FOUNTAIN[c.side].x - pit.x) * 0.13, y: pit.y + (FOUNTAIN[c.side].y - pit.y) * 0.13 };
    sim.setDest(c, gd().nav.snap(stage));
    return;
  }
  const hold = shouldRegroup(sim, c, pit);
  if (hold) { sim.setDest(c, hold); return; }
  if (d > 450) sim.setDest(c, pit);
  else { c.path = []; c.dest = null; }
}

/** Jungler: take an own-side camp near a spot (objective pit) if one is up. Pathing decides how reliably they do it. */
function campNear(sim: MatchSim, c: SimChamp, spot: Vec, radius: number, reason: string): boolean {
  if (!sim.rng.chance(0.3 + c.input.pathing / 140)) return false;
  const camp = sim.camps.filter((cp) => cp.alive && (cp.def.side === c.side || cp.def.kind === 'scuttle') && dist(cp.def.pos, spot) < radius && !enemiesWithin(sim, c.side, cp.def.pos, 1800, true).length)
    .sort((a, b) => dist(a.def.pos, c.pos) - dist(b.def.pos, c.pos))[0];
  if (!camp) return false;
  c.task = { kind: 'jungle', campId: camp.def.id, until: sim.t + 14, reason };
  sim.setDest(c, camp.def.pos);
  return true;
}

function doPush(sim: MatchSim, c: SimChamp, lane: Lane) {
  const enemy = (1 - c.side) as Side;
  const target = siegeTarget(sim, enemy, lane);
  if (!target) return;
  const tpos = target.def.pos;
  const t = sim.t;
  const tm = sim.teams[c.side];
  const ourWaves = sim.waves.filter((w) => w.side === c.side && w.lane === lane);
  const front = ourWaves.sort((a, b) => (c.side === 0 ? b.p - a.p : a.p - b.p))[0];
  const frontPos = front ? lanePoint(lane, front.p) : null;
  const waveClose = frontPos && dist(frontPos, tpos) < 1600;
  const allies = sim.champs.filter((x) => x.side === c.side && !x.dead && dist(x.pos, tpos) < 2200).length;
  const defenders = enemiesWithin(sim, c.side, tpos, 1800, true).length;
  const strong = tm.baronUntil > t || sim.living(enemy).length <= 2 || (allies >= 3 && allies >= defenders + 2);
  let goal: Vec;
  if (waveClose || strong) goal = tpos;                  // hit the structure
  else if (frontPos) goal = frontPos;                    // escort our wave in
  else goal = lanePosition(sim, c, lane);
  // low on HP with no minions tanking: don't walk back under a healthy tower to get executed —
  // hold at the edge and let the healthier players (or the wave) take the shots
  const tower = 'hp' in target ? (target as SimTower) : null;
  if (goal === tpos && tower && !waveClose && c.hp < c.stats.maxHp * 0.45 && tower.hp > tower.maxHp * 0.15 && dist(c.pos, tpos) < TOWER_RANGE + 400) {
    const dir2 = { x: FOUNTAIN[c.side].x - tpos.x, y: FOUNTAIN[c.side].y - tpos.y };
    const l2 = Math.hypot(dir2.x, dir2.y) || 1;
    sim.setDest(c, gd().nav.snap({ x: tpos.x + dir2.x / l2 * (TOWER_RANGE + 200), y: tpos.y + dir2.y / l2 * (TOWER_RANGE + 200) }));
    return;
  }
  const regroup = shouldRegroup(sim, c, goal, lane);
  if (regroup) { sim.setDest(c, regroup); return; }
  const off = goal === tpos ? (c.champ.attackType === 'ranged' ? c.stats.range * 0.85 : 140) : (c.champ.attackType === 'ranged' ? 350 : 120);
  const dir = { x: FOUNTAIN[c.side].x - goal.x, y: FOUNTAIN[c.side].y - goal.y };
  const l = Math.hypot(dir.x, dir.y) || 1;
  sim.setDest(c, gd().nav.snap({ x: goal.x + dir.x / l * off, y: goal.y + dir.y / l * off }));
}

function doDefend(sim: MatchSim, c: SimChamp) {
  const p = c.task.pos;
  if (!p) { c.task = defaultTask(sim, c); return; }
  const regroup = shouldRegroup(sim, c, p, c.task.lane);
  if (regroup) { sim.setDest(c, regroup); return; }
  // holding a structure is clearing the minions hitting it: stand at the closest enemy wave
  let wave: Vec | null = null, wd = 2200;
  for (const w of sim.waves) {
    if (w.side === c.side || w.count <= 0) continue;
    const wp = lanePoint(w.lane, w.p);
    const d = dist(wp, p);
    if (d < wd) { wd = d; wave = wp; }
  }
  if (wave) {
    const reach = Math.max(c.stats.range + 200, 550) * 0.6;
    const f = FOUNTAIN[c.side], fd = Math.max(1, dist(f, wave));
    sim.setDest(c, gd().nav.snap({ x: wave.x + (f.x - wave.x) / fd * reach, y: wave.y + (f.y - wave.y) / fd * reach }));
    return;
  }
  const back = { x: p.x + (FOUNTAIN[c.side].x - p.x) * 0.06, y: p.y + (FOUNTAIN[c.side].y - p.y) * 0.06 };
  sim.setDest(c, gd().nav.snap(back));
}

function maybeWard(sim: MatchSim, c: SimChamp) {
  if (c.wardCharges <= 0 && c.controlWards <= 0) return;
  const vision = c.input.vision / 100;
  const roleMul = c.role === 'support' ? 1.6 : c.role === 'jungle' ? 1.1 : 0.5;
  if (!sim.rng.chance(0.03 * roleMul * (0.4 + vision) * (0.5 + sim.teams[c.side].input.tactics.visionFocus / 100))) return;
  let best = null as null | (typeof WARD_SPOTS)[number], bs = -Infinity;
  const plan = sim.teams[c.side].plan;
  const enemySide = (1 - c.side) as Side;
  const enemyJungleTag = enemySide === 0 ? 'blue_jungle' : 'red_jungle';
  for (const s of WARD_SPOTS) {
    const d = dist(s.pos, c.pos);
    if (d > 900) continue;
    // warding the enemy jungle needs map control: their tower on that side down, or lane priority
    if (s.tags.includes(enemyJungleTag)) {
      const halfLane: Lane = s.tags.includes('top') ? 'top' : s.tags.includes('bot') ? 'bot' : 'mid';
      const towerDown = !sim.towers.some((tw) => tw.alive && tw.def.side === enemySide && tw.def.lane === halfLane && tw.def.tier === 'outer');
      if (!towerDown && lanePriority(sim, c.side, halfLane) < 0.3) continue;
    }
    if (sim.wards.some((w) => w.side === c.side && dist(w.pos, s.pos) < 900)) continue;
    let sc = 1 - d / 900 + sim.rng.next() * (1.2 - vision);
    if (plan.kind === 'objective' && s.tags.includes(plan.target === 'dragon' || plan.target === 'elder' ? 'dragon' : 'baron')) sc += 1;
    if (s.tags.includes('river')) sc += 0.3;
    if (sc > bs) { bs = sc; best = s; }
  }
  if (best) sim.placeWard(c, best.pos, c.controlWards > 0 && sim.rng.chance(0.35));
}

// keep tree-shaking quiet for helpers used only in some builds
void CAMPS; void dealDamage; void sigmoid;

/** Deterministic noise shared by a team in a map area for a few seconds. */
function areaNoise(sim: MatchSim, side: Side, p: Vec): number {
  const gx = Math.floor(p.x / 2500), gy = Math.floor(p.y / 2500), tw = Math.floor(sim.t / 3);
  let h = (side * 73856093) ^ (gx * 19349663) ^ (gy * 83492791) ^ (tw * 2654435761) ^ (sim.rng.state & 0);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
  const u = ((h >>> 0) % 100000) / 100000;
  // approx standard normal from uniform (logit)
  return Math.log((u + 1e-4) / (1 - u + 1e-4)) * 0.55;
}

/** Team far-sight: the best end-game reader among living players (shotcallers weigh in). */
export function teamFarsight(sim: MatchSim, side: Side): number {
  let best = 0;
  for (const c of sim.living(side)) best = Math.max(best, c.input.farsight * 0.75 + c.input.shotcalling * 0.25);
  return best;
}

function endgameCalls(sim: MatchSim, side: Side, mine: SimChamp[], theirs: SimChamp[]): boolean {
  const t = sim.t;
  const tm = sim.teams[side];
  const enemy = (1 - side) as Side;
  const fs = teamFarsight(sim, side);
  if (fs < 68) return false;
  const reader = sim.living(side).reduce((a, b) => (b.input.farsight > a.input.farsight ? b : a));
  const sharp = (fs - 60) / 40; // 0.2 .. 1
  if (tm.plan.kind === 'endcall' && tm.plan.until > t) return true;
  // 1) End call: enemy base exposed and enemies dead long enough
  const longDead = sim.champs.filter((e) => e.side === enemy && e.dead && e.respawnAt - t > 22).length;
  const inhibDown = sim.inhibs.some((i) => i.side === enemy && !i.alive);
  if (mine.length >= 4 && (longDead >= 3 || (longDead >= 2 && inhibDown)) && sim.rng.chance(0.35 + sharp * 0.5)) {
    let lane: Lane = 'mid', bd = Infinity;
    for (const l of LANES) { const st = siegeTarget(sim, enemy, l); if (st) { const d = dist(centerOf(mine), st.def.pos); const bonus = st.def.tier === 'nexus' ? -3000 : st.def.tier === 'inhib' ? -1500 : 0; if (d + bonus < bd) { bd = d + bonus; lane = l; } } }
    tm.plan = { kind: 'endcall', target: lane, until: t + 30, label: 'Going for the end!' };
    for (const c of mine) if (c.recallUntil <= t) assign(sim, c, { kind: 'push', lane, until: t + 30, reason: 'END CALL: their base is open' });
    sim.event('info', `${reader.input.name} spots the opening — ${tm.input.short} go for the end!`, side, { important: true });
    return true;
  }
  // 2) Surprise baron: enemies shown far away bot side
  const baron = sim.objectives.find((o) => o.kind === 'baron' && o.alive);
  if (baron && mine.length >= 4) {
    const seenFar = theirs.filter((e) => sim.isVisibleTo(side, e.idx) && dist(e.pos, baron.pos) > 7000).length;
    if (seenFar >= 3 && sim.rng.chance(0.25 + sharp * 0.5)) {
      tm.objCalls['baron'] = { d: 'take', until: t + 25, score: 2 };
      tm.plan = { kind: 'endcall', target: 'baron', until: t + 25, label: 'Surprise Baron!' };
      for (const c of mine) if (c.recallUntil <= t) assign(sim, c, { kind: 'objective', objective: 'baron', pos: baron.pos, until: t + 30, reason: 'far-sight read: surprise Baron' });
      sim.event('info', `${reader.input.name} reads the map: ${tm.input.short} sneak Baron while the enemy is bot side!`, side, { important: true });
      return true;
    }
  }
  // 3) Backdoor: a split-pusher near an exposed base while the enemy is grouped elsewhere
  for (const c of mine) {
    if (c.task.kind !== 'push' && c.task.kind !== 'lane') continue;
    if (c.champ.profile.splitpush < 6 && !has(c, 'splitpush_king') && !has(c, 'side_lane_specialist')) continue;
    if (c.input.farsight < 75 && fs < 85) continue;
    const lane = c.task.lane;
    if (!lane) continue;
    const st = siegeTarget(sim, enemy, lane);
    if (!st || (st.def.tier !== 'inhib' && st.def.tier !== 'nexus')) continue;
    const defendersNear = theirs.filter((e) => dist(e.pos, st.def.pos) < 6500).length;
    if (dist(c.pos, st.def.pos) < 3500 && defendersNear === 0 && sim.rng.chance(0.15 + sharp * 0.3)) {
      c.task = { kind: 'push', lane, until: t + 25, reason: 'backdoor attempt' };
      sim.event('info', `${c.input.name} slips into the enemy base — backdoor attempt!`, side, { important: true });
    }
  }
  return false;
}

/**
 * Laning-phase wave management: shove when the lane opponent is absent, when we win the
 * matchup, to gain priority before an objective on our side, or to crash before recalling.
 * Otherwise last-hit (slow push / freeze).
 */
function wantsToShove(sim: MatchSim, c: SimChamp, wave: { lane: Lane; p: number }): boolean {
  const t = sim.t;
  const wpos = lanePoint(wave.lane, wave.p);
  const opp = sim.champs.filter((e) => e.side !== c.side && !e.dead && e.recallUntil <= t && e.role !== 'jungle' && dist(e.pos, wpos) < 1600);
  if (!opp.length) return true;
  // wave rhythm: every player has their own 75s cycle; shove ~30% of it (crash, then reset / roam)
  const phase = ((t + c.idx * 17) % 75) / 75;
  if (phase < 0.22 + c.input.aggression / 500) return true;
  // objective on our half soon → get priority
  const half = wave.lane === 'top' ? 'top' : wave.lane === 'bot' ? 'bot' : null;
  for (const o of sim.objectives) {
    const soon = o.alive || (o.spawnAt > 0 && o.spawnAt - t < 60);
    if (!soon) continue;
    const objHalf = o.kind === 'dragon' || o.kind === 'elder' ? 'bot' : 'top';
    if (half === objHalf || wave.lane === 'mid') return true;
  }
  // winning lane: keep pressure
  const e = opp[0];
  const adv = (c.input.lane - e.input.lane) / 100 + (c.champ.profile.laning - e.champ.profile.laning) / 20 + (c.level - e.level) * 0.06;
  if (adv > 0.12) return true;
  // about to recall: crash the wave
  if (c.gold > 1100) return true;
  return false;
}
