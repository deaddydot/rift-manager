// What led to each Baron: the taking team's calls/plans in the 40s before, alive counts and gold lead.
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
const N = Number(process.argv[2] ?? 20);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const ctx: Record<string, number> = {}, why: Record<string, number> = {};
let n = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(1700 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 72), mk('B', pick(), 72), { seed: 9300 + g, debug: true });
  const startedAlive: Record<number, string> = {};
  let attacked = [false, false];
  while (sim.winner === null) {
    sim.step();
    const b = sim.objectives.find((o) => o.kind === 'baron' && o.alive);
    if (b) for (const s of [0, 1] as const) {
      const on = [...b.attackers].some((i) => sim.champs[i].side === s);
      if (on && !attacked[s]) startedAlive[s] = `${sim.living(s).length}v${sim.living((1 - s) as 0 | 1).length}`;
      attacked[s] = on;
    }
    if (!b) attacked = [false, false];
  }
  for (const e of sim.events.filter((x) => x.type === 'baron')) {
    n++;
    const s = e.side!;
    const k = startedAlive[s] ?? '?';
    ctx[`started ${k}`] = (ctx[`started ${k}`] ?? 0) + 1;
    const calls = sim.debugLog.filter((x) => x.side === s && x.idx === null && (x.cat === 'call' || x.cat === 'plan') && x.t > e.t - 45 && x.t <= e.t && /baron/i.test(x.text));
    const first = calls[0]?.text.replace(/\(score [^)]*\)/, '').replace(/[\d.]+/g, '#').slice(0, 60) ?? '(no baron call logged)';
    why[first] = (why[first] ?? 0) + 1;
  }
}
console.log(`${n} barons in ${N} games (${(n / N).toFixed(2)}/game)`);
console.log('numbers when the taking team started hitting it:', Object.entries(ctx).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('first baron-related call in the 45s before:'); for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${v}  ${k}`);
