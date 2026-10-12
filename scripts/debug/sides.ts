// Side bias: identical teams (same players, same champions) on both sides — where does one side get ahead?
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
const N = Number(process.argv[2] ?? 100);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const s = { win: [0, 0], fb: [0, 0], ft: [0, 0], fd: [0, 0], drag: [0, 0], baron: [0, 0], herald: [0, 0], grubs: [0, 0], kills: [0, 0], towers: [0, 0], gold15: 0, gold10: 0, gold20: 0, cs10: [0, 0] };
const towerLane: Record<string, number[]> = {};
const killsByMin: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
const deathsByRole: Record<string, number[]> = {};
for (let g = 0; g < N; g++) {
  const rng = new RNG(9000 + g + Number(process.argv[3] ?? 0));
  const champs = ROLES.map((r) => rng.pick(gd().championsByRole[r]).id);
  const sim = new MatchSim(mk('A', champs, 70), mk('B', champs, 70), { seed: 31000 + g + Number(process.argv[3] ?? 0) });
  let cs10done = false;
  while (sim.winner === null) {
    sim.step();
    if (!cs10done && sim.t >= 600) { cs10done = true; for (const c of sim.champs) s.cs10[c.side] += c.cs; }
  }
  const res = sim.result();
  s.win[res.winner!]++;
  const first = (type: string) => res.events.find((e) => e.type === type)?.side;
  const fb = first('firstBlood'); if (fb !== undefined) s.fb[fb]++;
  const ft = first('tower'); if (ft !== undefined) s.ft[ft]++;
  const fd = first('dragon'); if (fd !== undefined) s.fd[fd]++;
  for (const side of [0, 1]) {
    s.drag[side] += res.teams[side].dragons.length; s.baron[side] += res.teams[side].barons; s.herald[side] += res.teams[side].heralds; s.grubs[side] += res.teams[side].grubs;
    s.kills[side] += res.teams[side].kills; s.towers[side] += res.teams[side].towers;
  }
  s.gold10 += res.goldDiff[10] ?? 0; s.gold15 += res.goldDiff[15] ?? 0; s.gold20 += res.goldDiff[20] ?? 0;
  for (const e of res.events) {
    if (e.type === 'tower' && e.side !== undefined) { const m = /(top|mid|bot)/.exec(e.text)?.[1] ?? 'base'; (towerLane[`${e.side ? 'R' : 'B'} takes ${m}`] ??= [0])[0]++; }
    if (e.type === 'kill' && e.side !== undefined) { const b = e.t < 600 ? 0 : e.t < 900 ? 1 : e.t < 1500 ? 2 : 3; killsByMin[e.side][b]++; }
  }
  for (const p of res.players) (deathsByRole[p.role] ??= [0, 0])[p.side] += p.d;
}
const f = (a: number[]) => `B ${a[0]} / R ${a[1]}`;
console.log(`${N} identical-team games: wins ${f(s.win)}`);
console.log(`first blood ${f(s.fb)}, first tower ${f(s.ft)}, first dragon ${f(s.fd)}`);
console.log(`dragons ${f(s.drag)}, barons ${f(s.baron)}, heralds ${f(s.herald)}, grubs ${f(s.grubs)}, kills ${f(s.kills)}, towers ${f(s.towers)}`);
console.log(`blue gold lead avg @10 ${Math.round(s.gold10 / N)} @15 ${Math.round(s.gold15 / N)} @20 ${Math.round(s.gold20 / N)}; cs@10 ${f(s.cs10)}`);
console.log('kills by phase (<10, 10-15, 15-25, 25+):', `B ${killsByMin[0].join('/')}  R ${killsByMin[1].join('/')}`);
console.log('deaths by role:', Object.entries(deathsByRole).map(([r, d]) => `${r} ${f(d)}`).join(', '));
console.log('towers:', Object.entries(towerLane).sort().map(([k, v]) => `${k} ${v[0]}`).join(', '));
