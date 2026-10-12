// Where does mid-game "objective" task time go? (waiting before spawn / staging / on the pit)
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const [from, to] = (process.argv[2] ?? '840,1800').split(',').map(Number);
const acc: Record<string, number> = {}; let total = 0;
for (const seed of [43, 44, 45, 46]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  while (sim.t < to && sim.winner === null) {
    sim.step();
    if (sim.t < from) continue;
    total += sim.dt * 10;
    for (const c of sim.champs) {
      if (c.dead || c.task.kind !== 'objective') continue;
      const o = sim.objectives.find((x) => x.kind === c.task.objective);
      if (!o) { acc["(gone)"] = (acc["(gone)"] ?? 0) + sim.dt; continue; }
      const d = dist(c.pos, o.pos);
      const st = !o.alive ? `wait(${Math.round((o.spawnAt - sim.t) / 15) * 15}s)` : o.attackers.size ? 'on-pit' : d > 1700 ? 'travel' : 'staging';
      const k = `${o.kind}:${st}:${c.role === 'jungle' || c.role === 'support' ? 'jg/sup' : 'laner'}`;
      acc[k] = (acc[k] ?? 0) + sim.dt;
    }
  }
}
for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(k.padEnd(34), (v / total * 100).toFixed(1) + '% of player-time');
