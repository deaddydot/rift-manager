// Development environment per tier: coaching (staffBonus.training / development), training facility, academy.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { staffBonus } from '../../src/engine/season/prep';
import { setMeta } from '../../src/engine/draft/draft';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const s = createNewGame(db, 't1-lck', 'Tester', 12345);
const q = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))];
for (const tier of [1, 2, 3]) {
  const tr: number[] = [], dv: number[] = [], fac: number[] = [], ac: number[] = [];
  for (const t of Object.values(s.teams)) {
    if (s.leagues[t.leagueId]?.tier !== tier) continue;
    const sb = staffBonus(s, t);
    tr.push(sb.training); dv.push(sb.development); fac.push(t.facilities.trainingFacility); ac.push(t.facilities.academy);
  }
  for (const a of [tr, dv, fac, ac]) a.sort((x, y) => x - y);
  const f = (a: number[]) => [0, 0.25, 0.5, 0.75, 1].map((x) => Math.round(q(a, x) * 10) / 10).join('/');
  console.log(`tier ${tier}: training ${f(tr)} | development ${f(dv)} | facility ${f(fac)} | academy ${f(ac)}`);
}
const t1 = s.teams['t1-lck']; console.log('T1', staffBonus(s, t1), t1.facilities);
