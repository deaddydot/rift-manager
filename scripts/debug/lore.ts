// Lore rule check: the destined side (T1 vs an LPL team) must win every game — how naturally does it?
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
const N = Number(process.argv[2] ?? 60), T1 = Number(process.argv[3] ?? 65), LPL = Number(process.argv[4] ?? 80);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
let wins = 0, guarded = 0, timeouts = 0, mins = 0, killsT1 = 0, killsL = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const t1Blue = g % 2 === 0;
  const a = mk('T1', pick(), T1), b = mk('LPL', pick(), LPL);
  const sim = new MatchSim(t1Blue ? a : b, t1Blue ? b : a, { seed: 900 + g, destiny: t1Blue ? 0 : 1 });
  const res = sim.runToEnd();
  const s = t1Blue ? 0 : 1;
  if (res.winner === s) wins++;
  if (res.events.some((e) => /refuses to fall/.test(e.text))) guarded++;
  if (res.duration >= 75 * 60) timeouts++;
  mins += res.duration / 60; killsT1 += res.teams[s].kills; killsL += res.teams[1 - s].kills;
}
console.log(`T1 (${T1}) vs LPL (${LPL}), ${N} games: T1 wins ${wins}/${N}; Nexus guard needed in ${guarded}; timeouts ${timeouts}; avg ${(mins / N).toFixed(1)} min; kills ${(killsT1 / N).toFixed(1)}-${(killsL / N).toFixed(1)}`);
