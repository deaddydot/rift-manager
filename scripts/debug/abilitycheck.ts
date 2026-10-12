// Ability data sanity check: loads the game data (which applies src/data/abilityFixes.ts) and lists
// suspicious crowd control — hard CC on a short cooldown, long non-ultimate disables, very long ultimate
// disables — plus how many abilities the fix table changed. Usage: npx tsx scripts/debug/abilitycheck.ts
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { ABILITY_FIXES } from '../../src/data/abilityFixes';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const raw = load('champions.json');
const before = new Map<string, { cc: any; cooldown: number[] }>();
for (const c of raw.champions) for (const a of c.abilities) before.set(`${c.id}.${a.slot}`, { cc: a.cc, cooldown: [...a.cooldown] });
setGameData({ champions: raw, items: load('items.json'), navgrid: load('navgrid.json') });

const HARD = new Set(['stun', 'root', 'knockup', 'charm', 'fear', 'taunt', 'suppress', 'sleep', 'polymorph', 'airborne', 'pull']);
const fmtCC = (cc: any) => (cc ? `${cc.type} ${cc.duration}s${cc.amount ? ` ${Math.round(cc.amount * 100)}%` : ''}` : 'none');
const shortCd: string[] = [], longBasic: string[] = [], longUlt: string[] = [];
for (const c of gd().champions) {
  for (const a of c.abilities) {
    const cc = a.cc;
    if (!cc || !HARD.has(cc.type)) continue;
    const cd = a.cooldown[a.cooldown.length - 1] ?? 0;
    const tag = `${c.id} ${a.slot} ${a.name}: ${fmtCC(cc)}, cd ${JSON.stringify(a.cooldown)}`;
    if (cd < 4) shortCd.push(tag);
    if (a.slot !== 'R' && cc.duration > 2.5) longBasic.push(tag);
    if (a.slot === 'R' && cc.duration > 3.5) longUlt.push(tag);
  }
}
const section = (title: string, rows: string[]) => console.log(`\n${title} (${rows.length})${rows.length ? '\n  ' + rows.join('\n  ') : ''}`);
section('Hard CC with max-rank cooldown < 4 s', shortCd);
section('Non-ultimate hard CC longer than 2.5 s', longBasic);
section('Ultimate hard CC longer than 3.5 s', longUlt);

// ---- what the fix table changed
let ccRemoved = 0, ccAdded = 0, ccChanged = 0, cdFixed = 0, noop = 0;
const unknown: string[] = [];
for (const [id, slots] of Object.entries(ABILITY_FIXES)) {
  if (!gd().championById[id]) { unknown.push(id); continue; }
  for (const [slot, f] of Object.entries(slots)) {
    const was = before.get(`${id}.${slot}`);
    if (!was || !f) { unknown.push(`${id}.${slot}`); continue; }
    let changed = false;
    if ('cc' in f) {
      const now = f.cc ?? null;
      if (was.cc && !now) { ccRemoved++; changed = true; }
      else if (!was.cc && now) { ccAdded++; changed = true; }
      else if (was.cc && now && JSON.stringify(was.cc) !== JSON.stringify(now)) { ccChanged++; changed = true; }
    }
    if (f.cooldown && JSON.stringify(f.cooldown) !== JSON.stringify(was.cooldown)) { cdFixed++; changed = true; }
    if (!changed) noop++;
  }
}
const entries = Object.values(ABILITY_FIXES).reduce((s, x) => s + Object.keys(x).length, 0);
console.log(`\nFix table: ${Object.keys(ABILITY_FIXES).length} champions, ${entries} ability entries`);
console.log(`  CC removed ${ccRemoved}, CC changed ${ccChanged}, CC added ${ccAdded}, cooldown fixed ${cdFixed}${noop ? `, no-op ${noop}` : ''}`);
if (unknown.length) console.log(`  UNKNOWN champion/slot ids: ${unknown.join(', ')}`);
