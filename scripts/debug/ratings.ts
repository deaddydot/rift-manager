// Rating distribution by league tier (and over the years): overall / potential / age, starters vs everyone.
//   npx tsx scripts/debug/ratings.ts [years]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, ageOn, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import type { GameState } from '../../src/engine/types';
import { payrollYearly } from '../../src/engine/management/finance';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const years = Number(process.argv[2] ?? 0);
const state = createNewGame(db, 't1-lck', 'Tester', 12345);
state.settings = { ...state.settings, autoSave: false } as never;

const q = (a: number[], f: number) => a.length ? a[Math.floor(f * (a.length - 1))] : NaN;
function report(s: GameState, label: string) {
  console.log(`== ${label} (${s.date})`);
  for (const tier of [1, 2, 3]) {
    const starters: number[] = [], all: number[] = [], pots: number[] = [], room: number[] = [];
    for (const t of Object.values(s.teams)) {
      if (s.leagues[t.leagueId]?.tier !== tier) continue;
      const lineup = new Set(Object.values(t.lineup));
      for (const id of t.roster) {
        const p = s.players[id]; if (!p) continue;
        const o = overall(p.attributes, p.role);
        all.push(o); pots.push(p.hidden.potential); room.push(p.hidden.potential - o);
        if (lineup.has(id)) starters.push(o);
      }
    }
    for (const a of [starters, all, pots, room]) a.sort((x, y) => x - y);
    const f = (a: number[]) => [0, 0.1, 0.5, 0.9, 1].map((x) => String(q(a, x)).padStart(4)).join('');
    console.log(`tier ${tier}: starters ${f(starters)} | all ${f(all)} | potential ${f(pots)} | room ${f(room)}`);
  }
  for (const tier of [1, 2, 3]) {
    const bal: number[] = [], pay: number[] = [];
    for (const t of Object.values(s.teams)) if (s.leagues[t.leagueId]?.tier === tier) { bal.push(t.balance); pay.push(payrollYearly(s, t)); }
    bal.sort((x, y) => x - y); pay.sort((x, y) => x - y);
    console.log(`tier ${tier} money: balance p10 ${Math.round(q(bal, 0.1) / 1e3)}k median ${Math.round(q(bal, 0.5) / 1e3)}k | payroll median ${Math.round(q(pay, 0.5) / 1e3)}k p90 ${Math.round(q(pay, 0.9) / 1e3)}k`);
  }
  const top = Object.values(s.players).filter((p) => !p.retired).map((p) => ({ p, o: overall(p.attributes, p.role) })).sort((a, b) => b.o - a.o).slice(0, 12);
  console.log('top:', top.map(({ p, o }) => `${p.handle} ${o}/${p.hidden.potential} (${Math.floor(ageOn(p.birthdate, s.date) ?? 0)})`).join(', '));
}
report(state, 'start');
const rng = new RNG(99);
const startYear = Number(state.date.slice(0, 4));
for (let y = 1; y <= years; y++) {
  const until = `${startYear + y}-01-05`;
  while (state.date < until) {
    const m = processDay(state);
    if (m) { simulateSeries(state, m, rng, false); processDay(state); }
    endDay(state);
  }
  report(state, `after ${y} year(s)`);
}
