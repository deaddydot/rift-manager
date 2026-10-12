// After the first inhibitor falls: what both teams do until the game ends (long games especially).
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, NEXUS } from '../../src/engine/sim/map';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const N = Number(process.argv[2] ?? 30);
const SHOW = Number(process.env.SHOW ?? -1);
let afterInhib = 0, n = 0, inhibRespawns = 0;
const planTime: Record<string, number> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(4100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), 70), { seed: 5100 + g, debug: g === SHOW });
  let firstInhib: number | null = null, leader: 0 | 1 = 0, last = 0;
  while (sim.winner === null) {
    sim.step();
    if (firstInhib === null) { const dead = sim.inhibs.find((i) => !i.alive); if (dead) { firstInhib = sim.t; leader = (1 - dead.side) as 0 | 1; } continue; }
    const k = `${sim.teams[leader].plan.kind}`;
    planTime['leader:' + k] = (planTime['leader:' + k] ?? 0) + sim.dt;
    const k2 = `${sim.teams[1 - leader].plan.kind}`;
    planTime['trailer:' + k2] = (planTime['trailer:' + k2] ?? 0) + sim.dt;
    if (g === SHOW && sim.t - last >= 20) {
      last = sim.t;
      const L = sim.teams[leader], Tr = sim.teams[1 - leader];
      console.log(`${(sim.t / 60).toFixed(1)}m lead ${L.input.short} kills ${L.kills}-${Tr.kills} gold ${Math.round((sim.champs.filter((c) => c.side === leader).reduce((s, c) => s + c.goldEarned, 0) - sim.champs.filter((c) => c.side !== leader).reduce((s, c) => s + c.goldEarned, 0)) / 100) / 10}k | lead plan "${L.plan.label ?? L.plan.kind}" alive ${sim.living(leader).length} | trail plan "${Tr.plan.label ?? Tr.plan.kind}" alive ${sim.living((1 - leader) as 0 | 1).length} | trail inhibs ${sim.inhibs.filter((i) => i.side !== leader && i.alive).length} ntw ${sim.towers.filter((x) => x.alive && x.def.side !== leader && x.def.tier === 'nexus').length} nexus ${Math.round(sim.nexusHp[1 - leader])} | lead near their nexus ${sim.champs.filter((c) => c.side === leader && !c.dead && dist(c.pos, NEXUS[1 - leader]) < 5000).length}`);
    }
  }
  for (const e of sim.events) if (e.type === 'info' && /inhibitor respawned/.test(e.text)) inhibRespawns++;
  if (firstInhib !== null) { afterInhib += (sim.t - firstInhib) / 60; n++; }
  if (SHOW < 0) console.log(`g${g}: ${(sim.t / 60).toFixed(1)}m, first inhib ${firstInhib ? (firstInhib / 60).toFixed(1) : '-'}m, winner ${sim.winner === leader ? 'inhib taker' : 'other'}`);
}
if (SHOW < 0) {
  console.log(`avg time from first inhibitor to the end: ${(afterInhib / Math.max(1, n)).toFixed(1)} min; inhib respawns ${inhibRespawns}`);
  console.log('plans after first inhib (s):', Object.entries(planTime).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
}
