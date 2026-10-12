// How long do teams stand at an objective's staging spot without starting it, and who are they waiting for?
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist } from '../../src/engine/sim/map';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 15);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: champs[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const waitBy: Record<string, number> = {}; const missing: Record<string, number> = {};
let total = 0, longest = 0, gameTime = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(1700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 9100 + g });
  const streak = [0, 0];
  while (sim.winner === null) {
    sim.step();
    for (const side of [0, 1] as const) {
      const o = sim.objectives.find((x) => x.alive && ![...x.attackers].some((i) => sim.champs[i].side === side)
        && sim.champs.filter((c) => c.side === side && !c.dead && c.task.kind === 'objective' && c.task.objective === x.kind && dist(c.pos, x.pos) < 2600 && c.combatTarget === null).length >= 2);
      if (!o) { streak[side] = 0; continue; }
      streak[side] += sim.dt; total += sim.dt; longest = Math.max(longest, streak[side]);
      waitBy[o.kind] = (waitBy[o.kind] ?? 0) + sim.dt;
      for (const c of sim.champs) if (c.side === side && !c.dead && dist(c.pos, o.pos) > 2600) { const k = `${o.kind}: ${c.role} ${c.recallUntil > sim.t ? 'recalling' : c.task.kind}`; missing[k] = (missing[k] ?? 0) + sim.dt; }
    }
  }
  gameTime += sim.t;
}
console.log(`waiting at a live objective (2+ there, not hitting): ${Math.round(total)}s over ${N} games (${(total / gameTime * 60).toFixed(1)}s per game-minute per... ), longest streak ${Math.round(longest)}s`);
console.log('by objective:', Object.entries(waitBy).map(([k, v]) => `${k} ${Math.round(v / N)}s/game`).join(', '));
console.log('who they wait for (s/game):'); for (const [k, v] of Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ' + k.padEnd(32), Math.round(v / N));
