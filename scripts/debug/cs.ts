import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { lanePoint } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 42 });
const deaths: Record<string, number> = {}; const credited: Record<string, number> = {}; const reasons: Record<string, number> = {};
const orig = sim.damageWave.bind(sim);
(sim as any).damageWave = (w: any, dmg: number, att: any) => {
  const before = w.count;
  const csBefore = sim.champs.reduce((s, c) => s + c.cs, 0);
  orig(w, dmg, att);
  const died = before - w.count;
  if (died > 0) {
    const k = `${w.lane}-${w.side}`;
    deaths[k] = (deaths[k] ?? 0) + died;
    credited[k] = (credited[k] ?? 0) + sim.champs.reduce((s, c) => s + c.cs, 0) - csBefore;
    reasons[att ? 'champ' : 'other'] = (reasons[att ? 'champ' : 'other'] ?? 0) + died;
  }
};
while (sim.t < 600) sim.step();
console.log('minion deaths by lane-side', deaths);
console.log('credited CS', credited);
console.log('killed by', reasons);
for (const c of sim.champs) console.log(c.input.name, c.cs, c.task.kind, c.deaths);
// time budget per champion during laning phase
{
  const sim2 = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed: 43 });
  const budget: Record<string, Record<string, number>> = {};
  while (sim2.t < 840) {
    sim2.step();
    for (const c of sim2.champs) {
      const b = (budget[c.input.name] ??= {});
      let k = c.dead ? 'dead' : c.recallUntil > sim2.t ? 'recalling' : c.task.kind;
      if (k === 'lane') {
        const lane = c.task.lane!;
        const enemyWaves = sim2.waves.filter((w) => w.lane === lane && w.side !== c.side);
        const near = enemyWaves.some((w) => Math.hypot(c.pos.x - lanePoint(lane, w.p).x, c.pos.y - lanePoint(lane, w.p).y) < 1150);
        k = near ? 'lane-near' : 'lane-far';
      }
      b[k] = (b[k] ?? 0) + sim2.dt;
    }
  }
  for (const [n, b] of Object.entries(budget)) console.log(n.padEnd(6), Object.entries(b).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${(v / 8.4).toFixed(0)}%`).join(' '));
}
