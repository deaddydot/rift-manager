// Laner discipline and jungler indecision:
//  - laners (top/mid/adc) chasing into the jungle: how often, how far/long, who they chase, does it pay off
//  - time laners spend off their lane while their wave is being lost (CS dying unfarmed)
//  - junglers flip-flopping: gank ↔ something else ↔ gank on the same lane within a short window
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput, SimChamp } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { dist, laneDistance, nearestLane, lanePoint, NEXUS, type Lane } from '../../src/engine/sim/map';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 30);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const laneOf = (c: SimChamp): Lane => (c.role === 'top' ? 'top' : c.role === 'mid' ? 'mid' : 'bot');
interface Chase { idx: number; task: string; start: number; startPos: { x: number; y: number }; target: number; maxOff: number; kill: boolean; died: boolean }
const chases: { role: string; task: string; targetRole: string; dur: number; off: number; kill: boolean; died: boolean; phase: string }[] = [];
let offLaneSec: Record<string, number> = {}, laneSec: Record<string, number> = {};
const offReasons: Record<string, number> = {};
let flips = 0, gankEpisodes = 0, jgSeconds = 0;
const flipSamples: string[] = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(2200 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), 70), { seed: 6600 + g, debug: true });
  const open = new Map<number, Chase>();
  const jgHist = new Map<number, { t: number; k: string }[]>();
  let lastSec = -1;
  while (sim.winner === null && sim.t < 28 * 60) {
    sim.step();
    const sec = Math.floor(sim.t);
    if (sec === lastSec) continue;
    lastSec = sec;
    const phase = sim.t < 840 ? 'laning' : 'mid';
    for (const c of sim.champs) {
      if (c.dead) { const o = open.get(c.idx); if (o) { o.died = true; } continue; }
      if (c.role === 'jungle') {
        jgSeconds++;
        const h = jgHist.get(c.idx) ?? []; jgHist.set(c.idx, h);
        const k = c.task.kind === 'gank' ? `gank:${c.task.lane}` : c.task.kind;
        if (!h.length || h[h.length - 1].k !== k) h.push({ t: sim.t, k });
        continue;
      }
      if (c.role === 'support') continue;
      if (c.recallUntil > sim.t || dist(c.pos, NEXUS[c.side]) < 3500) continue;
      const lane = (c.task.kind === 'lane' || c.task.kind === 'push') && c.task.lane ? c.task.lane : laneOf(c);
      const off = laneDistance(lane, c.pos);
      const key = `${c.role}/${phase}`;
      if (off > 1600) { offLaneSec[key] = (offLaneSec[key] ?? 0) + 1; const rk = `${c.role}/${phase}: ${c.task.kind}${c.combatTarget !== null ? '*fight' : ''}`; offReasons[rk] = (offReasons[rk] ?? 0) + 1; }
      else laneSec[key] = (laneSec[key] ?? 0) + 1;
      // chase tracking: in combat and off lane
      const o = open.get(c.idx);
      if (c.combatTarget !== null && off > 1200) {
        if (!o) open.set(c.idx, { idx: c.idx, task: c.task.kind, start: sim.t, startPos: { ...c.pos }, target: c.combatTarget, maxOff: off, kill: false, died: false });
        else o.maxOff = Math.max(o.maxOff, off);
      } else if (o && sim.t - o.start > 0) {
        const tgt = sim.champs[o.target];
        o.kill = tgt.dead;
        chases.push({ role: c.role, task: o.task, targetRole: tgt.role, dur: sim.t - o.start, off: o.maxOff, kill: o.kill, died: o.died, phase });
        open.delete(c.idx);
      }
    }
  }
  // flip-flops: gank:X → other → gank:X within 25s
  for (const [idx, h] of jgHist) {
    for (let i = 0; i < h.length; i++) if (h[i].k.startsWith('gank')) gankEpisodes++;
    for (let i = 2; i < h.length; i++) {
      if (h[i].k.startsWith('gank') && h[i].k === h[i - 2].k && h[i].t - h[i - 2].t < 25) {
        flips++;
        if (flipSamples.length < 6) flipSamples.push(`g${g} ${sim.champs[idx].input.name} ${Math.floor(h[i - 2].t / 60)}:${String(Math.floor(h[i - 2].t % 60)).padStart(2, '0')} ${h[i - 2].k} → ${h[i - 1].k} → ${h[i].k} (${(h[i].t - h[i - 2].t).toFixed(0)}s)`);
      }
    }
  }
}
const pct = (a: number, b: number) => `${(a / Math.max(1, a + b) * 100).toFixed(1)}%`;
console.log(`${N} games (to 28 min)`);
for (const k of Object.keys({ ...laneSec, ...offLaneSec }).sort()) console.log(`  ${k.padEnd(14)} off-lane ${pct(offLaneSec[k] ?? 0, laneSec[k] ?? 0)}`);
console.log('top off-lane activities (s/game):', Object.entries(offReasons).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${(v / N).toFixed(0)}`).join(', '));
const deep = chases.filter((c) => c.off > 2200 && (c.task === 'lane' || c.task === 'push'));
const waveTime = deep.reduce((s, c) => s + c.dur, 0) / N;
console.log(`chases off lane: ${chases.length} (${(chases.length / N).toFixed(1)}/game); deep (>2200 off lane) while on lane/push duty ${deep.length} (${(deep.length / N).toFixed(1)}/game, ${waveTime.toFixed(0)}s/game away from the wave), avg ${(deep.reduce((s, c) => s + c.dur, 0) / Math.max(1, deep.length)).toFixed(1)}s, kill rate ${pct(deep.filter((c) => c.kill).length, deep.filter((c) => !c.kill).length)}, chaser died ${deep.filter((c) => c.died).length}`);
const byTarget: Record<string, number> = {};
for (const c of deep) byTarget[`${c.role}→${c.targetRole} (${c.phase})`] = (byTarget[`${c.role}→${c.targetRole} (${c.phase})`] ?? 0) + 1;
console.log('deep chases by role→target:', Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`jungler gank flip-flops (gank X → other → gank X within 25s): ${flips} in ${N} games (${(flips / N).toFixed(1)}/game), gank task episodes ${gankEpisodes}`);
for (const s of flipSamples) console.log('  ' + s);
void lanePoint; void nearestLane;
