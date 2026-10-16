// Club drama over a stretch of the season: how often it hits the user's club, which kinds, follow-ups, world news;
// plus the post-game analysis reports the user's games leave behind.
//   npx tsx scripts/debug/drama.ts [teamId=t1-lck] [days=200]   (FORCE=kind starts one of that kind on day 1)
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { dramaState, resolveDrama, startDrama, DRAMA_KINDS } from '../../src/engine/management/drama';
import { analysisState, coachView, reviewWithTeam } from '../../src/engine/management/analysis';
import type { DramaKind } from '../../src/engine/management/dramaTemplates';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const teamId = process.argv[2] || 't1-lck';
const DAYS = Number(process.argv[3] ?? 200);
const s = createNewGame(db, teamId, 'Tester', 99);
s.settings = { ...s.settings, autoSave: false } as never;
const rng = new RNG(5);
if (process.env.FORCE) {
  for (const k of process.env.FORCE === 'all' ? DRAMA_KINDS : [process.env.FORCE as DramaKind]) {
    const ev = startDrama(s, rng, k);
    console.log(ev ? `forced ${k}: [${ev.from}] ${ev.subject}\n   ${ev.body}\n   options: ${ev.options.map((o) => `${o.label} (${o.hint})`).join(' | ')}` : `forced ${k}: not possible right now`);
    if (ev) { const o = rng.pick(ev.options); const r = resolveDrama(s, ev.id, o.id); console.log(`   → ${o.label}: ${r.message}\n     ${ev.outcome?.split('\n').slice(-1)[0]}`); }
  }
}
let newsDrama = 0;
for (let d = 0; d < DAYS; d++) {
  const m = processDay(s);
  if (m) { simulateSeries(s, m, rng, true); processDay(s); }
  // answer the user's drama right away with a random option (half the time: let it lapse)
  for (const ev of dramaState(s).events) if (!ev.resolved && rng.chance(0.5)) resolveDrama(s, ev.id, rng.pick(ev.options).id);
  endDay(s);
}
newsDrama = s.news.filter((n) => n.tags.includes('drama')).length;
const st = dramaState(s);
const kinds: Record<string, number> = {};
for (const e of st.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
console.log(`\n${DAYS} days as ${s.teams[teamId].name}: ${st.events.length} drama events at the club (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')})`);
console.log(`follow-ups: ${st.events.flatMap((e) => e.follow ?? []).map((f) => `${f.id}${f.done ? '' : '(pending)'}`).join(', ') || '—'}`);
console.log(`drama news items: ${newsDrama} (world: ${s.news.filter((n) => n.tags.includes('world')).length})`);
for (const e of st.events.slice(0, 4)) console.log(`\n${e.date} [${e.kind}] ${e.subject}\n  ${e.body}\n  → ${e.resolved}: ${e.outcome?.replace(/\n/g, ' / ')}`);
for (const n of s.news.filter((x) => x.tags.includes('world')).slice(0, 5)) console.log(`\nWORLD ${n.date}: ${n.headline}\n  ${n.body}`);
const posts = (s.fanPulse?.posts ?? []).filter((p) => p.topic.startsWith('drama_')).slice(0, 5);
for (const p of posts) console.log(`  post [${p.topic}/${p.persona}] ${p.text}`);
// post-game analysis
const as = analysisState(s);
console.log(`\nanalysis reports: ${as.reports.length}`);
const r = as.reports[0];
if (r) {
  const v = coachView(s, r);
  console.log(`latest: ${r.won ? 'W' : 'L'} game ${r.gameNo} (${r.comp}) · quality ${r.quality.toFixed(2)} by ${v.analyst} · ours ${v.ours.length} theirs ${v.theirs.length} missed ${v.missed}`);
  for (const x of v.reasons) console.log(`  reason: ${x}`);
  for (const x of v.notes) console.log(`  note: ${x}`);
  for (const f of v.focus) console.log(`  focus: ${s.players[f.playerId]?.handle} → ${f.attr} (${f.why})`);
  console.log(`  review: ${reviewWithTeam(s, r.id).message}`);
}
