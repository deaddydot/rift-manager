// Post-game analyst check: run N games with the analyst on and report what it finds.
//   npx tsx scripts/debug/analysis.ts [n=20] [blue=t1-lck] [red=gen-lck]   (PRINT=1 prints the first game's report)
// Sanity: losers should carry more (and costlier) mistakes than winners; every kind should show up somewhere.
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

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const N = Number(process.argv[2] ?? 20), blueId = process.argv[3] ?? 't1-lck', redId = process.argv[4] ?? 'gen-lck';
const state = createNewGame(db, blueId, 'Tester', 777);
const blue = state.teams[blueId], red = state.teams[redId];
const kinds: Record<string, number> = {};
let winM = 0, loseM = 0, winSev = 0, loseSev = 0, winCost = 0, loseCost = 0, deaths = 0, explained = 0, calls = { good: 0, bad: 0 }, throws = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const rng = new RNG(100 + g);
  const d = newDraft(draftTeam(state, blue), draftTeam(state, red));
  runAIDraft(d, rng, state.championPower);
  const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: 5000 + g, analyze: true });
  const res = sim.runToEnd();
  const a = res.analysis!;
  for (const m of a.mistakes) {
    kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
    if (m.side === a.winner) { winM++; winSev += m.sev; winCost += m.cost; } else { loseM++; loseSev += m.sev; loseCost += m.cost; }
    if (m.kind === 'throw') throws++;
  }
  for (const p of a.players) for (const [k, n] of Object.entries(p.deaths)) { deaths += n; if (k !== 'trade' && k !== 'teamfight') explained += n; }
  calls.good += a.calls.good[0] + a.calls.good[1]; calls.bad += a.calls.bad[0] + a.calls.bad[1];
  if (g === 0 && process.env.PRINT === '1') {
    const mm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    console.log(`game 1: ${[blue.short, red.short][a.winner]} win in ${mm(a.duration)} · max leads ${a.maxLead.join(' / ')} · calls good ${a.calls.good} bad ${a.calls.bad}`);
    for (const m of a.mistakes) console.log(`  ${mm(m.t)} ${[blue.short, red.short][m.side].padEnd(4)} [${m.kind}/${m.sev}] ${m.text} (−${m.cost})`);
    console.log('  highlights:'); for (const h of a.highlights.slice(0, 8)) console.log(`  ${mm(h.t)} ${[blue.short, red.short][h.side]} ${h.text}`);
    console.log('  fights:'); for (const f of a.fights) console.log(`  ${mm(f.t)}–${mm(f.end)} ${f.zone}: ${f.kills[0]}-${f.kills[1]} (${f.size[0]}v${f.size[1]})`);
    console.log('  objectives:'); for (const o of a.objectives) console.log(`  ${mm(o.t)} ${[blue.short, red.short][o.side]} ${o.kind}${o.stolen ? ' STOLEN' : ''}${o.note ? ` (${o.note})` : ''}`);
    console.log('  players:'); for (const p of a.players) console.log(`  ${[blue.short, red.short][p.side]} ${p.name.padEnd(10)} ${p.champ.padEnd(12)} ${p.k}/${p.d}/${p.a} cs ${p.cs} csd10 ${p.csd10} gd15 ${p.gd15} wards ${p.wards} score ${p.score} deaths ${JSON.stringify(p.deaths)}`);
  }
}
console.log(`\n${N} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`mistakes per game: winner ${(winM / N).toFixed(1)} (sev ${(winSev / N).toFixed(1)}, cost ${Math.round(winCost / N)}) · loser ${(loseM / N).toFixed(1)} (sev ${(loseSev / N).toFixed(1)}, cost ${Math.round(loseCost / N)})`);
console.log(`deaths explained by a mistake: ${Math.round((explained / Math.max(1, deaths)) * 100)}% of ${deaths} · calls good ${calls.good} bad ${calls.bad} · throws ${throws}`);
console.log(`by kind: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${(n / N).toFixed(2)}`).join(' · ')}`);
