// Fan buzz ("self-aware" reactions) demo: simulate to mid-season, then
//  1) edit a starter in the Editor (+15 on every attribute) — the fans/news/owner notice it was tampered with,
//  2) bump another starter's attributes silently (no Editor) — an unexplained overnight jump,
//  3) rename the club through the team editor,
// then play on and report the posts, news, owner mail, coincidence (possessed / slump) runs and perceptions.
// Usage: npx tsx scripts/debug/buzz.ts [team] [until] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { ATTRIBUTE_KEYS, ROLES, type FanPost, type GameState } from '../../src/engine/types';
import { draftFromPlayer, applyPlayerDraft, draftFromTeam, applyTeamDraft } from '../../src/engine/management/custom';
import { resolveOwnerChoice } from '../../src/engine/management/owner';
import { perception, liveFlags, playerPosts } from '../../src/engine/management/buzzCore';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const until = process.argv[3] ?? '2026-11-20';
const seed = Number(process.argv[4] ?? 4242);
const state = createNewGame(db, userTeam, 'Tester', seed);
const rng = new RNG(seed ^ 7);
const allPosts = new Map<string, FanPost>();
const answered: string[] = [];

function day(s: GameState) {
  const m = processDay(s);
  if (m) { simulateSeries(s, m, rng, false); processDay(s); }
  for (const r of s.owner?.requests ?? []) if (!r.resolved && r.date === s.date) { const o = rng.pick(r.options); answered.push(`${s.date} [${r.kind}] → ${o.label}: ${resolveOwnerChoice(s, r.id, o.id).message}`); }
  for (const p of s.fanPulse?.posts ?? []) allPosts.set(p.id, p);
  endDay(s);
}
const show = (p: FanPost) => `  [${p.topic}] @${p.user} (${p.persona}, ${state.teams[p.teamId]?.short}) ${p.text}`;
const since = (d: string) => [...allPosts.values()].filter((p) => p.date >= d).sort((a, b) => a.date.localeCompare(b.date) || (a.mins ?? 0) - (b.mins ?? 0));

while (state.date < '2026-04-14') day(state);
const team = state.teams[userTeam];
const starters = ROLES.map((r) => state.players[team.lineup[r]!]).filter(Boolean);
const [edited, silent] = [starters[1], starters[3]];
const t0 = state.date;
console.log(`\n=== ${t0}: editing ${edited.handle} (+15 all attributes, via the Editor), silently bumping ${silent.handle} (+9), renaming the club ===`);
const before = [overall(edited.attributes, edited.role), overall(silent.attributes, silent.role)];
const d = draftFromPlayer(state, edited);
for (const k of ATTRIBUTE_KEYS) d.attributes[k] = Math.min(99, d.attributes[k] + 15);
applyPlayerDraft(state, edited, d);
for (const k of ATTRIBUTE_KEYS) silent.attributes[k] = Math.min(99, silent.attributes[k] + 9);
const td = draftFromTeam(state, team);
const oldName = team.name;
td.name = `${team.short} Quantum Dragons`;
applyTeamDraft(state, team, td);
console.log(`${edited.handle}: ${before[0]} → ${overall(edited.attributes, edited.role)} · ${silent.handle}: ${before[1]} → ${overall(silent.attributes, silent.role)} · ${oldName} → ${team.name}`);
for (let i = 0; i < 12; i++) day(state);
const anomalyTopics = /^(anomaly_|team_renamed|rival_anomaly|superteam|money_glitch)/;
console.log(`\n--- anomaly posts in the 12 days after the edits ---\n${since(t0).filter((p) => anomalyTopics.test(p.topic)).map(show).join('\n')}`);
console.log(`\n--- news ---\n${state.news.filter((n) => n.date >= t0 && n.tags.includes('buzz')).map((n) => `  ${n.date} ${n.headline}\n     ${n.body}`).join('\n')}`);
const ownerMail = state.inbox.filter((m) => m.from.includes('(Owner)') && m.date >= t0);
console.log(`\n--- owner mail ---\n${ownerMail.reverse().map((m) => `  ${m.date} | ${m.subject}${m.action ? ' [choice]' : ''}\n${m.body.split('\n').map((l) => '     ' + l).join('\n')}`).join('\n')}`);
console.log(`\n--- perception / live flags ---`);
for (const p of [edited, silent]) console.log(`  ${p.handle}: ${JSON.stringify(perception(state, p.id))} flag=${JSON.stringify(liveFlags(state)[p.id])} posts=${playerPosts(state, p.id).length}`);

// play on: coincidence runs (possessed / slump), follow-ups, club life
while (state.date < until) day(state);
const bz = state.fanPulse!.buzz!;
console.log(`\n=== season done (${state.date}) — buzz events ===`);
for (const e of [...bz.events].reverse()) console.log(`  ${e.date} ${e.kind}${e.edited ? ' (edited)' : ''} ${e.playerId ? state.players[e.playerId]?.handle : state.teams[e.teamId ?? '']?.short ?? ''} ${JSON.stringify(e.data ?? {})}`);
for (const k of ['possessed', 'slump', 'heater_over', 'slump_over', 'anomaly_confirmed', 'anomaly_doubt', 'anomaly_conspiracy', 'glow_up', 'too_good', 'lore_win_t1', 'lore_eve_t1', 'lore_nexus']) {
  const ps = [...allPosts.values()].filter((p) => p.topic === k);
  if (ps.length) console.log(`\n[${k}] ×${ps.length}\n${ps.slice(0, 3).map(show).join('\n')}`);
}
const byTopic: Record<string, number> = {};
for (const p of allPosts.values()) byTopic[p.topic] = (byTopic[p.topic] ?? 0) + 1;
console.log(`\n=== ${allPosts.size} posts, ${Object.keys(byTopic).length} scenarios used ===\n${Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log(`\n=== perceptions (${team.short}) ===\n${team.roster.map((id) => `  ${state.players[id].handle}: ${perception(state, id).label}`).join('\n')}`);
console.log(`\n=== owner requests answered ===\n${answered.join('\n')}`);
console.log(`\nbuzz state ${(JSON.stringify(bz).length / 1024).toFixed(1)} KB (archive ${bz.archive.length}, events ${bz.events.length}, tracked ${Object.keys(bz.ovr).length}); fanPulse ${(JSON.stringify(state.fanPulse).length / 1024).toFixed(1)} KB`);
