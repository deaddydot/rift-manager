// Comp checklist tuning: champion classification, the checklist for some known comps, and how many rows
// AI-drafted comps fill (plus the comfort numbers, to check the checklist nudge doesn't override comfort).
// npx tsx scripts/debug/checklist.ts [drafts=400]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { createNewGame, type Database } from '../../src/engine/setup';
import { setMeta, newDraft, runAIDraft, comfort, picksOf } from '../../src/engine/draft/draft';
import { compChecklist, contributions, damageKind, checklistGain, checklistFills, CHECKLIST_ROWS } from '../../src/engine/draft/checklist';
import { draftTeam } from '../../src/engine/season/prep';
import { RNG } from '../../src/util/rng';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map(gd().champions.map((c) => [norm(c.name), c.id]));
const ids = (names: string[]) => names.map((n) => { const id = byName.get(norm(n)); if (!id) throw new Error(`unknown champion ${n}`); return id; });

// ---- classification
const all = gd().champions;
const kinds: Record<string, string[]> = { physical: [], magic: [], hybrid: [], none: [] };
for (const c of all) kinds[damageKind(c) ?? 'none'].push(c.name);
console.log(`damage kinds: physical ${kinds.physical.length}, magic ${kinds.magic.length}, hybrid ${kinds.hybrid.length}, no real damage ${kinds.none.length}`);
console.log(`  hybrid: ${kinds.hybrid.join(', ')}`);
console.log(`  no damage: ${kinds.none.join(', ')}`);
for (const r of CHECKLIST_ROWS) {
  const has = all.filter((c) => contributions(c)[r.key]);
  console.log(`  ${r.label.padEnd(12)} ${String(has.length).padStart(3)} champions${r.key === 'utility' ? `: ${has.map((c) => c.name).join(', ')}` : ''}`);
}

// ---- known comps
const COMPS: [string, string[]][] = [
  ['Engage teamfight', ['Ornn', 'Sejuani', 'Orianna', "Kai'Sa", 'Rell']],
  ['Pro: front-to-back', ['Rumble', 'Sejuani', 'Azir', 'Varus', 'Rell']],
  ['Pro: dive', ['Aatrox', 'Xin Zhao', 'Orianna', "Kai'Sa", 'Leona']],
  ['Pro: pick/skirmish', ["K'Sante", 'Vi', 'Taliyah', 'Ezreal', 'Karma']],
  ['Pro: Gnar/Rakan', ['Gnar', 'Wukong', 'Ahri', 'Xayah', 'Rakan']],
  ['Pro: lane bully', ['Renekton', 'Lee Sin', 'Sylas', 'Kalista', 'Nautilus']],
  ['Protect the carry', ['Ornn', 'Maokai', 'Orianna', 'Aphelios', 'Lulu']],
  ['Poke siege', ['Jayce', 'Nidalee', 'Zoe', 'Ezreal', 'Lux']],
  ['Split push', ['Fiora', 'Graves', 'Twisted Fate', 'Lucian', 'Nami']],
  ['5 AD assassins', ['Riven', "Kha'Zix", 'Zed', 'Draven', 'Pyke']],
  ['All AP', ['Gwen', 'Lillia', 'Syndra', 'Ziggs', 'Karma']],
  ['Squishy dive', ['Akali', 'Nidalee', 'LeBlanc', 'Samira', 'Pyke']],
];
console.log('\nknown comps (✓ met / · unmet):');
for (const [name, names] of COMPS) {
  const rows = compChecklist(ids(names));
  const met = rows.filter((r) => r.met).length;
  console.log(`${name.padEnd(20)} ${met}/9  ${rows.map((r) => `${r.met ? '✓' : '·'}${r.label} ${r.have}/${r.goal}`).join('  ')}`);
  console.log(`${''.padEnd(26)}${names.join(' / ')}`);
}

// ---- gain: what the AI's checklist term sees for a last pick
for (const [name, four] of [['Riven / Kha\'Zix / Zed / Draven + ?', ['Riven', "Kha'Zix", 'Zed', 'Draven']], ['Ornn / Sejuani / Orianna / Kai\'Sa + ?', ['Ornn', 'Sejuani', 'Orianna', "Kai'Sa"]]] as [string, string[]][]) {
  const cur = ids(four);
  const best = all.filter((c) => !cur.includes(c.id) && c.positions.includes('support')).map((c) => ({ c, g: checklistGain(cur, c.id) })).sort((a, b) => b.g - a.g);
  const show = (x: { c: typeof all[number]; g: number }) => `${x.c.name} ${x.g.toFixed(2)} [${checklistFills(cur, x.c.id).join(', ')}]`;
  console.log(`\nsupport for ${name}: best ${best.slice(0, 4).map(show).join('; ')}\n  worst ${best.slice(-3).map(show).join('; ')}`);
}

// ---- AI drafts
const N = Number(process.argv[2] ?? 400);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const state = createNewGame(db, 't1-lck', 'Tester', 12345);
const teams = Object.values(state.teams).filter((t) => t.roster.length >= 5);
const rng = new RNG(77);
const hist = Array(10).fill(0), rowMet: Record<string, number> = {};
let comps = 0, picks = 0, inPool = 0, comfSum = 0, low = 0, noMagic = 0, noPhys = 0;
for (let g = 0; g < N; g++) {
  const a = teams[rng.int(0, teams.length - 1)], b = teams[rng.int(0, teams.length - 1)];
  if (a === b) continue;
  let da, dbt;
  try { da = draftTeam(state, a); dbt = draftTeam(state, b); } catch { continue; }
  const d = newDraft(da, dbt);
  runAIDraft(d, rng);
  for (const side of [0, 1] as const) {
    const ps = picksOf(d, side);
    const rows = compChecklist(ps.map((x) => x.champion!));
    comps++; hist[rows.filter((r) => r.met).length]++;
    for (const r of rows) if (r.met) rowMet[r.label] = (rowMet[r.label] ?? 0) + 1;
    if (!rows.find((r) => r.key === 'magic')!.met) noMagic++;
    if (!rows.find((r) => r.key === 'physical')!.met) noPhys++;
    for (const act of ps) {
      const p = d.teams[side].players.find((x) => x.role === act.role)!;
      const c = comfort(p, act.champion!, act.role!);
      picks++; comfSum += c; if (p.champions[act.champion!]) inPool++; if (c < 0.6) low++;
    }
  }
}
const pc = (x: number, n = comps) => `${(x / n * 100).toFixed(0)}%`;
console.log(`\n${comps} AI-drafted comps: rows met avg ${(hist.reduce((s, v, i) => s + v * i, 0) / comps).toFixed(2)}/9`);
console.log(`  distribution: ${hist.map((v, i) => `${i}:${pc(v)}`).join(' ')}`);
console.log(`  per row: ${CHECKLIST_ROWS.map((r) => `${r.label} ${pc(rowMet[r.label] ?? 0)}`).join(', ')}`);
console.log(`  no magic damage ${pc(noMagic)}, no physical ${pc(noPhys)}`);
console.log(`  ${picks} picks: ${pc(inPool, picks)} from the player's pool, avg comfort ${(comfSum / picks).toFixed(3)}, ${pc(low, picks)} low-comfort (<0.60)`);
