// AI club economy by league tier: yearly income / expense per ledger category (mean & median per club), net and balances.
//   npx tsx scripts/debug/aifinance.ts [years=3] [tier filter, e.g. 2]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { LEDGER_TAP, payrollYearly } from '../../src/engine/management/finance';
import { diehardShare } from '../../src/engine/management/fanbase';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const years = Number(process.argv[2] ?? 3);
const only = process.argv[3] ? Number(process.argv[3]) : null;
const state = createNewGame(db, process.env.USER_TEAM ?? 't1-lck', 'Tester', 12345);
state.settings = { ...state.settings, autoSave: false } as never;

// per team, per category: this year's total
let book: Record<string, Record<string, number>> = {};
LEDGER_TAP.fn = (team, cat, amount) => {
  const b = (book[team.id] ??= {});
  b[cat] = (b[cat] ?? 0) + amount;
};
const tierOf = (id: string) => state.leagues[state.teams[id]?.leagueId]?.tier ?? 3;
const q = (a: number[], f: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))] : NaN);
const k = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(n) / 1e3) + 'k'}`;

function report(label: string, startBal: Record<string, number>) {
  console.log(`\n== ${label} (${state.date})`);
  for (const tier of [1, 2, 3]) {
    if (only && tier !== only) continue;
    const ids = Object.keys(state.teams).filter((id) => id !== state.userTeamId && tierOf(id) === tier);
    const cats = new Set<string>();
    for (const id of ids) for (const c of Object.keys(book[id] ?? {})) cats.add(c);
    const rows = [...cats].map((c) => {
      const v = ids.map((id) => book[id]?.[c] ?? 0);
      return { c, mean: v.reduce((a, b) => a + b, 0) / v.length, med: q(v, 0.5), has: v.filter((x) => x).length };
    }).sort((a, b) => b.mean - a.mean);
    const nets = ids.map((id) => Object.values(book[id] ?? {}).reduce((a, b) => a + b, 0));
    const bal = ids.map((id) => state.teams[id].balance);
    const drift = ids.map((id) => state.teams[id].balance - startBal[id] - Object.values(book[id] ?? {}).reduce((a, b) => a + b, 0));
    console.log(`-- tier ${tier} (${ids.length} AI clubs): net/yr mean ${k(nets.reduce((a, b) => a + b, 0) / ids.length)} median ${k(q(nets, 0.5))} p10 ${k(q(nets, 0.1))} p90 ${k(q(nets, 0.9))} | balance p10 ${k(q(bal, 0.1))} median ${k(q(bal, 0.5))} p90 ${k(q(bal, 0.9))} | <0: ${bal.filter((b) => b < 0).length} | payroll median ${k(q(ids.map((id) => payrollYearly(state, state.teams[id])), 0.5))} | fans median ${k(q(ids.map((id) => state.teams[id].fans), 0.5))} max ${k(Math.max(...ids.map((id) => state.teams[id].fans)))} die-hard ${Math.round(q(ids.map((id) => diehardShare(state.teams[id])), 0.5) * 100)}% | facilities avg ${(ids.reduce((a, id) => a + Object.values(state.teams[id].facilities).reduce((x, y) => x + y, 0), 0) / ids.length / 6).toFixed(2)}${drift.some((d) => Math.abs(d) > 1) ? ` | untracked ${k(drift.reduce((a, b) => a + b, 0))}` : ''}`);
    for (const r of rows) console.log(`   ${r.c.padEnd(28)} mean ${k(r.mean).padStart(8)}  median ${k(r.med).padStart(8)}  (${r.has}/${ids.length})`);
    if (process.env.DETAIL) { // the clubs losing most this year
      const worst = ids.map((id, i) => ({ id, net: nets[i] })).sort((a, b) => a.net - b.net).slice(0, 6);
      for (const { id, net } of worst) {
        const t = state.teams[id], b = book[id] ?? {};
        console.log(`   worst ${t.short.padEnd(6)} ${t.leagueId.padEnd(6)} net ${k(net).padStart(6)} bal ${k(t.balance).padStart(6)} sponsors ${t.sponsors.length} | ` + Object.entries(b).filter(([, v]) => Math.abs(v) >= 1000).sort((x, y) => y[1] - x[1]).map(([c, v]) => `${c} ${k(v)}`).join(', '));
      }
    }
    if (process.env.LEAGUES) {
      const byLeague: Record<string, string[]> = {};
      for (const id of ids) (byLeague[state.teams[id].leagueId] ??= []).push(id);
      for (const [lg, list] of Object.entries(byLeague).sort((a, b) => b[1].length - a[1].length)) {
        const avg = (f: (id: string) => number) => k(list.reduce((a, id) => a + f(id), 0) / list.length);
        const cat = (c: string) => avg((id) => book[id]?.[c] ?? 0);
        console.log(`   [${lg.padEnd(7)} ${String(list.length).padStart(2)}] net ${avg((id) => Object.values(book[id] ?? {}).reduce((a, b) => a + b, 0)).padStart(7)} bal ${avg((id) => state.teams[id].balance).padStart(7)} | spons ${cat('Sponsorships')} share ${cat('League revenue share')} merch ${cat('Merchandise sales')} content ${cat('Streaming & content')} prize ${cat('Prize money')} | pay ${cat('Player & staff salaries')} fac ${cat('Facility upkeep')} ops ${cat('Operations & travel')} xfer ${avg((id) => (book[id]?.['Transfer income'] ?? 0) + (book[id]?.['Transfer fees'] ?? 0))}`);
      }
    }
  }
}

function userReport() {
  const u = state.teams[state.userTeamId], b = book[u.id] ?? {};
  console.log(`-- user ${u.name}: fans ${k(u.fans)} (die-hard ${Math.round(diehardShare(u) * 100)}%) net ${k(Object.values(b).reduce((a, x) => a + x, 0))}, balance ${k(u.balance)} | ` + Object.entries(b).sort((x, y) => y[1] - x[1]).map(([c, v]) => `${c} ${k(v)}`).join(', '));
}
const rng = new RNG(99);
const startYear = Number(state.date.slice(0, 4));
for (let y = 1; y <= years; y++) {
  const startBal = Object.fromEntries(Object.values(state.teams).map((t) => [t.id, t.balance]));
  book = {};
  const until = `${startYear + y}-01-01`;
  while (state.date < until) {
    const m = processDay(state);
    if (m) { simulateSeries(state, m, rng, false); processDay(state); }
    endDay(state);
  }
  report(`year ${startYear + y - 1}`, startBal);
  userReport();
}
