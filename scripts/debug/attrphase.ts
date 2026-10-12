// Attribute effect test: identical teams except one attribute (A high, B low), mirrored comps.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput, SimPlayerInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const attr = process.argv[2] as keyof SimPlayerInput;
const hi = Number(process.argv[3] ?? 90), lo = Number(process.argv[4] ?? 50);
const N = Number(process.argv[5] ?? 30);
const mk = (id: string, champs: string[], v: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [], [attr]: v } as SimPlayerInput)) });
let winsA = 0; const sum: Record<string, [number, number]> = {};
const add = (k: string, a: number, b: number) => { const s = (sum[k] ??= [0, 0]); s[0] += a; s[1] += b; };
for (let g = 0; g < N; g++) {
  const rng = new RNG(500 + Math.floor(g / 2));
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const c1 = pick(), c2 = pick();
  const [ca, cb] = g % 2 ? [c2, c1] : [c1, c2];
  const aBlue = Math.floor(g / 2) % 2 === 0;
  const A = mk('A', ca, hi), B = mk('B', cb, lo);
  const sim = new MatchSim(aBlue ? A : B, aBlue ? B : A, { seed: 9000 + g });
  while (sim.t < Number(process.env.UNTIL ?? 840) && sim.winner === null) sim.step();
  const r = { winner: null as any, duration: sim.t, players: sim.champs.map((c) => ({ side: c.side, role: c.role, cs: c.cs, vision: 0, wardsPlaced: 0, damage: 0, k: c.kills ?? 0, a: 0, gold: c.goldEarned ?? 0 })), teams: sim.teams.map((t) => ({ kills: t.kills ?? 0, dragons: t.dragons })), goldDiff: {} as any };
  const sa = aBlue ? 0 : 1;
  if (r.winner === sa) winsA++;
  const mins = r.duration / 60;
  const side = (s: number) => r.players.filter((p) => p.side === s);
  const tot = (s: number, f: (p: typeof r.players[number]) => number) => side(s).reduce((x, p) => x + f(p), 0);
  add('CS/min (team)', tot(sa, (p) => p.cs) / mins, tot(1 - sa, (p) => p.cs) / mins);
  add('vision/min', tot(sa, (p) => p.vision) / mins, tot(1 - sa, (p) => p.vision) / mins);
  add('wards placed', tot(sa, (p) => p.wardsPlaced), tot(1 - sa, (p) => p.wardsPlaced));
  add('kills', r.teams[sa].kills, r.teams[1 - sa].kills);
  add('dmg/min', tot(sa, (p) => p.damage) / mins, tot(1 - sa, (p) => p.damage) / mins);
  add('gold', tot(sa, (p) => (p as any).gold), tot(1 - sa, (p) => (p as any).gold));
  for (const role of ['top','mid','adc']) add('cs ' + role, side(sa).find((p) => p.role === role)!.cs, side(1 - sa).find((p) => p.role === role)!.cs);
  add('dragons', r.teams[sa].dragons.length, r.teams[1 - sa].dragons.length);
  add('jungler KP', (side(sa).find((p) => p.role === 'jungle')!.k + side(sa).find((p) => p.role === 'jungle')!.a) / Math.max(1, r.teams[sa].kills), (side(1 - sa).find((p) => p.role === 'jungle')!.k + side(1 - sa).find((p) => p.role === 'jungle')!.a) / Math.max(1, r.teams[1 - sa].kills));
}
console.log(`${attr}: A=${hi} vs B=${lo} over ${N} games — A wins ${(winsA / N * 100).toFixed(0)}%`);
for (const [k, [a, b]] of Object.entries(sum)) console.log(`  ${k.padEnd(16)} A ${(a / N).toFixed(2).padStart(8)}   B ${(b / N).toFixed(2).padStart(8)}`);
