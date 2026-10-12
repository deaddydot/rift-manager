// Crowd-control chains: longest continuous lockdown (stun/root/knockup/... or rooted) per game, how often a
// champion is locked for 4+ / 6+ seconds straight, and which abilities applied the CC in those chains.
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
const N = Number(process.argv[2] ?? 40);
const ONLY = process.argv[3]; // optional: force this champion into every game (e.g. Taliyah)
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
let maxAll = 0, over4 = 0, over6 = 0, games = 0;
const culprits: Record<string, number> = {};
const maxes: number[] = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(4400 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const a = pick(), b = pick();
  if (ONLY) { const ch = gd().championById[ONLY]; const r = ROLES.indexOf(ch.positions[0]); a[r] = ONLY; }
  const sim = new MatchSim(mk('A', a, 70), mk('B', b, 70), { seed: 12000 + g, debug: true });
  const streak = new Array(10).fill(0);
  let gameMax = 0;
  while (sim.winner === null) {
    sim.step();
    for (const c of sim.champs) {
      const locked = !c.dead && (c.ccUntil > sim.t || (c.rootUntil ?? 0) > sim.t);
      if (locked) streak[c.idx] += sim.dt;
      else if (streak[c.idx] > 0) {
        const s = streak[c.idx];
        if (s >= 4) {
          over4++;
          if (s >= 6) over6++;
          // who did it: CC log lines on this champion in the streak window
          for (const e of sim.debugLog) if (e.idx === c.idx && e.cat === 'cc' && e.t > sim.t - s - 0.5 && e.t <= sim.t) { const m = / by (.+?) \(/.exec(e.text); if (m) culprits[m[1].replace(/^[AB](top|jungle|mid|adc|support)'s /, '')] = (culprits[m[1].replace(/^[AB](top|jungle|mid|adc|support)'s /, '')] ?? 0) + 1; }
        }
        gameMax = Math.max(gameMax, s);
        streak[c.idx] = 0;
      }
    }
  }
  maxAll = Math.max(maxAll, gameMax); maxes.push(gameMax); games++;
}
maxes.sort((x, y) => x - y);
console.log(`${games} games${ONLY ? ` (with ${ONLY})` : ''}: longest lockdown median ${maxes[Math.floor(games / 2)].toFixed(1)}s, max ${maxAll.toFixed(1)}s; streaks ≥4s: ${(over4 / games).toFixed(2)}/game, ≥6s: ${(over6 / games).toFixed(2)}/game`);
console.log('abilities in long chains:', Object.entries(culprits).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(', '));
