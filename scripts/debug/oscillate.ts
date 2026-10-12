// Indecision detector: any player whose task flips A → B → A within a short window, grouped by pattern,
// plus movement jitter (destination reversing direction repeatedly while not in combat).
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput, SimChamp } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist } from '../../src/engine/sim/map';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 20), WIN = Number(process.argv[3] ?? 8);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const key = (c: SimChamp) => `${c.task.kind}${c.task.lane ? ':' + c.task.lane : ''}${c.task.objective ? ':' + c.task.objective : ''}`;
const patterns: Record<string, number> = {};
const samples: Record<string, string> = {};
let jitterSec = 0, totalSec = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(5100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), 70), { seed: 8100 + g, debug: true });
  const hist = sim.champs.map(() => [] as { t: number; k: string; why: string }[]);
  const lastDest = sim.champs.map(() => null as null | { x: number; y: number });
  const flipCount = sim.champs.map(() => [] as number[]);
  while (sim.winner === null) {
    sim.step();
    for (const c of sim.champs) {
      if (c.dead) continue;
      const h = hist[c.idx];
      const k = key(c);
      if (!h.length || h[h.length - 1].k !== k) {
        h.push({ t: sim.t, k, why: c.task.reason ?? '' });
        const n = h.length;
        if (n >= 3 && h[n - 1].k === h[n - 3].k && h[n - 1].t - h[n - 3].t < WIN) {
          const pat = `${c.role}: ${h[n - 3].k.replace(/:(top|mid|bot)/, ':L')} ⇄ ${h[n - 2].k.replace(/:(top|mid|bot)/, ':L')}`;
          patterns[pat] = (patterns[pat] ?? 0) + 1;
          samples[pat] ??= `g${g} ${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')} ${c.input.name}: "${h[n - 3].why}" → "${h[n - 2].why}" → back`;
        }
      }
      // movement jitter: out of combat, destination direction flips by > 150° several times within 3s
      if (Math.abs(sim.t * 2 - Math.round(sim.t * 2)) < 1e-6) {
        totalSec += 0.5;
        const d = c.dest, p = lastDest[c.idx];
        if (d && p && c.combatTarget === null && c.lastCombatAt < sim.t - 2) {
          const a = { x: d.x - c.pos.x, y: d.y - c.pos.y }, b = { x: p.x - c.pos.x, y: p.y - c.pos.y };
          const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
          if (la > 300 && lb > 300 && (a.x * b.x + a.y * b.y) / (la * lb) < -0.85) flipCount[c.idx].push(sim.t);
          flipCount[c.idx] = flipCount[c.idx].filter((x) => sim.t - x < 3);
          if (flipCount[c.idx].length >= 3) jitterSec += 0.5;
        }
        lastDest[c.idx] = d ? { ...d } : null;
      }
    }
  }
}
console.log(`${N} games — task flips A→B→A within ${WIN}s (per game):`);
for (const [p, n] of Object.entries(patterns).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${(n / N).toFixed(2).padStart(5)}  ${p}\n         e.g. ${samples[p]}`);
console.log(`movement jitter (dest reversing ≥3× in 3s, out of combat): ${(jitterSec / Math.max(1, totalSec) * 100).toFixed(2)}% of player-time`);
void dist;
