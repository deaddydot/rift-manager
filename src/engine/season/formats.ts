// Tournament formats: round robin, groups, GSL, Swiss, single & double elimination.
// Fixtures are created per stage; brackets are wired with winnerTo / loserTo links and
// later rounds are filled in as results come in.
import type { Competition, Stage, MatchFixture, StandingRow, StageFormat } from '../types';
import { RNG } from '../../util/rng';

export interface StageSpec {
  id: string;
  name: string;
  format: StageFormat;
  bestOf: number;
  start: string;
  end: string;
  rounds?: number;          // round robin repetitions / swiss rounds
  groups?: number;          // number of groups
  advance?: number;         // teams advancing from this stage
  size?: number;            // number of teams in the stage
  seedsFrom?: string;       // previous stage id
  finalBestOf?: number;     // e.g. Bo5 final in Bo3 brackets
  lowerBestOf?: number;
  fearless?: boolean;
  matchDays?: number[];     // weekdays (0=Sun) matches are played
}

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseDate = (s: string) => new Date(s + 'T00:00:00Z');
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5);
export const weekday = (s: string) => parseDate(s).getUTCDay();

/** Playable dates in [start, end] on the given weekdays. */
export function matchDates(start: string, end: string, days?: number[]): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (!days || days.includes(weekday(d))) out.push(d);
  return out.length ? out : [start];
}

let fixtureSeq = 0;
export const newFixtureId = (compId: string, stageId: string) => `${compId}:${stageId}:${(++fixtureSeq).toString(36)}`;
export function resetFixtureSeq(n: number) { fixtureSeq = n; }

function mkFixture(comp: Competition, stage: Stage, date: string, round: number, a: string | null, b: string | null, bestOf: number, extra: Partial<MatchFixture> = {}): MatchFixture {
  return { id: newFixtureId(comp.id, stage.id), competitionId: comp.id, stageId: stage.id, date, round, bestOf, teamA: a, teamB: b, fearless: extra.fearless ?? true, ...extra };
}

/** Circle method pairings for a single round robin. */
export function roundRobinPairs(teams: string[]): [string, string][][] {
  const t = [...teams];
  if (t.length % 2) t.push('__bye__');
  const n = t.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a !== '__bye__' && b !== '__bye__') pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop()!);
  }
  return rounds;
}

/** Spread rounds across available dates (several matches per day). */
function scheduleRounds(rounds: [string, string][][], dates: string[]): { date: string; round: number; a: string; b: string }[] {
  const total = rounds.reduce((s, r) => s + r.length, 0);
  const perDay = Math.max(1, Math.ceil(total / dates.length));
  const out: { date: string; round: number; a: string; b: string }[] = [];
  let di = 0, used = 0;
  rounds.forEach((pairs, ri) => {
    for (const [a, b] of pairs) {
      if (used >= perDay && di < dates.length - 1) { di++; used = 0; }
      out.push({ date: dates[di], round: ri + 1, a, b });
      used++;
    }
  });
  return out;
}

/** Create a stage with its initial fixtures. Bracket stages create placeholder fixtures with links. */
export function buildStage(comp: Competition, spec: StageSpec, teams: string[], rng: RNG): { stage: Stage; fixtures: MatchFixture[] } {
  const stage: Stage = {
    id: spec.id, name: spec.name, format: spec.format, bestOf: spec.bestOf, startDate: spec.start, endDate: spec.end,
    teams: [...teams], fixtures: [], status: 'pending', rounds: spec.rounds, advance: spec.advance, seedsFrom: spec.seedsFrom,
    config: { finalBestOf: spec.finalBestOf, lowerBestOf: spec.lowerBestOf, matchDays: spec.matchDays, groups: spec.groups },
  };
  const fixtures: MatchFixture[] = [];
  const dates = matchDates(spec.start, spec.end, spec.matchDays);
  const fearless = spec.fearless ?? true;
  switch (spec.format) {
    case 'roundRobin': {
      const reps = spec.rounds ?? 1;
      let all: [string, string][][] = [];
      for (let r = 0; r < reps; r++) {
        const rr = roundRobinPairs(teams);
        all = all.concat(r % 2 ? rr.map((p) => p.map(([a, b]) => [b, a] as [string, string])) : rr);
      }
      for (const f of scheduleRounds(all, dates)) fixtures.push(mkFixture(comp, stage, f.date, f.round, f.a, f.b, spec.bestOf, { fearless }));
      break;
    }
    case 'groups': {
      const g = spec.groups ?? 2;
      const groups: Record<string, string[]> = {};
      // snake seeding
      teams.forEach((t, i) => {
        const row = Math.floor(i / g), col = row % 2 ? g - 1 - (i % g) : i % g;
        const key = String.fromCharCode(65 + col);
        (groups[key] ??= []).push(t);
      });
      stage.groups = groups;
      const reps = spec.rounds ?? 1;
      const all: { date: string; round: number; a: string; b: string; group: string }[] = [];
      for (const [key, gt] of Object.entries(groups)) {
        let rr: [string, string][][] = [];
        for (let r = 0; r < reps; r++) rr = rr.concat(roundRobinPairs(gt));
        for (const f of scheduleRounds(rr, dates)) all.push({ ...f, group: key });
      }
      for (const f of all) fixtures.push(mkFixture(comp, stage, f.date, f.round, f.a, f.b, spec.bestOf, { group: f.group, fearless }));
      break;
    }
    case 'gsl': {
      // groups of 4: opening matches, winners' match, elimination match, decider
      const g = spec.groups ?? Math.max(1, Math.floor(teams.length / 4));
      const groups: Record<string, string[]> = {};
      teams.forEach((t, i) => { const key = String.fromCharCode(65 + (i % g)); (groups[key] ??= []).push(t); });
      stage.groups = groups;
      const d = (k: number) => dates[Math.min(dates.length - 1, k)];
      for (const [key, gt] of Object.entries(groups)) {
        const [s1, s2, s3, s4] = gt;
        const dec = mkFixture(comp, stage, d(3), 3, null, null, Math.max(spec.bestOf, 3), { group: key, label: 'Decider', fearless });
        const win = mkFixture(comp, stage, d(2), 2, null, null, Math.max(spec.bestOf, 3), { group: key, label: "Winners' match", fearless, feeds: { loserTo: [dec.id, 'A'] } });
        const elim = mkFixture(comp, stage, d(2), 2, null, null, Math.max(spec.bestOf, 3), { group: key, label: 'Elimination match', fearless, feeds: { winnerTo: [dec.id, 'B'] } });
        const o1 = mkFixture(comp, stage, d(0), 1, s1, s4 ?? null, spec.bestOf, { group: key, label: 'Opening', fearless, feeds: { winnerTo: [win.id, 'A'], loserTo: [elim.id, 'A'] } });
        const o2 = mkFixture(comp, stage, d(1), 1, s2, s3 ?? null, spec.bestOf, { group: key, label: 'Opening', fearless, feeds: { winnerTo: [win.id, 'B'], loserTo: [elim.id, 'B'] } });
        fixtures.push(o1, o2, win, elim, dec);
      }
      break;
    }
    case 'swiss': {
      // first round paired by seed (1 v 9, 2 v 10 ...); later rounds generated as results come in
      const half = Math.floor(teams.length / 2);
      for (let i = 0; i < half; i++) fixtures.push(mkFixture(comp, stage, dates[0], 1, teams[i], teams[i + half], 1, { fearless }));
      stage.rounds = spec.rounds ?? 5;
      break;
    }
    case 'singleElim': {
      fixtures.push(...buildSingleElim(comp, stage, teams, dates, spec));
      break;
    }
    case 'doubleElim': {
      fixtures.push(...buildDoubleElim(comp, stage, teams, dates, spec));
      break;
    }
  }
  stage.fixtures = fixtures.map((f) => f.id);
  return { stage, fixtures };
}

/** Standard seeding order for a bracket of size n (1 v n, ...). */
function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

function buildSingleElim(comp: Competition, stage: Stage, teams: string[], dates: string[], spec: StageSpec): MatchFixture[] {
  const n = teams.length;
  let size = 1; while (size < n) size *= 2;
  const rounds = Math.log2(size);
  const fx: MatchFixture[][] = [];
  const roundName = (r: number) => { const left = size / 2 ** r; return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 4 ? 'Quarterfinal' : `Round of ${left * 2}`; };
  // build from the final backwards so links exist
  for (let r = rounds; r >= 1; r--) {
    const count = size / 2 ** r;
    const dateIdx = Math.min(dates.length - 1, Math.round(((r - 1) / Math.max(1, rounds - 1)) * (dates.length - 1)));
    const bo = r === rounds ? spec.finalBestOf ?? spec.bestOf : spec.bestOf;
    fx[r] = Array.from({ length: count }, (_, i) => {
      const f = mkFixture(comp, stage, dates[dateIdx], r, null, null, bo, { label: roundName(r), fearless: spec.fearless ?? true });
      if (r < rounds) f.feeds = { winnerTo: [fx[r + 1][Math.floor(i / 2)].id, i % 2 ? 'B' : 'A'] };
      return f;
    });
  }
  // seed round 1; byes advance automatically
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    const a = teams[order[2 * i] - 1] ?? null, b = teams[order[2 * i + 1] - 1] ?? null;
    const f = fx[1][i];
    f.teamA = a; f.teamB = b;
    if (a && !b) markBye(f, a);
    if (b && !a) markBye(f, b);
  }
  // propagate byes
  const all = fx.slice(1).flat();
  for (const f of fx[1]) if (f.result) propagate(all, f);
  return all;
}

function markBye(f: MatchFixture, w: string) {
  f.result = { winner: w, loser: '', scoreA: 0, scoreB: 0, games: [] };
  f.label = (f.label ?? '') + ' (bye)';
}
function propagate(all: MatchFixture[], f: MatchFixture) {
  if (!f.result || !f.feeds?.winnerTo) return;
  const [id, slot] = f.feeds.winnerTo;
  const next = all.find((x) => x.id === id);
  if (next) { if (slot === 'A') next.teamA = f.result.winner; else next.teamB = f.result.winner; }
}

/**
 * Double elimination for 4, 6 or 8 teams (pro-style). 6 teams: seeds 1-2 get upper-bracket byes.
 */
function buildDoubleElim(comp: Competition, stage: Stage, teams: string[], dates: string[], spec: StageSpec): MatchFixture[] {
  const n = teams.length;
  const bo = spec.bestOf, fbo = spec.finalBestOf ?? bo, lbo = spec.lowerBestOf ?? bo;
  const fz = spec.fearless ?? true;
  const D = (k: number, of: number) => dates[Math.min(dates.length - 1, Math.round((k / Math.max(1, of)) * (dates.length - 1)))];
  const F = (date: string, round: number, label: string, b: number, a: string | null = null, c: string | null = null) => mkFixture(comp, stage, date, round, a, c, b, { label, fearless: fz });
  const out: MatchFixture[] = [];
  if (n <= 4) {
    const gf = F(D(5, 5), 5, 'Grand Final', fbo);
    const lf = F(D(4, 5), 4, 'Lower Final', lbo, null, null); lf.feeds = { winnerTo: [gf.id, 'B'] };
    const l1 = F(D(2, 5), 2, 'Lower Round 1', lbo); l1.feeds = { winnerTo: [lf.id, 'B'] };
    const uf = F(D(1, 5), 2, 'Upper Final', bo); uf.feeds = { winnerTo: [gf.id, 'A'], loserTo: [lf.id, 'A'] };
    const u1 = F(D(0, 5), 1, 'Upper Semifinal', bo, teams[0] ?? null, teams[3] ?? null); u1.feeds = { winnerTo: [uf.id, 'A'], loserTo: [l1.id, 'A'] };
    const u2 = F(D(0, 5), 1, 'Upper Semifinal', bo, teams[1] ?? null, teams[2] ?? null); u2.feeds = { winnerTo: [uf.id, 'B'], loserTo: [l1.id, 'B'] };
    out.push(u1, u2, uf, l1, lf, gf);
    return out;
  }
  if (n <= 6) {
    // R1 (upper): 3v6, 4v5 ; seeds 1,2 wait in upper semis
    const gf = F(D(7, 7), 6, 'Grand Final', fbo);
    const lf = F(D(6, 7), 5, 'Lower Final', lbo); lf.feeds = { winnerTo: [gf.id, 'B'] };
    const uf = F(D(4, 7), 4, 'Upper Final', bo); uf.feeds = { winnerTo: [gf.id, 'A'], loserTo: [lf.id, 'A'] };
    const l2 = F(D(5, 7), 4, 'Lower Round 2', lbo); l2.feeds = { winnerTo: [lf.id, 'B'] };
    const l1a = F(D(3, 7), 3, 'Lower Round 1', lbo); l1a.feeds = { winnerTo: [l2.id, 'A'] };
    const l1b = F(D(3, 7), 3, 'Lower Round 1', lbo); l1b.feeds = { winnerTo: [l2.id, 'B'] };
    const us1 = F(D(2, 7), 2, 'Upper Semifinal', bo, teams[0] ?? null, null); us1.feeds = { winnerTo: [uf.id, 'A'], loserTo: [l1a.id, 'A'] };
    const us2 = F(D(2, 7), 2, 'Upper Semifinal', bo, teams[1] ?? null, null); us2.feeds = { winnerTo: [uf.id, 'B'], loserTo: [l1b.id, 'A'] };
    const r1a = F(D(0, 7), 1, 'Round 1', bo, teams[3] ?? null, teams[4] ?? null); r1a.feeds = { winnerTo: [us1.id, 'B'], loserTo: [l1b.id, 'B'] };
    const r1b = F(D(1, 7), 1, 'Round 1', bo, teams[2] ?? null, teams[5] ?? null); r1b.feeds = { winnerTo: [us2.id, 'B'], loserTo: [l1a.id, 'B'] };
    out.push(r1a, r1b, us1, us2, l1a, l1b, uf, l2, lf, gf);
    return out;
  }
  // 8 teams
  const gf = F(D(9, 9), 7, 'Grand Final', fbo);
  const lf = F(D(8, 9), 6, 'Lower Final', lbo); lf.feeds = { winnerTo: [gf.id, 'B'] };
  const l3 = F(D(7, 9), 5, 'Lower Round 3', lbo); l3.feeds = { winnerTo: [lf.id, 'B'] };
  const uf = F(D(5, 9), 4, 'Upper Final', bo); uf.feeds = { winnerTo: [gf.id, 'A'], loserTo: [lf.id, 'A'] };
  const l2a = F(D(4, 9), 4, 'Lower Round 2', lbo); l2a.feeds = { winnerTo: [l3.id, 'A'] };
  const l2b = F(D(4, 9), 4, 'Lower Round 2', lbo); l2b.feeds = { winnerTo: [l3.id, 'B'] };
  const us1 = F(D(2, 9), 2, 'Upper Semifinal', bo); us1.feeds = { winnerTo: [uf.id, 'A'], loserTo: [l2b.id, 'A'] };
  const us2 = F(D(2, 9), 2, 'Upper Semifinal', bo); us2.feeds = { winnerTo: [uf.id, 'B'], loserTo: [l2a.id, 'A'] };
  const l1a = F(D(3, 9), 3, 'Lower Round 1', lbo); l1a.feeds = { winnerTo: [l2a.id, 'B'] };
  const l1b = F(D(3, 9), 3, 'Lower Round 1', lbo); l1b.feeds = { winnerTo: [l2b.id, 'B'] };
  const order = seedOrder(8);
  const q = [0, 1, 2, 3].map((i) => {
    const f = F(D(i < 2 ? 0 : 1, 9), 1, 'Upper Quarterfinal', bo, teams[order[2 * i] - 1] ?? null, teams[order[2 * i + 1] - 1] ?? null);
    return f;
  });
  q[0].feeds = { winnerTo: [us1.id, 'A'], loserTo: [l1a.id, 'A'] };
  q[1].feeds = { winnerTo: [us1.id, 'B'], loserTo: [l1a.id, 'B'] };
  q[2].feeds = { winnerTo: [us2.id, 'A'], loserTo: [l1b.id, 'A'] };
  q[3].feeds = { winnerTo: [us2.id, 'B'], loserTo: [l1b.id, 'B'] };
  out.push(...q, us1, us2, l1a, l1b, uf, l2a, l2b, l3, lf, gf);
  return out;
}

// ------------------------------------------------------------------ standings & progression
export function standings(stage: Stage, fixtures: Record<string, MatchFixture>, group?: string): StandingRow[] {
  const rows: Record<string, StandingRow> = {};
  const teams = group && stage.groups ? stage.groups[group] : stage.teams;
  for (const t of teams) rows[t] = { teamId: t, w: 0, l: 0, gw: 0, gl: 0, swissW: 0, swissL: 0 };
  for (const id of stage.fixtures) {
    const f = fixtures[id];
    if (!f?.result || !f.teamA || !f.teamB) continue;
    if (group && f.group !== group) continue;
    const a = rows[f.teamA], b = rows[f.teamB];
    if (!a || !b) continue;
    if (f.result.winner === f.teamA) { a.w++; b.l++; } else { b.w++; a.l++; }
    a.gw += f.result.scoreA; a.gl += f.result.scoreB; b.gw += f.result.scoreB; b.gl += f.result.scoreA;
  }
  // head-to-head tiebreak (simple): wins, game diff, h2h
  const h2h = (x: string, y: string) => {
    let s = 0;
    for (const id of stage.fixtures) {
      const f = fixtures[id];
      if (!f?.result) continue;
      if ((f.teamA === x && f.teamB === y) || (f.teamA === y && f.teamB === x)) s += f.result.winner === x ? 1 : -1;
    }
    return s;
  };
  return Object.values(rows).sort((a, b) => b.w - a.w || (b.gw - b.gl) - (a.gw - a.gl) || -h2h(a.teamId, b.teamId) || b.gw - a.gw);
}

/** Apply a finished fixture's result to linked bracket fixtures. */
export function feedResult(f: MatchFixture, fixtures: Record<string, MatchFixture>) {
  if (!f.result) return;
  const put = (link: [string, 'A' | 'B'] | undefined, team: string) => {
    if (!link || !team) return;
    const next = fixtures[link[0]];
    if (!next) return;
    if (link[1] === 'A') next.teamA = team; else next.teamB = team;
    // an opponent never arrives (bye in feeder): auto-advance
  };
  put(f.feeds?.winnerTo, f.result.winner);
  put(f.feeds?.loserTo, f.result.loser);
}

/** Swiss: after a round completes, pair teams with equal records (avoiding rematches). */
export function nextSwissRound(comp: Competition, stage: Stage, fixtures: Record<string, MatchFixture>, rng: RNG): MatchFixture[] {
  const all = stage.fixtures.map((id) => fixtures[id]);
  if (all.some((f) => !f.result)) return [];
  const rec: Record<string, { w: number; l: number; opp: Set<string> }> = {};
  for (const t of stage.teams) rec[t] = { w: 0, l: 0, opp: new Set() };
  for (const f of all) {
    if (!f.teamA || !f.teamB || !f.result) continue;
    rec[f.teamA].opp.add(f.teamB); rec[f.teamB].opp.add(f.teamA);
    rec[f.result.winner].w++; rec[f.result.loser].l++;
  }
  const alive = stage.teams.filter((t) => rec[t].w < 3 && rec[t].l < 3);
  if (!alive.length) return [];
  const round = Math.max(...all.map((f) => f.round)) + 1;
  if (round > (stage.rounds ?? 5)) return [];
  const dates = matchDates(stage.startDate, stage.endDate, (stage.config?.matchDays as number[]) ?? undefined);
  const date = dates[Math.min(dates.length - 1, Math.round(((round - 1) / Math.max(1, (stage.rounds ?? 5) - 1)) * (dates.length - 1)))];
  const buckets: Record<string, string[]> = {};
  for (const t of alive) (buckets[`${rec[t].w}-${rec[t].l}`] ??= []).push(t);
  const out: MatchFixture[] = [];
  for (const [key, ts] of Object.entries(buckets)) {
    const pool = rng.shuffle([...ts]);
    const [w, l] = key.split('-').map(Number);
    const decisive = w === 2 || l === 2;
    while (pool.length >= 2) {
      const a = pool.shift()!;
      let j = pool.findIndex((b) => !rec[a].opp.has(b));
      if (j < 0) j = 0;
      const b = pool.splice(j, 1)[0];
      const f: MatchFixture = { id: newFixtureId(comp.id, stage.id), competitionId: comp.id, stageId: stage.id, date, round, bestOf: decisive ? 3 : 1, teamA: a, teamB: b, label: `Round ${round} (${key})`, fearless: true };
      out.push(f);
    }
  }
  return out;
}

/** Final ordering of a finished stage (used for seeding the next stage and placements). */
export function stageResults(stage: Stage, fixtures: Record<string, MatchFixture>): string[] {
  const fx = stage.fixtures.map((id) => fixtures[id]).filter(Boolean);
  switch (stage.format) {
    case 'roundRobin': return standings(stage, fixtures).map((r) => r.teamId);
    case 'groups': {
      const groups = Object.keys(stage.groups ?? {});
      const per = groups.map((g) => standings(stage, fixtures, g).map((r) => r.teamId));
      const out: string[] = [];
      const maxLen = Math.max(...per.map((p) => p.length));
      for (let i = 0; i < maxLen; i++) for (const p of per) if (p[i]) out.push(p[i]);
      return out;
    }
    case 'gsl': {
      const groups = Object.keys(stage.groups ?? {});
      const firsts: string[] = [], seconds: string[] = [], thirds: string[] = [], fourths: string[] = [];
      for (const g of groups) {
        const gf = fx.filter((f) => f.group === g);
        const win = gf.find((f) => f.label === "Winners' match");
        const dec = gf.find((f) => f.label === 'Decider');
        const elim = gf.find((f) => f.label === 'Elimination match');
        if (win?.result) firsts.push(win.result.winner);
        if (dec?.result) { seconds.push(dec.result.winner); thirds.push(dec.result.loser); }
        if (elim?.result) fourths.push(elim.result.loser);
      }
      return [...firsts, ...seconds, ...thirds, ...fourths];
    }
    case 'swiss': {
      const rec: Record<string, { w: number; l: number }> = {};
      for (const t of stage.teams) rec[t] = { w: 0, l: 0 };
      for (const f of fx) if (f.result?.winner && f.result.loser) { rec[f.result.winner].w++; rec[f.result.loser].l++; }
      return [...stage.teams].sort((a, b) => rec[b].w - rec[a].w || rec[a].l - rec[b].l);
    }
    case 'singleElim':
    case 'doubleElim': {
      // order by elimination round (later = better), champion first
      const elim: Record<string, number> = {};
      let champion = '';
      for (const f of fx) {
        if (!f.result) continue;
        if (f.result.loser && !(f.feeds?.loserTo)) elim[f.result.loser] = Math.max(elim[f.result.loser] ?? 0, f.round);
        if (!f.result.winner) continue;
        if (!f.feeds?.winnerTo) champion = f.result.winner;
      }
      const rest = stage.teams.filter((t) => t !== champion).sort((a, b) => (elim[b] ?? 0) - (elim[a] ?? 0));
      return champion ? [champion, ...rest] : rest;
    }
  }
  return stage.teams;
}

export function stageComplete(stage: Stage, fixtures: Record<string, MatchFixture>): boolean {
  const fx = stage.fixtures.map((id) => fixtures[id]);
  if (!fx.length) return false;
  if (fx.some((f) => !f.result)) return false;
  if (stage.format === 'swiss') {
    const rec: Record<string, { w: number; l: number }> = {};
    for (const t of stage.teams) rec[t] = { w: 0, l: 0 };
    for (const f of fx) if (f.result) { rec[f.result.winner].w++; rec[f.result.loser].l++; }
    return stage.teams.every((t) => rec[t].w >= 3 || rec[t].l >= 3);
  }
  return true;
}
