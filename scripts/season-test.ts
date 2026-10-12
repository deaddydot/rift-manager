// Headless season run: create a new game and simulate the whole 2026 season.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setGameData } from '../src/data/gamedata';
import { createNewGame, type Database } from '../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../src/engine/game';
import { simulateSeries } from '../src/engine/season/series';
import { setMeta } from '../src/engine/draft/draft';
import { RNG } from '../src/util/rng';
import { offerRenewal, salaryDemand } from '../src/engine/management/transfers';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const until = process.argv[3] ?? '2026-11-30';
const t0 = Date.now();
const state = createNewGame(db, userTeam, 'Tester', 12345);
console.log(`new game: ${Object.keys(state.players).length} players, ${Object.keys(state.teams).length} teams, ${Object.keys(state.competitions).length} competitions (${Date.now() - t0}ms)`);
const rng = new RNG(99);
let days = 0, userGames = 0;
const tl = Date.now();
while (state.date < until) {
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, process.env.FULL === '1'); userGames++; processDay(state); }
  if (state.date.slice(5) === '11-10') { const t = state.teams[userTeam]; for (const id of t.roster) { const p = state.players[id]; if (p.contract && p.contract.expires <= `${state.date.slice(0, 4)}-11-18`) offerRenewal(state, id, Math.round(salaryDemand(state, p, t) * 1.1), 2); } }
  endDay(state);
  days++;
  if (days % 60 === 0) console.log(`  ${state.date} fixtures=${Object.keys(state.fixtures).length} (${((Date.now() - tl) / days).toFixed(1)} ms/day)`);
}
console.log(`simulated ${days} days in ${Date.now() - tl}ms, user series ${userGames}`);
const comps = Object.values(state.competitions).sort((a, b) => a.startDate.localeCompare(b.startDate));
for (const c of comps) if (c.tier <= 1 || c.kind === 'international') {
  const w = c.winner ? state.teams[c.winner]?.name : '-';
  const ru = c.placements ? Object.entries(c.placements).find(([, p]) => p === 2)?.[0] : undefined;
  console.log(`${c.startDate} ${c.name.padEnd(36)} ${c.status.padEnd(8)} teams=${String(c.teams.length).padStart(2)} winner=${w}${ru ? ' (RU ' + state.teams[ru]?.name + ')' : ''}`);
}
console.log('qualified', Object.fromEntries(Object.entries(state.qualified).map(([k, v]) => [k, v.map((x) => state.teams[x.teamId]?.short + '/' + x.league)])));
{ // lore rule check: T1 vs LPL teams, every game
  let series = 0, games = 0, lost = 0;
  for (const f of Object.values(state.fixtures)) {
    if (!f.result || !f.teamA || !f.teamB) continue;
    const ids = [f.teamA, f.teamB];
    if (!ids.includes('t1-lck') || !ids.some((id) => state.teams[id]?.leagueId === 'LPL')) continue;
    series++;
    for (const g of f.result.games) { games++; if (g.winner !== 't1-lck') lost++; }
  }
  console.log(`T1 vs LPL: ${series} series, ${games} games, T1 lost ${lost}`);
}
const user = state.teams[userTeam];
console.log('user', user.name, 'balance', Math.round(user.balance), 'fans', user.fans, 'titles', user.titles);
fs.writeFileSync(path.join(os.tmpdir(), 'rift-manager-save.json'), JSON.stringify(state));
console.log('save size', (fs.statSync(path.join(os.tmpdir(), 'rift-manager-save.json')).size / 1e6).toFixed(1), 'MB');
