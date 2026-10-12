// Fictional free agents: when a transfer window opens, every region gets a batch of generated, unsigned players
// (solo-queue rookies, tier-2 journeymen, ex-pro veterans and the odd hidden gem) so the market has more depth.
// They are flagged with `generated` (the date they appeared); leftovers nobody signed are removed when the next window opens.
import type { GameState, Player, PlayerAttributes, HiddenAttributes, Role, RegionId } from '../types';
import { ROLES, ATTRIBUTE_KEYS } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { overall, marketValue, emptySeasonStats } from '../setup';
import { windowKey } from './transfers';
import { NAMES } from './staffMarket';
import { gd, hasGameData } from '../../data/gamedata';
import { metaScore } from '../draft/draft';
import { ensurePersona } from './persona';

type Archetype = 'rookie' | 'gem' | 'journeyman' | 'veteran';
type WithFA = GameState & { freeAgentWindow?: string }; // key of the last window that got a batch

// median overall of real tier-1 / tier-2 starters per region (2026 data)
const LEVEL: Record<RegionId, [number, number]> = { KR: [72, 55], CN: [72, 57], EMEA: [61, 43], NA: [59, 44], APAC: [59, 45], BR: [52, 43] };
const COUNTRY_MIX: Record<RegionId, [string, number][]> = {
  KR: [['KR', 1]],
  CN: [['CN', 90], ['TW', 5], ['KR', 5]],
  EMEA: [['DE', 14], ['FR', 12], ['TR', 10], ['PT', 9], ['PL', 9], ['ES', 7], ['GR', 6], ['CZ', 6], ['DK', 5], ['IT', 5], ['SE', 4], ['NL', 3], ['BE', 3], ['GB', 3], ['RS', 2], ['RO', 2]],
  NA: [['US', 55], ['CA', 22], ['MX', 13], ['KR', 10]],
  APAC: [['VN', 40], ['JP', 18], ['TW', 15], ['PH', 10], ['TH', 9], ['AU', 8]],
  BR: [['BR', 75], ['AR', 13], ['CL', 8], ['PE', 4]],
};

// ------------------------------------------------------------------ handles
const WORDS = ['Abyss', 'Aegis', 'Amber', 'Anchor', 'Apex', 'Arrow', 'Astra', 'Atlas', 'Aura', 'Bandit', 'Blaze', 'Bliss', 'Breeze', 'Cactus', 'Cinder', 'Cipher', 'Clover', 'Cobalt', 'Comet',
  'Coral', 'Crane', 'Crow', 'Cypress', 'Dagger', 'Dawn', 'Drift', 'Dusk', 'Ember', 'Falcon', 'Flint', 'Frost', 'Gale', 'Glacier', 'Glint', 'Halo', 'Harbor', 'Haze', 'Hollow',
  'Humble', 'Hush', 'Indigo', 'Jester', 'Kestrel', 'Lotus', 'Lucky', 'Lumen', 'Lynx', 'Maple', 'Marble', 'Mellow', 'Mirage', 'Moss', 'Nimbus', 'Nomad', 'Oasis', 'Onyx', 'Orbit',
  'Pebble', 'Pepper', 'Phantom', 'Pixel', 'Prism', 'Pulse', 'Quartz', 'Quill', 'Rapid', 'Raven', 'Reef', 'Relic', 'Ripple', 'Rogue', 'Rune', 'Saber', 'Sable', 'Scarlet', 'Sierra',
  'Silent', 'Sleepy', 'Snappy', 'Sonar', 'Spark', 'Sparrow', 'Static', 'Steady', 'Summit', 'Tempo', 'Thorn', 'Tide', 'Tundra', 'Umbra', 'Vandal', 'Vapor', 'Vertex', 'Violet',
  'Vortex', 'Wander', 'Whisper', 'Willow', 'Wisp', 'Zenith', 'Zephyr', 'Mango', 'Biscuit', 'Noodle', 'Waffle', 'Panda', 'Otter', 'Badger', 'Koala', 'Gecko', 'Moth'];
const PRE = ['Ra', 'Ve', 'Ca', 'My', 'Ly', 'Ze', 'Ka', 'To', 'Ni', 'Sa', 'Bo', 'Dre', 'Gri', 'Ha', 'Jo', 'Ke', 'Lu', 'Mo', 'No', 'Pa', 'Qui', 'Ro', 'Si', 'Ta', 'Ul', 'Va', 'Wy', 'Xa', 'Yo', 'Zo', 'El', 'Ar', 'Is', 'Or', 'Ty', 'Pe', 'Gu', 'Ki', 'Fe', 'Bru'];
const MID = ['zo', 'the', 'li', 'ry', 'ki', 'va', 'ne', 'ro', 'la', 'mi', 'do', 'sha', 've', 'ga', 'yu', 'ri', '', '', ''];
const END = ['rk', 'o', 'ste', 'n', 's', 'x', 'r', 'l', 'th', 'is', 'an', 'en', 'or', 'us', 'ix', 'a', 'y', 'ii', 'ek', 'ar', 'yz', 'ia', 'ka', 'on'];
const NATIVE: Record<string, string[]> = {
  CN: ['Xiao', 'Hu', 'Lin', 'Tian', 'Ming', 'Xun', 'Yu', 'Hao', 'Jie', 'Wei', 'Feng', 'Long', 'Shan', 'Bai', 'Ye', 'Qing', 'Zhi', 'Yi', 'An', 'Jin', 'Kai', 'Le', 'Mu', 'Ning', 'Rui', 'Tao', 'Wen', 'Xin', 'Jia', 'Qi', 'Heng', 'Fei'],
  VN: ['Bao', 'Duy', 'Gia', 'Hai', 'Hieu', 'Khanh', 'Lam', 'Long', 'Minh', 'Nam', 'Phat', 'Quan', 'Sang', 'Tai', 'Thien', 'Trung', 'Tuan', 'Vinh', 'Kiet', 'Hung', 'Dat', 'Loc', 'Phuc', 'Siu'],
  JP: ['Yuki', 'Kuro', 'Hoshi', 'Sora', 'Ren', 'Kaze', 'Tora', 'Hika', 'Ryo', 'Mochi', 'Neko', 'Taka', 'Haru', 'Aki', 'Shin', 'Kei', 'Yama', 'Tsuki'],
  PT: ['Brisa', 'Fogo', 'Raio', 'Trovao', 'Lobo', 'Gato', 'Sombra', 'Guri', 'Pipoca', 'Tatu', 'Jacare', 'Caju', 'Saci', 'Tropa', 'Fera', 'Bala', 'Brabo', 'Mago', 'Vento', 'Neblina'],
  ES: ['Lobo', 'Fuego', 'Rayo', 'Sombra', 'Tigre', 'Brujo', 'Chispa', 'Cuervo', 'Pibe', 'Tuerca', 'Coco', 'Toro', 'Halcon', 'Niebla', 'Trueno', 'Piedra', 'Chamo', 'Gordo'],
};
const NATIVE_OF: Record<string, string> = { CN: 'CN', TW: 'CN', VN: 'VN', JP: 'JP', BR: 'PT', PT: 'PT', ES: 'ES', MX: 'ES', AR: 'ES', CL: 'ES', PE: 'ES' };
const CAMEL_A = ['Night', 'Iron', 'Red', 'Blue', 'Sky', 'Dark', 'Ice', 'Sun', 'Moon', 'Star', 'Wild', 'Lazy', 'Sad', 'Big', 'Tiny', 'Mr', 'Lil', 'King', 'Zero', 'Last', 'Old', 'Ghost'];
const CAMEL_B = ['Owl', 'Fox', 'Wolf', 'Cat', 'Bear', 'Kid', 'Boy', 'Hand', 'Step', 'Shot', 'Wave', 'Fang', 'Mind', 'Heart', 'Leaf', 'Byte', 'Rain', 'Lane', 'Gap', 'Tilt'];
const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function rawHandle(rng: RNG, code: string): string {
  const native = NATIVE[NATIVE_OF[code] ?? ''];
  const coined = () => cap(rng.pick(PRE) + rng.pick(MID) + rng.pick(END));
  const x = rng.next();
  if (native && x < 0.35) {
    const a = rng.pick(native), b = rng.pick(native);
    const y = rng.next();
    return y < 0.3 ? a : y < 0.7 && a !== b ? a + b : (a + b.toLowerCase()).toLowerCase();
  }
  if (x < 0.62) { const w = rng.pick(WORDS); return rng.chance(0.15) && /[nrtkldm]$/.test(w) ? w + rng.pick(['z', 'o', 'y']) : w; }
  if (x < 0.86) return coined();
  if (x < 0.92) return rng.pick(CAMEL_A) + rng.pick(CAMEL_B);
  if (x < 0.96) return coined().toLowerCase();
  // leetspeak / trailing digit, e.g. "D4nka", "Vexo1"
  const base = coined();
  const i = base.slice(1).search(/[aeio]/);
  return rng.chance(0.5) && i >= 0 ? base.slice(0, i + 1) + LEET[base[i + 1]] + base.slice(i + 2) : base + rng.int(1, 9);
}

function uniqueHandle(rng: RNG, code: string, used: Set<string>): string {
  for (let tries = 0; tries < 40; tries++) {
    const h = rawHandle(rng, code);
    if (h.length >= 3 && h.length <= 13 && !used.has(h.toLowerCase())) { used.add(h.toLowerCase()); return h; }
  }
  let h = '';
  do h = rawHandle(rng, code) + rng.int(10, 99); while (used.has(h.toLowerCase()));
  used.add(h.toLowerCase());
  return h;
}

// ------------------------------------------------------------------ players
const ARCH_BIAS: Record<Archetype, Partial<Record<keyof PlayerAttributes, number>>> = {
  rookie: { mechanics: 5, laning: 2, macro: -6, vision: -4, shotcalling: -8, consistency: -6, clutch: -5, adaptability: 2 },
  gem: { mechanics: 6, laning: 3, macro: -4, shotcalling: -6, consistency: -3, clutch: -2, adaptability: 3 },
  journeyman: { shotcalling: -3, clutch: -2 },
  veteran: { mechanics: -4, laning: -1, macro: 5, vision: 3, shotcalling: 4, consistency: 3, clutch: 3, adaptability: -2 },
};
const ROLE_BIAS: Record<Role, Partial<Record<keyof PlayerAttributes, number>>> = {
  top: { laning: 2 }, jungle: { pathing: 4, objectives: 3, farming: -2 }, mid: { mechanics: 2 }, adc: { farming: 4, teamfight: 2 }, support: { vision: 5, pathing: 2, farming: -6 },
};
const ROLE_TRAITS: Record<Role, string[]> = {
  top: ['lane_kingdom', 'splitpush_king', 'weakside_hero', 'teamfight_maestro', 'farming_machine'],
  jungle: ['baron_thief', 'roaming_menace', 'vision_wizard', 'game_ender', 'snowballer'],
  mid: ['lane_kingdom', 'roaming_menace', 'flash_wizard', 'champion_ocean', 'carry_mentality'],
  adc: ['farming_machine', 'teamfight_maestro', 'carry_mentality', 'survivor', 'flash_wizard'],
  support: ['vision_wizard', 'engage_lord', 'hook_master', 'roaming_menace', 'shotcaller'],
};
const NEGATIVE = ['throw_merchant', 'big_stage_nerves', 'tilter', 'party_animal', 'hot_headed', 'one_trick'];
const BACKGROUND: Record<Archetype, string> = { rookie: 'Solo queue talent', gem: 'Solo queue talent', journeyman: 'Journeyman', veteran: 'Ex-pro' };

function pickArchetype(rng: RNG): Archetype {
  const x = rng.next();
  return x < 0.05 ? 'gem' : x < 0.45 ? 'rookie' : x < 0.82 ? 'journeyman' : 'veteran';
}

function championPool(rng: RNG, role: Role, ovr: number, size: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!hasGameData()) return out;
  const cands = [...gd().championsByRole[role]];
  for (let i = 0; i < size && cands.length; i++) {
    const c = rng.weighted(cands, (x) => 0.08 + metaScore(x.id, role) ** 2);
    cands.splice(cands.indexOf(c), 1);
    out[c.id] = clamp(Math.round(ovr + 12 - i * 1.5 + rng.normal(0, 7)), 25, 95);
  }
  return out;
}

function makePlayer(state: GameState, rng: RNG, region: RegionId, role: Role, key: string, idx: number, used: Set<string>): Player {
  const arch = pickArchetype(rng);
  const [t1, t2] = LEVEL[region];
  const code = rng.weighted(COUNTRY_MIX[region], (c) => c[1])[0];
  const ns = NAMES[code] ?? NAMES.US;
  const handle = uniqueHandle(rng, code, used);
  const name = ns.order === 'family-first' ? `${rng.pick(ns.last)} ${rng.pick(ns.first)}` : `${rng.pick(ns.first)} ${rng.pick(ns.last)}`;
  const age = arch === 'veteran' ? rng.int(26, 31) : arch === 'journeyman' ? rng.int(20, 26) : rng.int(arch === 'gem' ? 17 : 16, 19);
  const target = Math.round(arch === 'rookie' ? t2 - 8 + rng.normal(0, 4) : arch === 'gem' ? t1 - 9 + rng.normal(0, 3) : arch === 'journeyman' ? t2 + 1 + rng.normal(0, 4) : (t1 + t2) / 2 + rng.normal(0, 4));
  const ovr = clamp(target, 20, 85);
  const potential = clamp(Math.round(
    arch === 'rookie' ? Math.max(ovr + 8, t1 - 6 + Math.abs(rng.normal(0, 9)))
      : arch === 'gem' ? Math.max(ovr + 12, t1 + 8 + Math.abs(rng.normal(0, 6)))
        : ovr + (arch === 'journeyman' ? rng.int(0, 4) : rng.int(0, 2))), 25, arch === 'gem' ? 96 : 94);

  // attributes around the target overall (archetype + role shape), then shifted so overall() hits the target
  const a = {} as PlayerAttributes;
  for (const k of ATTRIBUTE_KEYS) a[k] = clamp(Math.round(ovr + (ARCH_BIAS[arch][k] ?? 0) + (ROLE_BIAS[role][k] ?? 0) + rng.normal(0, 5)), 10, 95);
  for (let pass = 0; pass < 3; pass++) {
    const diff = ovr - overall(a, role);
    if (!diff) break;
    for (const k of ATTRIBUTE_KEYS) if (k !== 'aggression') a[k] = clamp(a[k] + diff, 10, 95);
  }
  a.aggression = clamp(Math.round(rng.normal(arch === 'veteran' ? 45 : arch === 'journeyman' ? 52 : 59, 14)), 10, 95);

  const n = (m: number, sd: number, lo = 5, hi = 99) => clamp(Math.round(rng.normal(m, sd)), lo, hi);
  const vet = arch === 'veteran', young = arch === 'rookie' || arch === 'gem';
  const hidden: HiddenAttributes = {
    potential, farsight: n(vet ? 58 : 48, 14), mistakes: n(vet ? 44 : young ? 56 : 52, 11), composure: n(vet ? 62 : young ? 46 : 52, 14),
    snowball: n(50, 14), resilience: n(vet ? 55 : 49, 14), workEthic: n(arch === 'gem' ? 68 : young ? 60 : 54, 15), professionalism: n(vet ? 60 : 55, 14),
    ego: n(vet ? 50 : 45, 15), loyalty: n(arch === 'journeyman' ? 58 : 52, 14), injuryProne: n(vet ? 22 : 13, 8, 1, 90),
  };

  const traits: string[] = young ? ['rookie'] : vet && rng.chance(0.75) ? ['veteran'] : [];
  const add = (t: string) => { if (!traits.includes(t)) traits.push(t); };
  if (rng.chance(arch === 'gem' ? 1 : vet ? 0.25 : arch === 'journeyman' ? 0.3 : 0.2)) add(rng.pick(ROLE_TRAITS[role]));
  if (rng.chance(arch === 'gem' ? 0.25 : young ? 0.08 : 0.05)) add('grinder');
  if (vet && rng.chance(0.3)) add(role === 'support' || role === 'jungle' || role === 'mid' ? rng.pick(['shotcaller', 'mentor']) : rng.pick(['mentor', 'survivor', 'champion_ocean']));
  if (rng.chance(arch === 'gem' ? 0.08 : young ? 0.18 : 0.2)) add(young ? rng.pick(['big_stage_nerves', 'throw_merchant', 'tilter']) : rng.pick(NEGATIVE));
  if (rng.chance(0.08)) add('coinflip');

  const style = role === 'jungle' ? (a.aggression > 58 ? 'Gank-heavy' : 'Farming jungler')
    : role === 'support' ? (a.aggression > 55 ? 'Roaming support' : 'Lane-focused support')
      : a.aggression > 62 ? 'Aggressive' : a.aggression < 42 ? 'Calculated' : role === 'top' ? 'Weakside' : 'Resource carry';
  const poolSize = vet ? rng.int(14, 22) : arch === 'journeyman' ? rng.int(10, 16) : rng.int(8, 14);
  const rep = clamp(Math.round((ovr - 30) * 1.25 - 10 + (vet ? 12 : young ? -4 : 0) + rng.normal(0, 3)), 1, 60);
  const other = ROLES.filter((r) => r !== role);

  const p: Player = {
    id: `fa:${key}-${region}-${idx}-${hashString(handle + name) % 9973}`,
    handle, name, country: ns.country,
    birthdate: addDays(state.date, -Math.round((age + rng.next()) * 365.25)),
    role, secondaryRoles: rng.chance(0.12) ? [rng.pick(other)] : undefined, teamId: null, attributes: a, hidden, traits,
    champions: championPool(rng, role, ovr, poolSize), playstyle: [style, BACKGROUND[arch]],
    morale: rng.int(62, 74), form: 0, fatigue: 0, contract: null, reputation: rep, value: 0,
    season: emptySeasonStats(), history: [], career: [],
    personality: { professionalism: hidden.professionalism, ambition: clamp(hidden.ego + 10, 1, 99), loyalty: hidden.loyalty, temperament: clamp(100 - hidden.composure, 1, 99) },
    generated: state.date, trainingFocus: null, learningChampion: null,
  };
  p.value = marketValue(p, state.date);
  ensurePersona(p, state.date); // personal profile + extended traits
  return p;
}

// ------------------------------------------------------------------ window lifecycle
/** Remove generated players nobody signed (no team, no matches) from earlier windows. */
export function pruneGeneratedFreeAgents(state: GameState, keepKey: string | null): number {
  const gone = new Set<string>();
  for (const p of Object.values(state.players)) {
    if (!p.generated || windowKey(p.generated) === keepKey || p.teamId || p.history.length || p.career.length || p.season.games) continue;
    gone.add(p.id);
    delete state.players[p.id];
    delete state.scoutedPlayers[p.id];
  }
  if (!gone.size) return 0;
  state.transferOffers = state.transferOffers.filter((o) => !gone.has(o.playerId));
  const s = state as GameState & { shortlist?: string[] };
  if (s.shortlist) s.shortlist = s.shortlist.filter((id) => !gone.has(id));
  return gone.size;
}

/**
 * Called daily (cheap no-op unless a new window just opened): generates the window's batch of fictional free agents
 * for every region, scaled by region size (~8–20 each, fewer in the mid-season window), and prunes older leftovers.
 * Uses its own RNG (seeded from the save) so it doesn't consume the main game RNG stream.
 */
export function generateWindowFreeAgents(state: GameState): number {
  const key = windowKey(state.date);
  const s = state as WithFA;
  if (!key || s.freeAgentWindow === key) return 0;
  s.freeAgentWindow = key;
  pruneGeneratedFreeAgents(state, key);
  const rng = new RNG(hashString(`fa:${key}:${state.rngState}:${state.seq}`)); // deterministic per career, main stream untouched
  const used = new Set<string>();
  for (const p of Object.values(state.players)) used.add(p.handle.toLowerCase());
  for (const st of Object.values(state.staff)) used.add(st.handle.toLowerCase());
  if (hasGameData()) for (const c of gd().champions) { used.add(c.name.toLowerCase()); used.add(c.id.toLowerCase()); }
  const teamsIn: Record<string, number> = {};
  for (const t of Object.values(state.teams)) teamsIn[t.region] = (teamsIn[t.region] ?? 0) + 1;
  const mid = key.endsWith('-mid');
  let total = 0;
  for (const region of Object.keys(LEVEL) as RegionId[]) {
    if (!teamsIn[region]) continue;
    const count = clamp(Math.round((6 + Math.sqrt(teamsIn[region]) * 1.3) * (mid ? 0.7 : 1)), 8, 20);
    const offset = rng.int(0, 4);
    for (let i = 0; i < count; i++) {
      const p = makePlayer(state, rng, region, ROLES[(i + offset) % 5], key, i, used);
      if (state.players[p.id]) continue;
      state.players[p.id] = p;
      total++;
    }
  }
  return total;
}

// ------------------------------------------------------------------ shared with youth prospects
/** A believable handle, real-style name and nationality for a new player from `region`. */
export function newIdentity(state: GameState, rng: RNG, region: RegionId): { handle: string; name: string; country: string } {
  const used = new Set<string>();
  for (const p of Object.values(state.players)) used.add(p.handle.toLowerCase());
  for (const st of Object.values(state.staff)) used.add(st.handle.toLowerCase());
  if (hasGameData()) for (const c of gd().champions) { used.add(c.name.toLowerCase()); used.add(c.id.toLowerCase()); }
  const code = rng.weighted(COUNTRY_MIX[region], (c) => c[1])[0];
  const ns = NAMES[code] ?? NAMES.US;
  const name = ns.order === 'family-first' ? `${rng.pick(ns.last)} ${rng.pick(ns.first)}` : `${rng.pick(ns.first)} ${rng.pick(ns.last)}`;
  return { handle: uniqueHandle(rng, code, used), name, country: ns.country };
}

/** A role-appropriate, meta-weighted champion pool for a player of overall `ovr`. */
export function newChampionPool(rng: RNG, role: Role, ovr: number, size: number) { return championPool(rng, role, ovr, size); }
