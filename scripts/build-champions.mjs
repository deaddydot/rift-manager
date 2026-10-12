// Compiles Riot Data Dragon + Meraki Analytics champion data into a compact,
// simulation-ready champions.json and downloads champion / ability icons.
//
// Inputs (data-raw/src):  ddragon_championFull.json, meraki_champions.json
// Optional:              scripts/data/champion-profiles.json (hand-authored gameplay profiles)
// Outputs:               public/data/champions.json, public/img/champions/*.webp, public/img/abilities/*.webp

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data-raw/src');
const OUT = path.join(ROOT, 'public/data');
const IMG = path.join(ROOT, 'public/img');
const DD_VERSION = JSON.parse(fs.readFileSync(path.join(SRC, 'ddragon_championFull.json'), 'utf8')).version;

const dd = JSON.parse(fs.readFileSync(path.join(SRC, 'ddragon_championFull.json'), 'utf8')).data;
const meraki = JSON.parse(fs.readFileSync(path.join(SRC, 'meraki_champions.json'), 'utf8'));
const profilesFile = path.join(ROOT, 'scripts/data/champion-profiles.json');
const profiles = fs.existsSync(profilesFile) ? JSON.parse(fs.readFileSync(profilesFile, 'utf8')) : {};

const ADAPTIVE_OVERRIDE = { Locke: 'ap' };
const POS_MAP = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', SUPPORT: 'support' };

const CC_PATTERNS = [
  ['suppress', /suppress/i],
  ['stun', /\bstun/i],
  ['knockup', /knock(?:s|ing|ed)? (?:up|airborne)|knocked up|airborne|knock(?:s|ing|ed)? (?:back|away|aside)|pull(?:s|ing)? (?:them|the target|enemies)|displac/i],
  ['charm', /\bcharm/i],
  ['taunt', /\btaunt/i],
  ['fear', /\bfear|\bflee|terrif/i],
  ['sleep', /\bdrows|\basleep|\bsleep/i],
  ['root', /\broot|\bsnare|\bimmobiliz|\bground(?:s|ed)? and/i],
  ['polymorph', /polymorph/i],
  ['silence', /\bsilenc/i],
  ['blind', /\bblind|nearsight/i],
  ['slow', /\bslow/i],
];
const CC_DEFAULT_DURATION = { suppress: 1.5, knockup: 0.9, stun: 1.25, charm: 1.25, taunt: 1.25, fear: 1.25, sleep: 1.5, root: 1.4, polymorph: 1.5, silence: 1.25, blind: 1.5, slow: 1.75 };
const HARD_CC = new Set(['suppress', 'knockup', 'stun', 'charm', 'taunt', 'fear', 'sleep', 'polymorph']);

function rankValues(values, n) {
  // Normalise a Meraki value array to n ranks (some are per-level arrays of 18).
  if (!values?.length) return Array(n).fill(0);
  if (values.length === n) return values.map(Number);
  if (values.length === 1) return Array(n).fill(Number(values[0]));
  // Level-scaled (18 entries) -> sample at levels where ranks are typically reached.
  const levels = n === 3 ? [6, 11, 16] : [1, 4, 7, 10, 13];
  return levels.map((lv) => Number(values[Math.min(values.length - 1, lv - 1)]));
}

function parseModifiers(leveling, ranks) {
  // Returns { base[], ap, ad, bonusAd, maxHpPct, missingHpPct, bonusHp, armorPct }
  const out = { base: Array(ranks).fill(0), ap: 0, ad: 0, bonusAd: 0, targetMaxHp: 0, targetMissingHp: 0, bonusHp: 0, maxHp: 0, bonusArmor: 0, bonusMr: 0 };
  for (const m of leveling.modifiers) {
    const unit = (m.units?.[0] ?? '').trim();
    const vals = rankValues(m.values, ranks);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (unit === '' || unit === 'seconds' || unit === 'units') {
      for (let i = 0; i < ranks; i++) out.base[i] += vals[i];
    } else if (/per 100 ap/i.test(unit)) {
      out.ap += avg / 10000; // rough
    } else if (/^% AP$/i.test(unit) || /% of .*AP/i.test(unit)) out.ap += avg / 100;
    else if (/bonus AD/i.test(unit)) out.bonusAd += avg / 100;
    else if (/^% AD$/i.test(unit)) out.ad += avg / 100;
    else if (/target'?s? .*maximum health|of the target's maximum health/i.test(unit)) out.targetMaxHp += avg / 100;
    else if (/target'?s? .*missing health/i.test(unit)) out.targetMissingHp += avg / 100;
    else if (/bonus health/i.test(unit)) out.bonusHp += avg / 100;
    else if (/maximum health/i.test(unit)) out.maxHp += avg / 100;
    else if (/bonus armor/i.test(unit)) out.bonusArmor += avg / 100;
    else if (/bonus magic resist/i.test(unit)) out.bonusMr += avg / 100;
  }
  return out;
}

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
function compactScaling(s) {
  const o = { base: s.base.map((v) => round(v, 1)) };
  for (const k of ['ap', 'ad', 'bonusAd', 'targetMaxHp', 'targetMissingHp', 'bonusHp', 'maxHp', 'bonusArmor', 'bonusMr']) if (s[k]) o[k] = round(s[k]);
  return o;
}

function damageScore(attr) {
  const a = attr.toLowerCase();
  if (!/damage/.test(a)) return -1;
  if (/minion|monster|non-champion|reduced|increased damage|damage reduction|reduction|per stack|bullets stored|sweetspot|secondary|collision/.test(a)) return -1;
  let s = 1;
  if (/^total|combined total/.test(a)) s += 3;
  if (/^maximum/.test(a)) s += 1.5;
  if (/^minimum/.test(a)) s -= 0.5;
  if (/per tick|per second|per hit|per shot|per bolt|per bullet/.test(a)) s -= 0.3;
  if (/bonus/.test(a)) s -= 0.2;
  return s;
}

function parseAbility(slot, variants, ddSpell) {
  const a = variants[0];
  const ranks = slot === 'R' ? 3 : 5;
  const text = a.effects.map((e) => e.description).join(' ');
  const attrs = a.effects.flatMap((e) => e.leveling);

  // ---- damage
  let best = null;
  let bestScore = -1;
  for (const l of attrs) {
    const sc = damageScore(l.attribute);
    if (sc > bestScore) { bestScore = sc; best = l; }
  }
  let damage = null;
  if (best) {
    const s = parseModifiers(best, ranks);
    const lower = best.attribute.toLowerCase();
    // DoT style abilities: approximate total over ~3 ticks/seconds
    let mult = 1;
    if (/per tick/.test(lower)) mult = 4;
    else if (/per second/.test(lower)) mult = 3;
    else if (/per (hit|shot|bolt|bullet)/.test(lower)) mult = 3;
    if (mult !== 1) { s.base = s.base.map((v) => v * mult); for (const k of Object.keys(s)) if (k !== 'base') s[k] *= mult; }
    // average min / max style ranges
    if (/^maximum/.test(lower)) {
      const min = attrs.find((l) => l.attribute.toLowerCase() === lower.replace('maximum', 'minimum'));
      if (min) {
        const m = parseModifiers(min, ranks);
        s.base = s.base.map((v, i) => (v + m.base[i]) / 2);
        for (const k of Object.keys(s)) if (k !== 'base') s[k] = (s[k] + m[k]) / 2;
      }
    }
    let type = 'magic';
    if (/physical/.test(lower) || a.damageType === 'PHYSICAL_DAMAGE') type = 'physical';
    if (/true/.test(lower) || a.damageType === 'TRUE_DAMAGE') type = 'true';
    if (/magic/.test(lower)) type = 'magic';
    if (s.base.some((v) => v > 0) || s.ap || s.ad || s.bonusAd || s.targetMaxHp) damage = { type, ...compactScaling(s) };
  }

  // ---- crowd control
  let cc = null;
  for (const [type, re] of CC_PATTERNS) {
    if (re.test(text)) {
      if (type === 'slow' && cc) continue;
      // Duration: "for X seconds" nearest after keyword, or leveling attributes
      let duration = null;
      const durAttr = attrs.find((l) => new RegExp(type === 'knockup' ? 'knock|airborne|disable' : type + '|disable', 'i').test(l.attribute) && /duration/i.test(l.attribute));
      if (durAttr) duration = rankValues(durAttr.modifiers[0].values, ranks).reduce((x, y) => x + y, 0) / ranks;
      if (!duration) {
        const idx = text.search(re);
        const m = /for (\d+(?:\.\d+)?)(?: \/ [\d.]+)*(?: \(based on [^)]*\))? seconds?/i.exec(text.slice(idx, idx + 220));
        if (m) duration = Number(m[1]);
      }
      if (!duration || duration > 4) duration = CC_DEFAULT_DURATION[type];
      const c = { type, duration: round(duration, 2) };
      if (type === 'slow') {
        const sl = attrs.find((l) => /^slow$|maximum slow|enhanced slow|movement speed modifier/i.test(l.attribute));
        c.amount = sl ? round(rankValues(sl.modifiers[0].values, ranks).reduce((x, y) => x + y, 0) / ranks / 100, 2) : 0.3;
      }
      if (!cc || (HARD_CC.has(type) && !HARD_CC.has(cc.type))) cc = c;
      if (HARD_CC.has(type)) break;
    }
  }

  // ---- shields / heals / buffs
  const shieldAttr = attrs.find((l) => /shield/i.test(l.attribute) && !/duration/i.test(l.attribute));
  const healAttr = attrs.find((l) => /^(total |maximum |minimum )?heal|healing$/i.test(l.attribute));
  const shield = shieldAttr ? compactScaling(parseModifiers(shieldAttr, ranks)) : null;
  const heal = healAttr ? compactScaling(parseModifiers(healAttr, ranks)) : null;
  const msAttr = attrs.find((l) => /bonus movement speed/i.test(l.attribute));
  const asAttr = attrs.find((l) => /bonus attack speed/i.test(l.attribute));

  const dash = /\b(dash|blink|leap|lunge|jump|vault|teleport|charges? (?:forward|toward)|surges?|hops?)\b/i.test(text) && !/enemies? (?:hit|struck) (?:are|by) (?:pulled|dashed)/i.test(text);
  const stealth = /\b(invisib|camouflag|untargetable|stealth)/i.test(text);
  const targeting = (a.targeting ?? 'Auto').toLowerCase();
  const tgt = targeting.startsWith('passive') ? 'passive' : targeting.startsWith('direction') || targeting.startsWith('vector') ? 'skillshot' : targeting.startsWith('unit') ? 'targeted' : targeting.startsWith('location') ? 'area' : 'self';
  const aoe = /aoe|area/i.test(a.spellEffects ?? '') || /nearby enemies|enemies (?:hit|within|in the area|in a)/i.test(text);
  const cdArr = (a.cooldown?.modifiers?.[0]?.values ?? ddSpell?.cooldown ?? []).map(Number);
  let range = ddSpell?.range?.[0] ?? 0;
  if (range >= 20000) range = 25000; // global
  if (!range || range < 125) range = tgt === 'self' ? 350 : 550;

  return {
    slot,
    name: a.name,
    icon: null,
    targeting: tgt,
    aoe,
    cooldown: rankValues(cdArr, ranks).map((v) => round(v, 2)),
    range: Math.round(range),
    damage,
    cc,
    shield,
    heal,
    dash,
    stealth,
    msBuff: msAttr ? round(rankValues(msAttr.modifiers[0].values, ranks).at(-1) / 100, 2) : 0,
    asBuff: asAttr ? round(rankValues(asAttr.modifiers[0].values, ranks).at(-1) / 100, 2) : 0,
    description: (a.blurb ?? a.effects[0]?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
  };
}

function statsFromMeraki(s) {
  return {
    hp: s.health.flat, hpPerLevel: s.health.perLevel,
    hpRegen: s.healthRegen.flat, hpRegenPerLevel: s.healthRegen.perLevel,
    mana: s.mana.flat, manaPerLevel: s.mana.perLevel,
    armor: s.armor.flat, armorPerLevel: s.armor.perLevel,
    mr: s.magicResistance.flat, mrPerLevel: s.magicResistance.perLevel,
    ad: s.attackDamage.flat, adPerLevel: s.attackDamage.perLevel,
    as: s.attackSpeed.flat, asRatio: s.attackSpeedRatio.flat || s.attackSpeed.flat, asPerLevel: s.attackSpeed.perLevel / 100,
    range: s.attackRange.flat, ms: s.movespeed.flat,
  };
}
function statsFromDD(s) {
  return {
    hp: s.hp, hpPerLevel: s.hpperlevel, hpRegen: s.hpregen / 5 * 5, hpRegenPerLevel: s.hpregenperlevel,
    mana: s.mp, manaPerLevel: s.mpperlevel, armor: s.armor, armorPerLevel: s.armorperlevel,
    mr: s.spellblock, mrPerLevel: s.spellblockperlevel, ad: s.attackdamage, adPerLevel: s.attackdamageperlevel,
    as: s.attackspeed, asRatio: s.attackspeed, asPerLevel: s.attackspeedperlevel / 100, range: s.attackrange, ms: s.movespeed,
  };
}

// Heuristic gameplay profile derived from class + ability kit. Hand-authored
// profiles in scripts/data/champion-profiles.json override any field.
function deriveProfile(id, m, abilities, tags, attackType) {
  const roles = new Set((m?.roles ?? tags.map((t) => t.toUpperCase())).map((r) => r.toUpperCase()));
  const ar = m?.attributeRatings ?? { damage: 2, toughness: 2, control: 2, mobility: 2, utility: 2 };
  const has = (r) => roles.has(r);
  const hardCC = abilities.filter((a) => a.cc && HARD_CC.has(a.cc.type)).length;
  const dashes = abilities.filter((a) => a.dash).length;
  const aoeDmg = abilities.filter((a) => a.aoe && a.damage).length;
  const clamp = (x) => Math.max(1, Math.min(10, Math.round(x)));
  const p = {
    early: 5, mid: 6, late: 5,
    laning: 5, waveclear: 3 + aoeDmg * 1.5, teamfight: 4 + aoeDmg + hardCC * 0.7, engage: 2 + hardCC * 1.5 + dashes * 0.6,
    peel: 2 + hardCC, poke: 3, burst: 3 + ar.damage, dps: 3 + ar.damage, tankiness: 1 + ar.toughness * 2.6,
    mobility: 1 + ar.mobility * 2.3, cc: 1 + ar.control * 2.3, splitpush: 3, pick: 3 + hardCC, sustain: 3,
    objective: 4, roam: 3 + ar.mobility, scaling: 5,
  };
  if (has('MARKSMAN')) Object.assign(p, { late: 8, early: 4, dps: 9, burst: 4, splitpush: 4, objective: 7, scaling: 8, teamfight: p.teamfight + 1 });
  if (has('ASSASSIN')) Object.assign(p, { burst: 9, pick: p.pick + 3, roam: p.roam + 2, early: 6, teamfight: p.teamfight - 1, mobility: p.mobility + 1 });
  if (has('MAGE') || has('BURST')) Object.assign(p, { poke: 6, burst: Math.max(p.burst, 7), waveclear: p.waveclear + 1 });
  if (has('ARTILLERY')) Object.assign(p, { poke: 9, burst: 6, teamfight: p.teamfight + 1, engage: 1 });
  if (has('BATTLEMAGE')) Object.assign(p, { dps: 7, teamfight: p.teamfight + 1, sustain: 5 });
  if (has('JUGGERNAUT')) Object.assign(p, { tankiness: 7, dps: 7, splitpush: 7, sustain: 7, mobility: 2, laning: 6 });
  if (has('DIVER')) Object.assign(p, { engage: p.engage + 2, early: 6, pick: p.pick + 1 });
  if (has('SKIRMISHER')) Object.assign(p, { splitpush: 8, dps: 8, laning: 6, late: 7 });
  if (has('VANGUARD')) Object.assign(p, { engage: 9, tankiness: 8, teamfight: p.teamfight + 2 });
  if (has('WARDEN')) Object.assign(p, { peel: 9, tankiness: 8 });
  if (has('CATCHER')) Object.assign(p, { pick: 9, engage: Math.max(p.engage, 6) });
  if (has('ENCHANTER')) Object.assign(p, { peel: 8, sustain: 8, burst: 2, dps: 2, teamfight: p.teamfight + 1, scaling: 7 });
  if (has('SPECIALIST')) Object.assign(p, { splitpush: Math.max(p.splitpush, 6) });
  if (attackType === 'RANGED' && !has('MARKSMAN')) p.poke += 1;
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = clamp(v);
  return out;
}

async function downloadImage(url, dest, size) {
  if (fs.existsSync(dest)) return true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize(size, size).webp({ quality: 82 }).toFile(dest);
    return true;
  } catch (e) {
    console.warn('image failed', url, e.message);
    return false;
  }
}

const champions = [];
fs.mkdirSync(path.join(IMG, 'champions'), { recursive: true });
fs.mkdirSync(path.join(IMG, 'abilities'), { recursive: true });
const jobs = [];

for (const id of Object.keys(dd).sort()) {
  const d = dd[id];
  const m = meraki[id];
  const slots = ['Q', 'W', 'E', 'R'];
  const abilities = slots.map((slot, i) => {
    const ddSpell = d.spells[i];
    if (m) return parseAbility(slot, m.abilities[slot], ddSpell);
    // Data Dragon fallback (newest champions not yet in Meraki)
    return {
      slot, name: ddSpell.name, icon: null, targeting: 'skillshot', aoe: /enemies|area|nearby/i.test(ddSpell.description),
      cooldown: ddSpell.cooldown.map(Number), range: Math.min(25000, ddSpell.range[0] || 550), damage: null, cc: null, shield: null, heal: null,
      dash: /dash|leap|blink/i.test(ddSpell.description), stealth: false, msBuff: 0, asBuff: 0,
      description: ddSpell.description.replace(/<[^>]+>/g, '').slice(0, 600),
    };
  });
  abilities.forEach((a, i) => {
    a.icon = `img/abilities/${d.spells[i].id}.webp`;
    jobs.push([`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/spell/${d.spells[i].image.full}`, path.join(IMG, 'abilities', d.spells[i].id + '.webp'), 64]);
  });
  const passive = {
    name: d.passive.name,
    description: (m?.abilities.P[0]?.effects?.map((e) => e.description).join(' ') ?? d.passive.description).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 600),
    icon: `img/abilities/${id}_P.webp`,
  };
  jobs.push([`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/passive/${d.passive.image.full}`, path.join(IMG, 'abilities', id + '_P.webp'), 64]);
  jobs.push([`https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/champion/${d.image.full}`, path.join(IMG, 'champions', id + '.webp'), 96]);

  // Hand-authored ability overrides (newest champions not covered by Meraki)
  const authoredEarly = profiles[id] ?? {};
  if (authoredEarly.abilityOverrides) {
    for (const a of abilities) {
      const o = authoredEarly.abilityOverrides[a.slot];
      if (!o) continue;
      if (o.damage) a.damage = o.damage;
      if ('cc' in o) a.cc = o.cc;
      if ('shield' in o) a.shield = o.shield;
      if ('heal' in o) a.heal = o.heal;
      if ('dash' in o) a.dash = o.dash;
      if (o.range) a.range = o.range;
    }
  }
  const attackType = m?.attackType ?? (d.stats.attackrange > 300 ? 'RANGED' : 'MELEE');
  const positions = (m?.positions ?? []).map((p) => POS_MAP[p]).filter(Boolean);
  const derived = deriveProfile(id, m, abilities, d.tags, attackType);
  const authored = profiles[id] ?? {};
  champions.push({
    id,
    key: Number(d.key),
    name: d.name,
    title: d.title,
    tags: d.tags,
    classes: (m?.roles ?? d.tags.map((t) => t.toUpperCase())).map((r) => r.toLowerCase()),
    positions: authored.positions ?? positions,
    attackType: attackType.toLowerCase(),
    adaptive: ADAPTIVE_OVERRIDE[id] ?? ((m?.adaptiveType ?? (d.info.magic > d.info.attack ? 'MAGIC_DAMAGE' : 'PHYSICAL_DAMAGE')) === 'MAGIC_DAMAGE' ? 'ap' : 'ad'),
    resource: d.partype,
    difficulty: (profiles[id]?.difficulty) ?? d.info.difficulty,
    ratings: m?.attributeRatings ? { damage: m.attributeRatings.damage, toughness: m.attributeRatings.toughness, control: m.attributeRatings.control, mobility: m.attributeRatings.mobility, utility: m.attributeRatings.utility } : null,
    stats: m ? statsFromMeraki(m.stats) : statsFromDD(d.stats),
    passive,
    abilities,
    profile: { ...derived, clear: 3, gank: 3, blind: 5, ...(authored.profile ?? {}) },
    archetype: authored.archetype ?? null,
    powerSpikes: authored.powerSpikes ?? [],
    notes: authored.notes ?? '',
    image: `img/champions/${id}.webp`,
    releaseDate: m?.releaseDate ?? null,
  });
}

// Download images with small concurrency
let done = 0;
const queue = [...jobs];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (queue.length) {
    const [url, dest, size] = queue.shift();
    await downloadImage(url, dest, size);
    done++;
    if (done % 100 === 0) console.log(`  images ${done}/${jobs.length}`);
  }
}));

fs.mkdirSync(OUT, { recursive: true });
// per-champion item builds from op.gg (if collected)
{
  const { mergeBuilds, mergeMatchups } = await import('./lib/builds.mjs');
  console.log(`matchups: ${mergeMatchups(champions, ROOT)} champion-role tables`);
  const itemsFile = path.join(OUT, 'items.json');
  if (fs.existsSync(itemsFile)) console.log(`builds: ${mergeBuilds(champions, JSON.parse(fs.readFileSync(itemsFile, 'utf8')).items, ROOT)} champion-role builds`);
}
fs.writeFileSync(path.join(OUT, 'champions.json'), JSON.stringify({ version: DD_VERSION, champions }));
console.log(`Wrote ${champions.length} champions (patch ${DD_VERSION})`);
const noDmg = champions.flatMap((c) => c.abilities.filter((a) => !a.damage && !a.shield && !a.heal && !a.cc).map((a) => `${c.id}.${a.slot}`));
console.log('Abilities with no parsed effect:', noDmg.length);
