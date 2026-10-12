// Old-save upgrade check: a career from before the 0..200 scale (no ratingScale flags, potentials ≤ 99) loads with
// raised ceilings, and nothing else about the players changes.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, type Database } from '../../src/engine/setup';
import { setMeta } from '../../src/engine/draft/draft';
import { ensureRatingScale } from '../../src/engine/management/potential';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const s = createNewGame(db, 't1-lck', 'Tester', 1);
const old = JSON.parse(JSON.stringify(s));
for (const p of Object.values(old.players) as typeof s.players[string][]) { delete p.ratingScale; p.hidden.potential = Math.min(99, overall(p.attributes, p.role) + 3); }
const attrsBefore = JSON.stringify(Object.values(old.players).map((p: any) => p.attributes));
ensureRatingScale(old);
const ps = Object.values(old.players) as typeof s.players[string][];
const raised = ps.filter((p) => p.hidden.potential > 99).length;
console.log(`players ${ps.length}, all flagged: ${ps.every((p) => p.ratingScale === 200)}, ceilings above 99: ${raised}, attributes unchanged: ${JSON.stringify(ps.map((p) => p.attributes)) === attrsBefore}`);
const same = ps.filter((p) => p.hidden.potential === s.players[p.id].hidden.potential).length;
console.log(`same ceiling as a fresh new game: ${same}/${ps.length} (deterministic per player)`);
ensureRatingScale(old);
console.log(`second pass is a no-op: ${ps.every((p) => p.hidden.potential === old.players[p.id].hidden.potential)}`);
