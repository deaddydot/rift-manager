// Who wins Player of the Game, by role (full simulations, then a season of quick sims)
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { MatchSim } from '../../src/engine/sim/engine';
import type { SimTeamInput } from '../../src/engine/sim/simtypes';
import type { Role } from '../../src/engine/types';
import { RNG } from '../../src/util/rng';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const mk = (id: string, champs: string[]): SimTeamInput => ({ teamId: id, name: id, short: id, color: '#fff', chemistry: 60,
  tactics: { aggression: 50, earlyFocus: 'balanced', objectivePriority: 'balanced', laneSwap: 'never', playstyle: 'balanced', invadeLevel1: false, visionFocus: 50 },
  players: ROLES.map((role, i) => ({ playerId: id + role, name: id + role, role, championId: champs[i], mech: 70, lane: 70, farm: 70, tf: 70, macro: 70, vision: 70, pathing: 70, obj: 70, aggression: 50, consistency: 70, clutch: 70, shotcalling: 70, mastery: 140, farsight: 65, mistakes: 35, composure: 60, snowball: 50, resilience: 50, traits: [] })) });
const pct = (c: Record<string, number>) => { const n = Object.values(c).reduce((a, b) => a + b, 0); return ROLES.map((r) => `${r} ${((c[r] ?? 0) / n * 100).toFixed(0)}%`).join(', '); };
const full: Record<string, number> = {};
for (let g = 0; g < Number(process.argv[2] ?? 80); g++) {
  const rng = new RNG(4100 + g); const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const r = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 7700 + g }).runToEnd();
  const role = r.players[r.mvp].role; full[role] = (full[role] ?? 0) + 1;
}
console.log('full sim MVPs: ', pct(full));
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const state = createNewGame(db, 't1-lck', 'Tester', 1);
const rng = new RNG(5);
while (state.date < '2026-04-01') { const m = processDay(state); if (m) { simulateSeries(state, m, rng, false); processDay(state); } endDay(state); }
const quick: Record<string, number> = {};
for (const f of Object.values(state.fixtures)) for (const g of f.result?.games ?? []) { const p = g.mvp ? state.players[g.mvp] : null; if (p) quick[p.role] = (quick[p.role] ?? 0) + 1; }
console.log('quick sim MVPs:', pct(quick));
console.log('pro reference (LCK POG ~): top ~17%, jungle ~22%, mid ~25%, adc ~23%, support ~13%');
// per-role averages (to calibrate the MVP norms against the sim's own numbers)
const avg: Record<string, { k: number; a: number; share: number; n: number }> = {};
for (let g = 0; g < 60; g++) {
  const rng2 = new RNG(4300 + g); const used = new Set<string>();
  const pick = () => ROLES.map((r) => { const c = rng2.pick(gd().championsByRole[r].filter((x) => !used.has(x.id))); used.add(c.id); return c.id; });
  const r = new MatchSim(mk('A', pick()), mk('B', pick()), { seed: 7900 + g }).runToEnd();
  for (const side of [0, 1]) { const ps = r.players.filter((p) => p.side === side); const td = ps.reduce((s, p) => s + p.damage, 0) || 1; for (const p of ps) { const a = (avg['full ' + p.role] ??= { k: 0, a: 0, share: 0, n: 0 }); a.k += p.k; a.a += p.a; a.share += p.damage / td; a.n++; } }
}
for (const f of Object.values(state.fixtures)) for (const g of f.result?.games ?? []) for (const tid of [g.blue, g.red]) { const ps = (g.players ?? []).filter((p) => p.teamId === tid); const td = ps.reduce((s, p) => s + p.damage, 0) || 1; for (const p of ps) { const a = (avg['quick ' + p.role] ??= { k: 0, a: 0, share: 0, n: 0 }); a.k += p.k; a.a += p.a; a.share += p.damage / td; a.n++; } }
for (const [k, v] of Object.entries(avg).sort()) console.log(k.padEnd(14), `k ${(v.k / v.n).toFixed(2)} a ${(v.a / v.n).toFixed(2)} dmg% ${(v.share / v.n * 100).toFixed(1)}`);
