// Morale over a season for an unmanaged team (approaches left to expire): does anything grind it down?
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json')); POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const team = process.argv[2] ?? 'krx-lck';
const state = createNewGame(db, team, 'T', 777);
const rng = new RNG(5);
let lastMonth = '';
while (state.date < '2026-10-01') {
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, false); processDay(state); }
  // never answer approaches: they expire on their own
  endDay(state);
  const mo = state.date.slice(0, 7);
  if (mo !== lastMonth) {
    lastMonth = mo;
    const t = state.teams[team];
    const ms = Object.values(t.lineup).filter(Boolean).map((id) => state.players[id as string]);
    const rec = Object.values(state.fixtures).filter((f) => f.result && (f.teamA === team || f.teamB === team));
    const w = rec.filter((f) => f.result.winner === team).length;
    console.log(`${state.date} series ${w}-${rec.length - w} | morale ${ms.map((p) => `${p.handle}:${Math.round(p.morale)}`).join(' ')} | fan mood ${Math.round(state.fanPulse?.teams[team]?.mood ?? 0)}`);
  }
}
