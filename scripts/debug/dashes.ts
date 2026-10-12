// Dash usage check: how often champions dash and why (engage / chase / kite / escape / peel), how far, whether
// anyone ends up inside terrain, and the effect on games. Injects a few defs if the data table is still empty.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import { DASHES } from '../../src/data/dashData';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const injected = !Object.keys(DASHES).length;
if (injected) Object.assign(DASHES, {
  LeeSin: [{ slot: 'Q', name: 'Resonating Strike', kind: 'dash', range: 1200, speed: 1350, target: 'enemy', use: ['engage', 'chase', 'gapclose'], stopsAtTarget: true }, { slot: 'W', name: 'Safeguard', kind: 'dash', range: 700, speed: 1350, target: 'ally', use: ['escape', 'reposition'] }],
  Vayne: [{ slot: 'Q', name: 'Tumble', kind: 'dash', range: 300, speed: 900, target: 'point', use: ['reposition', 'escape'] }],
  Ezreal: [{ slot: 'E', name: 'Arcane Shift', kind: 'blink', range: 475, target: 'point', use: ['escape', 'reposition', 'chase'] }],
  Ahri: [{ slot: 'R', name: 'Spirit Rush', kind: 'dash', range: 500, speed: 1200, target: 'point', use: ['engage', 'escape', 'chase'], charges: 3, recastWindow: 15 }],
  Leona: [{ slot: 'E', name: 'Zenith Blade', kind: 'dash', range: 900, speed: 1600, target: 'enemy', use: ['engage', 'gapclose'], stopsAtTarget: true }],
  Braum: [{ slot: 'W', name: 'Stand Behind Me', kind: 'dash', range: 650, speed: 1500, target: 'ally', use: ['reposition', 'escape'] }],
  Tristana: [{ slot: 'W', name: 'Rocket Jump', kind: 'leap', range: 900, speed: 1100, target: 'point', use: ['escape', 'engage', 'chase'], resetOnKill: true }],
});
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const N = Number(process.argv[2] ?? 30);
const mk = (id: string, champs: string[], s: number): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: s, lane: s, farm: s, tf: s, macro: s, vision: s, pathing: s, obj: s, aggression: 50, consistency: s, clutch: s, shotcalling: s, mastery: 140, farsight: s - 5, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const why: Record<string, number> = {}, byChamp: Record<string, number> = {};
let inWall = 0, dist = 0, n = 0, mins = 0, kills = 0, interrupted = 0;
const injectedIds = Object.keys(DASHES);
for (let g = 0; g < N; g++) {
  const rng = new RNG(6100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => {
    const pool = gd().championsByRole[r].filter((x) => !used.has(x.id));
    const prefer = injected ? pool.filter((x) => injectedIds.includes(x.id)) : [];
    const c = prefer.length && rng.chance(0.7) ? rng.pick(prefer) : rng.pick(pool); used.add(c.id); return c.id;
  });
  const sim = new MatchSim(mk('A', pick(), 70), mk('B', pick(), 70), { seed: 16100 + g, debug: true });
  let wasDashing = new Array(10).fill(false);
  while (sim.winner === null) {
    sim.step();
    for (const c of sim.champs) {
      const now = !!c.dashing;
      if (wasDashing[c.idx] && !now && !c.dead && !gd().nav.walkable(c.pos)) inWall++;
      wasDashing[c.idx] = now;
    }
  }
  for (const e of sim.debugLog) {
    const m = /^(.+?): (onto|closing on|kiting|chasing|escaping|to protect)\b.*\((\d+) units/.exec(e.text);
    if (!m || e.cat !== 'fight') continue;
    const k = m[2] === 'closing on' ? 'onto' : m[2];
    why[k] = (why[k] ?? 0) + 1; n++; dist += Number(m[3]);
    const ch = sim.champs[e.idx!].champ.name; byChamp[ch] = (byChamp[ch] ?? 0) + 1;
  }
  mins += sim.t / 60; kills += sim.teams[0].kills + sim.teams[1].kills;
}
console.log(`${N} games${injected ? ' (test defs injected — real table not written yet)' : ''}: ${(n / N).toFixed(1)} dashes/game, avg ${(dist / Math.max(1, n)).toFixed(0)} units; by purpose:`, JSON.stringify(why));
console.log('most dashes by champion (total):', Object.entries(byChamp).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`ended a dash inside terrain: ${inWall}; avg ${(mins / N).toFixed(1)} min, ${(kills / N).toFixed(1)} kills`);
void interrupted;
