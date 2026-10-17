import type { Champion, Role, TeamTactics, AbilityData } from '../types';
import type { DashState, Dashing } from './dash';
import type { Vec, Side, Lane, TowerDef, CampDef } from './map';
import type { CombatStats, OwnedItem } from './champstats';
import type { DragonType } from './constants';

export interface SimPlayerInput {
  playerId: string;
  name: string;
  role: Role;
  championId: string;
  image?: string;
  // effective ratings for this game, 0..100
  mech: number; lane: number; farm: number; tf: number; macro: number; vision: number;
  pathing: number; obj: number; aggression: number; consistency: number; clutch: number; shotcalling: number;
  mastery: number;
  // hidden attributes & traits
  farsight: number; mistakes: number; composure: number; snowball: number; resilience: number;
  traits: string[];
}

export interface SimTeamInput {
  teamId: string;
  name: string;
  short: string;
  color: string;
  logo?: string;
  players: SimPlayerInput[]; // top, jungle, mid, adc, support
  tactics: TeamTactics;
  coachDraft?: number;
  chemistry?: number;
}

export interface SimOptions {
  seed: number;
  dt?: number;
  maxTime?: number;
  bigMatch?: boolean;    // playoffs / internationals: clutch matters more
  sidePick?: 0 | 1;
  debug?: boolean;       // record the decision log (live matches); off for background sims
  destiny?: 0 | 1;       // lore rules: this side can't lose (its players rise to it, its Nexus won't fall)
  analyze?: boolean;     // run the match analyst (analysis.ts): the post-game breakdown in MatchResult.analysis
}

/** Decision log: why players and teams do what they do (live viewer + scripts/debug/log.ts). */
export type DebugCat = 'task' | 'plan' | 'call' | 'fight' | 'wave' | 'recall' | 'flash' | 'help' | 'stuck' | 'base' | 'cc' | 'ult';
export interface DebugEntry { t: number; side: Side | null; idx: number | null; cat: DebugCat; text: string }

export type TaskKind = 'lane' | 'jungle' | 'gank' | 'recall' | 'base' | 'objective' | 'push' | 'defend' | 'ward' | 'roam' | 'group' | 'flee' | 'dead' | 'invade' | 'help';
export interface Task {
  kind: TaskKind;
  lane?: Lane;
  pos?: Vec;
  campId?: string;
  objective?: ObjectiveKind;
  targetIdx?: number;
  until?: number;
  reason?: string;
  lurkUntil?: number;    // gank: how long to wait in fog for the target to step up
  gankOnAt?: number;     // gank: when it was called on (it stays on through small dips for a few seconds)
  gankOffAt?: number;    // gank: when it was last called off (going again needs a clearly better look)
}

export type ObjectiveKind = 'dragon' | 'elder' | 'baron' | 'herald' | 'grubs';

export interface SimAbility extends AbilityData { cdUntil: number }

export interface SimChamp {
  idx: number;
  side: Side;
  role: Role;
  input: SimPlayerInput;
  champ: Champion;
  pos: Vec;
  facing: number;
  path: Vec[];
  dest: Vec | null;
  hp: number;
  level: number;
  xp: number;
  gold: number;
  goldSpent: number;
  goldEarned: number;
  cs: number;
  kills: number; deaths: number; assists: number;
  damageDealt: number; damageTaken: number; healing: number;
  visionScore: number; wardsPlaced: number; wardsKilled: number;
  stats: CombatStats;
  items: OwnedItem[];
  starter: string;   // starting item id (Doran's, Cull, pet, World Atlas...)
  order: string[];
  skillOrder: ('Q' | 'W' | 'E')[];
  ranks: Record<'Q' | 'W' | 'E' | 'R', number>;
  abilities: SimAbility[];
  attackReadyAt: number;
  flashReadyAt: number;
  summ2: 'smite' | 'teleport' | 'heal' | 'ignite' | 'exhaust' | 'barrier' | 'cleanse' | 'ghost';
  summ2ReadyAt: number;
  smiteCharges: number;
  ccUntil: number;        // hard CC (stun, knock-up, suppression, sleep, charm, taunt, fear, polymorph): no actions
  ccType: string | null;
  ccFrom?: number;        // who applied it (charm/taunt walk toward them, fear runs away)
  rootUntil?: number;     // rooted: can't move or dash, can still attack / cast / Flash
  silenceUntil?: number;  // silenced: no spells
  blindUntil?: number;    // blinded: basic attacks miss
  slowUntil: number;
  slowAmt: number;
  hasteUntil?: number;    // movement speed boost (abilities, Ghost, item actives — sim/speed.ts)
  hasteAmt?: number;
  itemActiveAt?: number;  // next time an item active (Youmuu's, Shurelya's, Stridebreaker) is ready
  snipeAt?: number;       // next look for a low enemy in reach of a spell (combat.ts snipe)
  trinket?: 'yellow' | 'oracle' | 'farsight'; // vision.ts
  trinketReadyAt?: number;
  sweepUntil?: number;    // Oracle Lens sweep active
  shield: number;
  shieldUntil: number;
  dead: boolean;
  respawnAt: number;
  task: Task;
  combatTarget: number | null;
  lastCombatAt: number;
  lastDamagedBy: Map<number, number>; // idx -> time
  recallUntil: number;
  killStreak: number;
  lastDecisionAt: number;
  tradeUntil: number;
  moveLockUntil: number;  // attack wind-up / cast time
  chaseStart: number;
  chaseGap?: number;
  dashes?: DashState[];  // mobility from src/data/dashData.ts (charges / recast windows)
  dashing?: Dashing;     // a dash or leap in progress
  passiveDashAt?: number;
  lockLoad?: number;     // recent seconds spent hard-CC'd (decays) — long chains get shorter disables
  lockAt?: number;     // distance to the chase target at the last decision (gaining on it isn't chasing)
  gankOffLane?: Lane;    // jungler: last lane a gank was called off on, and until when not to walk straight back
  gankOffUntil?: number;
  tradeMode: boolean;      // short lane trade (limited ability usage)
  tradeCasts: number;
  potions: number;
  potionUntil: number;
  nextTradeCheck: number;
  wardCharges: number;
  wardRechargeAt: number;
  controlWards: number;
  perf: number;        // performance multiplier for this game
  lastPos: Vec;
  fx: { kind: string; until: number; to?: Vec; color?: string }[];
  lastAbilityName?: string;
  firstItemDone?: boolean;
  ghostUntil?: number; // zhonya / untargetable windows
  laneAssignment: Lane | 'jungle';
  basePerf: number;
  waveIntent: 'push' | 'slow' | 'hold' | 'freeze' | 'careful';
  alert: number;            // mid game: perceived ambush risk at the wave being farmed (0..1)
  helpCheckAt?: number;     // next time this player looks around for a teammate in trouble
  nextGankAt?: number;      // jungler: no re-gank right after calling one off
  gankAssistUntil?: number; // laner: following up an allied gank
  diveUntil?: number;       // committed tower dive (gank call) — the normal dive check doesn't apply
  disengageUntil?: number;  // just called off a gank: walk away instead of brawling at their tower
  shoveBackUntil?: number;  // pushing the wave in before recalling (after a won fight)
  recallWaveCheck?: number; // last recall we considered cancelling to catch a crashing wave
  anchorUntil?: number;     // holding a lane against super minions (team calls don't pull this player away)
  anchorLane?: Lane;
  fleeUntil?: number;    // keep retreating at least until (no flip-flopping at the threat edge)
  zonedUntil?: number;   // laning: giving space to a stronger lane, farming from behind
  rotateKey?: string;    // last team call heard, and when this player acts on it
  rotateAt?: number;
  waveIntentUntil: number;
  waveReason?: string;
  tilt: number;          // accumulated tilt from deaths
  mistakeUntil: number;  // currently in a mistake (overextending / face-checking)
  mistakeKind?: string;
}

export interface SimTower {
  def: TowerDef;
  hp: number;
  maxHp: number;
  alive: boolean;
  plates: number;
  shotReadyAt: number;
  targetIdx: number | null;   // champion idx, or -1 for minions
  shotsOnTarget: number;
}

export interface SimInhib { side: Side; lane: Lane; pos: Vec; hp: number; maxHp: number; alive: boolean; respawnAt: number }

export interface SimWave {
  id: number;
  side: Side;
  lane: Lane;
  p: number;          // progress along blue->red lane
  count: number;
  hp: number;         // total hp pool
  avgHp: number;
  goldEach: number;
  xpEach: number;
  stopped: boolean;
  supers: number;
  cannon: boolean;
  empowered: boolean; // baron buff
}

export interface SimCamp { def: CampDef; hp: number; maxHp: number; alive: boolean; respawnAt: number; lastHitBy: number | null }

export interface SimObjective {
  kind: ObjectiveKind;
  pos: Vec;
  hp: number;
  maxHp: number;
  alive: boolean;
  spawnAt: number;
  dragonType?: DragonType;
  takenBy?: Side;
  attackers: Set<number>;
  lastHitAt?: number; // monsters only reset (regenerate) once nobody has hit them for a while
  lastHitSide?: Side;
  count?: number; // grubs remaining
}

export interface SimWard {
  id: number; side: Side; pos: Vec; until: number; owner: number;
  /** stealth (trinket / support item), control (visible, reveals wards) or farsight (blue trinket, visible) — vision.ts */
  kind: 'stealth' | 'control' | 'farsight';
  control: boolean;
  /** inside an enemy Control Ward's radius: shown to them (and disabled) */
  revealed?: boolean;
}

/** A summoned unit: a pet that fights (Tibbers, Daisy), a turret that holds a spot (Heimerdinger) or a trap. */
export interface SimSummon {
  id: number; side: Side; owner: number; key: string; name: string; icon: string;
  mode: 'pet' | 'turret' | 'trap';
  pos: Vec; hp: number; maxHp: number; until: number;
  dps: number; range: number; speed: number; dmgType: 'physical' | 'magic';
  targetIdx: number | null; nextCcAt: number;
  visual?: boolean;   // the kit's damage is already modelled: shown, does no extra damage
}

/** Something to show on the map for a moment: an ultimate's area/path and who it hit. */
export interface UltFx { t: number; until: number; idx: number; name: string; icon: string; from: Vec; to: Vec; radius: number; hits: string[]; damage: number; channel?: boolean }
export interface Floater { t: number; until: number; pos: Vec; text: string; color: string }

export type GameEventType =
  | 'kill' | 'firstBlood' | 'tower' | 'plate' | 'inhib' | 'nexus' | 'dragon' | 'elder' | 'baron' | 'herald' | 'grubs'
  | 'steal' | 'ace' | 'teamfight' | 'multikill' | 'shutdown' | 'info' | 'soul' | 'flash' | 'gank' | 'laneSwap' | 'tp' | 'ult';

export interface GameEvent {
  t: number;
  type: GameEventType;
  side?: Side;
  text: string;
  killer?: number;
  victim?: number;
  assists?: number[];
  pos?: Vec;
  important?: boolean;
  /** kills: the gold the kill paid (shutdowns included), for the chat / casters */
  bounty?: number;
}

export interface TeamRuntime {
  side: Side;
  input: SimTeamInput;
  kills: number;
  towers: number;
  inhibs: number;
  dragons: DragonType[];
  soul: DragonType | null;
  elders: number;
  barons: number;
  heralds: number;
  grubs: number;
  plates: number;
  baronUntil: number;
  elderUntil: number;
  herald: boolean;        // holding the herald (to summon)
  macro: number;          // team decision quality 0..100
  aggression: number;
  plan: { kind: string; target?: string; until: number; label: string };
  laneSwap: boolean;
  firstTower?: boolean;
  goldTimeline: number[];
  visible: Set<number>;   // enemy champion idx visible to this team
  /** last sighting of each enemy: where, when, HP fraction, and where they were ~2 s before (heading) — fog.ts */
  lastSeen: Map<number, { pos: Vec; t: number; hpf?: number; from?: Vec; fromT?: number }>;
  siege: { lane: Lane | null; until: number };
  compWindow?: number;
  objCalls: Record<string, { d: 'take' | 'hover' | 'concede'; until: number; score: number }>;
  setup: Record<string, number>;
  seenSince: Map<number, number>;  // enemy idx -> when they (re)appeared in our vision
  staged?: Record<string, number>;   // when 2+ of us started waiting at a live objective without starting it
  /** How we play the objective we're on: take it fast, race, finish with smite, bait, fight first, or back off. */
  objStance?: { kind: ObjectiveKind; stance: 'burn' | 'race' | 'smite' | 'bait' | 'fight' | 'retreat'; why: string; until: number };   // seconds of zone control around each live / upcoming objective (0..60)
}

export interface MatchResult {
  winner: Side;
  duration: number;
  teams: { side: Side; teamId: string; kills: number; towers: number; dragons: DragonType[]; barons: number; elders: number; heralds: number; grubs: number; gold: number; inhibs: number; soul: DragonType | null }[];
  players: {
    idx: number; side: Side; playerId: string; name: string; role: Role; championId: string;
    k: number; d: number; a: number; cs: number; gold: number; damage: number; damageTaken: number; vision: number;
    items: string[]; level: number; wardsPlaced: number; wardsKilled?: number; healing: number;
  }[];
  events: GameEvent[];
  goldDiff: number[];   // per minute, blue - red
  mvp: number;          // champion idx
  firstBlood?: Side;
  firstTower?: Side;
  /** The analyst's breakdown (opts.analyze). */
  analysis?: import('./analysis').GameAnalysis;
}

export type ChampionLike = Champion;
