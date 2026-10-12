// Stream audience model check: simulate a season from a fresh save, then print the viewer model for real fixtures
// (Worlds final / knockouts / swiss, MSI final, First Stand, LCK T1–GEN and the LCK average, LEC, LCS, LCP, CBLOL,
// tier 2, tier 3) and the live peaks of a few full games run through the match engine.
//   npx tsx scripts/debug/audience.ts [team=t1-lck]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries, draftPicks } from '../../src/engine/season/series';
import { setMeta, newDraft, runAIDraft } from '../../src/engine/draft/draft';
import { draftTeam, simTeam } from '../../src/engine/season/prep';
import { MatchSim } from '../../src/engine/sim/engine';
import { RNG } from '../../src/util/rng';
import type { GameState, MatchFixture } from '../../src/engine/types';
import { audienceBase, audienceInput, AudienceTracker, fmtViewers, eventOf, stageOf } from '../../src/ui/match/broadcast/audience';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const state: GameState = createNewGame(db, userTeam, 'Tester', 12345);
const rng = new RNG(99);
const t0 = Date.now();
while (state.date < '2026-11-20') {
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, false); processDay(state); }
  endDay(state);
}
console.log(`season simulated to ${state.date} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

const fx = Object.values(state.fixtures).filter((f) => f.teamA && f.teamB && f.result && f.result.loser);
const comp = (f: MatchFixture) => state.competitions[f.competitionId];
const name = (f: MatchFixture) => `${state.teams[f.teamA!].short} vs ${state.teams[f.teamB!].short}`;
/** game 1 and the deciding game (score need-1 each) of a fixture */
function views(f: MatchFixture) {
  const a = audienceInput(state, f, { gameNo: 1, games: [] })!;
  const g1 = audienceBase(a);
  const need = Math.ceil(f.bestOf / 2);
  const dec = f.bestOf > 1 ? audienceBase({ ...a, gameNo: f.bestOf, wins: [need - 1, need - 1] }) : g1;
  return { g1: g1.viewers, dec: dec.viewers, parts: g1.parts, why: a.rivalryWhy };
}
const rows: [string, MatchFixture[]][] = [];
const pick = (label: string, pred: (f: MatchFixture) => boolean, max = 4) => rows.push([label, fx.filter(pred).slice(0, max)]);
const ev = (f: MatchFixture) => eventOf(comp(f));
const st = (f: MatchFixture) => stageOf(comp(f), f);
const lg = (f: MatchFixture) => comp(f)?.leagueId ?? state.teams[f.teamA!].leagueId;
const has = (f: MatchFixture, id: string) => f.teamA === id || f.teamB === id;
pick('Worlds final', (f) => ev(f) === 'worlds' && st(f) === 'final', 1);
pick('Worlds semis', (f) => ev(f) === 'worlds' && st(f) === 'semi', 2);
pick('Worlds quarters', (f) => ev(f) === 'worlds' && st(f) === 'quarter', 4);
pick('Worlds swiss', (f) => ev(f) === 'worlds' && st(f) === 'swiss', 4);
pick('MSI final', (f) => ev(f) === 'msi' && st(f) === 'final', 1);
pick('MSI bracket', (f) => ev(f) === 'msi' && (st(f) === 'semi' || st(f) === 'knockout' || st(f) === 'quarter'), 3);
pick('First Stand final', (f) => ev(f) === 'fst' && st(f) === 'final', 1);
pick('EWC final', (f) => ev(f) === 'ewc' && st(f) === 'final', 1);
pick('LCK regular T1–GEN', (f) => lg(f) === 'LCK' && st(f) === 'regular' && has(f, 't1-lck') && has(f, 'gen-lck'), 2);
pick('LCK regular T1–KT', (f) => lg(f) === 'LCK' && st(f) === 'regular' && has(f, 't1-lck') && has(f, 'kt-lck'), 1);
pick('LCK final', (f) => lg(f) === 'LCK' && st(f) === 'final' && comp(f)?.kind === 'playoffs', 2);
pick('LEC regular', (f) => lg(f) === 'LEC' && st(f) === 'regular', 3);
pick('LEC G2–FNC', (f) => lg(f) === 'LEC' && has(f, 'g2-lec') && has(f, 'fnc-lec'), 1);
pick('LCS regular', (f) => lg(f) === 'LCS' && st(f) === 'regular', 3);
pick('LCP regular', (f) => lg(f) === 'LCP' && st(f) === 'regular', 3);
pick('CBLOL regular', (f) => lg(f) === 'CBLOL' && st(f) === 'regular', 2);
pick('VCS regular (tier 2)', (f) => lg(f) === 'VCS' && st(f) === 'regular', 2);
pick('LCK CL regular (tier 2)', (f) => lg(f) === 'LCKCL' && st(f) === 'regular', 2);
pick('LFL regular (tier 2)', (f) => lg(f) === 'LFL' && st(f) === 'regular', 2);
pick('Tier 3 regular', (f) => (comp(f)?.tier ?? 0) === 3 && st(f) === 'regular', 3);

console.log('fixture'.padEnd(34), 'match'.padEnd(14), 'game 1'.padStart(8), 'decider'.padStart(8), '  breakdown');
for (const [label, list] of rows) {
  if (!list.length) { console.log(label.padEnd(34), '(none in this season)'); continue; }
  for (const f of list) {
    const v = views(f);
    console.log(label.padEnd(34), name(f).padEnd(14), fmtViewers(v.g1).padStart(8), fmtViewers(v.dec).padStart(8), '  ', v.parts.map((p) => `${p.k} ${p.x >= 1000 ? fmtViewers(p.x) : p.x.toFixed(2)}`).join(' · '), v.why ? `(${v.why})` : '');
  }
}
// averages per league (regular season, game 1)
console.log('\nregular-season game-1 averages (min – mean – max):');
for (const l of ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL', 'VCS', 'LCKCL', 'NACL', 'LFL', 'LCKAS', 'NEXUS']) {
  const vs = fx.filter((f) => lg(f) === l && st(f) === 'regular').map((f) => views(f).g1);
  if (!vs.length) continue;
  vs.sort((a, b) => a - b);
  console.log(`  ${l.padEnd(7)} ${fmtViewers(vs[0]).padStart(7)} – ${fmtViewers(vs.reduce((a, b) => a + b, 0) / vs.length).padStart(7)} – ${fmtViewers(vs[vs.length - 1]).padStart(7)}  (${vs.length} series)`);
}

// live: run full games and track the audience through the game
console.log('\nlive games (full engine): start → peak · end');
const live = (label: string, f: MatchFixture | undefined, gameNo = 1) => {
  if (!f) return;
  const blue = state.teams[f.teamA!], red = state.teams[f.teamB!];
  const d = newDraft(draftTeam(state, blue), draftTeam(state, red));
  const r = new RNG(7 + gameNo);
  runAIDraft(d, r, state.championPower);
  const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: 4242 + gameNo, bigMatch: true });
  const need = Math.ceil(f.bestOf / 2);
  const a = audienceInput(state, f, { gameNo, games: [], blueId: blue.id })!;
  const tr = new AudienceTracker(audienceBase(gameNo > 1 ? { ...a, wins: [need - 1, need - 1] } : a));
  let idx = 0, start = 0;
  const marks: string[] = [];
  while (sim.winner === null && sim.t < 75 * 60) {
    sim.step();
    for (; idx < sim.events.length; idx++) tr.onEvent(sim.events[idx]);
    const gold = sim.champs.reduce((s, c) => s + (c.side === 0 ? c.goldEarned : -c.goldEarned), 0);
    const v = tr.update({ t: sim.t, gold, winner: sim.winner, nexus: sim.nexusHp });
    if (!start) start = v;
    if (Math.floor(sim.t) % 300 === 0 && sim.t - Math.floor(sim.t) < sim.dt) marks.push(`${Math.floor(sim.t / 60)}m ${fmtViewers(v)}`);
  }
  console.log(`  ${label.padEnd(26)} ${name(f).padEnd(12)} ${fmtViewers(start)} → peak ${fmtViewers(tr.peak)} · end ${fmtViewers(tr.viewers)} (${Math.floor(sim.t / 60)} min)  [${marks.join(', ')}]`);
};
live('Worlds final, game 5', rows.find((r) => r[0] === 'Worlds final')?.[1][0], 5);
live('Worlds final, game 1', rows.find((r) => r[0] === 'Worlds final')?.[1][0], 1);
live('MSI final, game 1', rows.find((r) => r[0] === 'MSI final')?.[1][0], 1);
live('LCK T1–GEN, game 1', rows.find((r) => r[0] === 'LCK regular T1–GEN')?.[1][0], 1);
live('LEC regular, game 1', rows.find((r) => r[0] === 'LEC regular')?.[1][0], 1);
live('LCP regular, game 1', rows.find((r) => r[0] === 'LCP regular')?.[1][0], 1);
live('VCS regular, game 1', rows.find((r) => r[0] === 'VCS regular (tier 2)')?.[1][0], 1);
live('Tier 3, game 1', rows.find((r) => r[0] === 'Tier 3 regular')?.[1][0], 1);
