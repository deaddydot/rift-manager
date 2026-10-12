// Management side of the extended traits (traitsMore.ts) and the personal profile (persona.ts): small,
// readable modifiers that the existing systems call through one-line hooks —
//   development.ts (training), people.ts (compatibility, trust, approaches, incidents), merch.ts, sponsors.ts,
//   finance.ts (streaming revenue), setup.ts (salaries), season/prep.ts (sim inputs, off-role), season/series.ts (quick sim).
// Trait effects are aggregated once per trait list (fxTotal, cached), so these hooks stay cheap in the daily loop.
import type { GameState, Player, PlayerAttributes, Role, Team } from '../types';
import { clamp } from '../../util/rng';
import { fxTotal } from '../traitsMore';
import type { SimPlayerInput } from '../sim/simtypes';
import { contextPerf, profileOf } from '../sim/traitSim';
import type { DraftState } from '../draft/draft';
import { personaOf, languageOf } from './persona';
import { clampSimStat } from '../ratings';

const T = (p: { traits: readonly string[] }) => fxTotal(p.traits).num;
const z = (v: number) => (v - 50) / 50; // profile stat → -1..+1

// ------------------------------------------------------------------ contracts
/** Salary multiplier from traits (Mercenary, Brand Ambassador…); used by setup.salaryFor. */
export const traitSalaryMult = (traits: readonly string[]) => clamp(1 + fxTotal(traits).num.salary, 0.7, 1.5);

/** Final contract year (expires within a year). */
export const finalContractYear = (state: GameState, p: Player) => !!p.contract && (new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / 864e5 <= 365;

/**
 * Multiplier on a player's asking salary in a negotiation (for transfers.ts `salaryDemand`, owned elsewhere):
 * One-Club Player gives their own club a discount, Hometown Hero one at a home-region club.
 * Suggested use: `salaryDemand(...) * traitContractMod(p, { ownClub: p.teamId === team.id, homeRegion: regionOfCountry(p.country) === team.region })`.
 */
export function traitContractMod(p: Player, o: { ownClub: boolean; homeRegion: boolean }): number {
  let m = 1;
  for (const { id, fx } of fxTotal(p.traits).list) if (fx.stay && (id === 'hometown_hero' ? o.homeRegion : o.ownClub)) m -= fx.stay;
  return clamp(m, 0.75, 1);
}

// ------------------------------------------------------------------ training (development.ts)
const MENTOR_FIGURES = ['mentor', 'veteran', 'grizzled_veteran', 'patient_teacher'];

/** Training-gain multiplier (growing players) or aging-decline multiplier (curve <= 0). */
export function trainingMult(state: GameState, team: Team, p: Player, age: number, curve: number): number {
  const t = fxTotal(p.traits);
  if (curve <= 0) return clamp(t.num.decline, 0.4, 1.6);
  let m = 1 + t.num.train + z(personaOf(p).smarts) * 0.06;
  for (const { fx } of t.list) if (fx.trainAge && age >= fx.trainAge[0] && age < fx.trainAge[1]) m += fx.trainAge[2];
  if (t.num.contractYear && finalContractYear(state, p)) m += 0.1;
  const youth = age < 22, mentor = t.num.withMentor;
  if (youth || mentor) {
    let hasMentor = false;
    for (const id of team.roster) {
      const q = id !== p.id ? state.players[id] : undefined;
      if (!q) continue;
      if (youth) m += T(q).youth;
      if (mentor && !hasMentor && q.traits.some((x) => MENTOR_FIGURES.includes(x))) hasMentor = true;
    }
    if (hasMentor) m += mentor;
  }
  return clamp(m, 0.55, 1.7);
}

/** Reweight the weekly training mix (VOD Addict → macro/vision, Solo Queue Warrior → mechanics…; smarts → macro/vision/adaptability). */
export function applyTrainingFocus(p: Player, weights: Partial<Record<keyof PlayerAttributes, number>>) {
  const smart = 1 + z(personaOf(p).smarts) * 0.25;
  for (const k of ['macro', 'vision', 'adaptability'] as const) if (weights[k]) weights[k]! *= smart;
  for (const { fx } of fxTotal(p.traits).list) if (fx.focus) for (const [k, v] of Object.entries(fx.focus) as [keyof PlayerAttributes, number][]) if (weights[k]) weights[k]! *= v;
}

/** Champion-learning speed multiplier (Quick Study, smarts). */
export const learnMult = (p: Player) => clamp(1 + T(p).learn + z(personaOf(p).smarts) * 0.15, 0.4, 2);

// ------------------------------------------------------------------ locker room (people.ts)
/** Extra compatibility (-0.3..0.3) between two teammates from traits, humor, charisma and languages. */
export function traitCompat(a: Player, b: Player): number {
  const sa = personaOf(a), sb = personaOf(b), ta = T(a), tb = T(b);
  let c = ta.compat + tb.compat + (z(sa.humor) + z(sb.humor)) * 0.035 + (z(sa.charisma) + z(sb.charisma)) * 0.015;
  if (languageOf(a.country) !== languageOf(b.country)) c += ta.foreign + tb.foreign + (Math.min(sa.languages, sb.languages) - 1) * 0.03;
  if (a.role === b.role) c += ta.sameRole + tb.sameRole;
  return clamp(c, -0.3, 0.3);
}

/** Shift of the trust-in-manager baseline (Coachable, Stubborn…). */
export const traitTrust = (p: Player) => T(p).trust;

const HEALTH = ['sick', 'sick_worse', 'wrist', 'wrist_worse', 'back', 'burnout', 'health'];
/** Multiplier on how likely a player brings a given approach kind (people.ts APPROACHES). */
export function approachMult(p: Player, kind: string): number {
  const s = personaOf(p);
  let m = 1;
  for (const { fx } of fxTotal(p.traits).list) m *= fx.approach?.[kind] ?? 1;
  if (HEALTH.includes(kind)) m *= 1 - z(s.stamina) * 0.25;
  if (kind === 'language' || kind === 'homesick') m *= s.languages >= 3 ? 0.5 : s.languages === 2 ? 0.8 : 1.15;
  if (kind === 'fans') m *= 1 + z(s.online) * 0.3;
  if (kind === 'stream') m *= 1 + z(s.online) * 0.4;
  return clamp(m, 0.05, 5);
}

/** Weekly off-field incident weight (people.ts weeklyIncident): online drama vs. media savvy, Model Professional… */
export function incidentWeight(p: Player, w: number): number {
  const s = personaOf(p), t = T(p);
  return Math.max(0, (w + t.incident + z(s.online) * 0.005 - z(s.media) * 0.004) * t.incidentMul);
}

// ------------------------------------------------------------------ streaming, merch, sponsors
/** On-camera appeal 1..99: looks, humor, charisma, online presence, plus traits (Meme Lord, Heartthrob…). */
export function streamAppeal(p: Player): number {
  const s = personaOf(p);
  return clamp(s.looks * 0.28 + s.humor * 0.3 + s.charisma * 0.27 + s.online * 0.15 + T(p).stream, 1, 99);
}
/** Stream output (hours) multiplier: Content Machine 1.5×, Camera Shy 0.5×. */
export const streamOutput = (p: Player) => T(p).output;
/** Weekly stream impact (~1 for an average streamer, ~2 for a big draw, ~0.4 for a niche one); 0 if not streaming. */
export function streamScore(p: Player): number {
  if (!p.streamer) return 0;
  const a = streamAppeal(p) / 50;
  return (0.25 + a * a * 0.75) * streamOutput(p) * (0.7 + p.reputation / 100 * 0.6);
}
/** Weighted streamer count of a roster (finance.ts content revenue; an average streamer counts ~1). */
export function streamWeight(state: GameState, team: Team) {
  let s = 0;
  for (const id of team.roster) { const p = state.players[id]; if (p?.streamer) s += streamScore(p); }
  return s;
}

/** Merch star power of one player (merch.ts): looks, style, streaming, Heartthrob / Fashion Icon. */
export function merchAppeal(p: Player): number {
  const s = personaOf(p);
  return clamp(z(s.looks) * 0.25 + z(s.style) * 0.25 + T(p).merch + (p.streamer ? (streamAppeal(p) - 50) / 50 * 0.3 : 0), -0.3, 2.5);
}

/** Sponsor appeal added by the roster's faces (sponsors.ts offer size): media savvy, charisma, looks, Brand Ambassador… */
export function sponsorAppeal(state: GameState, team: Team): number {
  const faces = team.roster.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.reputation - a.reputation).slice(0, 5);
  let v = 0;
  for (const p of faces) {
    const s = personaOf(p);
    v += (z(s.media) * 0.03 + z(s.charisma) * 0.03 + z(s.looks) * 0.015 + T(p).sponsor) * (0.5 + p.reputation / 100);
  }
  return clamp(v, -0.1, 0.25);
}

// ------------------------------------------------------------------ match preparation (prep.ts / series.ts)
/** Off-role penalty multiplier (Flex Player halves it). */
export const offRoleMult = (p: Player) => T(p).offRole;

/** State-aware sim-input tweaks: voice-comms clarity → shotcalling (±3), Contract-Year Player in their final year. */
export function prepTraitInput(state: GameState, p: Player, input: SimPlayerInput): SimPlayerInput {
  input.shotcalling = clampSimStat('shotcalling', input.shotcalling + z(personaOf(p).comms) * 3);
  const cy = T(p).contractYear;
  if (cy && finalContractYear(state, p)) for (const k of ['mech', 'lane', 'farm', 'tf', 'macro', 'obj'] as const) input[k] = clampSimStat(k, input[k] + cy);
  return input;
}

// rough share of each sim rating in a role's overall (setup.ts overall weights, mapped to sim inputs)
const POWER_W: Record<Role, Partial<Record<string, number>>> = {
  top: { mech: 0.22, lane: 0.22, tf: 0.16, farm: 0.12, macro: 0.12, consistency: 0.08, vision: 0.04, obj: 0.04 },
  jungle: { pathing: 0.2, obj: 0.15, macro: 0.17, mech: 0.15, tf: 0.13, vision: 0.1, farm: 0.05, consistency: 0.05 },
  mid: { mech: 0.24, lane: 0.2, tf: 0.15, macro: 0.14, farm: 0.1, consistency: 0.07, pathing: 0.05, vision: 0.05 },
  adc: { mech: 0.24, tf: 0.22, farm: 0.16, lane: 0.16, consistency: 0.1, macro: 0.08, vision: 0.04 },
  support: { vision: 0.18, tf: 0.18, macro: 0.16, lane: 0.12, mech: 0.12, pathing: 0.1, shotcalling: 0.08, consistency: 0.06 },
};
const ratingPts = new Map<string, number>();
/** Rating deltas of a trait list as overall points for a role (cached). */
function inputPoints(traits: readonly string[], role: Role): number {
  const key = role + ':' + traits.join(',');
  let pts = ratingPts.get(key);
  if (pts !== undefined) return pts;
  pts = 0;
  const w = POWER_W[role];
  for (const { fx } of fxTotal(traits).list) for (const [k, v] of Object.entries(fx.in ?? {})) {
    pts += v * (w[k] ?? 0);
    if (k === 'mistakes') pts -= v * 0.06;
    else if (k === 'composure' || k === 'clutch') pts += v * 0.03;
  }
  if (ratingPts.size > 10000) ratingPts.clear();
  ratingPts.set(key, pts);
  return pts;
}

/**
 * Quick-sim power of a player's extended traits, in overall-rating points (season/series.ts teamPowerFor).
 * Mirrors the engine: rating deltas weighted by role, performance edges (0.01 perf ≈ 0.6 points), in-game
 * phase effects at partial weight (they only apply for part of a game). Clamped to ±4.
 */
export function traitPower(state: GameState, p: Player, o: { role: Role; champ: string; mastery: number; oppChamp?: string; big: boolean; d: DraftState; side: 0 | 1 }): number {
  if (!fxTotal(p.traits).any) return 0;
  const q = profileOf(p.traits);
  const avg = (s: 0 | 1) => { const ps = o.d.teams[s].players; let t = 0; for (const x of ps) t += x.rating; return t / Math.max(1, ps.length); };
  const perf = contextPerf(q, { champ: o.champ, role: o.role, mastery: o.mastery, oppChamp: o.oppChamp, big: o.big, gap: avg((1 - o.side) as 0 | 1) - avg(o.side) });
  const phase = q.early * 0.35 + q.late * 0.35 + q.long * 0.12 + q.closing * 0.2 + q.behind * 0.15;
  let pts = inputPoints(p.traits, o.role) + (perf + phase) * 60;
  if (fxTotal(p.traits).num.contractYear && finalContractYear(state, p)) pts += 1.2;
  return clamp(pts, -4, 4);
}
