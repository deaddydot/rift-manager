// Title-history reactions demo (management/legacy.ts): play ~2 seasons headlessly and print every history-aware
// reaction that fired — fan posts (leg_* scenarios), news (tag 'legacy'), owner mail from the legacy pack, the
// live-chat categories the user's finals would get, plus the real-history facts the module starts from.
// Usage: npx tsx scripts/debug/legacy.ts [team] [until] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import type { FanPost, GameState, MatchFixture } from '../../src/engine/types';
import { fill } from '../../src/engine/management/fans';
import { resolveOwnerChoice } from '../../src/engine/management/owner';
import { offerRenewal, salaryDemand } from '../../src/engine/management/transfers';
import { honours, streakBefore, trophyDrought, playerRings, legacyChat, isFinalFixture, finalStories } from '../../src/engine/management/legacy';
import { LEG_OWNER_T, LEG_CHAT, LEG_TEMPLATES } from '../../src/engine/management/legacyTemplates';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const until = process.argv[3] ?? '2027-11-30';
const seed = Number(process.argv[4] ?? 2026);
const state = createNewGame(db, userTeam, 'Tester', seed);
const rng = new RNG(seed ^ 99);
const t0 = Date.now();

// ---- starting facts from the real history
const team = state.teams[userTeam];
const hs = honours(state, userTeam);
console.log(`\n=== ${team.name}: real honours on record (${hs.length}) ===\n  ${hs.map((h) => `${h.name}`).join(' · ') || '—'}`);
console.log(`  Worlds streak entering ${state.season}: ${streakBefore(state, userTeam, 'worlds', state.season)} · MSI streak: ${streakBefore(state, userTeam, 'msi', state.season)} · drought: ${JSON.stringify(trophyDrought(state, userTeam, state.season))}`);
for (const id of Object.values(team.lineup)) { const p = id ? state.players[id] : undefined; if (p) console.log(`  ${p.handle.padEnd(10)} Worlds ${playerRings(state, p, 'worlds').map((x) => x[0]).join(',') || '—'} · MSI ${playerRings(state, p, 'msi').map((x) => x[0]).join(',') || '—'}`); }

// ---- play
const posts = new Map<string, FanPost>();
const chats: string[] = [];
const ownerSubj = Object.values(LEG_OWNER_T).flatMap((t) => t.subj).filter((x) => x.replace(/\{\w+\}/g, '').length >= 8).map((s) => new RegExp('^' + s.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.+') + '$', 'i'));
function chatFor(s: GameState, f: MatchFixture) {
  const lc = legacyChat(s, f);
  if (!lc) return;
  const ctx = { short: s.teams[s.userTeamId].short, oppShort: s.teams[f.teamA === s.userTeamId ? f.teamB! : f.teamA!]?.short, ...lc.ctx };
  const sample = (cat: string) => { const pool = LEG_CHAT[cat] ?? []; for (const l of pool) { const t = fill(l, ctx); if (t) return t; } return '(no line)'; };
  const comp = s.competitions[f.competitionId];
  chats.push(`${s.date} ${comp?.name} ${f.label ?? ''} vs ${ctx.oppShort}${isFinalFixture(s, f) ? ' [FINAL]' : ''}\n     start: ${lc.start.map((c) => `${c} → “${sample(c)}”`).join(' | ') || '—'}\n     win: ${lc.win} → “${sample(lc.win)}” · loss: ${lc.loss} → “${sample(lc.loss)}”`);
  if (isFinalFixture(s, f)) chats.push(`     stories: ${finalStories(s, f, s.userTeamId).map((x) => `${x.key}(${x.w.toFixed(1)}: ${x.ctx.hook})`).join(', ')}`);
}
while (state.date < until) {
  const m = processDay(state);
  if (m) { chatFor(state, m); simulateSeries(state, m, rng, false); processDay(state); }
  if (state.date.slice(5) === '11-10') { const t = state.teams[userTeam]; for (const id of t.roster) { const p = state.players[id]; if (p.contract && p.contract.expires <= `${state.date.slice(0, 4)}-11-18`) offerRenewal(state, id, Math.round(salaryDemand(state, p, t) * 1.1), 2); } }
  for (const r of state.owner?.requests ?? []) if (!r.resolved && r.kind === 'leg_parade' && r.date === state.date) { const o = rng.pick(r.options); console.log(`  [owner request ${r.kind} ${state.date}] → ${o.label}: ${resolveOwnerChoice(state, r.id, o.id).message}`); }
  for (const p of state.fanPulse?.posts ?? []) if (p.topic.startsWith('leg_')) posts.set(p.id, p);
  endDay(state);
}
console.log(`\nsimulated to ${state.date} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---- report
const champs = Object.values(state.competitions).filter((c) => c.status === 'done' && (c.tags?.some((t) => ['worlds', 'msi', 'fst'].includes(t)))).sort((a, b) => a.endDate.localeCompare(b.endDate));
console.log(`\n=== international winners ===\n${champs.map((c) => `  ${c.name.padEnd(34)} ${state.teams[c.winner ?? '']?.short ?? '-'}${c.placements ? ` (RU ${state.teams[Object.entries(c.placements).find(([, p]) => p === 2)?.[0] ?? '']?.short ?? '-'})` : ''}`).join('\n')}`);
console.log(`  ${team.short} titles: ${team.titles.map((t) => t.competition).join(', ') || '—'}`);
console.log(`  manager trophies: ${(state.legacy?.mgr ?? []).map((m) => m.comp).join(', ') || '—'}`);
console.log(`  finals recorded in-save: ${state.legacy?.finals.length ?? 0}`);

const byDate = [...posts.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.mins ?? 0) - (b.mins ?? 0));
console.log(`\n=== ${byDate.length} history-aware fan posts ===`);
for (const p of byDate) console.log(`  ${p.date} [${p.topic}] @${p.user} (${p.persona}${p.teamId !== userTeam ? ', ' + state.teams[p.teamId]?.short : ''}) ${p.text}`);
const byTopic: Record<string, number> = {};
for (const p of byDate) byTopic[p.topic] = (byTopic[p.topic] ?? 0) + 1;
console.log(`\n  by scenario: ${Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')}`);

const news = state.news.filter((n) => n.tags.includes('legacy')).reverse();
console.log(`\n=== ${news.length} legacy news items ===\n${news.map((n) => `  ${n.date} ${n.headline}\n     ${n.body}`).join('\n')}`);
const mail = state.inbox.filter((m) => m.from.includes('(Owner)') && ownerSubj.some((rx) => rx.test(m.subject))).reverse();
console.log(`\n=== ${mail.length} owner mails from the legacy pack ===\n${mail.map((m) => `  ${m.date} | ${m.subject}\n${m.body.split('\n').filter(Boolean).map((l) => '       ' + l).join('\n')}`).join('\n')}`);
console.log(`\n=== live-chat setups for the user's big series (${chats.length}) ===\n${chats.map((c) => '  ' + c).join('\n')}`);

const scen = Object.keys(LEG_TEMPLATES).length, lines = Object.values(LEG_TEMPLATES).reduce((s, t) => s + Object.values(t).reduce((a, l) => a + (l?.length ?? 0), 0), 0);
console.log(`\ncontent: ${scen} fan scenarios / ${lines} post lines · ${Object.keys(LEG_OWNER_T).length} owner mails · ${Object.keys(LEG_CHAT).length} chat categories (${Object.values(LEG_CHAT).reduce((s, l) => s + l.length, 0)} lines) · scenarios used this run: ${Object.keys(byTopic).length}`);
