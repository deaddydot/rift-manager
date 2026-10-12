// Map-wide plays: Teleport flanks, map-joining ultimates (Shen, TF, Galio, Pantheon, Ryze,
// Nocturne...) and global damage / heal ultimates (Karthus, Soraka, Jinx, Ashe, Ezreal...).
import { dist, FOUNTAIN, type Vec } from './map';
import type { MatchSim } from './engine';
import type { SimChamp, SimAbility } from './simtypes';
import { abilityDamage, dealDamage, hitChance, cooldownOf, applyCC, shieldAlly } from './combat';
import { gd } from '../../data/gamedata';

/** Ultimates that join a fight from across the map: channel time, impact radius / crowd control on landing. */
const JOIN_ULTS: Record<string, { channel: number; label: string; radius: number; cc?: { type: string; duration: number; amount?: number } }> = {
  Shen: { channel: 3, label: 'Stand United', radius: 0 },
  TwistedFate: { channel: 1.5, label: 'Destiny', radius: 0 },
  Galio: { channel: 2.75, label: "Hero's Entrance", radius: 550, cc: { type: 'knockup', duration: 0.75 } },
  Pantheon: { channel: 2, label: 'Grand Starfall', radius: 600, cc: { type: 'slow', duration: 2, amount: 0.3 } },
  Ryze: { channel: 2, label: 'Realm Warp', radius: 0 },
  Nocturne: { channel: 1, label: 'Paranoia', radius: 250 },
};

/** Where a map-joining ultimate lands, and who it's for. */
function joinLanding(sim: MatchSim, c: SimChamp, fight: Vec): { spot: Vec; note: string; ally?: SimChamp; target?: SimChamp } {
  const allies = sim.champs.filter((a) => a.side === c.side && a !== c && !a.dead && dist(a.pos, fight) < 1800);
  const enemies = sim.champs.filter((e) => e.side !== c.side && !e.dead && dist(e.pos, fight) < 1800 && sim.isVisibleTo(c.side, e.idx));
  const enemyCenter = enemies.length ? { x: enemies.reduce((s2, e) => s2 + e.pos.x, 0) / enemies.length, y: enemies.reduce((s2, e) => s2 + e.pos.y, 0) / enemies.length } : fight;
  const carry = [...enemies].sort((a, b) => (b.role === 'adc' || b.role === 'mid' ? 1 : 0) - (a.role === 'adc' || a.role === 'mid' ? 1 : 0) || a.hp - b.hp)[0];
  switch (c.champ.id) {
    case 'Galio': {
      // fly to the teammate in the thick of it and knock up everyone around them
      const ally = [...allies].sort((a, b) => enemies.filter((e) => dist(e.pos, b.pos) < 600).length - enemies.filter((e) => dist(e.pos, a.pos) < 600).length)[0];
      return { spot: ally ? ally.pos : fight, note: `flies to ${ally?.input.name ?? 'the fight'}`, ally };
    }
    case 'Pantheon': {
      // come down behind their backline
      const f = FOUNTAIN[(1 - c.side) as 0 | 1];
      const d = dist(enemyCenter, f) || 1;
      return { spot: { x: enemyCenter.x + (f.x - enemyCenter.x) / d * 550, y: enemyCenter.y + (f.y - enemyCenter.y) / d * 550 }, note: 'drops behind their backline', target: carry };
    }
    case 'TwistedFate':
      return carry ? { spot: { x: carry.pos.x + 150, y: carry.pos.y + 150 }, note: `teleports onto ${carry.input.name}`, target: carry } : { spot: landingSpot(sim, c, fight), note: 'teleports in' };
    case 'Shen': {
      const ally = [...allies].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      return { spot: ally ? ally.pos : fight, note: `shields ${ally?.input.name ?? 'an ally'} and joins`, ally };
    }
    case 'Nocturne': {
      const iso = [...enemies].sort((a, b) => enemies.filter((e) => dist(e.pos, a.pos) < 900).length - enemies.filter((e) => dist(e.pos, b.pos) < 900).length)[0];
      return iso ? { spot: iso.pos, note: `darkens the map and dives ${iso.input.name}`, target: iso } : { spot: fight, note: 'darkens the map' };
    }
    default:
      return { spot: landingSpot(sim, c, fight), note: 'joins the fight' };
  }
}
const GLOBAL_DAMAGE = new Set(['Karthus', 'Jinx', 'Ashe', 'Ezreal', 'Draven', 'Senna', 'Gangplank', 'Ziggs', 'Xerath', 'Lux']);

/** Active skirmish involving our team far from c: returns the fight center. */
function distantAllyFight(sim: MatchSim, c: SimChamp, minDist: number): Vec | null {
  const t = sim.t;
  const fighting = sim.champs.filter((a) => a.side === c.side && a !== c && !a.dead && a.combatTarget !== null && a.lastCombatAt > t - 2);
  if (fighting.length < 2) return null;
  let x = 0, y = 0;
  for (const a of fighting) { x += a.pos.x; y += a.pos.y; }
  const center = { x: x / fighting.length, y: y / fighting.length };
  const enemies = sim.champs.filter((e) => e.side !== c.side && !e.dead && dist(e.pos, center) < 1800).length;
  if (enemies < 2) return null;
  if (dist(c.pos, center) < minDist) return null;
  return center;
}

function landingSpot(sim: MatchSim, c: SimChamp, center: Vec): Vec {
  const f = FOUNTAIN[c.side];
  const d = dist(center, f) || 1;
  return gd().nav.snap({ x: center.x + (f.x - center.x) / d * 550, y: center.y + (f.y - center.y) / d * 550 });
}

/** Returns true if the champion committed to a map-wide play this decision. */
export const JOIN_ULT_CHAMPS = new Set(['Shen', 'TwistedFate', 'Galio', 'Pantheon', 'Ryze', 'Nocturne']);

export function mapPlays(sim: MatchSim, c: SimChamp): boolean {
  const t = sim.t;
  if (c.dead || c.ccUntil > t || c.recallUntil > t) return false;
  // already fighting: only the map-joining ultimates can still be used (on the fight next to us)
  if (c.combatTarget !== null) return JOIN_ULT_CHAMPS.has(c.champ.id) ? joinUlt(sim, c, true) : false;
  // Teleport flank (TP is limited to towers before 14:00; anywhere afterwards)
  if (c.summ2 === 'teleport' && t >= c.summ2ReadyAt && t > 420) {
    const fight = distantAllyFight(sim, c, 6000);
    if (fight && sim.rng.chance(0.25 + c.input.macro / 300)) {
      c.summ2ReadyAt = t + (t < 840 ? 360 : 240);
      const spot = landingSpot(sim, c, fight);
      c.moveLockUntil = t + 4; c.fx.push({ kind: 'tp', until: t + 4, color: '#a855f7' });
      c.pos = spot; c.path = []; c.dest = null;
      c.task = { kind: 'group', pos: spot, until: t + 15 };
      sim.event('tp', `${c.input.name} teleports into the fight!`, c.side, { important: true });
      return true;
    }
  }
  const r = c.abilities.find((a) => a.slot === 'R') as SimAbility | undefined;
  if (!r || !c.ranks.R || r.cdUntil > t) return false;
  if (JOIN_ULT_CHAMPS.has(c.champ.id) && joinUlt(sim, c, false)) return true;
  // global damage ultimates: finish off a low target anywhere in vision
  if (GLOBAL_DAMAGE.has(c.champ.id) && r.damage) {
    const range = c.champ.id === 'Karthus' ? 99999 : Math.max(r.range, 3000);
    const target = sim.champs.find((e) => e.side !== c.side && !e.dead && sim.isVisibleTo(c.side, e.idx) && dist(e.pos, c.pos) > 1300 && dist(e.pos, c.pos) < range && e.hp < abilityDamage(c, r, e) * 0.85);
    if (target && sim.rng.chance(0.5 + c.input.mech / 250)) {
      r.cdUntil = t + cooldownOf(c, r);
      const p = c.champ.id === 'Karthus' ? 0.95 : hitChance(sim, c, r, target, dist(c.pos, target.pos)) * 0.8;
      c.fx.push({ kind: 'cast', until: t + 0.6, to: { ...target.pos }, color: '#f97316' });
      if (sim.rng.chance(p)) {
        const dmg = dealDamage(sim, c, target, abilityDamage(c, r, target), r.damage.type, { ability: true });
        sim.recordUlt(c, r.name, r.icon, c.pos, target.pos, 200, [{ target, dmg }], { note: target.dead ? 'snipes from across the map' : 'from across the map' });
      } else sim.recordUlt(c, r.name, r.icon, c.pos, target.pos, 200, [], { note: 'misses' });
      return false;
    }
  }
  // Soraka: global heal for allies in trouble
  if (c.champ.id === 'Soraka') {
    const hurt = sim.champs.filter((a) => a.side === c.side && !a.dead && a.lastCombatAt > t - 2 && a.hp < a.stats.maxHp * 0.3);
    if (hurt.length) {
      r.cdUntil = t + cooldownOf(c, r);
      for (const a of sim.champs) if (a.side === c.side && !a.dead) { a.hp = Math.min(a.stats.maxHp, a.hp + 150 + c.stats.ap * 0.55 + c.level * 10); sim.float(a.pos, `+${Math.round(150 + c.stats.ap * 0.55 + c.level * 10)}`, '#4ade80'); }
      sim.recordUlt(c, r.name, r.icon, c.pos, c.pos, 0, [], { note: 'heals the whole team' });
    }
  }
  return false;
}

/** Map-joining ultimates: channel where they stand, then land — each champion its own way. */
export function joinUlt(sim: MatchSim, c: SimChamp, local: boolean): boolean {
  const t = sim.t;
  const r = c.abilities.find((a) => a.slot === 'R') as SimAbility | undefined;
  if (!r || !c.ranks.R || r.cdUntil > t) return false;
  const join = JOIN_ULTS[c.champ.id];
  if (join) {
    const fight = distantAllyFight(sim, c, local ? 0 : 3500);
    if (fight && dist(c.pos, fight) < Math.max(5500, r.range) && sim.rng.chance((local ? 0.12 : 0.3) + c.input.tf / 300)) {
      const plan = joinLanding(sim, c, fight);
      r.cdUntil = t + cooldownOf(c, r);
      c.moveLockUntil = t + join.channel; c.path = []; c.dest = null;
      c.fx.push({ kind: 'tp', until: t + join.channel, color: '#38bdf8' });
      if (c.champ.id === 'Shen' && plan.ally) shieldAlly(sim, c, plan.ally, 180 + 100 * c.ranks.R + c.stats.ap * 0.6, join.channel + 2);
      if (c.champ.id === 'Nocturne') { const enemy = (1 - c.side) as 0 | 1; sim.darkUntil[enemy] = t + 4; }
      sim.recordUlt(c, r.name, r.icon, c.pos, plan.spot, join.radius, [], { channel: join.channel, note: plan.note });
      sim.event('tp', `${c.input.name} ${plan.note} with ${join.label}!`, c.side, { important: true });
      sim.schedule(t + join.channel, () => {
        if (c.dead || c.ccUntil > sim.t) return; // interrupted
        c.pos = gd().nav.snap(plan.spot); c.path = []; c.dest = null;
        c.task = { kind: 'group', pos: c.pos, until: sim.t + 15, reason: `landed with ${r.name}` };
        const hit = sim.champs.filter((e) => e.side !== c.side && !e.dead && dist(e.pos, c.pos) < join.radius);
        const hits: { target: SimChamp; dmg: number }[] = [];
        for (const e of hit) {
          const dmg = r.damage ? dealDamage(sim, c, e, abilityDamage(c, r, e), r.damage.type, { ability: true }) : 0;
          hits.push({ target: e, dmg });
          if (join.cc && !e.dead) applyCC(sim, c, e, join.cc.type, join.cc.duration, join.cc.amount ?? 0.3, r.name);
        }
        // Twisted Fate lands next to his target and Gold Cards them
        if (c.champ.id === 'TwistedFate' && plan.target && !plan.target.dead && dist(plan.target.pos, c.pos) < 700) {
          applyCC(sim, c, plan.target, 'stun', 1.5, 0.3, 'Gold Card');
          if (!hits.some((h) => h.target === plan.target)) hits.push({ target: plan.target, dmg: 0 });
        }
        if (plan.target && !plan.target.dead) { c.combatTarget = plan.target.idx; c.tradeUntil = sim.t + 5; }
        if (hits.length || join.radius > 0) sim.recordUlt(c, r.name, r.icon, c.pos, c.pos, join.radius, hits, { note: 'lands' });
      });
      return true;
    }
  }
  return false;
}
