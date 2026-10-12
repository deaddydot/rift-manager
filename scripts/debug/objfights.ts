// Objective play check: 3-2 splits on Baron/Elder (team hitting it while 2+ teammates fight elsewhere),
// objective stances used, and who takes Baron/dragons.
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
const N = Number(process.argv[2] ?? 20);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const awayTask: Record<string, number> = {};
let fightSec = 0, splitSec = 0, baronSec = 0, steals = 0, barons = 0;
const stances: Record<string, number> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(1300 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 8800 + g, debug: true });
  while (sim.winner === null) {
    sim.step();
    for (const o of sim.objectives) {
      if (!o.alive || (o.kind !== 'baron' && o.kind !== 'elder')) continue;
      for (const side of [0, 1]) {
        if (![...o.attackers].some((i) => sim.champs[i].side === side)) continue;
        baronSec += sim.dt;
        const fighting = sim.champs.filter((c) => c.side === side && !c.dead && dist(c.pos, o.pos) > 3500 && c.lastCombatAt > sim.t - 1.5).length;
        if (fighting >= 2) fightSec += sim.dt;
        const away = sim.champs.filter((c) => c.side === side && !c.dead && c.recallUntil <= sim.t && dist(c.pos, o.pos) > 3000);
        if (away.length >= 2) { splitSec += sim.dt; for (const c of away) awayTask[c.task.kind + (c.lastCombatAt > sim.t - 2 ? '*fighting' : '')] = (awayTask[c.task.kind + (c.lastCombatAt > sim.t - 2 ? '*fighting' : '')] ?? 0) + sim.dt; }
      }
    }
  }
  for (const e of sim.debugLog) if (e.cat === 'call' && /: (BURN|RACE|SMITE|BAIT|FIGHT|RETREAT) —/.test(e.text)) { const k = e.text.split(':')[0] + ' ' + e.text.match(/(BURN|RACE|SMITE|BAIT|FIGHT|RETREAT)/)![1]; stances[k] = (stances[k] ?? 0) + 1; }
  steals += sim.events.filter((e) => e.type === 'steal').length;
  barons += sim.teams[0].barons + sim.teams[1].barons;
}
console.log(`time on Baron/Elder with 2+ teammates FIGHTING elsewhere (the 3-2): ${(fightSec / Math.max(1, baronSec) * 100).toFixed(1)}%`);
console.log(`time on Baron/Elder with 2+ teammates >3000 away (incl. walking in): ${(splitSec / Math.max(1, baronSec) * 100).toFixed(1)}% of ${Math.round(baronSec)}s`);
console.log('what the missing players were doing (s):', Object.entries(awayTask).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
console.log(`barons ${barons} in ${N} games, steals ${steals}`);
console.log('stances:', Object.entries(stances).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
