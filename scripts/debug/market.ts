// Headless season run that reports sponsor-offer pacing and the generated free-agent market per transfer window.
// usage: npx tsx scripts/debug/market.ts [teamId] [until] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, ageOn, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { windowKey } from '../../src/engine/management/transfers';
import { regionOfCountry } from '../../src/engine/management/transfers';
import type { GameState, Player } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const until = process.argv[3] ?? '2026-12-05';
const state = createNewGame(db, userTeam, 'Tester', Number(process.argv[4] ?? 12345));
const rng = new RNG(99);

const offers = new Map<string, string>(); // offer id -> "date brand $/mo"
const gen = (s: GameState) => Object.values(s.players).filter((p) => p.generated);
const ovr = (p: Player) => overall(p.attributes, p.role);
let lastKey: string | null = null;
function windowReport(key: string) {
  const ps = gen(state).filter((p) => windowKey(p.generated!) === key);
  const byRegion: Record<string, number> = {}, byType: Record<string, number> = {};
  for (const p of ps) { const r = regionOfCountry(p.country) ?? '?'; byRegion[r] = (byRegion[r] ?? 0) + 1; byType[p.playstyle[1]] = (byType[p.playstyle[1]] ?? 0) + 1; }
  console.log(`\n[${state.date}] window ${key}: ${ps.length} generated free agents (total generated alive ${gen(state).length})`);
  console.log('  by home region', byRegion, ' by background', byType);
  for (const p of ps.filter((_, i) => i % 9 === 0).slice(0, 10)) {
    console.log(`  ${p.handle.padEnd(13)} ${p.name.padEnd(26)} ${p.country.padEnd(15)} ${p.role.padEnd(7)} age ${Math.floor(ageOn(p.birthdate, state.date) ?? 0)} ovr ${ovr(p)} pot ${p.hidden.potential} ${p.playstyle[1].padEnd(17)} traits=${p.traits.join(',') || '-'} champs=${Object.keys(p.champions).slice(0, 4).join('/')}`);
  }
}
function signedReport(key: string) {
  const ps = gen(state).filter((p) => windowKey(p.generated!) === key);
  const signed = ps.filter((p) => p.teamId);
  console.log(`  [${state.date}] window ${key} closing: ${signed.length}/${ps.length} signed by AI teams, e.g. ${signed.slice(0, 5).map((p) => `${p.handle}(${ovr(p)})→${state.teams[p.teamId!]?.short}`).join(', ')}`);
}

while (state.date < until) {
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, false); processDay(state); }
  const before = windowKey(state.date);
  endDay(state);
  for (const o of state.sponsorOffers) if (!offers.has(o.id)) offers.set(o.id, `${state.date} ${o.name} (${o.category}, T${o.tier}) $${Math.round(o.monthly / 1000)}k/mo x${o.months}`);
  const key = windowKey(state.date);
  if (before && !key) signedReport(before);
  if (key && key !== lastKey) { windowReport(key); lastKey = key; }
}
const t = state.teams[userTeam];
console.log(`\nsponsor offers received by ${t.name}: ${offers.size} (from ${'2026-01-02'} to ${state.date})`);
for (const s of offers.values()) console.log('  ' + s);
console.log('active sponsors at end', t.sponsors.filter((s) => s.endDate >= state.date).map((s) => s.name).join(', '));
console.log('generated players alive', gen(state).length, '(signed', gen(state).filter((p) => p.teamId).length + ')', 'save players', Object.keys(state.players).length);
