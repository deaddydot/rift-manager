#!/usr/bin/env node
// Builds a per-tournament player stat-line history (seasons S14 = 2024, S15 = 2025) from gol.gg.
//
//   node scripts/fetch-golgg.mjs            -> data-raw/esports/golgg_history.json
//   node scripts/fetch-golgg.mjs --dry-run  -> only print the tournament -> league mapping
//
// Polite scraping: sequential requests, >= 1.5 s apart, identifying User-Agent, raw responses cached
// (gzipped) under data-raw/cache/golgg/ so reruns never refetch. If gol.gg answers 403/429/503 or a
// challenge page we back off, and give up (exit 1) if it persists. The cache keeps what was already
// fetched, so a later rerun picks up where it stopped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'data-raw/cache/golgg');
const OUT_FILE = path.join(ROOT, 'data-raw/esports/golgg_history.json');
const BASE = 'https://gol.gg';
const UA = 'LoLEsportManagerDataBot/0.1 (personal non-commercial fan project)';
const MIN_GAP_MS = 2000; // >= 1.5 s between requests
const BACKOFF_MS = [30_000, 60_000, 120_000];
const DRY_RUN = process.argv.includes('--dry-run');
const SEASONS = [
  { season: 'S14', year: 2024 },
  { season: 'S15', year: 2025 },
];

// ---------------------------------------------------------------------------------------------
// Tournament name -> our league id. First matching rule wins, so skips / more specific names
// come before the generic league patterns. `league: 'INTL'` rules carry an `event` tag.
// Predecessor leagues are folded into the league that replaced them (GLL -> HLL, Ultraliga -> RL,
// Elite Series -> ROL, LVP SL -> LES, CBLOL Academy -> CD, LTA North/South -> LCS/CBLOL).
// ---------------------------------------------------------------------------------------------
const RULES = [
  // skipped outright
  { re: /promotion/i, skip: 'promotion/relegation series' },
  { re: /\b(div ?2|2nd div)\b/i, skip: 'national 2nd division (no league id)' },
  { re: /^Demacia Cup/i, skip: 'Chinese cup (not one of our events)' },
  { re: /^Americas Challengers/i, skip: 'cross-region tier-2 cup (no league id)' },
  { re: /^LLA\b/i, skip: 'LLA (Latin America) is not one of our leagues' },
  { re: /^LCO\b/i, skip: 'LCO (Oceania) is not one of our leagues' },

  // international events
  { re: /^Worlds\b/i, league: 'INTL', event: 'worlds' },
  { re: /\bMid-Season Invitational\b|^MSI\b/i, league: 'INTL', event: 'msi' },
  { re: /^Esports World Cup/i, league: 'INTL', event: 'ewc' },
  { re: /^First Stand/i, league: 'INTL', event: 'firststand' },
  { re: /^EMEA Masters/i, league: 'INTL', event: 'emeamasters' },
  { re: /^Kespa Cup/i, league: 'INTL', event: 'kespa' },

  // Americas (2025 LTA era)
  { re: /^LTA North\b/i, league: 'LCS' },
  { re: /^LTA South\b/i, league: 'CBLOL' },
  { re: /^LTA\b/i, league: 'LTA' }, // cross-conference LTA events (Split 1 Playoffs, Championship)
  { re: /^LCS\b/i, league: 'LCS' },
  { re: /^NACL\b/i, league: 'NACL' },
  { re: /^CBLOL Academy\b/i, league: 'CD' }, // 2024 Brazilian tier 2, replaced by Circuito Desafiante in 2025
  { re: /^CBLOL\b/i, league: 'CBLOL' },
  { re: /^(CD|Circuito Desafiante)\b/i, league: 'CD' },
  { re: /^LRN\b/i, league: 'LRN' },
  { re: /^LRS\b/i, league: 'LRS' },

  // Asia / Pacific
  { re: /^LCK CL\b/i, league: 'LCKCL' },
  { re: /^LCK (Academy|AS)\b/i, league: 'LCKAS' },
  { re: /^LCK\b/i, league: 'LCK' },
  { re: /^LPL\b/i, league: 'LPL' },
  { re: /^LCP\b/i, league: 'LCP' },
  { re: /^PCS\b/i, league: 'PCS' },
  { re: /^VCS\b/i, league: 'VCS' },
  { re: /^LJL\b/i, league: 'LJL' },

  // EMEA
  { re: /^LEC\b/i, league: 'LEC' },
  { re: /^LFL\b/i, league: 'LFL' },
  { re: /^Prime League\b/i, league: 'PRM' }, // top German division ("Prime League" 2024, "1st Div" 2025)
  { re: /^(LVP SL|SL|Superliga)\b/i, league: 'LES' },
  { re: /^TCL\b/i, league: 'TCL' },
  { re: /^NLC\b/i, league: 'NLC' },
  { re: /^(Ultraliga|Rift Legends)\b/i, league: 'RL' },
  { re: /^LIT\b/i, league: 'LIT' },
  { re: /^(Road Of Legends|Elite Series)\b/i, league: 'ROL' },
  { re: /^(HLL|GLL)\b/i, league: 'HLL' },
  { re: /^EBL\b/i, league: 'EBL' },
  { re: /^Hitpoint Winter\b/i, skip: 'Hitpoint winter cup: ~16 teams mixing HM + Hitpoint Challengers (not a clean HM split)' },
  { re: /^Hitpoint Masters\b/i, league: 'HM' },
  { re: /^LPLOL\b/i, league: 'LPLOL' },
  { re: /^Arabian League\b/i, league: 'AL' },
];

// Post-regular-season stages (swiss, play-in, playoffs, finals, qualifying series, regional finals).
const PLAYOFF_RE = /playoffs|play-in|finals?\b|final four|championship|road to msi|qualifying series|swiss/i;
// Names that look like playoffs but are a regular split: LCP's third split is called "Season Finals".
const NOT_PLAYOFFS = new Set(['LCP 2025 Season Finals']);

function classify(name) {
  for (const r of RULES) {
    if (!r.re.test(name)) continue;
    if (r.skip) return { skip: r.skip };
    const playoffs = r.league === 'INTL' ? false : !NOT_PLAYOFFS.has(name) && PLAYOFF_RE.test(name);
    return { league: r.league, event: r.event ?? null, playoffs };
  }
  return { skip: 'unmapped (no matching league)' };
}

// ---------------------------------------------------------------------------------------------
// HTTP with cache, spacing and back-off
// ---------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
let netRequests = 0;

function cachePath(key) {
  return path.join(CACHE_DIR, key.replace(/[^A-Za-z0-9._-]+/g, '_') + '.gz');
}

function looksBlocked(status, body) {
  if (status === 403 || status === 429 || status === 503) return true;
  return /cf-chl|challenge-platform|Just a moment\.\.\.|cf_chl_opt|Attention Required!/i.test(body.slice(0, 20000));
}

async function fetchCached(key, url, { method = 'GET', form = null, validate }) {
  const file = cachePath(key);
  if (fs.existsSync(file)) return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    netRequests++;

    let status = 0;
    let body = '';
    let err = null;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: 'follow',
      });
      status = res.status;
      body = await res.text();
    } catch (e) {
      err = e;
    }

    const blocked = !err && looksBlocked(status, body);
    const ok = !err && !blocked && status === 200 && validate(body);
    if (ok) {
      fs.writeFileSync(file, zlib.gzipSync(body));
      return body;
    }

    const why = err ? `network error: ${err.message}` : blocked ? `blocked (HTTP ${status})` : `unexpected response (HTTP ${status}, ${body.length} bytes)`;
    if (attempt >= BACKOFF_MS.length) {
      throw new Error(`Giving up on ${url} after ${attempt + 1} attempts: ${why}`);
    }
    console.warn(`  ! ${why} for ${url}; backing off ${BACKOFF_MS[attempt] / 1000}s`);
    await sleep(BACKOFF_MS[attempt]);
  }
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = (s) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

function num(cell) {
  const s = stripTags(cell);
  if (s === '' || s === '-') return null;
  const pct = s.endsWith('%');
  const n = Number(pct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return pct ? Number((n / 100).toFixed(4)) : n;
}

// Column order of the gol.gg players table (index into the <td> list).
const COLUMNS = [
  'player', 'country', 'games', 'winRate', 'kda', 'kills', 'deaths', 'assists', 'csm', 'gpm', 'kp',
  'dmgShare', 'goldShare', 'vsShare', 'dpm', 'vspm', 'wpm', 'wcpm', 'vwpm', 'gd15', 'csd15', 'xpd15',
  'fbPct', 'fbVictim', 'pentaKills', 'soloKills',
];
const EXPECTED_HEADERS = ['Player', 'Country', 'Games', 'Win rate', 'KDA', 'Avg kills', 'Avg deaths', 'Avg assists', 'CSM', 'GPM', 'KP%', 'DMG%', 'Gold%', 'VS%', 'DPM', 'VSPM', 'Avg WPM', 'Avg WCPM', 'Avg VWPM', 'GD@15', 'CSD@15', 'XPD@15', 'FB %', 'FB Victim', 'Penta Kills', 'Solo Kills'];

function parsePlayersTable(html, label) {
  const start = html.indexOf("class='table_list playerslist");
  if (start < 0) throw new Error(`${label}: players table not found`);
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? undefined : end);

  const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
  if (headers.join('|') !== EXPECTED_HEADERS.join('|')) {
    throw new Error(`${label}: unexpected table headers: ${headers.join(', ')}`);
  }

  const rows = [];
  for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length === 0) continue; // header row
    if (cells.length !== COLUMNS.length) throw new Error(`${label}: row with ${cells.length} cells`);
    const idMatch = cells[0].match(/player-stats\/(\d+)\//);
    const country = cells[1].match(/<span class='d-none'>([^<]*)<\/span>/);
    const row = {
      id: idMatch ? Number(idMatch[1]) : null,
      player: stripTags(cells[0]),
      country: country && country[1].trim() ? country[1].trim() : null,
    };
    for (let i = 2; i < COLUMNS.length; i++) row[COLUMNS[i]] = num(cells[i]);
    // gol.gg prints "-" for a perfect KDA (0 deaths); use the usual (K+A)/max(1,D) convention.
    if (row.kda === null && row.deaths === 0 && row.kills !== null && row.assists !== null) {
      row.kda = Number((row.kills + row.assists).toFixed(1));
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tournaments = [];
  const skipped = [];

  for (const { season, year } of SEASONS) {
    const listJson = await fetchCached(`trlist_${season}.json`, `${BASE}/tournament/ajax.trlist.php`, {
      method: 'POST',
      form: { season },
      validate: (b) => b.trim().startsWith('['),
    });
    const list = JSON.parse(listJson).sort((a, b) => a.firstgame.localeCompare(b.firstgame) || a.trname.localeCompare(b.trname));
    console.log(`${season}: ${list.length} tournaments on gol.gg`);

    for (const t of list) {
      const name = t.trname;
      const c = classify(name);
      if (c.skip) {
        skipped.push({ season, name, region: t.region, games: Number(t.nbgames), reason: c.skip });
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ${c.league.padEnd(6)} ${(c.event ?? '').padEnd(11)} ${c.playoffs ? 'PO' : '  '} ${name}`);
        continue;
      }
      const url = `${BASE}/players/list/season-${season}/split-ALL/tournament-${encodeURIComponent(name)}/`;
      const html = await fetchCached(`players_${season}_${name}.html`, url, {
        validate: (b) => b.includes("class='table_list playerslist"),
      });
      const rows = parsePlayersTable(html, name);
      if (rows.length === 0) console.warn(`  ! ${name}: no player rows`);
      // gol.gg prints "-" instead of 0 solo kills. Only tournaments with no solo-kill data at all
      // (LPL, MSI 2024) stay null.
      if (rows.some((r) => r.soloKills !== null)) for (const r of rows) r.soloKills ??= 0;
      console.log(`  ${c.league.padEnd(6)} ${c.playoffs ? 'PO' : '  '} ${String(rows.length).padStart(3)} rows  ${name}`);
      tournaments.push({
        season,
        year,
        name,
        league: c.league,
        event: c.event,
        playoffs: c.playoffs,
        region: t.region,
        games: Number(t.nbgames),
        firstGame: t.firstgame,
        lastGame: t.lastgame,
        rows,
      });
    }
  }

  if (DRY_RUN) {
    for (const s of skipped) console.log(`  SKIP ${s.season} ${s.name} -- ${s.reason}`);
    return;
  }

  const out = {
    source: 'gol.gg',
    fetched: localDate(),
    notes:
      'Per-tournament player averages from gol.gg players list. Percentages are fractions; null = missing ("-"). ' +
      'kda for 0-death lines (gol.gg shows "-") = kills + assists; soloKills "-" = 0 where the tournament tracks solo kills. ' +
      'All LPL tournaments and MSI 2024 lack soloKills/csd15/xpd15/fbPct/fbVictim/pentaKills; LPL Spring 2024 (+playoffs) and MSI 2024 also lack vision stats and gd15. ' +
      'year follows the gol.gg season (S14=2024, S15=2025), so e.g. KeSPA Cup 2024 (Dec 2024) is S15/2025; see firstGame. ' +
      'playoffs = post-regular-season stage (swiss, play-in, playoffs, finals, qualifying series); always false for INTL. ' +
      'Predecessor leagues folded in: GLL->HLL, Ultraliga->RL, Elite Series->ROL, LVP SL->LES, CBLOL Academy (2024)->CD, ' +
      'LTA North->LCS, LTA South->CBLOL, cross-conference LTA events->LTA.',
    tournaments,
    skipped,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, serialize(out));

  const totalRows = tournaments.reduce((s, t) => s + t.rows.length, 0);
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}: ${tournaments.length} tournaments, ${totalRows} rows, ${skipped.length} skipped (${netRequests} network requests).`);
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pretty JSON, but one line per stat row to keep the file compact and diff-able.
function serialize(out) {
  const json = JSON.stringify(out, (key, value) => {
    if (key === 'rows' && Array.isArray(value)) return value.map((r) => `@@ROW@@${JSON.stringify(r)}`);
    if (key === 'skipped' && Array.isArray(value)) return value.map((r) => `@@ROW@@${JSON.stringify(r)}`);
    return value;
  }, 2);
  return json.replace(/"@@ROW@@((?:[^"\\]|\\.)*)"/g, (_, s) => JSON.parse(`"${s}"`)) + '\n';
}

main().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
