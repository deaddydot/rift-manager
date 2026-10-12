// Personal profile: off-the-Rift stats (looks, humor, charisma, height…) generated deterministically per player
// (seeded by id, lightly correlated with personality and attributes), plus one-time assignment of the extended
// traits (traitsMore.ts). Both are filled lazily (`ensurePersona`) so old saves load unchanged; values are
// fictional game numbers, not claims about real people.
import type { GameState, HiddenAttributes, Player, PlayerAttributes, PlayerPersona } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { TRAIT_SPECS, type AssignCtx, type TraitSpec } from '../traitsMore';

export type PersonaKey = Exclude<keyof PlayerPersona, 'followers'>;
export const PERSONA_LABEL: Record<PersonaKey, string> = {
  height: 'Height', looks: 'Looks', humor: 'Humor', charisma: 'Charisma', smarts: 'Smarts', media: 'Media savvy', stamina: 'Stamina',
  comms: 'Comms clarity', online: 'Online presence', style: 'Style', languages: 'Languages',
};
export const PERSONA_HINT: Record<PersonaKey, string> = {
  height: 'Public.', looks: 'Camera presence: stream appeal, merch and sponsors.', humor: 'Stream appeal and locker-room chemistry.',
  charisma: 'Stream appeal, sponsors, leadership.', smarts: 'Learning off the Rift: training gains (macro, vision, adaptability) and champion learning.',
  media: 'Interviews and press: good press vs. gaffes, sponsor appeal.', stamina: 'Fatigue build-up and recovery, travel.', comms: 'Voice comms: in-game shotcalling.',
  online: 'Social-media activity: stream growth, but more online drama.', style: 'Fashion sense: merch and apparel sponsors.', languages: 'Public. Fewer language barriers and better bonds abroad.',
};
/** Hidden profile stats (revealed by scouting); height and languages are public. */
export const PERSONA_HIDDEN: PersonaKey[] = ['looks', 'humor', 'charisma', 'smarts', 'media', 'stamina', 'comms', 'online', 'style'];

const HEIGHT: Record<string, number> = {
  'South Korea': 175, China: 174, Taiwan: 173, 'Hong Kong': 173, Japan: 171, Vietnam: 168, Thailand: 169, Philippines: 166, Indonesia: 166, Malaysia: 168, Singapore: 172,
  'United States': 177, Canada: 177, Mexico: 171, Brazil: 175, Argentina: 175, Chile: 172, Peru: 167, Colombia: 172, Australia: 178, 'New Zealand': 177,
  Germany: 180, Denmark: 181, Netherlands: 182, Sweden: 180, Norway: 180, Finland: 180, Estonia: 181, Latvia: 180, Lithuania: 181, Poland: 179, Czechia: 180, 'Czech Republic': 180,
  Slovakia: 180, Croatia: 181, Serbia: 181, Slovenia: 180, Bosnia: 181, Montenegro: 182, Belgium: 179, Austria: 179, Switzerland: 178, France: 177, Spain: 176, Italy: 176,
  Portugal: 174, 'United Kingdom': 177, England: 177, Ireland: 177, Greece: 177, Turkey: 175, Russia: 177, Ukraine: 178, Romania: 175, Bulgaria: 176, Hungary: 177,
  Israel: 176, Egypt: 172, Morocco: 173, Algeria: 173, Tunisia: 173, 'Saudi Arabia': 171,
};
// chance of a second language (mostly English) by country; Europe and SEA lead, East Asia trails
const SECOND: Record<string, number> = {
  Netherlands: 0.9, Denmark: 0.88, Sweden: 0.88, Norway: 0.88, Finland: 0.8, Estonia: 0.75, Germany: 0.7, Belgium: 0.75, Austria: 0.7, Switzerland: 0.8, Slovenia: 0.7,
  Poland: 0.6, Czechia: 0.6, 'Czech Republic': 0.6, Croatia: 0.65, Serbia: 0.6, Greece: 0.55, Portugal: 0.6, France: 0.45, Spain: 0.45, Italy: 0.45, Turkey: 0.4,
  Philippines: 0.75, Singapore: 0.85, Malaysia: 0.65, Vietnam: 0.25, Thailand: 0.3, Indonesia: 0.35, Brazil: 0.35, Argentina: 0.4, Chile: 0.35, Mexico: 0.35,
  'South Korea': 0.22, China: 0.18, Taiwan: 0.3, 'Hong Kong': 0.6, Japan: 0.15, 'United States': 0.15, Canada: 0.35, 'United Kingdom': 0.15, Australia: 0.15,
};
const EN = ['United States', 'Canada', 'United Kingdom', 'England', 'Ireland', 'Australia', 'New Zealand', 'Scotland', 'Wales'];
const ES = ['Spain', 'Mexico', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Uruguay', 'Venezuela'];
const LANG_FAMILY: Record<string, string> = {
  ...Object.fromEntries(EN.map((c) => [c, 'en'])), ...Object.fromEntries(ES.map((c) => [c, 'es'])),
  Brazil: 'pt', Portugal: 'pt', Germany: 'de', Austria: 'de', Switzerland: 'de', France: 'fr', Belgium: 'fr', China: 'zh', Taiwan: 'zh', 'Hong Kong': 'zh',
  Serbia: 'sh', Croatia: 'sh', Bosnia: 'sh', Montenegro: 'sh',
};
/** Rough first language of a country (teammates sharing it bond more easily). */
export const languageOf = (country: string) => LANG_FAMILY[country] ?? country;

const ageAt = (p: Player, date: string) => (p.birthdate ? (new Date(date).getTime() - new Date(p.birthdate).getTime()) / (365.25 * 864e5) : 22);
const ovrish = (a: PlayerAttributes) => (a.mechanics + a.laning + a.teamfight + a.macro + a.farming + a.consistency) / 6;

/** The profile a player would be generated with (pure; deterministic per player id, so previews match what gets stored). */
export function generatePersona(p: Player): PlayerPersona {
  const r = new RNG(hashString(p.id + ':persona'));
  const n = (m: number, sd: number) => clamp(Math.round(r.normal(m, sd)), 1, 99);
  const h = p.hidden, a = p.attributes, t = new Set(p.traits);
  const age = clamp(ageAt(p, '2026-01-02'), 16, 32); // fixed reference date: no drift between preview and storage
  // light correlations, centred on the database averages (attributes ~45, ego ~31, professionalism ~67…)
  const looks = n(50 + (t.has('fan_favorite') ? 5 : 0), 15);
  const humor = n(50 + (55 - h.composure) * 0.08 + (h.ego - 31) * 0.06 + (t.has('party_animal') ? 6 : 0), 15);
  const charisma = n(50 + (a.shotcalling - 43) * 0.25 + (h.ego - 31) * 0.12 + (p.reputation - 35) * 0.08 + (t.has('fan_favorite') ? 8 : 0) + (t.has('shotcaller') ? 6 : 0), 14);
  const smarts = n(50 + (a.macro - 45) * 0.3 + (a.adaptability - 46) * 0.2, 13);
  const media = n(50 + (h.professionalism - 67) * 0.35 + (age - 23) * 1.2 + (t.has('veteran') ? 6 : 0), 14);
  const stamina = n(55 - (h.injuryProne - 22) * 0.5 + (h.workEthic - 62) * 0.15 + (t.has('grinder') ? 5 : 0), 13);
  const comms = n(50 + (a.shotcalling - 43) * 0.45 + (a.macro - 45) * 0.1 + (t.has('shotcaller') ? 10 : 0), 12);
  const online = n(47 + (p.streamer ? 8 : 0) + (h.ego - 31) * 0.2 - (age - 23) * 1.5 + (t.has('party_animal') ? 8 : 0), 16);
  const style = n(50 + (looks - 50) * 0.3 + (h.ego - 31) * 0.1, 14);
  const height = clamp(Math.round(r.normal(HEIGHT[p.country] ?? 175, 6)), 158, 198);
  const second = (SECOND[p.country] ?? 0.4) + (smarts - 50) / 250 + Math.max(0, age - 20) * 0.02;
  let languages = 1 + (r.chance(clamp(second, 0.05, 0.95)) ? 1 : 0);
  if (languages === 2 && r.chance(clamp(second * 0.35 + (smarts - 50) / 300, 0.02, 0.5))) languages++;
  if (languages === 3 && r.chance(0.12)) languages++;
  const out: PlayerPersona = { height, looks, humor, charisma, smarts, media, stamina, comms, online, style, languages };
  if (p.streamer) {
    // following grows with fame and on-camera appeal (fictional numbers)
    const appeal = looks * 0.28 + humor * 0.3 + charisma * 0.27 + online * 0.15;
    out.followers = Math.round((300 + p.reputation ** 2.2 * 10 * (appeal / 50) ** 1.5) * (0.7 + r.next() * 0.6) / 10) * 10;
  }
  return out;
}

const derived = new WeakMap<Player, PlayerPersona>();
/** A player's profile: the stored one, or (old saves / not yet initialised) the one they would be generated with. */
export function personaOf(p: Player): PlayerPersona {
  if (p.persona) return p.persona;
  let s = derived.get(p);
  if (!s) { s = generatePersona(p); derived.set(p, s); }
  return s;
}

// ------------------------------------------------------------------ trait assignment
const NEG_WEIGHT = 0.4, NEU_WEIGHT = 0.8;
// database averages / spreads of the hidden attributes: assignment weights read them on a common 50 ± 15 scale
const H_NORM: Record<keyof HiddenAttributes, [number, number]> = {
  potential: [90, 25], farsight: [46, 14], mistakes: [49, 11], composure: [55, 14], snowball: [51, 14], resilience: [50, 13],
  workEthic: [62, 14], professionalism: [67, 13.5], ego: [31, 16], loyalty: [55, 16], injuryProne: [22, 11],
};

/** True if `id` can't sit next to the traits in `have` (exclusions are checked both ways). */
export function traitConflicts(id: string, have: Iterable<string>): boolean {
  const mine = TRAIT_SPECS[id]?.excl ?? [];
  for (const h of have) {
    if (h === id || mine.includes(h)) return true;
    if (TRAIT_SPECS[h]?.excl?.includes(id)) return true;
  }
  return false;
}

/**
 * What the assignment weights see: skill attributes as *relative strengths* (a player's best areas score high at
 * any level, stars score higher overall), aggression as is, hidden attributes on a common 50 ± 15 scale.
 */
export function assignCtx(p: Player, date: string): AssignCtx {
  const avg = ovrish(p.attributes);
  const a = { ...p.attributes };
  for (const k of Object.keys(a) as (keyof PlayerAttributes)[]) if (k !== 'aggression') a[k] = clamp(50 + (a[k] - avg) * 1.6 + (avg - 45) * 0.6, 1, 99);
  const h = { ...p.hidden };
  for (const k of Object.keys(H_NORM) as (keyof HiddenAttributes)[]) h[k] = clamp(50 + (p.hidden[k] - H_NORM[k][0]) / H_NORM[k][1] * 15, 1, 99);
  return { p, a, h, s: personaOf(p), age: ageAt(p, date), ovr: avg, role: p.role, rep: p.reputation, maxMastery: Math.max(0, ...Object.values(p.champions)) };
}

/**
 * 1–4 new traits from the extended catalogue: more for stars and veterans, fewer for young rookies; weighted by
 * attributes / hidden attributes / profile; negative traits rarer (and capped); exclusions respected.
 */
export function pickMoreTraits(p: Player, date: string): string[] {
  const rng = new RNG(hashString(p.id + ':traits'));
  const x = assignCtx(p, date);
  let n = 1 + (rng.chance(0.55) ? 1 : 0);
  if (x.ovr >= 62 || x.rep >= 60) n++;
  if (x.ovr >= 75) n++;
  if (x.age >= 25) n++;
  if (x.age < 19) n--;
  n = clamp(Math.min(n, Math.max(x.ovr >= 62 ? 2 : 1, 6 - p.traits.length)), 1, 4); // already trait-heavy players get fewer
  const have = new Set(p.traits);
  const added: string[] = [];
  const negCap = rng.chance(0.15) ? 2 : 1;
  let negs = 0;
  const specs = Object.values(TRAIT_SPECS);
  for (let i = 0; i < n; i++) {
    const cands: [TraitSpec, number][] = [];
    for (const t of specs) {
      if (have.has(t.id) || (t.kind === 'negative' && negs >= negCap) || traitConflicts(t.id, have)) continue;
      const w = t.w(x) * (t.kind === 'negative' ? NEG_WEIGHT * (x.ovr >= 65 ? 0.8 : 1) : t.kind === 'neutral' ? NEU_WEIGHT : 1);
      if (w > 0.02) cands.push([t, w]);
    }
    if (!cands.length) break;
    const [t] = rng.weighted(cands, (c) => c[1]);
    have.add(t.id);
    added.push(t.id);
    if (t.kind === 'negative') negs++;
  }
  return added;
}

/** Initialise the profile (and, once, the extended traits) of one player. Editor-made players keep their hand-picked traits. */
export function ensurePersona(p: Player, date: string) {
  if (p.persona) return;
  p.persona = { ...personaOf(p) };
  derived.delete(p);
  if (!p.isCustom && !p.id.startsWith('standin_')) p.traits.push(...pickMoreTraits(p, date));
}

/** Cheap daily pass: initialise anyone new (free agents, prospects, old saves). */
export function ensurePersonas(state: GameState) {
  for (const p of Object.values(state.players)) if (!p.persona) ensurePersona(p, state.date);
}
