// Jungler time budget, and what the jungler is doing while its own camps are up and uncleared.
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
const N = Number(process.argv[2] ?? 10), skill = Number(process.argv[3] ?? 55);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: champs[i], mech: skill, lane: skill, farm: skill, tf: skill, macro: skill, vision: skill, pathing: skill, obj: skill, aggression: 50, consistency: skill, clutch: skill, shotcalling: skill, mastery: 70, farsight: 55, mistakes: 45, composure: 55, snowball: 50, resilience: 50, traits: [] })) });
const all: Record<string, number> = {}, whileUp: Record<string, number> = {};
let tAll = 0, tUp = 0, campsUpTime = 0, csm = 0, mins = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(900 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 5000 + g });
  while (sim.winner === null) {
    sim.step();
    if (sim.t < 120) continue;
    for (const j of sim.champs.filter((c) => c.role === 'jungle')) {
      let k = j.dead ? 'dead' : j.recallUntil > sim.t ? 'recall' : j.task.kind + (j.task.kind === 'jungle' ? (j.task.campId ? '(camp)' : '(no camp)') : '');
      if (k === 'objective') {
        const o = sim.objectives.find((x) => x.kind === j.task.objective);
        k = !o ? 'objective(gone)' : !o.alive ? `objective(${o.kind} spawns in ${Math.round((o.spawnAt - sim.t) / 20) * 20}s)` : o.attackers.size ? `objective(${o.kind} hitting)` : `objective(${o.kind} up, waiting)`;
      }
      all[k] = (all[k] ?? 0) + sim.dt; tAll += sim.dt;
      const up = sim.camps.filter((cp) => cp.alive && cp.def.side === j.side && cp.def.kind !== 'scuttle').length;
      if (up >= 3) { whileUp[k] = (whileUp[k] ?? 0) + sim.dt; tUp += sim.dt; }
      campsUpTime += up * sim.dt;
    }
  }
  for (const j of sim.champs.filter((c) => c.role === 'jungle')) csm += j.cs;
  mins += sim.t / 60 * 2;
}
console.log(`jungler CS/min ${(csm / mins).toFixed(2)}; avg own camps up ${(campsUpTime / tAll).toFixed(2)} of 6`);
console.log('jungler time:', Object.entries(all).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tAll * 100).toFixed(0)}%`).join(', '));
console.log(`while 3+ own camps are up (${(tUp / tAll * 100).toFixed(0)}% of the time):`, Object.entries(whileUp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tUp * 100).toFixed(0)}%`).join(', '));
