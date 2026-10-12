// Do leads convert? Win rate of the team ahead in gold at 15 / 20 minutes, by lead size (equal-skill teams, random comps).
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
const N = Number(process.argv[2] ?? 150);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const buckets: Record<string, [number, number]> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(300 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 7000 + g });
  const r = sim.runToEnd();
  for (const m of [15, 20]) {
    const lead = r.goldDiff[m];
    if (lead === undefined) continue;
    const size = Math.abs(lead) < 1000 ? '<1k' : Math.abs(lead) < 2500 ? '1-2.5k' : Math.abs(lead) < 5000 ? '2.5-5k' : '5k+';
    const k = `@${m} ${size}`;
    const b = (buckets[k] ??= [0, 0]);
    b[1]++; if ((lead > 0 ? 0 : 1) === r.winner) b[0]++;
  }
}
for (const [k, [w, n]] of Object.entries(buckets).sort()) console.log(`${k.padEnd(12)} leader wins ${(w / n * 100).toFixed(0)}% (n=${n})`);
console.log('pro reference: ~2k@15 ≈ 65-70%, 5k@20 ≈ 85-90%');
