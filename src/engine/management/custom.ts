// Custom content: create / edit players, teams and staff, team replacement, and the cross-career library.
import type { GameState, Player, Team, Role, PlayerAttributes, HiddenAttributes, FacilityKey, Competition, Staff, StaffRole, PlayerPersona } from '../types';
import { ROLES } from '../types';
import { overall, marketValue, salaryFor, emptySeasonStats, DEFAULT_TACTICS } from '../setup';
import { defaultMerch } from './merch';
import { movePlayer, autoFillLineup } from './transfers';
import { MAX_STAFF, staffRating, staffSalaryDemand, adoptPoolStaff } from './staffMarket';
import { RNG, clamp, hashString } from '../../util/rng';
import { noteEdit } from './buzzCore';
import { RATING_MAX, marketDrift } from '../ratings';
import { setFans } from './fanbase';

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'x';

export function uniquePlayerId(state: GameState, handle: string) {
  const base = `custom:${slugify(handle)}`;
  let n = 1;
  while (state.players[`${base}-${n}`]) n++;
  return `${base}-${n}`;
}
export function uniqueTeamId(state: GameState, name: string) {
  const base = `custom-team-${slugify(name)}`;
  if (!state.teams[base]) return base;
  let n = 2;
  while (state.teams[`${base}-${n}`]) n++;
  return `${base}-${n}`;
}

/** Contract expiry (Nov 18) after `years` seasons, same convention as transfers.movePlayer. */
export function contractExpiry(date: string, years: number) {
  return `${new Date(date).getUTCFullYear() + years + (date.slice(5) > '11-18' ? 0 : -1)}-11-18`;
}

const tierOfTeam = (state: GameState, teamId: string | null) => (teamId && state.teams[teamId] ? state.leagues[state.teams[teamId].leagueId]?.tier ?? 3 : 3);

export function autoReputation(state: GameState, attributes: PlayerAttributes, role: Role, teamId: string | null, traits: string[]) {
  const ovr = overall(attributes, role);
  const tier = tierOfTeam(state, teamId);
  return clamp(Math.round((ovr - 30) * 1.25 + (tier === 1 ? 10 : tier === 2 ? 0 : -10) + (traits.includes('fan_favorite') ? 25 : 0) + (traits.includes('veteran') ? 5 : 0)), 1, 100);
}

export function suggestedSalary(state: GameState, attributes: PlayerAttributes, role: Role, teamId: string | null, traits: string[]) {
  if (!teamId || !state.teams[teamId]) return 0;
  const t = state.teams[teamId];
  return salaryFor(overall(attributes, role), state.leagues[t.leagueId]?.tier ?? 3, t.leagueId, traits, marketDrift(state));
}

// ------------------------------------------------------------------ players
export interface PlayerDraft {
  handle: string; name: string; nativeName: string; country: string; birthdate: string; role: Role; secondaryRoles: Role[];
  attributes: PlayerAttributes; hidden: HiddenAttributes; traits: string[]; champions: Record<string, number>;
  image?: string; reputation: number | null; streamer: boolean;
  /** personal profile (height, looks, humor…); undefined = generate it (management/persona.ts) */
  persona?: PlayerPersona;
  teamId: string | null; salary: number; years: number;
  /** contract fields were edited (otherwise an unchanged team keeps its current contract) */
  contractDirty?: boolean;
}

export function blankPlayerDraft(state: GameState): PlayerDraft {
  const v = 60;
  const year = Number(state.date.slice(0, 4));
  return {
    handle: '', name: '', nativeName: '', country: 'South Korea', birthdate: `${year - 19}-06-15`, role: 'mid', secondaryRoles: [],
    attributes: { mechanics: v, laning: v, farming: v, teamfight: v, macro: v, vision: v, pathing: v, objectives: v, shotcalling: v, consistency: v, clutch: v, adaptability: v, aggression: 55 },
    hidden: { potential: 75, farsight: 50, mistakes: 45, composure: 55, snowball: 50, resilience: 50, workEthic: 60, professionalism: 60, ego: 45, loyalty: 55, injuryProne: 15 },
    traits: [], champions: {}, image: undefined, reputation: null, streamer: false, teamId: null, salary: 0, years: 2,
  };
}

export function draftFromPlayer(state: GameState, p: Player): PlayerDraft {
  const yearsLeft = p.contract ? Math.max(1, Math.min(3, Math.round((new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)))) : 2;
  return {
    handle: p.handle, name: p.name, nativeName: p.nativeName ?? '', country: p.country, birthdate: p.birthdate ?? '', role: p.role, secondaryRoles: [...(p.secondaryRoles ?? [])],
    attributes: { ...p.attributes }, hidden: { ...p.hidden }, traits: [...p.traits], champions: { ...p.champions },
    image: p.image ?? p.imageUrl, reputation: p.reputation, streamer: !!p.streamer, persona: p.persona ? { ...p.persona } : undefined,
    teamId: p.teamId, salary: p.contract?.salary ?? 0, years: yearsLeft,
  };
}

function personalityOf(h: HiddenAttributes) {
  return { professionalism: h.professionalism, ambition: clamp(h.ego + 10, 1, 99), loyalty: h.loyalty, temperament: clamp(100 - h.composure, 1, 99) };
}

export function createCustomPlayer(state: GameState, d: PlayerDraft): Player {
  const id = uniquePlayerId(state, d.handle || 'player');
  const p: Player = {
    id, handle: d.handle.trim() || 'Rookie', name: d.name.trim() || d.handle.trim() || 'Unknown', nativeName: d.nativeName.trim() || undefined,
    country: d.country, birthdate: d.birthdate || undefined, role: d.role, secondaryRoles: d.secondaryRoles.length ? [...d.secondaryRoles] : undefined,
    teamId: null, image: d.image, attributes: { ...d.attributes }, hidden: { ...d.hidden }, traits: [...d.traits], champions: { ...d.champions },
    playstyle: [], morale: 70, form: 0, fatigue: 0, contract: null,
    reputation: d.reputation ?? autoReputation(state, d.attributes, d.role, d.teamId, d.traits), value: 0,
    season: emptySeasonStats(), history: [], career: [], personality: personalityOf(d.hidden),
    isCustom: true, streamer: d.streamer || undefined, trainingFocus: null, learningChampion: null, masteryScale: 200, ratingScale: RATING_MAX,
  };
  p.value = marketValue(p, state.date, marketDrift(state));
  if (d.persona) p.persona = { ...d.persona };
  state.players[id] = p;
  const team = d.teamId ? state.teams[d.teamId] : null;
  if (team) movePlayer(state, p, team, Math.max(0, Math.round(d.salary)), clamp(d.years, 1, 3));
  p.morale = 70;
  state.scoutedPlayers[id] = 100; // you created them: fully known
  noteEdit(state, 'player', id, true); // fans will wonder who this is
  return p;
}

/** Apply a draft to an existing (real or custom) player in place. */
export function applyPlayerDraft(state: GameState, p: Player, d: PlayerDraft) {
  noteEdit(state, 'player', p.id); // the "before" picture, for the fans' self-aware reactions
  p.handle = d.handle.trim() || p.handle;
  p.name = d.name.trim() || p.name;
  p.nativeName = d.nativeName.trim() || undefined;
  p.country = d.country;
  p.birthdate = d.birthdate || undefined;
  p.role = d.role;
  p.secondaryRoles = d.secondaryRoles.length ? [...d.secondaryRoles] : undefined;
  p.attributes = { ...d.attributes };
  p.hidden = { ...d.hidden };
  p.traits = [...d.traits];
  p.champions = { ...d.champions };
  p.masteryScale = 200;
  p.ratingScale = RATING_MAX; // the potential set in the editor is already on the 0..200 scale
  p.streamer = d.streamer || undefined;
  if (d.persona) p.persona = { ...d.persona };
  if (!d.image) { p.image = undefined; p.imageUrl = undefined; } // portrait removed
  else if (d.image !== (p.image ?? p.imageUrl)) p.image = d.image;
  p.personality = personalityOf(d.hidden);
  if (d.reputation !== null) p.reputation = clamp(Math.round(d.reputation), 1, 100);
  const newTeam = d.teamId ? state.teams[d.teamId] ?? null : null;
  if ((newTeam?.id ?? null) !== p.teamId) {
    movePlayer(state, p, newTeam, Math.max(0, Math.round(d.salary)), clamp(d.years, 1, 3));
  } else if (newTeam && (d.contractDirty || !p.contract)) {
    const salary = Math.max(0, Math.round(d.salary));
    const expires = contractExpiry(state.date, clamp(d.years, 1, 3));
    p.contract = { salary, expires, buyout: p.contract?.buyout || Math.round((p.value * 1.6) / 10000) * 10000, signedOn: p.contract?.signedOn ?? state.date };
  }
  p.value = marketValue(p, state.date, marketDrift(state));
}

/** Remove a custom player. Players with match records are retired instead, so history stays consistent. */
export function deleteCustomPlayer(state: GameState, id: string): { ok: boolean; message: string } {
  const p = state.players[id];
  if (!p) return { ok: false, message: 'Player not found.' };
  if (p.teamId) movePlayer(state, p, null, 0, 0);
  const s = state as GameState & { shortlist?: string[] };
  if (s.shortlist) s.shortlist = s.shortlist.filter((x) => x !== id);
  for (const o of state.transferOffers) if (o.playerId === id && o.status === 'pending') o.status = 'withdrawn';
  const played = p.season.games > 0 || p.history.length > 0 || p.career.length > 0 || Object.values(state.fixtures).some((f) => f.result?.games.some((g) => g.players?.some((l) => l.playerId === id)));
  if (played) { p.retired = true; return { ok: true, message: `${p.handle} has match records and was retired instead of deleted.` }; }
  delete state.players[id];
  delete state.scoutedPlayers[id];
  return { ok: true, message: `${p.handle} deleted.` };
}

// ------------------------------------------------------------------ teams
export interface TeamDraft {
  name: string; short: string; colors: [string, string]; logo?: string; country: string; leagueId: string;
  balance: number; fans: number; prestige: number; hype: number; facilities: Record<FacilityKey, number>;
  mode: 'add' | 'replace'; replaceId: string; inheritStaff: boolean;
  roster: { playerId: string; salary: number; years: number; dirty?: boolean }[];
}

export const FACILITY_KEYS: FacilityKey[] = ['gamingHouse', 'trainingFacility', 'analyticsLab', 'contentStudio', 'wellness', 'academy'];

export function blankTeamDraft(state: GameState): TeamDraft {
  const league = state.teams[state.userTeamId]?.leagueId ?? Object.keys(state.leagues)[0];
  return {
    name: '', short: '', colors: ['#0ac8b9', '#0b1220'], logo: undefined, country: state.leagues[league]?.country ?? '', leagueId: league,
    balance: 1_500_000, fans: 80_000, prestige: 45, hype: 50,
    facilities: { gamingHouse: 1, trainingFacility: 1, analyticsLab: 1, contentStudio: 1, wellness: 1, academy: 0 },
    mode: 'add', replaceId: '', inheritStaff: true, roster: [],
  };
}

export function draftFromTeam(state: GameState, t: Team): TeamDraft {
  return {
    name: t.name, short: t.short, colors: [...t.colors] as [string, string], logo: t.logo, country: t.country ?? '', leagueId: t.leagueId,
    balance: Math.round(t.balance), fans: t.fans, prestige: t.prestige, hype: t.hype, facilities: { ...t.facilities },
    mode: 'add', replaceId: '', inheritStaff: true,
    roster: t.roster.filter((id) => state.players[id]).map((id) => {
      const p = state.players[id];
      const years = p.contract ? Math.max(1, Math.min(3, Math.round((new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)))) : 2;
      return { playerId: id, salary: p.contract?.salary ?? 0, years };
    }),
  };
}

/** Replace every reference to team `oldId` with `newId` (competitions, fixtures, qualification, offers, news, links). */
export function substituteTeamId(state: GameState, oldId: string, newId: string) {
  const sub = (x: string) => (x === oldId ? newId : x);
  const subKey = (rec: Record<string, number> | undefined) => { if (rec && oldId in rec) { rec[newId] = rec[oldId]; delete rec[oldId]; } };
  for (const c of Object.values(state.competitions) as (Competition & { direct?: Record<string, string[]> })[]) {
    c.teams = c.teams.map(sub);
    if (c.winner) c.winner = sub(c.winner);
    subKey(c.placements); subKey(c.points);
    if (c.direct) for (const k of Object.keys(c.direct)) c.direct[k] = c.direct[k].map(sub);
    for (const s of c.stages) {
      s.teams = s.teams.map(sub);
      if (s.groups) for (const g of Object.keys(s.groups)) s.groups[g] = s.groups[g].map(sub);
      if (s.results) s.results = s.results.map(sub);
    }
  }
  for (const f of Object.values(state.fixtures)) {
    if (f.teamA) f.teamA = sub(f.teamA);
    if (f.teamB) f.teamB = sub(f.teamB);
    if (f.result) {
      f.result.winner = sub(f.result.winner); f.result.loser = sub(f.result.loser);
      for (const g of f.result.games) { g.blue = sub(g.blue); g.red = sub(g.red); g.winner = sub(g.winner); for (const l of g.players ?? []) l.teamId = sub(l.teamId); }
    }
  }
  for (const k of Object.keys(state.qualified ?? {})) state.qualified[k] = state.qualified[k].map((q) => ({ ...q, teamId: sub(q.teamId) }));
  for (const o of state.transferOffers) { if (o.fromTeamId) o.fromTeamId = sub(o.fromTeamId); o.toTeamId = sub(o.toTeamId); }
  for (const n of state.news) if (n.teamIds) n.teamIds = n.teamIds.map(sub);
  for (const t of Object.values(state.teams)) { if (t.academyTeamId === oldId) t.academyTeamId = newId; if (t.parentTeamId === oldId) t.parentTeamId = newId; }
  const promos = (state as GameState & { promotions?: { promote: string; relegate?: string }[] }).promotions;
  if (Array.isArray(promos)) for (const pr of promos) { pr.promote = sub(pr.promote); if (pr.relegate) pr.relegate = sub(pr.relegate); }
  if (state.userTeamId === oldId) state.userTeamId = newId;
}

function syncRoster(state: GameState, team: Team, roster: TeamDraft['roster']) {
  const want = new Set(roster.map((r) => r.playerId));
  for (const id of [...team.roster]) {
    if (!want.has(id) && state.players[id]) movePlayer(state, state.players[id], null, 0, 0);
  }
  for (const r of roster) {
    const p = state.players[r.playerId];
    if (!p) continue;
    if (p.teamId !== team.id) movePlayer(state, p, team, Math.max(0, Math.round(r.salary)), clamp(r.years, 1, 3));
    else if (r.dirty || !p.contract) p.contract = { salary: Math.max(0, Math.round(r.salary)), expires: contractExpiry(state.date, clamp(r.years, 1, 3)), buyout: p.contract?.buyout || Math.round((p.value * 1.6) / 10000) * 10000, signedOn: p.contract?.signedOn ?? state.date };
    p.isSub = false;
  }
  autoFillLineup(state, team);
  for (const id of team.roster) { const p = state.players[id]; if (p) p.isSub = !Object.values(team.lineup).includes(id); }
}

export function createCustomTeam(state: GameState, d: TeamDraft): { team: Team; replaced?: string } {
  const league = state.leagues[d.leagueId];
  const tier = league?.tier ?? 3;
  const id = uniqueTeamId(state, d.name || 'team');
  const rng = new RNG(hashString(id + state.date));
  const lineup = {} as Record<Role, string | null>;
  for (const r of ROLES) lineup[r] = null;
  const team: Team = {
    id, name: d.name.trim() || 'Custom Team', short: (d.short.trim() || d.name.trim().slice(0, 3) || 'CUS').toUpperCase().slice(0, 5), leagueId: d.leagueId,
    region: league?.region ?? 'EMEA', country: d.country || league?.country, logo: d.logo, colors: [...d.colors] as [string, string],
    roster: [], lineup, staff: [], balance: Math.round(d.balance), ledger: [], monthly: [], fans: Math.max(0, Math.round(d.fans)), hype: clamp(d.hype ?? 50, 0, 100),
    prestige: clamp(Math.round(d.prestige), 1, 99), facilities: { ...d.facilities }, sponsors: [], merch: defaultMerch(tier, rng), franchise: false,
    tactics: { ...DEFAULT_TACTICS }, chemistry: 60, history: [], titles: [], aiBudget: 1, isCustom: true, ticketPrice: tier === 1 ? 35 : tier === 2 ? 15 : 5,
  };
  state.teams[id] = team;
  let replaced: string | undefined;
  if (d.mode === 'replace' && d.replaceId && state.teams[d.replaceId] && d.replaceId !== id) {
    const old = state.teams[d.replaceId];
    replaced = old.name;
    // the replaced organisation's players become free agents
    for (const pid of [...old.roster]) { const p = state.players[pid]; if (p) movePlayer(state, p, null, 0, 0); }
    // staff: inherited by the new organisation or released
    for (const sid of old.staff) {
      const s = state.staff[sid];
      if (!s) continue;
      if (d.inheritStaff) { s.teamId = id; team.staff.push(sid); } else { s.teamId = null; s.contract = null; }
    }
    old.staff = [];
    if (old.academyTeamId) team.academyTeamId = old.academyTeamId;
    if (old.parentTeamId) team.parentTeamId = old.parentTeamId;
    substituteTeamId(state, old.id, id);
    delete state.teams[old.id];
  }
  syncRoster(state, team, d.roster);
  return { team, replaced };
}

/** Apply a draft to an existing team (identity, finances, facilities, roster). */
export function applyTeamDraft(state: GameState, t: Team, d: TeamDraft) {
  noteEdit(state, 'team', t.id);
  t.name = d.name.trim() || t.name;
  t.short = (d.short.trim() || t.short).toUpperCase().slice(0, 5);
  t.colors = [...d.colors] as [string, string];
  t.logo = d.logo;
  t.country = d.country || t.country;
  if (d.leagueId !== t.leagueId && state.leagues[d.leagueId]) { t.leagueId = d.leagueId; t.region = state.leagues[d.leagueId].region; }
  t.balance = Math.round(d.balance);
  setFans(t, d.fans);
  t.prestige = clamp(Math.round(d.prestige), 1, 99);
  t.hype = clamp(Math.round(d.hype), 0, 100);
  t.facilities = { ...d.facilities };
  syncRoster(state, t, d.roster);
}

/** Teams already scheduled in competitions can't be removed without breaking fixtures. */
export function teamInCompetitions(state: GameState, id: string) {
  return Object.values(state.fixtures).some((f) => f.teamA === id || f.teamB === id) || Object.values(state.competitions).some((c) => c.teams.includes(id));
}

export function deleteCustomTeam(state: GameState, id: string): { ok: boolean; message: string } {
  const t = state.teams[id];
  if (!t) return { ok: false, message: 'Team not found.' };
  if (id === state.userTeamId) return { ok: false, message: 'You cannot delete the team you manage.' };
  if (teamInCompetitions(state, id)) return { ok: false, message: `${t.name} is already part of this season's competitions and can't be deleted. Release its players instead.` };
  for (const pid of [...t.roster]) { const p = state.players[pid]; if (p) movePlayer(state, p, null, 0, 0); }
  for (const sid of t.staff) { const s = state.staff[sid]; if (s) { s.teamId = null; s.contract = null; } }
  for (const o of state.transferOffers) if ((o.toTeamId === id || o.fromTeamId === id) && o.status === 'pending') o.status = 'withdrawn';
  for (const other of Object.values(state.teams)) { if (other.academyTeamId === id) other.academyTeamId = undefined; if (other.parentTeamId === id) other.parentTeamId = undefined; }
  delete state.teams[id];
  return { ok: true, message: `${t.name} deleted.` };
}

// ------------------------------------------------------------------ staff
export interface StaffDraft {
  handle: string; name: string; country: string; role: StaffRole; attributes: Staff['attributes'];
  reputation: number | null; teamId: string | null; salary: number; years: number;
  contractDirty?: boolean;
  /** appointing a head coach to a team that has one releases the current head coach */
  replaceHeadCoach?: boolean;
}

export function blankStaffDraft(): StaffDraft {
  const v = 60;
  return { handle: '', name: '', country: 'South Korea', role: 'coach', attributes: { tactics: v, drafting: v, training: v, motivation: v, scouting: v, development: v }, reputation: null, teamId: null, salary: 0, years: 2 };
}

export function draftFromStaff(state: GameState, s: Staff): StaffDraft {
  const yearsLeft = s.contract ? Math.max(1, Math.min(3, Math.round((new Date(s.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)))) : 2;
  return { handle: s.handle, name: s.name, country: s.country, role: s.role, attributes: { ...s.attributes }, reputation: s.reputation, teamId: s.teamId, salary: s.contract?.salary ?? 0, years: yearsLeft };
}

const asStaff = (d: StaffDraft, reputation = 0) => ({ role: d.role, attributes: d.attributes, reputation }) as Staff;
export const autoStaffReputation = (d: StaffDraft) => clamp(staffRating(asStaff(d)), 1, 100);

export function suggestedStaffSalary(state: GameState, d: StaffDraft) {
  const team = d.teamId ? state.teams[d.teamId] : null;
  return team ? staffSalaryDemand(state, asStaff(d, d.reputation ?? autoStaffReputation(d)), team) : 0;
}

/** Blocking problems with a staff draft, plus the head coach it would replace (if any). */
export function staffDraftIssues(state: GameState, d: StaffDraft, target?: Staff): { errors: string[]; headCoach?: Staff } {
  const errors: string[] = [];
  if (!d.handle.trim()) errors.push('A handle is required.');
  const team = d.teamId ? state.teams[d.teamId] : null;
  let headCoach: Staff | undefined;
  if (team) {
    const others = team.staff.filter((id) => id !== target?.id && state.staff[id]);
    if (others.length >= MAX_STAFF) errors.push(`${team.name} already has ${MAX_STAFF} staff members (the maximum).`);
    if (d.role === 'headCoach') {
      headCoach = others.map((id) => state.staff[id]).find((x) => x.role === 'headCoach');
      if (headCoach && !d.replaceHeadCoach) errors.push(`${team.name} already has a head coach (${headCoach.handle}). Release them or pick another role.`);
    }
  }
  return { errors, headCoach };
}

function releaseStaff(state: GameState, s: Staff) {
  const t = s.teamId ? state.teams[s.teamId] : null;
  if (t) t.staff = t.staff.filter((id) => id !== s.id);
  s.teamId = null;
  s.contract = null;
}

function assignStaff(state: GameState, s: Staff, d: StaffDraft) {
  const team = d.teamId ? state.teams[d.teamId] ?? null : null;
  if (team && d.role === 'headCoach' && d.replaceHeadCoach) {
    for (const id of [...team.staff]) { const x = state.staff[id]; if (x && x.id !== s.id && x.role === 'headCoach') releaseStaff(state, x); }
  }
  const contract = () => ({ salary: Math.max(0, Math.round(d.salary)), expires: contractExpiry(state.date, clamp(d.years, 1, 3)), buyout: 0, signedOn: s.contract?.signedOn ?? state.date });
  if ((team?.id ?? null) !== s.teamId) {
    releaseStaff(state, s);
    if (team) { s.teamId = team.id; team.staff.push(s.id); s.contract = { ...contract(), signedOn: state.date }; }
  } else if (team && (d.contractDirty || !s.contract)) s.contract = contract();
}

export function uniqueStaffId(state: GameState, handle: string) {
  const base = `custom-staff:${slugify(handle)}`;
  let n = 1;
  while (state.staff[`${base}-${n}`]) n++;
  return `${base}-${n}`;
}

export function createCustomStaff(state: GameState, d: StaffDraft): Staff {
  const handle = d.handle.trim() || 'Coach';
  const s: Staff = {
    id: uniqueStaffId(state, handle), handle, name: d.name.trim() || handle, country: d.country, role: d.role, teamId: null,
    attributes: { ...d.attributes }, contract: null, reputation: clamp(Math.round(d.reputation ?? autoStaffReputation(d)), 1, 100), isCustom: true,
  };
  state.staff[s.id] = s;
  assignStaff(state, s, d);
  return s;
}

/** Apply a draft to an existing staff member (real, custom or a market candidate) in place. */
export function applyStaffDraft(state: GameState, s: Staff, d: StaffDraft) {
  noteEdit(state, 'staff', s.id);
  if (!state.staff[s.id]) adoptPoolStaff(state, s);
  s.handle = d.handle.trim() || s.handle;
  s.name = d.name.trim() || s.name;
  s.country = d.country;
  s.role = d.role;
  s.attributes = { ...d.attributes };
  s.reputation = clamp(Math.round(d.reputation ?? autoStaffReputation(d)), 1, 100);
  assignStaff(state, s, d);
}

export function deleteCustomStaff(state: GameState, id: string): { ok: boolean; message: string } {
  const s = state.staff[id];
  if (!s) return { ok: false, message: 'Staff member not found.' };
  releaseStaff(state, s);
  delete state.staff[id];
  return { ok: true, message: `${s.handle} deleted.` };
}

// ------------------------------------------------------------------ library (plain JSON, shared across careers)
export interface LibraryTeam {
  id: string; savedAt: number; name: string; short: string; colors: [string, string]; logo?: string; country?: string; leagueId: string;
  balance: number; fans: number; prestige: number; facilities: Record<FacilityKey, number>;
  customPlayers: Player[]; realPlayerIds: string[];
}
export type LibraryPlayer = Player & { savedAt?: number };

export function toLibraryPlayer(p: Player): LibraryPlayer {
  const c = JSON.parse(JSON.stringify(p)) as LibraryPlayer;
  c.teamId = null; c.contract = null; c.season = emptySeasonStats(); c.history = []; c.career = []; c.morale = 70; c.form = 0; c.fatigue = 0;
  c.isCustom = true; c.retired = undefined; c.isSub = undefined; c.lastPlayed = undefined; c.savedAt = Date.now();
  return c;
}

export function toLibraryTeam(state: GameState, t: Team): LibraryTeam {
  const players = t.roster.map((id) => state.players[id]).filter(Boolean);
  return {
    id: t.id, savedAt: Date.now(), name: t.name, short: t.short, colors: [...t.colors] as [string, string], logo: t.logo, country: t.country, leagueId: t.leagueId,
    balance: Math.round(t.balance), fans: t.fans, prestige: t.prestige, facilities: { ...t.facilities },
    customPlayers: players.filter((p) => p.isCustom).map(toLibraryPlayer), realPlayerIds: players.filter((p) => !p.isCustom).map((p) => p.id),
  };
}

/** Import a library player into this career as a free agent (new id if needed). */
export function importLibraryPlayer(state: GameState, lp: LibraryPlayer): Player {
  const id = uniquePlayerId(state, lp.handle || 'player');
  const p: Player = { ...(JSON.parse(JSON.stringify(lp)) as Player), id, teamId: null, contract: null, season: emptySeasonStats(), history: [], career: [], isCustom: true, retired: undefined };
  delete (p as LibraryPlayer).savedAt;
  p.value = marketValue(p, state.date, marketDrift(state));
  state.players[id] = p;
  state.scoutedPlayers[id] = 100;
  return p;
}

/** Prepare a team draft from a library entry (custom players are imported as free agents first). */
export function draftFromLibraryTeam(state: GameState, lt: LibraryTeam): TeamDraft {
  const base = blankTeamDraft(state);
  const roster: TeamDraft['roster'] = [];
  for (const lp of lt.customPlayers ?? []) {
    const p = importLibraryPlayer(state, lp);
    roster.push({ playerId: p.id, salary: suggestedSalary(state, p.attributes, p.role, null, p.traits) || salaryFor(overall(p.attributes, p.role), state.leagues[lt.leagueId]?.tier ?? 2, lt.leagueId, p.traits), years: 2 });
  }
  for (const id of lt.realPlayerIds ?? []) {
    const p = state.players[id];
    if (p && !p.retired) roster.push({ playerId: id, salary: salaryFor(overall(p.attributes, p.role), state.leagues[lt.leagueId]?.tier ?? 2, lt.leagueId, p.traits, marketDrift(state)), years: 2 });
  }
  return {
    ...base, name: lt.name, short: lt.short, colors: lt.colors, logo: lt.logo, country: lt.country ?? base.country,
    leagueId: state.leagues[lt.leagueId] ? lt.leagueId : base.leagueId, balance: lt.balance, fans: lt.fans, prestige: lt.prestige,
    facilities: { ...base.facilities, ...lt.facilities }, roster,
  };
}
