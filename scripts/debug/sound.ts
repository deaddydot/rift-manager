// Match audio check: simulate a game in "real time" at a playback speed and count what the audio director plays.
//   npx tsx scripts/debug/sound.ts [speed=8] [blue=t1-lck] [red=gen-lck]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { POOL_CACHE } from '../../src/engine/game';
import { draftPicks } from '../../src/engine/season/series';
import { setMeta, newDraft, runAIDraft } from '../../src/engine/draft/draft';
import { draftTeam, simTeam } from '../../src/engine/season/prep';
import { MatchSim } from '../../src/engine/sim/engine';
import { RNG } from '../../src/util/rng';
import { MatchAudio } from '../../src/ui/audio/matchAudio';
import { FULL_VIEW } from '../../src/ui/match/camera';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const SPEED = Number(process.argv[2] ?? 8), blueId = process.argv[3] ?? 't1-lck', redId = process.argv[4] ?? 'gen-lck';
const st = createNewGame(db, blueId, 'T', 3);
const d = newDraft(draftTeam(st, st.teams[blueId]), draftTeam(st, st.teams[redId]));
runAIDraft(d, new RNG(4), st.championPower);
const sim = new MatchSim(simTeam(st, st.teams[blueId], draftPicks(d, 0)), simTeam(st, st.teams[redId], draftPicks(d, 1)), { seed: 77 });
const counts: Record<string, number> = {};
const timeline: string[] = [];
MatchAudio.tap = (w) => { const k = w.replace(/:.*/, '') === 'ult' ? 'ult' : w; counts[k] = (counts[k] ?? 0) + 1; if (timeline.length < 40) timeline.push(`${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} ${w}`); };
const audio = new MatchAudio(sim, 0);
let now = 0;
while (sim.winner === null) { now += 1000 / 60; const target = (now / 1000) * SPEED; while (sim.t < target && sim.winner === null) sim.step(); audio.tick(now, SPEED, FULL_VIEW); }
audio.tick(now + 20, SPEED, FULL_VIEW);
const mins = sim.t / 60, realMin = now / 60000;
console.log(`speed ${SPEED}× · game ${mins.toFixed(1)} min = ${realMin.toFixed(1)} real min · sounds ${Object.values(counts).reduce((a, b) => a + b, 0)} (${(Object.values(counts).reduce((a, b) => a + b, 0) / realMin).toFixed(1)} per real minute)`);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
console.log(timeline.join('\n'));
