// Player development on the 0..200 rating scale (engine/ratings.ts): weekly training gains (age curve, room to the
// potential, work ethic, facilities, coaching, training focus, mentors), stage experience from official games
// (winning, big stages and strong opponents pull players up — and past a ceiling they have reached), fatigue
// recovery, morale drift, aging & retirement.
import type { GameState, Player, Team, PlayerAttributes, MatchFixture } from '../types';
import { ATTRIBUTE_KEYS } from '../types';
import { RNG, clamp } from '../../util/rng';
import { ageOn, overall, marketValue } from '../setup';
import { clampRating, ROLE_WEIGHTS, RATING_BANDS, marketDrift } from '../ratings';
import { breakthrough, settlePotential } from './potential';
import { staffBonus } from '../season/prep';
import { addNews, addInbox } from './news';
import { trainingMult, applyTrainingFocus, learnMult } from './traitEffects';
import { scrimTrainingMult, shootPenalty } from './contentFx';

export type TrainingIntensity = 'light' | 'balanced' | 'intense';
export interface TrainingPlan { intensity: TrainingIntensity; scrims: number; soloq: number; vod: number; rest: number }
export const DEFAULT_PLAN: TrainingPlan = { intensity: 'balanced', scrims: 40, soloq: 25, vod: 20, rest: 15 };

/** Growth multiplier by age: fastest until ~21, still solid to ~25, a trickle to 28, then a slow decline. */
export function ageCurve(age: number) {
  if (age < 18) return 1.5;
  if (age < 20) return 1.3;
  if (age < 22) return 1.1;
  if (age < 24) return 0.85;
  if (age < 26) return 0.55;
  if (age < 28) return 0.25;
  if (age < 30) return -0.12;
  return -0.35;
}

/** How much of the growth budget a player gets from the room left to their ceiling: 0 at the ceiling, ~1 with 27 room,
 * up to 2.2 with 60+ — a sky-high ceiling means a player keeps developing fast, not just for longer. */
export const roomFactor = (room: number) => (room <= 0 ? 0 : Math.min(2.2, 0.05 + room / 28));
/** Each point is harder to find the higher a player already is (1 up to 70; 90 → 0.75, 120 → 0.55, 150 → 0.43, 180 → 0.35). */
export const levelFactor = (ovr: number) => 1 / (1 + Math.max(0, ovr - 70) / 60);
/**
 * AI clubs develop players more slowly than the user's club: a gentler overall rate and a cap on how much a
 * sky-high ceiling speeds a player up (otherwise an AI club's 18-year-old prodigy gains 10–14 a year and passes
 * established veterans within a season). The user's club keeps the full rates — good management is the edge.
 */
export const AI_DEV_RATE = 0.75, AI_ROOM_CAP = 1.25;
const devRoom = (aiClub: boolean, room: number) => (aiClub ? Math.min(AI_ROOM_CAP, roomFactor(room)) : roomFactor(room));

/**
 * The club's development environment: coaching quality (convex — great coaches are worth far more than average
 * ones) × training facility, on top of what players get from solo queue anyway. Typical tier-1 club ≈ 1.0,
 * tier-2/3 ≈ 0.6–0.7, the best staff + a level-5 facility ≈ 1.5 (×1.25 more on intense training).
 */
export function devEnvironment(training: number, facility: number) {
  const coach = 0.4 + Math.pow(clamp(training, 0, 100) / 100, 1.5);
  return 0.3 + 0.7 * coach * (0.7 + facility * 0.12);
}

interface TrainingCtx { sb: ReturnType<typeof staffBonus>; env: number; intensity: number; mentors: number }
function trainingCtx(state: GameState, team: Team, plan: TrainingPlan): TrainingCtx {
  const sb = staffBonus(state, team);
  return {
    sb, env: devEnvironment(sb.training, team.facilities.trainingFacility),
    intensity: plan.intensity === 'intense' ? 1.25 : plan.intensity === 'light' ? 0.75 : 1,
    mentors: team.roster.filter((id) => state.players[id]?.traits.includes('mentor')).length,
  };
}

/** One week of training for a player: the overall-growth budget and how the plan splits it across attributes. */
function weekPlan(state: GameState, team: Team, p: Player, plan: TrainingPlan, cx: TrainingCtx) {
  const age = ageOn(p.birthdate, state.date) ?? 22;
  const ovr = overall(p.attributes, p.role);
  const room = p.hidden.potential - ovr;
  const curve = ageCurve(age);
  // typical tier-1 club, big room: ~+6 overall a year at 18–20, ~+4 at 21–23; elite management about doubles it
  const aiClub = team.id !== state.userTeamId;
  let rate = 0.037 * cx.intensity * cx.env * (0.6 + p.hidden.workEthic / 100 * 0.8) * (aiClub ? AI_DEV_RATE : 1);
  if (p.traits.includes('grinder')) rate *= 1.25;
  if (p.traits.includes('party_animal')) rate *= 0.75;
  if (cx.mentors && age < 22 && !p.traits.includes('mentor')) rate *= 1 + 0.15 * cx.mentors;
  if (team.facilities.academy && age < 20) rate *= 1 + team.facilities.academy * 0.05;
  if (age < 22) rate *= 0.85 + cx.sb.development / 100 * 0.35;
  rate *= trainingMult(state, team, p, age, curve); // extended traits & personal profile (traitEffects.ts)
  // the user's club: this week's scrim partners (scrims.ts) and practice lost to content shoots (orgContent.ts)
  if (!aiClub) rate *= scrimTrainingMult(state, plan.scrims) * shootPenalty(state, p.id);
  // past ~28 the hands slow down: professionalism and a good environment soften it (~-0.7/yr at 28–29, ~-2/yr after 30)
  const growth = curve > 0 ? rate * curve * devRoom(aiClub, room) * levelFactor(ovr) : 0.09 * curve * 0.8 * (1.3 - p.hidden.professionalism / 100 * 0.6) * (1.15 - cx.env * 0.15);
  // distribute growth: focus attribute gets more, scrim/soloq/vod mix shapes the rest
  const weights: Partial<Record<keyof PlayerAttributes, number>> = {
    mechanics: plan.soloq * 1.2, laning: plan.soloq + plan.scrims * 0.5, farming: plan.soloq * 0.6, teamfight: plan.scrims,
    macro: plan.vod + plan.scrims * 0.6, vision: plan.vod * 0.7, pathing: plan.vod * 0.5 + plan.scrims * 0.3, objectives: plan.scrims * 0.4,
    shotcalling: plan.scrims * 0.3 + plan.vod * 0.3, consistency: plan.scrims * 0.3, adaptability: plan.soloq * 0.4,
  };
  if (p.trainingFocus && p.trainingFocus !== 'champion') weights[p.trainingFocus] = (weights[p.trainingFocus] ?? 0) + 60;
  applyTrainingFocus(p, weights); // VOD Addict, Solo Queue Warrior, smarts…
  const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  return { growth, weights, total, curve };
}
const trains = (k: keyof PlayerAttributes, curve: number) => k !== 'aggression' && k !== 'clutch' && !(curve < 0 && (k === 'macro' || k === 'shotcalling')); // experience keeps macro

/** Overall points a year from training alone at the player's current level and environment (stage experience comes on top). */
export function projectedGrowth(state: GameState, team: Team, p: Player, plan: TrainingPlan = DEFAULT_PLAN): number {
  const { growth, weights, total, curve } = weekPlan(state, team, p, plan, trainingCtx(state, team, plan));
  let d = 0, t = 0;
  for (const [k, w] of Object.entries(ROLE_WEIGHTS[p.role]) as [keyof PlayerAttributes, number][]) {
    if (trains(k, curve)) d += w * growth * ((weights[k] ?? 0) / total) * 11;
    t += w;
  }
  return (d / t) * 52;
}

/** The club's development environment (coaching × training facility) — see devEnvironment. */
export const teamDevEnvironment = (state: GameState, team: Team) => devEnvironment(staffBonus(state, team).training, team.facilities.trainingFacility);

export function weeklyTraining(state: GameState, team: Team, rng: RNG, plan: TrainingPlan = DEFAULT_PLAN) {
  const cx = trainingCtx(state, team, plan);
  const { sb, intensity } = cx;
  for (const id of team.roster) {
    const p = state.players[id];
    if (!p) continue;
    const { growth, weights, total, curve } = weekPlan(state, team, p, plan, cx);
    for (const k of ATTRIBUTE_KEYS) {
      if (!trains(k, curve)) continue;
      const delta = growth * ((weights[k] ?? 0) / total) * 11 * (0.6 + rng.next() * 0.8);
      p.attributes[k] = clampRating(p.attributes[k] + delta);
    }
    // champion learning
    if (p.learningChampion) {
      // practice gets a champion to pro-ready comfort; signature-level mastery only comes from games on stage
      const cur = p.champions[p.learningChampion] ?? 50;
      p.champions[p.learningChampion] = clamp(cur + (3.4 + p.attributes.adaptability / 18) * intensity * (p.trainingFocus === 'champion' ? 1.8 : 1) * learnMult(p) * (cur > 110 ? 0.5 : 1), 1, 150);
      if (p.champions[p.learningChampion] >= 135) p.learningChampion = null;
    }
    // fatigue & morale
    const restShare = plan.rest / 100;
    p.fatigue = clamp(p.fatigue + (intensity - 1) * 6 + 3 - restShare * 18 - team.facilities.wellness * 1.2, 0, 100);
    const moraleTarget = 62 + sb.motivation / 12;
    p.morale = clamp(p.morale + (moraleTarget - p.morale) * (sb.hasPsychologist ? 0.09 : 0.05) + (team.facilities.gamingHouse - 2) * 0.3 - (p.fatigue > 75 ? 1.5 : 0), 5, 100);
    if (p.isSub && p.hidden.ego > 65) p.morale = clamp(p.morale - 0.8, 5, 100);
  }
  // chemistry drifts up while a lineup stays together
  team.chemistry = clamp(team.chemistry + 0.35 + (team.facilities.gamingHouse - 2) * 0.05, 10, 100);
}

// ------------------------------------------------------------------ milestones
/**
 * Weekly: a player reaching a new rating band for the first time (engine/ratings.ts). The world hears about
 * Elite (100+) and above; the user's own players get a note from World-class (88) up.
 */
export function ratingMilestones(state: GameState) {
  const user = state.userTeamId;
  for (const p of Object.values(state.players)) {
    if (p.retired || !p.teamId) continue;
    const ovr = overall(p.attributes, p.role);
    const band = RATING_BANDS.find((b) => ovr >= b.min);
    if (!band) continue;
    if (p.topBand === undefined) { p.topBand = band.min; continue; } // first look (new save / new player): no news
    if (band.min < 88 || band.min <= p.topBand) continue;
    p.topBand = band.min;
    const team = state.teams[p.teamId];
    const mine = p.teamId === user;
    const firstEver = band.min >= 100 && !Object.values(state.players).some((q) => q !== p && (q.topBand ?? 0) >= band.min);
    if (band.min >= 100 && (mine || (state.leagues[team?.leagueId ?? '']?.tier ?? 3) <= 1 || firstEver)) {
      addNews(state, {
        headline: firstEver ? `${p.handle} becomes the first ${band.label.toLowerCase()} player (${ovr})` : `${p.handle} reaches ${band.label.toLowerCase()} level (${ovr})`,
        body: `${team?.name ?? 'Their club'}'s ${p.role === 'adc' ? 'bot laner' : p.role} ${p.handle} is now rated ${ovr} — ${band.blurb}.`,
        tags: ['development'], playerIds: [p.id], teamIds: team ? [team.id] : [],
      });
    }
    if (mine) addInbox(state, { from: 'Coaching staff', kind: 'info', subject: `${p.handle} is now ${band.label} (${ovr})`, body: `${p.handle} has developed into a ${band.label.toLowerCase()} player (${band.blurb}). Ceiling estimate: ${Math.round(p.hidden.potential)}.` });
  }
}

// ------------------------------------------------------------------ stage experience
/** Experience weight of an official game: bigger stages teach more. */
export function stageWeight(state: GameState, f: MatchFixture): number {
  const c = state.competitions[f.competitionId];
  if (!c) return 0.8;
  const base = c.tier === 0 ? 2 : c.tier === 1 ? 1.1 : c.tier === 2 ? 0.9 : 0.75;
  return base * (c.kind === 'playoffs' ? 1.35 : 1) * ((f.label ?? '').includes('Final') ? 1.5 : 1);
}

/**
 * One official game's worth of stage experience. `edge` = opponent lineup's average overall minus the player's own
 * lineup's. Winning teaches more than losing, beating better teams more still; a player who keeps winning at their
 * ceiling lifts it (potential.ts breakthrough), so good management can pull players past what they "should" reach.
 */
export function gameExperience(state: GameState, p: Player, won: boolean, stage: number, edge: number, mvp: boolean, rng: () => number) {
  const age = ageOn(p.birthdate, state.date) ?? 22;
  const ovr = overall(p.attributes, p.role);
  const ageF = age < 22 ? 1.2 : age < 26 ? 1 : age < 29 ? 0.7 : 0.45;
  const aiClub = p.teamId !== state.userTeamId;
  if (won) breakthrough(p, 0.025 * stage * ageF * (edge > -6 ? 1 : 0.4) * (aiClub ? AI_DEV_RATE : 1)); // ~+3/yr for a winning tier-1 starter at their ceiling
  // a tier-1 starter plays ~150–190 official games a year: ~+2–3 overall from the stage for a winning team with room
  const g = 0.009 * stage * (won ? 1.35 : 0.75) * (mvp ? 1.4 : 1) * clamp(1 + edge / 40, 0.5, 1.6) * ageF * levelFactor(ovr) * devRoom(aiClub, p.hidden.potential - ovr) * (aiClub ? AI_DEV_RATE : 1);
  if (g <= 0) return;
  // what a game on stage teaches: the attributes that make up the role's overall (+ big-match composure on big stages)
  for (const k of Object.keys(ROLE_WEIGHTS[p.role]) as (keyof PlayerAttributes)[]) p.attributes[k] = clampRating(p.attributes[k] + g * (0.6 + rng() * 0.8));
  if (stage >= 1.4) p.attributes.clutch = clampRating(p.attributes.clutch + g * 0.8);
}

/** Yearly: aging decline, value refresh, retirements. Called at season rollover. */
export function yearlyAging(state: GameState, rng: RNG) {
  const drift = marketDrift(state);
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    const age = ageOn(p.birthdate, state.date) ?? 22;
    p.value = marketValue(p, state.date, drift);
    // unrealised potential fades from the mid-twenties
    settlePotential(p, age);
    const ovr = overall(p.attributes, p.role);
    const retireChance = age > 29 ? 0.35 : age > 27 ? 0.15 : age > 25 && ovr < 55 ? 0.08 : 0;
    if (!p.teamId && rng.chance(retireChance + (age > 23 && ovr < 45 ? 0.2 : 0))) {
      p.retired = true;
      if (p.reputation > 60) addNews(state, { headline: `${p.handle} announces retirement`, body: `${p.handle} (${p.name}) retires from professional play at ${Math.floor(age)}.`, tags: ['retirement'], playerIds: [p.id] });
    }
  }
}
