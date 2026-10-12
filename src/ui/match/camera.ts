// Camera for the live match viewer: a center + zoom view over the map (game units), user input (wheel,
// drag, keys, minimap), a "fight director" that spots skirmishes / objective contests / tower dives and
// frames them, and a follow-the-selected-player mode. Pure logic (no DOM, no React) so it can be stepped
// from the viewer's requestAnimationFrame loop through a ref and tested headless.
import type { MatchSim } from '../../engine/sim/engine';
import { MAP_SIZE, NEXUS, DRAGON_PIT, BARON_PIT, dist, type Vec } from '../../engine/sim/map';

export interface View { cx: number; cy: number; zoom: number }
export type CamMode = 'manual' | 'fight' | 'follow';

export const MAX_ZOOM = 6;
export const FULL_VIEW: View = { cx: MAP_SIZE / 2, cy: MAP_SIZE / 2, zoom: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Keep the view inside the map: zoom 1..MAX_ZOOM and no empty space past the edges. */
export function clampView(v: View): View {
  const zoom = clamp(v.zoom, 1, MAX_ZOOM);
  const half = MAP_SIZE / (2 * zoom);
  return { zoom, cx: clamp(v.cx, half, MAP_SIZE - half), cy: clamp(v.cy, half, MAP_SIZE - half) };
}
/** CSS pixels per game unit for a canvas of S px at this zoom. */
export const ppu = (S: number, zoom: number) => (S * zoom) / MAP_SIZE;
export function screenToWorld(v: View, sx: number, sy: number, S: number): Vec {
  const k = ppu(S, v.zoom);
  return { x: v.cx + (sx - S / 2) / k, y: v.cy - (sy - S / 2) / k };
}
export function worldToScreen(v: View, p: Vec, S: number): [number, number] {
  const k = ppu(S, v.zoom);
  return [S / 2 + (p.x - v.cx) * k, S / 2 - (p.y - v.cy) * k];
}
/** The minimap inset (bottom-right, CSS px) drawn while zoomed in. */
export function minimapRect(S: number) {
  const w = Math.round(clamp(S * 0.2, 84, 170));
  return { x: S - w - 8, y: S - w - 8, w };
}
/** How visible the minimap is at this zoom (fades in between 1.04× and 1.2×). */
export const minimapAlpha = (zoom: number) => clamp((zoom - 1.04) / 0.16, 0, 1);

// ------------------------------------------------------------------ fight director
export interface Fight {
  x0: number; y0: number; x1: number; y1: number; // framing box (game units)
  cx: number; cy: number;                         // centroid of the people fighting
  score: number;
  members: number[];
  sides: [number, number]; // fighters per team
  tag: string;             // objective being contested ('Baron', 'Dragon'…) or 'tower dive'
  where: string;           // map region
  label: string;
}
interface Focus extends Fight { since: number; sinceReal: number; activeAt: number; activeReal: number; ox: number; oy: number }

const OBJECTIVE_TAGS = new Set(['Baron', 'Elder', 'Dragon', 'Herald', 'Voidgrubs']);
/** "3v2 · tower dive · bot lane", "5v4 at Baron", "Dragon take", "pick · mid". */
function fightLabel(sides: [number, number], tag: string, where: string) {
  const vs = sides[0] && sides[1] ? `${sides[0]}v${sides[1]}` : '';
  if (OBJECTIVE_TAGS.has(tag)) return vs ? `${vs} at ${tag}` : `${tag} take`;
  return `${vs || 'pick'}${tag ? ` · ${tag}` : ''} · ${where}`;
}

const LINK = 2000;      // two fighters this close belong to the same fight
const BYSTANDER = 1500; // anyone this close to a fighter is framed too (arriving help)

/** Speed-dependent tuning: at high speed only bigger fights are worth a cut, and cuts are held longer. */
function tuning(speed: number) {
  if (speed >= 64) return { engage: 6, hold: 1.8, cap: 1.9 };
  if (speed >= 32) return { engage: 5, hold: 1.7, cap: 2.0 };
  if (speed >= 16) return { engage: 4, hold: 1.6, cap: 2.3 };
  if (speed >= 8) return { engage: 3.2, hold: 1.6, cap: 2.5 };
  return { engage: 3, hold: 1.5, cap: 2.6 };
}

function region(p: Vec): string {
  if (dist(p, DRAGON_PIT) < 1700) return 'dragon pit';
  if (dist(p, BARON_PIT) < 1700) return 'baron pit';
  if (dist(p, NEXUS[0]) < 3300) return 'blue base';
  if (dist(p, NEXUS[1]) < 3300) return 'red base';
  if (p.x < 2600 || p.y > MAP_SIZE - 2600) return 'top lane';
  if (p.y < 2600 || p.x > MAP_SIZE - 2600) return 'bot lane';
  if (Math.abs(p.x - p.y) < 1500) return 'mid';
  if (Math.abs(p.x + p.y - MAP_SIZE) < 1300) return 'river';
  return p.x + p.y < MAP_SIZE ? 'blue jungle' : 'red jungle';
}

/**
 * Finds fights from what the sim already tracks: "heat" per champion = share of max HP lost to enemy
 * champions or turrets (and dealt, for the attacker), decaying over ~3 sim seconds; plus who is engaged on
 * whom, recent deaths, monsters being hit and turrets shooting champions. Fighters are clustered by
 * distance; each cluster gets a score. A focus is picked with hysteresis (engage high, stay low), held for
 * a minimum real time, kept a few seconds after the last blow, and only switched for a clearly bigger fight.
 */
export class FightDirector {
  fights: Fight[] = [];
  focus: Focus | null = null;
  private heat: number[] = [];
  private hp: number[] = [];
  private dead: boolean[] = [];
  private alivePos: Vec[] = [];
  private hots: { p: Vec; t: number; w: number; seen: [boolean, boolean] }[] = [];
  private seenBy: [boolean, boolean][] = []; // last frame: could each team see this champion?
  private lastT = -1;
  private releasedReal = -99;

  /** `fog`: the team whose vision the viewer uses (null = spectator) — fights it can't see are ignored. */
  update(sim: MatchSim, speed: number, nowReal: number, fog: 0 | 1 | null = null) {
    const t = sim.t, cs = sim.champs;
    if (this.lastT < 0 || t < this.lastT || t - this.lastT > 30) {
      // first look (or a skip): start from the current state
      for (const c of cs) { this.heat[c.idx] = 0; this.hp[c.idx] = c.hp; this.dead[c.idx] = c.dead; this.alivePos[c.idx] = { x: c.pos.x, y: c.pos.y }; }
      this.hots = []; this.focus = null; this.fights = []; this.lastT = t;
      return;
    }
    const dts = t - this.lastT;
    if (dts > 0) {
      this.lastT = t;
      const decay = Math.exp(-dts / 3);
      for (const c of cs) this.heat[c.idx] *= decay;
      for (const c of cs) {
        const i = c.idx;
        if (c.dead) {
          if (!this.dead[i]) {
            // a death: a hot spot there for a few seconds, and the killers get the rest of the HP bar as heat
            // (at high speed the whole fight can happen between two frames)
            this.hots.push({ p: this.alivePos[i] ?? { ...c.pos }, t, w: 2.5, seen: this.seenBy[i] ?? [true, true] });
            const rest = Math.max(0, this.hp[i] / c.stats.maxHp);
            for (const [j, at] of c.lastDamagedBy) if (at > t - 3 && cs[j] && cs[j].side !== c.side) this.heat[j] += rest * 1.2;
            this.heat[i] = 0;
          }
          this.dead[i] = true; this.hp[i] = c.hp;
          continue;
        }
        this.dead[i] = false;
        this.alivePos[i] = { x: c.pos.x, y: c.pos.y };
        this.seenBy[i] = [c.side === 0 || sim.teams[0].visible.has(i), c.side === 1 || sim.teams[1].visible.has(i)];
        const loss = (this.hp[i] - c.hp) / c.stats.maxHp;
        this.hp[i] = c.hp;
        if (loss <= 0.004) continue;
        let hit = false;
        for (const [j, at] of c.lastDamagedBy) {
          if (at > t - 1.5 && cs[j] && cs[j].side !== c.side) { hit = true; this.heat[j] += loss * 1.2; }
        }
        if (!hit) hit = sim.towers.some((tw) => tw.alive && tw.targetIdx === i && tw.def.side !== c.side && tw.shotReadyAt > t - 2);
        if (hit) this.heat[i] += loss * 3;
      }
      if (this.hots.length && t - this.hots[0].t > 6) this.hots = this.hots.filter((h) => t - h.t <= 6);
    }
    this.fights = this.cluster(sim, fog);
    this.pick(t, speed, nowReal);
  }

  private cluster(sim: MatchSim, fog: 0 | 1 | null): Fight[] {
    const t = sim.t, cs = sim.champs;
    // with a team's vision on, only what that team sees counts (no zooming in on an enemy Baron in the fog)
    const vis = (c: MatchSim['champs'][number]) => fog === null || c.side === fog || sim.teams[fog].visible.has(c.idx);
    const act = new Map<number, number>();
    for (const c of cs) {
      if (c.dead || !vis(c)) continue;
      const e = c.combatTarget !== null ? cs[c.combatTarget] : null;
      const engaged = !!e && !e.dead && e.side !== c.side && c.lastCombatAt > t - 2 && dist(c.pos, e.pos) < 1400;
      const h = this.heat[c.idx] ?? 0;
      if (h > 0.2 || engaged) act.set(c.idx, h + (engaged ? 0.25 : 0));
    }
    // monsters being hit: the people on them count as (mild) participants so a contest merges with them
    const objs: { p: Vec; kind: string; n: number }[] = [];
    for (const o of sim.objectives) {
      if (!o.alive || (o.lastHitAt ?? -99) < t - 2) continue;
      let n = 0;
      for (const idx of o.attackers) {
        const c = cs[idx];
        if (!c || c.dead || !vis(c) || dist(c.pos, o.pos) > 1100) continue;
        n++;
        act.set(idx, (act.get(idx) ?? 0) + 0.4);
      }
      if (n) objs.push({ p: o.pos, kind: o.kind, n });
    }
    // single-linkage clusters
    const ids = [...act.keys()];
    const group = new Map<number, number>();
    let g = 0;
    for (const i of ids) {
      if (group.has(i)) continue;
      const stack = [i]; group.set(i, g);
      while (stack.length) {
        const a = cs[stack.pop()!];
        for (const j of ids) if (!group.has(j) && dist(a.pos, cs[j].pos) < LINK) { group.set(j, g); stack.push(j); }
      }
      g++;
    }
    const out: Fight[] = [];
    for (let k = 0; k < g; k++) {
      const members = ids.filter((i) => group.get(i) === k);
      let sum = 0, sx = 0, sy = 0;
      const sides = [0, 0];
      for (const i of members) { sum += act.get(i)!; sx += cs[i].pos.x; sy += cs[i].pos.y; sides[cs[i].side]++; }
      const cx = sx / members.length, cy = sy / members.length;
      const centre = { x: cx, y: cy };
      let score = sum + (members.length >= 3 ? 0.45 * (members.length - 2) : 0);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (p: Vec) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
      for (const i of members) add(cs[i].pos);
      let hot = 0;
      for (const h of this.hots) if ((fog === null || h.seen[fog]) && dist(h.p, centre) < 2600) { hot += h.w * (1 - (t - h.t) / 6); add(h.p); }
      score += hot;
      let tag = '';
      for (const o of objs) {
        if (dist(o.p, centre) > 2600) continue;
        score += (o.kind === 'baron' || o.kind === 'elder' ? 1.6 : o.kind === 'dragon' ? 1.0 : 0.6);
        add(o.p);
        tag = o.kind === 'grubs' ? 'Voidgrubs' : o.kind === 'herald' ? 'Herald' : o.kind[0].toUpperCase() + o.kind.slice(1);
      }
      for (const tw of sim.towers) {
        if (!tw.alive || tw.targetIdx === null || tw.targetIdx < 0 || tw.shotReadyAt < t - 2) continue;
        const v = cs[tw.targetIdx];
        if (!v || v.dead || v.side === tw.def.side || !members.includes(v.idx)) continue;
        score += 0.8; add(tw.def.pos);
        if (!tag) tag = 'tower dive';
      }
      const twoSided = sides[0] > 0 && sides[1] > 0;
      if (!twoSided && hot === 0 && !objs.some((o) => dist(o.p, centre) < 2600)) continue; // one team farming a camp etc.
      // frame the people arriving too
      for (const c of cs) {
        if (c.dead || act.has(c.idx) || !vis(c)) continue;
        if (members.some((i) => dist(cs[i].pos, c.pos) < BYSTANDER)) add(c.pos);
      }
      const where = region(centre), sd: [number, number] = [sides[0], sides[1]];
      out.push({ x0, y0, x1, y1, cx, cy, score, members, sides: sd, tag, where, label: fightLabel(sd, tag, where) });
    }
    return out;
  }

  private pick(t: number, speed: number, nowReal: number) {
    const tu = tuning(speed);
    const STAY = 1.2;
    let f = this.focus;
    if (f) {
      // the same fight = closest cluster near the focus, preferring shared members
      let match: Fight | null = null, md = Infinity;
      for (const x of this.fights) {
        const shared = x.members.some((i) => f!.members.includes(i));
        const d = Math.hypot(x.cx - f.cx, x.cy - f.cy) - (shared ? 2000 : 0);
        if (d < 3200 && d < md) { md = d; match = x; }
      }
      if (match && match.score >= STAY) {
        Object.assign(f, { x0: match.x0, y0: match.y0, x1: match.x1, y1: match.y1, cx: match.cx, cy: match.cy, members: match.members, score: match.score });
        f.activeAt = t; f.activeReal = nowReal;
        // a steady caption: the biggest head-count seen, the objective once one is involved, the region it started in
        f.sides = [Math.max(f.sides[0], match.sides[0]), Math.max(f.sides[1], match.sides[1])];
        if (OBJECTIVE_TAGS.has(match.tag) || !f.tag) f.tag = match.tag;
        if (Math.hypot(match.cx - f.ox, match.cy - f.oy) > 3500) { f.where = match.where; f.ox = match.cx; f.oy = match.cy; }
        f.label = fightLabel(f.sides, f.tag, f.where);
      }
      const held = nowReal - f.sinceReal >= tu.hold;
      const best = this.fights.reduce<Fight | null>((b, x) => (x !== match && (!b || x.score > b.score) ? x : b), null);
      if (best && held && best.score >= tu.engage && best.score > 1.6 * (match && match.score >= STAY ? match.score : 0)) {
        this.focus = f = { ...best, sides: [...best.sides], since: t, sinceReal: nowReal, activeAt: t, activeReal: nowReal, ox: best.cx, oy: best.cy };
      } else if (held && t - f.activeAt > 2.5 && nowReal - f.activeReal > 0.9) {
        this.focus = null; this.releasedReal = nowReal;
      }
    }
    if (!this.focus) {
      const best = this.fights.reduce<Fight | null>((b, x) => (!b || x.score > b.score ? x : b), null);
      const cooling = nowReal - this.releasedReal < 0.6;
      if (best && best.score >= tu.engage * (cooling ? 1.6 : 1)) this.focus = { ...best, sides: [...best.sides], since: t, sinceReal: nowReal, activeAt: t, activeReal: nowReal, ox: best.cx, oy: best.cy };
    }
  }
}

/** The view that frames a box (game units) with some padding, zoom capped. */
export function frameBox(b: { x0: number; y0: number; x1: number; y1: number }, cap: number, pad = 1100): View {
  const span = Math.max(b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad, MAP_SIZE / cap);
  let zoom = MAP_SIZE / span;
  if (zoom < 1.2) zoom = 1; // nearly the whole map anyway
  return clampView({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, zoom });
}

// ------------------------------------------------------------------ camera controller
export interface CamStatus { kind: 'manual' | 'fight-live' | 'fight-idle' | 'follow'; text: string }

const lerpPos = (a: Vec, b: Vec, t: number): Vec => {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > 1500 * 1500) return b;
  return { x: a.x + dx * t, y: a.y + dy * t };
};

export class Camera {
  cur: View = { ...FULL_VIEW };
  tgt: View = { ...FULL_VIEW };
  mode: CamMode = 'manual';
  followZoom = 2.4;
  director = new FightDirector();
  status: CamStatus = { kind: 'manual', text: '' };
  /** Called when the camera itself changes mode (e.g. a drag takes over from the fight cam). */
  onMode: ((m: CamMode) => void) | null = null;
  private anchor: { wx: number; wy: number; sx: number; sy: number } | null = null;
  /** Eased center before clamping to the map (the shown center is this, clamped for the current zoom). */
  private pc: Vec | null = null;
  private tauZoom = 0.12;
  private tauPan = 0.12;

  setMode(m: CamMode, notify = true) {
    if (m === this.mode) return;
    this.mode = m;
    this.anchor = null;
    if (m === 'manual') this.tgt = { ...this.cur };
    if (notify) this.onMode?.(m);
  }
  private takeOver() { if (this.mode === 'fight') this.setMode('manual'); }

  /** Zoom by a factor keeping the point under (sx, sy) fixed (screen CSS px of an S-px canvas). */
  zoomBy(f: number, S: number, sx = S / 2, sy = S / 2) {
    if (this.mode === 'follow') { this.followZoom = clamp(this.followZoom * f, 1.3, MAX_ZOOM); return; }
    this.takeOver();
    const z = clamp((this.anchor ? this.tgt.zoom : this.cur.zoom) * f, 1, MAX_ZOOM);
    const w = screenToWorld(this.cur, sx, sy, S);
    this.anchor = { wx: w.x, wy: w.y, sx, sy };
    const k = ppu(S, z);
    this.tgt = clampView({ zoom: z, cx: w.x - (sx - S / 2) / k, cy: w.y + (sy - S / 2) / k });
    this.tauZoom = this.tauPan = 0.1;
  }
  /** Drag: move the map with the pointer (immediate). */
  panBy(dx: number, dy: number, S: number) {
    if (this.mode !== 'manual') this.setMode('manual');
    if (this.anchor) { this.cur = { ...this.tgt }; this.anchor = null; }
    const k = ppu(S, this.cur.zoom);
    this.cur = clampView({ zoom: this.cur.zoom, cx: this.cur.cx - dx / k, cy: this.cur.cy + dy / k });
    this.tgt = { ...this.cur };
    this.pc = null;
  }
  /** Keyboard pan: a share of the visible width, eased. */
  nudge(fx: number, fy: number) {
    if (this.mode !== 'manual') this.setMode('manual');
    this.anchor = null;
    const span = MAP_SIZE / this.tgt.zoom;
    this.tgt = clampView({ ...this.tgt, cx: this.tgt.cx + fx * span, cy: this.tgt.cy + fy * span });
    this.tauPan = this.tauZoom = 0.14;
  }
  /** Center on a world point (minimap); `snap` jumps there (drag), otherwise eases. */
  centerOn(p: Vec, snap: boolean) {
    if (this.mode !== 'manual') this.setMode('manual');
    this.anchor = null;
    this.tgt = clampView({ zoom: this.tgt.zoom, cx: p.x, cy: p.y });
    if (snap) { this.cur = clampView({ zoom: this.cur.zoom, cx: p.x, cy: p.y }); this.pc = null; }
    this.tauPan = this.tauZoom = 0.12;
  }
  /** Whole map, manual mode. */
  fit() {
    if (this.mode !== 'manual') this.setMode('manual');
    this.anchor = null;
    this.tgt = { ...FULL_VIEW };
    this.tauPan = this.tauZoom = 0.16;
  }

  /** Per animation frame: run the director, pick a target for the current mode, ease toward it. */
  update(dt: number, sim: MatchSim, o: { S: number; speed: number; selected: number | null; prev: Map<number, Vec>; alpha: number; nowReal: number; fog?: 0 | 1 | null }) {
    const d = this.director;
    const fog = o.fog ?? null;
    d.update(sim, o.speed, o.nowReal, fog);
    const cap = tuning(o.speed).cap;
    if (this.mode === 'fight') {
      const f = d.focus;
      const want = f ? frameBox(f, cap) : FULL_VIEW;
      // zoom hysteresis: zoom out at once if someone would leave the frame, zoom in only for a real change
      const z = want.zoom < this.tgt.zoom || want.zoom > this.tgt.zoom * 1.15 || !f ? want.zoom : this.tgt.zoom;
      this.tgt = clampView({ cx: want.cx, cy: want.cy, zoom: z });
      this.tauZoom = 0.45; this.tauPan = 0.3;
      this.status = f ? { kind: 'fight-live', text: `Fight cam · ${f.label}` } : { kind: 'fight-idle', text: 'Fight cam · watching for fights' };
    } else if (this.mode === 'follow') {
      const c = o.selected !== null ? sim.champs[o.selected] : null;
      if (!c) {
        this.tgt = { ...FULL_VIEW }; this.tauZoom = this.tauPan = 0.4;
        this.status = { kind: 'follow', text: 'Follow · click a player' };
      } else if (c.dead) {
        this.tgt = { ...FULL_VIEW }; this.tauZoom = this.tauPan = 0.5;
        this.status = { kind: 'follow', text: `Following ${c.input.name} · respawn in ${Math.max(0, Math.ceil(c.respawnAt - sim.t))}s` };
      } else if (fog !== null && c.side !== fog && !sim.teams[fog].visible.has(c.idx)) {
        // an enemy in the fog: hold the camera rather than give their position away
        this.status = { kind: 'follow', text: `Following ${c.input.name} · in the fog` };
      } else {
        const p = lerpPos(o.prev.get(c.idx) ?? c.pos, c.pos, o.alpha);
        const fight = d.fights.find((x) => x.members.includes(c.idx) && x.score >= 1.5);
        if (fight) {
          // in a fight: widen to keep the whole fight (and the player) in frame
          const fr = frameBox({ x0: Math.min(fight.x0, p.x), y0: Math.min(fight.y0, p.y), x1: Math.max(fight.x1, p.x), y1: Math.max(fight.y1, p.y) }, this.followZoom, 900);
          this.tgt = clampView({ cx: fr.cx, cy: fr.cy, zoom: Math.min(this.followZoom, fr.zoom) });
          this.tauZoom = 0.45; this.tauPan = 0.3;
        } else {
          this.tgt = clampView({ cx: p.x, cy: p.y, zoom: this.followZoom });
          this.tauZoom = 0.45; this.tauPan = 0.1;
        }
        this.status = { kind: 'follow', text: `Following ${c.input.name}${fight ? ` · ${fight.label}` : ''}` };
      }
    } else {
      this.status = { kind: 'manual', text: this.tgt.zoom > 1.02 ? `Manual · ${this.tgt.zoom.toFixed(1)}×` : '' };
    }
    this.ease(dt, o.S);
  }

  private ease(dt: number, S: number) {
    const kz = 1 - Math.exp(-dt / this.tauZoom), kp = 1 - Math.exp(-dt / this.tauPan);
    // automatic cuts fly "out, across, in": never zoom in further than keeps the target area on screen from
    // where the camera is now, so the action stays visible during the move
    const pc = this.pc ?? (this.pc = { x: this.cur.cx, y: this.cur.cy });
    let zt = this.tgt.zoom;
    if (this.mode !== 'manual' && !this.anchor) {
      const need = Math.max(Math.abs(this.tgt.cx - pc.x), Math.abs(this.tgt.cy - pc.y)) + MAP_SIZE / (2 * this.tgt.zoom);
      zt = Math.max(1, Math.min(zt, MAP_SIZE / (2 * need)));
    }
    const lz = Math.log(this.cur.zoom), lt = Math.log(zt);
    const zoom = Math.exp(Math.abs(lt - lz) < 0.002 ? lt : lz + (lt - lz) * kz);
    if (this.anchor) {
      const a = this.anchor, k = ppu(S, zoom);
      this.cur = clampView({ zoom, cx: a.wx - (a.sx - S / 2) / k, cy: a.wy + (a.sy - S / 2) / k });
      this.pc = { x: this.cur.cx, y: this.cur.cy };
      if (zoom === zt) { this.anchor = null; this.tgt = { ...this.cur }; }
    } else {
      const done = Math.abs(this.tgt.cx - pc.x) < 0.5 && Math.abs(this.tgt.cy - pc.y) < 0.5;
      pc.x = done ? this.tgt.cx : pc.x + (this.tgt.cx - pc.x) * kp;
      pc.y = done ? this.tgt.cy : pc.y + (this.tgt.cy - pc.y) * kp;
      this.cur = clampView({ zoom, cx: pc.x, cy: pc.y });
    }
  }
}
