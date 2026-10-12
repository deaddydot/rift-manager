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
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 43 });
let next = 270;
while (sim.t < 900) {
  sim.step();
  if (sim.t >= next) {
    next += 5;
    const d = sim.objectives.find((o) => o.kind === 'dragon')!;
    const near = (s: number) => sim.champs.filter((c) => c.side === s && !c.dead && dist(c.pos, d.pos) < 1500).map((c) => `${c.input.name}:${c.task.kind}${c.combatTarget !== null ? '*' : ''}`).join(',');
    const calls = sim.teams.map((tm) => `${tm.objCalls['dragon']?.d ?? '-'}(${tm.objCalls['dragon']?.score.toFixed(2) ?? ''})`);
    console.log(`${Math.floor(sim.t/60)}:${String(Math.floor(sim.t%60)).padStart(2,'0')} drag alive=${d.alive} hp=${d.hp.toFixed(0)}/${d.maxHp.toFixed(0)} att=${d.attackers.size} calls=${calls.join(' vs ')} | A: ${near(0)} | B: ${near(1)}`);
    if (!d.alive && d.takenBy !== undefined && sim.t > 400) break;
  }
}
