// Read-only helpers used by the schedule / competition / fixture / team pages:
// results & form, team status inside a competition, qualification paths, seeding text,
// calendar milestones and simple pre-match estimates. Nothing here mutates state
// (except lineupPlayers' stand-in creation, which the engine does as well).
import type { GameState, MatchFixture, Competition, Stage, Team, StageFormat } from '../types';
import { ROLES } from '../types';
import { standings, type StageSpec } from '../season/formats';
import { placementLabel, type CompExt } from '../season/season';
import { lineupPlayers } from '../season/prep';
import { overall } from '../setup';
import { inTransferWindow } from './transfers';
import { simRating } from '../ratings';

export { inTransferWindow };

// ------------------------------------------------------------------ small utils
export const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const byDate = (a: MatchFixture, b: MatchFixture) => a.date.localeCompare(b.date) || a.round - b.round || a.id.localeCompare(b.id);
export const involves = (f: MatchFixture, t: string) => f.teamA === t || f.teamB === t;
export const opponentOf = (f: MatchFixture, t: string) => (f.teamA === t ? f.teamB : f.teamB === t ? f.teamA : null);
/** A walk-over result (no opponent) — not a real match. */
export const isBye = (f: MatchFixture) => !!f.result && (!f.result.loser || !f.teamA || !f.teamB);
export const isPlayed = (f: MatchFixture) => !!f.result && !isBye(f);
export const cleanLabel = (l?: string) => (l ? l.replace(/\s*\(bye\)\s*$/, '').trim() || undefined : undefined);
export const ext = (c: Competition) => c as CompExt;
export const templateOf = (c: Competition) => c.id.slice(String(c.season).length + 1);

export function outcome(f: MatchFixture, t: string): 'W' | 'L' | null {
  if (!isPlayed(f)) return null;
  return f.result!.winner === t ? 'W' : f.result!.loser === t ? 'L' : null;
}
/** [own, opponent] series score from a team's point of view. */
export function scoreFor(f: MatchFixture, t: string): [number, number] | null {
  if (!f.result) return null;
  return f.teamA === t ? [f.result.scoreA, f.result.scoreB] : [f.result.scoreB, f.result.scoreA];
}

// ------------------------------------------------------------------ team results
export function teamFixtures(state: GameState, teamId: string, season?: number): MatchFixture[] {
  return Object.values(state.fixtures)
    .filter((f) => involves(f, teamId) && (season === undefined || state.competitions[f.competitionId]?.season === season))
    .sort(byDate);
}
/** Played (non-bye) fixtures of a team, most recent first. */
export function teamResults(state: GameState, teamId: string, season?: number): MatchFixture[] {
  return teamFixtures(state, teamId, season).filter(isPlayed).reverse();
}
/** Last n results, oldest first. */
export function formOf(state: GameState, teamId: string, n = 5, season?: number): { f: MatchFixture; r: 'W' | 'L' }[] {
  return teamResults(state, teamId, season).slice(0, n).reverse().map((f) => ({ f, r: outcome(f, teamId)! }));
}
export function seasonRecord(state: GameState, teamId: string, season: number) {
  const rec = { w: 0, l: 0, gw: 0, gl: 0 };
  for (const f of teamResults(state, teamId, season)) {
    const s = scoreFor(f, teamId)!;
    if (f.result!.winner === teamId) rec.w++; else rec.l++;
    rec.gw += s[0]; rec.gl += s[1];
  }
  return rec;
}
export function headToHead(state: GameState, a: string, b: string): MatchFixture[] {
  return Object.values(state.fixtures).filter((f) => isPlayed(f) && involves(f, a) && involves(f, b)).sort(byDate).reverse();
}

// ------------------------------------------------------------------ competitions
export const seasonComps = (state: GameState, season = state.season) => Object.values(state.competitions).filter((c) => c.season === season);
export const stageFixtures = (state: GameState, stage: Stage) => stage.fixtures.map((id) => state.fixtures[id]).filter(Boolean);
export const compFixtures = (state: GameState, comp: Competition) => comp.stages.flatMap((s) => stageFixtures(state, s));
export const stagePlan = (comp: Competition): StageSpec[] => ext(comp).specs ?? [];

const INTL_SIZE: Record<string, number> = { FST: 8, MSI: 11, WORLDS: 17, EWC: 16, 'EM-spring': 16, 'EM-summer': 16 };

/** Number of teams (known, or expected from the seed rule for competitions that have not started). */
export function expectedTeams(state: GameState, comp: Competition): number | null {
  if (comp.teams.length) return comp.teams.length;
  const [kind, a, b, c] = (comp.seedRule ?? '').split(':');
  switch (kind) {
    case 'league': return Object.values(state.teams).filter((t) => t.leagueId === a).length || null;
    case 'top': case 'combined': return Number(b) || null;
    case 'placements': return Number(c) || null;
    case 'promotion': return Math.min(4, 1 + (b ?? '').split(',').length * ((b ?? '').split(',').length === 1 ? 3 : 1));
    case 'kespa': return Object.values(state.teams).filter((t) => t.leagueId === 'LCK').length + 6;
    case 'intl': return INTL_SIZE[a] ?? null;
  }
  return null;
}

/** Human-readable description of how a competition's field is decided. */
export function seedRuleText(state: GameState, comp: Competition): string {
  const [kind, a, b, c] = (comp.seedRule ?? '').split(':');
  const name = (tpl: string) => state.competitions[`${comp.season}-${tpl}`]?.name ?? tpl;
  switch (kind) {
    case 'league': return `All ${state.leagues[a]?.name ?? a} teams`;
    case 'top': return `Top ${b} of the ${name(a)}`;
    case 'combined': return `Top ${b} by combined record (${a.split('+').map(name).join(' + ')})`;
    case 'placements': return `${ord(Number(b))}–${ord(Number(b) + Number(c) - 1)} place of the ${name(a)}`;
    case 'promotion': return `Last-placed ${state.leagues[a]?.name ?? a} team vs. the best challengers from ${b.split(',').map((l) => state.leagues[l]?.name ?? l).join(', ')}`;
    case 'kespa': return 'All LCK teams plus the top LCK CL sides';
    case 'intl': return 'Teams qualify through regional leagues & playoffs';
  }
  return '—';
}

export interface QualPath { label: string; from: number; count: number; target?: Competition }

/** Where the placements of a competition lead (playoffs, internationals, promotion…). */
export function qualPaths(state: GameState, comp: Competition): QualPath[] {
  const tpl = templateOf(comp);
  const out: QualPath[] = [];
  for (const c of Object.values(state.competitions)) {
    if (c.season !== comp.season || c.id === comp.id || !c.seedRule) continue;
    const [kind, a, b, cc] = c.seedRule.split(':');
    if (kind === 'top' && a === tpl) out.push({ label: `Top ${b} → ${c.short}`, from: 0, count: Number(b), target: c });
    else if (kind === 'combined' && a.split('+').includes(tpl)) out.push({ label: `Top ${b} (combined) → ${c.short}`, from: 0, count: Number(b), target: c });
    else if (kind === 'placements' && a === tpl) out.push({ label: `${ord(Number(b))}–${ord(Number(b) + Number(cc) - 1)} → ${c.short}`, from: Number(b) - 1, count: Number(cc), target: c });
  }
  for (const q of ext(comp).qualifiesTo ?? []) {
    const target = state.competitions[`${comp.season}-${q.event}`] ?? (q.event === 'WORLDS-PI' ? state.competitions[`${comp.season}-WORLDS`] : undefined);
    const what = q.event === 'WORLDS-PI' ? 'Worlds Play-In' : target?.short ?? q.event;
    const from = q.from ?? 0;
    const range = q.count === 1 ? (from === 0 ? 'Winner' : ord(from + 1)) : from === 0 ? `Top ${q.count}` : `${ord(from + 1)}–${ord(from + q.count)}`;
    out.push({ label: `${range} → ${what}`, from, count: q.count, target });
  }
  return out;
}

/** Highlight zones for a stage's standings (advancement / qualification). */
export function stageZones(state: GameState, comp: Competition, stage: Stage): { from: number; count: number; label: string }[] {
  const specs = stagePlan(comp);
  const idx = specs.findIndex((s) => s.id === stage.id);
  const next = idx >= 0 ? specs[idx + 1] : undefined;
  if (next) {
    const adv = stage.format === 'swiss' ? 8 : (next as StageSpec & { advance?: number }).advance ?? stage.advance;
    if (adv) return [{ from: 0, count: adv, label: `Advance to ${next.name}` }];
    return [];
  }
  return qualPaths(state, comp).filter((q) => q.count > 0);
}

export interface TeamStatus { text: string; sub?: string; tone: 'gold' | 'good' | 'bad' | 'live' | 'muted'; rank?: number }

/** Where a team stands in a competition (placement, table position, bracket status…). */
export function teamStatusIn(state: GameState, comp: Competition, teamId: string): TeamStatus | null {
  const pl = comp.placements?.[teamId];
  if (pl) {
    let sub: string | undefined;
    const last = comp.stages[comp.stages.length - 1];
    if (last && (last.format === 'roundRobin' || last.format === 'groups')) {
      const r = standings(last, state.fixtures).find((x) => x.teamId === teamId);
      if (r) sub = `${r.w}-${r.l}`;
    }
    return { text: comp.kind === 'league' ? `${ord(pl)} place` : placementLabel(pl, comp), sub, tone: pl === 1 ? 'gold' : pl <= 4 ? 'good' : 'muted', rank: pl };
  }
  if (comp.status === 'upcoming' || !comp.teams.includes(teamId)) return null;
  const stage = comp.stages[comp.stages.length - 1];
  if (!stage) return { text: 'Qualified', tone: 'muted' };
  if (!stage.teams.includes(teamId)) {
    const direct = ext(comp).direct ?? {};
    const later = Object.entries(direct).find(([, ts]) => ts.includes(teamId));
    if (later) return { text: `Seeded into ${stagePlan(comp).find((s) => s.id === later[0])?.name ?? 'next stage'}`, tone: 'live' };
    const prev = [...comp.stages].reverse().find((s) => s.teams.includes(teamId));
    return { text: prev ? `Out in ${prev.name}` : 'Eliminated', tone: 'bad' };
  }
  return stageStatus(state, stage, teamId);
}

export function stageStatus(state: GameState, stage: Stage, teamId: string): TeamStatus {
  const fx = stageFixtures(state, stage);
  switch (stage.format) {
    case 'roundRobin': {
      const rows = standings(stage, state.fixtures);
      const i = rows.findIndex((r) => r.teamId === teamId);
      const r = rows[i];
      return { text: `${ord(i + 1)} of ${rows.length}`, sub: r ? `${r.w}-${r.l}` : undefined, tone: 'live', rank: i + 1 };
    }
    case 'groups': {
      const g = Object.entries(stage.groups ?? {}).find(([, ts]) => ts.includes(teamId))?.[0];
      const rows = standings(stage, state.fixtures, g);
      const i = rows.findIndex((r) => r.teamId === teamId);
      return { text: `Group ${g} · ${ord(i + 1)}`, sub: rows[i] ? `${rows[i].w}-${rows[i].l}` : undefined, tone: 'live', rank: i + 1 };
    }
    case 'gsl': {
      const g = Object.entries(stage.groups ?? {}).find(([, ts]) => ts.includes(teamId))?.[0];
      const gf = fx.filter((f) => f.group === g);
      const win = gf.find((f) => f.label === "Winners' match"), dec = gf.find((f) => f.label === 'Decider'), elim = gf.find((f) => f.label === 'Elimination match');
      if (win?.result?.winner === teamId) return { text: `Won group ${g}`, tone: 'good' };
      if (dec?.result?.winner === teamId) return { text: `2nd in group ${g}`, tone: 'good' };
      if (dec?.result?.loser === teamId || elim?.result?.loser === teamId) return { text: `Out in group ${g}`, tone: 'bad' };
      return { text: `Group ${g}`, sub: 'in progress', tone: 'live' };
    }
    case 'swiss': {
      let w = 0, l = 0;
      for (const f of fx) if (isPlayed(f)) { if (f.result!.winner === teamId) w++; else if (f.result!.loser === teamId) l++; }
      if (w >= 3) return { text: `Qualified ${w}-${l}`, tone: 'good' };
      if (l >= 3) return { text: `Eliminated ${w}-${l}`, tone: 'bad' };
      return { text: `Swiss ${w}-${l}`, tone: 'live' };
    }
    default: {
      const lost = fx.find((f) => isPlayed(f) && f.result!.loser === teamId && !f.feeds?.loserTo);
      if (lost) return { text: `Out · ${cleanLabel(lost.label) ?? `Round ${lost.round}`}`, tone: 'bad' };
      const won = fx.find((f) => isPlayed(f) && f.result!.winner === teamId && !f.feeds?.winnerTo);
      if (won) return { text: 'Champion', tone: 'gold' };
      const next = fx.filter((f) => !f.result && involves(f, teamId)).sort(byDate)[0];
      const lower = fx.some((f) => isPlayed(f) && f.result!.loser === teamId && f.feeds?.loserTo);
      return { text: next ? cleanLabel(next.label) ?? `Round ${next.round}` : 'Alive', sub: lower ? 'lower bracket' : undefined, tone: 'live' };
    }
  }
}

/** Whether a team is (or will be) in a competition: confirmed field, or an upcoming event its league feeds directly. */
export function willEnter(state: GameState, comp: Competition, teamId: string): boolean {
  if (comp.teams.includes(teamId)) return true;
  if (comp.status !== 'upcoming') return false;
  const lg = state.teams[teamId]?.leagueId;
  return comp.seedRule === `league:${lg}` || (comp.seedRule === 'kespa' && lg === 'LCK');
}

/** Teams still alive in a bracket / swiss / gsl stage. */
export function aliveTeams(state: GameState, stage: Stage): string[] {
  const fx = stageFixtures(state, stage);
  switch (stage.format) {
    case 'singleElim': case 'doubleElim':
      return stage.teams.filter((t) => !fx.some((f) => isPlayed(f) && f.result!.loser === t && !f.feeds?.loserTo));
    case 'swiss': return stage.teams.filter((t) => stageStatus(state, stage, t).tone === 'live');
    case 'gsl': return stage.teams.filter((t) => stageStatus(state, stage, t).tone !== 'bad');
    default: return stage.teams;
  }
}

/** One-line headline for a competition: champion when done, leader / stage progress when active. */
export function compHeadline(state: GameState, comp: Competition): { teamId?: string; text: string } | null {
  if (comp.status === 'done') return comp.winner ? { teamId: comp.winner, text: comp.kind === 'league' ? '1st place' : 'Champion' } : null;
  if (comp.status !== 'active') return null;
  const stage = comp.stages[comp.stages.length - 1];
  if (!stage) return null;
  const fx = stageFixtures(state, stage);
  const played = fx.filter(isPlayed).length;
  switch (stage.format) {
    case 'roundRobin': case 'groups': {
      if (!played) return { text: `${stage.name} · starting` };
      const rows = stage.format === 'groups'
        ? Object.keys(stage.groups ?? {}).map((g) => standings(stage, state.fixtures, g)[0]).filter(Boolean).sort((a, b) => b.w - a.w || (b.gw - b.gl) - (a.gw - a.gl))
        : standings(stage, state.fixtures);
      const top = rows[0];
      return { teamId: top.teamId, text: `${top.w}-${top.l} · ${stage.name}` };
    }
    case 'swiss': {
      const q = stage.teams.filter((t) => stageStatus(state, stage, t).tone === 'good').length;
      return { text: `${stage.name} · ${q}/8 qualified` };
    }
    case 'gsl': return { text: `${stage.name} · ${played}/${fx.length} played` };
    default: {
      const alive = aliveTeams(state, stage).length;
      const next = fx.filter((f) => !f.result).sort(byDate)[0];
      return { text: `${stage.name} · ${alive} left${next ? ` · ${cleanLabel(next.label) ?? ''}` : ''}` };
    }
  }
}

// ------------------------------------------------------------------ calendar
export interface Milestone { date: string; label: string; kind: 'window' | 'milestone' }
export function seasonMilestones(year: number): Milestone[] {
  return [
    { date: `${year}-01-15`, label: 'Transfer window closes', kind: 'window' },
    { date: `${year}-06-01`, label: 'Mid-season window opens', kind: 'window' },
    { date: `${year}-06-30`, label: 'Mid-season window closes', kind: 'window' },
    { date: `${year}-11-15`, label: 'Off-season window opens', kind: 'window' },
    { date: `${year}-11-18`, label: 'Contracts expire', kind: 'milestone' },
    { date: `${year}-11-20`, label: 'New prospects', kind: 'milestone' },
    { date: `${year}-12-01`, label: `Season ${year + 1} begins`, kind: 'milestone' },
  ];
}

// ------------------------------------------------------------------ pre-match estimates
export function lineupRating(state: GameState, team: Team): number {
  const lp = lineupPlayers(state, team);
  return ROLES.reduce((s, r) => s + overall(lp[r].attributes, r), 0) / ROLES.length;
}
/** Per-game win probability from lineup ratings (quick-sim logistic on match values, softened for draft/form noise). */
export const gameWinProb = (ratingA: number, ratingB: number) => Math.min(0.95, Math.max(0.05, 1 / (1 + Math.exp(-(simRating(ratingA) - simRating(ratingB)) / 6.5))));
/** Probability of winning a best-of-n series given a per-game win probability. */
export function seriesWinProb(p: number, bestOf: number): number {
  const need = Math.ceil(bestOf / 2);
  let total = 0, comb = 1;
  for (let k = 0; k < need; k++) {
    if (k > 0) comb = (comb * (need - 1 + k)) / k;
    total += comb * p ** need * (1 - p) ** k;
  }
  return total;
}

// ------------------------------------------------------------------ presentation constants (shared by the pages)
export const FORMAT_LABEL: Record<StageFormat, string> = {
  roundRobin: 'Round robin', groups: 'Groups', gsl: 'GSL groups', swiss: 'Swiss', singleElim: 'Single elimination', doubleElim: 'Double elimination',
};
export const KIND_LABEL: Record<Competition['kind'], string> = { league: 'League', playoffs: 'Playoffs', international: 'International', cup: 'Cup', qualifier: 'Qualifier' };
export const tierLabel = (t: number) => (t === 0 ? 'International' : `Tier ${t}`);

export function compColor(c?: Competition | null): string {
  if (!c) return '#64748b';
  const t = c.tags ?? [];
  if (t.includes('worlds')) return '#c8aa6e';
  if (t.includes('msi')) return '#a855f7';
  if (t.includes('fst')) return '#0ac8b9';
  if (t.includes('ewc')) return '#22c55e';
  if (t.includes('emea_masters')) return '#38bdf8';
  if (c.kind === 'playoffs' || c.kind === 'qualifier') return '#f97316';
  if (c.kind === 'cup') return '#eab308';
  return c.tier === 1 ? '#3b82f6' : c.tier === 2 ? '#7c8db5' : '#64748b';
}


export const TONE_COLOR: Record<TeamStatus['tone'], string> = { gold: '#f0c674', good: '#22c55e', bad: '#ef4444', live: '#0ac8b9', muted: '#8a97b3' };
