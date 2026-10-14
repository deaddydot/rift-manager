// Combat resolution: auto attacks, abilities (real ratios & cooldowns), crowd control,
// shields / heals, summoner spells, damage mitigation and kill credit.
import { clamp } from '../../util/rng';
import { castDash, chaseDash, dashReach, interruptDash } from './dash';
import { ascension } from '../mastery';
import { dist, dist2, FOUNTAIN, type Vec } from './map';
import type { MatchSim } from './engine';
import type { SimChamp, SimAbility } from './simtypes';
import { kitInfo } from './champstats';
import { hasSummon, spawnSummons, splashSummons } from './summons';
import { JOIN_ULT_CHAMPS } from './globals';
import { onAbilityCast, onHitSpeed } from './speed';

const HARD_CC = new Set(['stun', 'knockup', 'suppress', 'charm', 'taunt', 'fear', 'sleep', 'polymorph', 'root', 'pull', 'airborne']);
const NO_TENACITY = new Set(['knockup', 'suppress', 'airborne', 'pull']);

export function masteryFactor(c: SimChamp) {
  // champion comfort 0..200: up to solid-soloQ level (100) it's execution (0.86 → 1.0); beyond it,
  // matchup knowledge and tricks keep adding, more slowly (→ 1.08 at 200)
  const m = c.input.mastery;
  return m <= 100 ? 0.86 + m / 100 * 0.14 : 1 + (Math.min(200, m) - 100) / 100 * 0.08;
}

export function dealDamage(sim: MatchSim, src: SimChamp | null, target: SimChamp, raw: number, type: 'physical' | 'magic' | 'true', opts: { tower?: boolean; ability?: boolean } = {}): number {
  if (target.dead || raw <= 0) return 0;
  const t = sim.t;
  // spacing, dodged spells and missed autos that the abstraction cannot model
  if (src && !opts.tower) raw *= CHAMPION_DAMAGE_SCALE * skillFactor(sim, src, target);
  if (target.ghostUntil && target.ghostUntil > t) return 0;
  let dmg = raw;
  if (type !== 'true') {
    if (type === 'physical') {
      let armor = target.stats.armor;
      if (src) armor = armor * (1 - src.stats.armorPen) - src.stats.lethality * (0.6 + 0.4 * src.level / 18);
      dmg *= armor >= 0 ? 100 / (100 + armor) : 2 - 100 / (100 - armor);
    } else {
      let mr = target.stats.mr;
      if (src) mr = mr * (1 - src.stats.magicPenPct) - src.stats.magicPen;
      dmg *= mr >= 0 ? 100 / (100 + mr) : 2 - 100 / (100 - mr);
    }
  }
  // mountain soul style passive shield, chemtech soul damage reduction at low hp
  const tTeam = sim.teams[target.side];
  if (tTeam.soul === 'chemtech' && target.hp < target.stats.maxHp * 0.5) dmg *= 0.88;
  if (src && sim.teams[src.side].soul === 'infernal' && opts.ability) dmg *= 1.04;
  // shields
  if (target.shield > 0 && target.shieldUntil > t) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  if (src && target.recallUntil > t) { target.recallUntil = 0; sim.dbg(target, 'recall', `recall interrupted by ${src.input.name}`); }
  // box-score damage: report pre-abstraction damage (spacing/dodging is folded into the scale)
  const statDmg = src && !opts.tower ? dmg / (CHAMPION_DAMAGE_SCALE * 1.2) : dmg;
  target.damageTaken += statDmg;
  target.lastCombatAt = t;
  if (target.recallUntil > t) target.recallUntil = 0;
  if (src) {
    src.damageDealt += statDmg;
    src.lastCombatAt = t;
    target.lastDamagedBy.set(src.idx, t);
    const vamp = (opts.ability ? 0 : src.stats.lifesteal) + src.stats.omnivamp;
    if (vamp > 0) { const h = dmg * vamp; src.hp = Math.min(src.stats.maxHp, src.hp + h); src.healing += h; }
    // elder execute
    if (sim.teams[src.side].elderUntil > t && target.hp > 0 && target.hp < target.stats.maxHp * 0.2) {
      target.hp = 0;
    }
  }
  if (target.hp <= 0) {
    target.hp = 0;
    // kill credit: the source, otherwise the most recent enemy champion damager
    let killer: SimChamp | null = src;
    if (!killer) {
      let lastT = -Infinity;
      for (const [idx, at] of target.lastDamagedBy) if (at > t - 10 && at > lastT) { lastT = at; killer = sim.champs[idx]; }
    }
    sim.killChampion(target, killer);
  }
  return dmg;
}

function heal(sim: MatchSim, src: SimChamp, target: SimChamp, amount: number) {
  if (target.dead) return;
  const a = amount * (1 + src.stats.hsp);
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, target.hp + a);
  src.healing += target.hp - before;
}

/** Damage as shown to the player (the box-score scale, before the sim's spacing/dodging abstraction). */
export const displayDamage = (dmg: number) => dmg / (CHAMPION_DAMAGE_SCALE * 1.2);
export function shieldAlly(sim: MatchSim, src: SimChamp, target: SimChamp, amount: number, duration = 2.5) { shield(sim, src, target, amount, duration); }
function shield(sim: MatchSim, src: SimChamp, target: SimChamp, amount: number, duration = 2.5) {
  target.shield = Math.max(target.shield, amount * (1 + src.stats.hsp));
  target.shieldUntil = sim.t + duration;
  src.healing += amount * 0.3;
}

const NO_TENACITY_TYPES = new Set(['knockup', 'airborne', 'suppress', 'pull']);
const CC_LABEL: Record<string, string> = { stun: 'stunned', knockup: 'knocked up', airborne: 'knocked up', suppress: 'suppressed', sleep: 'put to sleep', polymorph: 'polymorphed', charm: 'charmed', taunt: 'taunted', fear: 'feared', pull: 'pulled', root: 'rooted', silence: 'silenced', blind: 'blinded' };

/**
 * Crowd control. Hard CC (stun, knock-up, suppression, sleep, polymorph, charm, taunt, fear, pull)
 * leaves the target unable to act for the duration — stuck in place, or walking toward the caster
 * (charm, taunt) / away from them (fear). Roots stop movement and dashes but not attacks, spells or
 * Flash. Silence blocks spells, blind makes basic attacks miss, slows cut movement speed. Tenacity
 * shortens everything except airborne effects and suppression. Any CC interrupts a recall.
 */
export function applyCC(sim: MatchSim, src: SimChamp, target: SimChamp, type: string, duration: number, amount = 0.3, label?: string) {
  if (target.dead) return;
  const t = sim.t;
  let d = NO_TENACITY_TYPES.has(type) ? duration : duration * (1 - target.stats.tenacity);
  if (type === 'slow') {
    target.slowAmt = Math.max(target.slowUntil > t ? target.slowAmt : 0, amount);
    target.slowUntil = Math.max(target.slowUntil, t + d);
    return;
  }
  const by = `${src.input.name}${label ? `'s ${label}` : ''}`;
  if (type === 'silence') { target.silenceUntil = Math.max(target.silenceUntil ?? 0, t + d); sim.dbg(target, 'cc', `silenced by ${by} (${d.toFixed(1)}s)`); return; }
  if (type === 'blind') { target.blindUntil = Math.max(target.blindUntil ?? 0, t + d); sim.dbg(target, 'cc', `blinded by ${by} (${d.toFixed(1)}s)`); return; }
  // cleanse (adc summoner) removes the first big disable
  if (target.summ2 === 'cleanse' && t >= target.summ2ReadyAt && duration > 0.8 && type !== 'knockup' && type !== 'airborne' && type !== 'suppress') {
    target.summ2ReadyAt = t + 210;
    sim.dbg(target, 'cc', `cleanses the ${type} from ${by}`);
    return;
  }
  target.recallUntil = 0;
  interruptDash(target); // a ground dash is stopped where it is
  // chain-CC safety: someone who has spent most of the last few seconds locked down gets shorter
  // disables — a coordinated chain still lands, an endless one (bad data, stacked casts) can't
  target.lockLoad = Math.max(0, (target.lockLoad ?? 0) - (t - (target.lockAt ?? t)) * 0.5);
  target.lockAt = t;
  if (target.lockLoad > 5) d *= 0.25; else if (target.lockLoad > 3) d *= 0.5;
  target.lockLoad += d;
  if (type === 'root') {
    target.rootUntil = Math.max(target.rootUntil ?? 0, t + d);
    target.path = []; target.dest = null;
    target.fx.push({ kind: 'cc', until: t + d, color: '#4ade80' });
    sim.dbg(target, 'cc', `rooted by ${by} (${d.toFixed(1)}s)`);
    return;
  }
  if (!HARD_CC.has(type)) return;
  if (type === 'pull') {
    // dragged toward the caster
    const dd = dist(target.pos, src.pos);
    if (dd > 200) target.pos = gd().nav.snap(towardPoint(target.pos, src.pos, Math.min(dd - 150, 550)));
  }
  if (t + d > target.ccUntil) { target.ccUntil = t + d; target.ccType = type; target.ccFrom = src.idx; }
  target.path = []; target.dest = null;
  target.combatTarget = type === 'taunt' ? src.idx : target.combatTarget;
  target.fx.push({ kind: 'cc', until: t + d, color: type === 'charm' ? '#f472b6' : type === 'fear' ? '#a78bfa' : type === 'suppress' ? '#f87171' : '#facc15' });
  sim.dbg(target, 'cc', `${CC_LABEL[type] ?? type} by ${by} (${d.toFixed(1)}s)`);
}

export function abilityDamage(c: SimChamp, a: SimAbility, target: SimChamp): number {
  const r = c.ranks[a.slot];
  const d = a.damage;
  if (!r) return 0;
  const kit = kitInfo(c.champ);
  if (!d) {
    // champions whose kits could not be parsed get a virtual damage profile
    if (!kit.virtual || a.slot === 'W') return 0;
    const share = a.slot === 'R' ? 0.4 : 0.3;
    const lvlScale = 0.35 + c.level / 18 * 0.65 + (c.stats.ad - c.champ.stats.ad + c.stats.ap) / 900;
    return kit.virtual * share * lvlScale * c.perf * masteryFactor(c);
  }
  const s = c.stats;
  const base = d.base[Math.min(r, d.base.length) - 1] ?? 0;
  let dmg = base + (d.ap ?? 0) * s.ap + (d.ad ?? 0) * s.ad + (d.bonusAd ?? 0) * s.bonusAd
    + (d.targetMaxHp ?? 0) * target.stats.maxHp * (d.targetMaxHp! > 0.5 ? 0.01 : 1)
    + (d.targetMissingHp ?? 0) * (target.stats.maxHp - target.hp)
    + (d.bonusHp ?? 0) * s.bonusHp + (d.maxHp ?? 0) * s.maxHp + (d.bonusArmor ?? 0) * Math.max(0, s.armor - c.champ.stats.armor);
  return dmg * kit.scale * c.perf * masteryFactor(c);
}

export function cooldownOf(c: SimChamp, a: SimAbility) {
  const r = Math.max(1, c.ranks[a.slot]);
  const cd = a.cooldown[Math.min(r, a.cooldown.length) - 1] ?? 10;
  // safety net against bad ability data: nothing that locks a champion down comes back every second
  const lockdown = a.cc && (HARD_CC.has(a.cc.type) || a.cc.type === 'root');
  return Math.max(lockdown ? 4 : 0.8, cd * 100 / (100 + c.stats.ah));
}

export function hitChance(sim: MatchSim, c: SimChamp, a: SimAbility, target: SimChamp, d: number): number {
  const t = sim.t;
  if (target.ccUntil > t) return 0.98;
  if ((target.rootUntil ?? 0) > t) return a.targeting === 'targeted' ? 0.97 : 0.9; // can't dodge while rooted
  const base = a.targeting === 'targeted' ? 0.97 : a.targeting === 'skillshot' ? 0.56 : a.targeting === 'area' ? 0.64 : 0.86;
  let p = base;
  if (a.targeting !== 'targeted') {
    p += (c.input.mech - 50) * 0.0042 * c.perf;
    p -= (target.input.mech - 50) * 0.0024;
    p -= (target.champ.profile.mobility - 5) * 0.016;
    if (target.slowUntil > t) p += 0.1 + target.slowAmt * 0.15;
    if (a.targeting === 'skillshot' && d > 850) p -= 0.08;
    if (a.aoe) p += 0.05;
    p += ascension(c.input.mastery) * 0.07; // knows exactly where this champion's skillshots land
  }
  return clamp(p, 0.15, 0.98);
}

/** Effective damage output estimate (used by AI for fight evaluation). */
export function burstEstimate(c: SimChamp, target: SimChamp, t: number): number {
  let total = 0;
  for (const a of c.abilities) {
    if (!c.ranks[a.slot] || a.cdUntil > t + 2) continue;
    total += abilityDamage(c, a, target) * 0.7;
  }
  const s = c.stats;
  total += s.ad * s.as * (1 + s.crit * (s.critDmg - 1)) * 3;
  const armorLike = c.champ.adaptive === 'ap' ? target.stats.mr : target.stats.armor;
  return total * 100 / (100 + Math.max(0, armorLike * 0.8));
}

export function dpsEstimate(c: SimChamp): number {
  const s = c.stats;
  const auto = s.ad * s.as * (1 + s.crit * (s.critDmg - 1));
  let abil = 0;
  for (const a of c.abilities) {
    const r = c.ranks[a.slot];
    if (!r || !a.damage) continue;
    const d = a.damage;
    const dmg = (d.base[Math.min(r, d.base.length) - 1] ?? 0) + (d.ap ?? 0) * s.ap + (d.ad ?? 0) * s.ad + (d.bonusAd ?? 0) * s.bonusAd;
    abil += dmg / Math.max(1.5, cooldownOf(c, a)) * (a.slot === 'R' ? 0.5 : 1);
  }
  return auto + abil;
}

function enemiesNear(sim: MatchSim, c: SimChamp, p: Vec, r: number) {
  const out: SimChamp[] = [];
  for (const e of sim.champs) if (e.side !== c.side && !e.dead && dist2(e.pos, p) < r * r) out.push(e);
  return out;
}
function alliesNear(sim: MatchSim, c: SimChamp, r: number) {
  const out: SimChamp[] = [];
  for (const e of sim.champs) if (e.side === c.side && !e.dead && dist2(e.pos, c.pos) < r * r) out.push(e);
  return out;
}

const RADIUS = 65;
export const CHAMPION_DAMAGE_SCALE = 0.44;

/** How player skill shapes a damage exchange: mechanics (execution & dodging), laning in early trades, teamfighting later. */
export function skillFactor(sim: MatchSim, src: SimChamp, target: SimChamp): number {
  const a = src.input, b = target.input;
  const early = sim.t < 840;
  const ctx = early ? (a.lane - b.lane) * 0.008 : (a.tf - b.tf) * 0.007;
  // laning phase, against your lane opponent: the matchup matters (counters win trades)
  // (matchup knowledge: a player who has mastered the champion knows how to play the bad matchup, and how to
  // deny a counter-pick its edge)
  let lane = early && src.role === target.role && src.role !== 'jungle' ? matchupEdge(src.champ.id, target.champ.id, src.role) * 1.8 : 0;
  if (lane < 0) lane *= 1 - ascension(a.mastery) * 0.5;
  else if (lane > 0) lane *= 1 - ascension(b.mastery) * 0.4;
  const mech = (a.mech - b.mech) * 0.008;
  return Math.max(0.6, Math.min(1.6, 1 + mech + ctx + lane)) * src.perf / Math.max(0.85, target.perf) * setupEdge(sim, src, target);
}

/**
 * Objective setup: in fights around a live / upcoming objective, the team that took the zone
 * first (vision, positions, chokes) and reads the setup better (team macro) fights from better
 * angles — a modest damage edge either way (±12%).
 */
export function setupEdge(sim: MatchSim, src: SimChamp, target: SimChamp): number {
  const t = sim.t;
  for (const o of sim.objectives) {
    if (!(o.alive || (o.spawnAt > 0 && o.spawnAt - t < 60))) continue;
    if (dist2(src.pos, o.pos) > 2800 * 2800 || dist2(target.pos, o.pos) > 3200 * 3200) continue;
    const mine = sim.teams[src.side], theirs = sim.teams[target.side];
    const hold = ((mine.setup[o.kind] ?? 0) - (theirs.setup[o.kind] ?? 0)) / 60;
    const read = (mine.macro - theirs.macro) / 100;
    return 1 + clamp(hold * 0.06 + read * 0.25, -0.12, 0.12);
  }
  return 1;
}

const FLASH_CD = 300;
const FLASH_RANGE = 400;

/**
 * Flash (300s): get out of a fight you're about to die in, or get into one — engagers flash in
 * to land their crowd control on a carry, carries flash forward to finish a kill. Mechanics
 * decides reaction time (late flashes die with Flash up).
 */
function flashPlays(sim: MatchSim, c: SimChamp, dt: number): boolean {
  const t = sim.t;
  if (t < c.flashReadyAt || c.ccUntil > t || c.recallUntil > t || c.moveLockUntil > t + 0.3) return false;
  const nav = gd().nav;
  // --- escape: focused by enemies and the incoming damage would kill us
  const hunters = sim.champs.filter((e) => e.side !== c.side && !e.dead && e.combatTarget === c.idx && dist(e.pos, c.pos) < e.stats.range + 450);
  if (hunters.length) {
    const incoming = hunters.reduce((s, e) => s + burstEstimate(e, c, t), 0);
    const lethal = c.hp < incoming * 0.85 || c.hp < c.stats.maxHp * 0.18;
    const running = c.task.kind === 'flee' || c.combatTarget === null || c.hp < c.stats.maxHp * 0.3;
    // reaction: chance per second scaled to this tick
    const react = clamp(1.2 + c.input.mech / 40, 1, 4) * dt;
    if (lethal && running && sim.rng.chance(react)) {
      let ax = 0, ay = 0;
      for (const e of hunters) { ax += e.pos.x; ay += e.pos.y; }
      const away = awayFrom(c.pos, { x: ax / hunters.length, y: ay / hunters.length }, 1);
      const home = towardPoint(c.pos, FOUNTAIN[c.side], 1);
      const dx = (away.x - c.pos.x) * 0.65 + (home.x - c.pos.x) * 0.35, dy = (away.y - c.pos.y) * 0.65 + (home.y - c.pos.y) * 0.35;
      const l = Math.hypot(dx, dy) || 1;
      const to = nav.snap({ x: c.pos.x + dx / l * FLASH_RANGE, y: c.pos.y + dy / l * FLASH_RANGE });
      if (dist(to, c.pos) < 150) return false; // walled in
      c.pos = to; c.flashReadyAt = t + FLASH_CD; c.path = []; c.dest = null;
      c.combatTarget = null; c.task = { kind: 'flee', reason: 'flashed out' }; c.fleeUntil = t + 2.5;
      c.fx.push({ kind: 'flash', until: t + 0.6, color: '#fde047' });
      sim.dbg(c, 'flash', `Flash OUT: ${hunters.map((e) => e.input.name).join(' + ')} on them, HP ${Math.round(c.hp)} vs ~${Math.round(incoming)} incoming`);
      if (sim.rng.chance(0.35)) sim.event('flash', `${c.input.name} flashes away to survive`, c.side);
      return true;
    }
  }
  if (c.combatTarget === null || c.task.kind === 'flee' || c.tradeMode) return false;
  const e = sim.champs[c.combatTarget];
  if (!e || e.dead) return false;
  const d = dist(c.pos, e.pos);
  // --- engage: an engager with hard CC ready flashes into range of a carry when the fight is on
  // (signature-level players find the split-second flash + ability play on any champion with hard CC)
  const asc = ascension(c.input.mastery);
  if ((c.champ.profile.engage >= 7 || asc >= 0.6) && c.hp > c.stats.maxHp * 0.5 && (e.role === 'adc' || e.role === 'mid' || e.hp < e.stats.maxHp * 0.5)) {
    const cc = c.abilities.find((a) => c.ranks[a.slot] && a.cdUntil <= t && a.cc && HARD_CC.has(a.cc.type) && a.range > 0 && a.range < 1100);
    if (cc && d > cc.range + RADIUS && d < cc.range + FLASH_RANGE) {
      const allies = alliesNear(sim, c, 1300).length, foes = enemiesNear(sim, c, e.pos, 1100).length;
      if (allies >= Math.max(2, foes) && sim.rng.chance((0.2 + c.input.aggression / 400) * (1 + asc) * dt)) {
        c.pos = nav.snap(towardPoint(c.pos, e.pos, Math.min(FLASH_RANGE, d - cc.range * 0.6)));
        c.flashReadyAt = t + FLASH_CD;
        c.fx.push({ kind: 'flash', until: t + 0.6, color: '#fde047' });
        sim.dbg(c, 'flash', `Flash IN: ${cc.name} on ${e.input.name} (${allies}v${foes})`);
        if (sim.rng.chance(0.5)) sim.event('flash', `${c.input.name} flashes in on ${e.input.name}!`, c.side);
        return false; // the ability loop casts the CC right away
      }
    }
  }
  // --- kill secure: target just out of reach and our burst finishes it
  if (d > c.stats.range + RADIUS && d < c.stats.range + FLASH_RANGE + 50 && e.hp < burstEstimate(c, e, t) * 0.75 && c.input.aggression > 35 && sim.rng.chance((0.15 + c.input.mech / 400) * (1 + asc) * dt)) {
    c.pos = nav.snap(towardPoint(c.pos, e.pos, Math.min(FLASH_RANGE, d - c.stats.range * 0.7)));
    c.flashReadyAt = t + FLASH_CD;
    c.fx.push({ kind: 'flash', until: t + 0.6, color: '#fde047' });
    sim.dbg(c, 'flash', `Flash forward to finish ${e.input.name} (HP ${Math.round(e.hp)})`);
  }
  return false;
}

/**
 * Snipes: a visible enemy that one spell (or one auto attack) would finish gets it — over a wall, outside any fight,
 * or across the map with a global ultimate. The fight logic below only casts at the current target; this covers
 * everyone else in reach (a 1-HP runner behind a wall in Ziggs Q range doesn't walk away).
 */
function snipe(sim: MatchSim, c: SimChamp): boolean {
  const t = sim.t;
  if ((c.snipeAt ?? 0) > t) return false;
  c.snipeAt = t + 0.4;
  const vis = sim.teams[c.side].visible;
  const foes = sim.champs.filter((e) => e.side !== c.side && !e.dead && vis.has(e.idx) && !((e.ghostUntil ?? 0) > t) && e.idx !== c.combatTarget);
  if (!foes.length) return false;
  const after = (raw: number, type: 'physical' | 'magic' | 'true', e: SimChamp) => raw * (type === 'true' ? 1 : 100 / (100 + Math.max(0, type === 'magic' ? e.stats.mr - c.stats.magicPen : e.stats.armor * (1 - c.stats.armorPen) - c.stats.lethality)));
  // one auto attack finishes someone in range
  if (t >= c.attackReadyAt && !((c.blindUntil ?? 0) > t)) {
    const e = foes.find((x) => dist(x.pos, c.pos) <= c.stats.range + RADIUS && after(c.stats.ad * c.perf, 'physical', x) > x.hp + x.shield);
    if (e) {
      dealDamage(sim, c, e, c.stats.ad * c.perf, 'physical');
      c.attackReadyAt = t + 1 / Math.max(0.2, c.stats.as);
      c.moveLockUntil = t + Math.min(0.4, 0.26 / Math.max(0.3, c.stats.as));
      c.fx.push({ kind: 'attack', until: t + 0.18, to: { ...e.pos } });
      return true;
    }
  }
  if ((c.silenceUntil ?? 0) > t) return false;
  let best: { a: SimAbility; e: SimChamp; d: number } | null = null;
  for (const a of c.abilities) {
    if (!c.ranks[a.slot] || a.cdUntil > t || !a.damage || a.targeting === 'passive' || a.targeting === 'self') continue;
    if (c.dashes?.some((x) => x.def.slot === a.slot) || hasSummon(c, a.slot) || (a.slot === 'R' && JOIN_ULT_CHAMPS.has(c.champ.id))) continue;
    const range = a.range >= 5000 ? 4800 : a.range;
    for (const e of foes) {
      const d = dist(c.pos, e.pos);
      if (d > range + RADIUS || (best && d >= best.d)) continue;
      if (after(abilityDamage(c, a, e), a.damage.type, e) < (e.hp + e.shield) * 1.05) continue;
      best = { a, e, d };
    }
  }
  if (!best) return false;
  const { a, e, d } = best;
  const isUlt = a.slot === 'R';
  const hit = sim.rng.chance(hitChance(sim, c, a, e, d));
  if (hit) {
    dealDamage(sim, c, e, abilityDamage(c, a, e), a.damage!.type, { ability: true });
    if (a.cc && !e.dead) applyCC(sim, c, e, a.cc.type, a.cc.duration, a.cc.amount ?? 0.3, a.name);
  }
  onAbilityCast(sim, c, a);
  a.cdUntil = t + cooldownOf(c, a);
  c.moveLockUntil = t + 0.25;
  c.lastAbilityName = a.name;
  c.fx.push({ kind: hit ? 'cast' : 'miss', until: t + 0.45, to: { ...e.pos }, color: a.damage!.type === 'magic' ? '#a78bfa' : a.damage!.type === 'true' ? '#f8fafc' : '#fb923c' });
  if (isUlt) sim.recordUlt(c, a.name, a.icon, { ...c.pos }, { ...e.pos }, a.aoe ? 330 : 110, hit ? [{ target: e, dmg: 1 }] : []);
  if (hit && e.dead && d > 1300) sim.event('info', `${c.input.name} snipes ${e.input.name} with ${a.name} ${d > 3000 ? 'from across the map' : 'from long range'}!`, c.side, { important: d > 3000 });
  return true;
}

export function updateCombat(sim: MatchSim, dt: number) {
  const t = sim.t;
  for (const c of sim.turnOrder) {
    if (c.dead || c.ccUntil > t || c.recallUntil > t || c.dashing) continue;
    if (flashPlays(sim, c, dt)) continue;
    if (snipe(sim, c)) continue;
    if (c.combatTarget === null) continue;
    const e = sim.champs[c.combatTarget];
    if (!e || e.dead || e.side === c.side) { c.combatTarget = null; continue; }
    const d = dist(c.pos, e.pos);
    const fleeing = c.task.kind === 'flee';
    const seriousFight = enemiesNear(sim, c, c.pos, 1200).length >= 2 || e.hp < e.stats.maxHp * 0.55 || c.tradeUntil < t;

    // ---------------- summoner spells (Flash: see flashPlays)
    if (c.summ2 === 'heal' && t >= c.summ2ReadyAt && c.hp < c.stats.maxHp * 0.3) {
      c.summ2ReadyAt = t + 240;
      for (const a of alliesNear(sim, c, 850)) heal(sim, c, a, 80 + c.level * 15);
    }
    if (c.summ2 === 'barrier' && t >= c.summ2ReadyAt && c.hp < c.stats.maxHp * 0.25) { c.summ2ReadyAt = t + 180; shield(sim, c, c, 105 + c.level * 30, 2.5); }
    if (c.summ2 === 'ignite' && t >= c.summ2ReadyAt && d < 600 && e.hp < 70 + c.level * 20 + burstEstimate(c, e, t) * 0.4) {
      c.summ2ReadyAt = t + 180;
      dealDamage(sim, c, e, 70 + c.level * 20, 'true', { ability: true });
      if (e.dead) continue;
    }
    if (c.summ2 === 'exhaust' && t >= c.summ2ReadyAt && d < 650 && seriousFight) {
      // exhaust the biggest threat near our carries
      c.summ2ReadyAt = t + 210;
      applyCC(sim, c, e, 'slow', 3, 0.3, 'Exhaust');
      e.attackReadyAt = Math.max(e.attackReadyAt, t + 0.8);
    }

    // ---------------- abilities (none while silenced; no dashes while rooted)
    let casted = (c.silenceUntil ?? 0) > t;
    const rooted = (c.rootUntil ?? 0) > t;
    const killable = e.hp < burstEstimate(c, e, t) * 1.1;
    // a runner just out of reach that we can finish: movement dashes close the gap first
    if (!fleeing && !casted && e.task.kind === 'flee' && d > c.stats.range + 80 && chaseDash(sim, c, e, killable)) continue;
    for (const a of c.abilities) {
      if (casted) break;
      const dashAbility = !!c.dashes?.some((x) => x.def.slot === a.slot);
      if (rooted && dashAbility) continue;
      const r = c.ranks[a.slot];
      if (!r || a.cdUntil > t || a.targeting === 'passive') continue;
      const isUlt = a.slot === 'R';
      if (isUlt && JOIN_ULT_CHAMPS.has(c.champ.id)) continue; // flown / channelled in: handled by map plays
      const range = a.range >= 5000 ? 4500 : a.range;
      // defensive self/ally abilities
      if ((a.shield || a.heal) && !a.damage) {
        const allies = alliesNear(sim, c, Math.max(600, range));
        const hurt = allies.filter((x) => x.hp < x.stats.maxHp * 0.7 && x.lastCombatAt > t - 2).sort((x, y) => x.hp / x.stats.maxHp - y.hp / y.stats.maxHp)[0];
        if (hurt) {
          const s = a.shield ?? a.heal!;
          const amt = (s.base[Math.min(r, s.base.length) - 1] ?? 50) + (s.ap ?? 0) * c.stats.ap + (s.ad ?? 0) * c.stats.ad + (s.bonusHp ?? 0) * c.stats.bonusHp + (s.maxHp ?? 0) * c.stats.maxHp;
          if (a.shield) shield(sim, c, hurt, amt); else heal(sim, c, hurt, amt);
          a.cdUntil = t + cooldownOf(c, a);
          casted = true;
          c.lastAbilityName = a.name;
        }
        continue;
      }
      // running: escape dashes are handled by escapeDash (champDecide); no offensive casts
      if (fleeing) continue;
      if (d > Math.max(range, dashAbility ? dashReach(c, a.slot) : 0) + RADIUS) continue;
      if (!a.damage && !a.cc && !(kitInfo(c.champ).virtual && a.slot !== 'W') && !hasSummon(c, a.slot)) continue;
      // short lane trades: a couple of spells, no ultimate unless it kills
      if (c.tradeMode) {
        if (c.tradeCasts >= 2) continue;
        if (isUlt && !(e.hp < abilityDamage(c, a, e) * 1.1 + burstEstimate(c, e, t) * 0.3)) continue;
      }
      if (isUlt) {
        const nearby = enemiesNear(sim, c, e.pos, 700).length;
        const worth = seriousFight || nearby >= 2 || (a.damage && e.hp < abilityDamage(c, a, e) * 1.3);
        if (!worth) continue;
        // global ult snipes only on low targets
        if (a.range >= 5000 && d > 1500 && !(a.damage && e.hp < abilityDamage(c, a, e) * 0.9)) continue;
      } else if (!seriousFight && c.tradeUntil > t && a.cc && a.cc.duration > 1 && c.input.aggression < 50) {
        // in short trades, hold big engage CC unless aggressive
      }
      const castFrom = { ...c.pos };
      const ultHits: { target: SimChamp; dmg: number }[] = [];
      // the ability's dash: onto the target (engage / gap-close) or a kiting step back
      if (dashAbility && castDash(sim, c, a.slot, e, killable) && d > range + RADIUS) {
        // it dashed in range of what it was casting at: the hit lands on arrival
      } else if (d > range + RADIUS) continue; // a dash we chose not to use, and out of the spell's own range
      const p = hitChance(sim, c, a, e, d);
      const targets: SimChamp[] = [e];
      if (a.aoe) for (const o of enemiesNear(sim, c, e.pos, 330)) if (o !== e) targets.push(o);
      let anyHit = false;
      for (let k = 0; k < targets.length; k++) {
        const tg = targets[k];
        const pk = k === 0 ? p : p * (a.targeting === 'self' ? 0.9 : 0.62);
        if (!sim.rng.chance(pk)) continue;
        anyHit = true;
        const dmgType = a.damage?.type ?? (c.champ.adaptive === 'ap' ? 'magic' : 'physical');
        const ad = abilityDamage(c, a, tg);
        const dealt = ad > 0 ? dealDamage(sim, c, tg, ad, dmgType, { ability: true }) : 0;
        if (dealt > 0 && !tg.dead) onHitSpeed(sim, c, tg, true, (x, amt, dur, label) => applyCC(sim, c, x, 'slow', dur, amt, label));
        if (isUlt) ultHits.push({ target: tg, dmg: dealt });
        if (a.cc && !tg.dead) applyCC(sim, c, tg, a.cc.type, a.cc.duration, a.cc.amount ?? 0.3, a.name);
      }
      if (a.shield && !a.damage) shield(sim, c, c, (a.shield.base[Math.min(r, a.shield.base.length) - 1] ?? 60) + (a.shield.ap ?? 0) * c.stats.ap);
      if (a.shield && a.damage) {
        const sv = (a.shield.base[Math.min(r, a.shield.base.length) - 1] ?? 60) + (a.shield.ap ?? 0) * c.stats.ap + (a.shield.ad ?? 0) * c.stats.ad + (a.shield.bonusHp ?? 0) * c.stats.bonusHp;
        shield(sim, c, c, sv);
      }
      if (a.heal && a.damage && anyHit) {
        const hv = (a.heal.base[Math.min(r, a.heal.base.length) - 1] ?? 40) + (a.heal.ap ?? 0) * c.stats.ap + (a.heal.ad ?? 0) * c.stats.ad + (a.heal.bonusAd ?? 0) * c.stats.bonusAd;
        heal(sim, c, c, hv);
      }
      if (a.asBuff) c.attackReadyAt = Math.min(c.attackReadyAt, t + 0.2);
      onAbilityCast(sim, c, a); // haste kits (speed.ts)
      a.cdUntil = t + cooldownOf(c, a);
      if (!dashAbility) c.moveLockUntil = t + (a.targeting === 'self' ? 0.1 : 0.25);
      c.fx.push({ kind: anyHit ? 'cast' : 'miss', until: t + 0.45, to: { ...e.pos }, color: a.damage?.type === 'magic' ? '#a78bfa' : a.damage?.type === 'true' ? '#f8fafc' : '#fb923c' });
      c.lastAbilityName = a.name;
      casted = true;
      if (a.aoe && a.damage) splashSummons(sim, c, e.pos, 330, abilityDamage(c, a, e));
      if (hasSummon(c, a.slot)) spawnSummons(sim, c, a.slot, e.pos);
      if (isUlt) sim.recordUlt(c, a.name, a.icon, castFrom, e.pos, a.aoe ? 330 : dashAbility ? 160 : 110, ultHits);
      if (c.tradeMode) c.tradeCasts++;
      if (isUlt && sim.rng.chance(0.18) && anyHit && targets.length >= 3) sim.event('teamfight', `${c.input.name}'s ${a.name} hits ${targets.length} champions!`, c.side, { important: true });
    }
    if (e.dead || fleeing) continue;

    // ---------------- basic attack
    if (d <= c.stats.range + RADIUS * 2 && t >= c.attackReadyAt) {
      const s = c.stats;
      const crit = sim.rng.chance(s.crit);
      let dmg = s.ad * (crit ? s.critDmg : 1) * c.perf;
      // on-hit approximations for on-hit / bruiser builds
      if (c.items.some((i) => (i.id === '6672' || i.id === '3153' || i.id === '3124') && i.frac >= 1)) dmg += 40 + e.stats.maxHp * 0.025;
      if ((c.blindUntil ?? 0) > t) dmg = 0; // blinded: the attack misses
      dealDamage(sim, c, e, dmg, 'physical');
      if (!e.dead) onHitSpeed(sim, c, e, false, (x, amt, dur, label) => applyCC(sim, c, x, 'slow', dur, amt, label));
      // Azir style AP auto attackers deal magic on-hit via soldiers: approximate with AP ratio
      if (c.champ.adaptive === 'ap' && c.champ.attackType === 'ranged' && c.role !== 'support') dealDamage(sim, c, e, s.ap * 0.18, 'magic');
      c.attackReadyAt = t + 1 / Math.max(0.2, s.as);
      c.moveLockUntil = t + Math.min(0.4, 0.26 / Math.max(0.3, s.as)) * (1.15 - c.input.mech / 250);
      c.fx.push({ kind: 'attack', until: t + 0.18, to: { ...e.pos } });
    }
    // champions attacking structures in range happens in AI push logic (towerAttack)
  }
}

export function awayFrom(p: Vec, from: Vec, d: number): Vec {
  const dx = p.x - from.x, dy = p.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return snapSafe({ x: p.x + dx / l * d, y: p.y + dy / l * d }, p);
}
export function towardPoint(p: Vec, to: Vec, d: number): Vec {
  const dx = to.x - p.x, dy = to.y - p.y;
  const l = Math.hypot(dx, dy) || 1;
  return snapSafe({ x: p.x + dx / l * d, y: p.y + dy / l * d }, p);
}
import { gd, matchupEdge } from '../../data/gamedata';
function snapSafe(q: Vec, fallback: Vec): Vec {
  const nav = gd().nav;
  if (nav.walkable(q)) return q;
  const s = nav.snap(q);
  return dist(s, q) < 400 ? s : fallback;
}

export function nearestFountain(c: SimChamp) { return FOUNTAIN[c.side]; }
