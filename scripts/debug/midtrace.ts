// Mid-game timeline for one team: plan, objective calls, and what each player is doing every N seconds.
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
const seed = Number(process.argv[2] ?? 11), from = Number(process.argv[3] ?? 840), to = Number(process.argv[4] ?? 1500), step = Number(process.argv[5] ?? 5);
const sim = new MatchSim(mk('A', picks[0]), mk('B', picks[1]), { seed });
let next = from;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
while (sim.t < to && sim.winner === null) {
  sim.step();
  if (sim.t < next) continue;
  next += step;
  const tm = sim.teams[0];
  const calls = Object.entries(tm.objCalls).map(([k, v]) => `${k}:${v!.d}`).join(',');
  const waves = (['top', 'mid', 'bot'] as const).map((l) => {
    const ws = sim.waves.filter((w) => w.lane === l && w.side === 1);
    if (!ws.length) return `${l}:-`;
    const w = ws.reduce((a, b) => (a.p <= b.p ? a : b));
    return `${l}:${w.count}@${laneProgress(l, lanePoint(l, w.p)).toFixed(2)}`;
  }).join(' ');
  console.log(`${mmss(sim.t)} [${tm.plan.label}] calls{${calls}} redWaves{${waves}} cs=${sim.champs.filter((c) => c.side === 0).map((c) => c.cs).join('/')}`);
  for (const c of sim.champs.filter((x) => x.side === 0)) {
    const st = c.dead ? 'DEAD' : c.recallUntil > sim.t ? 'recall' : `${c.task.kind}${c.task.lane ? ':' + c.task.lane : ''}${c.task.objective ? ':' + c.task.objective : ''}`;
    const lane = c.task.lane;
    let wd = '';
    if (lane) { const ws = sim.waves.filter((w) => w.lane === lane && w.side === 1); if (ws.length) wd = ` wave@${Math.round(Math.min(...ws.map((w) => dist(lanePoint(lane, w.p), c.pos))))}`; }
    console.log(`     ${c.role.padEnd(8)} ${st.padEnd(22)} ${c.waveIntent}/${(c.waveReason ?? '').slice(0, 34).padEnd(34)} prog=${laneProgress(lane ?? 'mid', c.pos).toFixed(2)}${wd}${c.combatTarget !== null ? ' FIGHT' : ''}`);
  }
}
