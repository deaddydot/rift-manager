// Where does a season of development come from? Splits each tracked player's overall change into
// match days (stage experience, recordGame) and the rest of the day (weekly training, locker room…).
//   npx tsx scripts/debug/devtrace.ts [days] [handles,comma,separated]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, ageOn, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { staffBonus } from '../../src/engine/season/prep';
import { devEnvironment } from '../../src/engine/management/development';
import { offerRenewal, salaryDemand } from '../../src/engine/management/transfers';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const days = Number(process.argv[2] ?? 365);
const handles = (process.argv[3] ?? 'Chovy,Peyz,Faker,Zeus,Bin').split(',');
const state = createNewGame(db, 't1-lck', 'Tester', 12345);
state.settings = { ...state.settings, autoSave: false } as never;
if (process.env.ELITE === '1') { // the user's club with the best coaching, a level-5 training facility and intense training
  const t = state.teams[state.userTeamId];
  t.facilities.trainingFacility = 5; t.facilities.academy = 5;
  for (const sid of t.staff) { const st = state.staff[sid]; if (st && (st.role === 'headCoach' || st.role === 'coach')) { st.attributes.training = 95; st.attributes.development = 95; } }
  state.trainingPlan = { intensity: 'intense', scrims: 40, soloq: 25, vod: 20, rest: 15 };
}
const ids = handles.map((h) => Object.values(state.players).find((p) => p.handle === h)?.id).filter(Boolean) as string[];
const exact = (id: string) => { const p = state.players[id]; const w = overall(p.attributes, p.role); return w; };
// unrounded overall for small deltas
import { ROLE_WEIGHTS } from '../../src/engine/ratings';
const ovrF = (id: string) => { const p = state.players[id]; let s = 0, t = 0; for (const [k, v] of Object.entries(ROLE_WEIGHTS[p.role])) { s += (p.attributes as never)[k] * v!; t += v!; } return s / t; };
const acc: Record<string, { games: number; fromGames: number; fromRest: number; start: number }> = {};
for (const id of ids) acc[id] = { games: 0, fromGames: 0, fromRest: 0, start: ovrF(id) };
const rng = new RNG(99);
for (let d = 0; d < days; d++) {
  const before = Object.fromEntries(ids.map((id) => [id, ovrF(id)]));
  const g0 = Object.fromEntries(ids.map((id) => [id, state.players[id].season.games]));
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, false); processDay(state); }
  if (state.date.slice(5) === '11-10') { const t = state.teams[state.userTeamId]; for (const id of t.roster) { const p = state.players[id]; if (p.contract && p.contract.expires <= `${state.date.slice(0, 4)}-11-18`) offerRenewal(state, id, Math.round(salaryDemand(state, p, t) * 1.3), 3); } } // keep the user's roster together
  const mid = Object.fromEntries(ids.map((id) => [id, ovrF(id)]));
  const g1 = Object.fromEntries(ids.map((id) => [id, state.players[id].season.games]));
  endDay(state);
  for (const id of ids) {
    acc[id].fromGames += mid[id] - before[id];
    acc[id].fromRest += ovrF(id) - mid[id];
    acc[id].games += Math.max(0, g1[id] - g0[id]);
  }
}
for (const id of ids) {
  const p = state.players[id]; const a = acc[id]; const t = p.teamId ? state.teams[p.teamId] : null;
  const sb = t ? staffBonus(state, t) : null;
  console.log(`${p.handle.padEnd(10)} age ${Math.floor(ageOn(p.birthdate, state.date) ?? 0)} ${a.start.toFixed(1)} → ${ovrF(id).toFixed(1)} (pot ${p.hidden.potential.toFixed(0)}) | games ${a.games}: +${a.fromGames.toFixed(2)} | rest +${a.fromRest.toFixed(2)} | ${t?.short} env ${sb ? devEnvironment(sb.training, t!.facilities.trainingFacility).toFixed(2) : '-'} we ${p.hidden.workEthic} traits ${p.traits.join(',')}`);
}
void exact;
