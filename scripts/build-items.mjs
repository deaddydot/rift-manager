// Builds public/data/items.json (Summoner's Rift completed items + boots + key components)
// from Data Dragon (cost, icons) and Meraki (full stat lines incl. haste / penetration).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data-raw/src');
const ddFile = JSON.parse(fs.readFileSync(path.join(SRC, 'ddragon_item.json'), 'utf8'));
const dd = ddFile.data;
const meraki = JSON.parse(fs.readFileSync(path.join(SRC, 'meraki_items.json'), 'utf8'));
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, 'ddragon_championFull.json'), 'utf8')).version;

const BOOTS = ['3006', '3020', '3158', '3047', '3111', '3009', '3171', '3175', '3013'];
const COMPONENTS = ['1036', '1037', '1038', '1058', '1026', '1052', '1028', '1011', '1029', '1031', '1033', '1057', '3133', '3134', '3067', '3051', '1042', '1043', '3057', '3044', '3035', '3145', '3802', '1018', '2420', '3108', '3113', '3916', '3123', '3082', '3105', '4630', '6660', '3070', '3077', '3155', '3140', '1027', '3024', '3801', '2021', '2508', '3086', '6670', '1053', '3066', '3114', '4632', '4642', '3191', '3916'];

// starting items: Doran's (Blade, Ring, Shield, Bow, Helm), Cull, Dark Seal, World Atlas, jungle pets
const STARTERS = ['1054', '1055', '1056', '1086', '1120', '1083', '1082', '3865', '1101', '1102', '1103'];
// every component that a legendary or boots is built from (recursively), so partial builds are real items
const recipeParts = new Set();
const addParts = (id) => { for (const f of dd[id]?.from ?? []) if (!recipeParts.has(f)) { recipeParts.add(f); addParts(f); } };
for (const [id, d] of Object.entries(dd)) if (d.maps?.['11'] && d.gold.purchasable && Number(id) < 10000 && ((d.gold.total >= 2200 && !d.into?.length) || BOOTS.includes(id))) addParts(id);

const items = [];
const statOf = (m, k, field = 'flat') => m?.stats?.[k]?.[field] ?? 0;
for (const [id, d] of Object.entries(dd)) {
  if (!d.maps?.['11'] || !d.gold.purchasable || Number(id) > 10000) continue;
  const isBoot = BOOTS.includes(id);
  const isStarter = STARTERS.includes(id);
  const isLegendary = d.gold.total >= 2200 && !d.into?.length && !isStarter;
  const isComponent = COMPONENTS.includes(id) || recipeParts.has(id);
  if (!isBoot && !isLegendary && !isComponent && !isStarter) continue;
  const m = meraki[id];
  const s = d.stats ?? {};
  const stats = {
    ad: statOf(m, 'attackDamage') || s.FlatPhysicalDamageMod || 0,
    ap: statOf(m, 'abilityPower') || s.FlatMagicDamageMod || 0,
    hp: statOf(m, 'health') || s.FlatHPPoolMod || 0,
    armor: statOf(m, 'armor') || s.FlatArmorMod || 0,
    mr: statOf(m, 'magicResistance') || s.FlatSpellBlockMod || 0,
    as: (statOf(m, 'attackSpeed', 'percent') || (s.PercentAttackSpeedMod ?? 0) * 100) / 100,
    crit: (statOf(m, 'criticalStrikeChance', 'percent') || (s.FlatCritChanceMod ?? 0) * 100) / 100,
    ah: statOf(m, 'abilityHaste'),
    lethality: statOf(m, 'lethality'),
    armorPen: statOf(m, 'armorPenetration', 'percent') / 100,
    magicPen: statOf(m, 'magicPenetration'),
    magicPenPct: statOf(m, 'magicPenetration', 'percent') / 100,
    lifesteal: statOf(m, 'lifesteal', 'percent') / 100,
    omnivamp: statOf(m, 'omnivamp', 'percent') / 100,
    ms: statOf(m, 'movespeed') || s.FlatMovementSpeedMod || 0,
    msPct: (statOf(m, 'movespeed', 'percent') || (s.PercentMovementSpeedMod ?? 0) * 100) / 100,
    hsp: statOf(m, 'healAndShieldPower', 'percent') / 100,
    mana: statOf(m, 'mana') || s.FlatMPPoolMod || 0,
    hpRegen: statOf(m, 'healthRegen', 'percent') / 100,
    tenacity: statOf(m, 'tenacity', 'percent') / 100,
  };
  for (const k of Object.keys(stats)) { stats[k] = Math.round(stats[k] * 1000) / 1000; if (!stats[k]) delete stats[k]; }
  items.push({
    id, name: d.name, cost: d.gold.total, kind: isBoot ? 'boots' : isStarter ? 'starter' : isLegendary ? 'legendary' : 'component',
    from: d.from ?? [], tags: d.tags ?? [], stats, icon: `img/items/${id}.webp`,
    plaintext: (d.plaintext || m?.simpleDescription || '').slice(0, 140),
  });
}
fs.mkdirSync(path.join(ROOT, 'public/img/items'), { recursive: true });
await Promise.all(items.map(async (it) => {
  const dest = path.join(ROOT, 'public', it.icon);
  if (fs.existsSync(dest)) return;
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/item/${it.id}.png`, { signal: AbortSignal.timeout(30000) });
    if (res.ok) await sharp(Buffer.from(await res.arrayBuffer())).resize(48, 48).webp({ quality: 85 }).toFile(dest);
  } catch (e) { console.warn('icon failed', it.id, e.message); }
}));
fs.writeFileSync(path.join(ROOT, 'public/data/items.json'), JSON.stringify({ version: VERSION, items }));
console.log(`items.json: ${items.length} items (${items.filter((i) => i.kind === 'legendary').length} legendary, ${items.filter((i) => i.kind === 'component').length} components, ${items.filter((i) => i.kind === 'starter').length} starters)`);
