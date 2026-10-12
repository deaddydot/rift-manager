// Champion comfort on the 0..200 scale: how real pools convert (stars vs tier-3 players), and growth.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { createNewGame, overall } from '../../src/engine/setup';
import { masteryTier, masteryGain } from '../../src/engine/mastery';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const state = createNewGame({ leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') }, 't1-lck', 'T', 4242);
const show = (id: string) => {
  const p = state.players[id]; if (!p) return;
  const top = Object.entries(p.champions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => `${gd().championById[c]?.name ?? c} ${v} (${masteryTier(v).label})`).join(', ');
  console.log(`${p.handle.padEnd(10)} ovr ${Math.round(overall(p.attributes, p.role))}: ${top}`);
};
for (const id of ['p:Faker', 'p:Chovy', 'p:Keria', 'p:Ruler', 'p:Caps', 'p:Doggo', 'p:Kiaya']) show(id);
const lowTier = Object.values(state.players).filter((p) => p.teamId && state.leagues[state.teams[p.teamId].leagueId]?.tier === 3).slice(0, 3);
for (const p of lowTier) show(p.id);
const tiers: Record<string, number> = {};
for (const p of Object.values(state.players)) for (const v of Object.values(p.champions)) tiers[masteryTier(v).label] = (tiers[masteryTier(v).label] ?? 0) + 1;
console.log('all pool entries by tier:', JSON.stringify(tiers));
let v = 110; const steps = [v]; for (let g = 1; g <= 60; g++) { v = masteryGain(v, g % 2 === 0); if (g % 10 === 0) steps.push(Math.round(v)); }
console.log('comfort from 110 over 60 pro games (every 10):', steps.join(' → '));
