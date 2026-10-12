// Fan Pulse & owner smoke test: simulate a season, answer owner requests at random, and print
// samples of fan posts per scenario and owner mail. Usage: npx tsx scripts/debug/fans.ts [team] [until] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { resolveOwnerChoice } from '../../src/engine/management/owner';
import type { FanPost } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const until = process.argv[3] ?? '2026-12-05';
const seed = Number(process.argv[4] ?? 12345);
const state = createNewGame(db, userTeam, 'Tester', seed);
const rng = new RNG(seed ^ 99);
const allPosts = new Map<string, FanPost>();
const answered: string[] = [];
while (state.date < until) {
  const m = processDay(state);
  if (m) { simulateSeries(state, m, rng, false); processDay(state); }
  for (const r of state.owner?.requests ?? []) {
    if (r.resolved || rng.chance(0.25)) continue; // sometimes let requests expire
    const opt = rng.pick(r.options);
    const res = resolveOwnerChoice(state, r.id, opt.id);
    answered.push(`${state.date} [${r.kind}] → ${opt.label}: ${res.message}`);
  }
  for (const p of state.fanPulse?.posts ?? []) allPosts.set(p.id, p);
  endDay(state);
}
for (const p of state.fanPulse?.posts ?? []) allPosts.set(p.id, p);
const posts = [...allPosts.values()];
const byTopic: Record<string, FanPost[]> = {};
for (const p of posts) (byTopic[p.topic] ??= []).push(p);
console.log(`\n=== ${posts.length} fan posts generated (${state.fanPulse?.posts.length} kept), ${Object.keys(byTopic).length} scenarios ===`);
console.log(Object.entries(byTopic).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k}:${v.length}`).join('  '));
const pick = (arr: FanPost[]) => arr[Math.floor(rng.next() * arr.length)];
console.log('\n=== sample posts ===');
for (const [k, v] of Object.entries(byTopic)) {
  const p = pick(v);
  const team = state.teams[p.teamId]?.short;
  console.log(`[${k}] ${p.date} @${p.user} (${p.persona}, ${team}, ${p.sentiment >= 0 ? '+' : ''}${p.sentiment}, ♥${p.likes}) ${p.text}${p.replies?.length ? `\n     ↳ @${p.replies[0].user} (${p.replies[0].persona}): ${p.replies[0].text}` : ''}`);
}
const fm = state.fanPulse!.teams[userTeam];
console.log('\n=== fan mood ===', { mood: Math.round(fm.mood), patience: Math.round(fm.patience), expectation: fm.expectation, streak: fm.streak, form: fm.form, preRank: fm.preRank, attendance: fm.attendance, trend: fm.trend?.join(',') });
const o = state.owner!;
const ownerMail = state.inbox.filter((m) => m.from.includes('(Owner)'));
console.log(`\n=== owner: ${o.name}, ${o.title} — ${o.background}; traits ${o.traits.join(', ')}; mood ${Math.round(o.mood)}; record ${o.record.w}-${o.record.l}; ultimatum ${o.ultimatum}; board confidence ${Math.round(state.board.confidence)} ===`);
console.log(`owner messages in inbox: ${ownerMail.length} (of ${state.inbox.length} total); requests ${o.requests.length}; promises ${o.promises.map((p) => `${p.text} [${p.status}]`).join(' | ')}`);
console.log('\n=== owner mail (oldest first) ===');
for (const m of [...ownerMail].reverse()) console.log(`--- ${m.date} | ${m.subject}${m.action ? ' [choice]' : ''}\n${m.body}\n`);
console.log('=== answered requests ===\n' + answered.join('\n'));
const ledger = state.teams[userTeam].ledger.filter((e) => /Owner|Ticketing|Media|Content creators|Digital|Cost savings/.test(e.category));
const sums: Record<string, number> = {};
for (const e of ledger) sums[e.category] = (sums[e.category] ?? 0) + e.amount;
console.log('\n=== ledger from fans/owner ===', sums);
console.log('fanPulse JSON size', (JSON.stringify(state.fanPulse).length / 1024).toFixed(1), 'KB; owner JSON size', (JSON.stringify(state.owner).length / 1024).toFixed(1), 'KB');
