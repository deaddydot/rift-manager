// Gameplay constants modelled on the 2026 Summoner's Rift (patch 26.x).
// 2026 changes reflected: Atakhan & Feats of Strength removed (first blood / first
// turret bonus gold returned), game starts ~35s sooner, faster minion waves from 14:00
// and 30:00, Baron at 20:00, one set of Voidgrubs.

export const T = {
  minionsFirst: 30,          // first wave spawns (2026: 35s sooner than the old 1:05)
  waveInterval: 30,
  waveIntervalMid: 25,       // from 14:00
  waveIntervalLate: 20,      // from 30:00
  campsFirst: 55,
  scuttleFirst: 150,
  dragonFirst: 300,
  dragonRespawn: 300,
  elderRespawn: 360,
  grubsSpawn: 360,
  heraldSpawn: 840,
  heraldDespawn: 1185,
  baronSpawn: 1200,
  baronRespawn: 360,
  buffRespawn: 300,
  campRespawn: 135,
  scuttleRespawn: 150,
  platesFall: 840,
  inhibRespawn: 300,
  baronBuff: 180,
  elderBuff: 150,
  recallTime: 8,
  recallTimeMid: 6.5,        // mid lane role quest: faster recall
  passiveGoldStart: 65,
};

export const XP_TO_LEVEL = [0, 280, 660, 1140, 1720, 2400, 3180, 4060, 5040, 6120, 7300, 8580, 9960, 11440, 13020, 14700, 16480, 18360, 20340, 22420];
export const MAX_LEVEL = 18;
export const TOP_MAX_LEVEL = 20; // top lane role quest raises the cap

export const GOLD = {
  start: 500,
  passivePer10: 20.4,
  melee: 21, caster: 14, cannonBase: 60, cannonMax: 90,
  kill: 300, assistPool: 150, firstBlood: 100,
  shutdownPerStreak: 150, shutdownMax: 700,
  outerTowerLocal: 250, towerGlobal: 50, firstTurretBonus: 300,
  innerTowerLocal: 225, inhibTowerLocal: 175, nexusTowerLocal: 50,
  plate: 125,
  baron: 300, dragonTeam: 25, elderTeam: 0, heraldTeam: 0, grub: 15,
  inhib: 50,
  superMinion: 90, // super (mega) minions are worth chasing down: a reason to answer them, not only a threat
  wardKill: 30,
  botQuestBonusPerMin: 4, // bot lane role quest: extra gold income
};

export const XP = {
  melee: 61.75, caster: 30.4, cannon: 95,
  killBase: 140, killPerLevel: 25,
};

/** Respawn time in seconds (base respawn window + time impact factor). */
export function respawnTime(level: number, t: number): number {
  const BRW = [6, 6, 8, 8, 10, 12, 16, 21, 26, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5];
  const base = BRW[Math.min(level, BRW.length) - 1] ?? 52.5;
  const m = t / 60;
  let tif = 0;
  if (m > 15) tif += Math.min(m - 15, 15) * 0.0085;
  if (m > 30) tif += Math.min(m - 30, 15) * 0.006;
  if (m > 45) tif += Math.min(m - 45, 10) * 0.0145;
  return base * (1 + Math.min(0.5, tif));
}

export const TOWER_STATS = {
  outer: { hp: 5000, armor: 40, damage: 170 },
  inner: { hp: 3600, armor: 55, damage: 195 },
  inhib: { hp: 3300, armor: 55, damage: 200 },
  nexus: { hp: 2700, armor: 55, damage: 200 },
} as const;
export const TOWER_RANGE = 775;
export const TOWER_ATTACK_INTERVAL = 0.85;
export const INHIB_HP = 4000;
export const NEXUS_HP = 5500;

export interface CampStats { gold: number; xp: number; hp: number; dps: number }
export const CAMP_STATS: Record<string, CampStats> = {
  blue: { gold: 90, xp: 105, hp: 2300, dps: 32 },
  red: { gold: 90, xp: 105, hp: 2300, dps: 38 },
  gromp: { gold: 80, xp: 100, hp: 2050, dps: 40 },
  wolves: { gold: 85, xp: 95, hp: 1700, dps: 30 },
  raptors: { gold: 85, xp: 95, hp: 1600, dps: 26 },
  krugs: { gold: 125, xp: 125, hp: 2000, dps: 30 },
  scuttle: { gold: 70, xp: 115, hp: 1050, dps: 0 },
};

export const OBJECTIVE_STATS = {
  dragon: { hp: 4000, hpPerMin: 150, dps: 50, dpsPerMin: 2.5 },
  elder: { hp: 7000, hpPerMin: 180, dps: 120, dpsPerMin: 2.5 },
  baron: { hp: 9800, hpPerMin: 190, dps: 150, dpsPerMin: 3.5 },
  herald: { hp: 6800, hpPerMin: 110, dps: 70, dpsPerMin: 2 },
  grubs: { hp: 2600, hpPerMin: 60, dps: 28, dpsPerMin: 1 }, // all three grubs combined
};

export type DragonType = 'infernal' | 'mountain' | 'ocean' | 'cloud' | 'hextech' | 'chemtech';
export const DRAGON_TYPES: DragonType[] = ['infernal', 'mountain', 'ocean', 'cloud', 'hextech', 'chemtech'];
export const DRAGON_LABEL: Record<DragonType, string> = { infernal: 'Infernal', mountain: 'Mountain', ocean: 'Ocean', cloud: 'Cloud', hextech: 'Hextech', chemtech: 'Chemtech' };
export const DRAGON_COLOR: Record<DragonType | 'elder', string> = { infernal: '#f97316', mountain: '#a16207', ocean: '#06b6d4', cloud: '#cbd5e1', hextech: '#38bdf8', chemtech: '#84cc16', elder: '#c084fc' };

export const MINION = { speed: 325, meleeHp: 477, casterHp: 296, cannonHp: 912, dps: 13 };
export const VISION = { champion: 1200, ward: 900, tower: 1150, minion: 700, controlWard: 900 };
export const WARD_DURATION = 120;
