// Extended traits + personal profiles: catalogue and assignment report, profile examples, and measured effects
// (streaming, training, quick-sim power, full-engine smoke test, locker room, merch / sponsors, approaches).
// Usage: npx tsx scripts/debug/traits.ts [team=t1-lck] [seed=12345]
import fs from 'node:fs';
import path from 'node:path';
import { setGameData } from '../../src/data/gamedata';
import { createNewGame, overall, type Database } from '../../src/engine/setup';
import { POOL_CACHE } from '../../src/engine/game';
import { setMeta } from '../../src/engine/draft/draft';
import { RNG } from '../../src/util/rng';
import { TRAITS } from '../../src/engine/traits';
import { TRAIT_SPECS, TRAIT_GROUP_LABEL, type TraitGroup } from '../../src/engine/traitsMore';
import { personaOf, PERSONA_HIDDEN, PERSONA_LABEL } from '../../src/engine/management/persona';
import { streamAppeal, streamScore, merchAppeal, sponsorAppeal, approachMult, traitCompat, traitPower } from '../../src/engine/management/traitEffects';
import { personaWeekly } from '../../src/engine/management/personaTick';
import { weeklyTraining } from '../../src/engine/management/development';
import { quickDraft, quickSim, teamPowerFor, draftPicks } from '../../src/engine/season/series';
import { draftTeam, simTeam } from '../../src/engine/season/prep';
import { MatchSim } from '../../src/engine/sim/engine';
import { traitForm } from '../../src/engine/sim/traitSim';
import { ATTRIBUTE_KEYS, ROLES, type GameState, type Player, type Role } from '../../src/engine/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const gdata = setGameData({ champions: load('champions.json'), items: load('items.json'), navgrid: load('navgrid.json') });
setMeta(load('meta.json'));
POOL_CACHE.ids = gdata.champions.map((c) => c.id);
const db: Database = { leagues: load('leagues.json'), teams: load('teams.json'), players: load('players.json'), staff: load('staff.json') };
const userTeam = process.argv[2] ?? 't1-lck';
const seed = Number(process.argv[3] ?? 12345);
const fresh = () => createNewGame(db, userTeam, 'Tester', seed);
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const f1 = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);

const t0 = Date.now();
const state = fresh();
console.log(`new game in ${Date.now() - t0} ms: ${Object.keys(state.players).length} players`);

// ------------------------------------------------------------------ catalogue
const all = Object.values(TRAITS);
const kinds = (list: { kind: string }[]) => ['positive', 'neutral', 'negative'].map((k) => `${k} ${list.filter((t) => t.kind === k).length}`).join(', ');
const extended = all.filter((t) => TRAIT_SPECS[t.id]);
console.log(`\n== catalogue: ${all.length} traits (${kinds(all)}); extended ${extended.length} (${kinds(extended)}), ${extended.filter((t) => t.hidden).length} hidden`);
const groups: Record<string, string[]> = {};
for (const t of extended) (groups[TRAIT_SPECS[t.id].group] ??= []).push(t.name);
for (const [g, names] of Object.entries(groups)) console.log(`  ${pad(TRAIT_GROUP_LABEL[g as TraitGroup], 26)} ${names.length}: ${names.join(', ')}`);

// ------------------------------------------------------------------ assignment in a fresh game
const players = Object.values(state.players);
const holders: Record<string, number> = {};
const perPlayer: Record<number, number> = {};
const byKind = { positive: 0, neutral: 0, negative: 0 };
for (const p of players) {
  const ext = p.traits.filter((t) => TRAIT_SPECS[t]);
  perPlayer[ext.length] = (perPlayer[ext.length] ?? 0) + 1;
  for (const t of ext) { holders[t] = (holders[t] ?? 0) + 1; byKind[TRAIT_SPECS[t].kind]++; }
}
const nExt = Object.values(holders).reduce((a, b) => a + b, 0);
console.log(`\n== assignment: ${nExt} extended traits on ${players.length} players (avg ${(nExt / players.length).toFixed(2)}); per player ${JSON.stringify(perPlayer)}`);
console.log(`   by kind: positive ${byKind.positive} (${Math.round(byKind.positive / nExt * 100)}%), neutral ${byKind.neutral} (${Math.round(byKind.neutral / nExt * 100)}%), negative ${byKind.negative} (${Math.round(byKind.negative / nExt * 100)}%)`);
const stars = players.filter((p) => p.reputation >= 80), rookies = players.filter((p) => p.traits.includes('rookie'));
const avgExt = (ps: Player[]) => (ps.reduce((s, p) => s + p.traits.filter((t) => TRAIT_SPECS[t]).length, 0) / Math.max(1, ps.length)).toFixed(2);
console.log(`   avg extended traits: stars (rep 80+) ${avgExt(stars)} · rookies ${avgExt(rookies)} · everyone ${avgExt(players)}`);
const holderLine = Object.keys(TRAIT_SPECS).map((id) => [id, holders[id] ?? 0] as const).sort((a, b) => b[1] - a[1]);
console.log('   holders:', holderLine.map(([id, n]) => `${TRAIT_SPECS[id].name} ${n}`).join(' · '));
let conflicts = 0;
for (const p of players) for (const t of p.traits) for (const x of TRAIT_SPECS[t]?.excl ?? []) if (p.traits.includes(x)) conflicts++;
console.log(`   exclusion violations: ${conflicts}`);

// ------------------------------------------------------------------ profiles
console.log('\n== personal profiles (stars)');
console.log(pad('player', 16) + pad('ht', 5) + PERSONA_HIDDEN.map((k) => pad(PERSONA_LABEL[k].slice(0, 6), 7)).join('') + pad('lang', 5) + pad('appeal', 7) + 'followers / new traits');
for (const p of [...players].sort((a, b) => b.reputation - a.reputation).slice(0, 10)) {
  const s = personaOf(p);
  console.log(pad(p.handle, 16) + pad(s.height, 5) + PERSONA_HIDDEN.map((k) => pad(s[k] as number, 7)).join('') + pad(s.languages, 5) + pad(Math.round(streamAppeal(p)), 7)
    + `${p.streamer ? s.followers : '-'} / ${p.traits.filter((t) => TRAIT_SPECS[t]).map((t) => TRAITS[t].name).join(', ')}`);
}
const hs = players.map((p) => personaOf(p).height).sort((a, b) => a - b);
console.log(`   height: min ${hs[0]} · median ${hs[hs.length >> 1]} · max ${hs[hs.length - 1]} cm; languages: ${[1, 2, 3, 4].map((n) => `${n}:${players.filter((p) => personaOf(p).languages === n).length}`).join(' ')}`);

// ------------------------------------------------------------------ effect: streaming season
function streamSeason(high: boolean) {
  const s = clone(state);
  const team = s.teams[userTeam];
  for (const id of team.roster) s.players[id].streamer = false;
  const p = s.players[team.lineup.mid!];
  p.streamer = true;
  p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]?.fx.stream && !TRAIT_SPECS[t]?.fx.output);
  Object.assign(p.persona!, high ? { looks: 85, humor: 85, charisma: 80, online: 75 } : { looks: 30, humor: 25, charisma: 30, online: 35 });
  const fans0 = team.fans, hype0 = team.hype, foll0 = p.persona!.followers ?? 0;
  const posts0 = s.fanPulse?.posts.length ?? 0;
  let hypeAdded = 0;
  const rng = new RNG(7);
  for (let w = 0; w < 47; w++) { const h = team.hype; personaWeekly(s, rng); hypeAdded += team.hype - h; team.hype = hype0; }
  return { appeal: streamAppeal(p), score: streamScore(p), fans: team.fans - fans0, pct: (team.fans / fans0 - 1) * 100, hype: hypeAdded, followers: (p.persona!.followers ?? 0) - foll0, posts: (s.fanPulse?.posts.length ?? 0) - posts0 };
}
console.log(`\n== effect: one streaming season (47 weeks, ${state.teams[userTeam].short} mid as the only streamer)`);
for (const high of [true, false]) {
  const r = streamSeason(high);
  console.log(`   ${high ? 'high looks/humor/charisma' : 'low looks/humor/charisma '}: appeal ${r.appeal.toFixed(0)}, stream score ${r.score.toFixed(2)} → fans +${r.fans.toLocaleString()} (+${r.pct.toFixed(2)}%), hype +${r.hype.toFixed(1)} total, followers +${r.followers.toLocaleString()}, fan posts ${r.posts}`);
}

// ------------------------------------------------------------------ effect: training
function trainingGain(trait: string | null, weeks = 20) {
  const s = clone(state);
  const team = s.teams[userTeam];
  const p = Object.values(s.players).filter((q) => q.teamId === userTeam).sort((a, b) => (a.birthdate ?? '').localeCompare(b.birthdate ?? '')).pop()!; // youngest
  p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]);
  if (trait) p.traits.push(trait);
  p.hidden.potential = 99;
  const before = { ...p.attributes };
  const rng = new RNG(11);
  for (let w = 0; w < weeks; w++) weeklyTraining(s, team, rng);
  const d = (k: keyof typeof before) => p.attributes[k] - before[k];
  return { who: p.handle, total: ATTRIBUTE_KEYS.reduce((a, k) => a + d(k), 0), macro: d('macro') + d('vision'), mech: d('mechanics') + d('laning'), fatigue: p.fatigue };
}
console.log('\n== effect: 20 weeks of training (youngest player, potential 99)');
for (const t of [null, 'coachable', 'vod_addict', 'soloq_warrior', 'coasting', 'prodigy', 'late_sleeper']) {
  const r = trainingGain(t);
  console.log(`   ${pad(t ? TRAITS[t].name : '(no extended trait)', 22)} ${r.who}: total ${f1(r.total)} · macro+vision ${f1(r.macro)} · mech+laning ${f1(r.mech)}`);
}

// ------------------------------------------------------------------ effect: quick-sim power & win rate
function quick(trait: string | null, n = 1500) {
  const s = clone(state);
  const a = s.teams[userTeam];
  const b = Object.values(s.teams).filter((t) => t.leagueId === a.leagueId && t.id !== a.id).sort((x, y) => y.prestige - x.prestige)[0];
  for (const team of [a, b]) for (const r of ROLES) { const p = s.players[team.lineup[r]!]; if (p) p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]); }
  if (trait) for (const r of ROLES) s.players[a.lineup[r]!].traits.push(trait);
  const rng = new RNG(5);
  let wins = 0, pow = 0;
  for (let i = 0; i < n; i++) {
    const d = quickDraft(draftTeam(s, a), draftTeam(s, b), new Set(), rng, s.championPower);
    pow += teamPowerFor(s, a, draftPicks(d, 0), d, 0, true) - teamPowerFor(s, b, draftPicks(d, 1), d, 1, true);
    if (quickSim(s, a, b, d, rng, true).winner === a.id) wins++;
  }
  return { vs: b.short, pow: pow / n, wr: wins / n * 100 };
}
console.log('\n== effect: quick sim, big match, trait given to all 5 starters (1500 games each, extended traits stripped)');
const q0 = quick(null);
console.log(`   baseline vs ${q0.vs}: power diff ${f1(q0.pow)}, win ${q0.wr.toFixed(1)}%`);
for (const t of ['clutch_gene', 'regular_season_merchant', 'map_reader', 'metronome', 'trigger_happy']) {
  const r = quick(t);
  console.log(`   ${pad(TRAITS[t].name, 24)} power ${f1(r.pow - q0.pow)} · win ${r.wr.toFixed(1)}% (${f1(r.wr - q0.wr)} pts)`);
}

// ------------------------------------------------------------------ full engine smoke test
{
  const s = clone(state);
  const a = s.teams[userTeam];
  const b = Object.values(s.teams).filter((t) => t.leagueId === a.leagueId && t.id !== a.id).sort((x, y) => y.prestige - x.prestige)[0];
  const rng = new RNG(3);
  const t1 = Date.now();
  let aw = 0;
  const N = 4;
  for (let g = 0; g < N; g++) {
    const d = quickDraft(draftTeam(s, a), draftTeam(s, b), new Set(), rng, s.championPower);
    const sim = new MatchSim(simTeam(s, a, draftPicks(d, 0)), simTeam(s, b, draftPicks(d, 1)), { seed: 100 + g, bigMatch: g % 2 === 0 });
    const res = sim.runToEnd();
    if (res.winner === 0) aw++;
  }
  const ext = ROLES.flatMap((r) => [a, b].map((t) => s.players[t.lineup[r]!])).reduce((n, p) => n + p.traits.filter((t) => TRAIT_SPECS[t]).length, 0);
  console.log(`\n== full engine: ${N} games ${a.short} vs ${b.short} with ${ext} extended traits on the starters — ok (${a.short} won ${aw}), ${((Date.now() - t1) / N).toFixed(0)} ms/game`);
}

// ------------------------------------------------------------------ engine: per-game performance roll and in-game form
{
  const s = clone(state);
  const a = s.teams[userTeam];
  const b = Object.values(s.teams).filter((t) => t.leagueId === a.leagueId && t.id !== a.id).sort((x, y) => y.prestige - x.prestige)[0];
  for (const team of [a, b]) for (const r of ROLES) { const p = s.players[team.lineup[r]!]; p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]); }
  const d = quickDraft(draftTeam(s, a), draftTeam(s, b), new Set(), new RNG(9), s.championPower);
  const build = (trait: string | null, big: boolean) => {
    const adc = s.players[a.lineup.adc!];
    adc.traits = adc.traits.filter((t) => !TRAIT_SPECS[t]).concat(trait ? [trait] : []);
    return new MatchSim(simTeam(s, a, draftPicks(d, 0)), simTeam(s, b, draftPicks(d, 1)), { seed: 42, bigMatch: big });
  };
  console.log('\n== engine: ADC performance multiplier (same seed; the trait consumes no RNG)');
  for (const [t, big] of [['clutch_gene', true], ['regular_season_merchant', true], ['regular_season_merchant', false], ['metronome', false], ['floor_raiser', false]] as [string, boolean][]) {
    const base = build(null, big).champs[3].basePerf, withT = build(t, big).champs[3].basePerf;
    console.log(`   ${pad(TRAITS[t].name, 24)} ${big ? 'big match' : 'regular  '}: roll ${base.toFixed(3)} → ${withT.toFixed(3)}`);
  }
  for (const t of ['scaling_adc', 'fast_starter', 'closer']) {
    const sim = build(t, false);
    const c = sim.champs[3];
    const form = (sec: number, lead: number) => { sim.t = sec; return traitForm(sim, c, lead); };
    console.log(`   ${pad(TRAITS[t].name, 24)} in-game form: 8 min ${f1(form(480, 0) * 100)}% · 20 min ${f1(form(1200, 0) * 100)}% · 32 min ahead ${f1(form(1920, 0.3) * 100)}% · 32 min behind ${f1(form(1920, -0.3) * 100)}%`);
  }
}

// ------------------------------------------------------------------ locker room, merch, sponsors, approaches
{
  const s = clone(state);
  const team = s.teams[userTeam];
  const [x, y] = ROLES.map((r) => s.players[team.lineup[r]!]);
  const set = (p: Player, traits: string[], humor: number) => { p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]).concat(traits); p.persona!.humor = humor; };
  set(x, ['glue_guy'], 80); set(y, ['class_clown'], 75);
  const good = traitCompat(x, y);
  set(x, ['toxic_presence'], 30); set(y, ['grudge_holder'], 30);
  const bad = traitCompat(x, y);
  console.log(`\n== locker room: compatibility bonus Glue Guy + Class Clown (funny) ${f1(good * 100)} vs Toxic Presence + Grudge Holder (dry) ${f1(bad * 100)} (scale −100..100; base compat is about ±30)`);
  const p = s.players[team.lineup.mid!];
  const base = { looks: p.persona!.looks, style: p.persona!.style };
  p.traits = p.traits.filter((t) => !TRAIT_SPECS[t]);
  const m0 = merchAppeal(p), s0 = sponsorAppeal(s, team);
  p.traits.push('heartthrob', 'brand_ambassador'); Object.assign(p.persona!, { looks: 85, style: 80 });
  console.log(`   merch star power of ${p.handle}: ${m0.toFixed(2)} → ${merchAppeal(p).toFixed(2)} with Heartthrob (+${((merchAppeal(p) - m0) * 8).toFixed(0)}% club merch demand); club sponsor appeal ${s0.toFixed(3)} → ${sponsorAppeal(s, team).toFixed(3)} (+ Brand Ambassador; offers scale with ~1.0–1.6 appeal)`);
  Object.assign(p.persona!, base);
  const w = s.players[team.lineup.adc!];
  w.traits = w.traits.filter((t) => !TRAIT_SPECS[t]);
  const wr0 = approachMult(w, 'wrist'), hs0 = approachMult(w, 'homesick');
  w.traits.push('wrist_issues', 'homebody');
  console.log(`   approach odds: wrist ×${wr0.toFixed(2)} → ×${approachMult(w, 'wrist').toFixed(2)} (Wrist Issues), homesick ×${hs0.toFixed(2)} → ×${approachMult(w, 'homesick').toFixed(2)} (Homebody)`);
  const d = quickDraft(draftTeam(s, team), draftTeam(s, team), new Set(), new RNG(1), s.championPower);
  const pp = s.players[team.lineup.support!];
  const pick = draftPicks(d, 0).support;
  pp.traits = pp.traits.filter((t) => !TRAIT_SPECS[t]).concat(['enchanter_specialist']);
  console.log(`   Enchanter Specialist on ${gdata.championById[pick]?.name} (${gdata.championById[pick]?.archetype}): quick-sim power ${f1(traitPower(s, pp, { role: 'support' as Role, champ: pick, mastery: 80, big: false, d, side: 0 }))} (on an enchanter: ${f1(traitPower(s, pp, { role: 'support', champ: 'Janna', mastery: 80, big: false, d, side: 0 }))})`);
}
console.log(`\noverall check: ${players.filter((p) => !p.persona).length} players without a profile; ${overall(players[0].attributes, players[0].role) >= 0 ? 'ok' : ''}`);
