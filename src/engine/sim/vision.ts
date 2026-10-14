// Vision game: trinkets, ward supply, where wards go, sweeping and control wards.
//   Stealth Ward (yellow trinket): 2 charges, recharges faster with level. Supports also carry the support item's
//     charges once its quest is done (~8 min) — supports place most of a team's wards, as in pro play.
//   Oracle Lens (red trinket): supports swap at their first back after ~9 min, about half the junglers mid-game. Its
//     sweep (10 s) finds and kills stealth wards around them — used before objectives and walking into the river or
//     enemy jungle.
//   Farsight Alteration (blue trinket): most ADCs (and some mids) swap around level 9 — a visible long-range ward on
//     a bush or pit ahead of the team, cheap to kill but often worth it.
//   Control Ward: bought on backs (supports two, junglers one, laners now and then), visible, reveals and disables
//     enemy wards around it until someone kills it. One placed per champion.
// Where: a table of common pro ward spots (blue side + river; red mirrors it). Each role values different spots by
// phase — supports the river/tri-brush/objective spots, junglers deep wards that track the enemy jungler, mid the
// pixel brushes — and better vision players choose the high-value spot more reliably (worse ones are noisier).
import type { MatchSim } from './engine';
import type { SimChamp } from './simtypes';
import { dist, mirror, v, DRAGON_PIT, BARON_PIT, FOUNTAIN, type Side, type Vec, type Lane } from './map';
import { beliefs, threatAt } from './fog';
import { clamp } from '../../util/rng';

export type SpotKind = 'tribush' | 'lanebush' | 'river' | 'pixel' | 'buff' | 'camp' | 'entrance' | 'objective' | 'pit';
export interface VisionSpot {
  id: string; pos: Vec; kind: SpotKind;
  /** jungle owner (-1 river / lane) */
  owner: Side | -1;
  half: 'top' | 'bot' | 'mid';
  obj?: 'dragon' | 'baron';
  /** old-style tags (map.ts WARD_SPOTS) */
  tags: string[];
}

/** Blue-side jungle and the bot half of the river; everything else is the mirror image. */
const BLUE: Omit<VisionSpot, 'tags'>[] = [
  { id: 'tribush_bot', pos: v(10350, 3050), kind: 'tribush', owner: 0, half: 'bot' },
  { id: 'krugs_bush', pos: v(9150, 3350), kind: 'camp', owner: 0, half: 'bot' },
  { id: 'red_bush', pos: v(8050, 4750), kind: 'buff', owner: 0, half: 'bot' },
  { id: 'red_camp', pos: v(7700, 4250), kind: 'camp', owner: 0, half: 'bot' },
  { id: 'raptor_bush', pos: v(6800, 6000), kind: 'entrance', owner: 0, half: 'mid' },
  { id: 'drag_entrance', pos: v(9300, 4900), kind: 'objective', owner: 0, half: 'bot', obj: 'dragon' },
  { id: 'wolves_bush', pos: v(4750, 5950), kind: 'entrance', owner: 0, half: 'mid' },
  { id: 'blue_bush', pos: v(4900, 7300), kind: 'buff', owner: 0, half: 'top' },
  { id: 'blue_camp', pos: v(3950, 8150), kind: 'camp', owner: 0, half: 'top' },
  { id: 'gromp_bush', pos: v(2900, 9200), kind: 'camp', owner: 0, half: 'top' },
  { id: 'tribush_top', pos: v(2370, 9770), kind: 'tribush', owner: 0, half: 'top' },
  { id: 'raptor_camp', pos: v(7050, 5650), kind: 'camp', owner: 0, half: 'mid' },
  { id: 'wolves_camp', pos: v(3800, 6150), kind: 'camp', owner: 0, half: 'top' },
  { id: 'mid_bush', pos: v(5750, 7100), kind: 'entrance', owner: 0, half: 'mid' },
  { id: 'botside_entrance', pos: v(8500, 1900), kind: 'entrance', owner: 0, half: 'bot' },
  { id: 'topside_entrance', pos: v(1800, 7600), kind: 'entrance', owner: 0, half: 'top' },
];
const RIVER_BOT: Omit<VisionSpot, 'tags'>[] = [
  { id: 'lanebush_bot', pos: v(12500, 2100), kind: 'lanebush', owner: -1, half: 'bot' },
  { id: 'river_bush_bot', pos: v(11700, 3950), kind: 'river', owner: -1, half: 'bot' },
  { id: 'drag_bush', pos: v(10100, 5300), kind: 'river', owner: -1, half: 'bot', obj: 'dragon' },
  { id: 'pixel_bot', pos: v(8650, 6450), kind: 'pixel', owner: -1, half: 'mid' },
  { id: 'scuttle_bot', pos: v(10650, 4750), kind: 'river', owner: -1, half: 'bot', obj: 'dragon' },
  { id: 'river_mid_bot', pos: v(9500, 5850), kind: 'river', owner: -1, half: 'bot' },
  { id: 'drag_pit', pos: DRAGON_PIT, kind: 'pit', owner: -1, half: 'bot', obj: 'dragon' },
];
const flip = (h: VisionSpot['half']): VisionSpot['half'] => (h === 'top' ? 'bot' : h === 'bot' ? 'top' : 'mid');
function tagsOf(s: Omit<VisionSpot, 'tags'>): string[] {
  const t: string[] = [s.half];
  if (s.owner === 0) t.push('blue_jungle'); else if (s.owner === 1) t.push('red_jungle');
  if (s.kind === 'river' || s.kind === 'pixel' || s.kind === 'pit') t.push('river');
  if (s.kind === 'lanebush') t.push('lane');
  if (s.obj) t.push(s.obj);
  if (s.kind === 'pixel') t.push(s.pos.y > s.pos.x ? 'top' : 'bot');
  return t;
}
export const VISION_SPOTS: VisionSpot[] = [
  ...BLUE.map((s) => ({ ...s, id: `b_${s.id}` })),
  ...BLUE.map((s) => ({ ...s, id: `r_${s.id}`, pos: mirror(s.pos), owner: 1 as Side, half: flip(s.half), obj: s.obj === 'dragon' ? 'baron' as const : s.obj })),
  ...RIVER_BOT.map((s) => ({ ...s, id: `rv_${s.id}` })),
  ...RIVER_BOT.map((s) => ({ ...s, id: `rv_${s.id.replace('bot', 'top').replace('drag', 'baron')}`, pos: s.kind === 'pit' ? BARON_PIT : mirror(s.pos), half: flip(s.half), obj: s.obj === 'dragon' ? 'baron' as const : s.obj })),
].map((s) => ({ ...s, tags: tagsOf(s) }));

// ------------------------------------------------------------------ trinkets & supply
export type Trinket = 'yellow' | 'oracle' | 'farsight';
const SUPPORT_QUEST_AT = 480; // ~8 min: the support item's quest is done → its ward charges
export const CONTROL_WARD_COST = 75;

/** Called on a fountain visit: trinket swaps and Control Ward purchases (pays for them). */
export function shopVision(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  const tr = c.trinket ?? 'yellow';
  if (tr === 'yellow') {
    if (c.role === 'support' && t >= 540) swap(c, 'oracle');
    else if (c.role === 'jungle' && t >= 840 && hash(c) % 100 < 55) swap(c, 'oracle');
    else if (c.role === 'adc' && c.level >= 9 && hash(c) % 100 < 78) swap(c, 'farsight');
    else if (c.role === 'mid' && c.level >= 11 && hash(c) % 100 < 22) swap(c, 'farsight');
  }
  // control wards: supports keep two in the inventory, junglers one, laners buy one now and then
  const want = c.role === 'support' ? 2 : c.role === 'jungle' ? (c.gold > 900 ? 2 : 1) : t > 480 && c.gold > 400 && (hash(c) + Math.floor(t / 240)) % 2 === 0 ? 1 : 0;
  while (c.controlWards < want + (c.input.traits.includes('control_warder') ? 1 : 0) && c.gold >= CONTROL_WARD_COST) { c.controlWards++; c.gold -= CONTROL_WARD_COST; }
}
function swap(c: SimChamp, to: Trinket) { c.trinket = to; c.trinketReadyAt = 0; }
const hash = (c: SimChamp) => (c.idx * 2654435761 + c.input.playerId.length * 97) >>> 0;

/** Ward charges: the yellow trinket (2 charges) and, for supports after the quest, the support item (3-4). */
export function wardUpkeep(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  const tr = c.trinket ?? 'yellow';
  const supportItem = c.role === 'support' && t >= SUPPORT_QUEST_AT;
  const max = (tr === 'yellow' ? 2 : 0) + (supportItem ? 3 + (c.input.vision >= 75 ? 1 : 0) : 0) + (c.role === 'support' && !supportItem ? 1 : 0);
  if (c.wardCharges > max) c.wardCharges = max;
  if (c.wardCharges < max && t >= c.wardRechargeAt) {
    c.wardCharges++;
    // stealth trinket: ~210 s at level 1 down to ~120 s at 18; the support item refills faster; good vision players
    // keep everything cycling (using charges on time, swapping on backs)
    const base = supportItem ? 48 : 215 - c.level * 5.3;
    c.wardRechargeAt = t + base * Math.max(0.65, 1.2 - c.input.vision / 100 * 0.45);
  }
}

// ------------------------------------------------------------------ where
interface SpotCtx { enemy: Side; lead: number; jgGhost: Vec | null; jgConf: number; objSoon: Set<string>; prioTop: number; prioBot: number }
function ctxOf(sim: MatchSim, c: SimChamp): SpotCtx {
  const enemy = (1 - c.side) as Side;
  const gold = (s: Side) => sim.champs.filter((x) => x.side === s).reduce((a, x) => a + x.goldEarned, 0);
  const jg = sim.champs.find((e) => e.side === enemy && e.role === 'jungle' && !e.dead);
  const jb = jg ? beliefs(sim, c.side).find((b) => b.e === jg) : undefined;
  const objSoon = new Set<string>();
  for (const o of sim.objectives) if (o.alive || (o.spawnAt > 0 && o.spawnAt - sim.t < 90)) objSoon.add(o.kind === 'elder' ? 'dragon' : o.kind === 'herald' || o.kind === 'grubs' ? 'baron' : o.kind);
  const prio = (l: Lane) => { const me = sim.champs.find((x) => x.side === c.side && !x.dead && x.task.lane === l && x.role !== 'jungle'); return me ? clamp(me.hp / me.stats.maxHp - 0.4, -0.4, 0.6) : 0; };
  return { enemy, lead: gold(c.side) - gold(enemy), jgGhost: jb && !jb.seen ? jb.pos : null, jgConf: jb && !jb.seen ? jb.conf : 0, objSoon, prioTop: prio('top'), prioBot: prio('bot') };
}

const ROLE_KIND: Record<SimChamp['role'], Partial<Record<SpotKind, number>>> = {
  support: { river: 1, tribush: 0.9, objective: 0.95, entrance: 0.6, pixel: 0.45, lanebush: 0.55, buff: 0.65, camp: 0.55, pit: 0.5 },
  jungle: { river: 0.9, pixel: 0.8, entrance: 0.75, buff: 0.85, camp: 0.85, objective: 0.9, tribush: 0.5, pit: 0.4 },
  mid: { pixel: 1, river: 0.6, entrance: 0.7, objective: 0.5, buff: 0.3 },
  top: { river: 1, tribush: 0.8, lanebush: 0.45, entrance: 0.4, objective: 0.6 },
  adc: { lanebush: 0.7, river: 0.75, tribush: 0.55, objective: 0.6, pixel: 0.3 },
};

/** How much this ward spot is worth to this champion right now (−∞ when it's covered or too risky). */
function spotValue(sim: MatchSim, c: SimChamp, s: VisionSpot, x: SpotCtx, control: boolean, remote = false): number {
  const t = sim.t;
  const early = t < 840;
  let val = ROLE_KIND[c.role][s.kind] ?? 0.15;
  if (s.kind === 'pit' && !control) val *= 0.3; // the pit is where a Control Ward goes
  // laners ward their own half; roamers anywhere
  const myHalf = c.role === 'top' ? 'top' : c.role === 'adc' || (c.role === 'support' && early) ? 'bot' : c.role === 'mid' ? 'mid' : null;
  if (myHalf && early && s.half !== myHalf && s.half !== 'mid') val *= 0.35;
  if (s.kind === 'lanebush' && !early) val *= 0.4;
  // objective setup: the 90 s before a spawn and while it's up, its spots are what matter
  if (s.obj && x.objSoon.has(s.obj)) val += early ? 0.6 : 1.1;
  // enemy jungle: needs priority on that side, a tower down, or a lead — then deep wards track their jungler
  if (s.owner === x.enemy) {
    const prio = s.half === 'top' ? x.prioTop : s.half === 'bot' ? x.prioBot : (x.prioTop + x.prioBot) / 2;
    const towerDown = !sim.towers.some((tw) => tw.alive && tw.def.side === x.enemy && tw.def.tier === 'outer' && tw.def.lane === (s.half === 'mid' ? 'mid' : s.half));
    const access = prio + (towerDown ? 0.5 : 0) + clamp(x.lead / 6000, -0.5, 0.6) + (remote ? 0.35 : 0); // a Farsight ward doesn't walk in there
    if (access < 0.1) return -Infinity;
    val += access * 0.6 + (s.kind === 'camp' || s.kind === 'buff' ? 0.25 : 0);
  } else if (s.owner === c.side) {
    // our own jungle: defensive vision, worth more when behind or when their jungler is likely around
    val *= x.lead < -2500 ? 1.15 : 0.7;
  }
  // track the enemy jungler: spots near where we believe they are (and between them and our lanes)
  if (x.jgGhost && x.jgConf > 0.15) {
    const d = dist(s.pos, x.jgGhost);
    if (d < 3500) val += (1 - d / 3500) * 0.8 * x.jgConf * (c.input.vision / 100 + 0.3);
  }
  // already covered by our vision
  // (a ward about to run out doesn't count — pros refresh their spots on time)
  for (const w of sim.wards) if (w.side === c.side && w.until - t > 20 && dist(w.pos, s.pos) < (control ? 600 : 650) && !(control && !w.control)) return -Infinity;
  // don't face-check a bush the enemy is probably sitting in (unless sweeping)
  if (remote) return val; // dropped from range: no face-check
  const threat = threatAt(sim, c.side, s.pos, 1200);
  if (threat >= 1.2 && !((c.sweepUntil ?? 0) > t)) return -Infinity;
  return val - threat * 0.4;
}

/**
 * The best spot for a ward within `reach` (and its value), with vision skill deciding how reliably the best one is
 * found: low-vision players pick by feel (noisy), high-vision players read the map.
 */
export function chooseWardSpot(sim: MatchSim, c: SimChamp, reach: number, opts: { control?: boolean; remote?: boolean; filter?: (s: VisionSpot) => boolean } = {}): { spot: VisionSpot; value: number } | null {
  const x = ctxOf(sim, c);
  const skill = c.input.vision / 100;
  let best: { spot: VisionSpot; value: number } | null = null;
  for (const s of VISION_SPOTS) {
    const d = dist(s.pos, c.pos);
    if (d > reach || (opts.filter && !opts.filter(s))) continue;
    const val = spotValue(sim, c, s, x, !!opts.control, !!opts.remote);
    if (val === -Infinity) continue;
    const score = val - d / reach * 0.35 + sim.rng.normal(0, Math.max(0.05, 0.75 - skill * 0.6));
    if (!best || score > best.value) best = { spot: s, value: score };
  }
  return best;
}

// ------------------------------------------------------------------ active trinkets
/** Oracle Lens: sweep on the way into the river / enemy jungle / an objective; Farsight: drop a long-range ward. */
export function useTrinket(sim: MatchSim, c: SimChamp) {
  const t = sim.t;
  if ((c.trinketReadyAt ?? 0) > t || c.dead || c.recallUntil > t) return;
  const tr = c.trinket ?? 'yellow';
  if (tr === 'oracle') {
    const nearObj = sim.objectives.some((o) => (o.alive || (o.spawnAt > 0 && o.spawnAt - t < 40)) && dist(o.pos, c.pos) < 2600);
    const inRiverOrEnemy = Math.abs(c.pos.x + c.pos.y - 14870) < 1800 || (c.side === 0 ? c.pos.x + c.pos.y > 16000 : c.pos.x + c.pos.y < 13700);
    const knownWard = sim.wards.some((w) => w.side !== c.side && (w.revealed || w.kind === 'control') && dist(w.pos, c.pos) < 900);
    if (!(nearObj || inRiverOrEnemy || knownWard) || !sim.rng.chance(0.25 + c.input.vision / 300)) return;
    c.sweepUntil = t + 10;
    c.trinketReadyAt = t + Math.max(60, 92 - c.level * 1.8);
  } else if (tr === 'farsight') {
    const pick = chooseWardSpot(sim, c, 4000, { remote: true, filter: (s) => s.owner !== c.side && s.kind !== 'lanebush' && dist(s.pos, c.pos) > 900 });
    if (!pick || pick.value < 0.45 || !sim.rng.chance(0.25 + c.input.vision / 250)) return;
    sim.placeWard(c, pick.spot.pos, 'farsight');
    c.trinketReadyAt = t + Math.max(99, 198 - c.level * 5.5);
  }
}

/** Every second: wards expire, sweeps and Control Wards find enemy wards, visible wards get killed. */
export function visionTick(sim: MatchSim) {
  const t = sim.t;
  sim.wards = sim.wards.filter((w) => w.until > t);
  // Control Wards reveal (and disable) enemy wards around them
  for (const w of sim.wards) if (w.kind !== 'control') w.revealed = sim.wards.some((cw) => cw.kind === 'control' && cw.side !== w.side && dist(cw.pos, w.pos) < 900);
  for (const c of sim.champs) {
    if (c.dead || c.recallUntil > t) continue;
    const sweeping = (c.sweepUntil ?? 0) > t;
    const busy = c.combatTarget !== null && c.lastCombatAt > t - 2;
    for (const w of sim.wards) {
      if (w.side === c.side || w.until <= t || w.owner < 0) continue; // scuttle shrines can't be swept
      const d = dist(w.pos, c.pos);
      // visible wards (Control, Farsight) and revealed ones: whoever is close takes them out (Control Wards take a few hits)
      const visible = w.kind !== 'stealth' || w.revealed || (sweeping && d < 900);
      let p = 0;
      if (visible && d < (sweeping ? 900 : 550) && !busy) p = w.kind === 'control' ? 0.3 : 0.8;
      else if (!visible && d < 260) p = 0.04; // walked right over it and noticed
      if (p && sim.rng.chance(p * (0.75 + c.input.vision / 400))) sim.killWard(c, w);
    }
  }
}

/** Fountain-side helpers used by the AI. */
export const ownHalf = (side: Side, p: Vec) => (side === 0 ? p.x + p.y < 14870 : p.x + p.y > 14870);
void FOUNTAIN;
