// Daily / weekly life off the Rift, driven by the personal profile (persona.ts) and the extended traits:
//   • streaming (every club): fans, follower counts, fatigue for heavy streamers; hype and fan posts for the user's club
//   • media days (user's club): good press vs. gaffes, by media savvy and traits
//   • fan favourites (user's club): high-appeal, in-form starters can become the face of the club
//   • stamina: fatigue build-up / recovery; traits: weekly fatigue, morale, chemistry, travel, playing abroad
// Called once a day from endDay (game.ts). Uses its own seeded RNG so the main game stream is untouched.
import type { GameState, Player, Team } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addDays, weekday } from '../season/formats';
import { fxTotal } from '../traitsMore';
import { ensurePersonas, personaOf } from './persona';
import { streamScore, streamOutput, streamAppeal, merchAppeal } from './traitEffects';
import { emit, baseCtx, fanMood, fill, type Ctx } from './fans';
import { addNews } from './news';
import { regionOfCountry } from './transfers';
import { registerPersonaTemplates, PERSONA_NEWS } from './personaTemplates';

const z = (v: number) => (v - 50) / 50;
const T = (p: Player) => fxTotal(p.traits).num;

/** Fans a club gains from one streamer in a week (≈ +0.012% of the fanbase per point of stream score). */
export const STREAM_FAN_RATE = 0.00012;
export function weeklyStreamFans(team: Team, p: Player) { return Math.round(team.fans * STREAM_FAN_RATE * streamScore(p)); }

const away = (state: GameState, p: Player) => (state.people?.players[p.id]?.away?.until ?? '') >= state.date;

const scanned = new WeakSet<GameState>();
export function personaDaily(state: GameState) {
  // lazy init: free agents are initialised when generated; scan for everyone else (old saves, prospects,
  // Editor players) on the first day after loading, on Mondays and on prospect day
  if (!scanned.has(state) || weekday(state.date) === 1 || state.date.slice(5) === '11-20') { ensurePersonas(state); scanned.add(state); }
  const user = state.teams[state.userTeamId];
  if (user) {
    // stamina: fitter players shake off fatigue faster on rest days (the base −1.2/day lives in endDay)
    const yesterday = addDays(state.date, -1);
    for (const id of user.roster) {
      const p = state.players[id];
      if (p && p.lastPlayed !== yesterday) p.fatigue = clamp(p.fatigue - z(personaOf(p).stamina) * 0.4, 0, 100);
    }
  }
  if (weekday(state.date) !== 1) return;
  const rng = new RNG(hashString(state.date + ':persona') ^ state.seq);
  personaWeekly(state, rng);
}

function internationalTeams(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(state.competitions)) if (c.tier === 0 && c.status === 'active' && c.season === state.season) for (const t of c.teams) out.add(t);
  return out;
}

export function personaWeekly(state: GameState, rng: RNG) {
  const intl = internationalTeams(state);
  for (const team of Object.values(state.teams)) {
    const roster = team.roster.map((id) => state.players[id]).filter((p): p is Player => !!p);
    if (!roster.length) continue;
    const userClub = team.id === state.userTeamId;
    // club-wide: chemistry (Captain, Glue Guy… / Toxic Presence) and roster morale (Captain)
    team.chemistry = clamp(team.chemistry + clamp(roster.reduce((s, p) => s + T(p).chem, 0), -0.6, 0.6), 10, 100);
    const lift = clamp(roster.reduce((s, p) => s + T(p).teamMorale, 0), -1, 1);
    let fanGain = 0, hype = 0;
    for (const p of roster) {
      const s = personaOf(p), t = T(p);
      let fatigue = t.fatigue - z(s.stamina) * 0.8;
      let morale = lift + t.morale;
      if (intl.has(team.id)) { fatigue += t.travel; morale += t.travelMorale; }
      if (t.home || t.abroad) morale += regionOfCountry(p.country) === team.region ? t.home : t.abroad;
      if (t.rep) p.reputation = clamp(p.reputation + t.rep, 1, 100);
      if (userClub) hype += t.hype;
      // streaming
      if (p.streamer && !(userClub && away(state, p))) {
        const score = streamScore(p);
        fanGain += weeklyStreamFans(team, p);
        hype += 0.25 * score;
        fatigue += 0.5 * (streamOutput(p) - 1); // heavy streamers (Content Machine) tire, light ones rest more
        morale += z(s.online) * 0.3;
        p.persona!.followers = Math.round((s.followers ?? 0) * (1 + 0.003 * score) + p.reputation * 8 * score);
        p.reputation = clamp(p.reputation + 0.02 * (score - 0.8), 1, 100);
      }
      p.fatigue = clamp(p.fatigue + fatigue, 0, 100);
      p.morale = clamp(p.morale + morale, 5, 100);
    }
    team.fans = Math.max(100, team.fans + fanGain);
    if (userClub) {
      team.hype = clamp(team.hype + Math.min(1.5, hype), 0, 100);
      peace(state, roster);
      registerPersonaTemplates();
      streamMoment(state, rng, team, roster);
      mediaDay(state, rng, team, roster);
      fanFavourite(state, rng, team, roster);
    }
  }
}

/** Peacemaker: drama between teammates cools down faster. */
function peace(state: GameState, roster: Player[]) {
  const ps = state.people;
  const cool = roster.reduce((s, p) => s + T(p).peace, 0);
  if (!ps || ps.teamId !== state.userTeamId || !cool) return;
  for (const pr of Object.values(ps.pairs)) pr.heat = Math.max(0, pr.heat - cool);
}

const post = (state: GameState, rng: RNG, team: Team, scen: string, ctx: Ctx, n: number, playerId?: string) => {
  const c = { ...baseCtx(state, team), ...ctx };
  let mins = rng.int(10 * 60, 23 * 60);
  for (let i = 0; i < n; i++) { emit(state, rng, team, scen, c, { mins: Math.min(1439, mins), playerId, replyChance: 0.35 }); mins += rng.int(5, 80); }
};

const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** At most one notable stream a week on the user's roster: a viral clip, a viewer record, a marathon… or a tilted rant. */
function streamMoment(state: GameState, rng: RNG, team: Team, roster: Player[]) {
  const streamers = roster.filter((p) => p.streamer && !away(state, p));
  const p = streamers.find((q) => rng.chance(0.04 + 0.05 * streamScore(q)));
  if (!p) return;
  const s = personaOf(p);
  const has = (t: string) => p.traits.includes(t);
  const hotHead = has('rage_typer') || has('hot_headed') || has('foot_in_mouth') || has('tilter');
  const fm = fanMood(state, team.id);
  if ((hotHead && rng.chance(0.45)) || (p.form < -3 && p.hidden.composure < 45 && rng.chance(0.3))) {
    post(state, rng, team, 'stream_rage', { player: p.handle }, rng.int(2, 3), p.id);
    p.morale = clamp(p.morale - 1.5, 5, 100);
    fm.mood = clamp(fm.mood - 1.5, -100, 100);
    return;
  }
  const kinds: [string, number][] = [
    ['stream_funny', 0.3 + Math.max(0, z(s.humor)) * 2 + (has('class_clown') ? 1 : 0)],
    ['stream_record', 0.2 + Math.max(0, (streamAppeal(p) - 55) / 15) + (has('heartthrob') ? 1 : 0)],
    ['stream_marathon', has('content_machine') || has('late_sleeper') ? 1.5 : 0.15],
    ['stream_educational', 0.1 + Math.max(0, z(s.smarts)) * 1.5],
    ['stream_meme', has('meme_lord') ? 2 : 0.2],
    ['stream_chill', 0.6],
  ];
  const [kind] = rng.weighted(kinds, (k) => k[1]);
  const viewers = Math.max(300, Math.round((s.followers ?? 1000) * (0.03 + rng.next() * 0.04) * (kind === 'stream_record' ? 2.2 : 1)));
  post(state, rng, team, kind, { player: p.handle, viewers: fmtCount(viewers), hours: rng.int(10, 30) }, rng.int(1, 3), p.id);
  const score = streamScore(p);
  team.hype = clamp(team.hype + 0.6 + 0.4 * score, 0, 100);
  team.fans += Math.round(team.fans * 0.0004 * score);
  p.persona!.followers = Math.round((p.persona!.followers ?? 0) * 1.02);
  fm.mood = clamp(fm.mood + 0.8, -100, 100);
}

/** Weekly media day: one player (weighted by reputation) faces the press; media savvy and traits decide how it goes. */
function mediaDay(state: GameState, rng: RNG, team: Team, roster: Player[]) {
  if (!rng.chance(0.35)) return;
  const p = rng.weighted(roster, (q) => 0.3 + q.reputation / 40 + (ROLES.some((r) => team.lineup[r] === q.id) ? 1 : 0));
  const tone = z(personaOf(p).media) * 0.6 + T(p).media * 0.3 + rng.normal(0, 0.5);
  const fm = fanMood(state, team.id);
  if (tone > 0.45) {
    post(state, rng, team, 'media_good', { player: p.handle }, rng.int(1, 2), p.id);
    fm.mood = clamp(fm.mood + 1.5, -100, 100);
    team.hype = clamp(team.hype + 1, 0, 100);
    p.reputation = clamp(p.reputation + 0.3, 1, 100);
    p.morale = clamp(p.morale + 1, 5, 100);
  } else if (tone < -0.55) {
    post(state, rng, team, 'media_gaffe', { player: p.handle }, rng.int(2, 3), p.id);
    fm.mood = clamp(fm.mood - 2, -100, 100);
    p.morale = clamp(p.morale - 2, 5, 100);
    if (tone < -0.9) news(state, rng, 'media_gaffe', { player: p.handle, team: team.name, short: team.short }, team, p);
  }
}

/** A popular, in-form starter can become a fan favourite (gains the Fan Favorite trait). Rare: appeal matters most. */
function fanFavourite(state: GameState, rng: RNG, team: Team, roster: Player[]) {
  for (const p of roster) {
    if (p.traits.includes('fan_favorite') || p.reputation < 50 || !ROLES.some((r) => team.lineup[r] === p.id)) continue;
    const appeal = (streamAppeal(p) / 50) ** 3 * (p.streamer ? 1.2 : 0.8) * (1 + Math.max(0, merchAppeal(p)) * 0.3);
    if (!rng.chance(0.0012 * appeal * (1 + Math.max(0, p.form) / 5))) continue;
    p.traits.push('fan_favorite');
    p.reputation = clamp(p.reputation + 5, 1, 100);
    post(state, rng, team, 'fan_fav_rise', { player: p.handle }, 3, p.id);
    news(state, rng, 'fan_fav_rise', { player: p.handle, team: team.name, short: team.short }, team, p);
    return;
  }
}

function news(state: GameState, rng: RNG, kind: string, ctx: Ctx, team: Team, p: Player) {
  const t = PERSONA_NEWS[kind];
  const headline = fill(rng.pick(t.headline), ctx), body = fill(rng.pick(t.body), ctx);
  if (headline && body) addNews(state, { headline, body, tags: ['feature'], teamIds: [team.id], playerIds: [p.id] });
}
