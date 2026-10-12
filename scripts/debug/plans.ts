import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const plans: Record<string, number> = {}; const pushReasons: Record<string, number> = {};
for (const seed of [43, 44, 45]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  while (sim.t < Number(process.env.TO ?? 1500) && sim.winner === null) {
    sim.step();
    if (sim.t < Number(process.env.FROM ?? 840)) continue;
    for (const tm of sim.teams) plans[tm.plan.kind] = (plans[tm.plan.kind] ?? 0) + 1;
    for (const c of sim.champs) if (c.task.kind === 'push') { const k = `${sim.teams[c.side].plan.kind} until=${c.task.until ? 'y' : 'n'}`; pushReasons[k] = (pushReasons[k] ?? 0) + 1; }
  }
}
console.log(plans); console.log(pushReasons);
