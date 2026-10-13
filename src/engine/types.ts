// Core domain types shared by the engine, store and UI.

export type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
export const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
export const ROLE_LABEL: Record<Role, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'Bot', support: 'Support' };

export type RegionId = 'KR' | 'CN' | 'EMEA' | 'NA' | 'APAC' | 'BR';
export const REGION_LABEL: Record<RegionId, string> = { KR: 'Korea', CN: 'China', EMEA: 'EMEA', NA: 'Americas North', APAC: 'Asia Pacific', BR: 'Brazil' };

// ------------------------------------------------------------------ champions
export type CCType = 'stun' | 'root' | 'knockup' | 'slow' | 'charm' | 'fear' | 'taunt' | 'suppress' | 'silence' | 'sleep' | 'polymorph' | 'blind' | 'pull' | 'airborne';

export interface Scaling {
  base: number[];
  ap?: number; ad?: number; bonusAd?: number;
  targetMaxHp?: number; targetMissingHp?: number;
  bonusHp?: number; maxHp?: number; bonusArmor?: number; bonusMr?: number;
}

export interface AbilityData {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  icon: string;
  targeting: 'skillshot' | 'targeted' | 'area' | 'self' | 'passive';
  aoe: boolean;
  cooldown: number[];
  range: number;
  damage: (Scaling & { type: 'physical' | 'magic' | 'true' }) | null;
  cc: { type: CCType; duration: number; amount?: number } | null;
  shield: Scaling | null;
  heal: Scaling | null;
  dash: boolean;
  stealth: boolean;
  msBuff: number;
  asBuff: number;
  description: string;
}

export interface ChampionProfile {
  early: number; mid: number; late: number; laning: number; waveclear: number; teamfight: number;
  engage: number; peel: number; poke: number; burst: number; dps: number; tankiness: number;
  mobility: number; cc: number; splitpush: number; pick: number; sustain: number; objective: number;
  roam: number; scaling: number; clear: number; gank: number; blind: number;
}

export interface ChampionStats {
  hp: number; hpPerLevel: number; hpRegen: number; hpRegenPerLevel: number;
  mana: number; manaPerLevel: number; armor: number; armorPerLevel: number;
  mr: number; mrPerLevel: number; ad: number; adPerLevel: number;
  as: number; asRatio: number; asPerLevel: number; range: number; ms: number;
}

export interface Champion {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  classes: string[];
  positions: Role[];
  attackType: 'melee' | 'ranged';
  adaptive: 'ad' | 'ap';
  resource: string;
  difficulty: number;
  ratings: { damage: number; toughness: number; control: number; mobility: number; utility: number } | null;
  stats: ChampionStats;
  passive: { name: string; description: string; icon: string };
  abilities: AbilityData[];
  profile: ChampionProfile;
  archetype?: string;
  powerSpikes?: number[];
  notes?: string;
  image: string;
  /** Most-played item build per role (op.gg): first item, boots, then core and late items. */
  builds?: Partial<Record<Role, { boots: string | null; core: string[]; late: string[]; start?: string | null }>>;
  /** Lane matchups per role (op.gg): the 3 easiest and 3 hardest lane opponents, with this champion's win rate. */
  matchups?: Partial<Record<Role, { easy: { id: string; wr: number }[]; hard: { id: string; wr: number }[] }>>;
  // pro-play meta from real 2026 data (filled by data pipeline)
  meta?: { picks: number; bans: number; wins: number; games: number; presence: number; byRole: Partial<Record<Role, number>> };
}

// ------------------------------------------------------------------ players
export interface PlayerAttributes {
  mechanics: number;    // micro, skillshots, combos
  laning: number;       // trading, wave management, early game
  farming: number;      // CS efficiency
  teamfight: number;    // positioning & target selection in 5v5
  macro: number;        // map awareness, rotations
  vision: number;       // warding & denial
  pathing: number;      // jungle pathing / roaming timing
  objectives: number;   // objective setup, smite/securing
  shotcalling: number;  // leadership & comms
  consistency: number;  // performance variance
  clutch: number;       // big-match composure
  adaptability: number; // meta adaptation, champion learning
  aggression: number;   // style 0 (passive) .. 100 (very aggressive). not a quality stat
}
export const ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = ['mechanics', 'laning', 'farming', 'teamfight', 'macro', 'vision', 'pathing', 'objectives', 'shotcalling', 'consistency', 'clutch', 'adaptability', 'aggression'];
export const ATTRIBUTE_LABEL: Record<keyof PlayerAttributes, string> = {
  mechanics: 'Mechanics', laning: 'Laning', farming: 'Farming', teamfight: 'Teamfighting', macro: 'Macro / Map awareness',
  vision: 'Vision', pathing: 'Pathing / Roaming', objectives: 'Objective control', shotcalling: 'Shotcalling', consistency: 'Consistency',
  clutch: 'Big-match composure', adaptability: 'Adaptability', aggression: 'Aggression (style)',
};

/** Hidden attributes: never shown directly; scouting reveals estimates. */
export interface HiddenAttributes {
  potential: number;      // ceiling of overall rating (1..200, engine/ratings.ts)
  farsight: number;       // reads end-game openings → surprise macro, backdoors, baron sneaks
  mistakes: number;       // tendency for punishable mistakes (higher = worse)
  composure: number;      // tilt resistance
  snowball: number;       // performance when ahead
  resilience: number;     // performance when behind
  workEthic: number;      // training gains
  professionalism: number;
  ego: number;            // demands playing time / resources
  loyalty: number;
  injuryProne: number;    // wrist / burnout risk
}
export const HIDDEN_LABEL: Record<keyof HiddenAttributes, string> = {
  potential: 'Potential', farsight: 'End-game far-sight', mistakes: 'Mistake-proneness', composure: 'Composure', snowball: 'Snowballing',
  resilience: 'Resilience', workEthic: 'Work ethic', professionalism: 'Professionalism', ego: 'Ego', loyalty: 'Loyalty', injuryProne: 'Injury proneness',
};

/** Personal profile (management/persona.ts): off-the-Rift stats, generated once per player. Height and languages are public, the rest is scouted. */
export interface PlayerPersona {
  height: number;      // cm
  looks: number;       // 1..99 (camera presence)
  humor: number;
  charisma: number;
  smarts: number;      // study habits / learning off the Rift
  media: number;       // media savvy
  stamina: number;
  comms: number;       // voice-comms clarity
  online: number;      // social-media activity
  style: number;       // fashion sense
  languages: number;   // spoken languages, 1..4
  followers?: number;  // stream / social following (streamers)
}

export interface Contract {
  salary: number;      // USD / year
  expires: string;     // YYYY-MM-DD
  buyout: number;      // release clause, USD
  signedOn: string;
}

export interface PlayerSeasonStats {
  games: number; wins: number; kills: number; deaths: number; assists: number;
  cs: number; gold: number; damage: number; vision: number; minutes: number; mvps: number;
  champions: Record<string, { games: number; wins: number }>;
}

export interface MatchHistoryEntry {
  date: string; event: string; team: string; vs: string; champion: string;
  k: number; d: number; a: number; cs: number; win: boolean; len?: number; real?: boolean;
}

export interface RealStats {
  games: number; winRate: number; kda: number; kp: number; csm: number; gpm: number; dpm: number;
  vspm: number; dmgShare: number; goldShare: number; deathShare: number; events: string[];
}

export interface Player {
  id: string;
  handle: string;
  name: string;
  nativeName?: string;
  country: string;
  birthdate?: string;
  role: Role;
  secondaryRoles?: Role[];
  teamId: string | null;
  image?: string;
  attributes: PlayerAttributes;
  hidden: HiddenAttributes;
  traits: string[];
  imageUrl?: string;
  champions: Record<string, number>; // champion id -> comfort 0..200 (see engine/mastery.ts)
  /** 200 once the champion pool is on the 0..200 comfort scale (older saves are converted on load) */
  masteryScale?: number;
  /** 200 once the potential is on the 0..200 rating scale (engine/ratings.ts; older saves are converted on load) */
  ratingScale?: number;
  /** lowest rating of the highest band reached so far (development milestones, management/development.ts) */
  topBand?: number;
  playstyle: string[];
  morale: number;             // 0..100
  form: number;               // -10..+10
  fatigue: number;            // 0..100
  contract: Contract | null;
  reputation: number;         // 0..100
  value: number;              // market value USD
  season: PlayerSeasonStats;
  history: MatchHistoryEntry[];       // most recent first, capped
  realStats?: RealStats;
  career: { season: number; teamId: string; teamName: string; games: number; wins: number; titles: string[] }[];
  personality: { professionalism: number; ambition: number; loyalty: number; temperament: number };
  isCustom?: boolean;
  /** fictional free agent generated when a transfer window opened (date generated) */
  generated?: string;
  retired?: boolean;
  isSub?: boolean;
  streamer?: boolean;
  trainingFocus?: keyof PlayerAttributes | 'champion' | null;
  learningChampion?: string | null;
  lastPlayed?: string;
  /** date he joined his current club (fan bonds grow with tenure, management/fanbase.ts) */
  joinedOn?: string;
  /** personal profile (looks, humor, height…), filled lazily by management/persona.ts so old saves load */
  persona?: PlayerPersona;
}

// ------------------------------------------------------------------ staff
export type StaffRole = 'headCoach' | 'coach' | 'analyst' | 'psychologist' | 'scout';
export interface Staff {
  id: string;
  handle: string;
  name: string;
  country: string;
  role: StaffRole;
  teamId: string | null;
  image?: string;
  attributes: { tactics: number; drafting: number; training: number; motivation: number; scouting: number; development: number };
  contract: Contract | null;
  reputation: number;
  isCustom?: boolean;
}

// ------------------------------------------------------------------ teams
export type FacilityKey = 'gamingHouse' | 'trainingFacility' | 'analyticsLab' | 'contentStudio' | 'wellness' | 'academy';
export const FACILITY_INFO: Record<FacilityKey, { name: string; desc: string; baseCost: number; upkeep: number }> = {
  gamingHouse: { name: 'Gaming House', desc: 'Living quarters. Improves morale, chemistry and attracts free agents.', baseCost: 250_000, upkeep: 6_000 },
  trainingFacility: { name: 'Training Facility', desc: 'Scrim rooms & hardware. Boosts training effectiveness.', baseCost: 300_000, upkeep: 7_000 },
  analyticsLab: { name: 'Analytics Lab', desc: 'Data & VOD tooling. Better drafting, scouting reports and opponent prep.', baseCost: 200_000, upkeep: 5_000 },
  contentStudio: { name: 'Content Studio', desc: 'Streaming & media production. Grows fans and content revenue.', baseCost: 180_000, upkeep: 4_500 },
  wellness: { name: 'Wellness Center', desc: 'Gym, physio & psychologist space. Faster fatigue recovery, steadier form.', baseCost: 160_000, upkeep: 4_000 },
  academy: { name: 'Academy Program', desc: 'Youth scouting & development. Better prospects and faster growth for young players.', baseCost: 220_000, upkeep: 5_500 },
};

export interface TeamTactics {
  aggression: number;          // 0..100
  earlyFocus: 'top' | 'mid' | 'bot' | 'balanced';
  objectivePriority: 'dragons' | 'grubs' | 'balanced' | 'baron';
  laneSwap: 'never' | 'auto' | 'always';
  playstyle: 'teamfight' | 'splitpush' | 'pick' | 'siege' | 'balanced';
  invadeLevel1: boolean;
  visionFocus: number;         // 0..100
}

export interface SponsorDeal {
  id: string; sponsorId: string; name: string; category: string; tier: number;
  monthly: number; startDate: string; endDate: string;
  bonus?: { type: 'win_league' | 'playoffs' | 'qualify_international' | 'win_international' | 'fans'; amount: number; target?: number; achieved?: boolean };
  logoColor: string;
}

export interface MerchProduct {
  id: string; name: string; type: string; unitCost: number; price: number;
  stock: number; produced: number; sold: number; quality: number; playerId?: string;
}

export interface LedgerEntry { date: string; category: string; amount: number; note?: string }

export interface Team {
  id: string;
  name: string;
  short: string;
  leagueId: string;
  region: RegionId;
  country?: string;
  logo?: string;
  colors: [string, string];
  roster: string[];
  lineup: Record<Role, string | null>;
  staff: string[];
  balance: number;
  ledger: LedgerEntry[];
  monthly: { month: string; income: Record<string, number>; expense: Record<string, number> }[];
  fans: number;               // total following (die-hards included)
  diehard?: number;           // loyal core inside `fans` (management/fanbase.ts; seeded lazily for old saves)
  reach?: number;             // casual fans the club draws at average form (fanbase.ts)
  hype: number;               // short-term buzz 0..100
  prestige: number;           // long-term reputation 0..100
  facilities: Record<FacilityKey, number>; // levels 0..5
  sponsors: SponsorDeal[];
  merch: MerchProduct[];
  franchise: boolean;
  tactics: TeamTactics;
  chemistry: number;          // 0..100
  academyTeamId?: string;
  parentTeamId?: string;
  isCustom?: boolean;
  history: { season: number; competition: string; placement: number; label: string }[];
  titles: { season: number; competition: string }[];
  realRecord?: { wins: number; losses: number; games: number };
  ticketPrice?: number;
  aiBudget: number;           // AI spending appetite multiplier
  /** naming-rights partnership with a big brand that brokered a step up (management/ascension.ts) */
  brandDeal?: BrandDeal;
}

/** A big brand's naming-rights deal: the club plays under a branded name and the brand funds a league-slot buyout. */
export interface BrandDeal {
  brandId: string; brand: string; color: string; category: string;
  style: 'title' | 'cobrand';
  originalName: string; originalShort: string;
  start: string; until: string;   // the name reverts after `until` (a season's end)
  monthly: number;
  targetLeague: string;
  /** the brokered buyout: done at season rollover */
  slot?: { sellerId: string; price: number; brandPays: number; teamPays: number; status: 'pending' | 'done' | 'void' };
}

// ------------------------------------------------------------------ leagues & competitions
export interface LeagueDef {
  id: string; name: string; fullName: string; tier: 1 | 2 | 3; region: RegionId; country: string;
  franchised?: boolean; parent?: string;
}

export type StageFormat = 'roundRobin' | 'groups' | 'swiss' | 'singleElim' | 'doubleElim' | 'gsl';

export interface SeriesGame {
  blue: string; red: string; winner: string; duration: number;
  kills: [number, number]; gold: [number, number]; towers: [number, number]; dragons: [number, number]; barons: [number, number];
  picks: [string[], string[]]; bans: [string[], string[]];
  players?: GamePlayerLine[];
  mvp?: string;
  detailed?: boolean;
}

export interface GamePlayerLine {
  playerId: string; teamId: string; role: Role; champion: string;
  k: number; d: number; a: number; cs: number; gold: number; damage: number; vision: number; items?: string[];
}

export interface MatchFixture {
  id: string;
  competitionId: string;
  stageId: string;
  date: string;
  round: number;
  bestOf: number;
  teamA: string | null;
  teamB: string | null;
  label?: string;              // e.g. "Upper Final"
  group?: string;
  feeds?: { winnerTo?: [string, 'A' | 'B']; loserTo?: [string, 'A' | 'B'] };
  result?: { winner: string; loser: string; scoreA: number; scoreB: number; games: SeriesGame[] };
  fearless?: boolean;
}

export interface StandingRow { teamId: string; w: number; l: number; gw: number; gl: number; points?: number; swissW?: number; swissL?: number }

export interface Stage {
  id: string;
  name: string;
  format: StageFormat;
  bestOf: number;
  startDate: string;
  endDate: string;
  teams: string[];
  groups?: Record<string, string[]>;
  fixtures: string[];          // fixture ids
  status: 'pending' | 'active' | 'done';
  rounds?: number;             // round robin repetitions, or swiss rounds
  advance?: number;            // teams advancing
  seedsFrom?: string;          // stage id whose results seed this stage
  results?: string[];          // final ordering of teams (placement)
  config?: Record<string, unknown>;
}

export interface Competition {
  id: string;
  name: string;
  short: string;
  season: number;
  kind: 'league' | 'playoffs' | 'international' | 'cup' | 'qualifier';
  leagueId?: string;
  tier: number;
  region?: RegionId | 'INTL';
  startDate: string;
  endDate: string;
  stages: Stage[];
  teams: string[];
  status: 'upcoming' | 'active' | 'done';
  prizePool: number;
  prizeSplit: number[];         // fraction per placement
  placements?: Record<string, number>;
  winner?: string;
  tags?: string[];              // 'fst' | 'msi' | 'ewc' | 'worlds' | 'split1'...
  seedRule?: string;            // how teams are derived when the competition starts
  points?: Record<string, number>;
}

// ------------------------------------------------------------------ messages & news
export interface InboxMessage {
  id: string; date: string; from: string; subject: string; body: string;
  read: boolean; kind: 'info' | 'board' | 'sponsor' | 'transfer' | 'player' | 'match' | 'finance' | 'media';
  action?: { type: string; payload: unknown; label: string; done?: boolean };
}
export interface NewsItem { id: string; date: string; headline: string; body: string; tags: string[]; teamIds?: string[]; playerIds?: string[]; image?: string }

export interface TransferOffer {
  id: string; date: string; playerId: string; fromTeamId: string | null; toTeamId: string;
  fee: number; salary: number; years: number; status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered';
  direction: 'incoming' | 'outgoing'; message?: string; expires: string;
  /** Incoming bids: the player's own view of the move (bidTalks.ts). Optional — old saves have none. */
  stance?: BidStance;
}
/** The player's side of an incoming bid: interest −1 (won't go) … 1 (desperate to go), why, and follow-up bookkeeping. */
export interface BidStance {
  v: number; label: 'eager' | 'keen' | 'open' | 'reluctant' | 'refuses'; why: string; reasons?: string[];
  raised?: number; req?: string; next?: string; step?: string; note?: string; done?: boolean; promised?: boolean;
}

export interface SponsorOffer { id: string; sponsorId: string; name: string; category: string; tier: number; monthly: number; months: number; bonus?: SponsorDeal['bonus']; expires: string; logoColor: string; pitch: string }

export interface BoardState { confidence: number; objectives: { id: string; text: string; target: string; met?: boolean }[]; budgetMultiplier: number }

// ------------------------------------------------------------------ fans & owner (optional, initialised lazily so old saves load)
export type FanPersona = 'diehard' | 'casual' | 'analyst' | 'memer' | 'doomer' | 'toxic' | 'rival' | 'intl' | 'wholesome' | 'insider';
export interface FanReply { user: string; persona: FanPersona; text: string; likes: number }
export interface FanPost {
  id: string; date: string; teamId: string; user: string; persona: FanPersona; text: string;
  likes: number; reposts: number; sentiment: number;   // -2..2 towards the team
  topic: string; mins?: number; playerId?: string; fixtureId?: string; replies?: FanReply[];
}
/** Sentiment of one fanbase. mood -100..100, patience / expectation 0..100, streak = +wins / -losses (series). */
export interface FanMood {
  mood: number; patience: number; expectation: number; streak: number; form: string;
  season?: number; preRank?: number; leagueSize?: number; attendance?: number; trend?: number[];
  nemesis?: string; flags?: Record<string, string>;
}
export interface FanPulse {
  teams: Record<string, FanMood>;
  posts: FanPost[];
  recent?: number[];          // hashes of recently used templates (variety)
  snap?: { teamId: string; roster: string[]; lineup: string[]; sponsors: string[]; facilities: number[]; coach?: string; patch: string; merch: number; merchLines: number; pow: Record<string, number>; payroll: number };
  buzz?: BuzzState;
}
/** Fan buzz, the "self-aware" layer (management/buzz.ts): anomalies fans notice. Everything is capped. */
export interface BuzzEvent { id: string; kind: string; date: string; playerId?: string; teamId?: string; edited?: boolean; data?: Record<string, string | number>; follow?: number }
export interface BuzzState {
  day?: string;                                   // last daily scan
  ovr: Record<string, number>;                    // yesterday's overall per tracked player
  base: Record<string, [string, number]>;         // [date, overall] baseline for slow trends
  edits: { kind: 'player' | 'staff' | 'team'; id: string; date: string; before: Record<string, string | number>; seen?: boolean }[];
  events: BuzzEvent[];                            // recent anomalies, newest first
  form: Record<string, number[][]>;               // user players' last games: [score vs expectation, mvp, k, d, a]
  archive: FanPost[];                             // recent posts about players (outlive the main feed)
  club?: Record<string, string | number>;         // user-club snapshot (balance, facilities, ticket price, staff…)
  flags: Record<string, string>;                  // cooldowns
}
export type OwnerTrait = 'patient' | 'impatient' | 'frugal' | 'generous' | 'ambitious' | 'meddling' | 'superstitious' | 'publicity' | 'oldSchool' | 'dataNerd' | 'sentimental' | 'hotHeaded';
export interface OwnerRequest {
  id: string; kind: string; date: string; expires: string;
  options: { id: string; label: string; hint?: string }[]; fallback: string;
  data?: Record<string, string | number>; resolved?: string; outcome?: string;
}
export interface OwnerPromise {
  id: string; kind: 'winSeries' | 'beatTeam' | 'playoffs' | 'balance' | 'signStar' | 'trophy';
  text: string; made: string; deadline: string; target: number; series: number; wins: number;
  data?: Record<string, string | number>; status: 'open' | 'kept' | 'broken'; source?: string;
}
export interface OwnerState {
  teamId: string; name: string; title: string; background: string; traits: OwnerTrait[];
  mood: number; hired: string; birthday: string; record: { w: number; l: number };
  requests: OwnerRequest[]; promises: OwnerPromise[]; ultimatum: number;
  cooldown: Record<string, string>; sent: string[]; log: { date: string; text: string; tone: number }[];
  originalName?: string; ritual?: { until: string; wins: number; games: number };
}

// ------------------------------------------------------------------ locker room (optional, initialised lazily so old saves load)
/** A personal issue (severity 1..3) that weighs on a player until it passes or is dealt with. */
export interface PlayerIssue { id: string; kind: string; sev: number; since: string; until: string; hidden?: boolean; treated?: boolean }
export interface TalkEntry { date: string; kind: string; tone: number; text: string; reply?: string }
export interface PersonPromise { kind: 'playtime' | 'renew' | 'raise'; text: string; made: string; deadline: string; need?: number; got?: number; base?: number; status: 'open' | 'kept' | 'broken' }
/** The manager's relationship with one of their players. */
export interface PersonState {
  trust: number;                         // 0..100 trust in the manager
  feel?: { k: string; until: string };   // short-lived emotion after a talk or event
  issues: PlayerIssue[];
  log: TalkEntry[];                      // most recent first, capped
  cd: Record<string, string>;            // last date per talk action / approach kind
  promises: PersonPromise[];
  away?: { until: string; reason: string; slot?: Role; standIn?: string };
  incident?: { date: string; kind: string; text: string; handled?: boolean };
  joined: string;
}
export type PairKind = 'duo' | 'friends' | 'mentor' | 'rivals' | 'clash' | 'tension' | 'drama' | 'neutral';
/** Two teammates: affinity -100..100, active drama heat 0..100, optional mentor / duo-queue pairing. */
export interface PairState { aff: number; heat: number; since: string; mentor?: string; duoQ?: string; kind?: PairKind; last?: { date: string; text: string; tone: number } }
export interface PlayerRequest {
  id: string; playerId: string; kind: string; date: string; expires: string;
  options: { id: string; label: string; hint?: string }[]; fallback: string;
  data?: Record<string, string | number>; resolved?: string; outcome?: string;
}
export interface SeriesRecap { fixtureId: string; date: string; won: boolean; score: string; opp: string; big: boolean; perf: Record<string, number>; lines: Record<string, string>; mistakes: Record<string, string>; best?: string; worst?: string }
export interface PeopleState {
  teamId: string;
  players: Record<string, PersonState>;
  pairs: Record<string, PairState>;      // key: sorted "idA|idB"
  requests: PlayerRequest[];
  follow: { date: string; pid: string; key: string; data?: Record<string, string | number> }[];
  feed: { date: string; text: string; tone: number; pids?: string[] }[];
  cd: Record<string, string>;
  sent: string[];                        // dates of player approaches (rate limit)
  streak: number;                        // +wins / -losses in a row (series)
  last?: SeriesRecap;
  recent?: number[];                     // hashes of recently used lines (variety)
}

export interface GameSettings {
  simDetail: 'mine' | 'tier1' | 'all';
  autoSave: boolean;
  matchSpeed: number;
  showFog: boolean;
  /** lore rules (e.g. T1 never loses to an LPL team); undefined = on */
  loreRules?: boolean;
}

export interface GameState {
  version: number;
  id: string;
  saveName: string;
  manager: { name: string; nationality: string; reputation: number };
  createdAt: number;
  date: string;
  season: number;
  userTeamId: string;
  players: Record<string, Player>;
  teams: Record<string, Team>;
  staff: Record<string, Staff>;
  leagues: Record<string, LeagueDef>;
  competitions: Record<string, Competition>;
  fixtures: Record<string, MatchFixture>;
  inbox: InboxMessage[];
  news: NewsItem[];
  transferOffers: TransferOffer[];
  sponsorOffers: SponsorOffer[];
  board: BoardState;
  championPower: Record<string, number>;   // patch meta modifiers (-0.1..+0.1)
  patch: string;
  rngState: number;
  settings: GameSettings;
  history: { season: number; champions: Record<string, string>; awards: Record<string, string> }[];
  scoutedPlayers: Record<string, number>;   // player id -> scouting knowledge 0..100
  pendingMatch?: string | null;             // fixture id the user must play today
  transferWindowOpen: boolean;
  log: string[];
  qualified: Record<string, { teamId: string; league: string; seed: number }[]>;
  seq: number;
  trainingPlan?: { intensity: 'light' | 'balanced' | 'intense'; scrims: number; soloq: number; vod: number; rest: number };
  realHistoryLoaded?: boolean;
  fanPulse?: FanPulse;
  owner?: OwnerState;
  people?: PeopleState;
  /** Title-history reactions (management/legacy.ts): finals on record, the manager's trophies, flags. Lazily created. */
  legacy?: LegacyState;
}

/** A final on record (in-save; real pre-2026 finals live in legacyData.ts). sc = score from the winner's side. */
export interface LegacyFinal { s: number; ev: string; key: string; w: string; l: string; sc: string; d: string; name: string; league?: string }
export interface LegacyState {
  finals: LegacyFinal[];
  mgr: { s: number; comp: string; team: string; d: string }[];   // trophies won by the manager (user)
  flags: Record<string, string>;                                    // one-shot flags & cooldowns (date strings)
}
