// Leaguepedia (lol.fandom.com) data client.
// Uses Special:CargoExport (CSV), which is far less aggressively rate limited
// than api.php for anonymous clients. Every response is cached on disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPORT = 'https://lol.fandom.com/wiki/Special:CargoExport';
const UA = 'LoLEsportManagerDataBot/0.1 (personal non-commercial fan project)';
const CACHE_DIR = path.resolve(import.meta.dirname, '../../data-raw/cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
const MIN_GAP = Number(process.env.LP_GAP ?? 1500);

/** RFC4180-ish CSV parser (handles quotes, escaped quotes and newlines in fields). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function getText(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key + '.csv');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  let wait = 10000;
  for (let attempt = 0; attempt < 10; attempt++) {
    const gap = Date.now() - lastRequest;
    if (gap < MIN_GAP) await sleep(MIN_GAP - gap);
    lastRequest = Date.now();
    let text;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(240000) });
      text = await res.text();
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (/^\s*<!DOCTYPE|<html/i.test(text.slice(0, 200))) throw new Error('HTML response (error page)');
    } catch (e) {
      console.warn(`  request failed (${e.message}), retry in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      wait = Math.min(wait * 1.7, 120000);
      continue;
    }
    // Cargo query errors are deterministic: fail fast instead of retrying.
    if (/^Error: /.test(text)) throw new Error('Cargo: ' + text.slice(0, 300));
    if (text.trim().length > 0) fs.writeFileSync(file, text);
    return text;
  }
  throw new Error('Too many retries for ' + url);
}

/** Cargo query via CSV export with automatic pagination. Returns array of row objects keyed by alias. */
export async function cargo({ tables, fields, where, join_on, order_by, group_by, limit = Infinity, page = 5000 }) {
  const out = [];
  for (let offset = 0; offset < limit; offset += page) {
    const params = { tables, fields, format: 'csv', limit: String(Math.min(page, limit - offset)), offset: String(offset) };
    if (where) params.where = where;
    if (join_on) params['join on'] = join_on;
    if (order_by) params['order by'] = order_by;
    if (group_by) params['group by'] = group_by;
    const url = EXPORT + '?' + new URLSearchParams(params).toString();
    const rows = parseCSV(await getText(url));
    out.push(...rows);
    if (rows.length < Math.min(page, limit - offset)) break;
  }
  return out;
}

export const sqlList = (arr) => arr.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',');

/** Run a query for a long list of values in batches (to keep URLs short). */
export async function cargoIn(base, column, values, batch = 120) {
  const out = [];
  const uniq = [...new Set(values.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += batch) {
    const chunk = uniq.slice(i, i + batch);
    const cond = `${column} IN (${sqlList(chunk)})`;
    out.push(...(await cargo({ ...base, where: base.where ? `(${base.where}) AND ${cond}` : cond })));
  }
  return out;
}

/** Direct (redirecting) URL for a wiki file, optionally resized. */
export function fileUrl(fileName, width) {
  const u = 'https://lol.fandom.com/wiki/Special:FilePath/' + encodeURIComponent(fileName.replace(/ /g, '_'));
  return width ? u + '?width=' + width : u;
}
export { UA };
