import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { laneProgress, lanePoint, dist } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const lane = (process.argv[2] ?? 'mid') as any;
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: Number(process.argv[3] ?? 45) });
let next = 60;
while (sim.t < 900) {
  sim.step();
  if (sim.t >= next) {
    next += 15;
    const waves = sim.waves.filter((w) => w.lane === lane).map((w) => `${w.side ? 'R' : 'B'}${w.p.toFixed(2)}x${w.count}${w.stopped ? 's' : ''}`).join(' ');
    const laners = sim.champs.filter((c) => c.task.lane === lane || (lane === 'mid' && c.role === 'mid')).map((c) => `${c.input.name}@${laneProgress(lane, c.pos).toFixed(2)}${c.dead ? 'D' : ''}${c.task.kind[0]}${c.combatTarget !== null ? '*' : ''} hp${Math.round(c.hp / c.stats.maxHp * 100)}`).join(' ');
    const towers = sim.towers.filter((t) => t.def.lane === lane && t.alive).map((t) => `${t.def.side ? 'R' : 'B'}${t.def.tier[0]}${t.def.tier[1]}@${laneProgress(lane, t.def.pos).toFixed(2)}:${Math.round(t.hp)}`).join(' ');
    console.log(`${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} | ${waves} | ${laners} | ${towers}`);
  }
}
