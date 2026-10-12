// Static game data registry (champions, items, nav grid). Loaded once at startup
// in the browser (fetch) or in node scripts (fs) and then accessed synchronously.
import type { Champion, Role } from '../engine/types';
import { NavGrid } from '../engine/sim/map';
import { applyAbilityFixes } from './abilityFixes';

export interface ItemData {
  id: string; name: string; cost: number; kind: 'boots' | 'legendary' | 'component' | 'starter';
  from: string[]; tags: string[]; icon: string; plaintext: string;
  stats: Partial<Record<'ad' | 'ap' | 'hp' | 'armor' | 'mr' | 'as' | 'crit' | 'ah' | 'lethality' | 'armorPen' | 'magicPen' | 'magicPenPct' | 'lifesteal' | 'omnivamp' | 'ms' | 'msPct' | 'hsp' | 'mana' | 'hpRegen' | 'tenacity', number>>;
}

export interface GameData {
  patch: string;
  champions: Champion[];
  championById: Record<string, Champion>;
  items: ItemData[];
  itemById: Record<string, ItemData>;
  nav: NavGrid;
  championsByRole: Record<Role, Champion[]>;
}

let DATA: GameData | null = null;

export function setGameData(raw: { champions: { version: string; champions: Champion[] }; items: { items: ItemData[] }; navgrid: { size: number; bits: string } }) {
  const champions = raw.champions.champions;
  applyAbilityFixes(champions);
  const championById: Record<string, Champion> = {};
  for (const c of champions) championById[c.id] = c;
  const itemById: Record<string, ItemData> = {};
  for (const i of raw.items.items) itemById[i.id] = i;
  const championsByRole = { top: [], jungle: [], mid: [], adc: [], support: [] } as Record<Role, Champion[]>;
  for (const c of champions) for (const r of c.positions) championsByRole[r]?.push(c);
  DATA = {
    patch: raw.champions.version,
    champions,
    championById,
    items: raw.items.items,
    itemById,
    nav: NavGrid.fromBase64(raw.navgrid.size, raw.navgrid.bits),
    championsByRole,
  };
  return DATA;
}

export function gd(): GameData {
  if (!DATA) throw new Error('Game data not loaded');
  return DATA;
}
export const hasGameData = () => DATA !== null;
export const champ = (id: string) => gd().championById[id];

/**
 * Lane matchup edge for `champ` laning against `opp` in `role` (-0.15..0.15): from op.gg lane
 * matchup data (each champion's 3 easiest and 3 hardest lane opponents), checked both ways.
 */
export function matchupEdge(champ: string, opp: string, role: string): number {
  const a = gd().championById[champ]?.matchups?.[role as 'top'];
  const b = gd().championById[opp]?.matchups?.[role as 'top'];
  let e = 0;
  const easyA = a?.easy.find((m) => m.id === opp), hardA = a?.hard.find((m) => m.id === opp);
  const easyB = b?.easy.find((m) => m.id === champ), hardB = b?.hard.find((m) => m.id === champ);
  if (easyA) e = Math.max(e, (easyA.wr - 0.5) * 2 || 0.06);
  if (hardB) e = Math.max(e, (0.5 - hardB.wr) * 2 || 0.06);
  if (hardA) e = Math.min(e, (hardA.wr - 0.5) * 2 || -0.06);
  if (easyB) e = Math.min(e, (0.5 - easyB.wr) * 2 || -0.06);
  return Math.max(-0.15, Math.min(0.15, e));
}
