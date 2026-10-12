// Locker-room smoke test: simulate a season for the user's team, answer player approaches (randomly,
// sometimes letting them expire), use manager talks / meetings / team building like a player would,
// and print: approach kinds & counts, sample conversations, pair relationships, their effect on
// effective ratings, and how different personalities react to the same talk.
// Usage: npx tsx scripts/debug/people.ts [team] [until] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { effective } from '../../src/engine/season/prep';
import { RNG } from '../../src/util/rng';
import { offerRenewal, salaryDemand } from '../../src/engine/management/transfers';
import {
  people, talkTo, talkCheck, resolvePlayerChoice, pairView, peopleParts, approachStats, approachTitle, teamMeeting, teamBuilding, meetingCheck, activityCheck,
  trustLabel, moodOf, TALK_ACTIONS, type TalkAction,
} from '../../src/engine/management/people';
import { TALK_LINES } from '../../src/engine/management/peopleTemplates';
import type { GameState, PlayerRequest, Role } from '../../src/engine/types';
import { ROLES } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 'krx-lck';
const until = process.argv[3] ?? '2026-11-30';
const seed = Number(process.argv[4] ?? 12345);
const PASSIVE = process.env.PASSIVE === '1'; // never talk to players, let every approach expire
const t0 = Date.now();
const state = createNewGame(db, userTeam, 'Tester', seed);
const team = state.teams[userTeam];
const rng = new RNG(seed ^ 77);
const H = (id: string) => state.players[id]?.handle ?? id;

const seen = new Map<string, PlayerRequest>();
const convo: { date: string; from: string; subject: string; body: string; options: string; chosen: string; outcome: string }[] = [];
const talks: string[] = [];
const adjSamples: { v: number; parts: string[] }[] = [];
const ovrDelta: number[] = [];
let userSeries = 0, meetings = 0, activities = 0;
const monthly: Record<string, number> = {};

function answerRequests() {
  const ps = state.people;
  if (!ps) return;
  for (const r of ps.requests) {
    if (!seen.has(r.id)) {
      seen.set(r.id, r);
      const m = state.inbox.find((x) => x.action?.type === 'playerChoice' && x.action.payload === r.id);
      monthly[r.date.slice(0, 7)] = (monthly[r.date.slice(0, 7)] ?? 0) + 1;
      if (m) (r as PlayerRequest & { _msg?: { from: string; subject: string; body: string } })._msg = { from: m.from, subject: m.subject, body: m.body };
    }
    if (r.resolved || r.expires < state.date || r.date === state.date) continue;
    if (rng.chance(0.2)) continue; // sometimes let it expire (fallback + "ignored")
    const opt = rng.pick(r.options);
    resolvePlayerChoice(state, r.id, opt.id);
  }
}

function managerRoutine() {
  const ps = people(state);
  const last = ps.last && ps.last.date === state.date ? ps.last : undefined;
  const say = (pid: string, a: TalkAction, target?: string) => {
    const res = talkTo(state, pid, a, target);
    if (res.ok) talks.push(`${state.date} ${a.padEnd(9)} ${H(pid).padEnd(10)}${target ? ' + ' + H(target).padEnd(9) : ''} [${res.reaction}] “${res.reply}” — ${res.effects}`);
  };
  if (last) {
    if (last.won && last.best) say(last.best, 'praise');
    if (!last.won && last.worst) say(last.worst, rng.chance(0.5) ? 'scold' : 'encourage');
    if (!last.won && ps.streak <= -2 && meetingCheck(state).ok) { const r = teamMeeting(state, 'rally'); if (r.ok) { meetings++; talks.push(`${state.date} MEETING rally: ${r.effects} | ${r.lines?.map((l) => l.text).join(' / ')}`); } }
    if (last.won && ps.streak >= 3 && meetingCheck(state).ok && rng.chance(0.4)) { const r = teamMeeting(state, 'celebrate'); if (r.ok) { meetings++; talks.push(`${state.date} MEETING celebrate: ${r.effects}`); } }
  }
  if (state.date.slice(8) === '15' && activityCheck(state, 'dinner').ok) { const r = teamBuilding(state, rng.chance(0.25) ? 'night' : 'dinner'); if (r.ok) { activities++; talks.push(`${state.date} ACTIVITY ${r.message} | ${r.scene}`); } }
  // weekly: check in with the least trusting player, help with visible issues, mediate drama
  if (new Date(state.date).getUTCDay() === 3) {
    const roster = team.roster.filter((id) => ps.players[id]);
    const low = [...roster].sort((a, b) => ps.players[a].trust - ps.players[b].trust)[0];
    if (low) say(low, 'chat');
    for (const id of roster) if (talkCheck(state, id, 'discuss').ok && rng.chance(0.6)) say(id, 'discuss');
    for (const id of roster) { const c = talkCheck(state, id, 'mediate'); if (c.ok && c.targets && rng.chance(0.5)) { say(id, 'mediate', c.targets[0].id); break; } }
    for (const id of roster) { const c = talkCheck(state, id, 'tough'); if (c.ok && rng.chance(0.5)) { say(id, 'tough'); break; } }
  }
}

function measure() {
  // locker-room modifier per starter, and the change in the team's average effective overall
  let withP = 0, without = 0;
  for (const r of ROLES) {
    const id = team.lineup[r];
    const p = id ? state.players[id] : undefined;
    if (!p) continue;
    const parts = peopleParts(state, p, team);
    const v = parts.reduce((s, x) => s + x.v, 0);
    adjSamples.push({ v, parts: parts.map((x) => x.label.replace(/ with .*| by .*|^Pushed by .*|^Mentoring .*/, (m) => (m.startsWith('Pushed') ? 'Pushed by rival' : m.startsWith('Mentoring') ? 'Mentoring' : m.startsWith(' by') ? ' by' : ''))) });
    withP += overall(effective(state, p, team, r as Role), r as Role);
  }
  const saved = state.people;
  state.people = undefined;
  for (const r of ROLES) { const id = team.lineup[r]; const p = id ? state.players[id] : undefined; if (p) without += overall(effective(state, p, team, r as Role), r as Role); }
  state.people = saved;
  ovrDelta.push((withP - without) / 5);
}

const tl = Date.now();
while (state.date < until) {
  const m = processDay(state);
  if (m) { measure(); simulateSeries(state, m, rng, false); userSeries++; processDay(state); if (!PASSIVE) managerRoutine(); }
  if (!PASSIVE) answerRequests(); else for (const r of state.people?.requests ?? []) if (!seen.has(r.id)) { seen.set(r.id, r); monthly[r.date.slice(0, 7)] = (monthly[r.date.slice(0, 7)] ?? 0) + 1; }
  // keep the squad together over the winter (as season-test does)
  if (state.date.slice(5) === '11-10') for (const id of team.roster) { const p = state.players[id]; if (p.contract && p.contract.expires <= `${state.date.slice(0, 4)}-11-18`) offerRenewal(state, id, Math.round(salaryDemand(state, p, team) * 1.1), 2); }
  endDay(state);
  if (!PASSIVE && state.date.slice(8) === '10' && rng.chance(0.3)) managerRoutine();
}
answerRequests();
const ps = people(state);
console.log(`\n=== ${team.name}: ${Math.round((Date.now() - tl) / 1000)}s season, ${userSeries} user series, roster ${team.roster.map(H).join(', ')} ===`);

// ---------------------------------------------------------------- approaches
const reqs = [...seen.values()];
const byKind: Record<string, number> = {};
for (const r of reqs) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(`\n=== ${reqs.length} player approaches / staff reports (${Object.keys(byKind).length} kinds) ===`);
console.log(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${approachTitle(k)}:${n}`).join('  '));
console.log('per month:', Object.entries(monthly).sort().map(([m, n]) => `${m.slice(5)}:${n}`).join(' '));
const ignored = reqs.filter((r) => state.people?.requests.find((x) => x.id === r.id)?.outcome?.includes('“') && false).length;
void ignored;
const stats = approachStats();
console.log(`approach kinds defined: ${stats.length}; subject variants ${stats.reduce((s, x) => s + x.subj, 0)}, body variants ${stats.reduce((s, x) => s + x.body, 0)}, reply lines ${stats.reduce((s, x) => s + x.replies, 0)}`);
const talkLines = Object.values(TALK_LINES).reduce((s, x) => s + x.pos.length + x.meh.length + x.neg.length + (x.egoNeg?.length ?? 0) + (x.fragileNeg?.length ?? 0) + (x.proPos?.length ?? 0) + (x.reveal?.length ?? 0), 0);
console.log(`talk actions: ${TALK_ACTIONS.length}; talk reply lines: ${talkLines}`);

console.log('\n=== sample conversations ===');
const shown = new Set<string>();
for (const r of reqs) {
  if (shown.has(r.kind) || shown.size >= 14) continue;
  const msg = (r as PlayerRequest & { _msg?: { from: string; subject: string; body: string } })._msg;
  if (!msg || !r.resolved) continue;
  shown.add(r.kind);
  console.log(`--- ${r.date} [${r.kind}] from ${msg.from}: “${msg.subject}”\n${msg.body}\n  options: ${r.options.map((o) => `${o.label}${o.hint ? ` (${o.hint})` : ''}`).join(' | ')}\n  → chose: ${r.options.find((o) => o.id === r.resolved)?.label ?? r.resolved}\n  ${(r.outcome ?? '').replace(/\n/g, '\n  ')}`);
}

// ---------------------------------------------------------------- relationships
console.log('\n=== pair relationships at season end ===');
const roster = team.roster.filter((id) => ps.players[id]);
const kinds: Record<string, number> = {};
for (let i = 0; i < roster.length; i++) for (let j = i + 1; j < roster.length; j++) {
  const v = pairView(state, roster[i], roster[j]);
  if (!v) continue;
  kinds[v.label] = (kinds[v.label] ?? 0) + 1;
  if (v.kind !== 'neutral') console.log(`  ${H(roster[i]).padEnd(10)} – ${H(roster[j]).padEnd(10)} ${v.label.padEnd(22)} aff ${String(v.aff).padStart(4)} heat ${v.heat}${v.duoQ ? ' (paired up)' : ''}${v.last ? `  last: ${v.last.text}` : ''}`);
}
console.log('  summary:', kinds);
const feedTone = { pos: ps.feed.filter((f) => f.tone > 0).length, neg: ps.feed.filter((f) => f.tone < 0).length };
console.log(`\n=== locker-room feed (last ${ps.feed.length}: ${feedTone.pos} positive, ${feedTone.neg} negative) ===`);
for (const f of ps.feed.slice(0, 18)) console.log(`  ${f.date} ${f.tone > 0 ? '+' : f.tone < 0 ? '−' : ' '} ${f.text}`);
const dramaNews = state.news.filter((n) => n.tags.includes('drama') || (n.tags.includes('feature') && n.teamIds?.includes(team.id)));
console.log(`\nnews items from the locker room: ${dramaNews.length}${dramaNews.length ? ' — e.g. ' + dramaNews.slice(0, 3).map((n) => `“${n.headline}”`).join(' · ') : ''}`);
const notes = state.inbox.filter((m) => m.kind === 'player');
console.log(`player/locker-room inbox messages kept: ${notes.length} (${notes.filter((m) => m.action).length} actionable) of ${state.inbox.length}`);

// ---------------------------------------------------------------- match effect
const vals = adjSamples.map((x) => x.v).sort((a, b) => a - b);
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0;
console.log(`\n=== effect on effective ratings (starters, measured before each of ${userSeries} series) ===`);
console.log(`  per player: mean ${avg(vals).toFixed(2)}  p5 ${q(0.05).toFixed(2)}  p50 ${q(0.5).toFixed(2)}  p95 ${q(0.95).toFixed(2)}  min ${vals[0]?.toFixed(2)}  max ${vals[vals.length - 1]?.toFixed(2)}`);
console.log(`  team avg effective OVR vs no locker room: mean ${avg(ovrDelta).toFixed(2)}  min ${Math.min(...ovrDelta).toFixed(2)}  max ${Math.max(...ovrDelta).toFixed(2)}`);
const partCount: Record<string, number> = {};
for (const s of adjSamples) for (const p of s.parts) partCount[p] = (partCount[p] ?? 0) + 1;
console.log('  sources seen:', Object.entries(partCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join('  '));
console.log('  current breakdown:');
for (const r of ROLES) {
  const id = team.lineup[r];
  const p = id ? state.players[id] : undefined;
  if (!p) continue;
  const parts = peopleParts(state, p, team);
  console.log(`    ${p.handle.padEnd(10)} trust ${Math.round(ps.players[p.id]?.trust ?? 0)} (${trustLabel(ps.players[p.id]?.trust ?? 0).label}), mood ${moodOf(state, p).label}: ${parts.map((x) => `${x.label} ${x.v >= 0 ? '+' : ''}${x.v.toFixed(2)}`).join(', ') || '—'}`);
}

// ---------------------------------------------------------------- manager talks
console.log(`\n=== manager talks during the season (${talks.length}; ${meetings} meetings, ${activities} activities) — sample ===`);
for (const t of talks.filter((_, i) => i % Math.max(1, Math.floor(talks.length / 16)) === 0).slice(0, 16)) console.log('  ' + t);

// ---------------------------------------------------------------- personality lab
console.log('\n=== personality lab: same talk, different personalities (40 trials each, trust 50) ===');
const archetypes: [string, Partial<GameState['players'][string]['hidden']>, number][] = [
  ['Professional (pro 90, comp 80, ego 35)', { professionalism: 90, composure: 80, ego: 35 }, 25],
  ['Fragile (pro 60, comp 25, ego 40)', { professionalism: 60, composure: 25, ego: 40 }, 75],
  ['Big ego (pro 55, comp 55, ego 90)', { professionalism: 55, composure: 55, ego: 90 }, 50],
  ['Hothead (pro 45, comp 30, ego 70)', { professionalism: 45, composure: 30, ego: 70 }, 70],
];
const pid = roster[0];
// talks only touch the player and the locker-room state: snapshot those instead of cloning the whole save
const snapP = JSON.stringify(state.players[pid]), snapPs = JSON.stringify(state.people), snapSeq = state.seq;
const fresh = (): GameState => { state.players[pid] = JSON.parse(snapP); state.people = JSON.parse(snapPs); state.seq = snapSeq; return state; };
for (const action of ['scold', 'praise', 'expect', 'encourage'] as TalkAction[]) {
  const row: string[] = [];
  for (const [name, hid, temper] of archetypes) {
    const tally = { pos: 0, meh: 0, neg: 0 };
    let morale = 0, trust = 0, example = '';
    const ex: Record<string, string> = {};
    for (let i = 0; i < 40; i++) {
      const s = fresh();
      const p = s.players[pid];
      Object.assign(p.hidden, hid);
      p.personality.temperament = temper;
      const me = s.people!.players[pid];
      me.trust = 50; me.log = []; me.cd = {};
      s.seq += i * 7919;
      // a bad loss just happened, and they played poorly
      s.people!.last = { fixtureId: 'lab', date: s.date, won: false, score: '0-2', opp: 'Gen.G', big: false, perf: { [pid]: -3 }, lines: { [pid]: '1/7/2' }, mistakes: { [pid]: 'died 7 times on Azir in game 2' } };
      const m0 = p.morale, t0 = me.trust;
      const r = talkTo(s, pid, action);
      if (!r.ok) { example = r.message ?? ''; continue; }
      tally[r.reaction!]++;
      morale += p.morale - m0; trust += s.people!.players[pid].trust - t0;
      ex[r.reaction!] ??= `[${r.reaction}] “${r.reply}”`;
    }
    example ||= ex[(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0])] ?? '';
    row.push(`    ${name.padEnd(38)} pos ${String(tally.pos).padStart(2)} / meh ${String(tally.meh).padStart(2)} / neg ${String(tally.neg).padStart(2)}  avg morale ${(morale / 40).toFixed(1).padStart(5)}  trust ${(trust / 40).toFixed(1).padStart(5)}  ${example}`);
  }
  console.log(`  ${action} (after a 0-2 loss where they went 1/7/2):\n${row.join('\n')}`);
}
console.log('\n=== repetition: praising the same professional player 6 days in a row ===');
{
  const s = fresh();
  const p = s.players[pid];
  Object.assign(p.hidden, { professionalism: 80, composure: 70, ego: 40 });
  s.people!.players[pid].log = []; s.people!.players[pid].cd = {};
  s.people!.last = { fixtureId: 'lab', date: s.date, won: true, score: '2-0', opp: 'T1', big: false, perf: { [pid]: 3 }, lines: { [pid]: '7/1/9' }, mistakes: {} };
  const out: string[] = [];
  const d0 = s.date;
  for (let d = 0; d < 6; d++) {
    const r = talkTo(s, pid, 'praise');
    out.push(`day ${d + 1}: [${r.reaction}] trust ${Math.round(s.people!.players[pid].trust)} “${r.reply}”`);
    s.date = new Date(Date.parse(s.date + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  }
  console.log('  ' + out.join('\n  '));
  s.date = d0; fresh();
}
console.log(`\nlocker-room state JSON: ${(JSON.stringify(state.people).length / 1024).toFixed(1)} KB; total runtime ${((Date.now() - t0) / 1000).toFixed(1)}s`);
