// Early-game ganks: how often does the ganking jungler die, did the laner join, and what did the log say?
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
const N = Number(process.argv[2] ?? 30), skill = Number(process.argv[3] ?? 60), until = Number(process.argv[4] ?? 600);
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role.slice(0, 3), role, championId: champs[i], mech: skill, lane: skill, farm: skill, tf: skill, macro: skill, vision: skill, pathing: skill, obj: skill, aggression: 50, consistency: skill, clutch: skill, shotcalling: skill, mastery: 70, farsight: 55, mistakes: 45, composure: 55, snowball: 50, resilience: 50, traits: [] })) });
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let ganks = 0, on = 0, jgDied = 0, solo = 0, kills = 0, printed = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(2100 + g);
  const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const sim = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 9500 + g, debug: true });
  while (sim.winner === null && sim.t < until) sim.step();
  const L = sim.debugLog;
  for (const e of L) {
    if (e.cat !== 'task' || !e.text.startsWith('→ gank') || sim.champs[e.idx!].role !== 'jungle') continue;
    ganks++;
    const jg = sim.champs[e.idx!];
    const onE = L.find((x) => x.idx === jg.idx && x.t >= e.t && x.t < e.t + 30 && x.text.startsWith('gank ON'));
    if (!onE) continue;
    on++;
    const follow = L.some((x) => x.t >= onE.t && x.t < onE.t + 1 && x.text.includes(`follows up ${jg.input.name}`));
    if (!follow) solo++;
    const death = sim.events.find((x) => (x.type === 'kill' || x.type === 'firstBlood') && x.victim === jg.idx && x.t >= onE.t && x.t < onE.t + 15);
    const kill = sim.events.find((x) => (x.type === 'kill' || x.type === 'firstBlood') && x.killer !== undefined && sim.champs[x.killer].side === jg.side && x.t >= onE.t && x.t < onE.t + 15);
    if (kill) kills++;
    if (!kill && process.env.FAILED && printed < 4 && onE.t < 420) {
      printed++;
      const lane = e.text.match(/\((\w+)\)/)?.[1];
      const laner = sim.champs.find((c) => c.side === jg.side && c.role === (lane === 'bot' ? 'adc' : lane));
      const victim = sim.champs.find((c) => onE.text.includes(c.input.name) && c.side !== jg.side);
      console.log(`\n=== game ${g}: failed gank by ${jg.input.name} (${jg.champ.id}) on ${victim?.input.name} (${victim?.champ.id}) — "${onE.text}"`);
      for (const x of L) if (x.t >= onE.t - 1 && x.t <= onE.t + 12 && (x.idx === jg.idx || x.idx === laner?.idx || x.idx === victim?.idx)) console.log(`  ${mmss(x.t)} ${sim.champs[x.idx!].input.name} [${x.cat}] ${x.text}`);
    }
    if (death) {
      jgDied++;
      if (printed < 4) {
        printed++;
        console.log(`\n=== game ${g}: ${jg.input.name} (${jg.champ.id}, lvl?) dies ${mmss(death.t)} after "${onE.text}"`);
        const lane = e.text.match(/\((\w+)\)/)?.[1];
        const laner = sim.champs.find((c) => c.side === jg.side && c.role === (lane === 'bot' ? 'adc' : lane));
        for (const x of L) if (x.t >= e.t - 1 && x.t <= death.t + 1 && (x.idx === jg.idx || x.idx === laner?.idx || (x.idx !== null && x.text.includes(jg.input.name)))) console.log(`  ${mmss(x.t)} ${sim.champs[x.idx!]?.input.name ?? 'team'} [${x.cat}] ${x.text}`);
      }
    }
  }
}
console.log(`\n${ganks} ganks started, ${on} called ON (${solo} without a laner follow-up), ${kills} got a kill within 15s, jungler died in ${jgDied}`);
