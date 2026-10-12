// New game creation: converts the static database (real 2026 rosters) into a GameState.
import type { GameState, Player, Team, Staff, LeagueDef, Role, PlayerAttributes, HiddenAttributes, FacilityKey, TeamTactics, SponsorDeal, MerchProduct, RealStats } from './types';
import { ensureMasteryScale } from './mastery';
import { ROLES } from './types';
import { RNG, clamp, hashString } from '../util/rng';
import { createSeason } from './season/season';
import { sponsorPool } from './management/sponsors';
import { defaultMerch } from './management/merch';
import { initReactions } from './management/reactions';
import { ensurePersonas } from './management/persona';
import { traitSalaryMult } from './management/traitEffects';

export interface DbPlayer {
  id: string; link: string; handle: string; name: string; nativeName?: string; country: string; birthdate?: string;
  role: Role; teamId: string; isSub: boolean; imageFile?: string; imageUrl?: string;
  attributes: PlayerAttributes; hidden: HiddenAttributes; traits: string[]; champions: Record<string, number>; playstyle: string[];
  realStats?: RealStats; streamer?: boolean;
}
export interface DbTeam {
  id: string; name: string; short: string; page: string; leagueId: string; region: string; country: string;
  logoFile?: string; logoUrl?: string; elo: number; rating: number; realRecord: { wins: number; losses: number; games: number };
  roster: string[]; lineup: Partial<Record<Role, string>>; staff: string[];
}
export interface DbStaff { id: string; handle: string; name: string; country: string; teamId: string; role: 'headCoach' | 'coach'; attributes: Staff['attributes'] }
export interface Database { leagues: (LeagueDef & { source?: string })[]; teams: DbTeam[]; players: DbPlayer[]; staff: DbStaff[] }

export const START_DATE = '2026-01-02';
export const SEASON_YEAR = 2026;

export function overall(a: PlayerAttributes, role: Role): number {
  const w: Record<Role, Partial<Record<keyof PlayerAttributes, number>>> = {
    top: { mechanics: 0.22, laning: 0.22, teamfight: 0.16, farming: 0.12, macro: 0.12, consistency: 0.08, vision: 0.04, objectives: 0.04 },
    jungle: { pathing: 0.2, objectives: 0.15, macro: 0.17, mechanics: 0.15, teamfight: 0.13, vision: 0.1, farming: 0.05, consistency: 0.05 },
    mid: { mechanics: 0.24, laning: 0.2, teamfight: 0.15, macro: 0.14, farming: 0.1, consistency: 0.07, pathing: 0.05, vision: 0.05 },
    adc: { mechanics: 0.24, teamfight: 0.22, farming: 0.16, laning: 0.16, consistency: 0.1, macro: 0.08, vision: 0.04 },
    support: { vision: 0.18, teamfight: 0.18, macro: 0.16, laning: 0.12, mechanics: 0.12, pathing: 0.1, shotcalling: 0.08, consistency: 0.06 },
  };
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(w[role])) { s += a[k as keyof PlayerAttributes] * v!; t += v!; }
  return Math.round(s / t);
}

export const LEAGUE_ECON: Record<number, { salary: number; budget: number; fans: number; sponsor: number }> = {
  1: { salary: 3.2, budget: 9_000_000, fans: 1_200_000, sponsor: 260_000 },
  2: { salary: 0.55, budget: 1_200_000, fans: 120_000, sponsor: 30_000 },
  3: { salary: 0.18, budget: 250_000, fans: 15_000, sponsor: 6_000 },
};
const LEAGUE_MULT: Record<string, number> = { LCK: 1.1, LPL: 1.25, LEC: 0.7, LCS: 0.75, LCP: 0.35, CBLOL: 0.32 };

export function salaryFor(ovr: number, tier: number, leagueId: string, traits: string[]): number {
  const base = 16_000 * Math.pow(1.068, ovr - 40);
  const mult = tier === 1 ? LEAGUE_ECON[1].salary * (LEAGUE_MULT[leagueId] ?? 0.5) : LEAGUE_ECON[tier]?.salary ?? 0.2;
  let s = base * mult;
  if (traits.includes('fan_favorite')) s *= 2.2;
  s *= traitSalaryMult(traits); // Mercenary, Brand Ambassador…
  return Math.round(s / 1000) * 1000;
}

export function marketValue(p: Pick<Player, 'attributes' | 'role' | 'hidden' | 'birthdate' | 'reputation'>, date: string): number {
  const ovr = overall(p.attributes, p.role);
  const age = ageOn(p.birthdate, date) ?? 22;
  const pot = p.hidden.potential;
  const youth = age < 22 ? (pot - ovr) * 0.04 : 0;
  const ageMult = age < 19 ? 1.1 : age < 25 ? 1 : age < 28 ? 0.85 : 0.6;
  return Math.round((60_000 * Math.pow(1.075, ovr - 40) * (1 + youth) * ageMult * (1 + p.reputation / 200)) / 5000) * 5000;
}

export function ageOn(birth: string | undefined, date: string): number | null {
  if (!birth) return null;
  return (new Date(date).getTime() - new Date(birth).getTime()) / (365.25 * 864e5);
}

const COLOR_POOL: [string, string][] = [['#e11d48', '#111827'], ['#2563eb', '#f8fafc'], ['#eab308', '#111827'], ['#16a34a', '#f0fdf4'], ['#9333ea', '#faf5ff'], ['#f97316', '#1c1917'], ['#0ea5e9', '#0c4a6e'], ['#dc2626', '#fef2f2'], ['#14b8a6', '#042f2e'], ['#a3a3a3', '#0a0a0a'], ['#db2777', '#fdf2f8'], ['#65a30d', '#1a2e05']];
const KNOWN_COLORS: Record<string, [string, string]> = {
  T1: ['#e2012d', '#0a0a0a'], 'Gen.G': ['#aa8a00', '#000000'], 'Hanwha Life Esports': ['#f37321', '#1b1b1b'], 'Dplus Kia': ['#00c2b3', '#0a1d26'], 'KT Rolster': ['#ff0a07', '#1f1f1f'],
  'Bilibili Gaming': ['#00a1d6', '#ffffff'], 'Top Esports': ['#ff6a00', '#0c0c0c'], 'JD Gaming': ['#c8102e', '#ffffff'], 'G2 Esports': ['#f2f2f2', '#e2001a'], 'Fnatic': ['#ff5900', '#0b0b0b'],
  'Team Liquid': ['#0a2840', '#9fe7ff'], 'FlyQuest': ['#1f8a3b', '#0b2d12'], 'Cloud9': ['#00aeef', '#ffffff'], 'Karmine Corp': ['#00b4e5', '#0b1724'], 'Movistar KOI': ['#5b2c83', '#ffffff'],
};

function teamColors(name: string): [string, string] {
  if (KNOWN_COLORS[name]) return KNOWN_COLORS[name];
  return COLOR_POOL[hashString(name) % COLOR_POOL.length];
}

export const DEFAULT_TACTICS: TeamTactics = { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'auto', playstyle: 'balanced', invadeLevel1: false, visionFocus: 55 };

export function createNewGame(db: Database, userTeamId: string, managerName: string, seed = Date.now() >>> 0): GameState {
  const rng = new RNG(seed);
  const leagues: Record<string, LeagueDef> = {};
  for (const l of db.leagues) leagues[l.id] = { id: l.id, name: l.name, fullName: l.fullName, tier: l.tier, region: l.region, country: l.country, franchised: l.franchised, parent: l.parent };
  const players: Record<string, Player> = {};
  const teams: Record<string, Team> = {};
  const staff: Record<string, Staff> = {};
  const date = START_DATE;

  for (const p of db.players) {
    const team = db.teams.find((t) => t.id === p.teamId);
    const league = team ? leagues[team.leagueId] : undefined;
    const tier = league?.tier ?? 3;
    const ovr = overall(p.attributes, p.role);
    const reputation = clamp(Math.round((ovr - 30) * 1.25 + (tier === 1 ? 10 : tier === 2 ? 0 : -10) + (p.traits.includes('fan_favorite') ? 25 : 0) + (p.traits.includes('veteran') ? 5 : 0)), 1, 100);
    const years = rng.pick([1, 1, 2, 2, 3]);
    const pl: Player = {
      id: p.id, handle: p.handle, name: p.name, nativeName: p.nativeName, country: p.country, birthdate: p.birthdate, role: p.role,
      teamId: p.teamId, image: p.imageUrl ?? undefined, imageUrl: p.imageUrl, attributes: { ...p.attributes }, hidden: { ...p.hidden }, traits: [...p.traits],
      champions: { ...p.champions }, playstyle: p.playstyle, morale: 68 + rng.int(-8, 12), form: 0, fatigue: 10,
      contract: { salary: salaryFor(ovr, tier, team?.leagueId ?? '', p.traits), expires: `${SEASON_YEAR + years - 1}-11-18`, buyout: 0, signedOn: '2025-11-20' },
      reputation, value: 0, season: emptySeasonStats(), history: [], realStats: p.realStats,
      career: [], personality: { professionalism: p.hidden.professionalism, ambition: clamp(p.hidden.ego + 10, 1, 99), loyalty: p.hidden.loyalty, temperament: clamp(100 - p.hidden.composure, 1, 99) },
      isSub: p.isSub, streamer: p.streamer, trainingFocus: null, learningChampion: null,
    };
    pl.value = marketValue(pl, date);
    pl.contract!.buyout = Math.round(pl.value * (1.2 + rng.next() * 0.8) / 10000) * 10000;
    players[pl.id] = pl;
  }

  // academy links: LCK CL / LCK AS team names that start with an LCK org name
  const lckOrgs = db.teams.filter((t) => t.leagueId === 'LCK');
  for (const t of db.teams) {
    const league = leagues[t.leagueId];
    const tier = league?.tier ?? 3;
    const econ = LEAGUE_ECON[tier];
    const strength = clamp((t.rating - 30) / 55, 0, 1.2);
    const winRate = t.realRecord.games ? t.realRecord.wins / t.realRecord.games : 0.5;
    const fame = (tier === 1 ? LEAGUE_MULT[t.leagueId] ?? 0.6 : 1) * (0.4 + strength) * (0.7 + winRate * 0.6);
    let fans = Math.round(econ.fans * fame * (0.7 + rng.next() * 0.6));
    if (t.name === 'T1') fans *= 3;
    const fac = (base: number) => clamp(Math.round(base + rng.next() * 1.4 - 0.4), 0, 5);
    const facBase = tier === 1 ? 2.2 + strength : tier === 2 ? 1 + strength * 0.6 : 0.3;
    const facilities: Record<FacilityKey, number> = { gamingHouse: fac(facBase), trainingFacility: fac(facBase), analyticsLab: fac(facBase - 0.3), contentStudio: fac(facBase - 0.2), wellness: fac(facBase - 0.4), academy: fac(facBase - 0.5) };
    const roster = t.roster.filter((id) => players[id]);
    const lineup = {} as Record<Role, string | null>;
    for (const r of ROLES) lineup[r] = t.lineup[r] && players[t.lineup[r]!] ? t.lineup[r]! : roster.find((id) => players[id].role === r) ?? null;
    const team: Team = {
      id: t.id, name: t.name, short: t.short, leagueId: t.leagueId, region: (league?.region ?? 'EMEA') as Team['region'], country: t.country,
      logo: t.logoUrl ?? undefined, colors: teamColors(t.name), roster, lineup, staff: [],
      balance: Math.round(econ.budget * (0.35 + strength * 0.5) * (0.8 + rng.next() * 0.4)), ledger: [], monthly: [],
      fans, hype: 50, prestige: clamp(Math.round(t.rating * 0.9 + (tier === 1 ? 10 : 0) + (winRate - 0.5) * 20), 5, 99),
      facilities, sponsors: [], merch: defaultMerch(tier, rng), franchise: !!league?.franchised,
      tactics: { ...DEFAULT_TACTICS }, chemistry: clamp(60 + rng.int(-10, 15), 30, 95), history: [], titles: [],
      realRecord: t.realRecord, ticketPrice: tier === 1 ? 35 : tier === 2 ? 15 : 5, aiBudget: 0.8 + rng.next() * 0.5,
    };
    // starting sponsors
    const pool = sponsorPool();
    const nSponsors = tier === 1 ? 3 + rng.int(0, 2) : tier === 2 ? 1 + rng.int(0, 1) : rng.int(0, 1);
    for (let i = 0; i < nSponsors; i++) {
      const sp = pool[(hashString(t.id) + i * 7) % pool.length];
      const deal: SponsorDeal = {
        id: `${t.id}-sp${i}`, sponsorId: sp.id, name: sp.name, category: sp.category, tier: sp.tier,
        monthly: Math.round(econ.sponsor * sp.tier * (0.5 + strength) * (0.6 + rng.next() * 0.5) / 4 / 500) * 500,
        startDate: '2025-12-01', endDate: `${SEASON_YEAR + rng.int(0, 1)}-12-31`, logoColor: sp.color,
      };
      team.sponsors.push(deal);
    }
    if (tier === 2 || tier === 3) {
      const parent = lckOrgs.find((o) => t.name.startsWith(o.name.split(' ')[0]) && o.name.split(' ')[0].length > 1);
      if (parent && (t.leagueId === 'LCKCL' || t.leagueId === 'LCKAS')) { team.parentTeamId = parent.id; }
    }
    teams[team.id] = team;
  }
  // other regions: "X Academy" / "X Youth" in a lower tier belongs to the tier-1 team "X …" of the same region
  for (const t of Object.values(teams)) {
    if (t.parentTeamId || !/\s+(Academy|Youth|Challengers|Rookies)$/i.test(t.name) || (leagues[t.leagueId]?.tier ?? 1) === 1) continue;
    const root = t.name.replace(/\s+(Academy|Youth|Challengers|Rookies)$/i, '').trim().toLowerCase();
    const parent = Object.values(teams).find((p) => p.region === t.region && leagues[p.leagueId]?.tier === 1 && (p.name.toLowerCase() === root || p.name.toLowerCase().startsWith(root + ' ')));
    if (parent) t.parentTeamId = parent.id;
  }
  for (const t of Object.values(teams)) if (t.parentTeamId && teams[t.parentTeamId] && t.leagueId === 'LCKCL') teams[t.parentTeamId].academyTeamId = t.id;

  for (const s of db.staff) {
    const team = teams[s.teamId];
    if (!team) continue;
    const st: Staff = {
      id: s.id, handle: s.handle, name: s.name, country: s.country, role: s.role, teamId: s.teamId, attributes: { ...s.attributes },
      contract: { salary: Math.round(salaryFor(Math.round((s.attributes.tactics + s.attributes.drafting) / 2), leagues[team.leagueId]?.tier ?? 3, team.leagueId, []) * 0.45 / 1000) * 1000, expires: `${SEASON_YEAR + rng.int(0, 1)}-11-18`, buyout: 0, signedOn: '2025-11-20' },
      reputation: clamp(Math.round((s.attributes.tactics + s.attributes.drafting) / 2), 1, 100),
    };
    staff[st.id] = st;
    team.staff.push(st.id);
  }

  const state: GameState = {
    version: 1, id: `save_${Date.now().toString(36)}`, saveName: `${teams[userTeamId]?.name ?? 'Team'} ${SEASON_YEAR}`,
    manager: { name: managerName, nationality: 'Unknown', reputation: 40 }, createdAt: Date.now(), date, season: SEASON_YEAR, userTeamId,
    players, teams, staff, leagues, competitions: {}, fixtures: {}, inbox: [], news: [], transferOffers: [], sponsorOffers: [],
    board: { confidence: 70, objectives: [], budgetMultiplier: 1 }, championPower: {}, patch: '26.1', rngState: rng.state,
    settings: { simDetail: 'mine', autoSave: true, matchSpeed: 4, showFog: false }, history: [], scoutedPlayers: {}, pendingMatch: null,
    transferWindowOpen: true, log: [], qualified: {}, seq: 1,
  };
  ensureMasteryScale(state); // champion comfort onto the 0..200 scale (engine/mastery.ts)
  ensurePersonas(state); // personal profiles + extended traits (management/persona.ts)
  createSeason(state, SEASON_YEAR);
  initReactions(state); // fan pulse + owner persona
  return state;
}

export function emptySeasonStats() {
  return { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0, minutes: 0, mvps: 0, champions: {} };
}
