// Mid-game wave-clearing decisions: how often each reason applies, alert by wave depth, and deaths while farming.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { laneProgress } from '../../src/engine/sim/map';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const picks = [['Aatrox', 'LeeSin', 'Orianna', 'Jinx', 'Leona'], ['Renekton', 'Vi', 'Azir', 'Kaisa', 'Nautilus']];
const mk = (id: string, ch: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: ch[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const reasons: Record<string, number> = {}; const alertBy: Record<string, [number, number]> = {}; const deaths: Record<string, number> = {};
let tot = 0;
for (const seed of [21, 22, 23, 24, 25, 26]) {
  const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
  const wasDead = new Map<number, boolean>();
  const lastReason = new Map<number, string>();
  while (sim.winner === null && sim.t < 2400) {
    sim.step();
    for (const c of sim.champs) {
      if (c.dead && !wasDead.get(c.idx) && sim.t > 840) { const r = lastReason.get(c.idx) ?? 'other'; deaths[r] = (deaths[r] ?? 0) + 1; }
      wasDead.set(c.idx, c.dead);
      if (sim.t <= 840 || c.dead || c.role === 'jungle' || c.role === 'support') { lastReason.set(c.idx, 'other'); continue; }
      const onLane = c.task.kind === 'lane' && c.recallUntil <= sim.t;
      const key = onLane ? `${c.waveIntent}: ${c.waveReason}` : c.task.kind === 'objective' && c.waveReason?.startsWith('clearing') ? 'objective detour: ' + c.waveReason.split(' before ')[0] : 'not on a wave (' + c.task.kind + ')';
      lastReason.set(c.idx, onLane ? c.waveIntent : c.task.kind);
      reasons[key] = (reasons[key] ?? 0) + sim.dt; tot += sim.dt;
      if (onLane && c.task.lane) {
        const g = laneProgress(c.task.lane, c.pos), d = c.side === 0 ? g : 1 - g;
        const b = `depth ${(Math.floor(d * 5) / 5).toFixed(1)}`;
        const a = (alertBy[b] ??= [0, 0]); a[0] += c.alert * sim.dt; a[1] += sim.dt;
      }
    }
  }
}
console.log('Mid/late game time of side laners (top/mid/adc):');
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log('  ' + k.padEnd(56), (v / tot * 100).toFixed(1) + '%');
console.log('Average alert by position depth (0 = own base):');
for (const [k, [a, n]] of Object.entries(alertBy).sort()) console.log('  ' + k, (a / n).toFixed(2));
console.log('Deaths after 14:00 by what the player was doing:', deaths);
