// Fan base: a die-hard core that sticks with the club through thick and thin, and casual fans who come and go with
// results and buzz. team.fans is the total (every revenue line reads it); team.diehard is the core inside it.
//
//   - Casual fans drift each week toward reach × form: form is hype (wins push it up, losses down) and titles won in
//     the last year, plus a little for streamers. `reach` is what the club draws at average form: sustained success
//     grows it slowly, long slumps shrink it, softly capped by the size of the league's market (no more compounding).
//   - Die-hards drift toward reach × loyalty. Loyalty comes from the club's history (honours, seasons, prestige), the
//     players fans bond with (years at the club, charisma / humor / media presence, streaming, starting week in week
//     out, consistency, local heroes, fan favourites, one-club players; toxic or mercenary types put fans off) and the
//     community (content studio). They build up over months and leave only very slowly — a losing season doesn't
//     shift them — but when a beloved player leaves, some of his followers go with him.
//   - Die-hards spend more: they buy the merch and make the audience sponsors pay for (merch.ts, sponsors.ts).
// Weekly update from endDay (game.ts); old saves and new games are seeded by ensureFanbase.
import type { GameState, Player, Team } from '../types';
import { ROLES } from '../types';
import { clamp } from '../../util/rng';
import { LEAGUE_ECON, leagueMarket } from '../setup';
import { personaOf } from './persona';
import { streamScore, streamWeight } from './traitEffects';
import { honours, compEv } from './legacy';
import { REAL_DOMESTIC, REAL_PLAYER_TITLES } from './legacyData';
import { regionOfCountry } from './transfers';
import { appearanceCharm, communityLoyalty, contentForm } from './contentFx';

const CASUAL_PULL = 0.06;               // share of the gap to the casual target closed each week (fickle)
const DIEHARD_GROW = 0.02, DIEHARD_FADE = 0.004; // …and to the die-hard target: months to build, years to lose
const REACH_DRIFT = 0.004;              // weekly reach change per point of form above / below 1
const REACH_CAP = 4;                    // × the league's market: growth slows to nothing there
const FOLLOW = 0.3;                     // share of a departing player's die-hards who stop following the club

const z = (v: number) => (v - 50) / 50;
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5;
const isStarter = (team: Team, id: string) => ROLES.some((r) => team.lineup[r] === id);
/** Share of the fan base that is die-hard once loyalty has settled (loyalty 0.2 → 19%, 0.4 → 32%, 0.7 → 46%). */
const settledShare = (loyalty: number) => (1.2 * loyalty) / (1 + 1.2 * loyalty);

// ------------------------------------------------------------------ tenure
/** When the player joined his current club: set on every move (transfers.movePlayer); seeded from real titles won with it. */
export function joinedOn(state: GameState, p: Player): string {
  if (p.joinedOn) return p.joinedOn;
  const club = p.teamId ?? '';
  let year = Number(state.date.slice(0, 4));
  // consecutive seasons on record with this club
  const seasons = new Set(p.career.filter((c) => c.teamId === club).map((c) => c.season));
  while (seasons.has(year - 1)) year--;
  for (const list of Object.values(REAL_PLAYER_TITLES[p.id] ?? {})) for (const [s, t] of list ?? []) if (t === club && s < year) year = s;
  const signed = p.contract?.signedOn ?? state.date;
  return year < Number(state.date.slice(0, 4)) ? `${year}-01-01` : signed < state.date ? signed : state.date;
}
export const tenureYears = (state: GameState, p: Player) => Math.max(0, days(joinedOn(state, p), state.date) / 365.25);

// ------------------------------------------------------------------ loyalty
const TRAIT_BOND: Record<string, number> = {
  fan_favorite: 1.2, one_club: 0.5, hometown_hero: 0.3, heartthrob: 0.3, media_darling: 0.3, content_machine: 0.2, meme_lord: 0.15, veteran: 0.2,
  toxic_presence: -0.4, mercenary: -0.3, foot_in_mouth: -0.2, hater_magnet: -0.2, camera_shy: -0.1,
};

export interface Bond { id: string; bond: number; years: number; reasons: string[] }

/** How strongly fans tie themselves to this player at this club (loyalty points; a typical starter ≈ 0.01, a club legend ≈ 0.1). */
export function playerBond(state: GameState, team: Team, p: Player): Bond {
  const s = personaOf(p), years = tenureYears(state, p);
  const reasons: string[] = [];
  const starter = isStarter(team, p.id);
  let charm = 0.6;
  const personality = Math.max(0, (z(s.charisma) + z(s.humor) + z(s.media)) / 3);
  charm += personality * 0.8;
  if (personality > 0.3) reasons.push('personality');
  const stream = streamScore(p);
  charm += stream * 0.35;
  if (stream > 1.1) reasons.push('popular streamer');
  for (const t of p.traits) charm += TRAIT_BOND[t] ?? 0;
  if (p.traits.includes('fan_favorite')) reasons.push('fan favourite');
  const seen = appearanceCharm(state, team, p.id); // the faces of the club's own videos (orgContent.ts)
  charm += seen;
  if (seen >= 0.15) reasons.push('club content');
  if (p.country && p.country === team.country) { charm += 0.3; reasons.push('local hero'); }
  else if (regionOfCountry(p.country) === team.region) charm += 0.15;
  charm += (p.reputation / 100) * 0.6;
  const steady = clamp((p.attributes.consistency - 60) / 40, -0.5, 1);
  charm += steady * 0.25;
  if (starter && steady > 0.4) reasons.push('consistent');
  if (years >= 3) reasons.push(`${Math.floor(years)} years at the club`);
  if (starter) reasons.push('starter');
  const yearsF = 0.3 + Math.min(years, 8) * 0.35;
  return { id: p.id, bond: Math.max(0, (starter ? 1 : 0.35) * yearsF * charm * 0.012), years, reasons };
}

export interface Loyalty { total: number; history: number; players: number; community: number; bonds: Bond[] }

const HONOUR_PTS: Record<string, number> = { worlds: 0.07, msi: 0.03, fst: 0.03, ewc: 0.03, dom: 0.015, cup: 0.005 };
/** Loyalty 0.05..0.85: what keeps fans with the club whatever the results. */
export function loyalty(state: GameState, team: Team): Loyalty {
  let history = (team.prestige / 100) * 0.15 + (REAL_DOMESTIC[team.id]?.count ?? 0) * 0.015;
  for (const h of honours(state, team.id)) history += HONOUR_PTS[h.ev] ?? 0;
  history += new Set(team.history.map((h) => h.season)).size * 0.008;
  history = Math.min(0.35, history);
  const bonds = team.roster.map((id) => state.players[id]).filter((p): p is Player => !!p).map((p) => playerBond(state, team, p)).sort((a, b) => b.bond - a.bond);
  const players = Math.min(0.3, bonds.reduce((s, b) => s + b.bond, 0));
  const community = communityLoyalty(state, team); // content studio + the club channel's community (contentFx.ts)
  return { total: clamp(0.1 + history + players + community, 0.05, 0.85), history, players, community, bonds };
}

// ------------------------------------------------------------------ form
/** Title bonus per club from competitions won in the last year (Worlds +35%, MSI / First Stand / EWC +15%, a domestic title +8%). */
function recentTitles(state: GameState): Map<string, number> {
  const out = new Map<string, number>();
  const since = new Date(new Date(state.date).getTime() - 365 * 864e5).toISOString().slice(0, 10);
  for (const c of Object.values(state.competitions)) {
    if (c.status !== 'done' || !c.winner || c.endDate < since) continue;
    const ev = compEv(c);
    const b = ev === 'worlds' ? 0.35 : ev === 'msi' || ev === 'fst' || ev === 'ewc' ? 0.15 : ev === 'dom' ? 0.08 : ev === 'cup' ? 0.03 : 0;
    if (b) out.set(c.winner, Math.min(0.5, (out.get(c.winner) ?? 0) + b));
  }
  return out;
}
/** Casual pull of the club right now: hype (results), recent titles, streamers. 1 = average. */
export function fanForm(state: GameState, team: Team, titles = recentTitles(state)) {
  return (0.7 + team.hype / 166) * (1 + (titles.get(team.id) ?? 0)) * (1 + 0.03 * streamWeight(state, team)) * contentForm(state, team);
}

// ------------------------------------------------------------------ state
/** Seed die-hards and reach for clubs that don't have them yet (new games, old saves, Editor clubs). */
export function ensureFanbase(state: GameState) {
  let titles: Map<string, number> | null = null;
  for (const team of Object.values(state.teams)) {
    if (team.diehard !== undefined && team.reach !== undefined && team.diehard <= team.fans) continue;
    titles ??= recentTitles(state);
    team.diehard = Math.round(team.fans * settledShare(loyalty(state, team).total));
    team.reach = Math.max(1, (team.fans - team.diehard) / fanForm(state, team, titles));
  }
}

/** Weekly (Mondays): casual fans follow form, die-hards follow loyalty, reach follows sustained success. */
export function fanbaseWeekly(state: GameState) {
  ensureFanbase(state);
  const titles = recentTitles(state);
  for (const team of Object.values(state.teams)) {
    for (const id of team.roster) { const p = state.players[id]; if (p && !p.joinedOn) p.joinedOn = joinedOn(state, p); }
    // AI buzz settles back between results (the user's follows fan mood, fans.ts)
    if (team.id !== state.userTeamId) team.hype = clamp(team.hype + (50 - team.hype) * 0.04, 0, 100);
    const form = fanForm(state, team, titles);
    const market = leagueMarket(state, team);
    let reach = team.reach!;
    const g = (form - 1) * REACH_DRIFT;
    reach = g > 0 ? reach * (1 + g * Math.max(0, 1 - reach / (REACH_CAP * market))) : Math.max(reach * (1 + g), Math.min(reach, 0.15 * market));
    team.reach = reach;
    let diehard = team.diehard!, casual = team.fans - diehard;
    casual += (reach * form - casual) * CASUAL_PULL;
    const target = reach * loyalty(state, team).total * 1.2;
    diehard += (target - diehard) * (target > diehard ? DIEHARD_GROW : DIEHARD_FADE);
    team.diehard = Math.max(0, Math.round(diehard));
    team.fans = Math.max(100, team.diehard + Math.round(Math.max(0, casual)));
  }
}

/** One-off swings (a title, a viral stream, a scandal): casual fans only — die-hards don't move on a single moment. */
export function boostFans(team: Team, pct: number) {
  if (!pct) return;
  const d = team.diehard ?? 0;
  team.fans = Math.max(100, d, Math.round(team.fans + (team.fans - d) * pct));
}
export function addFans(team: Team, n: number) {
  team.fans = Math.max(100, team.diehard ?? 0, Math.round(team.fans + n));
}
/** Set the total (Editor): die-hards and reach scale along, so the weekly drift doesn't pull it back. */
export function setFans(team: Team, n: number) {
  const k = team.fans > 0 ? Math.max(0, n) / team.fans : 1;
  team.fans = Math.max(0, Math.round(n));
  if (team.diehard !== undefined) team.diehard = Math.round(team.diehard * k);
  if (team.reach !== undefined) team.reach *= k;
}

/** A player leaves `from` (for `to`, or none): some of the die-hards who came for him follow him out. */
export function fansFollowPlayer(state: GameState, from: Team, to: Team | null, p: Player) {
  if (!from.diehard) return;
  const l = loyalty(state, from);
  const mine = from.diehard * (playerBond(state, from, p).bond / Math.max(0.05, l.total));
  const leaving = Math.round(mine * FOLLOW);
  if (leaving < 1) return;
  from.diehard -= leaving;
  from.fans = Math.max(100, from.diehard, from.fans - leaving);
  if (to && to.diehard !== undefined) { const come = Math.round(leaving * 0.5); to.diehard += come; to.fans += come; }
}

// ------------------------------------------------------------------ audiences for the money lines
const diehardsOf = (team: Team) => Math.min(team.fans, team.diehard ?? team.fans * 0.25);
/** Merch buyers: die-hards buy several times what casual fans do (≈ the total at a 30% die-hard share). */
export const merchAudience = (team: Team) => { const d = diehardsOf(team); return (team.fans - d) * 0.6 + d * 1.9; };
/** Audience sponsors pay for: everyone, die-hards count half again (engaged, they show up and buy). */
export const sponsorAudience = (team: Team) => team.fans + diehardsOf(team) * 0.5;
export const diehardShare = (team: Team) => (team.fans > 0 ? diehardsOf(team) / team.fans : 0);
/** League benchmark audience for sponsor appeal (tier-wide, absolute: brands pay for eyeballs). */
export const audienceBenchmark = (state: GameState, team: Team) => LEAGUE_ECON[state.leagues[team.leagueId]?.tier ?? 3].fans;
