// Stream chat check: play a game through the match engine at a playback speed (real time simulated), run the chat
// brain on it and print a transcript sample plus pace and shape stats.
//   npx tsx scripts/debug/chat.ts [blue=9g-vcs] [red=sgw-vcs] [speed=1] [lang=vi|en] [seed=1] [series=0-0/bo3] [final]
// e.g. a Bo5 final at 2-0 to blue: … vi 1 2-0/bo5 final. Prints which Vietnamese "moments" fired (chatMoments.ts).
// Compare with the study of a real Vietnamese YouTube broadcast chat (chatVi.ts): ~1.5 lines/s in game, ~3/s at the
// end, median ~12 characters, a third single words.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { POOL_CACHE } from '../../src/engine/game';
import { draftPicks } from '../../src/engine/season/series';
import { setMeta, newDraft, runAIDraft } from '../../src/engine/draft/draft';
import { draftTeam, simTeam } from '../../src/engine/season/prep';
import { MatchSim } from '../../src/engine/sim/engine';
import { RNG } from '../../src/util/rng';
import { buildBroadcastCtx } from '../../src/ui/match/broadcast/context';
import { ChatBrain, type ChatOut, type ChatSetup } from '../../src/ui/match/chatBrain';
import { chatWorld } from '../../src/ui/match/chatWorld';
import { Commentary } from '../../src/ui/match/broadcast/commentary';
import { DESKS } from '../../src/ui/match/broadcast/castersData';
import { _pushDesk } from '../../src/ui/match/chatFeed';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const [blueId = '9g-vcs', redId = 'sgw-vcs', speedArg = '1', lang = 'vi', seedArg = '1', seriesArg = '0-0/bo3', finalArg = ''] = process.argv.slice(2);
const [, sMine = '0', sTheirs = '0', sBo = '3'] = /^(\d)-(\d)\/bo(\d)$/.exec(seriesArg) ?? [];
const SPEED = Number(speedArg), SEED = Number(seedArg);
const state = createNewGame(db, blueId, 'Tester', 12345);
const blue = state.teams[blueId], red = state.teams[redId];
if (!blue || !red) throw new Error('unknown team');
const d = newDraft(draftTeam(state, blue), draftTeam(state, red));
runAIDraft(d, new RNG(77 + SEED), state.championPower);
const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: 1000 + SEED, analyze: true });
const bc = buildBroadcastCtx(state, null, sim, [blue, red], 0);
const mine = Number(sMine), theirs = Number(sTheirs), bestOf = Number(sBo);
const world = chatWorld(state, undefined, [blue, red], sim);
if (finalArg === 'final') Object.assign(world, { final: true, cup: 'Demacia Cup', prize: '90k đô', king: [1, 0], exPlayers: [['Diable'], []] });
const setup: ChatSetup = {
  flags: {}, lore: null, base: bc.audience?.viewers ?? 60_000, aud: bc.audience, picks: bc.picks, leg: null, bestOf, mine, theirs, gameNo: mine + theirs + 1,
  comp: 'VCS', patch: state.patch, me: 'Tester', vi: lang === 'vi', world,
};
// tally the categories and waves the brain is asked for
const said: Record<string, number> = {}, waves: Record<string, number> = {}, waveTokens: string[] = [];
const proto = ChatBrain.prototype as unknown as { say: (...a: unknown[]) => unknown; startWave: (...a: unknown[]) => unknown };
const say0 = proto.say, wave0 = proto.startWave;
proto.say = function (this: unknown, ...a: unknown[]) { said[String(a[0])] = (said[String(a[0])] ?? 0) + 1; return say0.apply(this, a); };
proto.startWave = function (this: unknown, ...a: unknown[]) { waves[String(a[0])] = (waves[String(a[0])] ?? 0) + 1; if (Array.isArray(a[3])) waveTokens.push(`${a[0]}: ${(a[3] as string[]).slice(0, 5).join(' / ')}`); return wave0.apply(this, a); };
const brain = new ChatBrain(sim, [blue, red], 0, setup);
// ALO=1: force the phone-near-the-mic moment at 7:00
if (process.env.ALO) (brain as unknown as { moments?: { aloAt: number | null } }).moments!.aloAt = 420;
// the caster desk runs too (the Vietnamese chat reacts to what Hoàng Luân says)
const desk = lang === 'vi' ? new Commentary(sim, bc, DESKS.find((x) => x.id === 'vn')!) : null;
if (desk) desk.viewers = () => brain.meta.viewers;
let deskLines = 0;
const out: { real: number; t: number; m: ChatOut }[] = [];
let real = 0, endReal = 0;
const TICK = 100;
while (true) {
  real += TICK;
  const target = (real / 1000) * SPEED;
  while (sim.t < target && sim.winner === null) sim.step();
  const l = desk?.tick(1_000_000 + real);
  if (l) { deskLines++; _pushDesk({ text: l.text, cat: l.cat, lang: l.lang, pri: l.pri, t: l.t }); }
  const r = brain.tick(1_000_000 + real);
  for (const m of r.out) out.push({ real, t: sim.t, m });
  if (sim.winner !== null && !endReal) endReal = real;
  if (endReal && real - endReal > 60_000) break;
  if (real > (SPEED === 1 ? 50 : 20) * 60_000) break; // cap the run (real minutes)
}
const msgs = out.filter((o) => o.m.kind === 'msg');
const mm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(`${blue.name} vs ${red.name} · ${lang} · speed ${SPEED}× · winner ${sim.winner === null ? '-' : [blue.short, red.short][sim.winner]} at ${mm(sim.t)}\n`);
if (process.env.FULL) for (const o of out) console.log(`${mm(o.t)} ${o.m.kind === 'msg' ? `${(o.m.name ?? '').padEnd(24)} ${o.m.text}` : `[${o.m.notice ?? o.m.kind}] ${o.m.title ?? ''} ${o.m.text ?? ''}`}`);
for (const o of out.slice(0, 40)) console.log(`${mm(o.t)} ${o.m.kind === 'msg' ? `${(o.m.name ?? '').padEnd(24)} ${o.m.text}` : `[${o.m.notice ?? o.m.kind}] ${o.m.title ?? ''} ${o.m.text ?? ''}`}`);
console.log('…');
const endIdx = out.findIndex((o) => o.real >= endReal);
for (const o of out.slice(Math.max(0, endIdx - 5), endIdx + 30)) console.log(`${mm(o.t)} ${o.m.kind === 'msg' ? `${(o.m.name ?? '').padEnd(24)} ${o.m.text}` : `[${o.m.notice ?? o.m.kind}] ${o.m.title ?? ''} ${o.m.text ?? ''}`}`);
// pace: lines per real second in game vs the 30 s after the end
const inGame = msgs.filter((o) => o.real < endReal), after = msgs.filter((o) => o.real >= endReal && o.real < endReal + 30_000);
const len = msgs.map((o) => o.m.text.length).sort((a, b) => a - b);
const one = msgs.filter((o) => o.m.text.trim().split(/\s+/).length === 1).length;
const twitchy = msgs.filter((o) => /\b(KEKW|Pog\w*|Sadge|monka\w*|LULW|ICANT|Copium|catJAM|peepo\w*|OMEGALUL|Aware|Clueless)\b/.test(o.m.text));
const englishy = msgs.filter((o) => /\b(the|you|is|are|this|what|they|team|game|chat)\b/i.test(o.m.text) && !/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(o.m.text));
console.log(`\n${msgs.length} messages · in game ${(inGame.length / Math.max(1, endReal / 1000)).toFixed(2)}/s · first 30 s after the end ${(after.length / 30).toFixed(2)}/s`);
console.log(`length median ${len[Math.floor(len.length / 2)]} chars (p75 ${len[Math.floor(len.length * 0.75)]}) · single-word ${(one / Math.max(1, msgs.length) * 100).toFixed(0)}% · authors ${new Set(msgs.map((o) => o.m.name)).size}`);
console.log(`notices: ${Object.entries(out.filter((o) => o.m.kind !== 'msg').reduce((a, o) => { const k = o.m.notice ?? o.m.kind; a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`twitch emotes: ${twitchy.length}${twitchy.length ? ` (${twitchy.slice(0, 3).map((o) => o.m.text).join(' | ')})` : ''} · english-looking lines: ${englishy.length}${englishy.length ? ` (${englishy.slice(0, 5).map((o) => o.m.text).join(' | ')})` : ''}`);
console.log(`\ndesk lines: ${deskLines}`);
console.log(`said: ${Object.entries(said).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`waves: ${Object.entries(waves).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`runtime waves: ${waveTokens.join(' || ')}`);
console.log(`world: hour ${world.vnHour} · crowd ${world.crowd.side ?? '-'} ${world.crowd.region} ${world.crowd.city} · clubs ${world.clubs.slice(0, 6).join(' ')} · vn ${world.vnClub} · contract ${world.contractYear.join(' ')} · prev ${Object.entries(world.prevTeam).slice(0, 4).map(([a, b]) => `${a}←${b}`).join(' ')} · results ${world.results.join(' | ')} · next ${world.next.map((x) => x.label + ' ' + x.when).join(' | ')}`);
