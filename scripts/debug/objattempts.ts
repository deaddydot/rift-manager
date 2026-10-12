// Objective attempts: started (our team hitting it) → taken / stolen / abandoned, and why players left mid-way.
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
const N = Number(process.argv[2] ?? 20), skill = Number(process.argv[3] ?? 60);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: champs[i], mech: skill, lane: skill, farm: skill, tf: skill, macro: skill, vision: skill, pathing: skill, obj: skill, aggression: 50, consistency: skill, clutch: skill, shotcalling: skill, mastery: 70, farsight: 55, mistakes: 45, composure: 55, snowball: 50, resilience: 50, traits: [] })) });
const res: Record<string, Record<string, number>> = {}; const leave: Record<string, number> = {}; let ex = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(2300 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 9700 + g, debug: true });
  const sess = new Map<string, { start: number; side: number; peak: number; members: Set<number>; idle: number; minHp: number }>();
  const close = (key: string, outcome: string) => {
    const s = sess.get(key)!; sess.delete(key);
    const kind = key.split('|')[0];
    const o2 = outcome === 'abandoned' && (s.peak < 2 || s.minHp > 0.85) ? 'touched' : outcome;
    (res[kind] ??= {})[o2] = (res[kind][o2] ?? 0) + 1;
    if (o2 === 'touched') return;
    if (outcome === 'abandoned' && ex < 5 && kind === (process.env.KIND ?? 'herald')) {
      ex++;
      console.log(`  g${g} ${kind} abandoned by ${'AB'[s.side]} at ${Math.round(s.minHp * 100)}% HP, ${s.peak} peak attackers, ${Math.round(sim.t - s.start)}s`);
      for (const e of sim.debugLog) if (e.t >= s.start && e.t <= sim.t && e.idx !== null && s.members.has(e.idx) && (e.cat === 'task' || e.cat === 'recall' || e.cat === 'call')) console.log(`     ${Math.floor(e.t / 60)}:${String(Math.floor(e.t % 60)).padStart(2, '0')} ${sim.champs[e.idx].input.name} [${e.cat}] ${e.text}`);
    }
  };
  while (sim.winner === null) {
    sim.step();
    for (const o of sim.objectives) {
      for (const side of [0, 1]) {
        const key = `${o.kind}|${side}`;
        const hitting = o.alive ? [...o.attackers].filter((i) => sim.champs[i].side === side) : [];
        let s = sess.get(key);
        if (hitting.length && !s) { s = { start: sim.t, side, peak: 0, members: new Set(), idle: 0, minHp: 1 }; sess.set(key, s); }
        if (!s) continue;
        for (const i of hitting) s.members.add(i);
        s.peak = Math.max(s.peak, hitting.length);
        if (o.alive) s.minHp = Math.min(s.minHp, o.hp / o.maxHp);
        if (!o.alive) { close(key, o.takenBy === side ? 'taken' : 'lost to enemy'); continue; }
        s.idle = hitting.length ? 0 : s.idle + sim.dt;
        if (s.idle > 12) {
          // why did members leave?
          for (const i of s.members) { const c = sim.champs[i]; const k = c.dead ? 'died' : c.recallUntil > sim.t || c.task.kind === 'recall' || c.task.kind === 'base' ? 'recalled' : c.task.kind; leave[`${o.kind}: ${k}`] = (leave[`${o.kind}: ${k}`] ?? 0) + 1; }
          close(key, 'abandoned');
        }
      }
    }
  }
}
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(8), Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', '));
console.log('members of abandoned attempts were:', Object.entries(leave).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
