// Incoming bids, the player's side (management/bidTalks.ts): plays to the June transfer window, then
//  1) prints every player's stance towards a handful of bidders (interest −1…1, label, the reasons),
//  2) runs scripted scenarios on cloned saves — accepting a move he doesn't want (personal terms refused?),
//     rejecting a move he wants (morale / trust, the "I want that move" talk and each answer), the agent's
//     "new deal to stay" talk, a promise to let him go that you then break, and the transfer-request chain,
//  3) plays the window naturally with a simple policy and logs every bid, stance, decision and consequence.
// Usage: npx tsx scripts/debug/bids.ts [team] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import type { GameState, TransferOffer, Player } from '../../src/engine/types';
import { askingFee, fmtK } from '../../src/engine/management/transfers';
import { respondIncomingOffer } from '../../src/engine/management/offerActions';
import { bidStance, bidSalary, newBid, stanceLine } from '../../src/engine/management/bidTalks';
import { person, resolvePlayerChoice, openPlayerApproach, playerRequestLive } from '../../src/engine/management/people';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const seed = Number(process.argv[3] ?? 77);
const base = createNewGame(db, userTeam, 'Tester', seed);
const simRng = new RNG(seed ^ 5);
function day(s: GameState) {
  const m = processDay(s);
  if (m) { simulateSeries(s, m, simRng, false); processDay(s); }
  endDay(s);
}
while (base.date < '2026-06-01') day(base);
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const $ = (n: number) => `$${fmtK(n)}`;
const snap = (s: GameState, pid: string) => { const p = s.players[pid], me = s.people?.players[pid]; return { morale: Math.round(p.morale), trust: Math.round(me?.trust ?? 0), team: p.teamId, salary: p.contract?.salary ?? 0, until: p.contract?.expires ?? '', issues: (me?.issues ?? []).filter((i) => i.until >= s.date && i.sev > 0).map((i) => `${i.kind}:${i.sev}`).join(',') }; };
const diff = (a: ReturnType<typeof snap>, b: ReturnType<typeof snap>) => [
  a.team !== b.team ? `team ${a.team} → ${b.team}` : '', b.morale !== a.morale ? `morale ${a.morale}→${b.morale}` : '', b.trust !== a.trust ? `trust ${a.trust}→${b.trust}` : '',
  b.salary !== a.salary ? `salary ${$(a.salary)}→${$(b.salary)} (until ${b.until})` : '', b.issues !== a.issues ? `issues [${a.issues}]→[${b.issues}]` : '',
].filter(Boolean).join(' · ') || 'no change';
const newMail = (s: GameState, n: number) => s.inbox.slice(0, Math.max(0, s.inbox.length - n)).reverse();
function mkBid(s: GameState, pid: string, buyerId: string, rng: RNG, feeMul = 1): TransferOffer {
  const p = s.players[pid], buyer = s.teams[buyerId], user = s.teams[s.userTeamId];
  const salary = bidSalary(s, p, buyer, rng);
  const o: TransferOffer = { id: `to_${s.seq++}`, date: s.date, playerId: pid, fromTeamId: user.id, toTeamId: buyer.id, fee: Math.round(askingFee(s, p, user) * feeMul / 5000) * 5000, salary, years: 2, status: 'pending', direction: 'incoming', expires: s.date, stance: bidStance(s, p, buyer, salary) };
  o.expires = new Date(new Date(s.date).getTime() + 7 * 864e5).toISOString().slice(0, 10);
  s.transferOffers.unshift(o);
  newBid(s, o, rng);
  return o;
}
const reqFor = (s: GameState, pid: string, kind: string) => s.people?.requests.find((r) => r.playerId === pid && r.kind === kind && playerRequestLive(s, r.id));

const user = base.teams[userTeam];
const roster = user.roster.map((id) => base.players[id]).filter(Boolean) as Player[];
console.log(`\n=== ${user.name} on ${base.date} (window open: ${base.transferWindowOpen}) ===`);
for (const p of roster) console.log(`  ${p.handle.padEnd(11)} ${p.role.padEnd(7)} morale ${Math.round(p.morale)} trust ${Math.round(person(base, p.id).trust)} loyalty ${p.hidden.loyalty} ego ${p.hidden.ego} ambition ${p.personality.ambition} · ${p.country} · ${$(p.contract?.salary ?? 0)}/yr`);

// ---- 1) stance matrix
const bidders = ['gen-lck', 'hle-lck', 'blg-lpl', 'jdg-lpl', 'g2-lec', 'tl-lcs', 'dfm-lcp', 'fx-cblol'].filter((id) => base.teams[id] && id !== userTeam);
console.log(`\n=== 1) the player's view of a bid (v: −1 won't go … +1 desperate to go) ===`);
const all: { p: Player; b: string; v: number; label: string }[] = [];
for (const p of roster) {
  console.log(`  ${p.handle}`);
  for (const b of bidders) {
    const salary = bidSalary(base, p, base.teams[b], new RNG(1));
    const st = bidStance(base, p, base.teams[b], salary);
    all.push({ p, b, v: st.v, label: st.label });
    console.log(`    ${base.teams[b].short.padEnd(5)} ${$(salary).padStart(7)}/yr  ${st.label.padEnd(9)} ${st.v.toFixed(2).padStart(5)}  ${st.why}   [${(st.reasons ?? []).join('; ')}]`);
  }
}
const labels: Record<string, number> = {};
for (const x of all) labels[x.label] = (labels[x.label] ?? 0) + 1;
console.log(`  stance mix: ${JSON.stringify(labels)}`);

// ---- 2) scripted scenarios
// an unsettled player for the "he wants the move" paths: the least loyal one, made unhappy (morale 30, trust 25)
const restless = [...roster].sort((a, b) => a.hidden.loyalty - b.hidden.loyalty)[0];
base.players[restless.id].morale = 30;
person(base, restless.id).trust = 25;
const mostOf = bidders.map((b) => ({ p: restless, b, ...(() => { const st = bidStance(base, restless, base.teams[b], bidSalary(base, restless, base.teams[b], new RNG(1))); return { v: st.v, label: st.label }; })() }));
console.log(`\n  ${restless.handle} made unhappy (morale 30, trust 25): ${mostOf.map((x) => `${base.teams[x.b].short} ${x.label} ${x.v}`).join(' · ')}`);
const most = [...mostOf].sort((a, b) => b.v - a.v)[0];
const least = [...all].sort((a, b) => a.v - b.v)[0];
const middle = [...all].filter((x) => x.label === 'open' || x.label === 'keen').sort((a, b) => Math.abs(a.v - 0.1) - Math.abs(b.v - 0.1))[0] ?? most;
console.log(`\n=== 2a) accept a bid ${least.p.handle} doesn't want (${base.teams[least.b].short}, ${least.label} ${least.v}) — 20 tries ===`);
let refused = 0;
for (let i = 0; i < 20; i++) {
  const s = clone(base); s.seq += i * 97;
  const o = mkBid(s, least.p.id, least.b, new RNG(i));
  if (o.status !== 'pending') { if (i < 3) console.log(`  try ${i}: ${o.message}`); continue; }
  const before = snap(s, least.p.id);
  const r = respondIncomingOffer(s, o.id, true);
  if (o.status !== 'accepted') refused++;
  if (i < 4) console.log(`  try ${i}: ${r.message}\n           ${diff(before, snap(s, least.p.id))}`);
}
console.log(`  → personal terms refused in ${refused}/20 tries (loyal refusals before the decision are counted as not refused)`);

console.log(`\n=== 2b) reject a bid ${most.p.handle} wants (${base.teams[most.b].short}, ${most.label} ${most.v}) ===`);
{
  const s = clone(base);
  const n0 = s.inbox.length;
  const o = mkBid(s, most.p.id, most.b, new RNG(3));
  for (const m of newMail(s, n0)) console.log(`  [inbox] ${m.from} | ${m.subject}\n          ${m.body.replace(/\n+/g, '\n          ')}${m.action ? `\n          (${m.action.type})` : ''}`);
  const before = snap(s, most.p.id);
  console.log(`  reject → ${respondIncomingOffer(s, o.id, false).message}\n           ${diff(before, snap(s, most.p.id))}`);
  for (let i = 0; i < 4 && !reqFor(s, most.p.id, 'bid_wants'); i++) endDay(s);
  const req = reqFor(s, most.p.id, 'bid_wants');
  if (!req) console.log('  (no follow-up talk this time)');
  else {
    const m = s.inbox.find((x) => x.action?.payload === req.id);
    console.log(`  ${s.date} [player approach] ${m?.subject}\n          “${m?.body}”`);
    for (const opt of req.options) {
      const c = clone(s), b0 = snap(c, most.p.id), n1 = c.inbox.length, offers = c.transferOffers.length, newsN = c.news.length;
      const r = resolvePlayerChoice(c, req.id, opt.id);
      const out = c.people!.requests.find((x) => x.id === req.id)?.outcome?.split('\n')[0] ?? '';
      console.log(`    → ${opt.label} [${opt.hint ?? ''}]\n        ${out}\n        ${r.message} · ${diff(b0, snap(c, most.p.id))}`);
      for (let d = 0; d < 13; d++) endDay(c);
      const later = newMail(c, n1).filter((x) => /agent|bid|Improved/i.test(x.from + x.subject));
      for (const x of later) console.log(`        later: ${x.date} ${x.from} | ${x.subject}`);
      if (c.transferOffers.length > offers) console.log(`        later: ${c.transferOffers.length - offers} new offer(s): ${c.transferOffers.slice(0, c.transferOffers.length - offers).map((x) => `${c.teams[x.toTeamId]?.short} ${$(x.fee)} ${x.status} (${x.stance?.label} ${x.stance?.v})`).join(', ')}`);
      for (const x of c.news.slice(0, c.news.length - newsN).filter((n) => n.playerIds?.includes(most.p.id))) console.log(`        news: ${x.headline}`);
    }
  }
}

console.log(`\n=== 2c) the agent's offer: ${middle.p.handle} would stay for a new deal (${base.teams[middle.b].short}, ${middle.label} ${middle.v}) ===`);
{
  const s = clone(base);
  const o = mkBid(s, middle.p.id, middle.b, new RNG(11));
  let req = reqFor(s, middle.p.id, 'bid_agent');
  if (!req && o.status === 'pending' && !s.people?.requests.some((r) => r.playerId === middle.p.id && playerRequestLive(s, r.id))) {
    const p = s.players[middle.p.id], cur = p.contract?.salary ?? 0, ask = Math.round(cur * 1.25 / 1000) * 1000;
    openPlayerApproach(s, p.id, 'bid_agent', { club: s.teams[middle.b].short, clubName: s.teams[middle.b].name, offerId: o.id, ask: $(ask), askN: ask, counter: $(Math.round((cur + ask) / 2000) * 1000), counterN: Math.round((cur + ask) / 2000) * 1000, years: 2, until: '2027' });
    req = reqFor(s, middle.p.id, 'bid_agent');
    console.log('  (talk opened by the script — the 50% roll did not open it)');
  }
  if (req) {
    const m = s.inbox.find((x) => x.action?.payload === req!.id);
    console.log(`  [player approach] ${m?.subject}\n          “${m?.body}”`);
    for (const opt of req.options) {
      const c = clone(s), b0 = snap(c, middle.p.id);
      const r = resolvePlayerChoice(c, req.id, opt.id);
      const bid = c.transferOffers.find((x) => x.id === o.id)!;
      console.log(`    → ${opt.label} [${opt.hint ?? ''}]\n        ${c.people!.requests.find((x) => x.id === req!.id)?.outcome?.split('\n')[0]}\n        ${r.message} · ${diff(b0, snap(c, middle.p.id))} · bid: ${bid.status}${bid.message ? ` (${bid.message})` : ''} · stance now ${bid.stance?.label} ${bid.stance?.v}`);
    }
  } else console.log(`  no agent talk (bid status ${o.status}: ${o.message ?? ''})`);
}

console.log(`\n=== 2d) "if the fee is right, you can go" — then rejecting the bid (${most.p.handle}) ===`);
{
  const s = clone(base);
  const o = mkBid(s, most.p.id, most.b, new RNG(21));
  let req = reqFor(s, most.p.id, 'bid_push');
  if (!req) { const r = openPlayerApproach(s, most.p.id, 'bid_push', { club: s.teams[most.b].short, clubName: s.teams[most.b].name, offerId: o.id }); req = r ?? undefined; }
  if (req) {
    const b0 = snap(s, most.p.id);
    console.log(`  push talk → “If the fee is right, you can go”: ${resolvePlayerChoice(s, req.id, 'yes').message} · ${diff(b0, snap(s, most.p.id))}`);
    const b1 = snap(s, most.p.id);
    console.log(`  reject the bid → ${respondIncomingOffer(s, o.id, false).message}\n           ${diff(b1, snap(s, most.p.id))}`);
    console.log(`  inbox: ${s.inbox[0].from} | ${s.inbox[0].subject} — “${s.inbox[0].body}”`);
  }
}

console.log(`\n=== 2f) standing firm until it breaks: transfer request → agent → raised bid (${most.p.handle}) ===`);
{
  const s0 = clone(base);
  const o = mkBid(s0, most.p.id, most.b, new RNG(3));
  respondIncomingOffer(s0, o.id, false);
  for (let i = 0; i < 4 && !reqFor(s0, most.p.id, 'bid_wants'); i++) endDay(s0);
  const req = reqFor(s0, most.p.id, 'bid_wants');
  let tries = 0;
  for (let i = 0; req && i < 15; i++) {
    const c = clone(s0); c.seq += i * 31; tries++;
    const b0 = snap(c, most.p.id), n1 = c.inbox.length, newsN = c.news.length, offers = c.transferOffers.length;
    resolvePlayerChoice(c, req.id, 'firm');
    const out = c.people!.requests.find((x) => x.id === req.id)?.outcome ?? '';
    if (!/transfer request/i.test(out)) continue;
    console.log(`  try ${tries}: ${out.replace(/\n/g, ' · ')}\n           ${diff(b0, snap(c, most.p.id))}`);
    for (const x of c.news.slice(0, c.news.length - newsN)) console.log(`  news: ${x.headline}`);
    for (let d = 0; d < 14; d++) endDay(c);
    for (const x of newMail(c, n1).filter((m) => /agent|Bid|bid/.test(m.from + m.subject))) console.log(`  ${x.date} ${x.from} | ${x.subject}\n     ${x.body.replace(/\n+/g, '\n     ')}`);
    for (const x of c.transferOffers.slice(0, c.transferOffers.length - offers)) console.log(`  new offer: ${c.teams[x.toTeamId]?.short} ${$(x.fee)} (was ${$(o.fee)}) · ${x.status} · ${x.stance?.label} ${x.stance?.v}`);
    break;
  }
  if (!req) console.log('  (no "I want that move" talk opened)');
}

console.log(`\n=== 2e) a loyal star and a big offer (who turns it down himself?) ===`);
for (const p of [...roster].sort((a, b) => b.hidden.loyalty - a.hidden.loyalty).slice(0, 3)) {
  let self = 0;
  for (let i = 0; i < 10; i++) { const s = clone(base); const o = mkBid(s, p.id, 'blg-lpl' in s.teams ? 'blg-lpl' : bidders[0], new RNG(100 + i), 1.3); if (o.status === 'rejected') self++; }
  const st = bidStance(base, p, base.teams['blg-lpl'] ?? base.teams[bidders[0]], bidSalary(base, p, base.teams['blg-lpl'] ?? base.teams[bidders[0]], new RNG(1)));
  console.log(`  ${p.handle.padEnd(10)} loyalty ${p.hidden.loyalty}: ${stanceLine(p, st)} → turned it down himself ${self}/10`);
}

// ---- 3) the window, played naturally
console.log(`\n=== 3) June + off-season windows played out, to 2027-01-15 (policy: accept fees ≥ 115% of valuation, else reject; random answers to talks) ===`);
const s = clone(base);
const pol = new RNG(seed ^ 77);
const seen = new Set<string>();
const log: string[] = [];
while (s.date <= '2027-01-15') {
  for (const o of s.transferOffers) {
    if (o.direction !== 'incoming' || seen.has(o.id) || o.date < '2026-06-01') continue;
    seen.add(o.id);
    const p = s.players[o.playerId];
    log.push(`${o.date} BID ${s.teams[o.toTeamId]?.short} → ${p.handle}: ${$(o.fee)} (valuation ${$(askingFee(s, p, s.teams[userTeam]))}), ${$(o.salary)}/yr vs ${$(p.contract?.salary ?? 0)} — ${o.stance ? stanceLine(p, o.stance) : ''}${o.status !== 'pending' ? ` [${o.message}]` : ''}`);
  }
  for (const r of s.people?.requests ?? []) if (r.kind.startsWith('bid_') && playerRequestLive(s, r.id) && !seen.has(r.id)) {
    seen.add(r.id);
    const opt = pol.pick(r.options);
    const p = s.players[r.playerId], b0 = snap(s, r.playerId);
    const res = resolvePlayerChoice(s, r.id, opt.id);
    log.push(`${s.date} TALK ${p.handle} [${r.kind}] → ${opt.label}: ${res.message} · ${diff(b0, snap(s, r.playerId))}`);
  }
  for (const o of s.transferOffers) {
    if (o.direction !== 'incoming' || o.status !== 'pending' || s.players[o.playerId]?.teamId !== userTeam || seen.has('answer:' + o.id)) continue;
    if (o.date >= s.date) continue; // decide the next day, after any talk
    seen.add('answer:' + o.id);
    const p = s.players[o.playerId], b0 = snap(s, p.id);
    const accept = o.fee >= askingFee(s, p, s.teams[userTeam]) * 1.15;
    const r = respondIncomingOffer(s, o.id, accept);
    log.push(`${s.date} ${accept ? 'ACCEPT' : 'REJECT'} ${p.handle}: ${r.message} · ${diff(b0, snap(s, p.id))}`);
  }
  day(s);
}
for (const l of log) console.log('  ' + l);
const inc = s.transferOffers.filter((o) => o.direction === 'incoming' && o.date >= '2026-06-01');
console.log(`  ${inc.length} incoming bids: ${['accepted', 'rejected', 'withdrawn', 'pending'].map((k) => `${k} ${inc.filter((o) => o.status === k).length}`).join(', ')} · stances ${JSON.stringify(inc.reduce((m: Record<string, number>, o) => { const k = o.stance?.label ?? '—'; m[k] = (m[k] ?? 0) + 1; return m; }, {}))}`);
const news = s.news.filter((n) => n.date >= '2026-06-01' && n.tags.includes('transfer') && (n.teamIds?.includes(userTeam) || n.playerIds?.some((id) => roster.some((p) => p.id === id))));
if (news.length) console.log(`  news:\n${news.reverse().map((n) => `    ${n.date} ${n.headline}`).join('\n')}`);
