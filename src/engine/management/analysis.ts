// Post-game analysis for the coaching staff: the match analyst's breakdown of the user's games (sim/analysis.ts),
// presented by the club's analysts. How much of it they catch depends on the staff (analysts' drafting / scouting,
// the head coach's tactics) and the Analytics Lab — a bare-bones staff only spots the big, costly mistakes; a great
// one finds the small ones too and turns them into concrete notes. "Review with the team" runs a VOD session on a
// game: every player whose mistakes made the cut gets a lesson — two weeks of training weighted toward what went
// wrong (vision, macro, teamfighting, laning, objectives, shotcalling) — and the repeat offenders of the punishable
// kind (face-checks, overextensions, solo engages) get a little more careful.
import type { GameState, MatchFixture, Player, PlayerAttributes, Team } from '../types';
import { ROLES } from '../types';
import type { GameAnalysis, Mistake, MistakeKind } from '../sim/analysis';
import { clamp } from '../../util/rng';
import { addDays } from '../season/formats';

export interface StoredReport {
  id: string; fixtureId: string; gameNo: number; date: string; comp: string;
  blue: string; red: string; userSide: 0 | 1; won: boolean; quality: number;
  playerIds: string[];         // champion idx → player id (the analysis is indexed by champion)
  a: GameAnalysis; reviewed?: string;
}
export interface Lesson { attr: keyof PlayerAttributes; until: string; why: string }
export interface AnalysisState { reports: StoredReport[]; lessons: Record<string, Lesson> }

export const MAX_REPORTS = 12;
export const analysisState = (state: GameState): AnalysisState => (state.analysis ??= { reports: [], lessons: {} });

/** How sharp the club's analysis is (0.15 … 1): analysts, the head coach and the Analytics Lab. */
export function analystQuality(state: GameState, team: Team): { q: number; who: string } {
  const staff = team.staff.map((id) => state.staff[id]).filter(Boolean);
  const analysts = staff.filter((s) => s.role === 'analyst').sort((a, b) => b.attributes.drafting + b.attributes.scouting - (a.attributes.drafting + a.attributes.scouting));
  const head = staff.find((s) => s.role === 'headCoach');
  const best = analysts[0];
  const skill = best ? (best.attributes.drafting + best.attributes.scouting) / 2 : head ? head.attributes.tactics * 0.6 : 25;
  const q = clamp(0.1 + skill / 140 + team.facilities.analyticsLab * 0.08 + (analysts.length > 1 ? 0.05 : 0), 0.15, 1);
  return { q, who: best?.handle ?? head?.handle ?? 'the coaching staff' };
}
/** Smallest severity the staff notices at this quality. */
export const sevFloor = (q: number) => (q < 0.4 ? 2 : 1);

/** Store the analyst's breakdown of one of the user's games (series.ts playNextGame). */
export function saveAnalysis(state: GameState, f: MatchFixture, gameNo: number, a: GameAnalysis, blue: string, red: string, playerIds: string[]) {
  const user = state.userTeamId;
  if (blue !== user && red !== user) return;
  const st = analysisState(state);
  const team = state.teams[user];
  const userSide: 0 | 1 = blue === user ? 0 : 1;
  st.reports.unshift({
    id: `rep_${state.seq++}`, fixtureId: f.id, gameNo, date: state.date, comp: state.competitions[f.competitionId]?.name ?? '',
    blue, red, userSide, won: a.winner === userSide, quality: analystQuality(state, team).q, playerIds, a,
  });
  if (st.reports.length > MAX_REPORTS) st.reports.length = MAX_REPORTS;
}
export const reportById = (state: GameState, id?: string) => analysisState(state).reports.find((r) => r.id === id);

// ------------------------------------------------------------------ the presentation
const ATTR_OF: Record<MistakeKind, keyof PlayerAttributes> = {
  facecheck: 'vision', no_vision: 'vision', low_vision: 'vision', overextend: 'macro', greedy_farm: 'macro', caught: 'macro', unspent: 'macro',
  solo_engage: 'teamfight', outnumbered: 'teamfight', chased: 'teamfight', tower_dive: 'teamfight', wasted_flash: 'consistency',
  lane_lost: 'laning', smite_lost: 'objectives', obj_given: 'objectives', bad_call: 'shotcalling', missed_call: 'shotcalling', throw: 'shotcalling',
};
const KIND_LABEL: Record<MistakeKind, string> = {
  facecheck: 'Face-check', no_vision: 'No vision', low_vision: 'Low vision', overextend: 'Overextended', greedy_farm: 'Greedy farm', caught: 'Caught out',
  unspent: 'Unspent gold', solo_engage: 'Solo engage', outnumbered: 'Outnumbered fight', chased: 'Chased too deep', tower_dive: 'Tower dive',
  wasted_flash: 'Wasted Flash', lane_lost: 'Lane lost', smite_lost: 'Smite lost', obj_given: 'Objective given', bad_call: 'Bad call', missed_call: 'Missed call', throw: 'Throw',
};
export const mistakeLabel = (k: string) => KIND_LABEL[k as MistakeKind] ?? k;
export const mistakeAttr = (k: string) => ATTR_OF[k as MistakeKind];

export interface CoachView {
  quality: number; analyst: string;
  ours: Mistake[]; theirs: Mistake[];
  reasons: string[];                         // why we won / lost, in a few lines
  notes: string[];                           // coach's notes (more with better staff)
  focus: { playerId: string; attr: keyof PlayerAttributes; why: string; n: number }[];
  missed: number;                            // mistakes the staff didn't catch (shown as a hint)
}

/** What the staff make of a report. */
export function coachView(state: GameState, r: StoredReport): CoachView {
  const a = r.a, us = r.userSide, them = (1 - us) as 0 | 1;
  const floor = sevFloor(r.quality);
  const all = a.mistakes.filter((m) => m.side === us);
  const ours = all.filter((m) => m.sev >= floor);
  const theirs = a.mistakes.filter((m) => m.side === them && m.sev >= floor);
  const weight = (m: Mistake) => m.sev * 2 + m.cost / 800;
  const won = r.won;
  const reasons: string[] = [];
  const byKind = (list: Mistake[]) => {
    const g: Record<string, Mistake[]> = {};
    for (const m of list) (g[m.kind] ??= []).push(m);
    return Object.entries(g).sort((x, y) => y[1].reduce((s, m) => s + weight(m), 0) - x[1].reduce((s, m) => s + weight(m), 0));
  };
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const sum = (list: Mistake[]) => list.reduce((s, m) => s + m.cost, 0);
  // the story of the game: the costliest themes on the losing side, the gifts we took on the winning side
  const lead = won ? byKind(theirs).slice(0, 2) : byKind(ours).slice(0, 3);
  for (const [k, list] of lead) {
    const first = list[0];
    if (list.length === 1) reasons.push(`${won ? 'They' : 'We'}: ${first.text} (${mm(first.t)}).`);
    else reasons.push(`${won ? 'They' : 'We'}: ${list.length}× ${KIND_LABEL[k as MistakeKind].toLowerCase()} — ~${(sum(list) / 1000).toFixed(1)}k gold given away${k === 'caught' || k === 'greedy_farm' ? `, mostly after ${mm(Math.min(...list.map((m) => m.t)))}` : ''}.`);
  }
  if (won && ours.length) { const [k, list] = byKind(ours)[0]; reasons.push(`Still on us: ${list.length}× ${KIND_LABEL[k as MistakeKind].toLowerCase()}.`); }
  const throwM = a.mistakes.find((m) => m.kind === 'throw');
  if (throwM) reasons.unshift(throwM.side === us ? `We threw it: ${throwM.text.replace(/^\S+ /, '')}.` : `They threw a ${(a.maxLead[them] / 1000).toFixed(1)}k lead and we punished it.`);
  // notes: lanes, vision, calls, objectives (better staff → more)
  const notes: string[] = [];
  const mine = a.players.filter((p) => p.side === us);
  const lanes = mine.filter((p) => p.role !== 'jungle' && p.role !== 'support').sort((x, y) => x.csd10 - y.csd10);
  if (lanes[0] && lanes[0].csd10 <= -10) notes.push(`${lanes[0].name} was down ${-lanes[0].csd10} CS at 10 — the matchup needs prep, or jungle attention early.`);
  const best = [...lanes].sort((x, y) => y.csd10 - x.csd10)[0];
  if (best && best.csd10 >= 12) notes.push(`${best.name} won lane by ${best.csd10} CS at 10 — we can play through that side.`);
  const wardsUs = mine.reduce((s, p) => s + p.wards, 0), wardsThem = a.players.filter((p) => p.side === them).reduce((s, p) => s + p.wards, 0);
  if (wardsUs < wardsThem * 0.85) notes.push(`Vision: we placed ${wardsUs} wards to their ${wardsThem}.`);
  const objs = a.objectives;
  const given = objs.filter((o) => o.side === them && o.note === 'uncontested').length;
  if (given) notes.push(`${given} major objective${given > 1 ? 's' : ''} given up with nobody near and nothing traded.`);
  if (a.calls.bad[us] > 0) notes.push(`${a.calls.bad[us]} objective call${a.calls.bad[us] > 1 ? 's' : ''} made on a misread of where they were — the shotcaller needs better information (vision) or more patience.`);
  if (a.calls.good[us] >= 5 && !a.calls.bad[us]) notes.push(`Objective calls were clean: ${a.calls.good[us]} good reads, no misreads.`);
  const fights = a.fights.filter((f) => f.kills[0] + f.kills[1] >= 4);
  const won4 = fights.filter((f) => f.kills[us] > f.kills[them]).length;
  if (fights.length) notes.push(`Teamfights: won ${won4} of ${fights.length}.`);
  const keepNotes = Math.max(1, Math.round(1 + r.quality * 4));
  // training focus: per player, the attribute behind most of their (noticed) mistakes
  const focus: CoachView['focus'] = [];
  for (const p of mine) {
    const list = ours.filter((m) => m.who === p.idx);
    if (!list.length) continue;
    const tally: Partial<Record<keyof PlayerAttributes, number>> = {};
    for (const m of list) { const at = ATTR_OF[m.kind]; tally[at] = (tally[at] ?? 0) + m.sev; }
    const [attr, n] = (Object.entries(tally) as [keyof PlayerAttributes, number][]).sort((x, y) => y[1] - x[1])[0];
    const pid = r.playerIds[p.idx];
    if (pid) focus.push({ playerId: pid, attr, why: list.map((m) => KIND_LABEL[m.kind].toLowerCase()).filter((x, i, arr) => arr.indexOf(x) === i).join(', '), n });
  }
  focus.sort((x, y) => y.n - x.n);
  const q = analystQuality(state, state.teams[state.userTeamId]);
  return { quality: r.quality, analyst: q.who, ours, theirs, reasons: reasons.slice(0, 4), notes: notes.slice(0, keepNotes), focus, missed: all.length - ours.length };
}

// ------------------------------------------------------------------ the VOD review
const PUNISHABLE = new Set<MistakeKind>(['facecheck', 'overextend', 'solo_engage', 'wasted_flash']);
export const LESSON_DAYS = 14;

/** Sit the team down with the VOD: lessons for the players whose mistakes the staff caught. Once per report. */
export function reviewWithTeam(state: GameState, id: string): { ok: boolean; message: string } {
  const st = analysisState(state);
  const r = st.reports.find((x) => x.id === id);
  if (!r) return { ok: false, message: 'Report not found.' };
  if (r.reviewed) return { ok: false, message: 'Already reviewed with the team.' };
  const view = coachView(state, r);
  const team = state.teams[state.userTeamId];
  const lessons: string[] = [];
  for (const f of view.focus) {
    const p = state.players[f.playerId];
    if (!p || p.teamId !== team.id) continue;
    st.lessons[p.id] = { attr: f.attr, until: addDays(state.date, LESSON_DAYS), why: f.why };
    lessons.push(`${p.handle} → ${f.attr}`);
    // the punishable habits get named in front of everyone: a little more care next time (egos don't love it)
    const habits = view.ours.filter((m) => m.who !== undefined && r.playerIds[m.who] === p.id && PUNISHABLE.has(m.kind as MistakeKind)).length;
    if (habits) p.hidden.mistakes = Math.max(10, p.hidden.mistakes - 0.6 * habits);
    if (p.hidden.ego > 70 && f.n >= 3) p.morale = clamp(p.morale - 1.5, 5, 100);
  }
  for (const pid of ROLES.map((ro) => team.lineup[ro]).filter((x): x is string => !!x)) {
    const p = state.players[pid];
    if (p) p.fatigue = clamp(p.fatigue + 1.5, 0, 100);
  }
  r.reviewed = state.date;
  return { ok: true, message: lessons.length ? `VOD review done. Lessons for two weeks: ${lessons.join(', ')}.` : 'VOD review done — nothing big to fix, the team walks out confident.' };
}

/** Training weights from active lessons (development.ts weekPlan). */
export function applyLessons(state: GameState, p: Player, weights: Partial<Record<keyof PlayerAttributes, number>>) {
  const l = state.analysis?.lessons[p.id];
  if (!l || l.until < state.date) return;
  weights[l.attr] = (weights[l.attr] ?? 0) + 35;
}
