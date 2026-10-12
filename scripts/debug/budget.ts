import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { lanePoint } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const [from, to] = (process.argv[2] ?? '840,1500').split(',').map(Number);
const budget: Record<string, Record<string, number>> = {};
let total = 0; const csAt: Record<string, number[]> = {};
for (const seed of [43, 44, 45]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  while (sim.t < to && sim.winner === null) {
    sim.step();
    if (sim.t < from) continue;
    if (Math.abs(sim.t - from) < 0.2) for (const c of sim.champs) (csAt[c.role] ??= []).push(-c.cs);
    total += sim.dt;
    for (const c of sim.champs) {
      const b = (budget[c.role] ??= {});
      let k = c.dead ? 'dead' : c.recallUntil > sim.t ? 'recalling' : c.task.kind;
      if (k === 'lane' || k === 'push') {
        const lane = c.task.lane!;
        const near = sim.waves.some((w) => w.lane === lane && w.side !== c.side && Math.hypot(c.pos.x - lanePoint(lane, w.p).x, c.pos.y - lanePoint(lane, w.p).y) < 1150);
        k = k + (near ? '-near' : '-far');
      }
      if (c.combatTarget !== null) k += '*';
      b[k] = (b[k] ?? 0) + sim.dt;
    }
  }
  for (const c of sim.champs) { const a = csAt[c.role]; a[a.length - 1] += 0; }
}
for (const [n, b] of Object.entries(budget)) console.log(n.padEnd(8), Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k}:${(v / total * 100 / 2).toFixed(0)}%`).join(' '));
