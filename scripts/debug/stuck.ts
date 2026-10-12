// Find players idling for no reason (decision loops / stuck spots) across many games.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 20), skill = Number(process.argv[3] ?? 60);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: champs[i], mech: skill, lane: skill, farm: skill, tf: skill, macro: skill, vision: skill, pathing: skill, obj: skill, aggression: 50, consistency: skill, clutch: skill, shotcalling: skill, mastery: 70, farsight: 55, mistakes: 45, composure: 55, snowball: 50, resilience: 50, traits: [] })) });
const byTask: Record<string, number> = {};
let total = 0;
const samples: string[] = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 4000 + g, debug: true });
  sim.runToEnd();
  for (const e of sim.debugLog) {
    if (e.cat !== 'stuck') continue;
    total++;
    const c = sim.champs[e.idx!];
    const k = `${c.role} ${e.text.split(' — task ')[1]?.split(' (')[0]}`;
    byTask[k] = (byTask[k] ?? 0) + 1;
    if (samples.length < 40 && (!process.env.ROLE || c.role === process.env.ROLE)) samples.push(`g${g} ${Math.floor(e.t / 60)}:${String(Math.floor(e.t % 60)).padStart(2, '0')} ${c.input.name}(${c.champ.id}) ${e.text}`);
  }
}
console.log(`${total} idle episodes in ${N} games`);
for (const [k, v] of Object.entries(byTask).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(30), v);
for (const s of samples) console.log(s);
