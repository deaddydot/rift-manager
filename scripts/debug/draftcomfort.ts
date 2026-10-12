// Auto-draft check: how often do teams draft champions from their players' pools (and at what comfort)?
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { setMeta, newDraft, runAIDraft, comfort } from '../../src/engine/draft/draft';
import { draftTeam } from '../../src/engine/season/prep';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const state = createNewGame(db, 't1-lck', 'Tester', 12345);
const teams = Object.values(state.teams).filter((t) => t.roster.length >= 5);
const rng = new RNG(77);
let picks = 0, inPool = 0, comfSum = 0, low = 0;
for (let g = 0; g < 300; g++) {
  const a = teams[rng.int(0, teams.length - 1)], b = teams[rng.int(0, teams.length - 1)];
  if (a === b) continue;
  let da, dbt;
  try { da = draftTeam(state, a); dbt = draftTeam(state, b); } catch { continue; }
  const d = newDraft(da, dbt);
  runAIDraft(d, rng);
  for (const side of [0, 1] as const) for (const act of d.actions.filter((x: any) => x.side === side && x.type === 'pick')) {
    const p = d.teams[side].players.find((x) => x.role === act.role)!;
    const c = comfort(p, act.champion!, act.role!);
    picks++; comfSum += c; if (p.champions[act.champion!]) inPool++; if (c < 0.6) low++;
  }
}
console.log(`${picks} picks: ${(inPool / picks * 100).toFixed(0)}% from the player's pool, avg comfort ${(comfSum / picks).toFixed(2)}, ${(low / picks * 100).toFixed(0)}% low-comfort (<0.60)`);
