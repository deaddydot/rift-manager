import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, DRAGON_PIT, BARON_PIT, FOUNTAIN } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const where: Record<string, number> = {}; const sizes: Record<string, number> = {}; let total = 0, late = 0;
const perMin: number[] = Array(80).fill(0);
for (let g = 0; g < 8; g++) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 300 + g });
  const orig = sim.killChampion.bind(sim);
  (sim as any).killChampion = (v: any, k: any) => {
    total++; perMin[Math.floor(sim.t / 60)]++;
    if (sim.t > 1200) {
      late++;
      const near = (p: any, r: number) => dist(v.pos, p) < r;
      const loc = near(DRAGON_PIT, 2500) ? 'dragon' : near(BARON_PIT, 2500) ? 'baron' : near(FOUNTAIN[0], 4500) ? 'blue base' : near(FOUNTAIN[1], 4500) ? 'red base' : sim.towers.some((t) => t.alive && dist(t.def.pos, v.pos) < 1200) ? 'near tower' : 'other';
      where[loc] = (where[loc] ?? 0) + 1;
      const allies = sim.champs.filter((c) => c.side === v.side && !c.dead && c !== v && dist(c.pos, v.pos) < 2000).length;
      const enemies = sim.champs.filter((c) => c.side !== v.side && !c.dead && dist(c.pos, v.pos) < 2000).length;
      const key = `${allies + 1}v${enemies}`;
      sizes[key] = (sizes[key] ?? 0) + 1;
    }
    orig(v, k);
  };
  sim.runToEnd();
}
console.log('total kills', total / 8, 'late (>20m) per game', late / 8);
console.log('kills per minute (avg over 8 games):', perMin.slice(0, 50).map((x) => (x / 8).toFixed(1)).join(' '));
console.log('late kill locations', where);
console.log('late kill fight sizes (victim side vs killer side within 2000)', Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 12));
