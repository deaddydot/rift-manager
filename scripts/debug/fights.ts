import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, DRAGON_PIT, BARON_PIT } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 101 });
const orig = sim.killChampion.bind(sim);
(sim as any).killChampion = (v: any, k: any) => {
  const fmt = (c: any) => `${c.input.name}[${c.task.kind}${c.task.objective ? ':' + c.task.objective : ''} hp${Math.round(c.hp)} lv${c.level} d${Math.round(dist(c.pos, v.pos))}]`;
  const near = sim.champs.filter((c) => !c.dead && c !== v && dist(c.pos, v.pos) < 1600);
  console.log(`${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} ${v.input.name} dies (task ${v.task.kind}, lv${v.level}) at (${v.pos.x.toFixed(0)},${v.pos.y.toFixed(0)}) dragonD=${dist(v.pos, DRAGON_PIT).toFixed(0)} baronD=${dist(v.pos, BARON_PIT).toFixed(0)} | near: ${near.map(fmt).join(' ')}`);
  orig(v, k);
};
const origEv = sim.event.bind(sim);
(sim as any).event = (type: string, text: string, side: any, extra: any) => { if (['dragon', 'baron', 'grubs', 'herald', 'tower'].includes(type)) console.log(`   >> ${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} ${text}`); origEv(type, text, side, extra); };
let lastPlan = ['', ''];
while (sim.winner === null && sim.t < 1500) {
  sim.step();
  for (const s of [0, 1]) { const pl = sim.teams[s].plan.label; if (pl !== lastPlan[s]) { lastPlan[s] = pl; console.log(`      [${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}] team ${s} plan: ${pl}`); } }
}
