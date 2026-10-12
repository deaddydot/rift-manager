// New career, edit a player straight away, continue: the fans must notice (regression test).
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { setMeta } from '../../src/engine/draft/draft';
import { draftFromPlayer, applyPlayerDraft } from '../../src/engine/management/custom';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json')); POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const state = createNewGame({ leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') }, 't1-lck', 'T', 4242);
const p = state.players['p:Oner'];
const d = draftFromPlayer(state, p);
for (const k of Object.keys(d.attributes) as (keyof typeof d.attributes)[]) if (k !== 'aggression') d.attributes[k] = Math.min(99, d.attributes[k] + 15);
applyPlayerDraft(state, p, d);
for (let i = 0; i < 3; i++) { processDay(state); endDay(state); }
const posts = (state.fanPulse?.posts ?? []).filter((x) => x.playerId === p.id || /Oner/.test(x.text));
console.log(`${posts.length} posts about Oner`); for (const x of posts.slice(0, 5)) console.log(`  [${x.persona}] ${x.text}`);
for (const n of state.news.filter((n) => /Oner/.test(n.headline)).slice(0, 2)) console.log('  NEWS', n.headline);
for (const m of state.inbox.filter((m) => /owner/i.test(m.from) || m.kind === 'board').slice(0, 3)) console.log('  MAIL', m.from, '·', m.subject);
