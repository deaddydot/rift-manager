// Fog-of-war reads: where a team believes each enemy is. Enemies in vision are where they are; one that's gone into
// the fog becomes a "ghost" — the last sighting drifting toward where they were most likely going (an objective
// that's up or about to spawn, their next camp, back to the wave, home when they were hurt), with a confidence that
// fades the longer they've been gone. Teams with better macro read it more sharply. Used for objective calls
// (assume the five who vanished from mid are at Baron), ambush risk on side waves, route safety (no shortcut through
// the river the whole enemy team just walked into) and ward placement (track the jungler).
import type { MatchSim } from './engine';
import type { SimChamp } from './simtypes';
import { dist, FOUNTAIN, lanePoint, laneProgress, nearestLane, CAMPS, type Side, type Vec } from './map';
import { gd } from '../../data/gamedata';
import { clamp } from '../../util/rng';

export interface Belief { e: SimChamp; pos: Vec; conf: number; seen: boolean; age: number; why: string }

const cache = new WeakMap<MatchSim, { t: number; per: [Belief[] | null, Belief[] | null] }>();
const toward = (a: Vec, b: Vec, d: number): Vec => { const l = dist(a, b); if (l <= d || l < 1) return { ...b }; return { x: a.x + (b.x - a.x) / l * d, y: a.y + (b.y - a.y) / l * d }; };
/** Stable per-enemy offset for a team's guess (poor macro teams guess further off). */
const jitter = (sim: MatchSim, side: Side, e: SimChamp, scale: number): Vec => {
  const h = Math.imul((side + 1) * 2654435761 ^ (e.idx + 7) * 40503 ^ Math.floor(sim.t / 20) * 9973, 1597334677) >>> 0;
  const a = (h % 6283) / 1000, r = ((h >>> 13) % 1000) / 1000 * scale;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

/** The team's picture of every living enemy (cached per tick). */
export function beliefs(sim: MatchSim, side: Side): Belief[] {
  let c = cache.get(sim);
  if (!c || c.t !== sim.t) { c = { t: sim.t, per: [null, null] }; cache.set(sim, c); }
  return (c.per[side] ??= compute(sim, side));
}

function compute(sim: MatchSim, side: Side): Belief[] {
  const t = sim.t;
  const tm = sim.teams[side];
  const enemy = (1 - side) as Side;
  // how sharp the team's reads are: macro, and vision players who know where the enemy jungler should be
  const avgVision = sim.champs.filter((x) => x.side === side).reduce((a, x) => a + x.input.vision, 0) / 5;
  const read = clamp((tm.macro * 0.7 + avgVision * 0.3) / 100, 0.2, 1.2);
  const foes = sim.champs.filter((e) => e.side === enemy && !e.dead);
  const missing = foes.filter((e) => !tm.visible.has(e.idx)).length;
  // objectives worth walking to right now (up, or spawning within ~75 s)
  const objs = sim.objectives.filter((o) => o.alive || (o.spawnAt > 0 && o.spawnAt - t < 75));
  const out: Belief[] = [];
  for (const e of foes) {
    if (tm.visible.has(e.idx)) { out.push({ e, pos: { ...e.pos }, conf: 1, seen: true, age: 0, why: 'in vision' }); continue; }
    const last = tm.lastSeen.get(e.idx);
    const from = last?.pos ?? (e.role === 'jungle' ? CAMPS.find((k) => k.side === enemy && k.kind === 'blue')!.pos : e.role === 'support' || e.role === 'adc' ? lanePoint('bot', enemy === 0 ? 0.3 : 0.7) : lanePoint(e.role === 'top' ? 'top' : 'mid', enemy === 0 ? 0.3 : 0.7));
    const age = last ? t - last.t : t;
    const reach = Math.max(330, e.stats.ms) * age;
    let dest: Vec = from, why = 'last seen here', base = 0.65;
    const hpf = last?.hpf ?? 1;
    // 1) hurt when last seen: probably went home
    if (hpf < 0.35 && age > 4) { dest = FOUNTAIN[enemy]; why = 'probably recalled'; base = 0.55; }
    else {
      // 2) an objective pulls them: close to it, heading for it, or most of their team gone missing at once
      const heading = last?.from ? { x: from.x - last.from.x, y: from.y - last.from.y } : null;
      let pull: { pos: Vec; score: number; kind: string } | null = null;
      for (const o of objs) {
        const d = dist(from, o.pos);
        let s = d < 4000 ? 1 : d < 7500 && missing >= 3 ? 0.8 : 0;
        if (heading && Math.hypot(heading.x, heading.y) > 50) {
          const hx = heading.x / Math.hypot(heading.x, heading.y), hy = heading.y / Math.hypot(heading.x, heading.y);
          const ox = (o.pos.x - from.x) / (d || 1), oy = (o.pos.y - from.y) / (d || 1);
          if (hx * ox + hy * oy > 0.6 && d < 9000) s = Math.max(s, 0.85);
        }
        if (missing >= 4) s += 0.2;
        if (s > (pull?.score ?? 0)) pull = { pos: toward(o.pos, FOUNTAIN[enemy], 650), score: s, kind: o.kind };
      }
      if (pull && pull.score >= 0.8) { dest = pull.pos; why = `assumed at ${pull.kind}`; base = 0.6 + Math.min(0.3, (missing - 1) * 0.08); }
      else if (e.role === 'jungle') {
        // 3) their jungler: the nearest camp of theirs that's up (camp timers are public knowledge for pros)
        const camp = sim.camps.filter((k) => k.alive && (k.def.side === enemy || k.def.kind === 'scuttle')).sort((a, b) => dist(a.def.pos, from) - dist(b.def.pos, from))[0];
        if (camp) { dest = camp.def.pos; why = 'farming the jungle'; base = 0.5; }
      } else {
        // 4) a laner: back on the wave of the lane they were in
        const lane = nearestLane(from);
        const w = sim.waves.filter((x) => x.lane === lane && x.side !== side).sort((a, b) => Math.abs(a.p - laneProgress(lane, from)) - Math.abs(b.p - laneProgress(lane, from)))[0];
        dest = w ? lanePoint(lane, w.p + (enemy === 0 ? -0.04 : 0.04)) : from; why = `on the ${lane} wave`; base = 0.6;
      }
    }
    const j = jitter(sim, side, e, (1.15 - read) * 1100 + Math.min(1500, age * 25));
    const pos = gd().nav.snap(toward(from, { x: dest.x + j.x, y: dest.y + j.y }, reach));
    const conf = clamp(base * (0.75 + read * 0.25) - age / 60, 0.1, 0.95);
    out.push({ e, pos, conf, seen: false, age, why });
  }
  return out;
}

/** Believed enemy presence around `p` (seen enemies count fully, ghosts by confidence). */
export function threatAt(sim: MatchSim, side: Side, p: Vec, r = 1400): number {
  let s = 0;
  for (const b of beliefs(sim, side)) if (dist(b.pos, p) < r) s += b.seen ? 1 : b.conf;
  return s;
}

/**
 * Route safety for a champion travelling (not fighting): how much believed enemy presence lies along the way to
 * `dest`, against the allies around. Returns a safer waypoint when the direct route runs through it — the long way
 * round, closer to home — or null when the route is fine.
 */
export function saferWaypoint(sim: MatchSim, c: SimChamp, path: Vec[], dest: Vec): Vec | null {
  if (path.length < 4) return null;
  const side = c.side;
  const allyNear = (p: Vec) => sim.champs.filter((a) => a.side === side && !a.dead && dist(a.pos, p) < 1700).length;
  const danger = (p: Vec) => threatAt(sim, side, p) - Math.max(1, allyNear(p)) * 0.8;
  let worst = 0;
  for (let i = 2; i < path.length; i += 3) worst = Math.max(worst, danger(path[i]));
  if (worst < 0.9) return null;
  // detour candidates: from the middle of the trip, pulled toward our own base
  const mid = { x: (c.pos.x + dest.x) / 2, y: (c.pos.y + dest.y) / 2 };
  let best: { p: Vec; d: number } | null = null;
  for (const f of [0.25, 0.42, 0.6]) {
    const wp = gd().nav.snap(toward(mid, FOUNTAIN[side], dist(mid, FOUNTAIN[side]) * f));
    const d = Math.max(danger(wp), danger({ x: (wp.x + c.pos.x) / 2, y: (wp.y + c.pos.y) / 2 }), danger({ x: (wp.x + dest.x) / 2, y: (wp.y + dest.y) / 2 }));
    if (!best || d < best.d) best = { p: wp, d };
  }
  return best && best.d < worst - 0.5 ? best.p : null;
}
