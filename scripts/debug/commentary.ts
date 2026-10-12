// Caster desk check: play a full game through the match engine at a given playback speed (real time simulated) and
// print the commentary transcript with game timestamps, plus the stream audience and the chat's pick analysis.
//   npx tsx scripts/debug/commentary.ts [blue=t1-lck] [red=gen-lck] [speed=4] [desk=auto] [seed=1]
//   npx tsx scripts/debug/commentary.ts 9g-vcs sgw-vcs 4          → a VCS game (Hoàng Luân)
//   AFTER=2026-05-10 npx tsx scripts/debug/commentary.ts t1-lck blg-lpl 8   → mid-season (season stats), T1 vs LPL lore
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { draftPicks, simulateSeries } from '../../src/engine/season/series';
import { setMeta, newDraft, runAIDraft } from '../../src/engine/draft/draft';
import { draftTeam, simTeam } from '../../src/engine/season/prep';
import { destinySide } from '../../src/engine/season/lore';
import { MatchSim } from '../../src/engine/sim/engine';
import { RNG } from '../../src/util/rng';
import type { GameState, MatchFixture } from '../../src/engine/types';
import { buildBroadcastCtx } from '../../src/ui/match/broadcast/context';
import { Commentary, pickDesk } from '../../src/ui/match/broadcast/commentary';
import { AudienceTracker, fmtViewers } from '../../src/ui/match/broadcast/audience';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const meta = load('meta.json');
setMeta(meta);
for (const c of gdata.champions) { const m = meta?.champions[c.id]; if (m) c.meta = { picks: m.picks, bans: m.bans, wins: m.wins, games: meta.games, presence: m.presence, byRole: m.byRole }; }
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const [blueId = 't1-lck', redId = 'gen-lck', speedArg = '4', deskArg = 'auto', seedArg = '1'] = process.argv.slice(2);
const SPEED = Number(speedArg), SEED = Number(seedArg);

const state: GameState = createNewGame(db, blueId, 'Tester', 12345);
// play the calendar (user series simulated) up to AFTER=YYYY-MM-DD if given, then to the team's next match day,
// and make that fixture blue vs red
const AFTER = process.env.AFTER ?? '';
const srng = new RNG(4321);
let f: MatchFixture | undefined;
for (let d = 0; d < 400 && !f; d++) {
  const m = processDay(state);
  if (m && state.date < AFTER) { simulateSeries(state, m, srng, false); processDay(state); endDay(state); continue; }
  if (state.pendingMatch) { f = state.fixtures[state.pendingMatch]; break; }
  endDay(state);
}
if (!f) throw new Error('no fixture found');
f.teamA = blueId; f.teamB = redId;
const blue = state.teams[blueId], red = state.teams[redId];
const d = newDraft(draftTeam(state, blue), draftTeam(state, red));
runAIDraft(d, new RNG(77 + SEED), state.championPower);
const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: 1000 + SEED, debug: true, bigMatch: false, destiny: destinySide(state, blue, red) ?? undefined });
const bc = buildBroadcastCtx(state, { fixtureId: f.id, gameNo: 1, series: { games: [], locked: new Set() }, draft: d }, sim, [blue, red], 0);
const desk = pickDesk(bc, deskArg);
const com = new Commentary(sim, bc, desk, SEED);
com.keepTranscript = true;
const aud = bc.audience ? new AudienceTracker(bc.audience) : null;
com.viewers = () => aud?.viewers ?? 0;

console.log(`${state.competitions[f.competitionId]?.name} · ${blue.name} vs ${red.name} · desk: ${desk.label} · speed ${SPEED}×`);
console.log(`picks: ${sim.champs.map((c) => `${c.input.name} ${c.champ.name}`).join(', ')}`);
console.log(`pick notes: ${bc.picks.notes.slice(0, 8).map((n) => `${n.kind}:${n.player || n.ctx.team}/${n.champ}(${n.weight.toFixed(2)})`).join(' · ')}`);
if (bc.audience) console.log(`audience base: ${fmtViewers(bc.audience.viewers)} (${bc.audience.parts.map((p) => `${p.k} ${p.x >= 1000 ? fmtViewers(p.x) : p.x.toFixed(2)}`).join(' · ')})`);
console.log('');

let real = 0, idx = 0;
const TICK = 150;
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let endReal = 0;
while (true) {
  real += TICK;
  const target = (real / 1000) * SPEED;
  while (sim.t < target && sim.winner === null) sim.step();
  for (; idx < sim.events.length; idx++) aud?.onEvent(sim.events[idx]);
  const gold = sim.champs.reduce((s, c) => s + (c.side === 0 ? c.goldEarned : -c.goldEarned), 0);
  aud?.update({ t: sim.t, gold, winner: sim.winner, nexus: sim.nexusHp });
  const l = com.tick(real);
  if (l) {
    console.log(`${mmss(l.t)}  ${l.name.padEnd(14)} ${l.text}${l.gloss ? `\n${' '.repeat(22)}↳ ${l.gloss}` : ''}`);
  }
  if (sim.winner !== null && !endReal) endReal = real;
  if (endReal && real - endReal > 25000) break;
  if (real > 4 * 3600 * 1000) break;
}
const cats: Record<string, number> = {};
for (const l of com.transcript) cats[l.cat] = (cats[l.cat] ?? 0) + 1;
const texts = com.transcript.map((l) => l.text);
const dup = texts.length - new Set(texts).size;
console.log(`\n${com.transcript.length} lines over ${mmss(sim.t)} (${((real / 1000) / 60).toFixed(1)} real minutes) · duplicates ${dup} · winner ${sim.winner === null ? '-' : [blue.short, red.short][sim.winner]} · viewers peak ${aud ? fmtViewers(aud.peak) : '-'}`);
console.log(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
