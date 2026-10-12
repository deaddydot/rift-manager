// Super minion pressure: how often super waves walk into an undefended base, how often minions
// finish the Nexus with nobody defending, and who answers super waves.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, lanePoint, laneProgress, NEXUS } from '../../src/engine/sim/map';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 40);
const SKILL_B = Number(process.env.SKILL_B ?? 70);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
let minionShare = 0, minionMostly = 0;
const minionCtx: Record<string, number> = {}, awayTasks: Record<string, number> = {}, nearTasks: Record<string, number> = {}, waveSize: Record<string, number> = {};
let superSec = 0, superUndef = 0, inBaseSec = 0, inBaseUndef = 0, minionNexus = 0, games = 0, minutes = 0, superWaves = 0;
const answeredBy: Record<string, number> = {};
const endState: string[] = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(4100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), SKILL_B), { seed: 5100 + g, debug: true });
  const seenSuper = new Set<number>();
  // who damages each Nexus: minions or champions
  const nexusBy = [{ minion: 0, champ: 0 }, { minion: 0, champ: 0 }];
  const orig = sim.damageStructure.bind(sim);
  sim.damageStructure = (target, dmg, side, attacker) => {
    if (target === 'nexus') {
      const before = sim.nexusHp[1 - side]; orig(target, dmg, side, attacker); const done = Math.max(0, before - Math.max(0, sim.nexusHp[1 - side]));
      nexusBy[1 - side][attacker ? 'champ' : 'minion'] += done;
      if (!attacker && done > 0) {
        const def = 1 - side;
        const defNear = sim.champs.filter((c) => c.side === def && !c.dead && dist(c.pos, NEXUS[def]) < 2200).length;
        const attNear = sim.champs.filter((c) => c.side === side && !c.dead && dist(c.pos, NEXUS[def]) < 3500).length;
        const alive = sim.champs.filter((c) => c.side === def && !c.dead).length;
        const k = attNear ? 'during a siege' : defNear ? 'defenders there' : alive ? `nobody home (${alive} alive)` : 'all dead';
        const key = attNear ? k : defNear ? k : alive ? 'nobody home' : k;
        minionCtx[key] = (minionCtx[key] ?? 0) + done;
        if (key === 'defenders there') {
          const ws = sim.waves.filter((w) => w.side === side && dist(lanePoint(w.lane, w.p), NEXUS[def]) < 900);
          for (const w of ws) { const b = w.count >= 12 ? '12+' : w.count >= 7 ? '7-11' : '<7'; waveSize[b] = (waveSize[b] ?? 0) + done / ws.length; }
          for (const c of sim.champs) if (c.side === def && !c.dead && dist(c.pos, NEXUS[def]) < 2200) {
            const wd = Math.min(...ws.map((w) => dist(lanePoint(w.lane, w.p), c.pos)));
            const k2 = `${c.task.kind}${wd < Math.max(c.stats.range + 200, 550) ? '(in reach)' : wd < 1500 ? '(near)' : '(far)'}${c.combatTarget !== null ? '*fight' : ''}`;
            nearTasks[k2] = (nearTasks[k2] ?? 0) + done;
          }
        }
        if (key === 'nobody home') { for (const c of sim.champs) if (c.side === def && !c.dead) awayTasks[c.task.kind] = (awayTasks[c.task.kind] ?? 0) + done; }
      }
      return;
    }
    orig(target, dmg, side, attacker);
  };
  while (sim.winner === null) {
    sim.step();
    for (const w of sim.waves) {
      if (!w.supers) continue;
      if (!seenSuper.has(w.id)) { seenSuper.add(w.id); superWaves++; }
      const def = (1 - w.side) as 0 | 1;
      const p = lanePoint(w.lane, w.p);
      const depth = def === 0 ? laneProgress(w.lane, p) : 1 - laneProgress(w.lane, p); // distance from the defenders' base
      if (depth > 0.5) continue;
      const defenders = sim.champs.filter((c) => c.side === def && !c.dead && dist(c.pos, p) < 1800);
      superSec += sim.dt; if (!defenders.length) superUndef += sim.dt;
      if (depth < 0.2) { inBaseSec += sim.dt; if (!defenders.length) inBaseUndef += sim.dt; }
      for (const c of defenders) answeredBy[c.role + ':' + c.task.kind] = (answeredBy[c.role + ':' + c.task.kind] ?? 0) + sim.dt;
    }
  }
  games++; minutes += sim.t / 60;
  const loser = (1 - sim.winner) as 0 | 1;
  const attackersAtNexus = sim.champs.filter((c) => c.side === sim.winner && !c.dead && dist(c.pos, NEXUS[loser]) < 1600).length;
  const nb = nexusBy[loser];
  minionShare += nb.minion / Math.max(1, nb.minion + nb.champ);
  if (nb.minion > nb.champ) minionMostly++;
  if (attackersAtNexus === 0 && nb.minion > nb.champ) {
    minionNexus++;
    const alive = sim.champs.filter((c) => c.side === loser && !c.dead);
    endState.push(`g${g} ${Math.round(sim.t / 60)}m: loser alive ${alive.length} [${alive.map((c) => `${c.role}:${c.task.kind}${c.task.lane ? '/' + c.task.lane : ''}@${Math.round(dist(c.pos, NEXUS[loser]))}`).join(' ')}] plan=${sim.teams[loser].plan.kind}`);
  }
}
console.log(`${games} games, avg ${(minutes / games).toFixed(1)} min, super waves spawned ${superWaves}`);
console.log(`super waves in the defenders' half: ${Math.round(superSec)}s, undefended ${(superUndef / Math.max(1, superSec) * 100).toFixed(0)}%`);
console.log(`super waves inside the base (depth<0.2): ${Math.round(inBaseSec)}s, undefended ${(inBaseUndef / Math.max(1, inBaseSec) * 100).toFixed(0)}%`);
console.log(`Nexus damage dealt by minions: ${(minionShare / games * 100).toFixed(0)}% on average; games where minions did most of it: ${minionMostly}/${games}`);
console.log('minion Nexus damage by situation:', Object.entries(minionCtx).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
console.log('  what defenders were doing while nobody was home:', Object.entries(awayTasks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
console.log('  defenders near the Nexus while minions hit it:', Object.entries(nearTasks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
console.log('  wave sizes:', Object.entries(waveSize).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
console.log(`...of those, finished with no attacking champion near the Nexus: ${minionNexus}/${games}`);
for (const s of endState) console.log('  ' + s);
console.log('who stands at super waves (s):', Object.entries(answeredBy).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
// trace the last 60s of one game where minions finished the Nexus
if (process.env.TRACE) {
  const g = Number(process.env.TRACE);
  const rng = new RNG(4100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), SKILL_B), { seed: 5100 + g, debug: true });
  const lines: string[] = [];
  let last = 0;
  while (sim.winner === null) {
    sim.step();
    if (sim.t - last >= 5) {
      last = sim.t;
      for (const side of [0, 1] as const) {
        const ws = sim.waves.filter((w) => w.side !== side && (side === 0 ? w.p < 0.15 : w.p > 0.85));
        if (!ws.length) continue;
        lines.push(`${(sim.t / 60).toFixed(1)}m side${side} nexus ${Math.round(sim.nexusHp[side])} ntw ${sim.towers.filter((x) => x.alive && x.def.side === side && x.def.tier === 'nexus').length} inhibs ${sim.inhibs.filter((i) => i.side === side && i.alive).map((i) => i.lane).join('/')} | waves ${ws.map((w) => `${w.lane}:${w.count}(${w.supers}s) p${w.p.toFixed(3)} hp${Math.round(w.hp)}`).join(' ')} | def ${sim.champs.filter((c) => c.side === side && !c.dead).map((c) => `${c.role[0]}:${c.task.kind}@${Math.round(dist(c.pos, NEXUS[side]))}`).join(' ')}`);
      }
    }
  }
  console.log(lines.slice(-30).join('\n'));
}
