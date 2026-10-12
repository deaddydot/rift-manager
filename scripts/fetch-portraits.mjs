// Portrait lookup for players / staff / casters that have no photo yet, from Leaguepedia's public wiki API
// (MediaWiki `pageimages` + the page's image list — not the rate-limited Cargo endpoint). Politely paced, with a
// descriptive User-Agent; backs off when the wiki asks it to. Images are linked from the wiki's CDN like the
// existing portraits (nothing is downloaded into the repo).
//
//   node scripts/fetch-portraits.mjs            # look up everyone still missing a photo, patch public/data
//   node scripts/fetch-portraits.mjs --refresh  # ignore the cache and look everyone up again
//
// Cache: scripts/data/portraits.json  { [wiki page title]: { file, url } | { none: true } }
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://lol.fandom.com/api.php';
const UA = 'RiftManagerFanGame/1.0 (non-commercial fan game portrait lookup; https://github.com/deaddydot/rift-manager)';
const CACHE = path.join(ROOT, 'scripts/data/portraits.json');
const PLAYERS = path.join(ROOT, 'public/data/players.json');
const STAFF = path.join(ROOT, 'public/data/staff.json');
const REFRESH = process.argv.includes('--refresh');
const PACE_MS = 1200;

// casters on the in-game broadcast desk: their wiki page titles (first that resolves wins)
const CASTERS = { flowers: ['CaptainFlowers'], kobe: ['Kobe'], drakos: ['Drakos'], quickshot: ['Quickshot'], hoangluan: ['Hoàng Luân', 'Hoang Luan', 'HoangLuan'] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function api(params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = last + PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const text = await res.text();
    if (/just a moment|cf-chl|challenge-platform/i.test(text)) throw new Error('Cloudflare challenge — stopping (not bypassing it)');
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`unexpected response (${res.status}): ${text.slice(0, 120)}`); }
    if (json.error?.code === 'ratelimited' || res.status === 429) { const back = 15000 * (attempt + 1); console.log(`  rate limited — waiting ${back / 1000}s`); await sleep(back); continue; }
    if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`);
    return json;
  }
  throw new Error('still rate limited after several waits — try again later');
}

const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const IMG = /\.(png|jpe?g|webp)$/i;
const BAD = /logo|flag|square|icon|banner|signature|_sq\b|trophy|ward|skin|splash/i;
function recency(file) {
  const y = Number(/(20\d\d)/.exec(file)?.[1] ?? 0);
  const part = /split_?3|summer|worlds|playoffs_?2/i.test(file) ? 3 : /split_?2|msi|mid/i.test(file) ? 2 : /split_?1|spring|cup|first_?stand/i.test(file) ? 1 : 0;
  return y * 10 + part;
}
/** Best photo of `handle` among a page's images: newest file named after them; else the page's lead image. */
function choose(handle, images, pageimage) {
  const h = norm(handle);
  const named = images.filter((f) => IMG.test(f) && !BAD.test(f) && h.length >= 2 && norm(f).includes(h));
  if (named.length) return named.sort((a, b) => recency(b) - recency(a))[0];
  if (pageimage && IMG.test(pageimage) && !BAD.test(pageimage)) return pageimage;
  return null;
}

async function lookup(pages /* [{ title, handle }] */) {
  const out = new Map(); // title -> file | null
  for (let i = 0; i < pages.length; i += 50) {
    const chunk = pages.slice(i, i + 50);
    const images = new Map(), lead = new Map(), resolved = new Map(); // requested title -> final title
    let cont = {};
    do {
      const j = await api({ action: 'query', prop: 'pageimages|images', piprop: 'name', imlimit: 'max', redirects: '1', titles: chunk.map((p) => p.title).join('|'), ...cont });
      for (const r of [...(j.query?.redirects ?? []), ...(j.query?.normalized ?? [])]) resolved.set(r.from, r.to);
      for (const pg of j.query?.pages ?? []) {
        if (pg.missing) continue;
        if (pg.pageimage) lead.set(pg.title, pg.pageimage);
        const list = images.get(pg.title) ?? [];
        for (const im of pg.images ?? []) list.push(im.title.replace(/^File:/, ''));
        images.set(pg.title, list);
      }
      cont = j.continue ?? null;
    } while (cont);
    for (const p of chunk) {
      let t = p.title;
      for (let k = 0; k < 3 && resolved.has(t); k++) t = resolved.get(t);
      out.set(p.title, choose(p.handle, images.get(t) ?? [], lead.get(t)));
    }
    console.log(`  looked up ${Math.min(i + 50, pages.length)}/${pages.length}`);
  }
  return out;
}

async function thumbUrls(files) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const chunk = files.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '200', titles: chunk.map((f) => `File:${f}`).join('|') });
    const norm2 = new Map((j.query?.normalized ?? []).map((r) => [r.to, r.from]));
    for (const pg of j.query?.pages ?? []) {
      const info = pg.imageinfo?.[0];
      if (!info) continue;
      const name = (norm2.get(pg.title) ?? pg.title).replace(/^File:/, '');
      out.set(name, info.thumburl ?? info.url);
      out.set(pg.title.replace(/^File:/, ''), info.thumburl ?? info.url);
    }
  }
  return out;
}

// ------------------------------------------------------------------ main
const cache = fs.existsSync(CACHE) && !REFRESH ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const pj = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));
const players = Array.isArray(pj) ? pj : pj.players ?? Object.values(pj);
const sj = JSON.parse(fs.readFileSync(STAFF, 'utf8'));
const staff = Array.isArray(sj) ? sj : sj.staff ?? Object.values(sj);

const wanted = [];
for (const p of players) if (!p.imageUrl && p.link) wanted.push({ title: p.link, handle: p.handle });
for (const s of staff) if (!s.imageUrl && s.link) wanted.push({ title: s.link, handle: s.handle });
for (const titles of Object.values(CASTERS)) for (const t of titles) wanted.push({ title: t, handle: t });
const todo = [...new Map(wanted.filter((w) => !(w.title in cache)).map((w) => [w.title, w])).values()];
console.log(`missing photos: ${players.filter((p) => !p.imageUrl).length} players, ${staff.filter((s) => !s.imageUrl).length} staff, ${Object.keys(CASTERS).length} casters; ${todo.length} wiki pages to look up`);

try {
  const found = await lookup(todo);
  const files = [...new Set([...found.values()].filter(Boolean))];
  const urls = await thumbUrls(files);
  for (const [title, file] of found) cache[title] = file && urls.get(file) ? { file, url: urls.get(file) } : { none: true };
} catch (e) {
  console.error(`stopped: ${e.message} — keeping what was found so far`);
} finally {
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
}

let pn = 0, sn = 0;
for (const p of players) { const c = !p.imageUrl && p.link ? cache[p.link] : null; if (c?.url) { p.imageFile = c.file; p.imageUrl = c.url; pn++; } }
for (const s of staff) { const c = !s.imageUrl && s.link ? cache[s.link] : null; if (c?.url) { s.imageFile = c.file; s.imageUrl = c.url; sn++; } }
fs.writeFileSync(PLAYERS, JSON.stringify(pj));
fs.writeFileSync(STAFF, JSON.stringify(sj));
const casters = Object.fromEntries(Object.entries(CASTERS).map(([id, ts]) => [id, ts.map((t) => cache[t]).find((c) => c?.url)?.url ?? null]));
console.log(`patched ${pn} players and ${sn} staff; casters: ${JSON.stringify(casters)}`);
