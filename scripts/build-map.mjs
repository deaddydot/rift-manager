// Builds the stylised Summoner's Rift art and the navigation grid from Riot's
// minimap walkability layer (CommunityDragon 2dlevelminimap_base_baron1.png).
// Outputs: public/img/rift.webp (1024px) and public/data/navgrid.json
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const MASK = path.join(ROOT, 'data-raw/src/minimap_mask.png');
const S = 1024;
const MAP = 14870; // game units

const { data: src } = await sharp(MASK).resize(S, S, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// ---- classify
const WALL = 0, GROUND = 1, RIVER = 2, BASE_B = 3, BASE_R = 4;
const cls = new Uint8Array(S * S);
for (let i = 0; i < S * S; i++) {
  const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2], a = src[i * 4 + 3];
  const x = i % S, y = Math.floor(i / S);
  if (a < 110) { cls[i] = WALL; continue; }
  if (b > r + 70 && b > 120 && g < 150) { cls[i] = RIVER; continue; }
  const grayBlue = b >= g - 6 && b > r + 15;
  if (grayBlue || (r > 115 && r < 135 && g < 100)) {
    cls[i] = x + (S - y) < S ? BASE_B : BASE_R; // bottom-left vs top-right
    continue;
  }
  cls[i] = GROUND;
}

// ---- distance-to-wall field (cheap two-pass chamfer) for shading
const INF = 1e9;
const dist = new Float32Array(S * S).fill(INF);
for (let i = 0; i < S * S; i++) if (cls[i] === WALL) dist[i] = 0;
const D1 = 1, D2 = 1.414;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = y * S + x;
  if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + D1);
  if (y > 0) dist[i] = Math.min(dist[i], dist[i - S] + D1);
  if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - S - 1] + D2);
  if (x < S - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - S + 1] + D2);
}
for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
  const i = y * S + x;
  if (x < S - 1) dist[i] = Math.min(dist[i], dist[i + 1] + D1);
  if (y < S - 1) dist[i] = Math.min(dist[i], dist[i + S] + D1);
  if (x < S - 1 && y < S - 1) dist[i] = Math.min(dist[i], dist[i + S + 1] + D2);
  if (x > 0 && y < S - 1) dist[i] = Math.min(dist[i], dist[i + S - 1] + D2);
}
// distance from walls to nearest walkable (for wall rim highlight)
const distW = new Float32Array(S * S).fill(INF);
for (let i = 0; i < S * S; i++) if (cls[i] !== WALL) distW[i] = 0;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = y * S + x;
  if (x > 0) distW[i] = Math.min(distW[i], distW[i - 1] + D1);
  if (y > 0) distW[i] = Math.min(distW[i], distW[i - S] + D1);
}
for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
  const i = y * S + x;
  if (x < S - 1) distW[i] = Math.min(distW[i], distW[i + 1] + D1);
  if (y < S - 1) distW[i] = Math.min(distW[i], distW[i + S] + D1);
}

// ---- lanes (game coords, y up)
const LANES = {
  top: [[1000, 1500], [1000, 13000], [1500, 13850], [13300, 13850]],
  mid: [[1500, 1500], [13300, 13300]],
  bot: [[1500, 1000], [13000, 1000], [13850, 1500], [13850, 13300]],
};
const toPx = ([x, y]) => [x / MAP * S, S - y / MAP * S];
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const laneDist = new Float32Array(S * S).fill(INF);
for (const pts of Object.values(LANES)) {
  const p = pts.map(toPx);
  for (let k = 0; k < p.length - 1; k++) {
    const [ax, ay] = p[k], [bx, by] = p[k + 1];
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - 40)), maxX = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + 40));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - 40)), maxY = Math.min(S - 1, Math.ceil(Math.max(ay, by) + 40));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const d = segDist(x, y, ax, ay, bx, by);
      const i = y * S + x;
      if (d < laneDist[i]) laneDist[i] = d;
    }
  }
}

// ---- value noise
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y, s) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y) => noise(x, y, 64) * 0.5 + noise(x, y, 24) * 0.3 + noise(x, y, 7) * 0.2;

const out = Buffer.alloc(S * S * 3);
const mix = (a, b, t) => a + (b - a) * t;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = y * S + x;
  const n = fbm(x, y);
  let r, g, b;
  switch (cls[i]) {
    case WALL: {
      // forest canopy: dark greens with clumpy noise, lighter rim near paths
      const clump = noise(x, y, 18) * 0.6 + noise(x, y, 6) * 0.4;
      r = 18 + clump * 22; g = 42 + clump * 40; b = 30 + clump * 22;
      const rim = Math.max(0, 1 - distW[i] / 5);
      r = mix(r, 70, rim * 0.35); g = mix(g, 92, rim * 0.35); b = mix(b, 62, rim * 0.35);
      // outside the arena: near black
      const cx = x / S - 0.5, cy = y / S - 0.5;
      if (Math.abs(cx) > 0.47 || Math.abs(cy) > 0.47) { r *= 0.45; g *= 0.45; b *= 0.5; }
      break;
    }
    case RIVER: {
      r = 22 + n * 20; g = 88 + n * 35; b = 112 + n * 35;
      const ripple = Math.sin((x + y) * 0.35 + n * 6) * 0.5 + 0.5;
      g += ripple * 6; b += ripple * 8;
      break;
    }
    case BASE_B: case BASE_R: {
      const tint = cls[i] === BASE_B ? [70, 96, 130] : [128, 78, 84];
      r = tint[0] + n * 30; g = tint[1] + n * 30; b = tint[2] + n * 30;
      // tile pattern
      if ((x % 24 < 1 || y % 24 < 1)) { r *= 0.85; g *= 0.85; b *= 0.85; }
      break;
    }
    default: {
      // jungle floor: mossy earth
      r = 78 + n * 30; g = 84 + n * 32; b = 52 + n * 20;
      const lane = Math.max(0, 1 - laneDist[i] / 26);
      r = mix(r, 150 + n * 25, lane * 0.85); g = mix(g, 132 + n * 22, lane * 0.85); b = mix(b, 92 + n * 18, lane * 0.85);
    }
  }
  if (cls[i] !== WALL) {
    // ambient occlusion next to walls
    const ao = Math.max(0, 1 - dist[i] / 9);
    r *= 1 - ao * 0.45; g *= 1 - ao * 0.45; b *= 1 - ao * 0.4;
  }
  out[i * 3] = Math.max(0, Math.min(255, r));
  out[i * 3 + 1] = Math.max(0, Math.min(255, g));
  out[i * 3 + 2] = Math.max(0, Math.min(255, b));
}
fs.mkdirSync(path.join(ROOT, 'public/img'), { recursive: true });
await sharp(out, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 88 }).toFile(path.join(ROOT, 'public/img/rift.webp'));

// ---- nav grid (256x256, 1 = walkable). Built from the original 512 mask.
const N = 256;
const { data: m512 } = await sharp(MASK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const grid = new Uint8Array(N * N);
for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
  let walk = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const px = gx * 2 + dx, py = gy * 2 + dy;
    if (m512[(py * 512 + px) * 4 + 3] > 100) walk++;
  }
  grid[gy * N + gx] = walk >= 2 ? 1 : 0;
}
// pack bits (row-major, image orientation: row 0 = top of map = high game y)
const bytes = Buffer.alloc(Math.ceil(N * N / 8));
for (let i = 0; i < N * N; i++) if (grid[i]) bytes[i >> 3] |= 1 << (i & 7);
fs.writeFileSync(path.join(ROOT, 'public/data/navgrid.json'), JSON.stringify({ size: N, mapSize: MAP, bits: bytes.toString('base64') }));
console.log('rift.webp + navgrid.json written');
