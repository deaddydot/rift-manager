// CS by role at 10 / 15 / 20 minutes, and where lane minions go during laning (laner last-hit vs lost).
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
const N = Number(process.argv[2] ?? 30), S = Number(process.argv[3] ?? 75);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const at: Record<string, number[]> = {};
let spawned10 = 0, games = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(3300 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), S), mk('B', pick(), S), { seed: 7700 + g });
  const marks = [10, 15, 20];
  let seenWaves = new Set<number>();
  while (sim.winner === null && sim.t < 20 * 60 + 1) {
    sim.step();
    if (sim.t <= 600) for (const w of sim.waves) if (!seenWaves.has(w.id)) { seenWaves.add(w.id); spawned10 += w.count; }
    for (const m of marks) if (Math.abs(sim.t - m * 60) < sim.dt / 2) for (const c of sim.champs) (at[`${c.role}@${m}`] ??= []).push(c.cs);
  }
  games++;
}
const avg = (a: number[] = []) => (a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(0);
for (const r of ROLES) console.log(`${r.padEnd(8)} CS @10 ${avg(at[`${r}@10`])}  @15 ${avg(at[`${r}@15`])}  @20 ${avg(at[`${r}@20`])}`);
console.log(`minions spawned per lane per side by 10:00 ≈ ${(spawned10 / games / 6).toFixed(0)} (real pro laners: ~85-95 CS @10, ~135-150 @15)`);
