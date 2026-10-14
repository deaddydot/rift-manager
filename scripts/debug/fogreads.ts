// Fog reads in practice: how often teams assume unseen enemies at an objective, take the long way round, and how
// picks happen (isolated deaths) — plus snipes and haste usage.   npx tsx scripts/debug/fogreads.ts [games]
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
const N = Number(process.argv[2] ?? 6);
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
function team(rng: RNG, id: string, used: Set<string>): SimTeamInput {
  const players: SimPlayerInput[] = ROLES.map((role) => {
    const ch = rng.pick(gd().championsByRole[role].filter((c) => !used.has(c.id)));
    used.add(ch.id);
    const r = () => 75 + rng.normal(0, 5);
    return { playerId: `${id}${role}`, name: `${id}${role}`, role, championId: ch.id, mech: r(), lane: r(), farm: r(), tf: r(), macro: r(), vision: r(), pathing: r(), obj: r(), aggression: 50, consistency: r(), clutch: r(), shotcalling: r(), mastery: 140, farsight: 60, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] };
  });
  return { teamId: id, name: id, short: id, color: '#fff', players, tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'auto', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 }, chemistry: 60 };
}
const count: Record<string, number> = {};
const bump = (k: string) => { count[k] = (count[k] ?? 0) + 1; };
const examples: string[] = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(300 + g);
  const used = new Set<string>();
  const sim = new MatchSim(team(rng, 'A', used), team(rng, 'B', used), { seed: 900 + g, debug: true });
  sim.runToEnd();
  for (const e of sim.debugLog) {
    if (/assuming .* nearby/.test(e.text)) { bump('objective call assumes unseen enemies'); if (examples.length < 6) examples.push(`${(e.t / 60).toFixed(1)}m ${e.text}`); }
    if (/takes the long way round/.test(e.text)) bump('takes the long way round');
    if (/: BURN/.test(e.text)) bump('objective: burn (nobody contesting)');
    if (/: (BAIT|FIGHT|RETREAT|RACE)/.test(e.text)) bump('objective: contested stance');
  }
  for (const e of sim.events) if (/snipes .* across the map/.test(e.text)) { bump('global snipe kill'); if (examples.length < 10) examples.push(`${(e.t / 60).toFixed(1)}m ${e.text}`); }
}
for (const [k, n] of Object.entries(count).sort()) console.log(`${k.padEnd(42)} ${(n / N).toFixed(1)} / game`);
console.log(examples.join('\n'));
