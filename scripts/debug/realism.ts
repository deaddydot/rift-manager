// Realism snapshot vs pro-play norms: recalls, wards, deaths to towers, solo kills, fight sizes, plates,
// objective timings, gold diff swings. Pro reference values in brackets are rough 2024-25 averages.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 40);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const acc: Record<string, number[]> = {};
const add = (k: string, v: number) => (acc[k] ??= []).push(v);
const sizes: Record<number, number> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(1700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 72), mk('B', pick(), 72), { seed: 9300 + g });
  const recalls = new Array(10).fill(0);
  let towerDeaths = 0;
  const prevRecall = new Array(10).fill(0);
  while (sim.winner === null) {
    sim.step();
    for (const c of sim.champs) { if (c.recallUntil > 0 && prevRecall[c.idx] === 0) recalls[c.idx]++; prevRecall[c.idx] = c.recallUntil > 0 ? 1 : 0; }
  }
  const res = sim.result();
  const mins = res.duration / 60;
  for (const e of res.events) if (e.type === 'kill' && /turret|tower|executed/i.test(e.text)) towerDeaths++;
  const kills = res.events.filter((e) => e.type === 'kill');
  // fights: kills clustered within 12s
  let fights = 0, big = 0, solo = 0;
  for (let i = 0; i < kills.length;) { let j = i; while (j + 1 < kills.length && kills[j + 1].t - kills[j].t < 12) j++; const n = j - i + 1; fights++; if (n >= 4) big++; if (n === 1) solo++; i = j + 1; }
  add('recalls/player (30min-normalised) [7-9]', recalls.reduce((s, x) => s + x, 0) / 10 / mins * 30);
  add('wards placed/game [~110-130]', res.players.reduce((s, p) => s + (p.wardsPlaced ?? 0), 0));
  add('deaths to towers/game [~1-2]', towerDeaths);
  add('kill events (isolated, 1 kill)/game', solo);
  add('fights with 4+ kills/game [~3-5]', big);
  for (let i = 0; i < kills.length;) { let j = i; while (j + 1 < kills.length && kills[j + 1].t - kills[j].t < 12) j++; const n = Math.min(5, j - i + 1); sizes[n] = (sizes[n] ?? 0) + n; i = j + 1; }
  // participants per fight: champions who were in combat during the fight window

  add('plates/game [~6-9]', res.events.filter((e) => e.type === 'plate').length);
  const gdiff = res.goldDiff;
  add('|gold diff| @15 [~2.5k]', Math.abs(gdiff[15] ?? 0));
  add('|gold diff| @25 [~5k]', Math.abs(gdiff[25] ?? gdiff[gdiff.length - 1] ?? 0));
  const fd = res.events.find((e) => e.type === 'dragon'); if (fd) add('first dragon min [~6-7]', fd.t / 60);
  const fh = res.events.find((e) => e.type === 'grubs'); if (fh) add('first grubs min [~6-8]', fh.t / 60);
  const fb = res.events.find((e) => e.type === 'baron'); if (fb) add('first baron min [~25-27]', fb.t / 60);
  add('barons/game [~1.2-1.5]', res.teams[0].barons + res.teams[1].barons);
  add('duration [~31-32]', mins);
  add('kills/game [~25-28]', res.teams[0].kills + res.teams[1].kills);
}
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`${N} games (skill 72 v 72)`);
for (const [k, v] of Object.entries(acc)) console.log(`  ${k.padEnd(44)} ${avg(v).toFixed(2)}`);
const tot = Object.values(sizes).reduce((a, b) => a + b, 0);
console.log('  share of kills by fight size (kills within 12s):', Object.entries(sizes).map(([n, k]) => `${n === '5' ? '5+' : n}: ${(k / tot * 100).toFixed(0)}%`).join('  '), ' [pro: roughly 1: 25%, 2: 20%, 3: 20%, 4+: 35%]');
