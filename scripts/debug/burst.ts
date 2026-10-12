import fs from 'node:fs';
import path from 'node:path';
import { setGameData, gd } from '../../src/data/gamedata';
import { computeStats, itemsFromGold, purchaseOrder, abilityRanks, skillOrder } from '../../src/engine/sim/champstats';
const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
const lvl = Number(process.argv[2] ?? 6), gold = Number(process.argv[3] ?? 3500);
const rows: [string, number, string][] = [];
for (const c of gd().champions) {
  const role = c.positions[0] ?? 'mid';
  const items = itemsFromGold(purchaseOrder(c, role), gold);
  const st = computeStats(c, lvl, items, { dragons: {}, t: 600 }, role);
  const ranks = abilityRanks(lvl, skillOrder(c));
  let total = 0; const parts: string[] = [];
  for (const a of c.abilities) {
    const r = ranks[a.slot]; const d = a.damage;
    if (!r || !d) continue;
    const dmg = (d.base[Math.min(r, d.base.length) - 1] ?? 0) + (d.ap ?? 0) * st.ap + (d.ad ?? 0) * st.ad + (d.bonusAd ?? 0) * st.bonusAd + (d.targetMaxHp ?? 0) * 1500 * ((d.targetMaxHp ?? 0) > 0.5 ? 0.01 : 1) + (d.bonusHp ?? 0) * st.bonusHp + (d.maxHp ?? 0) * st.maxHp;
    total += dmg; parts.push(`${a.slot}:${dmg.toFixed(0)}`);
  }
  rows.push([c.id, total, `${parts.join(' ')} | AD ${st.ad.toFixed(0)} AP ${st.ap.toFixed(0)} HP ${st.maxHp.toFixed(0)} AS ${st.as.toFixed(2)}`]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const r of [...rows.slice(0, 15), ...rows.slice(-8)]) console.log(r[0].padEnd(13), r[1].toFixed(0).padStart(6), r[2]);
const avg = rows.reduce((s, r) => s + r[1], 0) / rows.length; console.log('avg burst', avg.toFixed(0));
