// Print the decision log (and position/HP/nearby enemies every second) for one player in a time window.
// Usage: npx tsx scripts/debug/trace1.ts <game index> <player e.g. Amid> <from m:ss> <to m:ss>
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
const [gi, who, from, to] = [Number(process.argv[2] ?? 0), process.argv[3] ?? 'Amid', process.argv[4] ?? '3:00', process.argv[5] ?? '3:30'];
const sec = (s: string) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
// same seeds as scripts/debug/oscillate.ts
const rng = new RNG(5100 + gi);
const used = new Set<string>();
const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), 70), { seed: 8100 + gi, debug: true });
const c = sim.champs.find((x) => x.input.name === who)!;
const f = sec(from), tt = sec(to);
let last = -1;
const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));
while (sim.winner === null && sim.t < tt) {
  sim.step();
  if (sim.t < f || Math.floor(sim.t) === last) continue;
  last = Math.floor(sim.t);
  const near = sim.champs.filter((e) => e.side !== c.side && !e.dead && d(e.pos, c.pos) < 1500)
    .map((e) => `${e.input.name}(${e.champ.name}) d${d(e.pos, c.pos)} ${e.task.kind}${e.combatTarget === c.idx ? ' →ME' : ''} hp${Math.round(e.hp / e.stats.maxHp * 100)}%`);
  console.log(`${mmss(sim.t)} ${who}(${c.champ.name}) ${c.task.kind} hp${Math.round(c.hp / c.stats.maxHp * 100)}% (${Math.round(c.pos.x)},${Math.round(c.pos.y)}) tgt=${c.combatTarget ?? '-'} | ${near.join(', ') || '—'}`);
}
for (const e of sim.debugLog) if (e.idx === c.idx && e.t >= f && e.t <= tt) console.log(`   LOG ${mmss(e.t)} [${e.cat}] ${e.text}`);
