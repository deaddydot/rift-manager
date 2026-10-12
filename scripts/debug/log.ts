// Print the decision log of one simulated game.
// usage: npx tsx scripts/debug/log.ts [seed] [from,to seconds] [skill] [filter]
//   filter: player name (Atop, Bjun, ...), A/B for a team, or a category (task, plan, call, fight, wave, recall, flash, help, stuck, base)
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
const seed = Number(process.argv[2] ?? 11);
const [from, to] = (process.argv[3] ?? '0,99999').split(',').map(Number);
const skill = Number(process.argv[4] ?? 70);
const filter = process.argv[5];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: skill, lane: skill, farm: skill, tf: skill, macro: skill, vision: skill, pathing: skill, obj: skill, aggression: 50, consistency: skill, clutch: skill, shotcalling: skill, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed, debug: true });
while (sim.winner === null && sim.t < to) sim.step();
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
for (const e of sim.debugLog) {
  if (e.t < from || e.t > to) continue;
  const who = e.idx !== null ? sim.champs[e.idx].input.name : e.side !== null ? `team ${'AB'[e.side]}` : 'game';
  if (filter && !(who === filter || e.cat === filter || (filter.length === 1 && e.side === 'AB'.indexOf(filter)))) continue;
  console.log(`${mmss(e.t).padStart(6)} ${who.padEnd(7)} [${e.cat}] ${e.text}`);
}
console.log(`-- ${sim.debugLog.length} log entries; winner ${sim.winner === null ? '-' : 'AB'[sim.winner]} at ${mmss(sim.t)}`);
