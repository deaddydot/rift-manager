// Staff market: a deterministic per-season pool of free-agent coaches, analysts, psychologists and scouts,
// plus hiring / firing for the user's team. The pool lives on the save under `state.staffMarket`.
import type { GameState, Staff, StaffRole, Team, RegionId } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { salaryFor } from '../setup';
import { addLedger } from './finance';
import { addNews } from './news';

export const MAX_STAFF = 6;
export type StaffAttr = keyof Staff['attributes'];
export const STAFF_ATTRS: StaffAttr[] = ['tactics', 'drafting', 'training', 'motivation', 'scouting', 'development'];
export const STAFF_ATTR_LABEL: Record<StaffAttr, string> = {
  tactics: 'Tactics', drafting: 'Drafting', training: 'Training', motivation: 'Motivation', scouting: 'Scouting', development: 'Development',
};

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; color: string; keys: StaffAttr[]; effect: string }> = {
  headCoach: {
    label: 'Head Coach', color: '#f0c674', keys: ['tactics', 'drafting'],
    effect: 'Runs the team. Tactics adds macro and teamfight on match day; Drafting sets champion-select quality (with the Analytics Lab). Training quality also drives weekly development. Only one per team.',
  },
  coach: {
    label: 'Coach', color: '#22c55e', keys: ['training', 'development'],
    effect: 'Runs scrims and individual sessions. Training and Development speed up weekly attribute growth, especially for young players.',
  },
  analyst: {
    label: 'Analyst', color: '#38bdf8', keys: ['drafting', 'scouting'],
    effect: 'VOD review and opponent prep. Drafting improves pick/ban plans; Scouting sharpens reports on opponents and transfer targets.',
  },
  psychologist: {
    label: 'Psychologist', color: '#a855f7', keys: ['motivation', 'development'],
    effect: 'Mental performance coach. Motivation keeps morale steady, reduces tilt and improves composure in big matches.',
  },
  scout: {
    label: 'Scout', color: '#fb923c', keys: ['scouting', 'development'],
    effect: 'Watches solo queue and academy leagues. Scouting increases the accuracy of hidden attributes and potential estimates.',
  },
};

const WEIGHTS: Record<StaffRole, Partial<Record<StaffAttr, number>>> = {
  headCoach: { tactics: 0.35, drafting: 0.3, motivation: 0.15, training: 0.1, development: 0.1 },
  coach: { training: 0.4, development: 0.3, motivation: 0.15, tactics: 0.15 },
  analyst: { drafting: 0.4, scouting: 0.35, tactics: 0.25 },
  psychologist: { motivation: 0.6, development: 0.25, training: 0.15 },
  scout: { scouting: 0.6, development: 0.25, drafting: 0.15 },
};

/** Role-weighted overall rating of a staff member (1..99). */
export function staffRating(s: Staff): number {
  const w = WEIGHTS[s.role] ?? WEIGHTS.coach;
  let total = 0, sum = 0;
  for (const k of STAFF_ATTRS) { const x = w[k] ?? 0; total += x; sum += s.attributes[k] * x; }
  return Math.round(sum / (total || 1));
}

const ROLE_PAY: Record<StaffRole, number> = { headCoach: 0.45, coach: 0.32, analyst: 0.28, psychologist: 0.24, scout: 0.2 };
const PAY_FLOOR: Record<number, number> = { 1: 30_000, 2: 10_000, 3: 4_000 };

/** Yearly salary a staff member asks from a team. */
export function staffSalaryDemand(state: GameState, s: Staff, team: Team): number {
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const base = salaryFor(staffRating(s), tier, team.leagueId, []) * (ROLE_PAY[s.role] ?? 0.3) * (0.9 + s.reputation / 500);
  return Math.max(PAY_FLOOR[tier] ?? 4_000, Math.round(base / 1000) * 1000);
}
export const signingFee = (salary: number) => Math.round((salary * 0.15) / 500) * 500;

/** Remaining contract value (USD) of a staff member. */
export function remainingContract(state: GameState, s: Staff) {
  if (!s.contract) return 0;
  const years = Math.max(0, (new Date(s.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5));
  return years * s.contract.salary;
}
export const firingCost = (state: GameState, s: Staff) => Math.round(remainingContract(state, s) * 0.5);

export function contractExpiry(date: string, years: number) {
  const y = Number(date.slice(0, 4));
  return `${y + years + (date.slice(5) > '11-18' ? 0 : -1)}-11-18`;
}

// ------------------------------------------------------------------ pool generation
export interface NameSet { country: string; first: string[]; last: string[]; order: 'family-first' | 'given-first' }
/** Name pools by country code (shared with generated free agents in freeAgents.ts). */
export const NAMES: Record<string, NameSet> = {
  KR: { country: 'South Korea', order: 'family-first', last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin'], first: ['Min-jun', 'Seo-jun', 'Do-hyun', 'Ji-ho', 'Hyun-woo', 'Jae-won', 'Sung-min', 'Tae-yang', 'Woo-jin', 'Dong-hyun', 'Ye-jun', 'Joon-ho', 'Sang-hyeok', 'Jin-seong'] },
  CN: { country: 'China', order: 'family-first', last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun'], first: ['Wei', 'Hao', 'Jun', 'Lei', 'Yu', 'Peng', 'Tao', 'Bo', 'Kai', 'Ming', 'Xuan', 'Zihan', 'Yifan', 'Haoran'] },
  TW: { country: 'Taiwan', order: 'family-first', last: ['Lin', 'Chen', 'Huang', 'Chang', 'Lee', 'Wang', 'Wu', 'Tsai'], first: ['Po-han', 'Yu-cheng', 'Chih-wei', 'Kuan-ting', 'Yi-hsuan', 'Tsung-han', 'Wei-lun'] },
  VN: { country: 'Vietnam', order: 'family-first', last: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do'], first: ['Minh Tuan', 'Quoc Bao', 'Thanh Long', 'Huu Phuoc', 'Van Duc', 'Duc Anh', 'Gia Huy', 'Hoang Nam'] },
  JP: { country: 'Japan', order: 'given-first', first: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Riku', 'Daiki', 'Kenta'], last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura'] },
  US: { country: 'United States', order: 'given-first', first: ['James', 'Ryan', 'Tyler', 'Jordan', 'Kevin', 'Brandon', 'Alex', 'Chris', 'Eric', 'Daniel', 'Marcus', 'Nick'], last: ['Smith', 'Johnson', 'Miller', 'Davis', 'Nguyen', 'Garcia', 'Walker', 'Park', 'Carter', 'Reed', 'Hughes', 'Bennett'] },
  CA: { country: 'Canada', order: 'given-first', first: ['Liam', 'Noah', 'Ethan', 'Owen', 'Lucas', 'Mathieu'], last: ['Tremblay', 'Martin', 'Roy', 'Wilson', 'MacDonald', 'Gagnon'] },
  DE: { country: 'Germany', order: 'given-first', first: ['Lukas', 'Jonas', 'Felix', 'Niklas', 'Tobias', 'Jan', 'Moritz'], last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Becker', 'Hoffmann'] },
  FR: { country: 'France', order: 'given-first', first: ['Lucas', 'Hugo', 'Théo', 'Maxime', 'Antoine', 'Julien', 'Louis'], last: ['Martin', 'Bernard', 'Dubois', 'Laurent', 'Moreau', 'Lefebvre', 'Girard'] },
  ES: { country: 'Spain', order: 'given-first', first: ['Pablo', 'Alejandro', 'Javier', 'Sergio', 'Adrián', 'Carlos', 'Álvaro'], last: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Navarro'] },
  DK: { country: 'Denmark', order: 'given-first', first: ['Mads', 'Rasmus', 'Mikkel', 'Frederik', 'Søren', 'Kasper', 'Emil'], last: ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Larsen', 'Sørensen'] },
  PL: { country: 'Poland', order: 'given-first', first: ['Jakub', 'Kacper', 'Mateusz', 'Piotr', 'Michał', 'Bartosz', 'Kamil'], last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński'] },
  SE: { country: 'Sweden', order: 'given-first', first: ['Erik', 'Oscar', 'Viktor', 'Gustav', 'Axel', 'Filip'], last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Lindqvist'] },
  TR: { country: 'Turkey', order: 'given-first', first: ['Emre', 'Burak', 'Mert', 'Can', 'Kaan', 'Arda'], last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın'] },
  GB: { country: 'United Kingdom', order: 'given-first', first: ['Oliver', 'Harry', 'George', 'Jack', 'Thomas', 'Callum'], last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Wright', 'Evans'] },
  BR: { country: 'Brazil', order: 'given-first', first: ['Gabriel', 'Lucas', 'Matheus', 'Rafael', 'Felipe', 'Bruno', 'Thiago', 'Vinícius'], last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira', 'Almeida', 'Lima'] },
  AR: { country: 'Argentina', order: 'given-first', first: ['Santiago', 'Mateo', 'Joaquín', 'Tomás', 'Nicolás'], last: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'Díaz'] },
  PT: { country: 'Portugal', order: 'given-first', first: ['João', 'Tiago', 'Diogo', 'Rui', 'Gonçalo', 'Miguel', 'Rodrigo'], last: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Carvalho', 'Rodrigues'] },
  IT: { country: 'Italy', order: 'given-first', first: ['Lorenzo', 'Matteo', 'Alessandro', 'Davide', 'Federico', 'Marco'], last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo'] },
  GR: { country: 'Greece', order: 'given-first', first: ['Giorgos', 'Nikos', 'Dimitris', 'Kostas', 'Yannis', 'Panagiotis'], last: ['Papadopoulos', 'Georgiou', 'Nikolaidis', 'Karagiannis', 'Pappas', 'Oikonomou'] },
  CZ: { country: 'Czech Republic', order: 'given-first', first: ['Jakub', 'Tomáš', 'Ondřej', 'Lukáš', 'Matěj', 'Vojtěch'], last: ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera'] },
  NL: { country: 'Netherlands', order: 'given-first', first: ['Daan', 'Sem', 'Thijs', 'Bram', 'Jesse', 'Ruben'], last: ['de Jong', 'Jansen', 'de Vries', 'Bakker', 'Visser', 'Smit'] },
  BE: { country: 'Belgium', order: 'given-first', first: ['Arthur', 'Louis', 'Wout', 'Jules', 'Victor', 'Milan'], last: ['Peeters', 'Janssens', 'Maes', 'Claes', 'Wouters', 'Dubois'] },
  RS: { country: 'Serbia', order: 'given-first', first: ['Luka', 'Nikola', 'Stefan', 'Marko', 'Filip', 'Aleksa'], last: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Ilić'] },
  RO: { country: 'Romania', order: 'given-first', first: ['Andrei', 'Alexandru', 'Ionuț', 'Mihai', 'Vlad', 'Răzvan'], last: ['Popescu', 'Ionescu', 'Popa', 'Dumitru', 'Stan', 'Munteanu'] },
  MX: { country: 'Mexico', order: 'given-first', first: ['Diego', 'Emiliano', 'Sebastián', 'Leonardo', 'Iván', 'Óscar'], last: ['Hernández', 'García', 'Martínez', 'López', 'Ramírez', 'Flores'] },
  CL: { country: 'Chile', order: 'given-first', first: ['Benjamín', 'Vicente', 'Martín', 'Agustín', 'Cristóbal'], last: ['Muñoz', 'Rojas', 'Díaz', 'Soto', 'Contreras', 'Araya'] },
  PE: { country: 'Peru', order: 'given-first', first: ['Renzo', 'Piero', 'Gonzalo', 'Jhon', 'Aldo'], last: ['Quispe', 'Flores', 'Mendoza', 'Vargas', 'Chávez', 'Ramos'] },
  PH: { country: 'Philippines', order: 'given-first', first: ['Paolo', 'Miguel', 'Carlo', 'Jericho', 'Mark', 'Angelo'], last: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza'] },
  TH: { country: 'Thailand', order: 'given-first', first: ['Thanawat', 'Kittipong', 'Nattapong', 'Pongsakorn', 'Siwakorn'], last: ['Srisuk', 'Wongsakul', 'Chaiyaphum', 'Rattanakorn', 'Kaewmanee'] },
  AU: { country: 'Australia', order: 'given-first', first: ['Jack', 'Lachlan', 'Cooper', 'Riley', 'Mitchell', 'Liam'], last: ['Smith', 'Wilson', 'Taylor', 'Kelly', "O'Brien", 'Campbell'] },
};
const REGION_POOL: Record<RegionId, string[]> = {
  KR: ['KR', 'KR', 'KR', 'KR'], CN: ['CN', 'CN', 'CN', 'KR'], EMEA: ['DE', 'FR', 'ES', 'DK', 'PL', 'SE', 'TR', 'GB'],
  NA: ['US', 'US', 'US', 'CA', 'KR'], APAC: ['VN', 'TW', 'JP', 'KR'], BR: ['BR', 'BR', 'BR', 'AR'],
};
const GLOBAL = ['KR', 'CN', 'US', 'DE', 'FR', 'DK', 'BR', 'VN', 'ES', 'PL', 'TW'];
const SYL = ['ka', 'zen', 'ryu', 'mo', 'lix', 'tar', 'vio', 'kai', 'ron', 'shi', 'xun', 'ji', 'dan', 'gio', 'sol', 'fen', 'nix', 'rae', 'vex', 'ozi', 'pyr', 'cel', 'hyo', 'min', 'tae', 'won', 'ark', 'mi', 'lo', 'ra', 'ven', 'dor'];

const ROLE_MIX: StaffRole[] = [
  'headCoach', 'headCoach', 'headCoach', 'headCoach', 'headCoach', 'headCoach',
  'coach', 'coach', 'coach', 'coach', 'coach', 'coach',
  'analyst', 'analyst', 'analyst', 'analyst', 'analyst',
  'psychologist', 'psychologist', 'psychologist', 'psychologist',
  'scout', 'scout', 'scout', 'scout',
];

function generatePool(state: GameState): Staff[] {
  const team = state.teams[state.userTeamId];
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const rng = new RNG(hashString(`${state.id}:staff:${state.season}`));
  const center = tier === 1 ? 61 : tier === 2 ? 53 : 47;
  const local = REGION_POOL[team.region] ?? GLOBAL;
  const used = new Set<string>();
  const out: Staff[] = [];
  ROLE_MIX.forEach((role, i) => {
    const code = rng.chance(0.65) ? rng.pick(local) : rng.pick(GLOBAL);
    const ns = NAMES[code] ?? NAMES.US;
    let handle = '';
    for (let tries = 0; tries < 8 && (!handle || used.has(handle)); tries++) {
      handle = (rng.pick(SYL) + rng.pick(SYL) + (rng.chance(0.25) ? rng.pick(SYL) : '')).replace(/^./, (c) => c.toUpperCase());
    }
    used.add(handle);
    const name = ns.order === 'family-first' ? `${rng.pick(ns.last)} ${rng.pick(ns.first)}` : `${rng.pick(ns.first)} ${rng.pick(ns.last)}`;
    // a couple of elite names, mostly mid-table, a few cheap projects
    const elite = rng.chance(0.12) ? rng.range(8, 16) : 0;
    const q = clamp(Math.round(rng.normal(center, 8) + elite), 30, 92);
    const keys = STAFF_ROLE_INFO[role].keys;
    const attrs = {} as Staff['attributes'];
    for (const k of STAFF_ATTRS) {
      const bias = keys[0] === k ? 8 : keys.includes(k) ? 5 : role === 'headCoach' && (k === 'motivation' || k === 'training') ? 0 : -9;
      attrs[k] = clamp(Math.round(q + bias + rng.normal(0, 6)), 12, 97);
    }
    const s: Staff = {
      id: `sm:${state.season}-${i}-${hashString(handle + name) % 9973}`,
      handle, name, country: ns.country, role, teamId: null, attributes: attrs, contract: null,
      reputation: clamp(Math.round(q + rng.normal(-4, 8)), 1, 100),
    };
    out.push(s);
  });
  return out;
}

interface MarketStore { season: number; generatedOn: string; pool: Staff[] }
type WithMarket = GameState & { staffMarket?: MarketStore };

function market(state: GameState): MarketStore {
  const s = state as WithMarket;
  if (!s.staffMarket || s.staffMarket.season !== state.season) {
    s.staffMarket = { season: state.season, generatedOn: state.date, pool: generatePool(state) };
  }
  return s.staffMarket;
}

/** All staff available to hire: this season's generated pool plus anyone released (teamId null). */
export function staffMarket(state: GameState): Staff[] {
  const m = market(state);
  const ids = new Set(m.pool.map((s) => s.id));
  const released = Object.values(state.staff).filter((s) => s && s.teamId === null && !ids.has(s.id));
  return [...m.pool, ...released];
}

/** Every staff member in the world: employed / released (state.staff) plus this season's market candidates. */
export function allStaff(state: GameState): Staff[] {
  return [...Object.values(state.staff).filter(Boolean), ...market(state).pool.filter((s) => !state.staff[s.id])];
}
export const findStaff = (state: GameState, id: string): Staff | undefined => state.staff[id] ?? market(state).pool.find((s) => s.id === id);

/** Move a market candidate into state.staff (editor edits), so changes survive the next season's pool refresh. */
export function adoptPoolStaff(state: GameState, s: Staff) {
  const m = market(state);
  m.pool = m.pool.filter((x) => x.id !== s.id);
  state.staff[s.id] = s;
}

export interface StaffResult { ok: boolean; message: string }

export function hireStaff(state: GameState, staffId: string, years: number): StaffResult {
  const team = state.teams[state.userTeamId];
  const m = market(state);
  const s = m.pool.find((x) => x.id === staffId) ?? (state.staff[staffId]?.teamId === null ? state.staff[staffId] : undefined);
  if (!s) return { ok: false, message: 'That candidate is no longer available.' };
  if (team.staff.length >= MAX_STAFF) return { ok: false, message: `Staff limit reached (${MAX_STAFF}). Release someone first.` };
  if (s.role === 'headCoach' && team.staff.some((id) => state.staff[id]?.role === 'headCoach')) {
    return { ok: false, message: 'You already have a head coach. Release them before appointing a new one.' };
  }
  const salary = staffSalaryDemand(state, s, team);
  const fee = signingFee(salary);
  if (team.balance < fee) return { ok: false, message: 'Not enough money to cover the signing fee.' };
  m.pool = m.pool.filter((x) => x.id !== s.id);
  s.teamId = team.id;
  s.contract = { salary, expires: contractExpiry(state.date, Math.max(1, Math.min(3, years))), buyout: 0, signedOn: state.date };
  state.staff[s.id] = s;
  team.staff.push(s.id);
  addLedger(state, team, 'Staff signing fees', -fee, s.handle);
  const label = STAFF_ROLE_INFO[s.role].label.toLowerCase();
  addNews(state, {
    headline: `${team.short} appoint ${s.handle} as ${label}`,
    body: `${team.name} have hired ${s.name} ("${s.handle}") from ${s.country} as ${label} on a deal running until ${s.contract.expires}.`,
    tags: ['staff'], teamIds: [team.id],
  });
  return { ok: true, message: `${s.handle} joins as ${label} ($${Math.round(salary / 1000)}k/yr).` };
}

export function fireStaff(state: GameState, staffId: string): StaffResult {
  const team = state.teams[state.userTeamId];
  const s = state.staff[staffId];
  if (!s || s.teamId !== team.id) return { ok: false, message: 'Not a member of your staff.' };
  const cost = firingCost(state, s);
  if (cost) addLedger(state, team, 'Contract termination', -cost, s.handle);
  team.staff = team.staff.filter((id) => id !== s.id);
  s.teamId = null;
  s.contract = null;
  return { ok: true, message: `${s.handle} released${cost ? ` (severance $${Math.round(cost / 1000)}k)` : ''}.` };
}
