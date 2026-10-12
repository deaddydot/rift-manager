// Champion stat computation: base stats + level growth + items (by gold spent) + buffs.
import type { Champion, Role } from '../types';
import { gd, type ItemData } from '../../data/gamedata';

export interface CombatStats {
  maxHp: number; armor: number; mr: number; ad: number; bonusAd: number; ap: number;
  as: number; range: number; ms: number; crit: number; critDmg: number; ah: number;
  lethality: number; armorPen: number; magicPen: number; magicPenPct: number;
  lifesteal: number; omnivamp: number; hsp: number; hpRegen: number; tenacity: number; bonusHp: number;
}

const growth = (base: number, per: number, level: number) => base + per * (level - 1) * (0.7025 + 0.0175 * (level - 1));

// ------------------------------------------------------------------ builds
// Pro-style build paths per archetype (Data Dragon item ids).
export const BUILDS: Record<string, string[]> = {
  crit_adc: ['3032', '3031', '3036', '3046', '3072', '3026'],
  onhit_adc: ['6672', '3124', '3153', '3091', '3302', '3026'],
  caster_adc: ['3004', '3078', '6694', '3036', '3161', '3026'],
  lethality_adc: ['3142', '6699', '6694', '3814', '3036', '3026'],
  burst_mage: ['6655', '4645', '3089', '3135', '3157', '3102'],
  battlemage: ['6653', '3116', '3157', '3089', '3135', '3102'],
  control_mage: ['3118', '4645', '3089', '3135', '3157', '4628'],
  artillery: ['6655', '4645', '4628', '3089', '3135', '3157'],
  ap_assassin: ['3152', '4645', '3157', '3089', '3135', '3100'],
  ad_assassin: ['3142', '6698', '6694', '3814', '6696', '3026'],
  bruiser: ['6610', '3071', '3053', '6333', '3161', '3026'],
  splitpusher: ['3078', '3181', '3053', '6333', '6610', '3026'],
  ap_bruiser: ['4633', '6653', '3157', '4629', '3089', '3135'],
  tank: ['3068', '3075', '4401', '6665', '3143', '2504'],
  engage_support: ['3190', '3109', '3050', '3110', '4401', '3075'],
  enchanter: ['6617', '3504', '3107', '3222', '6616', '6620'],
  mage_support: ['6653', '3116', '4005', '3157', '3089', '3135'],
  ap_onhit: ['3115', '3124', '3157', '3089', '3135', '4645'],
  hybrid_adc: ['6672', '3124', '3115', '3157', '3089', '3026'],
};
const CHAMP_BUILD: Record<string, string> = {
  Ezreal: 'caster_adc', Corki: 'caster_adc', Jayce: 'lethality_adc', Varus: 'lethality_adc', Kaisa: 'hybrid_adc', Azir: 'ap_onhit', Kayle: 'ap_onhit',
  KogMaw: 'onhit_adc', Vayne: 'onhit_adc', Kalista: 'onhit_adc', Twitch: 'crit_adc', Smolder: 'caster_adc', Senna: 'lethality_adc', Graves: 'crit_adc',
  Gwen: 'ap_bruiser', Mordekaiser: 'ap_bruiser', Rumble: 'ap_bruiser', Lillia: 'battlemage', Sylas: 'ap_assassin', Diana: 'ap_assassin',
  Fiora: 'splitpusher', Camille: 'splitpusher', Jax: 'splitpusher', Tryndamere: 'crit_adc', Yasuo: 'crit_adc', Yone: 'crit_adc', Yunara: 'crit_adc',
  Ziggs: 'artillery', Xerath: 'artillery', Velkoz: 'artillery', Lux: 'artillery', Seraphine: 'battlemage', Hwei: 'control_mage', Viktor: 'control_mage',
  Orianna: 'burst_mage', Syndra: 'burst_mage', Ahri: 'burst_mage', Taliyah: 'control_mage', Ryze: 'ap_bruiser', Cassiopeia: 'battlemage', Aurora: 'burst_mage',
  Mel: 'burst_mage', Karma: 'enchanter', Neeko: 'burst_mage', Galio: 'tank', Skarner: 'tank', KSante: 'tank', Ambessa: 'bruiser',
  Zeri: 'onhit_adc', Aphelios: 'crit_adc', Xayah: 'crit_adc', Jinx: 'crit_adc', Caitlyn: 'crit_adc', Ashe: 'crit_adc', Sivir: 'crit_adc',
  MissFortune: 'crit_adc', Jhin: 'crit_adc', Draven: 'crit_adc', Lucian: 'crit_adc', Samira: 'crit_adc', Nilah: 'crit_adc', Tristana: 'crit_adc',
};

const MAGE_LIKE = new Set(['mage', 'burst', 'battlemage', 'artillery']);
export function archetypeBuild(c: Champion, role: Role): string {
  if (CHAMP_BUILD[c.id]) {
    const b = CHAMP_BUILD[c.id];
    if (role === 'support' && !b.includes('support') && b !== 'enchanter') return c.adaptive === 'ap' ? 'mage_support' : 'engage_support';
    return b;
  }
  const cls = new Set(c.classes);
  const arch = c.archetype ?? '';
  if (role === 'support') {
    if (cls.has('enchanter') || arch === 'enchanter') return 'enchanter';
    if (cls.has('tank') || cls.has('vanguard') || cls.has('warden') || cls.has('catcher') || arch.includes('tank') || arch === 'warden' || arch === 'catcher') return 'engage_support';
    if (c.adaptive === 'ap') return 'mage_support';
    return 'engage_support';
  }
  if (cls.has('marksman') && role === 'adc') return 'crit_adc';
  if (cls.has('tank') || cls.has('vanguard') || cls.has('warden') || arch === 'engage_tank' || arch === 'warden') return 'tank';
  if (cls.has('assassin')) return c.adaptive === 'ap' ? 'ap_assassin' : 'ad_assassin';
  if (cls.has('artillery')) return 'artillery';
  if (cls.has('battlemage')) return 'battlemage';
  if ([...cls].some((x) => MAGE_LIKE.has(x)) && c.adaptive === 'ap') return role === 'top' || role === 'jungle' ? 'battlemage' : 'burst_mage';
  if (cls.has('juggernaut') || cls.has('diver') || cls.has('fighter') || cls.has('skirmisher')) return c.adaptive === 'ap' ? 'ap_bruiser' : (arch === 'splitpusher' ? 'splitpusher' : 'bruiser');
  if (cls.has('marksman')) return 'crit_adc';
  return c.adaptive === 'ap' ? 'battlemage' : 'bruiser';
}
export function bootsFor(build: string): string {
  if (build.includes('adc') && build !== 'caster_adc' && build !== 'lethality_adc') return '3006';
  if (build === 'tank' || build === 'bruiser' || build === 'splitpusher' || build === 'ap_bruiser') return '3047';
  if (build === 'enchanter' || build === 'engage_support' || build === 'mage_support') return '3158';
  if (build === 'caster_adc' || build === 'lethality_adc' || build === 'ad_assassin') return '3158';
  return '3020';
}

/** Ordered purchase list: first item, boots, then the rest. */
export function purchaseOrder(c: Champion, role: Role): string[] {
  const arch = archetypeBuild(c, role);
  const real = c.builds?.[role];
  if (real) {
    // the real build (op.gg): core then late items; top up from the archetype if it's short
    const items = [...real.core, ...real.late].filter((id, i, arr) => !!gd().itemById[id] && arr.indexOf(id) === i);
    const slots = real.boots ? 5 : 6;
    for (const id of BUILDS[arch]) if (items.length < slots && !items.includes(id)) items.push(id);
    return real.boots ? [items[0], real.boots, ...items.slice(1, slots)] : items.slice(0, slots);
  }
  const build = BUILDS[arch];
  return [build[0], bootsFor(arch), ...build.slice(1)];
}

/** An item in the inventory. A partly built item lists the components actually bought (`parts`). */
export interface OwnedItem { id: string; frac: number; parts?: string[]; starter?: boolean }

/** Starting item: the champion's op.gg starter for the role, else a sensible default. */
export function starterFor(c: Champion, role: Role): string {
  const s = c.builds?.[role]?.start;
  if (s && gd().itemById[s]) return s;
  if (role === 'jungle') return '1101';
  if (role === 'support') return '3865';
  if (c.adaptive === 'ap') return '1056';
  if (role === 'adc') return '1055';
  return c.profile.tankiness >= 6 ? '1054' : '1055';
}

/** Spend a budget on an item's recipe: biggest components first, sub-components when one isn't affordable. */
function buyParts(id: string, budget: number): { parts: string[]; spent: number } {
  const it = gd().itemById[id];
  const parts: string[] = [];
  let spent = 0;
  for (const cid of [...(it?.from ?? [])].sort((a, b) => (gd().itemById[b]?.cost ?? 0) - (gd().itemById[a]?.cost ?? 0))) {
    const comp = gd().itemById[cid];
    if (!comp) continue;
    if (budget - spent >= comp.cost) { parts.push(cid); spent += comp.cost; }
    else { const sub = buyParts(cid, budget - spent); parts.push(...sub.parts); spent += sub.spent; }
  }
  return { parts, spent };
}
/** Items owned given total gold spent (last entry may be partially built). Starter gold is not counted. */
export function itemsFromGold(order: string[], goldSpent: number, starter?: string): OwnedItem[] {
  const out: OwnedItem[] = [];
  let g = Math.max(0, goldSpent - 450); // starter item / potions
  for (const id of order) {
    const it = gd().itemById[id];
    if (!it) continue;
    if (g >= it.cost) { out.push({ id, frac: 1 }); g -= it.cost; }
    else { if (g > 0) out.push({ id, frac: g / it.cost, parts: buyParts(id, g).parts }); break; }
  }
  // the starting item is kept until the inventory fills up with finished items
  if (starter && out.filter((o) => o.frac >= 1).length < 5) out.unshift({ id: starter, frac: 1, starter: true });
  return out;
}

/** What shows in a player's item slots: finished items, the starter, and components worth 600g+. */
export function displayItems(items: OwnedItem[]): string[] {
  const out = items.flatMap((o) => (o.frac >= 1 ? [o.id] : (o.parts ?? []).filter((p) => (gd().itemById[p]?.cost ?? 0) >= 600)));
  return out.slice(0, 6);
}

export interface BuffState {
  baron?: boolean; elder?: boolean; dragons: Record<string, number>; soul?: string | null; t: number;
}

export function computeStats(c: Champion, level: number, items: OwnedItem[], buffs: BuffState, role: Role): CombatStats {
  const s = c.stats;
  const baseAd = growth(s.ad, s.adPerLevel, level);
  const baseHp = growth(s.hp, s.hpPerLevel, level);
  let st: CombatStats = {
    maxHp: baseHp,
    armor: growth(s.armor, s.armorPerLevel, level),
    mr: growth(s.mr, s.mrPerLevel, level),
    ad: baseAd, bonusAd: 0, ap: 0,
    as: 0, range: s.range, ms: s.ms, crit: 0, critDmg: 1.75, ah: 0,
    lethality: 0, armorPen: 0, magicPen: 0, magicPenPct: 0, lifesteal: 0, omnivamp: 0, hsp: 0,
    hpRegen: growth(s.hpRegen, s.hpRegenPerLevel, level) / 5, tenacity: 0, bonusHp: 0,
  };
  let bonusAs = s.asPerLevel * (level - 1) * (0.7025 + 0.0175 * (level - 1));
  let msFlat = 0, msPct = 0;
  let hasRabadon = false, hasIE = false;
  // a partly built item contributes the stats of the components bought for it
  const owned: { it: ItemData; f: number }[] = [];
  for (const o of items) {
    const it: ItemData | undefined = gd().itemById[o.id];
    if (!it) continue;
    if (o.frac >= 1 || !o.parts) owned.push({ it, f: o.frac >= 1 ? 1 : o.frac * 0.92 });
    else for (const p of o.parts) { const pi = gd().itemById[p]; if (pi) owned.push({ it: pi, f: 1 }); }
  }
  for (const { it, f } of owned) {
    const o = { id: it.id, frac: f };
    const x = it.stats;
    st.ad += (x.ad ?? 0) * f; st.bonusAd += (x.ad ?? 0) * f;
    st.ap += (x.ap ?? 0) * f;
    st.maxHp += (x.hp ?? 0) * f; st.bonusHp += (x.hp ?? 0) * f;
    st.armor += (x.armor ?? 0) * f; st.mr += (x.mr ?? 0) * f;
    bonusAs += (x.as ?? 0) * f;
    st.crit += (x.crit ?? 0) * f;
    st.ah += (x.ah ?? 0) * f;
    st.lethality += (x.lethality ?? 0) * f;
    st.armorPen = Math.max(st.armorPen, (x.armorPen ?? 0) * f);
    st.magicPen += (x.magicPen ?? 0) * f;
    st.magicPenPct = Math.max(st.magicPenPct, (x.magicPenPct ?? 0) * f);
    st.lifesteal += (x.lifesteal ?? 0) * f;
    st.omnivamp += (x.omnivamp ?? 0) * f;
    st.hsp += (x.hsp ?? 0) * f;
    st.tenacity = Math.max(st.tenacity, (x.tenacity ?? 0) * f);
    msFlat = Math.max(msFlat, it.kind === 'boots' ? (x.ms ?? 0) * f : msFlat);
    if (it.kind !== 'boots') msPct += (x.msPct ?? 0) * f;
    st.hpRegen += ((x.hpRegen ?? 0) * f * baseHp) / 100; // rough
    if (o.id === '3089' && o.frac >= 1) hasRabadon = true;
    if (o.id === '3031' && o.frac >= 1) hasIE = true;
  }
  // magic pen items present in data as flat; Void Staff (3135) is % pen
  if (items.some((o) => o.id === '3135' && o.frac >= 1)) st.magicPenPct = Math.max(st.magicPenPct, 0.4);
  if (items.some((o) => o.id === '3036' && o.frac >= 1)) st.armorPen = Math.max(st.armorPen, 0.35);
  if (hasRabadon) st.ap *= 1.3;
  if (hasIE) st.critDmg += 0.4;

  // role quests (2026): bot lane extra gold (handled in engine), top higher level cap, mid free tier-3 boots
  if (role === 'mid' && level >= 9) msFlat = Math.max(msFlat, 55);

  // ---- objective buffs
  const d = buffs.dragons;
  const inf = d.infernal ?? 0, mtn = d.mountain ?? 0, hex = d.hextech ?? 0, chem = d.chemtech ?? 0, cloud = d.cloud ?? 0;
  st.ad *= 1 + 0.04 * inf; st.bonusAd *= 1 + 0.04 * inf; st.ap *= 1 + 0.04 * inf;
  st.armor *= 1 + 0.06 * mtn; st.mr *= 1 + 0.06 * mtn;
  bonusAs += 0.05 * hex; st.ah += 5 * hex;
  st.tenacity = Math.min(0.6, st.tenacity + 0.06 * chem);
  msPct += 0.025 * cloud;
  st.hpRegen += (d.ocean ?? 0) * 0.004 * st.maxHp / 5;
  if (buffs.soul === 'infernal') { st.ad *= 1.08; st.ap *= 1.08; }
  if (buffs.soul === 'mountain') { st.armor *= 1.08; st.mr *= 1.08; }
  if (buffs.soul === 'ocean') st.hpRegen += 0.01 * st.maxHp;
  if (buffs.soul === 'hextech') bonusAs += 0.1;
  if (buffs.soul === 'cloud') msPct += 0.1;
  if (buffs.baron) {
    const m = Math.min(1, Math.max(0, (buffs.t - 1200) / 1200));
    const adB = 24 + 24 * m, apB = 40 + 40 * m;
    st.ad += adB; st.bonusAd += adB; st.ap += apB;
  }

  st.as = Math.min(2.5, s.as + s.asRatio * bonusAs);
  st.ms = (s.ms + msFlat) * (1 + msPct);
  st.crit = Math.min(1, st.crit);
  return st;
}

/** Ability rank (0 = not learned) at a level, using a standard pro skill order. */
export function abilityRanks(level: number, maxOrder: ('Q' | 'W' | 'E')[]): Record<'Q' | 'W' | 'E' | 'R', number> {
  const r = level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0;
  const basic = level - r; // points into basic abilities
  const ranks = { Q: 0, W: 0, E: 0, R: r };
  const [p, s2, t] = maxOrder;
  // first three levels: one point each (primary first)
  let pts = basic;
  for (const k of [p, s2, t]) if (pts > 0) { ranks[k] = 1; pts--; }
  while (pts > 0) {
    if (ranks[p] < 5) ranks[p]++;
    else if (ranks[s2] < 5) ranks[s2]++;
    else if (ranks[t] < 5) ranks[t]++;
    pts--;
  }
  return ranks;
}

/** Max order: abilities with the most damage first. */
export function skillOrder(c: Champion): ('Q' | 'W' | 'E')[] {
  const basics = c.abilities.filter((a) => a.slot !== 'R') as (Champion['abilities'][number] & { slot: 'Q' | 'W' | 'E' })[];
  const score = (a: Champion['abilities'][number]) => {
    const d = a.damage;
    if (!d) return a.shield || a.heal ? 40 : 0;
    const base = d.base[d.base.length - 1] ?? 0;
    return base + (d.ap ?? 0) * 150 + ((d.ad ?? 0) + (d.bonusAd ?? 0)) * 120 - (a.cooldown[4] ?? 8) * 2;
  };
  return [...basics].sort((a, b) => score(b) - score(a)).map((a) => a.slot);
}

// ------------------------------------------------------------------ kit normalisation
// Parsed ability numbers are noisy (channels, DoTs, multi-hit totals, multi-form kits).
// Each champion's ability damage is scaled so its burst matches its authored profile.
const kitCache = new Map<string, { scale: number; virtual: number }>();
export function kitInfo(c: Champion): { scale: number; virtual: number } {
  let k = kitCache.get(c.id);
  if (k) return k;
  const role = c.positions[0] ?? 'mid';
  const items = itemsFromGold(purchaseOrder(c, role), 5000);
  const st = computeStats(c, 9, items, { dragons: {}, t: 900 }, role);
  const ranks = abilityRanks(9, skillOrder(c));
  let raw = 0;
  for (const a of c.abilities) {
    const r = ranks[a.slot];
    const d = a.damage;
    if (!r || !d) continue;
    raw += (d.base[Math.min(r, d.base.length) - 1] ?? 0) + (d.ap ?? 0) * st.ap + (d.ad ?? 0) * st.ad + (d.bonusAd ?? 0) * st.bonusAd
      + (d.targetMaxHp ?? 0) * 1600 * ((d.targetMaxHp ?? 0) > 0.5 ? 0.01 : 1) + (d.bonusHp ?? 0) * st.bonusHp + (d.maxHp ?? 0) * st.maxHp;
  }
  // target burst at level 9 / 5k gold: ~560 average, scaled by authored burst rating
  const target = 560 * (0.55 + (c.profile.burst ?? 5) / 10 * 0.9);
  if (raw < 150) k = { scale: 1, virtual: target };
  else k = { scale: Math.max(0.45, Math.min(1.8, target / raw)), virtual: 0 };
  kitCache.set(c.id, k);
  return k;
}
