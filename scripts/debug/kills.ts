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
const ctx: Record<string, number> = {};
for (let g = 0; g < 6; g++) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 100 + g });
  const orig = sim.killChampion.bind(sim);
  (sim as any).killChampion = (v: any, k: any) => {
    const key = `${sim.t < 840 ? 'early' : sim.t < 1500 ? 'mid' : 'late'} victim:${v.task.kind} killer:${k ? k.task.kind : 'tower'}`;
    ctx[key] = (ctx[key] ?? 0) + 1;
    orig(v, k);
  };
  sim.runToEnd();
}
for (const [k, v] of Object.entries(ctx).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
