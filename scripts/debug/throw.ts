// Cheat check: equal teams, side 1 is made to throw at `at` seconds — win rate and game length vs no throw.
//   npx tsx scripts/debug/throw.ts [games] [atSeconds] [skill]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import { RNG } from '../../src/util/rng';
import type { SimTeamInput, SimPlayerInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const N = Number(process.argv[2] ?? 30), AT = Number(process.argv[3] ?? 600), SKILL = Number(process.argv[4] ?? 80);
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
function team(rng: RNG, id: string, used: Set<string>): SimTeamInput {
  const players: SimPlayerInput[] = ROLES.map((role) => {
    const ch = rng.pick(gd().championsByRole[role].filter((c) => !used.has(c.id)));
    used.add(ch.id);
    const r = () => SKILL + rng.normal(0, 5);
    return { playerId: `${id}${role}`, name: `${id}${role}`, role, championId: ch.id, mech: r(), lane: r(), farm: r(), tf: r(), macro: r(), vision: r(), pathing: r(), obj: r(), aggression: 50, consistency: r(), clutch: r(), shotcalling: r(), mastery: 140, farsight: 60, mistakes: 30, composure: 60, snowball: 50, resilience: 50, traits: [] };
  });
  return { teamId: id, name: id, short: id, color: '#fff', players, tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'auto', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 }, chemistry: 60 };
}
for (const cheat of [false, true]) {
  let w0 = 0, mins = 0, deathsAfter = 0, killsAfter = 0;
  for (let g = 0; g < N; g++) {
    const rng = new RNG(1000 + g);
    const used = new Set<string>();
    const sim = new MatchSim(team(rng, 'A', used), team(rng, 'B', used), { seed: 50 + g });
    let k0 = 0, k1 = 0;
    while (sim.winner === null && sim.t < sim.maxTime) { sim.step(); if (sim.t >= AT && !k0 && !k1) { k0 = sim.teams[0].kills + 1e-9; k1 = sim.teams[1].kills + 1e-9; } if (cheat && sim.t >= AT && sim.throwSide === null) sim.forceThrow(1); }
    deathsAfter += sim.teams[0].kills - Math.floor(k0); killsAfter += sim.teams[1].kills - Math.floor(k1);
    if (sim.winner === 0) w0++;
    mins += sim.t / 60;
  }
  console.log(`${cheat ? 'throw at ' + AT / 60 + ' min' : 'no cheat     '}: side A wins ${Math.round(w0 / N * 100)}% · avg ${(mins / N).toFixed(1)} min · after ${AT / 60} min: B dies ${(deathsAfter / N).toFixed(1)}×, kills ${(killsAfter / N).toFixed(1)}`);
}
