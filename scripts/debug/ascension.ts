// Paths up the pyramid, headless: a season (or more) with the user as a lower-league club.
//   npx tsx scripts/debug/ascension.ts [teamId] [years] — env STRONG=1 boosts the user's lineup, AUTO=title|cobrand|decline
// Reports promotion series, big-brand offers (user + AI), league-spot sales, rollover moves and league sizes.
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { processDay, endDay, POOL_CACHE } from '../../src/engine/game';
import { simulateSeries } from '../../src/engine/season/series';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { ascState, acceptAscension, declineAscension, offerLive, pathUp } from '../../src/engine/management/ascension';
import { sales } from '../../src/engine/management/franchise';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const teamId = process.argv[2] || db.teams.find((t) => t.leagueId === 'PRM1')!.id;
const years = Number(process.argv[3] ?? 1);
const s = createNewGame(db, teamId, 'Tester', 4242);
s.settings = { ...s.settings, autoSave: false } as never;
const user = s.teams[teamId];
if (process.env.STRONG === '1') for (const id of Object.values(user.lineup)) { const p = id ? s.players[id] : null; if (p) for (const k of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) if (k !== 'aggression') p.attributes[k] += 30; }
const auto = process.env.AUTO ?? 'title';
const sizes = () => { const n: Record<string, number> = {}; for (const t of Object.values(s.teams)) n[t.leagueId] = (n[t.leagueId] ?? 0) + 1; return n; };
const before = sizes();
console.log(`user ${user.name} (${user.leagueId}) balance ${Math.round(user.balance / 1e3)}k`);
const rng = new RNG(7);
const startYear = Number(s.date.slice(0, 4));
for (let y = 1; y <= years; y++) {
  const until = `${startYear + y}-01-05`;
  while (s.date < until) {
    const m = processDay(s);
    if (m) { simulateSeries(s, m, rng, false); processDay(s); }
    for (const o of ascState(s).offers) if (o.teamId === s.userTeamId && offerLive(s, o)) {
      let r = auto === 'decline' ? declineAscension(s, o.id) : acceptAscension(s, o.id, auto as 'title' | 'cobrand');
      if (!r.ok && offerLive(s, o)) r = declineAscension(s, o.id); // couldn't afford it: say no (once)
      console.log(`  ${s.date} USER OFFER from ${o.brand}: ${o.reason} → ${o.options.map((x) => `${x.style} "${x.name}" pays ${Math.round(x.teamPays / 1e3)}k`).join(' | ')} → ${r.message}`);
    }
    if (s.date.slice(5) === '11-30') {
      const pu = pathUp(s, s.teams[s.userTeamId]);
      console.log(`  ${s.date} pre-rollover: user in ${s.teams[s.userTeamId].leagueId} as "${s.teams[s.userTeamId].name}" balance ${Math.round(s.teams[s.userTeamId].balance / 1e3)}k, open sales ${pu.sales.length}, deal ${pu.deal?.slot?.status ?? '-'}`);
    }
    endDay(s);
  }
  const a = ascState(s);
  console.log(`== after year ${y}: brand offers ${a.offers.length} (accepted ${a.offers.filter((o) => o.status === 'accepted').length})`);
  for (const o of a.offers.filter((o) => o.date.startsWith(String(startYear + y - 1)))) console.log(`   ${o.date} ${o.brand.padEnd(16)} → ${s.teams[o.teamId]?.name} (${o.fromLeague}→${o.targetLeague}) ${o.status}${o.accepted ? ' ' + o.accepted : ''}`);
  const promos = Object.values(s.competitions).filter((c) => c.season === startYear + y - 1 && c.seedRule?.startsWith('promotion:'));
  for (const c of promos) console.log(`   promo ${c.name.padEnd(30)} ${c.status} teams ${c.teams.map((t) => s.teams[t]?.short).join(',')} winner ${c.winner ? s.teams[c.winner]?.short : '-'}`);
  const sl = sales(s).filter((x) => x.id);
  console.log(`   spot sales so far: ${sl.length} (${sl.map((x) => `${x.league}:${s.teams[x.sellerId]?.short}${x.buyerId ? '→' + s.teams[x.buyerId]?.short : ''}`).join(' ')})`);
  const after = sizes();
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  console.log(`   league sizes changed: ${changed.length ? changed.map((k) => `${k} ${before[k]}→${after[k]}`).join(', ') : 'none'}`);
  const u = s.teams[s.userTeamId];
  console.log(`   user now "${u.name}" [${u.short}] in ${u.leagueId} balance ${Math.round(u.balance / 1e3)}k deal ${u.brandDeal ? `${u.brandDeal.brand} until ${u.brandDeal.until} slot ${u.brandDeal.slot?.status}` : '-'}`);
  const branded = Object.values(s.teams).filter((t) => t.brandDeal);
  console.log(`   branded clubs: ${branded.map((t) => `${t.name} (${t.leagueId})`).join(', ') || 'none'}`);
}
