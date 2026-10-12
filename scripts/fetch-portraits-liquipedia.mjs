// Second portrait pass for players Leaguepedia has no photo of: Liquipedia's public MediaWiki API, following
// its API terms (≤ 1 request / 2 s, identifying User-Agent, gzip, results cached; content CC-BY-SA — credited
// in the README and the game's credits). Liquipedia names pages by handle alone, so a photo is only accepted
// when the page's infobox real name matches our player's real name — no guessing at who "Noah" is.
//
//   node scripts/fetch-portraits-liquipedia.mjs
//
// Cache: scripts/data/portraits-liquipedia.json  { [player id]: { page, file, url } | { none: true, why } }
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://liquipedia.net/leagueoflegends/api.php';
const UA = 'RiftManagerFanGame/1.0 (non-commercial fan game; https://github.com/deaddydot/rift-manager)';
const CACHE = path.join(ROOT, 'scripts/data/portraits-liquipedia.json');
const PLAYERS = path.join(ROOT, 'public/data/players.json');
const PACE_MS = 2100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function api(params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
    if (res.status === 429 || res.status === 503) { console.log(`  HTTP ${res.status} — waiting`); await sleep(30000 * (attempt + 1)); continue; }
    const text = await res.text();
    if (/just a moment|cf-chl|challenge-platform/i.test(text)) throw new Error('bot challenge — stopping (not bypassing it)');
    const json = JSON.parse(text);
    if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`);
    return json;
  }
  throw new Error('rate limited repeatedly — try again later');
}

const norm = (s) => (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s) => (s ?? '').replace(/&amp;nbsp;|&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const close = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && lev(x, y) <= 1) || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
/**
 * Same person: every token of the shorter real name has a match in the longer one — exact, a one-letter
 * spelling difference, or a short form (Ben / Benjamin, Alex / Alexander) — with at least two names on each side.
 */
function sameName(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return s.every((x) => l.some((y) => close(x, y)));
}
const IMG = /\.(png|jpe?g|webp)$/i;
const BAD = /logo|flag|icon|allmode|lightmode|darkmode|banner|trophy|square/i;
const recency = (f) => Number(/(20\d\d)/.exec(f)?.[1] ?? 0);
const field = (wikitext, key) => new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n|}]*)`, 'i').exec(wikitext)?.[1]?.trim() ?? '';

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const pj = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));
const players = pj;
const todo = players.filter((p) => !p.imageUrl && p.name && !(p.id in cache));
console.log(`${players.filter((p) => !p.imageUrl).length} players without a photo; ${todo.length} to look up on Liquipedia`);

try {
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    // 1) the pages (by handle), their wikitext (to check who they are) and their images
    const byTitle = new Map(); // final title -> { text, images }
    const resolved = new Map();
    let cont = {};
    do {
      const j = await api({ action: 'query', prop: 'revisions|images', rvprop: 'content', rvslots: 'main', imlimit: 'max', redirects: '1', titles: chunk.map((p) => p.handle).join('|'), ...cont });
      for (const r of [...(j.query?.redirects ?? []), ...(j.query?.normalized ?? [])]) resolved.set(r.from, r.to);
      for (const pg of j.query?.pages ?? []) {
        if (pg.missing) continue;
        const e = byTitle.get(pg.title) ?? { text: '', images: [] };
        const txt = pg.revisions?.[0]?.slots?.main?.content;
        if (txt) e.text = txt;
        for (const im of pg.images ?? []) e.images.push(im.title.replace(/^File:/, ''));
        byTitle.set(pg.title, e);
      }
      cont = j.continue ?? null;
    } while (cont);
    // 2) pick a verified photo per player
    const picks = new Map(); // player id -> { page, file }
    for (const p of chunk) {
      let t = p.handle;
      for (let k = 0; k < 3 && resolved.has(t); k++) t = resolved.get(t);
      const e = byTitle.get(t);
      if (!e) { cache[p.id] = { none: true, why: 'no page' }; continue; }
      const lpName = field(e.text, 'romanized_name') || field(e.text, 'name');
      if (!sameName(lpName, p.name)) { cache[p.id] = { none: true, why: `different person? (${lpName || 'no name'})` }; continue; }
      const infoboxImg = field(e.text, 'image');
      const own = e.images.filter((f) => IMG.test(f) && !BAD.test(f) && norm(f).includes(norm(p.handle))).sort((a, b) => recency(b) - recency(a));
      const file = (infoboxImg && IMG.test(infoboxImg) ? infoboxImg : null) ?? own[0];
      if (!file) { cache[p.id] = { none: true, why: 'page has no photo' }; continue; }
      picks.set(p.id, { page: t, file });
    }
    // 3) thumbnail URLs
    if (picks.size) {
      const files = [...new Set([...picks.values()].map((x) => x.file))];
      const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '200', titles: files.map((f) => `File:${f}`).join('|') });
      const urls = new Map();
      const back = new Map((j.query?.normalized ?? []).map((r) => [r.to, r.from]));
      for (const pg of j.query?.pages ?? []) {
        const info = pg.imageinfo?.[0];
        if (!info) continue;
        urls.set((back.get(pg.title) ?? pg.title).replace(/^File:/, ''), info.thumburl ?? info.url);
        urls.set(pg.title.replace(/^File:/, ''), info.thumburl ?? info.url);
      }
      for (const [id, x] of picks) cache[id] = urls.get(x.file) ? { page: x.page, file: x.file, url: urls.get(x.file) } : { none: true, why: 'file not found' };
    }
    console.log(`  ${Math.min(i + 50, todo.length)}/${todo.length}: ${Object.values(cache).filter((c) => c.url).length} verified photos so far`);
  }
} catch (e) {
  console.error(`stopped: ${e.message} — keeping what was found so far`);
} finally {
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
}

let n = 0;
for (const p of players) { const c = !p.imageUrl ? cache[p.id] : null; if (c?.url) { p.imageFile = `liquipedia:${c.file}`; p.imageUrl = c.url; n++; } }
fs.writeFileSync(PLAYERS, JSON.stringify(pj));
const why = {};
for (const c of Object.values(cache)) if (c.none) why[c.why.startsWith('different') ? 'different person / name mismatch' : c.why] = (why[c.why.startsWith('different') ? 'different person / name mismatch' : c.why] ?? 0) + 1;
console.log(`patched ${n} players from Liquipedia; skipped: ${JSON.stringify(why)}`);
