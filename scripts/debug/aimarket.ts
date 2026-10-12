// AI squad building check (src/engine/management/aiSquad.ts): replacements, domino moves and lineup quality.
// usage: npx tsx scripts/debug/aimarket.ts [all|faker|adc|lcs|season] [seed]
//   faker  — as Gen.G, sign T1's Faker in the first window; who do T1 sign, and what follows?
//   adc    — as Gen.G, sign the best LPL bot laner
//   lcs    — an LCS club releases its starting jungler
//   season — full 2026 year: tier-1 lineups before vs after the 2026 off-season window, stand-ins, move counts
// TRACE=<team id> prints that club's shortlists and why candidates were passed over (e.g. TRACE=t1-lck).
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, ageOn, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { makeOffer, askingFee, salaryDemand, movePlayer, interest, offerRenewal } from '../../src/engine/management/transfers';
import { AI_MOVES, AI_TRACE, aiNeeds, type AiMove } from '../../src/engine/management/aiSquad';
import { ROLES, type GameState, type Player, type Role, type Team } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const scenario = process.argv[2] ?? 'all';
const seed = Number(process.argv[3] ?? 12345);
const USER = 'gen-lck';

const ovr = (p: Player, r: Role = p.role) => overall(p.attributes, r);
const tierOf = (s: GameState, t: Team) => s.leagues[t.leagueId]?.tier ?? 3;
const $ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
const tname = (s: GameState, id?: string | null) => (id ? s.teams[id]?.short ?? id : 'FA');

AI_TRACE.team = process.env.TRACE; // e.g. TRACE=t1-lck: shortlists and why candidates were passed over
function newGame() { AI_MOVES.length = 0; AI_TRACE.out.length = 0; return createNewGame(db, USER, 'Tester', seed); }
const rng = new RNG(99);
function advance(s: GameState, until: string, onDay?: () => void) {
  while (s.date < until) {
    const m = processDay(s);
    if (m) { simulateSeries(s, m, rng, false); processDay(s); }
    endDay(s);
    onDay?.();
  }
}

type Snap = Record<string, Record<Role, { id: string; handle: string; ovr: number } | null>>;
function snapshot(s: GameState, filter: (t: Team) => boolean): Snap {
  const out: Snap = {};
  for (const t of Object.values(s.teams)) {
    if (!filter(t)) continue;
    out[t.id] = {} as Snap[string];
    for (const r of ROLES) {
      const p = t.lineup[r] ? s.players[t.lineup[r]!] : undefined;
      out[t.id][r] = p && p.teamId === t.id ? { id: p.id, handle: p.handle, ovr: ovr(p, r) } : null;
    }
  }
  return out;
}
const avg = (x: Snap[string]) => ROLES.reduce((a, r) => a + (x[r]?.ovr ?? 30), 0) / 5;
function lineupDiff(s: GameState, before: Snap, after: Snap, label: string) {
  console.log(`\n== ${label}: tier-1 lineups before → after (avg level, changed roles) ==`);
  const flags: string[] = [];
  let sumB = 0, sumA = 0, n = 0, changed = 0;
  const ids = Object.keys(before).sort((a, b) => (s.teams[a].leagueId + a).localeCompare(s.teams[b].leagueId + b));
  for (const id of ids) {
    const b = before[id], a = after[id];
    if (!a) continue;
    const t = s.teams[id];
    const diffs = ROLES.filter((r) => b[r]?.id !== a[r]?.id).map((r) => `${r}: ${b[r] ? `${b[r]!.handle} ${b[r]!.ovr}` : '—'} → ${a[r] ? `${a[r]!.handle} ${a[r]!.ovr}` : 'EMPTY'}`);
    sumB += avg(b); sumA += avg(a); n++;
    if (diffs.length) changed++;
    console.log(`  ${t.leagueId.padEnd(6)} ${t.short.padEnd(5)} ${avg(b).toFixed(1)} → ${avg(a).toFixed(1)}${t.id === s.userTeamId ? ' (user)' : ''}  ${diffs.join(' | ')}`);
    for (const r of ROLES) {
      if (!a[r]) flags.push(`${t.short} has no ${r}`);
      else if (b[r] && a[r]!.ovr < b[r]!.ovr - 8) flags.push(`${t.short} ${r}: ${a[r]!.handle} ${a[r]!.ovr} vs ${b[r]!.handle} ${b[r]!.ovr} before`);
    }
  }
  console.log(`  tier-1 average lineup level ${(sumB / n).toFixed(2)} → ${(sumA / n).toFixed(2)}; ${changed}/${n} lineups changed`);
  console.log(flags.length ? `  FLAGS (empty role / starter >8 below his predecessor):\n    ${flags.join('\n    ')}` : '  no empty roles, no starter >8 below his predecessor');
}
function moveLine(s: GameState, m: AiMove) {
  const p = s.players[m.player];
  const age = p ? Math.floor(ageOn(p.birthdate, m.date) ?? 0) : 0;
  const src = m.source === 'fa' ? (p?.generated && !p.career.length ? 'free agent (fictional)' : 'free agent') : m.source === 'sub' ? 'own sub' : m.source === 'academy' ? `academy ${tname(s, m.from)}` : m.source === 'buy' ? `from ${tname(s, m.from)}` : m.from ? `from ${tname(s, m.from)}` : '';
  const rep = m.replaces ? ` replacing ${s.players[m.replaces]?.handle ?? m.replaces}${m.prevOvr ? ` (${m.prevOvr})` : ''}` : m.prevOvr ? ` (was ${m.prevOvr})` : '';
  return `${m.date} ${tname(s, m.team).padEnd(5)} ${m.kind.padEnd(7)} ${m.role.padEnd(7)} ${m.handle} ${m.ovr} (age ${age}) ${src}${m.fee ? ` fee ${$(m.fee)}${m.clause ? ' (clause)' : ''}` : ''}${rep}`;
}
/** A departure → the replacement → the replacement's old club's replacement → … */
function chain(s: GameState, teamId: string, lostId: string) {
  const out: AiMove[] = [];
  let team = teamId, lost = lostId;
  for (let i = 0; i < 12; i++) {
    const m = AI_MOVES.find((x) => x.team === team && x.replaces === lost && x.kind !== 'release' && x.kind !== 'demote');
    if (!m) break;
    out.push(m);
    if ((m.source !== 'buy' && m.source !== 'academy') || !m.from) break;
    team = m.from; lost = m.player;
  }
  return out;
}
function summary(s: GameState, from: string, to = '9999') {
  const ms = AI_MOVES.filter((m) => m.date >= from && m.date <= to);
  const by: Record<string, number> = {};
  for (const m of ms) by[`${m.kind}/${m.source}`] = (by[`${m.kind}/${m.source}`] ?? 0) + 1;
  const fees = ms.reduce((a, m) => a + m.fee, 0);
  const gen = ms.filter((m) => m.source === 'fa' && s.players[m.player]?.generated && !s.players[m.player]?.career.length).length;
  console.log(`  AI moves ${from}…${to}: ${ms.length} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}); fees ${$(fees)}; fictional FA signings ${gen}`);
  const depth: Record<number, number> = {};
  for (const m of ms) if (m.kind === 'replace' && m.source === 'buy') depth[m.depth ?? 0] = (depth[m.depth ?? 0] ?? 0) + 1;
  console.log(`  replacement buys by domino depth ${JSON.stringify(depth)}; release clauses triggered ${ms.filter((m) => m.clause).length}`);
  const t1 = ms.filter((m) => tierOf(s, s.teams[m.team]) === 1 && m.kind !== 'release' && m.kind !== 'demote');
  if (t1.length) console.log(`  tier-1 signings:\n    ${t1.map((m) => moveLine(s, m)).join('\n    ')}`);
}
const standIns = (s: GameState) => Object.keys(s.players).filter((id) => id.startsWith('standin_'));

/** The user signs `p` the realistic way (offer at the asking fee; retried a few times), else forced. */
function userSigns(s: GameState, p: Player) {
  const user = s.teams[s.userTeamId];
  for (let i = 0; i < 4 && p.teamId !== user.id; i++) {
    const owner = s.teams[p.teamId!];
    const o = makeOffer(s, p.id, Math.round(askingFee(s, p, owner) * 1.08 / 5000) * 5000, Math.round(salaryDemand(s, p, user) * 1.2 / 1000) * 1000, 2);
    for (let d = 0; d < 5 && o.status === 'pending'; d++) advance(s, nextDay(s.date));
    console.log(`  ${s.date} offer ${i + 1} for ${p.handle}: ${o.status}${o.message ? ` — ${o.message}` : ''} (interest ${interest(s, p, user).toFixed(2)})`);
  }
  if (p.teamId !== user.id) {
    const fee = askingFee(s, p, s.teams[p.teamId!]);
    movePlayer(s, p, user, salaryDemand(s, p, user), 2, fee);
    console.log(`  ${s.date} forced: ${p.handle} joins ${user.short} for ${$(fee)}`);
  }
}
const nextDay = (d: string) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

function departureScenario(title: string, pick: (s: GameState) => Player, how: 'user' | 'release') {
  console.log(`\n################ ${title} ################`);
  const s = newGame();
  const t0 = Date.now();
  const p = pick(s);
  const club = s.teams[p.teamId!];
  const role = p.role;
  const before = snapshot(s, (t) => tierOf(s, t) === 1);
  console.log(`  ${club.name} (${club.leagueId}, prestige ${club.prestige}, balance ${$(club.balance)}) lose ${p.handle} (${role}, ${ovr(p)}), value ${$(p.value)}`);
  const start = s.date;
  if (how === 'user') userSigns(s, p);
  else { console.log(`  ${s.date} ${club.short} terminate ${p.handle}'s contract`); movePlayer(s, p, null, 0, 0); }
  const left = s.date;
  console.log(`  open needs right after: ${aiNeeds(s, club.id).map((n) => `${n.role} (level ${n.level}, due ${n.due})`).join(', ') || 'none'}`);
  advance(s, '2026-01-16');
  const c = chain(s, club.id, p.id);
  if (!c.length) console.log(`  !! ${club.short} made no replacement move; lineup ${role}: ${s.teams[club.id].lineup[role] ? s.players[s.teams[club.id].lineup[role]!].handle : 'EMPTY'}`);
  else {
    const m = c[0], r = s.players[m.player];
    console.log(`  → ${club.short}'s replacement: ${r.handle} (${r.name}, ${r.country}), ${m.ovr} at ${role}, ${m.source === 'buy' ? `bought from ${tname(s, m.from)} for ${$(m.fee)}` : m.source === 'academy' ? `promoted from ${tname(s, m.from)}` : m.source === 'sub' ? 'own sub' : 'free agent'} on ${m.date} (${Math.round((Date.parse(m.date) - Date.parse(left)) / 864e5)} days after the departure)`);
    console.log(`  domino chain (${c.length} moves):\n    ${c.map((x) => moveLine(s, x)).join('\n    ')}`);
  }
  if (how === 'release') console.log(`  released ${p.handle} is now at ${tname(s, p.teamId)}`);
  const news = s.news.filter((n) => n.date >= start && n.tags.includes('transfer') && (n.teamIds?.includes(club.id) || c.some((m) => n.playerIds?.includes(m.player)))).slice(0, 8);
  console.log(`  news:\n    ${news.reverse().map((n) => `${n.date} ${n.headline} — ${n.body}`).join('\n    ')}`);
  summary(s, start, '2026-01-16');
  lineupDiff(s, before, snapshot(s, (t) => tierOf(s, t) === 1), `${title}, first window (${start} → ${s.date})`);
  if (AI_TRACE.team) console.log(`  trace ${AI_TRACE.team}:\n    ${AI_TRACE.out.join('\n    ')}`);
  console.log(`  stand-ins created: ${standIns(s).length}${standIns(s).length ? ` (${standIns(s).slice(0, 8).join(', ')})` : ''}; ${Date.now() - t0} ms`);
}

if (scenario === 'all' || scenario === 'faker') departureScenario('Gen.G sign Faker', (s) => Object.values(s.players).find((p) => p.handle === 'Faker' && p.teamId === 't1-lck')!, 'user');
if (scenario === 'all' || scenario === 'adc') departureScenario('Gen.G sign the best LPL bot laner', (s) => {
  const ps = Object.values(s.teams).filter((t) => t.leagueId === 'LPL').map((t) => s.players[t.lineup.adc!]).filter(Boolean);
  return ps.sort((a, b) => ovr(b) - ovr(a))[0];
}, 'user');
if (scenario === 'all' || scenario === 'lcs') departureScenario('An LCS club releases its jungler', (s) => {
  const ps = Object.values(s.teams).filter((t) => t.leagueId === 'LCS').map((t) => s.players[t.lineup.jungle!]).filter(Boolean);
  return ps.sort((a, b) => ovr(b) - ovr(a))[0];
}, 'release');

if (scenario === 'all' || scenario === 'season') {
  console.log('\n################ full year: 2026 season + the 2026 off-season window ################');
  const s = newGame();
  const t0 = Date.now();
  let emptyAtMatch = 0;
  const seen = new Set<string>();
  const check = () => { // any AI team about to play with an empty slot?
    for (const f of Object.values(s.fixtures)) {
      if (f.result || f.date !== s.date || !f.teamA || !f.teamB) continue;
      for (const id of [f.teamA, f.teamB]) {
        const t = s.teams[id];
        if (t && ROLES.some((r) => !t.lineup[r] || s.players[t.lineup[r]!]?.teamId !== t.id) && !seen.has(id + s.date)) {
          seen.add(id + s.date); emptyAtMatch++;
          if (emptyAtMatch <= 5) console.log(`  ! ${s.date} ${t.short} (${t.leagueId}) plays with an empty slot: ${ROLES.filter((r) => !t.lineup[r] || s.players[t.lineup[r]!]?.teamId !== t.id).join(',')}, roster ${t.roster.length}`);
        }
      }
    }
  };
  let before: Snap = {};
  advance(s, '2026-11-10', check);
  { const t = s.teams[USER]; for (const id of t.roster) { const p = s.players[id]; if (p.contract && p.contract.expires <= '2026-11-18') offerRenewal(s, id, Math.round(salaryDemand(s, p, t) * 1.1), 2); } } // like season-test
  advance(s, '2026-11-14', check);
  summary(s, '2026-01-01', '2026-11-14');
  before = snapshot(s, (t) => tierOf(s, t) === 1);
  const allBefore = snapshot(s, () => true);
  advance(s, '2027-01-16', check);
  summary(s, '2026-11-15', '2027-01-16');
  lineupDiff(s, before, snapshot(s, (t) => tierOf(s, t) === 1), '2026 off-season window (Nov 14 → Jan 16)');
  const allAfter = snapshot(s, () => true);
  let emptyNow = 0, lower = 0;
  for (const [id, a] of Object.entries(allAfter)) {
    if (id === s.userTeamId) continue;
    for (const r of ROLES) { if (!a[r]) emptyNow++; else if (allBefore[id]?.[r] && a[r]!.ovr < allBefore[id][r]!.ovr - 8) lower++; }
  }
  const sizes: Record<number, number> = {};
  let stacked = 0;
  for (const t of Object.values(s.teams)) {
    sizes[t.roster.length] = (sizes[t.roster.length] ?? 0) + 1;
    if (t.id !== s.userTeamId && ROLES.some((r) => t.roster.filter((id) => s.players[id]?.role === r).length >= 3)) stacked++;
  }
  console.log(`  all ${Object.keys(allAfter).length} teams: ${emptyNow} empty AI slots now, ${lower} AI starters >8 below their predecessor; AI teams with 3+ at a role: ${stacked}`);
  console.log(`  roster sizes`, sizes);
  console.log(`  AI team-days with an empty slot on a match day: ${emptyAtMatch}; stand-ins created: ${standIns(s).length} ${standIns(s).join(',')}`);
  const fa = Object.values(s.players).filter((p) => !p.teamId && !p.retired && !p.id.startsWith('standin_'));
  const topFa = fa.sort((a, b) => ovr(b) - ovr(a)).slice(0, 10);
  console.log(`  free agents left: ${fa.length}; best: ${topFa.map((p) => `${p.handle}/${p.role} ${ovr(p)}${p.generated ? '*' : ''}`).join(', ')}`);
  const bal = Object.values(s.teams).filter((t) => tierOf(s, t) === 1 && t.id !== s.userTeamId).map((t) => t.balance).sort((a, b) => a - b);
  if (AI_TRACE.team) console.log(`  trace ${AI_TRACE.team}:\n    ${AI_TRACE.out.slice(0, 80).join('\n    ')}`);
  console.log(`  tier-1 AI balances: min ${$(bal[0])}, median ${$(bal[bal.length >> 1])}, max ${$(bal[bal.length - 1])}; ${Date.now() - t0} ms`);
}
