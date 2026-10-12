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
let seed = 50;
for (;; seed++) { const probe = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed }); const r = probe.runToEnd(); if (r.duration > 2700) break; }
console.log('long game seed', seed);
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
let next = 1800;
const origEv = sim.event.bind(sim);
(sim as any).event = (type: string, text: string, side: any, extra: any) => { if (sim.t > 1780 && !['plate', 'info', 'flash', 'gank'].includes(type)) console.log(`   >> ${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} ${text}`); origEv(type, text, side, extra); };
while (sim.t < 2700 && sim.winner === null) {
  sim.step();
  if (sim.t >= next) {
    next += 20;
    const line = (s: number) => sim.champs.filter((c) => c.side === s).map((c) => `${c.role.slice(0,3)}:${c.dead ? 'DEAD' : c.task.kind + (c.task.lane ? '/' + c.task.lane : '') + (c.combatTarget !== null ? '*' : '')}`).join(' ');
    const towers = (s: number) => sim.towers.filter((t) => t.def.side === s && t.alive).map((t) => `${t.def.lane[0]}${t.def.tier.slice(0,3)}${Math.round(t.hp / t.maxHp * 100)}`).join(',') + ' inh:' + sim.inhibs.filter((i) => i.side === s).map((i) => i.alive ? i.lane[0] : '-').join('');
    console.log(`${Math.floor(sim.t/60)}:${String(Math.floor(sim.t%60)).padStart(2,'0')} A[${sim.teams[0].plan.label}] ${line(0)}\n      B[${sim.teams[1].plan.label}] ${line(1)}\n      towersA ${towers(0)} | towersB ${towers(1)}`);
  }
}
