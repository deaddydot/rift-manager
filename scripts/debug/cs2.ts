import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { lanePoint, dist } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const [from, to] = (process.argv[2] ?? '840,1800').split(',').map(Number);
const stats: Record<string, number> = {};
for (const seed of [11, 12, 13, 14]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  const orig = sim.damageWave.bind(sim);
  (sim as any).damageWave = (w: any, dmg: number, att: any) => {
    const before = w.count, cs0 = sim.champs.reduce((s, c) => s + c.cs, 0);
    const pos = lanePoint(w.lane, w.p);
    const killerSide = 1 - w.side;
    const nearest = Math.min(...sim.champs.filter((c) => c.side === killerSide && !c.dead).map((c) => dist(c.pos, pos)), 99999);
    const towerNear = sim.towers.some((t) => t.alive && t.def.side === killerSide && dist(t.def.pos, pos) < 1000);
    orig(w, dmg, att);
    const died = before - w.count;
    if (died > 0 && sim.t >= from && sim.t < to) {
      const credited = sim.champs.reduce((s, c) => s + c.cs, 0) - cs0;
      stats.died = (stats.died ?? 0) + died;
      stats.credited = (stats.credited ?? 0) + credited;
      const k = att ? 'by champion' : towerNear ? 'by tower/wave near own tower' : 'by enemy wave';
      stats[k] = (stats[k] ?? 0) + died;
      const nk = nearest < 1400 ? 'farmer within 1400' : nearest < 3000 ? 'nearest 1400-3000' : 'nearest > 3000';
      stats[nk] = (stats[nk] ?? 0) + died;
      if (nearest < 1400) stats['credited|near'] = (stats['credited|near'] ?? 0) + credited;
    }
  };
  while (sim.t < to && sim.winner === null) sim.step();
}
console.log(stats);
