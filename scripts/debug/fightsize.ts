// Fight anatomy: for each skirmish (combat activity clustered in time and space), how many champions took
// part, how many died, and how it ended (one side retreating vs wiped). Separates "teams rarely meet"
// from "teams meet but disengage after one death".
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
const N = Number(process.argv[2] ?? 25);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
interface Fight { start: number; last: number; x: number; y: number; part: Set<number>; deaths: number; fleers: Set<number>; hp0: Map<number, number>; lowEnd: number; dmg: number }
const table: Record<string, { n: number; deaths: number; dur: number; low: number; fled: number; dmg: number }> = {};
let fightsTotal = 0;
const fleeWhy: Record<string, number> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(1700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 72), mk('B', pick(), 72), { seed: 9300 + g });
  const open: Fight[] = [];
  const done: Fight[] = [];
  const wasDead = new Array(10).fill(false);
  while (sim.winner === null) {
    sim.step();
    if (sim.t < 600) { for (const c of sim.champs) wasDead[c.idx] = c.dead; continue; } // mid/late game only
    for (const c of sim.champs) {
      const fighting = !c.dead && c.lastCombatAt > sim.t - 0.5;
      if (fighting) {
        let f = open.find((x) => dist({ x: x.x, y: x.y }, c.pos) < 2200);
        if (!f) { f = { start: sim.t, last: sim.t, x: c.pos.x, y: c.pos.y, part: new Set(), deaths: 0, fleers: new Set(), hp0: new Map(), lowEnd: 0, dmg: 0 }; open.push(f); }
        if (!f.hp0.has(c.idx)) f.hp0.set(c.idx, c.hp / c.stats.maxHp);
        f.part.add(c.idx); f.last = sim.t;
        if (c.task.kind === 'flee' && !f.fleers.has(c.idx)) {
          f.fleers.add(c.idx);
          const m = /ratio ([\d.]+), HP (\d+)%/.exec(c.task.reason ?? '');
          if (m) { const r = Number(m[1]), hp = Number(m[2]); const k = `${hp < 35 ? 'low HP' : 'healthy'} / ratio ${r < 0.5 ? '<0.5' : r < 0.8 ? '0.5-0.8' : r < 1.2 ? '0.8-1.2' : '1.2+'}`; fleeWhy[k] = (fleeWhy[k] ?? 0) + 1; }
          else fleeWhy['other: ' + (c.task.reason ?? '').slice(0, 30)] = (fleeWhy['other: ' + (c.task.reason ?? '').slice(0, 30)] ?? 0) + 1;
        }
      }
      if (c.dead && !wasDead[c.idx]) { const f = open.find((x) => x.part.has(c.idx)); if (f) f.deaths++; }
      wasDead[c.idx] = c.dead;
    }
    for (let i = open.length - 1; i >= 0; i--) if (sim.t - open[i].last > 6) {
      const f = open[i];
      for (const idx of f.part) { const c = sim.champs[idx]; if (!c.dead) { const lost = (f.hp0.get(idx) ?? 1) - c.hp / c.stats.maxHp; f.dmg += Math.max(0, lost); if (c.hp / c.stats.maxHp < 0.3) f.lowEnd++; } else f.dmg += f.hp0.get(idx) ?? 1; }
      done.push(...open.splice(i, 1));
    }
  }
  for (const f of done) {
    const sides = [0, 0];
    for (const i of f.part) sides[i < 5 ? 0 : 1]++;
    if (!sides[0] || !sides[1]) continue;
    const size = f.part.size;
    const k = size >= 8 ? '8-10 champs' : size >= 6 ? '6-7 champs' : size >= 4 ? '4-5 champs' : '2-3 champs';
    (table[k] ??= { n: 0, deaths: 0, dur: 0, low: 0, fled: 0, dmg: 0 }).n++; table[k].deaths += f.deaths; table[k].dur += f.last - f.start; table[k].low += f.lowEnd; table[k].fled += f.fleers.size; table[k].dmg += f.dmg / size;
    fightsTotal++;
  }
}
console.log(`${N} games, fights after 10:00 with both sides involved: ${(fightsTotal / N).toFixed(1)}/game`);
console.log('flee triggers (all fights):', Object.entries(fleeWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
for (const k of ['2-3 champs', '4-5 champs', '6-7 champs', '8-10 champs']) { const r = table[k]; if (r) console.log(`  ${k.padEnd(12)} ${(r.n / N).toFixed(1)}/game, avg deaths ${(r.deaths / r.n).toFixed(2)}, ${(r.dur / r.n).toFixed(1)}s long, survivors <30% HP ${(r.low / r.n).toFixed(2)}, fled ${(r.fled / r.n).toFixed(1)}, avg HP lost per participant ${(r.dmg / r.n * 100).toFixed(0)}%`); }
