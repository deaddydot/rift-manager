// Fastest developers over N years, split into the user's club and AI clubs, with ages and where the growth came from.
//   npx tsx scripts/debug/gainers.ts [years] [userTeam]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, ageOn, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { ROLE_WEIGHTS } from '../../src/engine/ratings';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const years = Number(process.argv[2] ?? 1);
const userTeam = process.argv[3] || 't1-lck';
const s = createNewGame(db, userTeam, 'Tester', 2468);
s.settings = { ...s.settings, autoSave: false } as never;
const ovrF = (id: string) => { const p = s.players[id]; let a = 0, t = 0; for (const [k, v] of Object.entries(ROLE_WEIGHTS[p.role])) { a += (p.attributes as never)[k] * v!; t += v!; } return a / t; };
const start: Record<string, number> = {}, fromGames: Record<string, number> = {};
for (const id of Object.keys(s.players)) start[id] = ovrF(id);
const rng = new RNG(5);
const end = `${Number(s.date.slice(0, 4)) + years}-01-02`;
while (s.date < end) {
  const tracked = Object.values(s.players).filter((p) => p.teamId && !p.retired).map((p) => p.id);
  const before = Object.fromEntries(tracked.map((id) => [id, ovrF(id)]));
  const m = processDay(s);
  if (m) { simulateSeries(s, m, rng, false); processDay(s); }
  for (const id of tracked) fromGames[id] = (fromGames[id] ?? 0) + ovrF(id) - before[id];
  if (s.date.slice(5) === '11-10') { const t = s.teams[userTeam]; for (const id of t.roster) { const p = s.players[id]; if (p.contract && p.contract.expires <= `${s.date.slice(0, 4)}-11-18`) { /* keep the user's roster */ p.contract.expires = `${Number(s.date.slice(0, 4)) + 2}-11-18`; } } }
  endDay(s);
  for (const id of Object.keys(s.players)) start[id] ??= ovrF(id);
}
const rows = Object.values(s.players).filter((p) => p.teamId && !p.retired && start[p.id] !== undefined).map((p) => {
  const age0 = (ageOn(p.birthdate, s.date) ?? 22) - years;
  const team = s.teams[p.teamId!];
  return { p, age0, d: ovrF(p.id) - start[p.id], g: fromGames[p.id] ?? 0, tier: s.leagues[team.leagueId]?.tier ?? 3, mine: team.id === userTeam, team: team.short };
});
const show = (label: string, xs: typeof rows) => {
  console.log(`== ${label}`);
  for (const r of xs) console.log(`  ${r.p.handle.padEnd(12)} ${r.team.padEnd(5)} t${r.tier} age ${r.age0.toFixed(0).padStart(2)} ${start[r.p.id].toFixed(0).padStart(3)} → ${ovrF(r.p.id).toFixed(0).padStart(3)} (+${r.d.toFixed(1)}; games +${r.g.toFixed(1)}) pot ${Math.round(r.p.hidden.potential)}`);
};
show(`top AI gainers over ${years}y`, rows.filter((r) => !r.mine).sort((a, b) => b.d - a.d).slice(0, 15));
show('user club', rows.filter((r) => r.mine).sort((a, b) => b.d - a.d));
const by = (f: (r: (typeof rows)[number]) => boolean) => { const xs = rows.filter(f).map((r) => r.d).sort((a, b) => a - b); return xs.length ? `n ${xs.length} median +${xs[xs.length >> 1].toFixed(1)} p90 +${xs[Math.floor(xs.length * 0.9)].toFixed(1)} max +${xs[xs.length - 1].toFixed(1)}` : '-'; };
for (const [lo, hi] of [[15, 19], [19, 22], [22, 25], [25, 28], [28, 40]]) console.log(`AI age ${lo}-${hi}: ${by((r) => !r.mine && r.age0 >= lo && r.age0 < hi)}`);
