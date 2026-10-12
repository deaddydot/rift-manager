// Canvas renderer for the top-down match viewer.
import type { MatchSim } from '../../engine/sim/engine';
import { MAP_SIZE, LANE_LINES, lanePoint, FOUNTAIN, NEXUS, type Vec } from '../../engine/sim/map';
import { DRAGON_COLOR, VISION } from '../../engine/sim/constants';
import { gd } from '../../data/gamedata';
import { minimapRect, minimapAlpha, type View } from './camera';

const base = import.meta.env.BASE_URL ?? './';
const imgCache = new Map<string, HTMLImageElement>();
export function img(src: string): HTMLImageElement {
  let i = imgCache.get(src);
  if (!i) { i = new Image(); i.src = src.startsWith('http') ? src : base + src; imgCache.set(src, i); }
  return i;
}

export const TEAM_COLORS = ['#3b82f6', '#ef4444'];

export interface RenderOpts {
  size: number; prev: Map<number, Vec>; alpha: number; fog: 0 | 1 | null; selected: number | null; showWards: boolean;
  /** Camera (game units): map center + zoom. Omitted = the whole map. */
  view?: View;
  /** Draw the minimap inset (with the visible rectangle) while zoomed in. */
  minimap?: boolean;
}

/** Game coords → map pixels for a whole-map canvas of S px. A camera is applied as a canvas transform on top. */
const P = (p: Vec, S: number) => [p.x / MAP_SIZE * S, S - p.y / MAP_SIZE * S] as const;
/** How fast icons / labels / line widths grow with zoom (zoom^ICON_GROWTH on screen): close-ups stay readable. */
export const ICON_GROWTH = 0.5;
// per-frame camera helpers (module state like the fog canvas; one viewer draws at a time)
let PX = 1;                                      // one screen CSS pixel, in map pixels
let VB = { x0: 0, y0: 0, x1: 760, y1: 760 };     // the visible part of the map, in map pixels

export function renderMatch(ctx: CanvasRenderingContext2D, sim: MatchSim, o: RenderOpts) {
  const S = o.size;
  const t = sim.t;
  ctx.clearRect(0, 0, S, S);
  // camera: screen = (mapPx - centerPx) * zoom + S/2, applied to everything below (background, fog, entities)
  const zoom = o.view ? o.view.zoom : 1;
  ctx.save();
  if (o.view && (zoom !== 1 || o.view.cx !== MAP_SIZE / 2 || o.view.cy !== MAP_SIZE / 2)) {
    const [px, py] = P({ x: o.view.cx, y: o.view.cy }, S);
    ctx.translate(S / 2, S / 2); ctx.scale(zoom, zoom); ctx.translate(-px, -py);
    VB = { x0: px - S / 2 / zoom, y0: py - S / 2 / zoom, x1: px + S / 2 / zoom, y1: py + S / 2 / zoom };
  } else VB = { x0: 0, y0: 0, x1: S, y1: S };
  PX = 1 / zoom;
  const bg = img('img/rift.webp');
  if (bg.complete) ctx.drawImage(bg, 0, 0, S, S);
  else { ctx.fillStyle = '#0d1424'; ctx.fillRect(0, 0, S, S); }
  const sc = S / 760 / zoom ** (1 - ICON_GROWTH); // scale factor for sizes (in map pixels; grows ~√zoom on screen)

  // ---- fog of war (team vision view): darken everything this team can't see
  const sight = o.fog !== null ? visionSources(sim, o.fog) : null;
  const seen = (p: Vec) => !sight || sight.some((v) => (v.p.x - p.x) ** 2 + (v.p.y - p.y) ** 2 < v.r * v.r);
  if (sight) drawFog(ctx, S, sight);

  // wards & vision
  if (o.showWards) {
    for (const w of sim.wards) {
      if (o.fog !== null && w.side !== o.fog) continue;
      const [x, y] = P(w.pos, S);
      ctx.beginPath(); ctx.arc(x, y, 900 / MAP_SIZE * S, 0, Math.PI * 2);
      ctx.fillStyle = w.side === 0 ? 'rgba(59,130,246,0.06)' : 'rgba(239,68,68,0.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 3 * sc, 0, Math.PI * 2);
      ctx.fillStyle = w.control ? '#f472b6' : '#facc15'; ctx.fill();
      ctx.strokeStyle = TEAM_COLORS[w.side]; ctx.lineWidth = PX; ctx.stroke();
    }
  }

  // structures
  for (const tw of sim.towers) {
    const [x, y] = P(tw.def.pos, S);
    const col = TEAM_COLORS[tw.def.side];
    if (!tw.alive) {
      ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.lineWidth = 2 * sc;
      ctx.beginPath(); ctx.moveTo(x - 5 * sc, y - 5 * sc); ctx.lineTo(x + 5 * sc, y + 5 * sc); ctx.moveTo(x + 5 * sc, y - 5 * sc); ctx.lineTo(x - 5 * sc, y + 5 * sc); ctx.stroke();
      continue;
    }
    const r = 7 * sc;
    ctx.fillStyle = '#0b1220'; ctx.strokeStyle = col; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    const f = Math.max(0, tw.hp / tw.maxHp);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.45 * f + 1, 0, Math.PI * 2); ctx.fill();
    if (tw.targetIdx !== null && tw.targetIdx >= 0 && tw.shotReadyAt > t - 0.3) {
      const c = sim.champs[tw.targetIdx];
      if (c && !c.dead && (o.fog === null || c.side === o.fog || sim.teams[o.fog].visible.has(c.idx))) { const [cx, cy] = P(c.pos, S); ctx.strokeStyle = 'rgba(253,224,71,0.8)'; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke(); }
    }
  }
  for (const ih of sim.inhibs) {
    const [x, y] = P(ih.pos, S);
    ctx.beginPath(); ctx.arc(x, y, 6 * sc, 0, Math.PI * 2);
    ctx.fillStyle = ih.alive ? TEAM_COLORS[ih.side] : 'rgba(100,116,139,0.4)'; ctx.fill();
    ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 2 * PX; ctx.stroke();
  }
  NEXUS.forEach((n, side) => {
    const [x, y] = P(n, S);
    const hp = sim.nexusHp[side] / 5500;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#0b1220'; ctx.strokeStyle = TEAM_COLORS[side]; ctx.lineWidth = 3 * sc;
    ctx.fillRect(-10 * sc, -10 * sc, 20 * sc, 20 * sc); ctx.strokeRect(-10 * sc, -10 * sc, 20 * sc, 20 * sc);
    ctx.fillStyle = TEAM_COLORS[side]; const s2 = 7 * sc * Math.max(0.1, hp); ctx.fillRect(-s2, -s2, 2 * s2, 2 * s2);
    ctx.restore();
  });

  // minion waves: a column along the lane — super minions and melee in front, the cannon in the
  // middle, casters behind; a stacked wave forms extra columns side by side
  for (const w of sim.waves) {
    const p = lanePoint(w.lane, w.p);
    if (o.fog !== null && w.side !== o.fog && !seen(p)) continue;
    const [x, y] = P(p, S);
    const ahead = lanePoint(w.lane, w.p + (w.side === 0 ? 1 : -1) * 80 / LANE_LINES[w.lane].length);
    const [ax, ay] = P(ahead, S);
    const dl = Math.hypot(ax - x, ay - y) || 1;
    const ux = (ax - x) / dl, uy = (ay - y) / dl; // walking direction on screen
    const n = Math.min(w.count, 21);
    const supers = Math.min(w.supers, n);
    const cannon = w.cannon && n > supers ? 1 : 0;
    const melee = Math.ceil((n - supers - cannon) / 2), casters = n - supers - cannon - melee;
    const units: ('super' | 'melee' | 'cannon' | 'caster')[] = [
      ...Array<'super'>(supers).fill('super'), ...Array<'melee'>(melee).fill('melee'),
      ...(cannon ? ['cannon' as const] : []), ...Array<'caster'>(casters).fill('caster'),
    ];
    const cols = Math.ceil(units.length / 7), gap = 3.6 * sc;
    const col = w.side === 0 ? '#60a5fa' : '#f87171';
    for (let i = 0; i < units.length; i++) {
      const c = Math.floor(i / 7), k = i % 7, inCol = Math.min(7, units.length - c * 7);
      const along = ((inCol - 1) / 2 - k) * gap, across = (c - (cols - 1) / 2) * gap;
      const mx = x + ux * along - uy * across, my = y + uy * along + ux * across;
      const u = units[i];
      const r = (u === 'super' ? 2.6 : u === 'cannon' ? 2.4 : u === 'melee' ? 1.6 : 1.4) * sc;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = u === 'caster' ? (w.side === 0 ? '#93c5fd' : '#fca5a5') : col; ctx.fill();
      if (u === 'super' || u === 'cannon') { ctx.strokeStyle = u === 'super' ? '#fde68a' : '#0b1220'; ctx.lineWidth = PX; ctx.stroke(); }
    }
  }

  // camps
  for (const c of sim.camps) {
    if (!c.alive) continue;
    const [x, y] = P(c.def.pos, S);
    const big = c.def.kind === 'blue' || c.def.kind === 'red';
    const vis = seen(c.def.pos);
    ctx.beginPath(); ctx.arc(x, y, (big ? 4.5 : 3) * sc, 0, Math.PI * 2);
    ctx.fillStyle = c.def.kind === 'blue' ? '#38bdf8' : c.def.kind === 'red' ? '#fb7185' : c.def.kind === 'scuttle' ? '#a3e635' : '#fbbf24';
    ctx.globalAlpha = vis ? 0.85 : 0.3; ctx.fill(); ctx.globalAlpha = 1;
    if (vis && c.hp < c.maxHp) hpBar(ctx, x, y + 7 * sc, 14 * sc, c.hp / c.maxHp, '#fbbf24', sc);
  }

  // epic monsters
  for (const ob of sim.objectives) {
    const [x, y] = P(ob.pos, S);
    if (!ob.alive) {
      if (ob.spawnAt > 0 && ob.spawnAt - t < 60) {
        ctx.fillStyle = 'rgba(226,232,240,0.85)'; ctx.font = `${10 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(ob.spawnAt - t)}s`, x, y + 4 * sc);
      }
      continue;
    }
    const col = ob.kind === 'baron' ? '#a855f7' : ob.kind === 'elder' ? DRAGON_COLOR.elder : ob.kind === 'dragon' ? DRAGON_COLOR[ob.dragonType!] : ob.kind === 'herald' ? '#c084fc' : '#7c3aed';
    const r = (ob.kind === 'baron' || ob.kind === 'elder' ? 12 : 9) * sc;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 2 * sc; ctx.stroke();
    ctx.fillStyle = '#0b1220'; ctx.font = `bold ${10 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center';
    ctx.fillText(ob.kind === 'baron' ? 'B' : ob.kind === 'elder' ? 'E' : ob.kind === 'dragon' ? 'D' : ob.kind === 'herald' ? 'H' : 'G', x, y + 3.5 * sc);
    if (ob.hp < ob.maxHp && seen(ob.pos)) hpBar(ctx, x, y + r + 5 * sc, 30 * sc, ob.hp / ob.maxHp, col, sc);
  }

  // summons
  drawSummons(ctx, sim, S, sc, o, seen);

  // ultimates: area / path, name and who it hit
  drawUlts(ctx, sim, S, sc, o, seen);

  // fx under champions
  for (const c of sim.champs) {
    if (c.dead) continue;
    if (o.fog !== null && c.side !== o.fog && !sim.teams[o.fog].visible.has(c.idx)) continue;
    const cp = lerp(o.prev.get(c.idx) ?? c.pos, c.pos, o.alpha);
    const [cx, cy] = P(cp, S);
    // dash / leap in progress: a streak from where it started (leaps arc a little)
    if (c.dashing) {
      const [fx0, fy0] = P(c.dashing.from, S);
      const g = ctx.createLinearGradient(fx0, fy0, cx, cy);
      const col = c.side === 0 ? '96,165,250' : '248,113,113';
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},0.85)`);
      ctx.strokeStyle = g; ctx.lineWidth = 4 * sc; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx0, fy0);
      if (c.dashing.kind === 'leap') { const mx = (fx0 + cx) / 2, my = (fy0 + cy) / 2 - 18 * sc; ctx.quadraticCurveTo(mx, my, cx, cy); } else ctx.lineTo(cx, cy);
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    for (const f of c.fx) {
      // a blink (or the end of a dash): a faint line from the start point, fading out
      if (f.kind === 'dash' && f.to && !c.dashing && f.until - sim.t > 0) {
        ctx.globalAlpha = Math.min(1, (f.until - sim.t) / 0.5) * 0.5; ctx.strokeStyle = c.side === 0 ? '#93c5fd' : '#fca5a5'; ctx.lineWidth = 2 * sc;
        ctx.beginPath(); ctx.arc(cx, cy, 10 * sc, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (f.kind === 'attack' && f.to) { const [tx, ty] = P(f.to, S); ctx.strokeStyle = c.side === 0 ? 'rgba(147,197,253,0.6)' : 'rgba(252,165,165,0.6)'; ctx.lineWidth = 1.2 * sc; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke(); }
      if ((f.kind === 'cast' || f.kind === 'miss') && f.to) {
        const [tx, ty] = P(f.to, S);
        ctx.strokeStyle = f.color ?? '#a78bfa'; ctx.globalAlpha = f.kind === 'miss' ? 0.35 : 0.85; ctx.lineWidth = 2.5 * sc;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
        if (f.kind === 'cast') { ctx.beginPath(); ctx.arc(tx, ty, 8 * sc, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (f.kind === 'flash') { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(cx, cy, 14 * sc, 0, Math.PI * 2); ctx.stroke(); }
      if (f.kind === 'tp') { ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.arc(cx, cy, 16 * sc, 0, Math.PI * 2); ctx.stroke(); }
      if (f.kind === 'towerShot' && f.to) { /* drawn from tower */ }
    }
    if (c.recallUntil > t) {
      const prog = 1 - (c.recallUntil - t) / 8;
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2.5 * sc; ctx.beginPath(); ctx.arc(cx, cy, 15 * sc, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    }
  }

  // champions
  const R = 13 * sc;
  if (o.fog !== null) {
    // where enemies were last seen (fading over 10s)
    const tm = sim.teams[o.fog];
    for (const c of sim.champs) {
      if (c.side === o.fog || c.dead || tm.visible.has(c.idx)) continue;
      const ls = tm.lastSeen.get(c.idx);
      if (!ls || t - ls.t > 10) continue;
      const [gx, gy] = P(ls.pos, S);
      const icon = img(gd().championById[c.champ.id]?.image ?? '');
      ctx.save(); ctx.globalAlpha = 0.45 * (1 - (t - ls.t) / 10);
      ctx.beginPath(); ctx.arc(gx, gy, R * 0.85, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, gx - R, gy - R, 2 * R, 2 * R);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - (t - ls.t) / 10);
      ctx.strokeStyle = TEAM_COLORS[c.side]; ctx.setLineDash([2 * PX, 3 * PX]); ctx.lineWidth = 1.5 * sc;
      ctx.beginPath(); ctx.arc(gx, gy, R * 0.85, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f8fafc'; ctx.font = `bold ${9 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center'; ctx.fillText('?', gx, gy + 3 * sc);
      ctx.restore();
    }
  }
  for (const c of sim.champs) {
    let pos: Vec;
    if (c.dead) pos = FOUNTAIN[c.side];
    else pos = lerp(o.prev.get(c.idx) ?? c.pos, c.pos, o.alpha);
    if (o.fog !== null && c.side !== o.fog && !c.dead && !sim.teams[o.fog].visible.has(c.idx)) continue;
    const [x, y] = P(pos, S);
    const off = c.dead ? (c.idx % 5 - 2) * 9 * sc : 0;
    const ix = x + off, iy = y + (c.dead ? (c.side === 0 ? -12 : 12) * sc : 0);
    const icon = img(gd().championById[c.champ.id]?.image ?? '');
    ctx.save();
    ctx.globalAlpha = c.dead ? 0.35 : 1;
    ctx.beginPath(); ctx.arc(ix, iy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#0b1220'; ctx.fill();
    ctx.save(); ctx.clip();
    if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, ix - R, iy - R, 2 * R, 2 * R);
    ctx.restore();
    ctx.lineWidth = (o.selected === c.idx ? 3.5 : 2.5) * sc;
    ctx.strokeStyle = o.selected === c.idx ? '#fde047' : TEAM_COLORS[c.side];
    ctx.beginPath(); ctx.arc(ix, iy, R, 0, Math.PI * 2); ctx.stroke();
    const cc = !c.dead ? ccState(c, t) : null;
    if (cc) { ctx.strokeStyle = cc.color; ctx.lineWidth = 2 * sc; ctx.setLineDash([3 * PX, 2 * PX]); ctx.beginPath(); ctx.arc(ix, iy, R + 3 * sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (c.shield > 0 && c.shieldUntil > t && !c.dead) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5 * sc; ctx.beginPath(); ctx.arc(ix, iy, R + 1.5 * sc, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    if (!c.dead) {
      hpBar(ctx, ix, iy - R - 5 * sc, 28 * sc, c.hp / c.stats.maxHp, c.side === 0 ? '#22c55e' : '#ef4444', sc);
      if (cc) {
        // CC label with the time left
        const label = `${cc.label} ${cc.left.toFixed(1)}`;
        ctx.font = `bold ${7.5 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center';
        const w = ctx.measureText(label).width + 6 * sc;
        ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.fillRect(ix - w / 2, iy - R - 16 * sc, w, 9 * sc);
        ctx.fillStyle = cc.color; ctx.fillText(label, ix, iy - R - 9.2 * sc);
      }
      ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(ix + R * 0.75, iy + R * 0.75, 6 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.font = `bold ${8 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center'; ctx.fillText(String(c.level), ix + R * 0.75, iy + R * 0.75 + 3 * sc);
    } else {
      ctx.fillStyle = '#f8fafc'; ctx.font = `bold ${10 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(c.respawnAt - t)), ix, iy + 4 * sc);
    }
  }
  drawFloaters(ctx, sim, S, sc, seen);
  ctx.restore();
  if (o.minimap && o.view && minimapAlpha(o.view.zoom) > 0) drawMinimap(ctx, sim, S, o.view, o);
}

/** Minimap inset (screen space, bottom-right) with champion dots and the visible rectangle. */
function drawMinimap(ctx: CanvasRenderingContext2D, sim: MatchSim, S: number, v: View, o: RenderOpts) {
  const { x, y, w } = minimapRect(S);
  const m = (p: Vec) => [x + p.x / MAP_SIZE * w, y + w - p.y / MAP_SIZE * w] as const;
  ctx.save();
  ctx.globalAlpha = minimapAlpha(v.zoom);
  ctx.fillStyle = 'rgba(2,6,23,0.9)'; ctx.fillRect(x - 3, y - 3, w + 6, w + 6);
  const bg = img('img/rift.webp');
  if (bg.complete) ctx.drawImage(bg, x, y, w, w);
  ctx.fillStyle = 'rgba(2,6,23,0.25)'; ctx.fillRect(x, y, w, w);
  for (const tw of sim.towers) {
    if (!tw.alive) continue;
    const [tx, ty] = m(tw.def.pos);
    ctx.fillStyle = TEAM_COLORS[tw.def.side]; ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
  }
  for (const c of sim.champs) {
    if (c.dead || (o.fog !== null && c.side !== o.fog && !sim.teams[o.fog].visible.has(c.idx))) continue;
    const [cx, cy] = m(c.pos);
    ctx.beginPath(); ctx.arc(cx, cy, o.selected === c.idx ? 3.6 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = TEAM_COLORS[c.side]; ctx.fill();
    ctx.lineWidth = o.selected === c.idx ? 1.6 : 0.8; ctx.strokeStyle = o.selected === c.idx ? '#fde047' : '#0b1220'; ctx.stroke();
  }
  const half = MAP_SIZE / (2 * v.zoom);
  const [rx0, ry0] = m({ x: v.cx - half, y: v.cy + half }), [rx1, ry1] = m({ x: v.cx + half, y: v.cy - half });
  ctx.fillStyle = 'rgba(240,230,210,0.08)'; ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  ctx.strokeStyle = '#f0e6d2'; ctx.lineWidth = 1.5; ctx.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  ctx.strokeStyle = 'rgba(200,170,110,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 2.5, w + 5, w + 5);
  ctx.restore();
}

/** Floating combat text (big hits, heals). */
export function drawFloaters(ctx: CanvasRenderingContext2D, sim: MatchSim, S: number, sc: number, seen: (p: Vec) => boolean) {
  for (const f of sim.floaters) {
    if (!seen(f.pos)) continue;
    const age = sim.t - f.t, life = f.until - f.t;
    const [x, y] = P(f.pos, S);
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / life);
    ctx.font = `bold ${11 * sc}px Rajdhani, Inter`; ctx.textAlign = 'center';
    ctx.lineWidth = 3 * sc; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(f.text, x, y - 18 * sc - age * 14 * sc);
    ctx.fillStyle = f.color; ctx.fillText(f.text, x, y - 18 * sc - age * 14 * sc);
    ctx.restore();
  }
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, col: string, sc: number) {
  const h = 3.5 * sc;
  ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.fillRect(x - w / 2 - PX, y - PX, w + 2 * PX, h + 2 * PX);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}

const lerp = (a: Vec, b: Vec, t: number): Vec => {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > 1500 * 1500) return b; // teleports / flashes / respawns snap
  return { x: a.x + dx * t, y: a.y + dy * t };
};

const CC_UI: Record<string, { label: string; color: string }> = {
  stun: { label: 'STUN', color: '#facc15' }, knockup: { label: 'AIRBORNE', color: '#f8fafc' }, airborne: { label: 'AIRBORNE', color: '#f8fafc' },
  suppress: { label: 'SUPPRESSED', color: '#f87171' }, sleep: { label: 'ASLEEP', color: '#93c5fd' }, polymorph: { label: 'POLYMORPH', color: '#c084fc' },
  charm: { label: 'CHARMED', color: '#f472b6' }, taunt: { label: 'TAUNTED', color: '#fb923c' }, fear: { label: 'FEARED', color: '#a78bfa' }, pull: { label: 'PULLED', color: '#facc15' },
};
/** The most limiting crowd control on a champion right now (for the map label). */
function ccState(c: MatchSim['champs'][number], t: number): { label: string; color: string; left: number } | null {
  if (c.ccUntil > t) { const u = CC_UI[c.ccType ?? 'stun'] ?? CC_UI.stun; return { ...u, left: c.ccUntil - t }; }
  if ((c.rootUntil ?? 0) > t) return { label: 'ROOTED', color: '#4ade80', left: c.rootUntil! - t };
  if ((c.silenceUntil ?? 0) > t) return { label: 'SILENCED', color: '#94a3b8', left: c.silenceUntil! - t };
  if ((c.blindUntil ?? 0) > t) return { label: 'BLINDED', color: '#64748b', left: c.blindUntil! - t };
  return null;
}

// ------------------------------------------------------------------ fog of war
type Sight = { p: Vec; r: number }[];
/** Everything a team can see right now: champions, wards, towers, minions, summons, its base. */
function visionSources(sim: MatchSim, side: 0 | 1): Sight {
  const out: Sight = [];
  const champ = sim.darkUntil[side] > sim.t ? 350 : VISION.champion;
  for (const c of sim.champs) if (c.side === side && !c.dead) out.push({ p: c.pos, r: champ });
  for (const w of sim.wards) if (w.side === side) out.push({ p: w.pos, r: VISION.ward });
  for (const tw of sim.towers) if (tw.alive && tw.def.side === side) out.push({ p: tw.def.pos, r: VISION.tower });
  for (const w of sim.waves) if (w.side === side) out.push({ p: lanePoint(w.lane, w.p), r: VISION.minion });
  for (const sm of sim.summons) if (sm.side === side && sm.mode !== 'trap') out.push({ p: sm.pos, r: 700 });
  out.push({ p: FOUNTAIN[side], r: 2600 }, { p: NEXUS[side], r: 1400 });
  return out;
}
let fogCanvas: HTMLCanvasElement | null = null;
/** Darken the screen, cut out what the team sees; drawn on a screen-sized offscreen canvas with the same
 *  transform as the main canvas (devicePixelRatio × camera) so the holes line up at any zoom. */
function drawFog(ctx: CanvasRenderingContext2D, S: number, sight: Sight) {
  const m = ctx.getTransform();
  if (!fogCanvas) fogCanvas = document.createElement('canvas');
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (fogCanvas.width !== W || fogCanvas.height !== H) { fogCanvas.width = W; fogCanvas.height = H; }
  const f = fogCanvas.getContext('2d')!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, W, H);
  f.fillStyle = 'rgba(2,6,23,0.66)'; f.fillRect(0, 0, W, H);
  f.globalCompositeOperation = 'destination-out';
  f.setTransform(m);
  for (const v of sight) {
    const [x, y] = P(v.p, S);
    const r = v.r / MAP_SIZE * S;
    const g = f.createRadialGradient(x, y, r * 0.75, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fogCanvas, 0, 0); ctx.restore();
}

// ------------------------------------------------------------------ summons & ultimates
function drawSummons(ctx: CanvasRenderingContext2D, sim: MatchSim, S: number, sc: number, o: RenderOpts, seen: (p: Vec) => boolean) {
  for (const sm of sim.summons) {
    if (o.fog !== null && sm.side !== o.fog && (sm.mode === 'trap' || !seen(sm.pos))) continue; // enemy traps stay hidden
    const [x, y] = P(sm.pos, S);
    const r = (sm.mode === 'pet' ? 8 : sm.mode === 'turret' ? 6 : 4.5) * sc;
    const icon = img(sm.icon);
    ctx.save();
    ctx.globalAlpha = sm.mode === 'trap' ? 0.7 : 1;
    if (sm.mode === 'trap') { ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#0b1220'; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.strokeStyle = TEAM_COLORS[sm.side]; ctx.lineWidth = 1.5 * sc; ctx.strokeRect(-r, -r, 2 * r, 2 * r); ctx.restore(); continue; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#0b1220'; ctx.fill();
    ctx.save(); ctx.clip(); if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, x - r, y - r, 2 * r, 2 * r); ctx.restore();
    ctx.strokeStyle = TEAM_COLORS[sm.side]; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (!sm.visual) hpBar(ctx, x, y - r - 3.5 * sc, 16 * sc, sm.hp / sm.maxHp, sm.side === 0 ? '#22c55e' : '#ef4444', sc * 0.7);
    if (sm.targetIdx !== null && !sm.visual) {
      const tg = sim.champs[sm.targetIdx];
      if (tg && !tg.dead && Math.hypot(tg.pos.x - sm.pos.x, tg.pos.y - sm.pos.y) < sm.range + 100) {
        const [tx, ty] = P(tg.pos, S);
        ctx.strokeStyle = sm.side === 0 ? 'rgba(147,197,253,0.55)' : 'rgba(252,165,165,0.55)'; ctx.lineWidth = 1 * sc;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }
  }
}

function drawUlts(ctx: CanvasRenderingContext2D, sim: MatchSim, S: number, sc: number, o: RenderOpts, seen: (p: Vec) => boolean) {
  const placed: { x: number; y: number; w: number; h: number }[] = []; // keep simultaneous labels from overlapping
  for (const u of sim.ultFx) {
    const caster = sim.champs[u.idx];
    if (o.fog !== null && caster.side !== o.fog && !seen(u.to) && !seen(u.from)) continue;
    const age = sim.t - u.t, life = u.until - u.t;
    const a = Math.max(0, 1 - age / life);
    const col = caster.side === 0 ? '96,165,250' : '248,113,113';
    const [fx, fy] = P(u.from, S), [tx, ty] = P(u.to, S);
    ctx.save();
    // path (dashed while channelling a map-wide ult)
    if (Math.hypot(tx - fx, ty - fy) > 4 * sc) {
      ctx.strokeStyle = `rgba(${col},${0.85 * a})`; ctx.lineWidth = 3 * sc;
      if (u.channel) ctx.setLineDash([6 * sc, 5 * sc]);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    }
    // area
    const r = Math.max(10 * sc, u.radius / MAP_SIZE * S);
    ctx.fillStyle = `rgba(${col},${0.18 * a})`; ctx.strokeStyle = `rgba(253,224,71,${0.9 * a})`; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.arc(tx, ty, r * (u.channel ? 1 : 0.7 + 0.3 * Math.min(1, age / 0.25)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // label: icon + name (+ hits)
    const icon = img(u.icon);
    const label = `${caster.input.name}: ${u.name}`;
    const sub = u.hits.length ? `${u.hits.length} hit${u.damage ? ` · ${u.damage} dmg` : ''}` : '';
    ctx.globalAlpha = a;
    ctx.font = `bold ${9 * sc}px Rajdhani, Inter`; ctx.textAlign = 'left';
    const w = Math.max(ctx.measureText(label).width, sub ? ctx.measureText(sub).width : 0) + 20 * sc;
    const h = sub ? 22 * sc : 13 * sc;
    const lx = Math.min(VB.x1 - w - 2 * PX, Math.max(VB.x0 + 2 * PX, tx - w / 2));
    let ly = Math.max(VB.y0 + 2 * PX, ty - r - 26 * sc);
    for (let k = 0; k < 6 && placed.some((b) => lx < b.x + b.w && lx + w > b.x && ly < b.y + b.h && ly + h > b.y); k++) ly = Math.max(VB.y0 + 2 * PX, ly - h - 2 * sc);
    placed.push({ x: lx, y: ly, w, h });
    ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.fillRect(lx, ly, w, h);
    if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, lx + 2 * sc, ly + 1.5 * sc, 10 * sc, 10 * sc);
    ctx.fillStyle = '#fde047'; ctx.fillText(label, lx + 15 * sc, ly + 9.5 * sc);
    if (sub) { ctx.fillStyle = '#e2e8f0'; ctx.font = `${8 * sc}px Rajdhani, Inter`; ctx.fillText(sub, lx + 15 * sc, ly + 19 * sc); }
    ctx.restore();
  }
}
