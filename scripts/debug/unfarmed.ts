// Minions that die with no farmer of the killing side nearby: where are they and what are the laners doing?
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { lanePoint, laneProgress, dist } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const [from, to] = (process.argv[2] ?? '840,1800').split(',').map(Number);
const acc: Record<string, number> = {};
const add = (k: string, n: number) => { acc[k] = (acc[k] ?? 0) + n; };
for (const seed of [11, 12, 13, 14]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  const orig = sim.damageWave.bind(sim);
  (sim as any).damageWave = (w: any, dmg: number, att: any) => {
    const before = w.count;
    const pos = lanePoint(w.lane, w.p);
    const ks = 1 - w.side;
    orig(w, dmg, att);
    const died = before - w.count;
    if (died <= 0 || sim.t < from || sim.t >= to) return;
    const team = sim.champs.filter((c) => c.side === ks);
    const nearest = Math.min(...team.filter((c) => !c.dead).map((c) => dist(c.pos, pos)), 99999);
    if (nearest < 1400) return;
    const g = laneProgress(w.lane, pos); const depth = ks === 0 ? g : 1 - g;
    add(`lane=${w.lane}`, died);
    add(`depth=${(Math.floor(depth * 5) / 5).toFixed(1)}`, died);
    // who of the killer team is assigned to this lane, and what are they doing
    const assigned = team.filter((c) => c.task.lane === w.lane && c.task.kind === 'lane');
    if (!assigned.length) {
      const laners = team.filter((c) => c.role !== 'jungle' && c.role !== 'support');
      add('nobody assigned', died);
      for (const c of laners) add(`  unassigned laner doing: ${c.dead ? 'dead' : c.recallUntil > sim.t ? 'recall' : c.task.kind + (c.task.lane ? '-' + c.task.lane : '')}`, died / laners.length);
    } else {
      const c = assigned[0];
      add(`assigned (${c.role}) ${c.dead ? 'dead' : c.recallUntil > sim.t ? 'recalling' : 'alive'} intent=${c.waveIntent}`, died);
      if (!c.dead && c.recallUntil <= sim.t) add(`  assigned dist ${Math.min(4, Math.floor(dist(c.pos, pos) / 1000))}k+`, died);
    }
  };
  while (sim.t < to && sim.winner === null) sim.step();
}
for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(52), Math.round(v));
