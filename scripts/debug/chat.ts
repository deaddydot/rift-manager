// Stream chat check: play a game through the match engine at a playback speed (real time simulated), run the chat
// brain on it and print a transcript sample plus pace and shape stats.
//   npx tsx scripts/debug/chat.ts [blue=9g-vcs] [red=sgw-vcs] [speed=1] [lang=vi|en] [seed=1]
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

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const [blueId = '9g-vcs', redId = 'sgw-vcs', speedArg = '1', lang = 'vi', seedArg = '1'] = process.argv.slice(2);
const SPEED = Number(speedArg), SEED = Number(seedArg);
const state = createNewGame(db, blueId, 'Tester', 12345);
const blue = state.teams[blueId], red = state.teams[redId];
if (!blue || !red) throw new Error('unknown team');
const d = newDraft(draftTeam(state, blue), draftTeam(state, red));
runAIDraft(d, new RNG(77 + SEED), state.championPower);
const sim = new MatchSim(simTeam(state, blue, draftPicks(d, 0)), simTeam(state, red, draftPicks(d, 1)), { seed: 1000 + SEED });
const bc = buildBroadcastCtx(state, null, sim, [blue, red], 0);
const setup: ChatSetup = {
  flags: {}, lore: null, base: bc.audience?.viewers ?? 60_000, aud: bc.audience, picks: bc.picks, leg: null, bestOf: 3, mine: 0, theirs: 0, gameNo: 1,
  comp: 'VCS', patch: state.patch, me: 'Tester', vi: lang === 'vi',
};
const brain = new ChatBrain(sim, [blue, red], 0, setup);
const out: { real: number; t: number; m: ChatOut }[] = [];
let real = 0, endReal = 0;
const TICK = 100;
while (true) {
  real += TICK;
  const target = (real / 1000) * SPEED;
  while (sim.t < target && sim.winner === null) sim.step();
  const r = brain.tick(1_000_000 + real);
  for (const m of r.out) out.push({ real, t: sim.t, m });
  if (sim.winner !== null && !endReal) endReal = real;
  if (endReal && real - endReal > 60_000) break;
  if (real > (SPEED === 1 ? 50 : 20) * 60_000) break; // cap the run (real minutes)
}
const msgs = out.filter((o) => o.m.kind === 'msg');
const mm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(`${blue.name} vs ${red.name} · ${lang} · speed ${SPEED}× · winner ${sim.winner === null ? '-' : [blue.short, red.short][sim.winner]} at ${mm(sim.t)}\n`);
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
