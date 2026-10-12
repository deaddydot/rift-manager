// Builds the game database (leagues, teams, players, staff, match history, pro meta)
// from the raw Leaguepedia pulls in data-raw/esports.
//
// Ratings model:
//  1. Team strength = Elo over every 2026 game (cross-region results from First Stand,
//     MSI, EWC, KeSPA Cup and EMEA Masters calibrate league strength), seeded by league priors.
//  2. Each player's level = their team's rating adjusted by individual performance
//     relative to same-role peers in the same league (z-scores).
//  3. Attributes, hidden attributes and traits are derived from specific stat lines.
//  4. Career history (gol.gg 2024-2025, when data-raw/esports/golgg_history.json exists): each
//     earlier season gives a level = that year's league strength + team success + individual
//     performance vs same-league, same-role peers (and international events vs their field).
//     The 2026 level is blended with these, weighted by games and recency, so stars on weaker
//     2026 teams and players with long track records aren't judged on one season alone.
//  5. Hand-curated overrides (scripts/data/player-overrides.json) adjust famous players; their
//     final attributes are pinned in scripts/data/curated-attributes.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LEAGUES } from './data/leagues.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data-raw/esports');
const OUT = path.join(ROOT, 'public/data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const overridesFile = path.join(ROOT, 'scripts/data/player-overrides.json');
const OVERRIDES = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
const TODAY = '2026-10-09';
const curatedFile = path.join(ROOT, 'scripts/data/curated-attributes.json');
const CURATED = fs.existsSync(curatedFile) ? JSON.parse(fs.readFileSync(curatedFile, 'utf8')) : {};

// deterministic pseudo-random per string
function rnd(seed) {
  let h = crypto.createHash('md5').update(seed).digest().readUInt32LE(0);
  return () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const normal = (r) => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ROLE_MAP = { Top: 'top', Jungle: 'jungle', Mid: 'mid', Bot: 'adc', Support: 'support' };

// ------------------------------------------------------------------ champions
const champs = JSON.parse(fs.readFileSync(path.join(OUT, 'champions.json'), 'utf8')).champions;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const champByName = {};
for (const c of champs) { champByName[norm(c.name)] = c.id; champByName[norm(c.id)] = c.id; }
Object.assign(champByName, { nunu: 'Nunu', nunuwillump: 'Nunu', wukong: 'MonkeyKing', renata: 'Renata', renataglasc: 'Renata', drmundo: 'DrMundo', kogmaw: 'KogMaw', reksai: 'RekSai', leblanc: 'Leblanc', belveth: 'Belveth', chogath: 'Chogath', kaisa: 'Kaisa', khazix: 'Khazix', velkoz: 'Velkoz', ksante: 'KSante' });
const champId = (n) => champByName[norm(n ?? '')] ?? null;

// ------------------------------------------------------------------ teams & redirects
const teamsInfo = read('teams_info.json');
const redirect = {};
for (const r of teamsInfo.redirects) redirect[r.AllName] = r.Page;
const teamPage = (name) => redirect[name] ?? name;
const teamInfoByPage = {};
for (const t of teamsInfo.teams) teamInfoByPage[t.OverviewPage] = t;

// ------------------------------------------------------------------ games
const leagueOfLp = {};
for (const l of LEAGUES) for (const n of l.lp) leagueOfLp[n] = l.id;
const allGames = [];
const allRows = [];
for (const g of [...LEAGUES.map((l) => l.id), 'INTL']) {
  const f = path.join(RAW, `games_${g}.json`);
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const x of d.games) { x._group = g; allGames.push(x); }
  for (const x of d.players) { x._group = g; allRows.push(x); }
}
const gameById = {};
for (const g of allGames) gameById[g.GameId] = g;
allGames.sort((a, b) => a.Date.localeCompare(b.Date));
console.log(`${allGames.length} games, ${allRows.length} player rows`);

// ------------------------------------------------------------------ Elo
const PRIOR = { LCK: 1800, LPL: 1790, LEC: 1650, LCS: 1600, LCP: 1605, CBLOL: 1540, LCKCL: 1560, NACL: 1420, CD: 1400, LJL: 1420, VCS: 1470, PCS: 1430, LFL: 1490, PRM: 1470, LES: 1460, TCL: 1440, NLC: 1440, RL: 1430, LIT: 1400, ROL: 1420, HLL: 1390, EBL: 1390, HM: 1400, LPLOL: 1380, AL: 1390, LCKAS: 1430, PRM1: 1360, HCC: 1290, AL2: 1260, HC: 1310, NEXUS: 1330, BAS: 1330, LRN: 1310, LRS: 1310 };
const rosters = read('rosters.json');
const teamLeague = {};
for (const [lid, r] of Object.entries(rosters)) for (const t of r.teams) teamLeague[teamPage(t.Team)] = lid;
// also attribute teams seen in league games
for (const g of allGames) {
  const lid = leagueOfLp[g.League];
  if (!lid) continue;
  for (const tn of [g.Team1, g.Team2]) { const p = teamPage(tn); if (!teamLeague[p]) teamLeague[p] = lid; }
}
const elo = {};
const eloGames = {};
const getElo = (p) => (elo[p] ??= PRIOR[teamLeague[p]] ?? 1350);
for (const g of allGames) {
  const a = teamPage(g.Team1), b = teamPage(g.Team2);
  if (!g.WinTeam) continue;
  const ra = getElo(a), rb = getElo(b);
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const sa = teamPage(g.WinTeam) === a ? 1 : 0;
  const intl = g._group === 'INTL' || leagueOfLp[g.League] === undefined;
  const K = intl ? 28 : 14;
  elo[a] = ra + K * (sa - ea);
  elo[b] = rb + K * ((1 - sa) - (1 - ea));
  eloGames[a] = (eloGames[a] ?? 0) + 1; eloGames[b] = (eloGames[b] ?? 0) + 1;
}
// shrink teams with few games toward their league prior
for (const p of Object.keys(elo)) {
  const n = eloGames[p] ?? 0, prior = PRIOR[teamLeague[p]] ?? 1350;
  elo[p] = prior + (elo[p] - prior) * Math.min(1, n / 25);
}
// Anchor: regional ecosystems mostly play themselves, so raw Elo spreads drift. Final strength =
// league strength (prior, nudged by the league's mean drift) + damped in-league offset by tier.
{
  const byLeague = {};
  for (const [p, l] of Object.entries(teamLeague)) if (elo[p] !== undefined) (byLeague[l] ??= []).push(p);
  const SPREAD = { 1: 0.85, 2: 0.45, 3: 0.35 };
  const tierOf = (l) => LEAGUES.find((x) => x.id === l)?.tier ?? 3;
  const anchored = {};
  for (const [l, ps] of Object.entries(byLeague)) {
    const mean = ps.reduce((s, p) => s + elo[p], 0) / ps.length;
    const strength = PRIOR[l] + (mean - PRIOR[l]) * (tierOf(l) === 1 ? 0.6 : 0.25);
    for (const p of ps) anchored[p] = strength + (elo[p] - mean) * SPREAD[tierOf(l)];
  }
  Object.assign(elo, anchored);
}
// Elo -> 0..100 team rating (top LPL/LCK ~84-86, tier 3 ~35-45)
const teamRating = (p) => clamp(30 + ((elo[p] ?? PRIOR[teamLeague[p]] ?? 1350) - 1250) * 0.078, 25, 90);

// ------------------------------------------------------------------ per-player game lines
const lines = {}; // link -> [line]
for (const r of allRows) {
  const g = gameById[r.GameId];
  if (!g || !r.Link) continue;
  const role = ROLE_MAP[r.Role];
  if (!role) continue;
  const len = Number(g.Length) || 30;
  const k = +r.Kills || 0, d = +r.Deaths || 0, a = +r.Assists || 0;
  const tk = Math.max(1, +r.TeamKills || 0), tg = Math.max(1, +r.TeamGold || 1);
  const isT1 = teamPage(r.Team) === teamPage(g.Team1);
  const vs = isT1 ? g.Team2 : g.Team1;
  const teamDeaths = isT1 ? +g.Team2Kills || 1 : +g.Team1Kills || 1;
  (lines[r.Link] ??= []).push({
    date: g.Date.slice(0, 10), event: g.Tournament, team: teamPage(r.Team), vs: teamPage(vs), champion: champId(r.Champion), role,
    k, d, a, cs: +r.CS || 0, gold: +r.Gold || 0, dmg: +r.DamageToChampions || 0, vs_: +r.VisionScore || 0,
    win: r.PlayerWin === 'Yes', len, kp: (k + a) / tk, goldShare: (+r.Gold || 0) / tg, deathShare: d / Math.max(1, teamDeaths),
    group: g._group, league: leagueOfLp[g.League] ?? 'INTL', playoff: /playoff|final|knockout|bracket|road to/i.test(g.OverviewPage + ' ' + g.Tournament),
    teamDragons: isT1 ? +g.Team1Dragons || 0 : +g.Team2Dragons || 0, oppDragons: isT1 ? +g.Team2Dragons || 0 : +g.Team1Dragons || 0,
    teamGrubs: isT1 ? +g.Team1VoidGrubs || 0 : +g.Team2VoidGrubs || 0, oppGrubs: isT1 ? +g.Team2VoidGrubs || 0 : +g.Team1VoidGrubs || 0,
  });
}
// team damage totals for damage share
const teamDmg = {};
for (const r of allRows) { const key = r.GameId + '|' + teamPage(r.Team); teamDmg[key] = (teamDmg[key] ?? 0) + (+r.DamageToChampions || 0); }
for (const r of allRows) {
  const l = lines[r.Link]?.find((x) => x.date === gameById[r.GameId]?.Date.slice(0, 10) && x.team === teamPage(r.Team) && x.champion === champId(r.Champion));
  if (l) l.dmgShare = (+r.DamageToChampions || 0) / Math.max(1, teamDmg[r.GameId + '|' + teamPage(r.Team)]);
}

// ------------------------------------------------------------------ aggregates & league-role baselines
function agg(ls) {
  const n = ls.length;
  const mins = ls.reduce((s, l) => s + l.len, 0) || 1;
  const sum = (f) => ls.reduce((s, l) => s + f(l), 0);
  const deaths = sum((l) => l.d);
  const perf = ls.map((l) => (l.k * 2 + l.a - l.d * 1.5) / Math.max(1, l.len / 10) + l.kp * 5);
  const pm = perf.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const pvar = Math.sqrt(perf.reduce((a, b) => a + (b - pm) ** 2, 0) / Math.max(1, n));
  const champsSet = new Set(ls.map((l) => l.champion).filter(Boolean));
  const playoff = ls.filter((l) => l.playoff || l.group === 'INTL');
  const regular = ls.filter((l) => !(l.playoff || l.group === 'INTL'));
  const perfOf = (arr) => arr.length ? arr.reduce((s, l) => s + (l.k * 2 + l.a - l.d * 1.5) / Math.max(1, l.len / 10) + l.kp * 5 + (l.win ? 2 : 0), 0) / arr.length : null;
  return {
    games: n, wins: sum((l) => (l.win ? 1 : 0)),
    kda: (sum((l) => l.k) + sum((l) => l.a)) / Math.max(1, deaths),
    kp: sum((l) => l.kp) / n, csm: sum((l) => l.cs) / mins, gpm: sum((l) => l.gold) / mins, dpm: sum((l) => l.dmg) / mins,
    vspm: sum((l) => l.vs_) / mins, dmgShare: sum((l) => l.dmgShare ?? 0.2) / n, goldShare: sum((l) => l.goldShare) / n,
    deathShare: sum((l) => l.deathShare) / n, actionPm: (sum((l) => l.k) + deaths) / mins,
    pvar: pvar / Math.max(1, Math.abs(pm)), uniqueChamps: champsSet.size,
    clutchDelta: playoff.length >= 6 && regular.length >= 6 ? perfOf(playoff) - perfOf(regular) : 0,
    playoffGames: playoff.length,
    dragonShare: sum((l) => l.teamDragons) / Math.max(1, sum((l) => l.teamDragons + l.oppDragons)),
    grubShare: sum((l) => l.teamGrubs) / Math.max(1, sum((l) => l.teamGrubs + l.oppGrubs)),
  };
}
const METRICS = ['kda', 'kp', 'csm', 'gpm', 'dpm', 'vspm', 'dmgShare', 'goldShare', 'deathShare', 'actionPm', 'pvar', 'uniqueChamps', 'clutchDelta', 'dragonShare', 'grubShare'];

// ------------------------------------------------------------------ build teams & rosters
const leaguesOut = [];
const teamsOut = [];
const playersOut = [];
const staffOut = [];
const historyOut = {};
const playersInfo = {};
for (const p of read('players_info.json')) playersInfo[p.OverviewPage] = p;
const images = {};
for (const im of read('player_images.json')) (images[im.Link] ??= []).push(im);

function imageUrl(fileName, width = 200) {
  if (!fileName) return null;
  const n = fileName.replace(/ /g, '_');
  const h = crypto.createHash('md5').update(n).digest('hex');
  return `https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n)}/revision/latest/scale-to-width-down/${width}`;
}
function bestImage(link) {
  const ims = (images[link] ?? []).filter((i) => i.FileName && !/logo|\.gif$/i.test(i.FileName));
  if (!ims.length) return playersInfo[link]?.Image || null;
  const year = (f) => Number((f.match(/20\d\d/) ?? ['0'])[0]);
  const score = (i) => year(i.FileName) * 10 + (i.IsProfileImage === '1' ? 3 : 0) + (/headshot/i.test(i.ImageType) ? 2 : 0) + (/split 3|summer|wc|worlds/i.test(i.FileName) ? 1 : 0) + (/split 2|msi/i.test(i.FileName) ? 0.5 : 0);
  return ims.sort((a, b) => score(b) - score(a))[0].FileName;
}

const usedTeamIds = new Set();
const playerTeam = {};
for (const league of LEAGUES) {
  const r = rosters[league.id];
  leaguesOut.push({ id: league.id, name: league.name, fullName: league.fullName, tier: league.tier, region: league.region, country: league.country, franchised: !!league.franchised, parent: league.parent ?? null, source: r?.tournamentName ?? null });
  if (!r) continue;
  for (const t of r.teams) {
    const page = teamPage(t.Team);
    const info = teamInfoByPage[page] ?? teamInfoByPage[t.Team] ?? {};
    let id = slug(info.Short && info.Short.length >= 2 && info.Short.length <= 5 ? `${info.Short}-${league.id}` : page);
    if (!id) id = slug(t.Team) || 'team';
    while (usedTeamIds.has(id)) id += '-2';
    usedTeamIds.add(id);
    const links = t.RosterLinks.split(';;');
    const roles = t.Roles.split(';;');
    const flags = (t.Flags ?? '').split(';;');
    const rating = teamRating(page);
    const record = allGames.filter((g) => (teamPage(g.Team1) === page || teamPage(g.Team2) === page) && leagueOfLp[g.League] === league.id);
    const wins = record.filter((g) => teamPage(g.WinTeam) === page).length;
    const team = {
      id, name: info.Name || t.Team, short: (info.Short || t.Team.slice(0, 3)).toUpperCase().slice(0, 5), page, leagueId: league.id, region: league.region,
      country: info.Location || info.TeamLocation || league.country,
      logoFile: info.Image || null, logoUrl: imageUrl(info.Image, 120), elo: Math.round(elo[page] ?? PRIOR[league.id]), rating: Math.round(rating),
      realRecord: { wins, losses: record.length - wins, games: record.length },
      roster: [], lineup: {}, staff: [],
    };
    // players (role from roster; starters = most games for that role on this team in 2026)
    const rolePlayers = {};
    links.forEach((link, i) => {
      const roleName = roles[i];
      if (!link) return;
      if (roleName === 'Coach' || /coach|analyst|manager/i.test(roleName ?? '')) {
        const sid = 'staff-' + slug(link);
        if (!staffOut.find((s) => s.id === sid)) {
          const pinfo = playersInfo[link] ?? {};
          staffOut.push({ id: sid, handle: link.replace(/\s*\(.*\)/, ''), name: pinfo.Name || '', country: flags[i] || league.country, teamId: id, link, role: team.staff.length === 0 ? 'headCoach' : 'coach' });
        }
        team.staff.push(sid);
        return;
      }
      const role = ROLE_MAP[roleName];
      if (!role) return;
      (rolePlayers[role] ??= []).push(link);
    });
    for (const [role, ls] of Object.entries(rolePlayers)) {
      const games = (l) => (lines[l] ?? []).filter((x) => x.team === page).length;
      ls.sort((a, b) => games(b) - games(a));
      team.lineup[role] = 'p:' + ls[0];
      for (const l of ls) { if (!playerTeam[l]) { playerTeam[l] = { teamId: id, role, league: league.id, teamPage: page, rating, isSub: l !== ls[0] }; team.roster.push('p:' + l); } }
    }
    teamsOut.push(team);
  }
}

// baselines by league tier + role for z-scores (use players with >= 5 games)
const baselines = {};
for (const [link, pt] of Object.entries(playerTeam)) {
  const ls = (lines[link] ?? []).filter((l) => l.role === pt.role);
  if (ls.length < 5) continue;
  const a = agg(ls);
  const key = `${pt.league}|${pt.role}`;
  (baselines[key] ??= []).push(a);
  (baselines[`tier${LEAGUES.find((l) => l.id === pt.league).tier}|${pt.role}`] ??= []).push(a);
}
const stat = {};
for (const [key, arr] of Object.entries(baselines)) {
  stat[key] = {};
  for (const m of METRICS) {
    const vals = arr.map((a) => a[m]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1e-6;
    stat[key][m] = { mean, sd };
  }
}

// ------------------------------------------------------------------ career history (gol.gg 2024-2025)
const HIST_FILE = path.join(RAW, 'golgg_history.json');
const HISTORY = fs.existsSync(HIST_FILE) ? JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')) : null;
// league strength in earlier years (PCS/VCS were major regions in 2024; LTA North/South in 2025)
const YEAR_PRIOR = {
  2024: { LCK: 1800, LPL: 1800, LEC: 1660, LCS: 1600, PCS: 1580, VCS: 1560, CBLOL: 1520, LJL: 1470, LCKCL: 1560, NACL: 1430, CD: 1400 },
  2025: { LCK: 1810, LPL: 1790, LEC: 1650, LCS: 1600, CBLOL: 1530, LTA: 1570, LCP: 1600, PCS: 1440, VCS: 1480, LJL: 1420, LCKCL: 1560 },
};
const INTL_ELO = { worlds: 1720, msi: 1730, ewc: 1700, firststand: 1720, emeamasters: 1480, kespa: 1700 };
const eloRating = (e) => clamp(30 + (e - 1250) * 0.078, 25, 90);
const NATION_CODE = { 'South Korea': ['KR'], China: ['CN', 'HK'], Taiwan: ['TW', 'HK'], Vietnam: ['VN'], Japan: ['JP'], Brazil: ['BR'], 'Hong Kong': ['HK', 'CN'] };
const HIST_METRICS = ['kda', 'kp', 'csm', 'dmgShare', 'goldShare', 'dpm', 'vspm', 'gd15', 'csd15'];
const careerOf = {}; // link -> [{ year, key, games, level, intl, z }]
if (HISTORY) {
  // match gol.gg names to our players (handle, case/punctuation-insensitive); duplicates by region
  const normName = (x) => x.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = {};
  for (const link of Object.keys(playerTeam)) (byName[normName(link.replace(/\s*\(.*\)/, ''))] ??= []).push(link);
  const regionOf = (lg) => LEAGUES.find((l) => l.id === lg)?.region;
  const buckets = {}; // `${year}|${key}` -> link -> { games, sums }
  for (const tn of HISTORY.tournaments) {
    const key = tn.league === 'INTL' ? `INTL:${tn.event ?? tn.name}` : tn.league;
    for (const row of tn.rows) {
      if (!row.games) continue;
      const cands = byName[normName(row.player)] ?? [];
      const link = cands.length === 1 ? cands[0] : cands.find((l) => regionOf(playerTeam[l].league) === regionOf(tn.league));
      if (!link) continue;
      // same handle, different person: reject when the nationality is known and disagrees
      const nat = NATION_CODE[playersInfo[link]?.Country || playersInfo[link]?.NationalityPrimary || ''];
      if (nat && row.country && !nat.includes(row.country)) continue;
      const s = ((buckets[`${tn.year}|${key}`] ??= {})[link] ??= { games: 0, sums: {}, n: {} });
      s.games += row.games;
      for (const m of [...HIST_METRICS, 'winRate']) if (row[m] !== null && row[m] !== undefined) { s.sums[m] = (s.sums[m] ?? 0) + row[m] * row.games; s.n[m] = (s.n[m] ?? 0) + row.games; }
    }
  }
  for (const [bk, bucket] of Object.entries(buckets)) {
    const [yearS, key] = bk.split('|');
    const year = Number(yearS);
    const rows = Object.entries(bucket).map(([link, s]) => ({ link, role: playerTeam[link].role, games: s.games, v: Object.fromEntries(Object.keys(s.sums).map((m) => [m, s.sums[m] / s.n[m]])) }));
    const base = {};
    for (const role of ['top', 'jungle', 'mid', 'adc', 'support']) {
      const rr = rows.filter((x) => x.role === role && x.games >= 5);
      if (rr.length < 3) continue;
      base[role] = {};
      for (const m of HIST_METRICS) {
        const vals = rr.map((x) => x.v[m]).filter((v) => v !== undefined);
        if (vals.length < 3) continue;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1e-6;
        base[role][m] = { mean, sd };
      }
    }
    const intl = key.startsWith('INTL:');
    const elo = intl ? INTL_ELO[key.slice(5)] ?? 1650 : YEAR_PRIOR[year]?.[key] ?? PRIOR[key] ?? 1400;
    for (const x of rows) {
      const b = base[x.role];
      if (!b || x.games < 3) continue;
      const shrink = Math.min(1, x.games / 15);
      const z = {};
      for (const m of HIST_METRICS) z[m] = b[m] && x.v[m] !== undefined ? clamp((x.v[m] - b[m].mean) / b[m].sd * shrink, -2.5, 2.5) : 0;
      const perf = z.kda * 0.25 + z.kp * 0.1 + z.dmgShare * 0.15 + z.goldShare * 0.1 + z.csm * 0.1 + z.gd15 * 0.2 + z.csd15 * 0.1;
      const level = eloRating(elo) + ((x.v.winRate ?? 0.5) - 0.5) * 16 + perf * 6;
      (careerOf[x.link] ??= []).push({ year, key, games: x.games, level, intl, z });
    }
  }
  console.log(`career history: ${Object.keys(careerOf).length} players matched across ${Object.keys(buckets).length} league-seasons`);
}

// ------------------------------------------------------------------ players
const TRAITS = [];
const ageOf = (b) => (b ? (new Date(TODAY) - new Date(b)) / (365.25 * 864e5) : null);
for (const [link, pt] of Object.entries(playerTeam)) {
  const info = playersInfo[link] ?? {};
  const r = rnd(link);
  const ls = (lines[link] ?? []).sort((a, b) => b.date.localeCompare(a.date));
  const roleLines = ls.filter((l) => l.role === pt.role);
  const a = roleLines.length ? agg(roleLines) : null;
  const tier = LEAGUES.find((l) => l.id === pt.league).tier;
  const base = stat[`${pt.league}|${pt.role}`] ?? stat[`tier${tier}|${pt.role}`];
  const z = (m, invert = false) => {
    if (!a || !base?.[m]) return 0;
    const v = (a[m] - base[m].mean) / base[m].sd;
    const shrink = Math.min(1, roleLines.length / 15);
    return clamp((invert ? -v : v) * shrink, -2.5, 2.5);
  };
  const age = ageOf(info.Birthdate);
  // individual performance score relative to role peers
  const perfZ = (z('kda') * 0.25 + z('kp') * 0.15 + z('dmgShare') * 0.2 + z('goldShare') * 0.1 + z('csm') * 0.15 + z('deathShare', true) * 0.15);
  let L = pt.rating + perfZ * 4.5 + normal(r) * 1.5;
  // blend in earlier seasons (recency- and games-weighted)
  const career = careerOf[link] ?? [];
  const w26 = roleLines.length / (roleLines.length + 12);
  // a stronger track record lifts a player fully; weaker earlier seasons (a rookie who has since
  // broken out, a step up from a lower league) only pull down half as much — improvement is real
  const hw = career.map((h) => (h.year === 2025 ? 0.6 : 0.3) * (h.intl ? 0.8 : 1) * h.games / (h.games + 15) * (h.level < L ? 0.5 : 1));
  const hsum = hw.reduce((s2, w) => s2 + w, 0);
  if (hsum > 0) L = (L * w26 + career.reduce((s2, h, i) => s2 + h.level * hw[i], 0)) / (w26 + hsum);
  // per-stat z mixing 2026 with history where the stat exists
  const zm = (m, invert = false) => {
    if (!hsum || !HIST_METRICS.includes(m)) return z(m, invert);
    const hz = career.reduce((s2, h, i) => s2 + (h.z[m] ?? 0) * hw[i], 0) * (invert ? -1 : 1);
    return (z(m, invert) * w26 + hz) / (w26 + hsum);
  };
  if (pt.isSub) L -= 3;
  if (!a && !hsum) L -= 4 + r() * 4;
  const attr = (offset, sd = 2.5) => clamp(Math.round(L + offset + normal(r) * sd), 15, 99);
  const attributes = {
    mechanics: attr(zm('dmgShare') * 3.5 + zm('kda') * 2 + zm('dpm') * 1.5),
    laning: attr(zm('goldShare') * 3 + zm('csm') * 2 + zm('kda') * 1.2 + (pt.role === 'support' ? zm('kp') * 1.5 : 0)),
    farming: attr(zm('csm') * 5 + (pt.role === 'support' ? -2 : 0)),
    teamfight: attr(zm('kp') * 3 + zm('dmgShare') * 2 + z('deathShare', true) * 1.5),
    macro: attr((a ? (a.wins / a.games - 0.5) * 10 : 0) + normal(r) * 1.5),
    vision: attr(zm('vspm') * 5),
    pathing: attr(pt.role === 'jungle' ? z('kp') * 2.5 + z('grubShare') * 2.5 : z('kp') * 1.5 + (pt.role === 'support' || pt.role === 'mid' ? 1 : -1)),
    objectives: attr(z('dragonShare') * 3 + z('grubShare') * 1.5 + (pt.role === 'jungle' ? 2 : 0)),
    shotcalling: clamp(Math.round(L - 10 + (age ? clamp((age - 20) * 2.2, -6, 12) : 0) + (pt.role === 'support' || pt.role === 'jungle' ? 6 : pt.role === 'mid' ? 4 : 0) + normal(r) * 7), 15, 99),
    consistency: attr(z('pvar', true) * 4 + z('deathShare', true) * 1.5),
    clutch: attr(z('clutchDelta') * 4, 4),
    adaptability: attr(z('uniqueChamps') * 4, 3),
    aggression: clamp(Math.round(52 + z('actionPm') * 13 + normal(r) * 6), 10, 95),
  };
  // hidden attributes
  const potentialBoost = age === null ? 3 + r() * 5 : age < 18.5 ? 12 + r() * 12 : age < 20 ? 8 + r() * 9 : age < 22 ? 3 + r() * 7 : age < 25 ? r() * 4 : -r() * 2;
  const overall = Math.round((attributes.mechanics + attributes.laning + attributes.teamfight + attributes.macro + attributes.farming) / 5);
  const hidden = {
    potential: clamp(Math.round(overall + potentialBoost), overall, 99),
    farsight: clamp(Math.round(attributes.macro * 0.6 + attributes.shotcalling * 0.25 + 8 + normal(r) * 9), 5, 99),
    mistakes: clamp(Math.round(72 - L * 0.5 + z('deathShare') * 6 + (L - attributes.consistency) * 0.35 + normal(r) * 7), 3, 95),
    composure: clamp(Math.round(55 + (age ? (age - 21) * 2 : 0) + attributes.clutch * 0.2 - 12 + normal(r) * 12), 5, 99),
    snowball: clamp(Math.round(50 + z('goldShare') * 8 + z('actionPm') * 5 + normal(r) * 10), 5, 99),
    resilience: clamp(Math.round(50 + z('deathShare', true) * 6 + normal(r) * 12), 5, 99),
    workEthic: clamp(Math.round(62 + normal(r) * 14), 5, 99),
    professionalism: clamp(Math.round(64 + (age ? (age - 21) * 1.5 : 0) + normal(r) * 13), 5, 99),
    ego: clamp(Math.round(45 + (overall - 70) * 0.6 + normal(r) * 15), 5, 99),
    loyalty: clamp(Math.round(55 + normal(r) * 16), 5, 99),
    injuryProne: clamp(Math.round(20 + (age ? Math.max(0, age - 24) * 4 : 0) + normal(r) * 10), 1, 90),
  };
  // traits (data driven; curated overrides added later)
  const traits = [];
  const add = (t) => traits.includes(t) || traits.push(t);
  if (a && a.games >= 8) {
    if (z('csm') > 1.3 && pt.role !== 'support') add('farming_machine');
    if (z('vspm') > 1.4) add('vision_wizard');
    if (z('kp') > 1.3 && z('dmgShare') > 0.6) add('teamfight_maestro');
    if (z('goldShare') > 1.2 && z('dmgShare') > 1) add('carry_mentality');
    if (z('goldShare') < -0.8 && z('kda') > 0.8 && pt.role !== 'support') add('weakside_hero');
    if (z('actionPm') > 1.4 && attributes.consistency < L - 2) add('coinflip');
    if (a.playoffGames >= 8 && z('clutchDelta') > 1.5) add('ice_veins');
    if (a.playoffGames >= 10 && z('clutchDelta') < -1.8) add('big_stage_nerves');
    if (z('uniqueChamps') > 1.4) add('champion_ocean');
    if (z('kp') > 1.4 && (pt.role === 'support' || pt.role === 'mid')) add('roaming_menace');
    if (z('deathShare', true) > 1.4) add('survivor');
  }
  const champCounts = {};
  for (const l of ls) if (l.champion) champCounts[l.champion] = (champCounts[l.champion] ?? 0) + 1;
  const topShare = ls.length ? Math.max(0, ...Object.values(champCounts)) / ls.length : 0;
  if (ls.length >= 12 && topShare > 0.4) add('one_trick');
  if (hidden.farsight >= 86) add('game_ender');
  if (hidden.mistakes - (72 - L * 0.5) >= 15) add('throw_merchant');
  if (hidden.composure <= 25) add('tilter');
  if (age !== null && age < 19.5 && ls.length < 40) add('rookie');
  if (age !== null && age >= 26.5) add('veteran');
  if (attributes.shotcalling >= Math.max(80, L + 6)) add('shotcaller');
  // champion pool
  const pool = {};
  const champWins = {};
  for (const l of ls) if (l.champion && l.win) champWins[l.champion] = (champWins[l.champion] ?? 0) + 1;
  for (const [c, n] of Object.entries(champCounts)) {
    const wr = (champWins[c] ?? 0) / n;
    pool[c] = clamp(Math.round(55 + 32 * (1 - Math.exp(-n / 5)) + (wr - 0.5) * 16 + (L - 70) * 0.25), 35, 99);
  }
  for (const fav of (info.FavChamps ?? '').split(',').map((s) => champId(s.trim())).filter(Boolean)) pool[fav] = Math.max(pool[fav] ?? 0, clamp(Math.round(66 + (L - 70) * 0.25), 50, 90));
  // playstyle tags
  const style = [];
  if (attributes.aggression >= 68) style.push('Aggressive'); else if (attributes.aggression <= 36) style.push('Calculated');
  if (traits.includes('carry_mentality')) style.push('Resource carry'); if (traits.includes('weakside_hero')) style.push('Weakside');
  if (pt.role === 'jungle') style.push(z('grubShare') > 0.5 ? 'Objective-focused' : z('kp') > 0.5 ? 'Gank-heavy' : 'Farming jungler');
  if (pt.role === 'support') style.push(z('kp') > 0.5 ? 'Roaming support' : 'Lane-focused support');
  const real = a ? {
    games: ls.length, winRate: +(ls.filter((l) => l.win).length / ls.length).toFixed(3), kda: +a.kda.toFixed(2), kp: +a.kp.toFixed(3), csm: +a.csm.toFixed(2),
    gpm: Math.round(a.gpm), dpm: Math.round(a.dpm), vspm: +a.vspm.toFixed(2), dmgShare: +a.dmgShare.toFixed(3), goldShare: +a.goldShare.toFixed(3), deathShare: +a.deathShare.toFixed(3),
    events: [...new Set(ls.map((l) => l.event))].slice(0, 12),
  } : undefined;
  const handle = (info.ID || link).replace(/\s*\(.*\)/, '');
  const id = 'p:' + link;
  const ov = OVERRIDES[link] ?? OVERRIDES[handle] ?? null;
  if (ov) {
    if (CURATED[link]) Object.assign(attributes, CURATED[link]); // pinned curated values
    else {
      for (const [k, v] of Object.entries(ov.attributes ?? {})) if (k in attributes) attributes[k] = clamp(attributes[k] + v, 10, 99);
      for (const [k, v] of Object.entries(ov.set ?? {})) if (k in attributes) attributes[k] = v;
    }
    for (const [k, v] of Object.entries(ov.hidden ?? {})) if (k in hidden) hidden[k] = clamp(v, 1, 99);
    for (const t of ov.traits ?? []) add(t);
    for (const t of ov.removeTraits ?? []) { const i = traits.indexOf(t); if (i >= 0) traits.splice(i, 1); }
    for (const [c, v] of Object.entries(ov.champions ?? {})) { const id2 = champId(c) ?? c; pool[id2] = v; }
  }
  const imgFile = bestImage(link);
  playersOut.push({
    id, link, handle, name: info.Name || '', nativeName: info.NativeName || undefined, country: info.Country || info.NationalityPrimary || LEAGUES.find((l) => l.id === pt.league).country,
    birthdate: info.Birthdate || undefined, role: pt.role, teamId: pt.teamId, isSub: pt.isSub,
    imageFile: imgFile, imageUrl: imageUrl(imgFile, 200),
    attributes, hidden, traits, champions: pool, playstyle: style, realStats: real,
    streamer: !!info.Stream,
  });
  historyOut[id] = ls.slice(0, 25).map((l) => ({ date: l.date, event: l.event, team: l.team, vs: l.vs, champion: l.champion, k: l.k, d: l.d, a: l.a, cs: l.cs, win: l.win, len: Math.round(l.len), real: true }));
}
// link roster ids (coaches info)
for (const s of staffOut) {
  const r = rnd(s.id);
  const team = teamsOut.find((t) => t.id === s.teamId);
  const base = team ? team.rating : 60;
  const v = () => clamp(Math.round(base - 4 + normal(r) * 8), 25, 97);
  s.attributes = { tactics: v(), drafting: v(), training: v(), motivation: v(), scouting: v(), development: v() };
}

// ------------------------------------------------------------------ pro meta from 2026 games
const meta = {};
for (const r of allRows) {
  const c = champId(r.Champion);
  const role = ROLE_MAP[r.Role];
  if (!c || !role) continue;
  const m = (meta[c] ??= { picks: 0, wins: 0, bans: 0, byRole: {} });
  m.picks++; if (r.PlayerWin === 'Yes') m.wins++;
  m.byRole[role] = (m.byRole[role] ?? 0) + 1;
}
for (const g of allGames) for (const b of [...(g.Team1Bans ?? '').split(','), ...(g.Team2Bans ?? '').split(',')]) { const c = champId(b.trim()); if (c) (meta[c] ??= { picks: 0, wins: 0, bans: 0, byRole: {} }).bans++; }
const totalGames = allGames.length;
for (const m of Object.values(meta)) { m.games = totalGames; m.presence = +((m.picks + m.bans) / totalGames).toFixed(3); }

// ------------------------------------------------------------------ write
fs.writeFileSync(path.join(OUT, 'leagues.json'), JSON.stringify(leaguesOut));
fs.writeFileSync(path.join(OUT, 'teams.json'), JSON.stringify(teamsOut));
fs.writeFileSync(path.join(OUT, 'players.json'), JSON.stringify(playersOut));
fs.writeFileSync(path.join(OUT, 'staff.json'), JSON.stringify(staffOut));
fs.writeFileSync(path.join(OUT, 'history.json'), JSON.stringify(historyOut));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ games: totalGames, champions: meta }));
console.log(`leagues ${leaguesOut.length}, teams ${teamsOut.length}, players ${playersOut.length}, staff ${staffOut.length}`);
const top = [...playersOut].sort((a, b) => (b.attributes.mechanics + b.attributes.laning + b.attributes.teamfight + b.attributes.macro) - (a.attributes.mechanics + a.attributes.laning + a.attributes.teamfight + a.attributes.macro)).slice(0, 25);
for (const p of top) console.log(p.handle.padEnd(14), p.role.padEnd(8), p.teamId.padEnd(14), JSON.stringify(p.attributes), p.traits.join(','));
const tops = [...teamsOut].sort((a, b) => b.elo - a.elo).slice(0, 25);
console.log(tops.map((t) => `${t.short}(${t.leagueId}) ${t.elo}`).join(' | '));
