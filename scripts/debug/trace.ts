import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
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
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 42 });
const stops = (process.argv[2] ?? '60,120,180,240,300,420,600,900').split(',').map(Number);
let si = 0;
let evIdx = 0;
while (sim.winner === null && si < stops.length) {
  sim.step();
  while (evIdx < sim.events.length) { const e = sim.events[evIdx++]; if (e.type !== 'plate') console.log(`   [${Math.floor(e.t/60)}:${String(Math.floor(e.t%60)).padStart(2,'0')}] ${e.text}`); }
  if (sim.t >= stops[si]) {
    console.log(`==== t=${sim.t.toFixed(0)}s`);
    for (const c of sim.champs) console.log(`${c.input.name.padEnd(8)} ${c.champ.id.padEnd(9)} pos(${c.pos.x.toFixed(0)},${c.pos.y.toFixed(0)}) task=${c.task.kind}${c.task.lane ? ':' + c.task.lane : ''}${c.task.campId ? ':' + c.task.campId : ''} hp=${c.hp.toFixed(0)}/${c.stats.maxHp.toFixed(0)} lv=${c.level} cs=${c.cs} gold=${c.gold.toFixed(0)} spent=${c.goldSpent.toFixed(0)} k/d/a=${c.kills}/${c.deaths}/${c.assists} tgt=${c.combatTarget} ${c.dead ? 'DEAD' : ''}`);
    for (const w of sim.waves) console.log(`   wave ${w.side} ${w.lane} p=${w.p.toFixed(3)} n=${w.count} hp=${w.hp.toFixed(0)} ${w.stopped ? 'stopped' : ''} @(${lanePoint(w.lane, w.p).x.toFixed(0)},${lanePoint(w.lane, w.p).y.toFixed(0)})`);
    si++;
  }
}
