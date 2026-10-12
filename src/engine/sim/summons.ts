// Summoned units. Pets follow their owner and fight (Tibbers, Daisy, the Maiden, Shaco's clone,
// voidlings); turrets hold a spot and shoot whatever comes close (Heimerdinger, Zyra's plants,
// Illaoi's tentacles, Azir's soldiers); traps wait unseen until an enemy steps on them (Jack in the
// Box, Noxious Trap, Caitlyn's and Jhin's traps). They have HP and a lifetime, give their team
// vision, take hits from nearby enemies, towers and area spells, and can be killed.
import type { MatchSim } from './engine';
import type { SimChamp, SimSummon } from './simtypes';
import { dist, dist2, type Vec } from './map';
import { dealDamage, applyCC } from './combat';
import { gd } from '../../data/gamedata';
import { TOWER_RANGE } from './constants';

interface SummonDef {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  mode: SimSummon['mode'];
  life: number;                                   // seconds
  count?: number;                                 // how many spawn per cast
  max?: number;                                   // how many of this kind can exist at once
  hp: (c: SimChamp, rank: number) => number;
  dps: (c: SimChamp, rank: number) => number;     // raw damage per second (scaled like ability damage)
  range: number;
  speed?: number;
  dmgType?: 'physical' | 'magic';
  at: 'target' | 'self';
  cc?: { type: string; duration: number; amount?: number; every?: number }; // pets: every N s; traps: when triggered
  burst?: (c: SimChamp, rank: number) => number;  // trap trigger / death explosion damage
  explode?: number;                               // death explosion radius
  becomes?: { life: number };                     // trap that turns into a turret when triggered (Jack in the Box)
  visual?: boolean;                               // damage already part of the kit
}

const ap = (c: SimChamp) => c.stats.ap;
const ad = (c: SimChamp) => c.stats.ad;
export const SUMMONS: Record<string, SummonDef[]> = {
  Annie: [{ slot: 'R', name: 'Tibbers', mode: 'pet', life: 45, at: 'target', hp: (c, r) => 1100 + 600 * r + ap(c) * 0.5, dps: (c, r) => 65 + 32 * r + ap(c) * 0.25, range: 220, speed: 420, dmgType: 'magic' }],
  Ivern: [{ slot: 'R', name: 'Daisy', mode: 'pet', life: 60, at: 'target', hp: (c, r) => 1000 + 750 * r + ap(c) * 0.4, dps: (c, r) => 50 + 18 * r + ap(c) * 0.21, range: 250, speed: 400, dmgType: 'magic', cc: { type: 'knockup', duration: 1, every: 4 } }],
  Yorick: [
    { slot: 'R', name: 'Maiden of the Mist', mode: 'pet', life: 60, at: 'target', hp: (c) => 300 + c.stats.maxHp * 0.25, dps: (c, r) => 15 + 10 * r + ad(c) * 0.5, range: 300, speed: 360, dmgType: 'magic' },
    { slot: 'R', name: 'Mist Walker', mode: 'pet', life: 12, count: 2, at: 'target', hp: (c) => 120 + c.level * 15, dps: (c) => 10 + ad(c) * 0.15, range: 175, speed: 380, dmgType: 'physical' },
  ],
  Shaco: [
    { slot: 'R', name: 'Hallucination', mode: 'pet', life: 18, at: 'self', hp: (c) => c.stats.maxHp * 0.6, dps: (c) => ad(c) * c.stats.as * 0.75, range: 175, speed: 400, dmgType: 'physical', explode: 300, burst: (c, r) => 150 + 75 * r + ap(c) * 0.7 },
    { slot: 'W', name: 'Jack in the Box', mode: 'trap', life: 40, max: 3, at: 'target', hp: () => 300, dps: (c, r) => 30 + 10 * r + ap(c) * 0.12, range: 400, dmgType: 'magic', cc: { type: 'fear', duration: 0.8 }, becomes: { life: 4 } },
  ],
  Heimerdinger: [{ slot: 'Q', name: 'H-28G Turret', mode: 'turret', life: 25, max: 3, at: 'self', hp: (c) => 150 + c.level * 15, dps: (c, r) => 15 + 8 * r + ap(c) * 0.3, range: 525, dmgType: 'magic' }],
  Zyra: [
    { slot: 'Q', name: 'Thorn Spitter', mode: 'turret', life: 8, max: 4, at: 'target', hp: (c) => 150 + c.level * 10, dps: (c) => 15 + c.level * 4.5 + ap(c) * 0.15, range: 575, dmgType: 'magic' },
    { slot: 'E', name: 'Vine Lasher', mode: 'turret', life: 8, max: 4, at: 'target', hp: (c) => 150 + c.level * 10, dps: (c) => 15 + c.level * 4.5 + ap(c) * 0.15, range: 400, dmgType: 'magic' },
  ],
  Malzahar: [{ slot: 'W', name: 'Voidling', mode: 'pet', life: 8, count: 2, at: 'self', hp: (c) => 180 + c.level * 10, dps: (c, r) => 15 + 6 * r + ap(c) * 0.12, range: 150, speed: 450, dmgType: 'magic' }],
  Illaoi: [
    { slot: 'Q', name: 'Tentacle', mode: 'turret', life: 30, max: 3, at: 'target', hp: (c) => 300 + c.level * 20, dps: (c) => 4 + c.level * 3 + ad(c) * 0.35, range: 650, dmgType: 'physical' },
    { slot: 'R', name: 'Tentacle', mode: 'turret', life: 8, count: 2, max: 5, at: 'target', hp: (c) => 300 + c.level * 20, dps: (c) => 4 + c.level * 3 + ad(c) * 0.35, range: 650, dmgType: 'physical' },
  ],
  Azir: [{ slot: 'W', name: 'Sand Soldier', mode: 'turret', life: 10, max: 3, at: 'target', hp: () => 1, dps: () => 0, range: 350, visual: true }],
  Teemo: [{ slot: 'R', name: 'Noxious Trap', mode: 'trap', life: 120, max: 4, at: 'target', hp: () => 1, dps: () => 0, range: 200, cc: { type: 'slow', duration: 4, amount: 0.4 }, burst: (c, r) => 125 + 75 * r + ap(c) * 0.55, dmgType: 'magic' }],
  Caitlyn: [{ slot: 'W', name: 'Yordle Snap Trap', mode: 'trap', life: 30, max: 3, at: 'target', hp: () => 1, dps: () => 0, range: 150, cc: { type: 'root', duration: 1.5 }, burst: (c) => 40 + ad(c) * 0.5, dmgType: 'physical' }],
  Jhin: [{ slot: 'E', name: 'Lotus Trap', mode: 'trap', life: 60, max: 2, at: 'target', hp: () => 1, dps: () => 0, range: 250, cc: { type: 'slow', duration: 2, amount: 0.35 }, burst: (c, r) => 20 + 60 * r + ad(c) * 1.2 + ap(c), dmgType: 'magic' }],
};

/** Champion casts that create summons even though the ability itself does no direct damage. */
export const hasSummon = (c: SimChamp, slot: string) => !!SUMMONS[c.champ.id]?.some((d) => d.slot === slot);

/** Spawn the summons tied to a cast (called from the combat ability loop and AI ult plays). */
export function spawnSummons(sim: MatchSim, c: SimChamp, slot: 'Q' | 'W' | 'E' | 'R', target: Vec | null) {
  const defs = SUMMONS[c.champ.id]?.filter((d) => d.slot === slot);
  if (!defs?.length) return;
  const rank = c.ranks[slot] || 1;
  const icon = c.abilities.find((a) => a.slot === slot)?.icon ?? '';
  for (const def of defs) {
    const n = def.count ?? 1;
    for (let i = 0; i < n; i++) {
      const base = def.at === 'target' && target ? target : c.pos;
      const jitter = { x: base.x + (i - (n - 1) / 2) * 120, y: base.y + ((i % 2) - 0.5) * 80 * (n > 1 ? 1 : 0) };
      const pos = gd().nav.snap(jitter);
      const key = `${c.idx}:${def.name}`;
      if (def.max) {
        const mine = sim.summons.filter((s) => s.key === key);
        if (mine.length >= def.max) { const oldest = mine.reduce((a, b) => (a.until < b.until ? a : b)); oldest.until = sim.t; }
      }
      const hp = def.hp(c, rank);
      sim.summons.push({
        id: sim.summonSeq++, side: c.side, owner: c.idx, key, name: def.name, icon, mode: def.mode, pos,
        hp, maxHp: hp, until: sim.t + def.life, dps: def.dps(c, rank), range: def.range, speed: def.speed ?? 0,
        dmgType: def.dmgType ?? 'magic', targetIdx: null, nextCcAt: sim.t + (def.cc?.every ?? 0), visual: def.visual,
      });
    }
    if (def.mode === 'pet') sim.dbg(c, 'ult', `summons ${n > 1 ? `${n} ${def.name}s` : def.name}`);
  }
}

const defOf = (sim: MatchSim, s: SimSummon) => SUMMONS[sim.champs[s.owner].champ.id]?.find((d) => d.name === s.name);

export function updateSummons(sim: MatchSim, dt: number) {
  if (!sim.summons.length) return;
  const t = sim.t;
  for (const s of sim.summons) {
    if (s.hp <= 0 || t >= s.until) continue;
    const owner = sim.champs[s.owner];
    const def = defOf(sim, s);
    const enemies = sim.champs.filter((e) => e.side !== s.side && !e.dead);
    // ---- traps: wait for someone to step on them
    if (s.mode === 'trap') {
      const victim = enemies.find((e) => dist2(e.pos, s.pos) < s.range * s.range);
      if (!victim) continue;
      const rank = owner.ranks[def?.slot ?? 'R'] || 1;
      if (def?.burst) dealDamage(sim, owner, victim, def.burst(owner, rank), s.dmgType, { ability: true });
      if (def?.cc) applyCC(sim, owner, victim, def.cc.type, def.cc.duration, def.cc.amount ?? 0.3, s.name);
      sim.float(victim.pos, s.name, s.side === 0 ? '#93c5fd' : '#fca5a5');
      sim.dbg(victim, 'cc', `steps on ${owner.input.name}'s ${s.name}`);
      if (def?.becomes) { s.mode = 'turret'; s.until = t + def.becomes.life; s.hp = s.maxHp; }
      else s.until = t;
      continue;
    }
    // ---- pets & turrets: pick a target
    let target: SimChamp | null = null;
    const ownerTarget = owner.combatTarget !== null ? sim.champs[owner.combatTarget] : null;
    if (s.mode === 'pet' && ownerTarget && !ownerTarget.dead && dist(ownerTarget.pos, s.pos) < 1100) target = ownerTarget;
    if (!target) {
      const reach = s.mode === 'pet' ? 700 : s.range;
      let bd = Infinity;
      for (const e of enemies) { const d = dist(e.pos, s.pos); if (d < reach && d < bd && sim.isVisibleTo(s.side, e.idx)) { bd = d; target = e; } }
    }
    s.targetIdx = target?.idx ?? null;
    // ---- move (pets): chase the target, or stay with the owner
    if (s.mode === 'pet' && s.speed > 0) {
      const goal = target ? target.pos : !owner.dead ? owner.pos : s.pos;
      const stop = target ? s.range * 0.8 : 250;
      const d = dist(goal, s.pos);
      if (d > stop) {
        const step = Math.min(d - stop, s.speed * dt);
        const next = { x: s.pos.x + (goal.x - s.pos.x) / d * step, y: s.pos.y + (goal.y - s.pos.y) / d * step };
        s.pos = gd().nav.walkable(next) ? next : gd().nav.snap(next);
      }
    }
    // ---- attack
    if (target && !s.visual && dist(target.pos, s.pos) <= s.range + 80) {
      dealDamage(sim, owner, target, s.dps * dt, s.dmgType, { ability: true });
      if (def?.cc?.every && t >= s.nextCcAt) {
        applyCC(sim, owner, target, def.cc.type, def.cc.duration, def.cc.amount ?? 0.3, s.name);
        s.nextCcAt = t + def.cc.every;
      }
    }
    // ---- take hits: the nearest enemy champion swats at it, enemy towers shoot it
    let incoming = 0;
    let swatter: SimChamp | null = null, sd = 450;
    for (const e of enemies) { const d = dist(e.pos, s.pos); if (d < sd) { sd = d; swatter = e; } }
    if (swatter) incoming += swatter.stats.ad * swatter.stats.as * 0.4 * (s.mode === 'pet' ? 1 : 1.5);
    if (sim.towers.some((tw) => tw.alive && tw.def.side !== s.side && dist2(tw.def.pos, s.pos) < TOWER_RANGE * TOWER_RANGE)) incoming += 250;
    s.hp -= incoming * dt;
  }
  // ---- expire / die (Shaco's clone explodes)
  const gone = sim.summons.filter((s) => s.hp <= 0 || t >= s.until);
  if (!gone.length) return;
  sim.summons = sim.summons.filter((s) => s.hp > 0 && t < s.until);
  for (const s of gone) {
    const owner = sim.champs[s.owner];
    const def = defOf(sim, s);
    if (def?.explode && def.burst) {
      const rank = owner.ranks[def.slot] || 1;
      const hit = sim.champs.filter((e) => e.side !== s.side && !e.dead && dist(e.pos, s.pos) < def.explode!);
      for (const e of hit) dealDamage(sim, owner, e, def.burst(owner, rank), 'magic', { ability: true });
      if (hit.length) sim.dbg(owner, 'ult', `${s.name} explodes on ${hit.map((e) => e.input.name).join(', ')}`);
    }
    if (s.mode === 'pet' && s.hp <= 0) sim.dbg(owner, 'ult', `${s.name} was killed`);
  }
}

/** Area spells also hit enemy summons standing in them. */
export function splashSummons(sim: MatchSim, src: SimChamp, at: Vec, radius: number, dmg: number) {
  for (const s of sim.summons) if (s.side !== src.side && s.mode !== 'trap' && dist2(s.pos, at) < radius * radius) s.hp -= dmg * 0.6;
}
