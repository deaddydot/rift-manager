// Headless calibration harness for the match simulator.
// Usage: npx tsx scripts/sim-test.ts [games=50] [seed=1]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../src/data/gamedata';
import { MatchSim } from '../src/engine/sim/engine';
import type { SimTeamInput, SimPlayerInput } from '../src/engine/sim/simtypes';
import type { Role } from '../src/engine/types';
import { RNG } from '../src/util/rng';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });

const N = Number(process.argv[2] ?? 50);
const seed0 = Number(process.argv[3] ?? 1);
const skillA = Number(process.argv[4] ?? 70);
const skillB = Number(process.argv[5] ?? 70);
const verbose = process.env.VERBOSE === '1';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];

function mkTeam(rng: RNG, id: string, skill: number, used: Set<string>): SimTeamInput {
  const players: SimPlayerInput[] = ROLES.map((role) => {
    const pool = gd().championsByRole[role].filter((c) => !used.has(c.id));
    const ch = rng.pick(pool);
    used.add(ch.id);
    const r = () => Math.max(20, Math.min(99, skill + rng.normal(0, 6)));
    return {
      playerId: `${id}_${role}`, name: `${id}${role[0].toUpperCase()}`, role, championId: ch.id,
      mech: r(), lane: r(), farm: r(), tf: r(), macro: r(), vision: r(), pathing: r(), obj: r(),
      aggression: 50 + rng.normal(0, 15), consistency: r(), clutch: r(), shotcalling: r(), mastery: 140,
      farsight: r() - 5, mistakes: Math.max(5, 75 - skill * 0.6 + rng.normal(0, 8)), composure: r(), snowball: 50, resilience: 50, traits: [],
    };
  });
  return {
    teamId: id, name: id, short: id, color: '#fff', players,
    tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'auto', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
    chemistry: 60,
  };
}

const agg: Record<string, number[]> = {};
const add = (k: string, v: number) => (agg[k] ??= []).push(v);
let blueWins = 0, aWins = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const mirror = process.env.MIRROR === '1';
  const rng = new RNG(seed0 * 1000 + (mirror ? Math.floor(g / 2) : g));
  const used = new Set<string>();
  let a = mkTeam(rng, 'A', skillA, used), b = mkTeam(rng, 'B', skillB, used);
  if (mirror && g % 2 === 1) {
    // swap champion picks so champion strength cancels out across the pair
    const pa = a.players.map((p) => p.championId), pb = b.players.map((p) => p.championId);
    a = { ...a, players: a.players.map((p, i) => ({ ...p, championId: pb[i] })) };
    b = { ...b, players: b.players.map((p, i) => ({ ...p, championId: pa[i] })) };
  }
  const aBlue = mirror ? Math.floor(g / 2) % 2 === 0 : g % 2 === 0;
  const sim = new MatchSim(aBlue ? a : b, aBlue ? b : a, { seed: seed0 * 7919 + g });
  const res = sim.runToEnd();
  if (res.winner === 0) blueWins++;
  if ((res.winner === 0) === aBlue) aWins++;
  add('duration_min', res.duration / 60);
  {
    const aSide = aBlue ? 0 : 1;
    const gd15 = res.goldDiff[15] ?? res.goldDiff[res.goldDiff.length - 1] ?? 0;
    add('A_gold_lead@15', aSide === 0 ? gd15 : -gd15);
    add('A_kill_share', res.teams[aSide].kills / Math.max(1, res.teams[0].kills + res.teams[1].kills));
    const csA = res.players.filter((p) => p.side === aSide).reduce((s, p) => s + p.cs, 0), csB = res.players.filter((p) => p.side !== aSide).reduce((s, p) => s + p.cs, 0);
    add('A_cs_share', csA / Math.max(1, csA + csB));
    add('A_dragons', res.teams[aSide].dragons.length); add('B_dragons', res.teams[1 - aSide].dragons.length);
    add('A_towers', res.teams[aSide].towers); add('B_towers', res.teams[1 - aSide].towers);
  }
  add('kills_total', res.teams[0].kills + res.teams[1].kills);
  add('towers_total', res.teams[0].towers + res.teams[1].towers);
  add('dragons_total', res.teams[0].dragons.length + res.teams[1].dragons.length);
  add('barons_total', res.teams[0].barons + res.teams[1].barons);
  add('grubs_total', res.teams[0].grubs + res.teams[1].grubs);
  add('heralds_total', res.teams[0].heralds + res.teams[1].heralds);
  add('gold_total_k', (res.teams[0].gold + res.teams[1].gold) / 1000);
  const fb = res.events.find((e) => e.type === 'firstBlood');
  if (fb) add('first_blood_min', fb.t / 60);
  const ft = res.events.find((e) => e.type === 'tower');
  if (ft) add('first_tower_min', ft.t / 60);
  const fi = res.events.find((e) => e.type === 'inhib');
  if (fi) add('first_inhib_min', fi.t / 60);
  add('inhibs_total', res.events.filter((e) => e.type === 'inhib').length);
  const fbaron = res.events.find((e) => e.type === 'baron');
  if (fbaron) add('first_baron_min', fbaron.t / 60);
  add('long_game_50+', res.duration > 3000 ? 1 : 0);
  const fd = res.events.find((e) => e.type === 'dragon');
  if (fd) add('first_dragon_min', fd.t / 60);
  for (const p of res.players) {
    const m = res.duration / 60;
    add(`csm_${p.role}`, p.cs / m);
    add(`gpm_${p.role}`, p.gold / m);
    add(`dpm_${p.role}`, p.damage / m);
    add(`deaths_${p.role}`, p.d);
    add(`kills_${p.role}`, p.k);
    add(`vspm_${p.role}`, p.vision / m);
    add(`level_${p.role}`, p.level);
  }
  const upset = process.env.UPSET === '1' && (res.winner === 0) !== aBlue;
  if (upset) console.log(`---- UPSET game ${g} (A blue=${aBlue}) duration ${(res.duration / 60).toFixed(1)}`);
  if ((verbose && g === 0) || upset) {
    for (const e of res.events.filter((e) => e.type !== 'plate' && e.type !== 'info')) console.log(`${String(Math.floor(e.t / 60)).padStart(2)}:${String(Math.floor(e.t % 60)).padStart(2, '0')} ${e.text}`);
  }
}
const ms = Date.now() - t0;
const fmt = (arr: number[]) => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  return `${m.toFixed(2).padStart(8)}  (sd ${sd.toFixed(2)}, min ${Math.min(...arr).toFixed(1)}, max ${Math.max(...arr).toFixed(1)})`;
};
console.log(`${N} games in ${ms}ms (${(ms / N).toFixed(0)} ms/game). blue win ${(blueWins / N * 100).toFixed(0)}%, team A (skill ${skillA}) win ${(aWins / N * 100).toFixed(0)}% vs B (${skillB})`);
for (const [k, v] of Object.entries(agg)) console.log(k.padEnd(18), fmt(v));
