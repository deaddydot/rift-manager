// Scrims, creator videos and the club channel, headless.
//   npx tsx scripts/debug/content.ts [teamId] [days] — env MODE=active|idle (club channel: post ~3 videos a week, or none),
//   SCRIMS=1 (book scrims with the best club likely to say yes, ~3 blocks a week)
// Reports scrim invitations (asked / accepted by partner tier), weekly practice quality, creator videos (count, kinds,
// tone, views), the channel (subs, momentum, community, uploads, quality) and the club's fans / die-hards at the end.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { scrimState, scrimCandidates, scrimOdds, sendScrimInvite, answerScrimInvite, bookableDays, scrimWeek, powerOf } from '../../src/engine/management/scrims';
import { contentState } from '../../src/engine/management/content';
import { FORMAT_IDS, FORMATS, channelOf, estimate, produce, onCamera, capacity, crewPool, hireCrew } from '../../src/engine/management/orgContent';
import { loyalty } from '../../src/engine/management/fanbase';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const teamId = process.argv[2] || 't1-lck';
const days = Number(process.argv[3] ?? 120);
const mode = process.env.MODE ?? 'active';
const s = createNewGame(db, teamId, 'Tester', 4242);
s.settings = { ...s.settings, autoSave: false } as never;
const user = s.teams[teamId];
console.log(`user ${user.name} (${user.leagueId}, tier ${s.leagues[user.leagueId]?.tier}) fans ${user.fans} studio ${user.facilities.contentStudio} lineup ${powerOf(s, user).toFixed(1)} mode ${mode} scrims ${process.env.SCRIMS === '1'}`);
const rng = new RNG(7);
const asked: Record<number, [number, number]> = {};
const weekQ: number[] = [];
if (mode === 'active') {
  contentState(s);
  for (const c of crewPool(s).filter((x) => x.role === 'host').slice(0, 1)) console.log('  hire', hireCrew(s, c.id).message);
  for (const c of crewPool(s).filter((x) => x.role === 'editor').slice(0, 1)) console.log('  hire', hireCrew(s, c.id).message);
}
let made = 0;
for (let d = 0; d < days; d++) {
  const m = processDay(s);
  if (m) { simulateSeries(s, m, rng, false); processDay(s); }
  // scrims: keep ~3 blocks a week with the strongest club that'll probably say yes
  if (process.env.SCRIMS === '1') {
    const sc = scrimState(s);
    for (const b of sc.blocks) if (b.dir === 'in' && b.status === 'pending') answerScrimInvite(s, b.id, true);
    const open = sc.blocks.filter((b) => (b.status === 'pending' || b.status === 'accepted') && b.date > s.date).length;
    if (open < 3) {
      const day = bookableDays(s).find((x) => !x.match && !x.booked);
      const cand = scrimCandidates(s).map((t) => ({ t, o: scrimOdds(s, t.id, day?.date) })).filter((x) => x.o.p >= 0.35).sort((a, b) => powerOf(s, b.t) - powerOf(s, a.t))[0];
      if (day && cand) {
        const r = sendScrimInvite(s, cand.t.id, day.date);
        if (r.ok) { const tier = s.leagues[cand.t.leagueId]?.tier ?? 3; asked[tier] ??= [0, 0]; asked[tier][0]++; }
      }
    }
  }
  // the club channel: a video every ~2–3 days with the best cast for a rotating format
  if (mode === 'active' && d % 2 === 0) {
    const ch = channelOf(s);
    if (ch.queue.length < capacity(user)) {
      const f = FORMAT_IDS.filter((x) => !FORMATS[x].collab)[made % 9];
      const def = FORMATS[f];
      const cast = user.roster.map((id) => s.players[id]).filter(Boolean).sort((a, b) => onCamera(b, f).v - onCamera(a, f).v).slice(0, Math.max(def.min, Math.min(def.max, 3))).map((p) => p.id);
      const est = estimate(s, f, cast, true, 1);
      const r = produce(s, f, cast, true, 1);
      if (r.ok) { made++; if (made <= 6) console.log(`  ${s.date} ${def.label.padEnd(22)} expected ${est.quality} (cast ${est.cast} host ${est.host ?? '-'} prod ${est.prod}) cost ${est.cost}`); }
    }
  }
  endDay(s);
  if (s.date.endsWith('-01') || d === days - 1) {
    const ch = channelOf(s);
    const wk = scrimWeek(s);
    weekQ.push(wk.q);
    const l = loyalty(s, user);
    console.log(`${s.date} fans ${user.fans.toLocaleString().padStart(10)} diehard ${String(user.diehard).padStart(9)} hype ${user.hype.toFixed(0).padStart(3)} | channel subs ${ch.subs.toLocaleString().padStart(9)} mom ${ch.momentum.toFixed(0).padStart(3)} comm ${ch.community.toFixed(0).padStart(3)} uploads ${ch.uploads.length} | loyalty ${l.total.toFixed(3)} (community ${l.community.toFixed(3)}) | videos about us ${contentState(s).videos.length} | scrim q ${wk.q.toFixed(2)} (${wk.blocks})`);
  }
}
const cs = contentState(s);
const sc = scrimState(s);
const by = (k: string) => sc.blocks.filter((b) => b.status === k).length;
console.log(`\nscrims: played ${by('played')} declined ${by('declined')} cancelled ${by('cancelled')} expired ${by('expired')} accepted-open ${by('accepted')} pending ${by('pending')}; incoming invites ${sc.blocks.filter((b) => b.dir === 'in').length}`);
for (const [t, [n]] of Object.entries(asked)) {
  const out = sc.blocks.filter((b) => b.dir === 'out' && (s.leagues[s.teams[b.teamId]?.leagueId]?.tier ?? 3) === Number(t));
  console.log(`  asked tier-${t} clubs ${n}: yes ${out.filter((b) => b.status === 'accepted' || b.status === 'played').length}, no ${out.filter((b) => b.status === 'declined').length} (${[...new Set(out.filter((b) => b.why).map((b) => b.why))].join(', ')})`);
}
for (const b of sc.blocks.filter((b) => b.status === 'played').slice(0, 4)) console.log(`  ${b.date} vs ${s.teams[b.teamId]?.short} ${b.result!.w}-${b.result!.l} q ${b.result!.q} — ${b.result!.note}`);
for (const b of sc.blocks.filter((b) => b.reply).slice(0, 4)) console.log(`  reply ${s.teams[b.teamId]?.short} [${b.why}]: ${b.reply}`);
const kinds: Record<string, number> = {};
for (const v of cs.videos) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
console.log(`\ncreator videos: ${cs.videos.length} (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}), tone +${cs.videos.filter((v) => v.tone > 0).length} / -${cs.videos.filter((v) => v.tone < 0).length}, median views ${[...cs.videos].sort((a, b) => a.views - b.views)[Math.floor(cs.videos.length / 2)]?.views ?? 0}`);
for (const v of cs.videos.slice(0, 5)) {
  const c = cs.creators.find((x) => x.id === v.creatorId);
  console.log(`  ${v.date} [${v.kind}/${v.tone}] ${c?.channel} (${c?.subs}): "${v.title}" — ${v.views} views, ${v.scenes.length} scenes`);
  for (const sc2 of v.scenes) console.log(`      ${sc2.k.padEnd(6)} ${sc2.cap}`);
  console.log(`      comments: ${v.comments.slice(0, 2).map((c2) => `@${c2.user}: ${c2.text}`).join(' | ')}`);
}
const ch = channelOf(s);
console.log(`\nchannel: ${ch.uploads.length} uploads, avg quality ${(ch.uploads.reduce((a, u) => a + u.quality, 0) / Math.max(1, ch.uploads.length)).toFixed(1)}, viral ${ch.uploads.filter((u) => u.viral).length}, flops ${ch.uploads.filter((u) => u.flop).length}, controversies ${ch.uploads.filter((u) => u.controversy).length}`);
for (const u of ch.uploads.slice(0, 5)) console.log(`  ${u.date} ${u.format.padEnd(10)} q${u.quality} ${u.views} views +${u.subs} subs +${u.fans} fans $${u.revenue} "${u.title}" — ${u.highlight}`);
const spent = user.ledger.filter((e) => e.category === 'Content production' || e.category === 'Content crew').reduce((a, e) => a + e.amount, 0);
const earned = user.ledger.filter((e) => e.category === 'Club channel').reduce((a, e) => a + e.amount, 0);
console.log(`money: content spend ${Math.round(spent)} · channel ads ${Math.round(earned)}`);
