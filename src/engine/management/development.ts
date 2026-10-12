// Player development: weekly training gains (age curve, potential, work ethic, facilities,
// coaching, training focus, mentors), fatigue recovery, morale drift, aging & retirement.
import type { GameState, Player, Team, PlayerAttributes } from '../types';
import { ATTRIBUTE_KEYS } from '../types';
import { RNG, clamp } from '../../util/rng';
import { ageOn, overall, marketValue } from '../setup';
import { staffBonus } from '../season/prep';
import { addNews } from './news';
import { trainingMult, applyTrainingFocus, learnMult } from './traitEffects';

export type TrainingIntensity = 'light' | 'balanced' | 'intense';
export interface TrainingPlan { intensity: TrainingIntensity; scrims: number; soloq: number; vod: number; rest: number }
export const DEFAULT_PLAN: TrainingPlan = { intensity: 'balanced', scrims: 40, soloq: 25, vod: 20, rest: 15 };

/** Growth multiplier by age: fast growth until ~21, plateau ~22-25, decline after ~26. */
export function ageCurve(age: number) {
  if (age < 18) return 1.5;
  if (age < 20) return 1.25;
  if (age < 22) return 1.0;
  if (age < 24) return 0.6;
  if (age < 26) return 0.25;
  if (age < 28) return -0.15;
  return -0.4;
}

export function weeklyTraining(state: GameState, team: Team, rng: RNG, plan: TrainingPlan = DEFAULT_PLAN) {
  const sb = staffBonus(state, team);
  const coachQ = sb.training / 100;
  const devQ = sb.development / 100;
  const facility = team.facilities.trainingFacility;
  const intensity = plan.intensity === 'intense' ? 1.25 : plan.intensity === 'light' ? 0.75 : 1;
  const mentors = team.roster.filter((id) => state.players[id]?.traits.includes('mentor')).length;
  for (const id of team.roster) {
    const p = state.players[id];
    if (!p) continue;
    const age = ageOn(p.birthdate, state.date) ?? 22;
    const ovr = overall(p.attributes, p.role);
    const room = Math.max(0, p.hidden.potential - ovr);
    const curve = ageCurve(age);
    let rate = 0.09 * intensity * (0.6 + coachQ * 0.6) * (0.85 + facility * 0.07) * (0.6 + p.hidden.workEthic / 100 * 0.8);
    if (p.traits.includes('grinder')) rate *= 1.25;
    if (p.traits.includes('party_animal')) rate *= 0.75;
    if (mentors && age < 22 && !p.traits.includes('mentor')) rate *= 1 + 0.15 * mentors;
    if (team.facilities.academy && age < 20) rate *= 1 + team.facilities.academy * 0.05;
    if (age < 22) rate *= 0.85 + devQ * 0.35;
    rate *= trainingMult(state, team, p, age, curve); // extended traits & personal profile (traitEffects.ts)
    const growth = curve > 0 ? rate * curve * Math.min(1.5, room / 8 + 0.15) : rate * curve * 0.8;
    // distribute growth: focus attribute gets more, scrim/soloq/vod mix shapes the rest
    const weights: Partial<Record<keyof PlayerAttributes, number>> = {
      mechanics: plan.soloq * 1.2, laning: plan.soloq + plan.scrims * 0.5, farming: plan.soloq * 0.6, teamfight: plan.scrims,
      macro: plan.vod + plan.scrims * 0.6, vision: plan.vod * 0.7, pathing: plan.vod * 0.5 + plan.scrims * 0.3, objectives: plan.scrims * 0.4,
      shotcalling: plan.scrims * 0.3 + plan.vod * 0.3, consistency: plan.scrims * 0.3, adaptability: plan.soloq * 0.4,
    };
    if (p.trainingFocus && p.trainingFocus !== 'champion') weights[p.trainingFocus] = (weights[p.trainingFocus] ?? 0) + 60;
    applyTrainingFocus(p, weights); // VOD Addict, Solo Queue Warrior, smarts…
    const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
    for (const k of ATTRIBUTE_KEYS) {
      if (k === 'aggression' || k === 'clutch') continue;
      const w = (weights[k] ?? 0) / total;
      const delta = growth * w * 11 * (0.6 + rng.next() * 0.8);
      if (curve < 0 && (k === 'macro' || k === 'shotcalling')) continue; // experience keeps macro
      p.attributes[k] = clamp(p.attributes[k] + delta, 1, 99);
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

/** Yearly: aging decline, value refresh, retirements. Called at season rollover. */
export function yearlyAging(state: GameState, rng: RNG) {
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    const age = ageOn(p.birthdate, state.date) ?? 22;
    p.value = marketValue(p, state.date);
    // potential settles as players age
    if (age > 24) p.hidden.potential = Math.max(overall(p.attributes, p.role), p.hidden.potential - 2);
    const ovr = overall(p.attributes, p.role);
    const retireChance = age > 29 ? 0.35 : age > 27 ? 0.15 : age > 25 && ovr < 55 ? 0.08 : 0;
    if (!p.teamId && rng.chance(retireChance + (age > 23 && ovr < 45 ? 0.2 : 0))) {
      p.retired = true;
      if (p.reputation > 60) addNews(state, { headline: `${p.handle} announces retirement`, body: `${p.handle} (${p.name}) retires from professional play at ${Math.floor(age)}.`, tags: ['retirement'], playerIds: [p.id] });
    }
  }
}
