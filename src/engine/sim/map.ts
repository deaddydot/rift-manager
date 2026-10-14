// Summoner's Rift geometry (game units, origin bottom-left, y up) and navigation.
export interface Vec { x: number; y: number }
export type Side = 0 | 1; // 0 = blue (bottom-left), 1 = red (top-right)
export type Lane = 'top' | 'mid' | 'bot';
export const LANES: Lane[] = ['top', 'mid', 'bot'];
export const MAP_SIZE = 14870;

export const v = (x: number, y: number): Vec => ({ x, y });
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const mirror = (p: Vec): Vec => ({ x: MAP_SIZE - p.x, y: MAP_SIZE - p.y });

export type TowerTier = 'outer' | 'inner' | 'inhib' | 'nexus';
export interface TowerDef { id: string; side: Side; lane: Lane | 'base'; tier: TowerTier; pos: Vec }

const BLUE_TOWERS: Omit<TowerDef, 'side' | 'id'>[] = [
  { lane: 'top', tier: 'outer', pos: v(981, 10441) },
  { lane: 'top', tier: 'inner', pos: v(1512, 6699) },
  { lane: 'top', tier: 'inhib', pos: v(1169, 4287) },
  { lane: 'mid', tier: 'outer', pos: v(5846, 6396) },
  { lane: 'mid', tier: 'inner', pos: v(5048, 4812) },
  { lane: 'mid', tier: 'inhib', pos: v(3651, 3696) },
  { lane: 'bot', tier: 'outer', pos: v(10504, 1029) },
  { lane: 'bot', tier: 'inner', pos: v(6919, 1483) },
  { lane: 'bot', tier: 'inhib', pos: v(4281, 1253) },
  { lane: 'base', tier: 'nexus', pos: v(1748, 2270) },
  { lane: 'base', tier: 'nexus', pos: v(2177, 1807) },
];
const RED_TOWERS: Omit<TowerDef, 'side' | 'id'>[] = [
  { lane: 'top', tier: 'outer', pos: v(4318, 13875) },
  { lane: 'top', tier: 'inner', pos: v(7943, 13411) },
  { lane: 'top', tier: 'inhib', pos: v(10481, 13650) },
  { lane: 'mid', tier: 'outer', pos: v(8955, 8510) },
  { lane: 'mid', tier: 'inner', pos: v(9767, 10113) },
  { lane: 'mid', tier: 'inhib', pos: v(11134, 11207) },
  { lane: 'bot', tier: 'outer', pos: v(13866, 4505) },
  { lane: 'bot', tier: 'inner', pos: v(13327, 8226) },
  { lane: 'bot', tier: 'inhib', pos: v(13624, 10572) },
  { lane: 'base', tier: 'nexus', pos: v(12611, 13084) },
  { lane: 'base', tier: 'nexus', pos: v(13052, 12612) },
];
export const TOWERS: TowerDef[] = [
  ...BLUE_TOWERS.map((t, i) => ({ ...t, side: 0 as Side, id: `b_${t.lane}_${t.tier}${t.tier === 'nexus' ? i : ''}` })),
  ...RED_TOWERS.map((t, i) => ({ ...t, side: 1 as Side, id: `r_${t.lane}_${t.tier}${t.tier === 'nexus' ? i : ''}` })),
];

export const INHIBS: { side: Side; lane: Lane; pos: Vec }[] = [
  { side: 0, lane: 'top', pos: v(1171, 3571) }, { side: 0, lane: 'mid', pos: v(3203, 3208) }, { side: 0, lane: 'bot', pos: v(3452, 1236) },
  { side: 1, lane: 'top', pos: v(11261, 13676) }, { side: 1, lane: 'mid', pos: v(11598, 11667) }, { side: 1, lane: 'bot', pos: v(13604, 11316) },
];
export const NEXUS: Vec[] = [v(1551, 1659), v(13300, 13300)];
export const FOUNTAIN: Vec[] = [v(560, 580), v(14300, 14280)];

// Minion paths from each side's base towards the enemy base
const BLUE_LANE_PATHS: Record<Lane, Vec[]> = {
  // the corners cut across the inside of the bend (minions don't walk into the alcove behind it)
  top: [v(1171, 3571), v(1050, 6700), v(1000, 10440), v(1250, 12000), v(1700, 12750), v(2300, 13300), v(3000, 13600), v(4318, 13850), v(7943, 13450), v(10481, 13650), v(11261, 13676)],
  mid: [v(3203, 3208), v(4200, 4250), v(5450, 5600), v(7400, 7400), v(9350, 9300), v(10600, 10650), v(11598, 11667)],
  bot: [v(3452, 1236), v(6919, 1450), v(10504, 1029), v(11870, 1270), v(12570, 1570), v(13170, 2120), v(13620, 2870), v(13850, 4505), v(13400, 8226), v(13624, 10572), v(13604, 11316)],
};
export const LANE_PATHS: Record<Side, Record<Lane, Vec[]>> = {
  0: BLUE_LANE_PATHS,
  1: { top: [...BLUE_LANE_PATHS.top].reverse(), mid: [...BLUE_LANE_PATHS.mid].reverse(), bot: [...BLUE_LANE_PATHS.bot].reverse() },
};

/** Precomputed lane polylines with cumulative lengths for fast position-at-progress queries. */
export interface Polyline { pts: Vec[]; cum: number[]; length: number }
function makePolyline(pts: Vec[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum, length: cum[cum.length - 1] };
}
export const LANE_LINES: Record<Lane, Polyline> = {
  top: makePolyline(BLUE_LANE_PATHS.top),
  mid: makePolyline(BLUE_LANE_PATHS.mid),
  bot: makePolyline(BLUE_LANE_PATHS.bot),
};
/**
 * Past the inhibitors: once an inhibitor falls, waves keep walking into the base — by the Nexus
 * turrets and up to the Nexus. Progress below 0 (blue base) or above 1 (red base) follows these legs.
 */
const BASE_LEGS: Record<Lane, [Vec[], Vec[]]> = {
  top: [[v(1171, 3571), v(1450, 2500), v(1501, 2076)], [v(11261, 13676), v(12370, 13420), v(12884, 13354)]],
  mid: [[v(3203, 3208), v(2050, 2050), v(1881, 1918)], [v(11598, 11667), v(12820, 12820), v(13003, 13003)]],
  bot: [[v(3452, 1236), v(2500, 1450), v(1961, 1569)], [v(13604, 11316), v(13420, 12370), v(13354, 12884)]],
};
const LEG_LINES: Record<Lane, [Polyline, Polyline]> = {
  top: [makePolyline(BASE_LEGS.top[0]), makePolyline(BASE_LEGS.top[1])],
  mid: [makePolyline(BASE_LEGS.mid[0]), makePolyline(BASE_LEGS.mid[1])],
  bot: [makePolyline(BASE_LEGS.bot[0]), makePolyline(BASE_LEGS.bot[1])],
};
/** Lowest / highest progress a wave can reach: at the blue / red Nexus. */
export const laneMinP = (lane: Lane) => -LEG_LINES[lane][0].length / LANE_LINES[lane].length;
export const laneMaxP = (lane: Lane) => 1 + LEG_LINES[lane][1].length / LANE_LINES[lane].length;
function polyAt(pl: Polyline, d: number): Vec {
  d = Math.max(0, Math.min(pl.length, d));
  let i = 1;
  while (i < pl.cum.length - 1 && pl.cum[i] < d) i++;
  const seg = pl.cum[i] - pl.cum[i - 1];
  const f = seg > 0 ? (d - pl.cum[i - 1]) / seg : 0;
  const a = pl.pts[i - 1], b = pl.pts[i];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
/** Point along a lane at progress t (0 = blue inhibitor, 1 = red inhibitor; beyond that, into the base). */
export function lanePoint(lane: Lane, t: number): Vec {
  const pl = LANE_LINES[lane];
  if (t < 0) return polyAt(LEG_LINES[lane][0], -t * pl.length);
  if (t > 1) return polyAt(LEG_LINES[lane][1], (t - 1) * pl.length);
  return polyAt(pl, t * pl.length);
}
/** Progress of the closest point on a lane to p. */
export function laneProgress(lane: Lane, p: Vec): number {
  const pl = LANE_LINES[lane];
  let best = Infinity, bestD = 0;
  for (let i = 1; i < pl.pts.length; i++) {
    const a = pl.pts[i - 1], b = pl.pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const qx = a.x + dx * t, qy = a.y + dy * t;
    const d = (p.x - qx) ** 2 + (p.y - qy) ** 2;
    if (d < best) { best = d; bestD = pl.cum[i - 1] + Math.sqrt(len2) * t; }
  }
  return bestD / pl.length;
}
export function laneDistance(lane: Lane, p: Vec): number {
  return dist(p, lanePoint(lane, laneProgress(lane, p)));
}
/** Which lane a point is closest to. */
export function nearestLane(p: Vec): Lane {
  let best: Lane = 'mid', bd = Infinity;
  for (const l of LANES) { const d = laneDistance(l, p); if (d < bd) { bd = d; best = l; } }
  return best;
}
/** Tower progress along its lane (for pushing logic). */
export const towerProgress = (t: TowerDef) => (t.lane === 'base' ? (t.side === 0 ? 0.02 : 0.98) : laneProgress(t.lane, t.pos));

// ------------------------------------------------------------------ jungle
export type CampKind = 'blue' | 'red' | 'gromp' | 'wolves' | 'raptors' | 'krugs' | 'scuttle';
export interface CampDef { id: string; side: Side | -1; kind: CampKind; pos: Vec; quadrant: 'top' | 'bot' }
const BLUE_CAMPS: { kind: CampKind; pos: Vec; quadrant: 'top' | 'bot' }[] = [
  { kind: 'blue', pos: v(3821, 7901), quadrant: 'top' },
  { kind: 'gromp', pos: v(2288, 8448), quadrant: 'top' },
  { kind: 'wolves', pos: v(3783, 6495), quadrant: 'top' },
  { kind: 'raptors', pos: v(7061, 5325), quadrant: 'bot' },
  { kind: 'red', pos: v(7762, 4011), quadrant: 'bot' },
  { kind: 'krugs', pos: v(8394, 2641), quadrant: 'bot' },
];
export const CAMPS: CampDef[] = [
  ...BLUE_CAMPS.map((c) => ({ ...c, side: 0 as Side, id: `b_${c.kind}` })),
  // red side camps mirror the blue ones; quadrant is from red's perspective (their "top side" is the mirrored bot)
  ...BLUE_CAMPS.map((c) => ({ ...c, pos: mirror(c.pos), side: 1 as Side, id: `r_${c.kind}`, quadrant: (c.quadrant === 'top' ? 'bot' : 'top') as 'top' | 'bot' })),
  { id: 'scuttle_bot', side: -1, kind: 'scuttle', pos: v(10500, 5170), quadrant: 'bot' },
  { id: 'scuttle_top', side: -1, kind: 'scuttle', pos: v(4400, 9600), quadrant: 'top' },
];

export const DRAGON_PIT = v(9866, 4414);
export const BARON_PIT = v(5007, 10471);

// Ward spots: see vision.ts (VISION_SPOTS — blue side + river, mirrored for red)

// ------------------------------------------------------------------ navigation grid
export class NavGrid {
  size: number;
  cell: number;
  walk: Uint8Array;
  coarse: Uint8Array;
  coarseSize: number;
  coarseCell: number;
  private cache = new Map<string, Vec[]>();

  constructor(size: number, bits: Uint8Array) {
    this.size = size;
    this.cell = MAP_SIZE / size;
    this.walk = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) this.walk[i] = (bits[i >> 3] >> (i & 7)) & 1;
    // coarse grid (half resolution) used for A*: walkable if any sub-cell walkable
    this.coarseSize = size / 2;
    this.coarseCell = MAP_SIZE / this.coarseSize;
    this.coarse = new Uint8Array(this.coarseSize * this.coarseSize);
    for (let cy = 0; cy < this.coarseSize; cy++) for (let cx = 0; cx < this.coarseSize; cx++) {
      let w = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) w += this.walk[(cy * 2 + dy) * size + cx * 2 + dx];
      this.coarse[cy * this.coarseSize + cx] = w >= 2 ? 1 : 0;
    }
  }

  static fromBase64(size: number, b64: string) {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new NavGrid(size, bytes);
  }

  // grid row 0 is the TOP of the map (high y)
  private gx(x: number, n: number, cell: number) { return Math.max(0, Math.min(n - 1, Math.floor(x / cell))); }
  private gy(y: number, n: number, cell: number) { return Math.max(0, Math.min(n - 1, Math.floor((MAP_SIZE - y) / cell))); }

  walkable(p: Vec): boolean {
    return this.walk[this.gy(p.y, this.size, this.cell) * this.size + this.gx(p.x, this.size, this.cell)] === 1;
  }

  /** Nearest walkable position (spiral search). */
  snap(p: Vec): Vec {
    if (this.walkable(p)) return p;
    const cx = this.gx(p.x, this.size, this.cell), cy = this.gy(p.y, this.size, this.cell);
    for (let r = 1; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
        if (this.walk[y * this.size + x]) return { x: (x + 0.5) * this.cell, y: MAP_SIZE - (y + 0.5) * this.cell };
      }
    }
    return p;
  }

  /** Line of sight on the fine grid (DDA sampling). */
  los(a: Vec, b: Vec): boolean {
    const d = dist(a, b);
    const steps = Math.ceil(d / (this.cell * 0.7));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.walkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  /** Path from a to b as a list of waypoints (excluding a). */
  path(a: Vec, b: Vec): Vec[] {
    if (this.los(a, b)) return [b];
    const n = this.coarseSize, cell = this.coarseCell;
    const sx = this.gx(a.x, n, cell), sy = this.gy(a.y, n, cell);
    const tx = this.gx(b.x, n, cell), ty = this.gy(b.y, n, cell);
    const key = `${sx},${sy}>${tx},${ty}`;
    let pts = this.cache.get(key);
    if (!pts) {
      pts = this.astar(sx, sy, tx, ty);
      if (this.cache.size > 6000) this.cache.clear();
      this.cache.set(key, pts);
    }
    // string-pull from the actual start
    const out: Vec[] = [];
    let anchor = a;
    let i = 0;
    const full = [...pts, b];
    while (i < full.length) {
      let j = full.length - 1;
      while (j > i && !this.los(anchor, full[j])) j--;
      out.push(full[j]);
      anchor = full[j];
      i = j + 1;
    }
    return out;
  }

  private heap: Int32Array = new Int32Array(0);
  private astar(sx: number, sy: number, tx: number, ty: number): Vec[] {
    const n = this.coarseSize, cell = this.coarseCell;
    const N = n * n;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const fScore = new Float32Array(N).fill(Infinity);
    // ensure endpoints walkable
    const fixEnd = (x: number, y: number): number => {
      if (this.coarse[y * n + x]) return y * n + x;
      for (let r = 1; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < n && yy < n && this.coarse[yy * n + xx]) return yy * n + xx;
      }
      return y * n + x;
    };
    const s = fixEnd(sx, sy), t = fixEnd(tx, ty);
    const txx = t % n, tyy = Math.floor(t / n);
    const h = (i: number) => { const dx = Math.abs((i % n) - txx), dy = Math.abs(Math.floor(i / n) - tyy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    // binary heap of node ids ordered by fScore
    if (this.heap.length < N) this.heap = new Int32Array(N * 2);
    const heap = this.heap;
    let hs = 0;
    const push = (i: number) => {
      let k = hs++; heap[k] = i;
      while (k > 0) { const p = (k - 1) >> 1; if (fScore[heap[p]] <= fScore[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--hs];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < hs && fScore[heap[l]] < fScore[heap[m]]) m = l;
        if (r < hs && fScore[heap[r]] < fScore[heap[m]]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
      return top;
    };
    g[s] = 0; fScore[s] = h(s); push(s);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    while (hs > 0) {
      const cur = pop();
      if (cur === t) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % n, cy = Math.floor(cur / n);
      for (const [dx, dy, c] of DIRS) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const ni = y * n + x;
        if (!this.coarse[ni] || closed[ni]) continue;
        if (dx && dy && (!this.coarse[cy * n + x] || !this.coarse[y * n + cx])) continue; // no corner cutting
        const ng = g[cur] + c;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; fScore[ni] = ng + h(ni); push(ni); }
      }
    }
    if (!found) return [];
    const pts: Vec[] = [];
    for (let i = t; i !== -1 && i !== s; i = came[i]) pts.push({ x: ((i % n) + 0.5) * cell, y: MAP_SIZE - (Math.floor(i / n) + 0.5) * cell });
    return pts.reverse();
  }
}
