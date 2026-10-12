// Fan buzz, the "self-aware" layer: fans (and the owner) notice anomalies — overnight rating jumps or drops
// (told apart from gradual training climbs), Editor tweaks, pure-coincidence hot / cold runs, absurd money,
// renamed clubs, stacked lineups, endless unbeaten runs — and react ONCE per anomaly (feed posts, news, owner
// mail / a request) plus a couple of follow-ups. Also club-life scenarios (birthdays, contracts, tickets,
// rumours, patch day…). Hooked from reactions.ts: buzzDaily (after fans/owner) and buzzAfterSeries.
import type { GameState, Team, Player, BuzzState, MatchFixture } from '../types';
import { ROLES, ROLE_LABEL, FACILITY_INFO, type FacilityKey } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { ageOn, LEAGUE_ECON } from '../setup';
import { staffRating, STAFF_ROLE_INFO } from './staffMarket';
import { addNews } from './news';
import { weekday, addDays } from '../season/formats';
import { inTransferWindow } from './transfers';
import { rivalry, fanMood, emit, baseCtx, fill, type Ctx, type SeriesInfo } from './fans';
import { ownerMail, ownerAsk, ownerHas, ownerNudge, ownerFx, moneyScale, registerOwnerQuirk, usd } from './owner';
import { BUZZ_NEWS } from './buzzTemplates';
import { buzzState, bcool, addBuzzEvent, days, ovrOf, facSum, champName, updateForm, formOf, teamAvg, wasEdited, clubGames, loreCtx } from './buzzCore';
import { LORE_NEWS } from './loreTemplates';
import { T1_ID } from '../season/lore';

const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
const bestChamp = (p: Player) => champName(Object.entries(p.champions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '');
const ageInt = (p: Player, date: string) => Math.floor(ageOn(p.birthdate, date) ?? 22);
const kdaStr = (k: number, d: number, a: number) => ((k + a) / Math.max(1, d)).toFixed(1);
const MILESTONES = [100, 200, 300, 500];
/** Daily budget: anomaly posts on our feed, and reactions about other clubs. */
interface Quota { posts: number; world: number }

/** Write `n` posts for a scenario on a team's feed, spread over the day. Returns how many were written. */
function posts(state: GameState, rng: RNG, team: Team, scen: string, ctx: Ctx, n: number, o: { playerId?: string; stakes?: number } = {}) {
  const c = { ...baseCtx(state, team), ...ctx };
  let mins = rng.int(9 * 60, 21 * 60), wrote = 0;
  for (let i = 0; i < n; i++) {
    if (emit(state, rng, team, scen, c, { mins: Math.min(1439, mins), playerId: o.playerId, stakes: o.stakes ?? 1.2, replyChance: 0.4 })) wrote++;
    mins += rng.int(4, 70);
  }
  return wrote;
}

/** A news item from the BUZZ_NEWS templates (tries a few lines until one fills). */
function news(state: GameState, rng: RNG, kind: string, ctx: Ctx, teamIds?: string[], playerIds?: string[]) {
  const t = BUZZ_NEWS[kind];
  if (!t) return;
  const pick = (arr: string[]) => { for (let i = 0; i < 6; i++) { const s = fill(rng.pick(arr), ctx); if (s) return s; } return arr.map((x) => fill(x, ctx)).find(Boolean) ?? null; };
  const headline = pick(t.headline), body = pick(t.body);
  if (headline && body) addNews(state, { headline, body, tags: ['buzz'], teamIds, playerIds });
}

function nextFixture(state: GameState, teamId: string): MatchFixture | undefined {
  let best: MatchFixture | undefined;
  for (const f of Object.values(state.fixtures)) if (!f.result && f.teamA && f.teamB && (f.teamA === teamId || f.teamB === teamId) && f.date >= state.date && (!best || f.date < best.date)) best = f;
  return best;
}

/** Clubs whose players' ratings we watch: ours, our league and the tier-1 leagues. */
function trackedTeams(state: GameState): Set<string> {
  const user = state.teams[state.userTeamId];
  return new Set(Object.values(state.teams).filter((t) => t.id === user.id || t.leagueId === user.leagueId || tierOf(state, t) <= 1).map((t) => t.id));
}

// ------------------------------------------------------------------ player anomalies
/** An overnight rating shift (edited or unexplained): our feed, the player's own fanbase, news and the owner. */
function onShift(state: GameState, rng: RNG, p: Player, old: number, cur: number, edited: boolean, q: Quota) {
  const team = p.teamId ? state.teams[p.teamId] : undefined;
  const user = state.teams[state.userTeamId];
  if (!team || !user) return;
  const up = cur > old, delta = Math.abs(cur - old);
  addBuzzEvent(state, { kind: up ? 'jump' : 'drop', playerId: p.id, teamId: team.id, edited, data: { old, ovr: cur, delta } });
  const ctx: Ctx = { player: p.handle, role: ROLE_LABEL[p.role], ovr: cur, old, delta, champ: bestChamp(p), age: ageInt(p, state.date) };
  const nctx: Ctx = { ...ctx, team: team.name, short: team.short };
  if (team.id === user.id) {
    const scen = up ? (edited ? (cur >= 93 ? 'anomaly_edit_max' : 'anomaly_edit') : delta >= 10 || cur >= 90 ? 'anomaly_jump_huge' : 'anomaly_jump') : edited ? 'anomaly_drop_edit' : 'anomaly_drop';
    if (q.posts > 0) {
      q.posts -= posts(state, rng, user, scen, ctx, up ? 3 + (delta >= 8 ? 1 : 0) : 2, { playerId: p.id });
      // the in-world crowd doesn't know about editors: mix their takes into the knowing ones
      if (edited && up && rng.chance(0.7)) q.posts -= posts(state, rng, user, delta >= 10 ? 'anomaly_jump_huge' : 'anomaly_jump', ctx, 1, { playerId: p.id });
    }
    if (delta >= 6) news(state, rng, up ? (edited ? 'jump_edit' : 'jump') : 'drop', nctx, [team.id], [p.id]);
    const fm = fanMood(state, user.id);
    fm.mood = clamp(fm.mood + (up ? 3 : -3), -100, 100);
    if (up) user.hype = clamp(user.hype + 2, 0, 100);
    ownerNudge(state, up ? 2 : -2);
    ownerMail(state, up ? (edited ? 'anomaly_edit' : 'anomaly_jump') : edited ? 'anomaly_drop_edit' : 'anomaly_drop', ctx, { pri: delta >= 6 ? 2 : 1, tone: up ? 1 : -1, cd: ['anom:' + p.id, 10] });
    const curious = ownerHas(state, 'dataNerd') || ownerHas(state, 'superstitious') || ownerHas(state, 'publicity') || ownerHas(state, 'meddling');
    if (up && delta >= 5 && (curious || rng.chance(0.5))) ownerAsk(state, 'anomaly_probe', rng);
    return;
  }
  // another club: a word from their own fanbase (tier 1), suspicion from ours (same league / rivals)
  if (q.world <= 0 || delta < 5) return;
  q.world--;
  if (tierOf(state, team) <= 1) posts(state, rng, team, up ? (edited ? 'anomaly_edit' : 'anomaly_jump') : 'anomaly_drop', ctx, 1, { playerId: p.id });
  if (team.leagueId === user.leagueId || rivalry(state, user.id, team.id)) {
    posts(state, rng, user, up ? 'rival_anomaly' : 'rival_anomaly_drop', { ...ctx, oppShort: team.short }, rng.int(1, 2), { playerId: p.id });
    if (up) ownerMail(state, 'rival_anomaly', { ...ctx, oppShort: team.short }, { pri: 0, cd: ['rivalAnom', 30] });
  }
  if (delta >= 8 || (edited && delta >= 6)) news(state, rng, up ? 'rival_jump' : 'drop', nctx, [team.id], [p.id]);
}

/** Editor edits from yesterday: renames, role swaps, age changes, teleports, new players, staff and club changes. */
function processEdits(state: GameState, bz: BuzzState, rng: RNG, tracked: Set<string>, q: Quota) {
  const user = state.teams[state.userTeamId];
  for (const e of [...bz.edits].reverse()) {
    if (e.seen) continue;
    e.seen = true;
    const b = e.before;
    if (e.kind === 'player') {
      const p = state.players[e.id];
      if (!p || p.retired) continue;
      const cur = ovrOf(p), mine = p.teamId === user.id;
      bz.ovr[p.id] = cur;
      bz.base[p.id] = [state.date, cur];
      const ctx: Ctx = { player: p.handle, role: ROLE_LABEL[p.role], ovr: cur };
      if (b.created) {
        if (!p.teamId) continue;
        addBuzzEvent(state, { kind: 'mystery', playerId: p.id, teamId: p.teamId, edited: true });
        if (mine) { posts(state, rng, user, 'mystery_player', ctx, 3, { playerId: p.id }); ownerMail(state, 'mystery_player', ctx, { pri: 1 }); }
        if (mine || tracked.has(p.teamId)) news(state, rng, 'mystery_player', { ...ctx, team: state.teams[p.teamId]?.name, short: state.teams[p.teamId]?.short }, [p.teamId], [p.id]);
        continue;
      }
      if (b.handle && b.handle !== p.handle && p.teamId && tracked.has(p.teamId)) {
        addBuzzEvent(state, { kind: 'renamed', playerId: p.id, teamId: p.teamId, edited: true, data: { oldname: b.handle } });
        if (mine) posts(state, rng, user, 'renamed_player', { ...ctx, oldname: b.handle }, 2, { playerId: p.id });
        news(state, rng, 'renamed_player', { ...ctx, oldname: b.handle, team: state.teams[p.teamId]?.name, short: state.teams[p.teamId]?.short }, [p.teamId], [p.id]);
      }
      if (mine && b.role && b.role !== p.role) posts(state, rng, user, 'role_swap', { ...ctx, oldrole: ROLE_LABEL[b.role as keyof typeof ROLE_LABEL] ?? b.role }, 2, { playerId: p.id });
      if (mine && b.birth && p.birthdate && b.birth !== p.birthdate) {
        const oldage = Math.floor(ageOn(String(b.birth), state.date) ?? 0), age = ageInt(p, state.date);
        if (oldage !== age) posts(state, rng, user, 'age_change', { ...ctx, oldage, age }, 2, { playerId: p.id });
      }
      if (mine && (b.team || '') !== user.id) teleport(state, rng, p, b.team ? state.teams[String(b.team)]?.name : undefined);
      const old = Number(b.ovr);
      if (Number.isFinite(old) && Math.abs(cur - old) >= 4 && p.teamId && (mine || tracked.has(p.teamId))) onShift(state, rng, p, old, cur, true, q);
    } else if (e.kind === 'staff') {
      const s = state.staff[e.id];
      if (!s || s.teamId !== user.id) continue;
      const delta = staffRating(s) - Number(b.rating ?? staffRating(s));
      if (delta >= 6) {
        const ctx = { staff: s.handle, staffrole: (STAFF_ROLE_INFO[s.role]?.label ?? s.role).toLowerCase(), delta };
        addBuzzEvent(state, { kind: 'staff_jump', teamId: user.id, edited: true, data: { staff: s.handle, delta } });
        posts(state, rng, user, 'staff_jump', ctx, 2);
        ownerMail(state, 'staff_jump', ctx, { pri: 1, tone: 1, cd: ['staffJump', 14] });
      }
    } else {
      const t = state.teams[e.id];
      if (!t) continue;
      const mine = t.id === user.id;
      if (b.name && b.name !== t.name && (mine || tracked.has(t.id))) {
        addBuzzEvent(state, { kind: 'team_renamed', teamId: t.id, edited: true, data: { oldname: b.name } });
        news(state, rng, 'team_renamed', { oldname: b.name, team: t.name, short: t.short }, [t.id]);
        if (mine) { posts(state, rng, user, 'team_renamed', { oldname: b.name }, 3); ownerMail(state, 'team_renamed', { oldname: b.name }, { pri: 2, tone: -1 }); }
      }
      if (!mine) continue;
      const budget = LEAGUE_ECON[tierOf(state, t)]?.budget ?? 1e6;
      const gain = t.balance - Number(b.balance ?? t.balance);
      if (gain >= budget * 0.25) moneyGlitch(state, rng, gain, true);
      if (facSum(t) - Number(b.fac ?? facSum(t)) >= 3) facilityGlitch(state, rng);
      const before = String(b.roster ?? '').split(',');
      for (const id of t.roster.filter((x) => !before.includes(x)).slice(0, 3)) {
        const p = state.players[id];
        if (p && !bz.edits.some((x) => x.kind === 'player' && x.id === id && x.date === e.date)) teleport(state, rng, p, prevClub(state, p, t.id));
      }
      const c = (bz.club ??= {});
      c.balance = Math.round(t.balance); c.fac = facSum(t);
    }
  }
}

const prevClub = (state: GameState, p: Player, now: string) => [...p.career].reverse().find((c) => c.teamId !== now)?.teamName;

function teleport(state: GameState, rng: RNG, p: Player, from?: string) {
  const user = state.teams[state.userTeamId];
  const ctx: Ctx = { player: p.handle, role: ROLE_LABEL[p.role], from: from ?? 'free agency' };
  addBuzzEvent(state, { kind: 'teleport', playerId: p.id, teamId: user.id, edited: true, data: { from: ctx.from as string } });
  posts(state, rng, user, 'teleport_transfer', ctx, 3, { playerId: p.id });
  news(state, rng, 'teleport_transfer', { ...ctx, team: user.name, short: user.short }, [user.id], [p.id]);
  ownerMail(state, 'teleport_transfer', ctx, { pri: 1, cd: ['teleport', 7] });
}

function moneyGlitch(state: GameState, rng: RNG, gain: number, edited: boolean) {
  const user = state.teams[state.userTeamId];
  const bz = buzzState(state);
  if (!bcool(bz, 'money', state.date, 20)) return;
  const amount = usd(gain);
  addBuzzEvent(state, { kind: 'money', teamId: user.id, edited, data: { amount: Math.round(gain) } });
  posts(state, rng, user, 'money_glitch', { amount }, 3);
  news(state, rng, 'money_glitch', { amount, team: user.name, short: user.short }, [user.id]);
  ownerMail(state, 'money_glitch', { amount }, { pri: 2 });
  ownerAsk(state, 'windfall', rng);
}

function facilityGlitch(state: GameState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  if (!bcool(buzzState(state), 'facGlitch', state.date, 30)) return;
  addBuzzEvent(state, { kind: 'facilities', teamId: user.id, edited: true });
  posts(state, rng, user, 'facility_glitch', {}, 2);
}

/** Rating scan: overnight jumps / drops nobody explained, and slow 10-week trends for our players. */
function scanRatings(state: GameState, bz: BuzzState, rng: RNG, tracked: Set<string>, first: boolean, q: Quota) {
  const user = state.teams[state.userTeamId];
  for (const p of Object.values(state.players)) {
    if (p.retired || !p.teamId || !tracked.has(p.teamId)) continue;
    const cur = ovrOf(p), prev = bz.ovr[p.id];
    bz.ovr[p.id] = cur;
    if (prev === undefined || first) { bz.base[p.id] = [state.date, cur]; continue; }
    if (Math.abs(cur - prev) >= 4) { bz.base[p.id] = [state.date, cur]; onShift(state, rng, p, prev, cur, wasEdited(state, p.id, 2), q); continue; }
    const b = (bz.base[p.id] ??= [state.date, cur]);
    if (days(b[0], state.date) < 70) continue;
    const trend = cur - b[1];
    if (p.teamId === user.id && trend >= 3) {
      const ctx = { player: p.handle, delta: trend, weeks: Math.round(days(b[0], state.date) / 7), ovr: cur };
      addBuzzEvent(state, { kind: 'glow_up', playerId: p.id, teamId: user.id, data: ctx });
      posts(state, rng, user, 'glow_up', ctx, 2, { playerId: p.id });
      if (trend >= 4) news(state, rng, 'glow_up', { ...ctx, team: user.name, short: user.short }, [user.id], [p.id]);
      ownerMail(state, 'glow_up', ctx, { pri: 0, tone: 1, cd: ['glow', 30] });
    } else if (p.teamId === user.id && trend <= -2 && ageInt(p, state.date) >= 24) {
      const ctx = { player: p.handle, delta: -trend, weeks: Math.round(days(b[0], state.date) / 7), age: ageInt(p, state.date) };
      addBuzzEvent(state, { kind: 'slow_decline', playerId: p.id, teamId: user.id, data: ctx });
      posts(state, rng, user, 'slow_decline', ctx, 2, { playerId: p.id });
    }
    bz.base[p.id] = [state.date, cur];
  }
}

// ------------------------------------------------------------------ club scan (money, facilities, tickets, staff, contracts, rivals)
function scanClub(state: GameState, bz: BuzzState, rng: RNG, first: boolean) {
  const user = state.teams[state.userTeamId];
  const c = (bz.club ??= {});
  const budget = LEAGUE_ECON[tierOf(state, user)]?.budget ?? 1e6;
  if (!first && c.team === user.id) {
    const gain = user.balance - Number(c.balance ?? user.balance);
    if (gain >= Math.max(budget, 2e6)) moneyGlitch(state, rng, gain, wasEdited(state, user.id, 2));
    if (facSum(user) - Number(c.fac ?? facSum(user)) >= 4) facilityGlitch(state, rng);
    const t0 = Number(c.ticket ?? 0), t1 = user.ticketPrice ?? 0;
    if (t0 && t1 && Math.abs(t1 / t0 - 1) >= 0.15 && bcool(bz, 'ticket', state.date, 10)) {
      posts(state, rng, user, t1 > t0 ? 'ticket_hike' : 'ticket_cut', { price: Math.round(t1) }, 2);
      if (t1 > t0) ownerMail(state, 'ticket_hike', { price: Math.round(t1) }, { pri: 0, cd: ['ticket', 45] });
    }
    const staffBefore = String(c.staff ?? '').split(',');
    for (const id of user.staff.filter((x) => !staffBefore.includes(x))) {
      const s = state.staff[id];
      if (s && s.role !== 'headCoach') posts(state, rng, user, 'staff_hire', { staffname: s.handle, staffrole: (STAFF_ROLE_INFO[s.role]?.label ?? s.role).toLowerCase() }, 1);
    }
    for (const id of user.roster) {
      const p = state.players[id], was = c['k:' + id];
      if (!p?.contract || !was || p.contract.expires <= String(was)) continue;
      const years = Math.max(1, Math.round(days(state.date, p.contract.expires) / 365));
      posts(state, rng, user, 'contract_renewed', { player: p.handle, years }, 2, { playerId: id });
      if (p.reputation >= 60) ownerMail(state, 'contract_renewed', { player: p.handle, years }, { pri: 0, tone: 1, cd: ['renew', 20] });
    }
    // the main rival signs a star
    const rival = c.rival ? state.teams[String(c.rival)] : undefined;
    if (rival) for (const id of rival.roster.filter((x) => !String(c.rivalRoster ?? '').split(',').includes(x))) {
      const p = state.players[id];
      if (p && p.reputation >= 70 && bcool(bz, 'rivalSign', state.date, 10)) posts(state, rng, user, 'rival_signing', { player: p.handle, rivalShort: rival.short }, 2, { playerId: id });
    }
    // a stacked lineup (or a lineup full of edited players)
    const avg = teamAvg(state, user), edited = ROLES.filter((r) => user.lineup[r] && wasEdited(state, user.lineup[r]!, 120)).length;
    if ((avg >= 88 || edited >= 3) && bcool(bz, 'superteam', state.date, 180)) {
      const ctx = { avg: Math.round(avg) };
      addBuzzEvent(state, { kind: 'superteam', teamId: user.id, edited: edited >= 3, data: ctx });
      posts(state, rng, user, 'superteam', ctx, 3);
      news(state, rng, 'superteam', { ...ctx, team: user.name, short: user.short }, [user.id]);
      ownerMail(state, 'superteam', ctx, { pri: 1, tone: 1 });
    }
    for (const m of user.merch) if (m.stock === 0 && m.sold > 0 && rng.chance(0.5) && bcool(bz, 'soldout:' + m.id, state.date, 60) && bcool(bz, 'soldoutAny', state.date, 30)) {
      const who = m.playerId ? state.players[m.playerId]?.handle : undefined;
      posts(state, rng, user, 'merch_soldout', { item: `${who ?? user.short} ${m.name.toLowerCase()}` }, 1, { playerId: m.playerId });
      break;
    }
  }
  // snapshot for tomorrow
  for (const k of Object.keys(c)) if (k.startsWith('k:')) delete c[k];
  c.team = user.id; c.balance = Math.round(user.balance); c.fac = facSum(user); c.ticket = user.ticketPrice ?? 0; c.staff = user.staff.join(',');
  for (const id of user.roster) { const p = state.players[id]; if (p?.contract) c['k:' + id] = p.contract.expires; }
  const rival = Object.values(state.teams).filter((t) => t.id !== user.id && t.leagueId === user.leagueId && rivalry(state, user.id, t.id)).sort((a, b) => b.prestige - a.prestige)[0];
  if (rival) { c.rival = rival.id; c.rivalRoster = rival.roster.join(','); } else { delete c.rival; delete c.rivalRoster; }
}

// ------------------------------------------------------------------ follow-ups & club life
function followUps(state: GameState, bz: BuzzState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  for (const e of bz.events) {
    if (e.kind !== 'jump' || e.teamId !== user.id || ((e.follow ?? 0) & 1)) continue;
    const age = days(e.date, state.date);
    if (age < 2) continue;
    const p = e.playerId ? state.players[e.playerId] : undefined;
    if (p && age <= 6 && rng.chance(0.55)) posts(state, rng, user, 'anomaly_conspiracy', { player: p.handle, old: e.data?.old, ovr: e.data?.ovr }, 2, { playerId: p.id });
    else if (age <= 6) continue;
    e.follow = (e.follow ?? 0) | 1;
  }
}

function clubLife(state: GameState, bz: BuzzState, rng: RNG) {
  const user = state.teams[state.userTeamId];
  const md = state.date.slice(5);
  const roster = user.roster.map((id) => state.players[id]).filter(Boolean) as Player[];
  const starters = new Set(Object.values(user.lineup).filter(Boolean) as string[]);
  // dated moments
  for (const p of roster) {
    if (p.birthdate?.slice(5) === md) {
      posts(state, rng, user, 'player_birthday', { player: p.handle, age: ageInt(p, state.date) }, 2, { playerId: p.id });
      if (ownerHas(state, 'sentimental') || ownerHas(state, 'generous')) ownerMail(state, 'player_birthday', { player: p.handle, age: ageInt(p, state.date) }, { pri: 0, tone: 1 });
    }
    const since = p.contract?.signedOn;
    const years = since ? Number(state.date.slice(0, 4)) - Number(since.slice(0, 4)) : 0;
    if (since && years >= 1 && since.slice(5) === md) posts(state, rng, user, 'club_anniversary', { player: p.handle, years }, 2, { playerId: p.id });
  }
  if (bz.flags.patch !== state.patch) {
    const known = !!bz.flags.patch;
    bz.flags.patch = state.patch;
    const pow = Object.entries(state.championPower).sort((a, b) => b[1] - a[1]);
    if (known && pow.length && rng.chance(0.45)) {
      posts(state, rng, user, 'patch_day', { champ: champName(pow[0][0]) }, 1);
      if (rng.chance(0.4)) posts(state, rng, user, 'patch_day_nerf', { champ: champName(pow[pow.length - 1][0]) }, 1);
      if (ownerHas(state, 'dataNerd')) ownerMail(state, 'patch_day', { champ: champName(pow[0][0]), patch: state.patch }, { pri: 0, cd: ['patchDay', 40] });
    }
  }
  const next = nextFixture(state, user.id);
  if (next && days(state.date, next.date) === 1) {
    const opp = state.teams[next.teamA === user.id ? next.teamB! : next.teamA!];
    const comp = state.competitions[next.competitionId];
    const big = comp && (comp.tier === 0 || comp.kind === 'playoffs' || /Final/.test(next.label ?? '') || !!rivalry(state, user.id, opp.id));
    const lore = opp ? loreCtx(state, user, opp) : null;
    if (lore && bcool(bz, 'eve:' + next.id, state.date, 30)) {
      posts(state, rng, user, user.id === T1_ID ? 'lore_eve_t1' : 'lore_eve_lpl', lore, 2);
      if (user.id !== T1_ID) ownerAsk(state, 'lore_curse', rng);
    } else if (opp && big && rng.chance(0.65) && bcool(bz, 'eve:' + next.id, state.date, 30)) posts(state, rng, user, 'big_match_eve', { opp: opp.name, oppShort: opp.short, comp: comp.name.replace(/\s\d{4}$/, '') }, comp.tier === 0 || /Final/.test(next.label ?? '') ? 2 : 1);
    else if (opp && rng.chance(0.22) && bcool(bz, 'scrim', state.date, 10)) posts(state, rng, user, 'scrim_leak', { oppShort: opp.short }, 1);
  }
  // squad health & contracts (at most two a day)
  let health = 2;
  for (const p of rng.shuffle([...roster])) {
    if (health <= 0) break;
    const left = p.contract ? days(state.date, p.contract.expires) : 999;
    if ((starters.has(p.id) || p.reputation >= 60) && left > 0 && left <= 75 && rng.chance(0.5) && bcool(bz, 'cw:' + p.id, state.date, 30)) { posts(state, rng, user, 'contract_worry', { player: p.handle, days: left }, 1, { playerId: p.id }); health--; }
    else if (starters.has(p.id) && p.fatigue >= 85 && bcool(bz, 'burn:' + p.id, state.date, 30)) { posts(state, rng, user, 'burnout_worry', { player: p.handle }, 1, { playerId: p.id }); health--; }
    else if (p.morale <= 30 && rng.chance(0.6) && bcool(bz, 'unhappy:' + p.id, state.date, 30)) { posts(state, rng, user, 'unhappy_player', { player: p.handle }, 1, { playerId: p.id }); health--; }
    else if (!starters.has(p.id) && (p.reputation >= 45 || ovrOf(p) >= teamAvg(state, user) - 4) && rng.chance(0.3)) {
      const idle = p.lastPlayed ? days(p.lastPlayed, state.date) : p.contract ? days(p.contract.signedOn, state.date) : 0;
      if (idle >= 45 && bcool(bz, 'sub:' + p.id, state.date, 45)) { posts(state, rng, user, 'free_the_sub', { player: p.handle, days: idle }, 1, { playerId: p.id }); health--; }
    }
  }
  // one piece of flavour on quiet days
  if (next && next.date === state.date) return;
  const fav = roster.length ? rng.weighted(roster, (p) => 1 + p.reputation / 25 + (p.traits.includes('fan_favorite') ? 3 : 0) + (starters.has(p.id) ? 1 : 0)) : undefined;
  if (!fav) return;
  const r = rng.next();
  if (r < 0.06 && bcool(bz, 'fanart', state.date, 10)) posts(state, rng, user, 'fan_content', { player: fav.handle }, rng.int(1, 2), { playerId: fav.id });
  else if (r < 0.1 && bcool(bz, 'vlog', state.date, 14)) posts(state, rng, user, 'off_day_content', { player: fav.handle }, 1, { playerId: fav.id });
  else if (r < 0.12 && bcool(bz, 'meetup', state.date, 45)) posts(state, rng, user, 'fan_meetup', { player: fav.handle }, rng.int(1, 2), { playerId: fav.id });
  else if (r < 0.22 && inTransferWindow(state.date) && bcool(bz, 'rumourOut', state.date, 21)) {
    const star = roster.filter((p) => p.reputation >= 62).sort((a, b) => b.reputation - a.reputation)[0];
    const suitors = Object.values(state.teams).filter((t) => t.id !== user.id && t.region === user.region && tierOf(state, t) <= tierOf(state, user) && t.prestige >= user.prestige - 10);
    if (star && suitors.length) posts(state, rng, user, 'rumour_star_leaving', { player: star.handle, suitor: rng.pick(suitors).short }, 2, { playerId: star.id });
  }
}

// ------------------------------------------------------------------ hooks
/** Daily (from reactionsDaily): edits → rating scan → club scan → follow-ups → club life. */
export function buzzDaily(state: GameState) {
  const user = state.teams[state.userTeamId];
  if (!user) return;
  const bz = buzzState(state);
  if (bz.day === state.date) return;
  const first = !bz.day; // old save / new game: take snapshots, react from tomorrow
  bz.day = state.date;
  const rng = new RNG(hashString(state.date + 'buzz') ^ state.seq);
  const tracked = trackedTeams(state);
  const q: Quota = { posts: 14, world: 2 };
  // edits always get their reaction — even on a career's first day (edit, then press Continue)
  processEdits(state, bz, rng, tracked, q);
  scanRatings(state, bz, rng, tracked, first, q);
  scanClub(state, bz, rng, first);
  if (first) { bz.flags.patch = state.patch; return; }
  followUps(state, bz, rng);
  clubLife(state, bz, rng);
  if (weekday(state.date) === 1) {
    // housekeeping: old flags, players no longer tracked
    const cutoff = addDays(state.date, -400);
    for (const [k, v] of Object.entries(bz.flags)) if (/^\d{4}-\d\d-\d\d$/.test(v) && v < cutoff) delete bz.flags[k];
    for (const id of Object.keys(bz.ovr)) { const p = state.players[id]; if (!p || p.retired || !p.teamId || !tracked.has(p.teamId)) { delete bz.ovr[id]; delete bz.base[id]; } }
    bz.edits = bz.edits.filter((e) => !e.seen || days(e.date, state.date) <= 30);
  }
}

/** After each user series: form vs rating (possessed / slump), anomaly follow-ups, streaks, attendance. */
export function buzzAfterSeries(state: GameState, info: SeriesInfo) {
  const team = state.teams[info.teamId];
  if (!team || team.id !== state.userTeamId) return;
  const bz = buzzState(state);
  const rng = new RNG(hashString(info.f.id + 'buzz') ^ state.seq);
  const games = info.f.result?.games ?? [];
  const sf = updateForm(state, team, games);
  const avg = teamAvg(state, team);
  // a dominant team makes everyone look "above their rating": judge players against their teammates too
  const lineupForm = ROLES.map((r) => team.lineup[r] ? formOf(state, team.lineup[r]!, 6) : null).filter((f) => f && f.games >= 3);
  const teamRes = lineupForm.length ? lineupForm.reduce((s, f) => s + f!.res, 0) / lineupForm.length : 0;
  const ready = (b: BuzzState, key: string, n: number) => !b.flags[key] || days(b.flags[key], state.date) >= n;
  let loud = 0; // anomaly groups after this series (keeps the feed readable)
  for (const [pid, x] of sf) {
    const p = state.players[pid];
    if (!p) continue;
    const kda = kdaStr(x.k, x.d, x.a);
    // did the overnight upgrade show up on the Rift?
    const jump = bz.events.find((e) => e.playerId === pid && e.kind === 'jump' && !((e.follow ?? 0) & 2) && days(e.date, state.date) <= 30);
    if (jump) {
      jump.follow = (jump.follow ?? 0) | 2;
      posts(state, rng, team, x.res >= 0.3 || Number(kda) >= 4 ? 'anomaly_confirmed' : 'anomaly_doubt', { player: p.handle, old: jump.data?.old, ovr: jump.data?.ovr, kda }, 2, { playerId: pid });
    }
    const f6 = formOf(state, pid, 6), ovr = ovrOf(p);
    const fctx: Ctx = { player: p.handle, kda: f6.kda.toFixed(1), mvps: f6.mvps, games: f6.games, champ: bestChamp(p) };
    if (loud < 2 && f6.games >= 5 && f6.res >= 2 && f6.res - teamRes >= 1.1 && f6.mvps >= 2 && ovr <= avg + 3 && ready(bz, 'possAny', 21) && ready(bz, 'poss:' + pid, 75)) {
      bz.flags.possAny = bz.flags['poss:' + pid] = state.date;
      loud++;
      addBuzzEvent(state, { kind: 'possessed', playerId: pid, teamId: team.id, data: { kda: fctx.kda as string, mvps: f6.mvps, games: f6.games } });
      posts(state, rng, team, 'possessed', fctx, 3, { playerId: pid, stakes: 1.5 });
      news(state, rng, 'possessed', { ...fctx, team: team.name, short: team.short }, [team.id], [pid]);
      ownerMail(state, 'possessed', fctx, { pri: 1, tone: 1, cd: ['possessed', 30] });
      if (rng.chance(ownerHas(state, 'ambitious') || ownerHas(state, 'frugal') ? 0.7 : 0.35)) ownerAsk(state, 'possessed_contract', rng);
    } else if (loud < 2 && f6.games >= 5 && f6.res <= -1.9 && f6.res - teamRes <= -0.9 && f6.kda < 2.2 && (ovr >= avg + 1 || p.reputation >= 70) && bcool(bz, 'slump:' + pid, state.date, 45)) {
      loud++;
      addBuzzEvent(state, { kind: 'slump', playerId: pid, teamId: team.id, data: { kda: fctx.kda as string, games: f6.games } });
      posts(state, rng, team, 'slump', fctx, rng.int(2, 3), { playerId: pid });
      if (p.reputation >= 70) news(state, rng, 'slump', { ...fctx, team: team.name, short: team.short }, [team.id], [pid]);
      if (ownerHas(state, 'impatient') || ownerHas(state, 'hotHeaded') || ownerHas(state, 'ambitious')) ownerMail(state, 'slump', fctx, { pri: 0, tone: -1, cd: ['slump', 30] });
    }
    // hot / cold runs ending
    const hot = bz.events.find((e) => e.playerId === pid && e.kind === 'possessed' && !e.follow && days(e.date, state.date) <= 30 && e.date !== state.date);
    if (hot && x.res <= -1.2) { hot.follow = 1; posts(state, rng, team, 'heater_over', { player: p.handle }, 2, { playerId: pid }); }
    const cold = bz.events.find((e) => e.playerId === pid && e.kind === 'slump' && !e.follow && days(e.date, state.date) <= 45 && e.date !== state.date);
    if (cold && x.res >= 1.5) { cold.follow = 1; posts(state, rng, team, 'slump_over', { player: p.handle, kda }, 2, { playerId: pid }); }
    // the owner notices big milestones
    const cg = clubGames(p, team.id), m = MILESTONES.find((v) => cg - x.games < v && cg >= v);
    if (m) ownerMail(state, 'games_milestone', { player: p.handle, n: m }, { pri: 0, tone: 1 });
  }
  // the team is too good to be true
  const fm = fanMood(state, team.id);
  if ([10, 15, 20, 30, 40, 50, 75, 100].includes(fm.streak) && bcool(bz, 'toogood', state.date, 10)) {
    const ctx = { streak: fm.streak };
    addBuzzEvent(state, { kind: 'too_good', teamId: team.id, data: ctx });
    posts(state, rng, team, 'too_good', ctx, 3, { stakes: 1.5 });
    if (fm.streak >= 12) news(state, rng, 'too_good', { ...ctx, team: team.name, short: team.short }, [team.id]);
    ownerMail(state, 'too_good', ctx, { pri: 1, tone: 1 });
  }
  const lore = loreCtx(state, team, state.teams[info.oppId], info.f);
  if (lore) ownerMail(state, team.id === T1_ID ? 'lore_t1_win' : 'lore_lpl_loss', lore, { pri: 1, tone: team.id === T1_ID ? 1 : -1, cd: ['lore', 14] });
  else if (info.won && info.winProb < 0.3 && info.big) ownerMail(state, 'giant_killing', { opp: state.teams[info.oppId]?.name, oppShort: state.teams[info.oppId]?.short, score: `${info.my}-${info.their}` }, { pri: 0, tone: 1, cd: ['giant', 30] });
  // match-day crowd (attendance is set by the fan module for league/playoff series)
  if (info.comp && info.comp.tier > 0 && fm.attendance !== undefined) {
    if (fm.attendance >= 97 && bcool(bz, 'soldout', state.date, 30)) { posts(state, rng, team, 'sold_out', {}, 2); ownerMail(state, 'sold_out', {}, { pri: 0, tone: 1, cd: ['soldOut', 60] }); }
    else if (fm.attendance <= 35 && bcool(bz, 'empty', state.date, 30)) { posts(state, rng, team, 'empty_seats', { pct: fm.attendance }, 1); ownerMail(state, 'empty_seats', { pct: fm.attendance }, { pri: 0, tone: -1, cd: ['empty', 60] }); }
  }
  bz.flags.lastMatch = state.date;
}

/** Every finished series: T1 vs LPL lore elsewhere in the world (their fanbases, a neutral take on ours, news). */
export function buzzAnySeries(state: GameState, f: MatchFixture) {
  const a = f.teamA ? state.teams[f.teamA] : undefined, b = f.teamB ? state.teams[f.teamB] : undefined;
  const user = state.teams[state.userTeamId];
  if (!a || !b || !user || !f.result) return;
  const lore = loreCtx(state, a, b, f);
  if (!lore) return;
  const rng = new RNG(hashString(f.id + 'lore') ^ state.seq);
  const t1 = a.id === T1_ID ? a : b, lpl = t1 === a ? b : a;
  const mine = user.id === a.id || user.id === b.id;
  if (!mine) {
    if (tierOf(state, t1) <= 1) posts(state, rng, t1, 'lore_win_t1', lore, rng.int(1, 2));
    if (tierOf(state, lpl) <= 1) posts(state, rng, lpl, 'lore_loss_lpl', lore, 1);
    if (bcool(buzzState(state), 'loreWorld', state.date, 5)) posts(state, rng, user, 'lore_world', lore, 1);
  }
  if (mine || state.competitions[f.competitionId]?.tier === 0) {
    const h = fill(rng.pick(LORE_NEWS.headline), lore), body = fill(rng.pick(LORE_NEWS.body), lore);
    if (h && body) addNews(state, { headline: h, body, tags: ['buzz', 'lore'], teamIds: [t1.id, lpl.id] });
  }
}

// ------------------------------------------------------------------ owner requests about anomalies
const latest = (state: GameState, kind: string, within: number) => state.fanPulse?.buzz?.events.find((e) => e.kind === kind && e.teamId === state.userTeamId && days(e.date, state.date) <= within);
const nudgePlayer = (state: GameState, id: unknown, morale = 0, loyalty = 0, fatigue = 0) => {
  const p = state.players[String(id)];
  if (!p) return;
  p.morale = clamp(p.morale + morale, 5, 100);
  p.hidden.loyalty = clamp(p.hidden.loyalty + loyalty, 1, 99);
  p.fatigue = clamp(p.fatigue + fatigue, 0, 100);
};

registerOwnerQuirk('anomaly_probe', {
  cd: 45,
  make: (state, _o, team) => {
    const e = latest(state, 'jump', 7);
    const p = e?.playerId ? state.players[e.playerId] : undefined;
    if (!e || !p || p.teamId !== team.id) return null;
    const cost = Math.round(25000 * moneyScale(state, team));
    return {
      data: { player: p.handle, playerId: p.id, old: Number(e.data?.old), ovr: Number(e.data?.ovr), delta: Number(e.data?.delta), cost: usd(cost), costN: cost },
      options: [
        { id: 'report', label: 'Commission a full analytics report', hint: `${usd(cost)} · data-minded owners love it` },
        { id: 'jinx', label: 'Don’t touch anything — don’t jinx it', hint: 'Superstitious owners approve' },
        { id: 'cameras', label: 'Put him in front of the cameras', hint: 'Hype & fans up · he gets tired' },
        { id: 'extend', label: 'Open contract-extension talks now', hint: 'He feels valued · frugal owners wince' },
      ],
      fallback: 'jinx',
    };
  },
  resolve: (state, o, req, opt, rng) => {
    const has = (t: string) => o.traits.includes(t as never);
    if (opt === 'report') return { out: rng.chance(0.5) ? 'report_good' : 'report_weird', fx: { cash: -Number(req.data?.costN ?? 0), cat: 'Analytics', owner: has('dataNerd') ? 9 : 3 } };
    if (opt === 'jinx') { nudgePlayer(state, req.data?.playerId, 2); return { out: 'jinx', fx: { owner: has('superstitious') ? 8 : has('impatient') ? -3 : 1 } }; }
    if (opt === 'cameras') { nudgePlayer(state, req.data?.playerId, 1, 0, 6); return { out: 'cameras', fx: { hype: 5, fans: 1, owner: has('publicity') ? 9 : 2 } }; }
    nudgePlayer(state, req.data?.playerId, 6, 4);
    return { out: 'extend', fx: { owner: has('sentimental') || has('ambitious') ? 7 : has('frugal') ? -5 : 2 } };
  },
}, 'the mystery upgrade');

registerOwnerQuirk('windfall', {
  cd: 90,
  make: (state, _o, team) => {
    const e = latest(state, 'money', 5);
    if (!e) return null;
    const amount = Number(e.data?.amount ?? 0);
    const k = (Object.keys(FACILITY_INFO) as FacilityKey[]).filter((x) => team.facilities[x] < 5).sort((x, y) => team.facilities[x] - team.facilities[y])[0];
    return {
      data: { amount: usd(amount), amountN: amount, facilityKey: k ?? '' },
      options: [
        { id: 'reinvest', label: 'Reinvest it in facilities', hint: k ? `${FACILITY_INFO[k].name} +1` : 'Facilities are maxed' },
        { id: 'dividend', label: 'Pay the owner a dividend', hint: `−${usd(Math.round(amount * 0.1))} · owner delighted` },
        { id: 'audit', label: 'Order an audit', hint: 'Coin flip: reassurance or confusion' },
      ],
      fallback: 'audit',
    };
  },
  resolve: (state, o, req, opt, rng) => {
    const team = state.teams[o.teamId], has = (t: string) => o.traits.includes(t as never);
    if (opt === 'reinvest') { const k = req.data?.facilityKey as FacilityKey | ''; if (k) team.facilities[k] = Math.min(5, team.facilities[k] + 1); return { out: 'reinvest', fx: { owner: 4 } }; }
    if (opt === 'dividend') return { out: 'dividend', fx: { cash: -Math.round(Number(req.data?.amountN ?? 0) * 0.1), cat: 'Owner dividend', owner: has('frugal') ? 14 : 10 } };
    return rng.chance(0.5) ? { out: 'audit_clean', fx: { owner: 3 } } : { out: 'audit_weird', fx: { owner: -2 } };
  },
}, 'the windfall');

registerOwnerQuirk('possessed_contract', {
  cd: 120,
  make: (state, _o, team) => {
    const e = latest(state, 'possessed', 5);
    const p = e?.playerId ? state.players[e.playerId] : undefined;
    if (!e || !p || p.teamId !== team.id) return null;
    const bonus = Math.round(40000 * moneyScale(state, team));
    return {
      data: { player: p.handle, playerId: p.id, kda: String(e.data?.kda ?? ''), mvps: Number(e.data?.mvps ?? 0), bonus: usd(bonus), bonusN: bonus },
      options: [
        { id: 'extend', label: 'Reward him with a bonus and a new deal', hint: `${usd(bonus)} · morale & loyalty up` },
        { id: 'wait', label: 'Wait — form is temporary', hint: 'Patient owners agree, impatient ones don’t' },
        { id: 'shop', label: 'Shop him while his value is sky-high', hint: 'Owner (maybe) pleased · player hurt' },
      ],
      fallback: 'wait',
    };
  },
  resolve: (state, o, req, opt) => {
    const has = (t: string) => o.traits.includes(t as never);
    if (opt === 'extend') { nudgePlayer(state, req.data?.playerId, 8, 5); return { out: 'extend', fx: { cash: -Number(req.data?.bonusN ?? 0), cat: 'Player bonuses', owner: has('frugal') ? -4 : has('ambitious') || has('sentimental') ? 6 : 2 } }; }
    if (opt === 'shop') { nudgePlayer(state, req.data?.playerId, -8, -6); return { out: 'shop', fx: { chem: -2, owner: has('frugal') ? 8 : has('sentimental') ? -8 : 1 } }; }
    return { out: 'wait', fx: { owner: has('impatient') ? -6 : has('patient') ? 3 : 0 } };
  },
}, 'his contract');

/** Owner effect helper re-exported for the debug script (applies a small fx bundle as the owner). */
export const buzzOwnerFx = ownerFx;

registerOwnerQuirk('lore_curse', {
  cd: 60,
  make: (state, _o, team) => {
    const f = nextFixture(state, team.id);
    const opp = f ? state.teams[f.teamA === team.id ? f.teamB! : f.teamA!] : undefined;
    const lore = opp ? loreCtx(state, team, opp) : null;
    if (!f || !lore || team.id === T1_ID) return null;
    const cost = Math.round(15000 * moneyScale(state, team));
    return {
      data: { t1: String(lore.t1), lpl: String(lore.lpl), cost: usd(cost), costN: cost },
      options: [
        { id: 'ritual', label: 'Have the gaming house cleansed', hint: 'Superstitious owners love it' },
        { id: 'vods', label: 'Extra VOD review of every T1 vs LPL game', hint: `${usd(cost)} · data-minded owners approve` },
        { id: 'embrace', label: 'Tell the players to just have fun', hint: 'Morale up · ambitious owners frown' },
      ],
      fallback: 'embrace', days: Math.max(1, days(state.date, f.date)),
    };
  },
  resolve: (_s, o, req, opt) => {
    const has = (t: string) => o.traits.includes(t as never);
    if (opt === 'ritual') return { out: 'ritual', fx: { owner: has('superstitious') ? 9 : 2 } };
    if (opt === 'vods') return { out: 'vods', fx: { cash: -Number(req.data?.costN ?? 0), cat: 'Analytics', owner: has('dataNerd') ? 7 : 2 } };
    return { out: 'embrace', fx: { morale: 3, owner: has('ambitious') ? -4 : 1 } };
  },
}, 'the curse');
