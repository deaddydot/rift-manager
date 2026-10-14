// Team-composition checklist: the classic comp-building list (hard CC, engage, disengage, poke, waveclear,
// frontline, and a damage mix of physical + magic + utility), read from champion profiles, ability data
// (through gd(), so abilityFixes apply) and item builds. Shown live on the draft screen for both teams
// and used by the AI drafter as a modest nudge (draft.ts compFit). Pure: nothing here changes a draft.
import { gd } from '../../data/gamedata';
import type { CCType, Champion } from '../types';

export type ChecklistKey = 'cc' | 'engage' | 'disengage' | 'poke' | 'waveclear' | 'tank' | 'physical' | 'magic' | 'utility';
export type DamageKind = 'physical' | 'magic' | 'hybrid';

export interface ChecklistRow {
  key: ChecklistKey;
  label: string;
  /** picks that tick this row */
  have: number;
  goal: number;
  met: boolean;
  group: 'comp' | 'damage';
  /** the rule, for tooltips */
  rule: string;
  /** contributing picks with the reason, e.g. "Leona (Q stun, E root, R stun)" */
  contributors: string[];
}

/** Crowd control that stops a champion acting (displacements included; slows, silences and blinds don't count). */
export const HARD_CC: ReadonlySet<CCType> = new Set<CCType>(['stun', 'root', 'knockup', 'airborne', 'charm', 'fear', 'taunt', 'suppress', 'sleep', 'polymorph', 'pull']);

interface RowDef { key: ChecklistKey; label: string; goal: number; group: 'comp' | 'damage'; rule: string; weight: number }
/** Row order, goals, and how much the AI cares about each row (checklistGain). */
export const CHECKLIST_ROWS: readonly RowDef[] = [
  { key: 'cc', label: 'Hard CC', goal: 3, group: 'comp', weight: 1, rule: 'Kit has hard CC (stun, root, knock-up, pull, charm, fear, taunt, suppress, sleep, polymorph; 0.5 s+) and CC rating 5+' },
  { key: 'engage', label: 'Hard Engage', goal: 2, group: 'comp', weight: 2, rule: 'Engage rating 7+' },
  { key: 'disengage', label: 'Disengage', goal: 1, group: 'comp', weight: 0.7, rule: 'Peel rating 7+' },
  { key: 'poke', label: 'Poke', goal: 1, group: 'comp', weight: 0.5, rule: 'Poke rating 7+' },
  { key: 'waveclear', label: 'Waveclear', goal: 1, group: 'comp', weight: 0.6, rule: 'Waveclear rating 7+' },
  { key: 'tank', label: 'Tank', goal: 2, group: 'comp', weight: 2, rule: 'Tankiness 7+, or 6 for melee fighters / divers (bruiser frontline)' },
  { key: 'physical', label: 'Physical', goal: 1, group: 'damage', weight: 1.2, rule: 'Real damage threat (burst or DPS 4+, tanks +1) dealing mostly physical damage — hybrids count for both' },
  { key: 'magic', label: 'Magical', goal: 1, group: 'damage', weight: 1.2, rule: 'Real damage threat (burst or DPS 4+, tanks +1) dealing mostly magic damage — hybrids count for both' },
  { key: 'utility', label: 'Utility', goal: 1, group: 'damage', weight: 0.5, rule: 'Enchanters, top-utility kits (shields, heals, buffs, ally saves, vision) and supports that bring no real damage' },
];

const FRONTLINE_CLASSES = ['fighter', 'diver', 'juggernaut', 'vanguard', 'warden', 'tank'];

/**
 * Damage split of a champion: ability damage types (R counts 1.5), auto attacks (physical, by DPS, for
 * marksmen and AD-built champions), the item build's AD vs AP and the adaptive force. Magic share ≥ 0.6 →
 * magic, ≤ 0.4 → physical, in between → hybrid. Null when the champion is no real damage threat
 * (max(burst, dps) + 1 for tankiness 8+ below 4: Janna, Alistar, Braum, Taric…).
 */
export function damageKind(c: Champion): DamageKind | null {
  const p = c.profile;
  if (Math.max(p.burst, p.dps) + (p.tankiness >= 8 ? 1 : 0) < 4) return null;
  let phys = 0, magic = 0;
  for (const a of c.abilities) {
    if (!a.damage) continue;
    const w = a.slot === 'R' ? 1.5 : 1;
    if (a.damage.type === 'physical') phys += w; else if (a.damage.type === 'magic') magic += w;
  }
  const b = c.builds ? Object.values(c.builds)[0] : undefined;
  let bad = 0, bap = 0;
  if (b) for (const id of [...b.core, ...b.late]) { const s = gd().itemById[id]?.stats; if (s) { bad += (s.ad ?? 0) + (s.lethality ?? 0) * 2; bap += s.ap ?? 0; } }
  phys += bad / 150; magic += bap / 150;
  if (c.classes.includes('marksman') || bad >= 150) phys += p.dps * 0.3;
  if (c.adaptive === 'ap') magic += 0.5; else phys += 0.5;
  const share = magic / Math.max(0.01, phys + magic);
  return share >= 0.6 ? 'magic' : share <= 0.4 ? 'physical' : 'hybrid';
}

const cache = new WeakMap<Champion, Partial<Record<ChecklistKey, string>>>();

/** The rows one champion ticks, each with the reason (cached per champion object). */
export function contributions(c: Champion): Partial<Record<ChecklistKey, string>> {
  const hit = cache.get(c);
  if (hit) return hit;
  const p = c.profile;
  const out: Partial<Record<ChecklistKey, string>> = {};
  const hard = c.abilities.filter((a) => a.cc && HARD_CC.has(a.cc.type) && a.cc.duration >= 0.5);
  if (hard.length && p.cc >= 5) out.cc = hard.map((a) => `${a.slot} ${a.cc!.type}`).join(', ');
  if (p.engage >= 7) out.engage = `engage ${p.engage}`;
  if (p.peel >= 7) out.disengage = `peel ${p.peel}`;
  if (p.poke >= 7) out.poke = `poke ${p.poke}`;
  if (p.waveclear >= 7) out.waveclear = `waveclear ${p.waveclear}`;
  if (p.tankiness >= 7 || (p.tankiness >= 6 && c.attackType === 'melee' && c.classes.some((x) => FRONTLINE_CLASSES.includes(x)))) out.tank = `tankiness ${p.tankiness}`;
  const dk = damageKind(c);
  if (dk === 'physical' || dk === 'hybrid') out.physical = dk;
  if (dk === 'magic' || dk === 'hybrid') out.magic = dk;
  const ench = c.archetype === 'enchanter' || c.classes.includes('enchanter');
  if (ench || (c.ratings?.utility ?? 0) >= 3 || !dk) out.utility = ench ? 'enchanter' : dk ? 'utility kit' : 'utility support';
  cache.set(c, out);
  return out;
}

/** The checklist for a team's picks so far (unknown ids are ignored). */
export function compChecklist(champIds: string[]): ChecklistRow[] {
  const champs = champIds.map((id) => gd().championById[id]).filter(Boolean);
  return CHECKLIST_ROWS.map((r) => {
    const contributors: string[] = [];
    for (const c of champs) { const why = contributions(c)[r.key]; if (why) contributors.push(`${c.name} (${why})`); }
    const have = contributors.length;
    return { key: r.key, label: r.label, have, goal: r.goal, met: have >= r.goal, group: r.group, rule: r.rule, contributors };
  });
}

/** How many picks tick each row (the counts of compChecklist, without the tooltip text). */
export function checklistCounts(champIds: string[]): Record<ChecklistKey, number> {
  const n = { cc: 0, engage: 0, disengage: 0, poke: 0, waveclear: 0, tank: 0, physical: 0, magic: 0, utility: 0 };
  for (const id of champIds) {
    const c = gd().championById[id];
    if (c) for (const k of Object.keys(contributions(c)) as ChecklistKey[]) n[k]++;
  }
  return n;
}

/** Unmet rows of `currentIds` that adding `candidateId` would add to (labels, checklist order). */
export function checklistFills(currentIds: string[], candidateId: string): string[] {
  const c = gd().championById[candidateId];
  if (!c || currentIds.includes(candidateId)) return [];
  const k = contributions(c), have = checklistCounts(currentIds);
  return CHECKLIST_ROWS.filter((r) => k[r.key] && have[r.key] < r.goal).map((r) => r.label);
}

/**
 * How much `candidateId` fills the unmet rows of `currentIds` (0..~1, diminishing): each unmet row it
 * ticks adds weight / goal (the share of the goal it covers), then 1 − e^(−x). Fills nothing → 0.
 */
export function checklistGain(currentIds: string[], candidateId: string): number {
  const c = gd().championById[candidateId];
  if (!c || currentIds.includes(candidateId)) return 0;
  const k = contributions(c), have = checklistCounts(currentIds);
  let x = 0;
  for (const r of CHECKLIST_ROWS) if (k[r.key] && have[r.key] < r.goal) x += r.weight / r.goal;
  return 1 - Math.exp(-x);
}
