// Dash table sanity check (src/data/dashData.ts): coverage against champions.json, champions with no
// mobility, unknown ids/slots, suspicious values (long non-ultimate ranges, dashes/leaps without a speed,
// melee 'reposition', P entries other than Kalista) and a sample of entries next to the data's own range.
// Usage: npx tsx scripts/debug/dashcheck.ts
import fs from 'node:fs';
import path from 'node:path';
import { DASHES, type DashDef } from '../../src/data/dashData';

const ROOT = path.resolve(import.meta.dirname, '../..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/champions.json'), 'utf8'));
const champs: { id: string; attackType: string; abilities: { slot: string; name: string; range: number; dash: boolean }[] }[] = raw.champions;
const byId = new Map(champs.map((c) => [c.id, c]));

// long-range movers that are fine outside the ultimate slot
const LONG_OK = new Set(['Zac.E', 'AurelionSol.W', 'LeeSin.Q', 'Akali.E']);

const unknown = Object.keys(DASHES).filter((id) => !byId.has(id));
const missingKey = champs.filter((c) => !(c.id in DASHES)).map((c) => c.id);
const withDashes = champs.filter((c) => (DASHES[c.id] ?? []).length > 0);
const without = champs.filter((c) => (DASHES[c.id] ?? []).length === 0).map((c) => c.id);
const total = Object.values(DASHES).reduce((n, d) => n + d.length, 0);

console.log(`champions in data: ${champs.length}`);
console.log(`champions with a key in DASHES: ${champs.length - missingKey.length}${missingKey.length ? `  (no key: ${missingKey.join(', ')})` : ''}`);
console.log(`champions with mobility: ${withDashes.length}`);
console.log(`total dash defs: ${total}`);
if (unknown.length) console.log(`UNKNOWN champion ids: ${unknown.join(', ')}`);

const kinds: Record<string, number> = {};
const targets: Record<string, number> = {};
for (const defs of Object.values(DASHES)) for (const d of defs) {
  kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
  targets[d.target] = (targets[d.target] ?? 0) + 1;
}
console.log(`by kind: ${JSON.stringify(kinds)}   by target: ${JSON.stringify(targets)}`);

console.log(`\nchampions without mobility (${without.length}):`);
console.log('  ' + without.join(', '));
// champions the keyword parser flagged as dashing but that have no entry here — eyeball these
const flagged = without.filter((id) => byId.get(id)!.abilities.some((a) => a.dash));
if (flagged.length) {
  console.log(`  of which champions.json has ability.dash=true (keyword guess, check):`);
  for (const id of flagged) console.log(`    ${id}: ${byId.get(id)!.abilities.filter((a) => a.dash).map((a) => `${a.slot} ${a.name}`).join(', ')}`);
}

console.log('\nsuspicious:');
let sus = 0;
const flag = (id: string, d: DashDef, why: string) => { sus++; console.log(`  ${id} ${d.slot} ${d.name}: ${why}`); };
for (const [id, defs] of Object.entries(DASHES)) {
  const c = byId.get(id);
  for (const d of defs) {
    if (d.range > 1300 && d.slot !== 'R' && !LONG_OK.has(`${id}.${d.slot}`)) flag(id, d, `range ${d.range} on a non-ultimate`);
    if (d.kind !== 'blink' && !d.speed) flag(id, d, `${d.kind} without speed`);
    if (d.kind === 'blink' && d.speed) flag(id, d, 'blink with a speed');
    if (d.range <= 0) flag(id, d, 'non-positive range');
    if (!d.use.length) flag(id, d, 'no use');
    if (d.slot === 'P' && id !== 'Kalista') flag(id, d, 'P entry (sim fires these every ~1.2 s)');
    if (d.cooldown && d.cooldown.some((x) => !(x > 0))) flag(id, d, `bad cooldown ${d.cooldown}`);
    if (d.charges && d.charges > 1 && !d.recastWindow) flag(id, d, 'charges without recastWindow');
    if (c?.attackType === 'melee' && d.use.includes('reposition')) flag(id, d, "melee champion with 'reposition'");
    if (c && d.slot !== 'P' && !c.abilities.some((a) => a.slot === d.slot)) flag(id, d, 'slot not in champions.json');
  }
}
if (!sus) console.log('  none');

console.log('\nsample (20 entries; data range = the ability\'s range in champions.json):');
const all: [string, DashDef][] = [];
for (const [id, defs] of Object.entries(DASHES)) for (const d of defs) all.push([id, d]);
const step = Math.max(1, Math.floor(all.length / 20));
for (let i = 0; i < all.length && i / step < 20; i += step) {
  const [id, d] = all[i];
  const dataRange = byId.get(id)?.abilities.find((a) => a.slot === d.slot)?.range ?? '-';
  const flags = [d.overWalls && 'overWalls', d.stopsAtTarget && 'stopsAtTarget', d.resetOnKill && 'resetOnKill',
    d.charges && `charges ${d.charges}/${d.recastWindow}s`, d.cooldown && `cd ${d.cooldown.join('/')}`].filter(Boolean).join(', ');
  console.log(`  ${(id + ' ' + d.slot).padEnd(15)} ${d.name.padEnd(30).slice(0, 30)} ${d.kind.padEnd(5)} ${String(d.range).padStart(5)} (data ${String(dataRange).padStart(5)}) ` +
    `${d.speed ? 'v' + d.speed : '     '} ${d.target.padEnd(5)} [${d.use.join(',')}]${flags ? '  ' + flags : ''}`);
}
