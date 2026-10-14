// Movement speed: haste from abilities (the data's msBuff plus a few kits it misses), Ghost, item actives and on-hit
// effects (Youmuu's, Shurelya's, Trinity Force, Stridebreaker, Rylai's), and Riot's soft caps. Speed decides chases —
// who catches whom and whether running someone down is worth it (ai.ts chase limits, MatchSim.speedOf).
import type { MatchSim } from './engine';
import type { SimAbility, SimChamp } from './simtypes';
import { dist } from './map';

/** Riot's movement speed soft caps (applied last): above 415 → 80%, above 490 → 50%, below 220 → 50%. */
export function softCapMs(raw: number): number {
  if (raw > 490) return raw * 0.5 + 230;
  if (raw > 415) return raw * 0.8 + 83;
  if (raw < 220) return raw * 0.5 + 110;
  return raw;
}

/** Haste kits the ability data misses: champion → [slot, amount, seconds]. */
const EXTRA_HASTE: Record<string, [SimAbility['slot'], number, number]> = {
  Hecarim: ['E', 0.5, 4], Rammus: ['Q', 0.8, 4], Zilean: ['E', 0.5, 2.5], Karma: ['E', 0.4, 1.5], Lulu: ['W', 0.3, 4],
  Kennen: ['E', 1.0, 2], Garen: ['Q', 0.35, 2], Twitch: ['Q', 0.1, 4], Singed: ['Q', 0.15, 3], Skarner: ['E', 0.4, 2],
};
/** How long a data msBuff lasts (default 2.5 s for basic spells, 4 s for ultimates). */
const HASTE_SECONDS: Record<string, number> = {
  'MasterYi:R': 7, 'Olaf:R': 3, 'Talon:R': 2.5, 'Aatrox:R': 5, 'Sivir:R': 4, 'Morgana:R': 3, 'Rengar:R': 3, 'DrMundo:R': 6,
  'Blitzcrank:W': 3, 'Katarina:W': 1.25, 'Draven:W': 1.5, 'MissFortune:W': 4, 'Shyvana:W': 3, 'Udyr:E': 2.5, 'Zoe:W': 2,
  'Warwick:W': 2, 'Quinn:W': 2, 'Teemo:W': 3, 'Volibear:Q': 4, 'Trundle:W': 4, 'Camille:Q': 1, 'Belveth:R': 4,
};

export function hasteOf(c: SimChamp, a: SimAbility): { amt: number; dur: number } | null {
  const extra = EXTRA_HASTE[c.champ.id];
  if (extra && extra[0] === a.slot) return { amt: extra[1], dur: extra[2] };
  if (!a.msBuff) return null;
  return { amt: Math.min(1.2, a.msBuff), dur: HASTE_SECONDS[`${c.champ.id}:${a.slot}`] ?? (a.slot === 'R' ? 4 : 2.5) };
}

export function applyHaste(sim: MatchSim, c: SimChamp, amt: number, dur: number) {
  const t = sim.t;
  if ((c.hasteUntil ?? 0) > t && (c.hasteAmt ?? 0) >= amt) { c.hasteUntil = Math.max(c.hasteUntil!, t + dur * 0.5); return; }
  c.hasteAmt = amt;
  c.hasteUntil = t + dur;
}

/** A spell was cast (in a fight): its haste kicks in. */
export function onAbilityCast(sim: MatchSim, c: SimChamp, a: SimAbility) {
  const h = hasteOf(c, a);
  if (h) applyHaste(sim, c, h.amt, h.dur);
}

const ITEM = { youmuu: '3142', shurelya: '2065', trinity: '3078', stridebreaker: '6631', rylai: '3116' };
export const hasItem = (c: SimChamp, id: string) => c.items.some((i) => i.id === id && i.frac >= 1);

/**
 * Speed up to catch a runner or get away: a ready haste spell (ultimates only when it matters), Ghost, Youmuu's or
 * Shurelya's. Returns true when something was used (it costs no decision time — they keep running).
 */
export function hasteFor(sim: MatchSim, c: SimChamp, why: 'chase' | 'flee', worth: boolean): boolean {
  const t = sim.t;
  if ((c.hasteUntil ?? 0) > t + 0.5 || (c.silenceUntil ?? 0) > t) return false;
  for (const a of c.abilities) {
    if (!c.ranks[a.slot] || a.cdUntil > t || a.targeting === 'passive') continue;
    const h = hasteOf(c, a);
    if (!h || h.amt < 0.15) continue;
    if (a.slot === 'R' && !worth) continue;
    if (a.damage && a.targeting !== 'self' && why === 'flee') continue; // a damage spell aimed at someone: not an escape button
    a.cdUntil = t + Math.max(4, a.cooldown[Math.min(c.ranks[a.slot], a.cooldown.length) - 1] ?? 12) * (1 - Math.min(0.4, c.stats.ah / (100 + c.stats.ah)));
    applyHaste(sim, c, h.amt, h.dur);
    c.lastAbilityName = a.name;
    return true;
  }
  if (c.summ2 === 'ghost' && t >= c.summ2ReadyAt && worth) {
    c.summ2ReadyAt = t + 210;
    applyHaste(sim, c, 0.24 + Math.min(18, c.level) * 0.0141, 10);
    return true;
  }
  if (hasItem(c, ITEM.youmuu) && t >= (c.itemActiveAt ?? 0)) {
    c.itemActiveAt = t + 45;
    applyHaste(sim, c, 0.2, 6);
    return true;
  }
  if (hasItem(c, ITEM.shurelya) && t >= (c.itemActiveAt ?? 0) && worth) {
    c.itemActiveAt = t + 75;
    for (const x of sim.champs) if (x.side === c.side && !x.dead && dist(x.pos, c.pos) < 1000) applyHaste(sim, x, 0.3, 4);
    return true;
  }
  return false;
}

/** On-hit / on-ability item effects that change speed: Trinity Force haste, Stridebreaker and Rylai's slows. */
export function onHitSpeed(sim: MatchSim, c: SimChamp, target: SimChamp, ability: boolean, slow: (t: SimChamp, amt: number, dur: number, label: string) => void) {
  if (!ability && hasItem(c, ITEM.trinity)) applyHaste(sim, c, 0.06, 2);
  if (ability && hasItem(c, ITEM.rylai)) slow(target, 0.3, 1, "Rylai's");
  if (!ability && hasItem(c, ITEM.stridebreaker) && target.task.kind === 'flee' && sim.t >= (c.itemActiveAt ?? 0)) {
    c.itemActiveAt = sim.t + 15;
    slow(target, 0.35, 3, 'Stridebreaker');
  }
}
