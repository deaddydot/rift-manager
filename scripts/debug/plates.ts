// Outer turret damage before 14:00 (plates): who deals it (minions / champions by role), and how often a
// laner's wave is tanking an enemy outer turret while the laner is close enough to hit it.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, lanePoint } from '../../src/engine/sim/map';
import { TOWER_RANGE } from '../../src/engine/sim/constants';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 20);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const by: Record<string, number> = {};
let waveUnderSec = 0, laneNearSec = 0, plates = 0;
const whereWhenUnder: Record<string, number> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(1700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 72), mk('B', pick(), 72), { seed: 9300 + g });
  const orig = sim.damageStructure.bind(sim);
  sim.damageStructure = (target, dmg, side, attacker) => {
    if (target !== 'nexus' && 'def' in target && target.def.tier === 'outer' && sim.t < 840) by[attacker ? attacker.role : 'minions'] = (by[attacker ? attacker.role : 'minions'] ?? 0) + dmg;
    orig(target, dmg, side, attacker);
  };
  let last = -1;
  while (sim.winner === null && sim.t < 840) {
    sim.step();
    if (Math.floor(sim.t) === last) continue;
    last = Math.floor(sim.t);
    for (const tw of sim.towers) {
      if (!tw.alive || tw.def.tier !== 'outer' || tw.def.lane === 'base') continue;
      const atk = (1 - tw.def.side) as 0 | 1;
      const under = sim.waves.some((w) => w.side === atk && w.stopped && w.lane === tw.def.lane && dist(lanePoint(w.lane, w.p), tw.def.pos) < TOWER_RANGE + 200);
      if (!under) continue;
      waveUnderSec++;
      const laners = sim.champs.filter((c) => c.side === atk && !c.dead && c.task.kind === 'lane' && c.task.lane === tw.def.lane && c.role !== 'support' && c.role !== 'jungle');
      if (laners.some((c) => dist(c.pos, tw.def.pos) < c.stats.range + 250)) laneNearSec++;
      for (const c of laners) { const d = dist(c.pos, tw.def.pos); const k = d < c.stats.range + 250 ? 'in range' : d < 1500 ? 'near (<1500)' : 'away'; whereWhenUnder[`${k} (${c.waveIntent})`] = (whereWhenUnder[`${k} (${c.waveIntent})`] ?? 0) + 1; }
    }
  }
  plates += sim.events.filter((e) => e.type === 'plate').length;
}
const tot = Object.values(by).reduce((a, b) => a + b, 0);
console.log(`${N} games, plates before 14:00: ${(plates / N).toFixed(1)}/game`);
console.log('outer turret damage before 14:00 by source:', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tot * 100).toFixed(0)}%`).join(', '));
console.log(`seconds an outer turret has an enemy wave under it: ${(waveUnderSec / N).toFixed(0)}/game; a laner in hitting range ${(laneNearSec / Math.max(1, waveUnderSec) * 100).toFixed(0)}% of that time`);
console.log('where the laners are then (laner-seconds, by wave intent):', Object.entries(whereWhenUnder).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${(v / N).toFixed(0)}`).join(', '));
