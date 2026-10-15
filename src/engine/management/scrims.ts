// Scrims: the user's club invites other clubs to scrim blocks (a day of ~5 practice games) and answers their
// invitations. Whether a club says yes depends on what it gets out of it — clubs want partners at least as strong as
// themselves, famous clubs are attractive (and choosy), a big tier gap or an official match against each other soon
// is a no, and rapport from past blocks helps. Better partners make better practice: the week's scrim quality scales
// the user's training (development.ts weekPlan), and every block teaches the staff a little about the other roster.
// Daily processing from endDay (game.ts), before the weekly training. AI clubs' own scrims are not modelled.
import type { GameState, ScrimBlock, ScrimPartner, ScrimState, Team } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString, sigmoid } from '../../util/rng';
import { addDays, weekday } from '../season/formats';
import { overall } from '../setup';
import { addInbox } from './news';
import { gameWinProb } from './fixtureinfo';
import { lineupStrength, fill, emit, baseCtx, type Ctx } from './fans';
import { SCRIM_NOTES, SCRIM_REPLIES, SCRIM_INVITE_IN, ORG_FAN_POSTS, ORG_FAN_META } from './contentTemplates';
import { FAN_TEMPLATES, SCENARIO_META } from './fanTemplates';
import { contentEvent, scrimWeek } from './contentFx';

export const SCRIM_GAMES = 5;
/** Open (pending / booked, not yet played) blocks the user can have at once. */
export const MAX_OPEN = 6;
/** Days ahead a block can be booked. */
export const BOOK_AHEAD = 7;

export function scrimState(state: GameState): ScrimState {
  return (state.scrims ??= { blocks: [], partners: {} });
}
export const partnerOf = (state: GameState, teamId: string): ScrimPartner => (scrimState(state).partners[teamId] ??= { blocks: 0, w: 0, l: 0, rapport: 50 });

const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
/** Fame: audience (log scale) and prestige. A big tier-1 club ≈ 9–10, a tier-3 club ≈ 5. */
export const fameOf = (t: Team) => Math.log10(Math.max(1000, t.fans)) + t.prestige / 25;
export const powerOf = (state: GameState, t: Team) => lineupStrength(state, t);
const full = (state: GameState, t: Team) => ROLES.every((r) => { const id = t.lineup[r]; return !!id && state.players[id]?.teamId === t.id; });

/** Teams in an international event that is running now (they scrim on site). */
function atEvent(state: GameState, teamId: string): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(state.competitions)) if (c.tier === 0 && c.status === 'active' && c.teams.includes(teamId)) for (const t of c.teams) out.add(t);
  return out;
}

/** Clubs the user can scrim: the same region (ping), or anyone at the same international event. */
export function scrimCandidates(state: GameState): Team[] {
  const me = state.teams[state.userTeamId];
  const intl = atEvent(state, me.id);
  return Object.values(state.teams).filter((t) => t.id !== me.id && t.roster.length >= 5 && full(state, t) && (t.region === me.region || intl.has(t.id)));
}

/** Official fixture of a team on a date (or null). */
export function matchOn(state: GameState, teamId: string, date: string) {
  return Object.values(state.fixtures).find((f) => f.date === date && (f.teamA === teamId || f.teamB === teamId)) ?? null;
}
/** Days until the next official match between the two clubs (null if none scheduled in the next 3 weeks). */
function nextMeeting(state: GameState, a: string, b: string): number | null {
  const until = addDays(state.date, 21);
  let best: string | null = null;
  for (const f of Object.values(state.fixtures)) {
    if (f.result || f.date < state.date || f.date > until) continue;
    if ((f.teamA === a && f.teamB === b) || (f.teamA === b && f.teamB === a)) if (!best || f.date < best) best = f.date;
  }
  return best ? Math.round((new Date(best).getTime() - new Date(state.date).getTime()) / 864e5) : null;
}

export type ScrimWhy = 'accept' | 'acceptHonoured' | 'declineStronger' | 'declineFame' | 'declineTier' | 'declineOpponent' | 'declineBusy' | 'declineRapport' | 'declineGeneric';
export interface ScrimOdds { p: number; label: string; color: string; factors: { text: string; v: number }[]; main: ScrimWhy }

/**
 * How likely `them` is to say yes to scrims with the user's club (on `date`, if given). The same score, seen from the
 * other side, decides which AI clubs invite the user.
 */
export function scrimOdds(state: GameState, themId: string, date?: string, replying = false): ScrimOdds {
  const me = state.teams[state.userTeamId], them = state.teams[themId];
  const factors: { text: string; v: number; why?: ScrimWhy }[] = [];
  const add = (text: string, v: number, why?: ScrimWhy) => { if (Math.abs(v) >= 0.05) factors.push({ text, v, why }); };
  const gap = powerOf(state, me) - powerOf(state, them);
  add(gap >= 0 ? `Your lineup is ${gap >= 6 ? 'much ' : ''}stronger (${Math.round(gap)})` : `Your lineup is weaker (${Math.round(gap)})`, gap >= 0 ? 0.5 + Math.min(1.2, gap * 0.08) : gap * 0.17, 'declineStronger');
  const fame = clamp(fameOf(me) - fameOf(them), -2.5, 2);
  add(fame >= 0 ? 'Your club is the bigger name' : 'They are the bigger name', fame * 0.45, 'declineFame');
  const tg = tierOf(state, me) - tierOf(state, them);
  if (tg > 0) add(`You play ${tg} tier${tg > 1 ? 's' : ''} below them`, -0.7 * tg, 'declineTier');
  const pr = partnerOf(state, themId);
  add(pr.rapport >= 50 ? 'Good rapport from past scrims' : 'Bad blood from past scrims', (pr.rapport - 50) / 28, 'declineRapport');
  add('Your reputation as a manager', (state.manager.reputation - 50) / 50 * 0.4);
  if (me.parentTeamId === them.id || me.academyTeamId === them.id) add('Same organisation', 2.2);
  const meet = nextMeeting(state, me.id, them.id);
  if (meet !== null && meet <= 10) add(`You play them officially in ${meet} day${meet === 1 ? '' : 's'}`, -3.5, 'declineOpponent');
  const recentAsks = (pr.asks ?? []).filter((d) => d > addDays(state.date, -14)).length - (replying ? 1 : 0); // the invite being answered doesn't count
  if (recentAsks >= 2) add('You keep asking', -0.5 * (recentAsks - 1), 'declineGeneric');
  const sameWeek = scrimState(state).blocks.some((b) => b.teamId === themId && b.status === 'accepted' && b.date >= state.date);
  if (sameWeek) add('Already booked with you this week', -0.8, 'declineBusy');
  let busy = false;
  if (date && matchOn(state, themId, date)) { busy = true; add('They have an official match that day', -5, 'declineBusy'); }
  const x = 0.35 + factors.reduce((s, f) => s + f.v, 0);
  const p = clamp(sigmoid(x), 0.02, 0.97);
  // the reason they give: the biggest thing against it (or what makes them keen)
  const worst = factors.filter((f) => f.v < 0 && f.why).sort((a, b) => a.v - b.v)[0];
  const main: ScrimWhy = busy ? 'declineBusy' : meet !== null && meet <= 10 ? 'declineOpponent' : p >= 0.5 ? (fame >= 1.2 || gap >= 8 ? 'acceptHonoured' : 'accept') : worst?.why ?? 'declineGeneric';
  const label = p >= 0.8 ? 'Very likely' : p >= 0.6 ? 'Likely' : p >= 0.4 ? 'Maybe' : p >= 0.2 ? 'Unlikely' : p >= 0.07 ? 'Long shot' : 'No chance';
  const color = p >= 0.6 ? '#22c55e' : p >= 0.4 ? '#c8aa6e' : p >= 0.2 ? '#f97316' : '#ef4444';
  return { p, label, color, factors: factors.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).map(({ text, v }) => ({ text, v })), main };
}

/** Days the user can book (tomorrow … a week ahead) with what's already on them. */
export function bookableDays(state: GameState): { date: string; match: boolean; booked: boolean }[] {
  const s = scrimState(state);
  const out = [];
  for (let i = 1; i <= BOOK_AHEAD; i++) {
    const d = addDays(state.date, i);
    out.push({ date: d, match: !!matchOn(state, state.userTeamId, d), booked: s.blocks.some((b) => b.date === d && (b.status === 'accepted' || (b.status === 'pending' && b.dir === 'out'))) });
  }
  return out;
}
export const openBlocks = (state: GameState) => scrimState(state).blocks.filter((b) => (b.status === 'pending' || b.status === 'accepted') && b.date >= state.date);

/** Send an invitation; the other club answers tomorrow. */
export function sendScrimInvite(state: GameState, teamId: string, date: string): { ok: boolean; message: string } {
  const s = scrimState(state);
  const them = state.teams[teamId];
  if (!them || !scrimCandidates(state).some((t) => t.id === teamId)) return { ok: false, message: 'You can’t scrim that club (different region or no full roster).' };
  if (date <= state.date || date > addDays(state.date, BOOK_AHEAD)) return { ok: false, message: `Pick a day in the next ${BOOK_AHEAD} days.` };
  if (matchOn(state, state.userTeamId, date)) return { ok: false, message: 'You have an official match that day.' };
  if (s.blocks.some((b) => b.date === date && (b.status === 'accepted' || (b.status === 'pending' && b.dir === 'out')))) return { ok: false, message: 'You already have scrims booked (or asked for) that day.' };
  if (s.blocks.some((b) => b.teamId === teamId && b.status === 'pending' && b.dir === 'out')) return { ok: false, message: `You are still waiting for ${them.short} to answer.` };
  if (openBlocks(state).filter((b) => b.dir === 'out' || b.status === 'accepted').length >= MAX_OPEN) return { ok: false, message: `At most ${MAX_OPEN} scrim blocks can be open at once.` };
  s.blocks.unshift({ id: `scrim_${state.seq++}`, teamId, date, dir: 'out', status: 'pending', sent: state.date, replyOn: addDays(state.date, 1) });
  const pr = partnerOf(state, teamId);
  pr.asks = [...(pr.asks ?? []).filter((d) => d > addDays(state.date, -21)), state.date];
  trim(s);
  return { ok: true, message: `Invitation sent to ${them.name}. They answer tomorrow.` };
}

/** Withdraw an invitation or cancel a booked block (cancelling a booked block costs rapport). */
export function cancelScrim(state: GameState, id: string): { ok: boolean; message: string } {
  const b = scrimState(state).blocks.find((x) => x.id === id);
  if (!b || (b.status !== 'pending' && b.status !== 'accepted')) return { ok: false, message: 'Nothing to cancel.' };
  const them = state.teams[b.teamId];
  const booked = b.status === 'accepted';
  if (booked) partnerOf(state, b.teamId).rapport = clamp(partnerOf(state, b.teamId).rapport - 8, 0, 100);
  b.status = 'cancelled';
  return { ok: true, message: booked ? `Scrims with ${them?.short ?? 'them'} cancelled — they won't be thrilled.` : `Invitation to ${them?.short ?? 'them'} withdrawn.` };
}

/** Answer an AI club's invitation (inbox action). */
export function answerScrimInvite(state: GameState, id: string, yes: boolean): { ok: boolean; message: string } {
  const b = scrimState(state).blocks.find((x) => x.id === id);
  const them = b ? state.teams[b.teamId] : undefined;
  if (!b || !them || b.dir !== 'in' || b.status !== 'pending') return { ok: false, message: 'This invitation is no longer open.' };
  if (b.date <= state.date) { b.status = 'expired'; return { ok: false, message: 'Too late — that day has passed.' }; }
  const pr = partnerOf(state, b.teamId);
  if (!yes) { b.status = 'declined'; pr.rapport = clamp(pr.rapport - 3, 0, 100); return { ok: true, message: `You turned down ${them.short}.` }; }
  if (matchOn(state, state.userTeamId, b.date)) return { ok: false, message: 'You have an official match that day.' };
  if (scrimState(state).blocks.some((x) => x !== b && x.date === b.date && x.status === 'accepted')) return { ok: false, message: 'You already have scrims that day.' };
  b.status = 'accepted';
  pr.rapport = clamp(pr.rapport + 4, 0, 100);
  return { ok: true, message: `Scrims with ${them.short} booked for ${b.date.slice(5)}.` };
}
export const scrimInviteLive = (state: GameState, id: string) => { const b = scrimState(state).blocks.find((x) => x.id === id); return !!b && b.dir === 'in' && b.status === 'pending' && b.date > state.date; };

// ------------------------------------------------------------------ training effect
/** Practice value of a block against a partner: stronger partners teach more (0.85 … 1.3). */
export const blockQuality = (mine: number, theirs: number, close: boolean) =>
  // stronger partners teach more; one within ~4 points of you is as good as your usual practice, a much weaker one less
  clamp(1 + (theirs >= mine ? (theirs - mine) * 0.012 : -Math.max(0, mine - theirs - 4) * 0.009) + (close ? 0.03 : 0), 0.85, 1.3);

export { scrimWeek, scrimTrainingMult } from './contentFx';

// ------------------------------------------------------------------ daily
let registered = false;
function registerTemplates() {
  if (registered) return;
  registered = true;
  for (const [scen, t] of Object.entries(ORG_FAN_POSTS)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t)) (base[p as keyof typeof base] ??= []).push(...(lines ?? []));
  }
  for (const [k, v] of Object.entries(ORG_FAN_META)) SCENARIO_META[k] ??= v;
}
export { registerTemplates as registerOrgTemplates };

const pickLine = (rng: RNG, lines: readonly string[] | undefined, ctx: Ctx) => {
  if (!lines?.length) return '';
  for (let i = 0; i < 6; i++) { const t = fill(rng.pick(lines), ctx); if (t) return t; }
  return '';
};

/** Daily (endDay, after the date moved on): replies arrive, booked blocks are played, AI invitations come in. */
export function scrimsDaily(state: GameState, prev: string) {
  const s = state.scrims;
  const me = state.teams[state.userTeamId];
  if (!me) return;
  const rng = new RNG(hashString(state.date + ':scrims') ^ state.seq);
  if (s) {
    for (const b of s.blocks) {
      const them = state.teams[b.teamId];
      if (!them) { if (b.status === 'pending' || b.status === 'accepted') b.status = 'cancelled'; continue; }
      // replies to the user's invitations
      if (b.dir === 'out' && b.status === 'pending' && (b.replyOn ?? '') <= state.date) {
        const odds = scrimOdds(state, b.teamId, b.date, true);
        // the answer comes in the morning: a block booked for today can still go ahead
        const yes = b.date >= state.date && new RNG(hashString(b.id + ':reply')).next() < odds.p;
        const why: ScrimWhy = yes ? (odds.main.startsWith('accept') ? odds.main : 'accept') : odds.main.startsWith('accept') ? 'declineGeneric' : odds.main;
        b.status = yes ? 'accepted' : 'declined';
        b.why = why;
        b.reply = pickLine(rng, SCRIM_REPLIES[why], { short: me.short, team: me.name, oppShort: them.short, date: fmt(b.date) }) || (yes ? `${them.short} are in for ${fmt(b.date)}.` : `${them.short} pass this time.`);
        addInbox(state, { from: `${them.name} staff`, kind: 'info', subject: yes ? `Scrims on ${fmt(b.date)}: ${them.short} accept` : `Scrims: ${them.short} decline`, body: `${b.reply}\n\n${yes ? `Booked: a block of ${SCRIM_GAMES} games on ${fmt(b.date)}. Manage your scrims on the Scrims page.` : 'You can try another club — or another day — on the Scrims page.'}` });
        if (!yes) { const pr = partnerOf(state, b.teamId); pr.rapport = clamp(pr.rapport - 0.5, 0, 100); }
      }
      // unanswered AI invitations lapse
      if (b.dir === 'in' && b.status === 'pending' && b.date <= state.date) { b.status = 'expired'; partnerOf(state, b.teamId).rapport = clamp(partnerOf(state, b.teamId).rapport - 2, 0, 100); }
      // booked blocks are played on their day
      if (b.status === 'accepted' && b.date <= prev) {
        // fixtures get scheduled as competitions start: nobody scrims on an official match day
        if (matchOn(state, me.id, b.date) || matchOn(state, them.id, b.date)) { b.status = 'cancelled'; b.reply = 'Called off — official match that day.'; }
        else playBlock(state, rng, me, them, b);
      }
    }
  }
  if (weekday(state.date) === 1) { weeklyReport(state); incomingInvites(state, rng, me); }
  if (s) trim(s);
}

const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function playBlock(state: GameState, rng: RNG, me: Team, them: Team, b: ScrimBlock) {
  const mine = powerOf(state, me), theirs = powerOf(state, them);
  // scrims are noisier than official games: both sides test drafts and ideas
  const p = 0.5 + (gameWinProb(mine, theirs) - 0.5) * 0.85;
  let w = 0;
  for (let i = 0; i < SCRIM_GAMES; i++) if (rng.chance(p)) w++;
  const l = SCRIM_GAMES - w;
  const close = w === 2 || w === 3;
  const q = blockQuality(mine, theirs, close);
  // who stood out / struggled (form, rating and a bit of luck)
  const five = ROLES.map((r) => me.lineup[r] ? state.players[me.lineup[r]!] : undefined).filter((x) => !!x);
  const graded = five.map((x) => ({ x, g: overall(x.attributes, x.role) * 0.4 + x.form * 1.5 + rng.normal(0, 7) })).sort((a, b) => b.g - a.g);
  const standout = graded[0]?.x, struggled = graded[graded.length - 1]?.x;
  const bucket = w >= 4 ? 'stomp' : w === 3 ? 'won' : w === 2 ? 'lost' : 'crushed';
  const note = pickLine(rng, SCRIM_NOTES[bucket], { oppShort: them.short, opp: them.name, short: me.short, player: standout?.handle, player2: struggled?.handle, w, l }) || `${w}-${l} against ${them.short}.`;
  b.status = 'played';
  b.result = { w, l, q: Math.round(q * 1000) / 1000, note, standout: standout?.id, struggled: struggled?.id };
  const pr = partnerOf(state, them.id);
  pr.blocks++; pr.w += w; pr.l += l; pr.last = b.date;
  pr.rapport = clamp(pr.rapport + 4 + (close ? 2 : 0), 0, 100);
  // players: a little fatigue; results vs expectation move morale; chemistry from playing together
  const expected = p * SCRIM_GAMES;
  for (const x of five) {
    x.fatigue = clamp(x.fatigue + 1.5, 0, 100);
    x.morale = clamp(x.morale + clamp((w - expected) * 0.6, -2, 2), 5, 100);
  }
  if (standout) standout.morale = clamp(standout.morale + 0.8, 5, 100);
  me.chemistry = clamp(me.chemistry + 0.25, 10, 100);
  // the staff learn about the other roster
  for (const id of them.roster) state.scoutedPlayers[id] = Math.min(100, (state.scoutedPlayers[id] ?? 0) + 4);
  // the scene talks: famous partners and lopsided blocks leak
  const famous = tierOf(state, them) <= 1 && fameOf(them) >= 8;
  if ((famous && rng.chance(0.3)) || ((w === 5 || w === 0) && rng.chance(0.2))) {
    registerTemplates();
    const ctx = { ...baseCtx(state, me), oppShort: them.short, opp: them.name, w, l };
    const scen = rng.chance(0.5) && famous ? 'scrim_partner' : 'scrim_leak';
    for (let i = 0, n = rng.int(1, 2); i < n; i++) emit(state, rng, me, scen, ctx, { replyChance: 0.3 });
    contentEvent(state, 'scrimleak', { opp: them.id, w, l });
  }
}

/** Monday: one inbox note with last week's scrims (results come in quietly, the note sums them up). */
function weeklyReport(state: GameState) {
  const s = state.scrims;
  if (!s || s.reported === state.date) return;
  s.reported = state.date;
  const wk = scrimWeek(state);
  if (!wk.blocks) return;
  const since = addDays(state.date, -7);
  const played = s.blocks.filter((b) => b.status === 'played' && b.result && b.date >= since && b.date < state.date).sort((a, b) => a.date.localeCompare(b.date));
  const lines = played.map((b) => `• ${fmt(b.date)} vs ${state.teams[b.teamId]?.short ?? '?'}: ${b.result!.w}-${b.result!.l} — ${b.result!.note}`);
  const q = wk.q;
  addInbox(state, {
    from: 'Coaching staff', kind: 'info',
    subject: `Scrim report: ${wk.blocks} block${wk.blocks > 1 ? 's' : ''}, ${wk.w}-${wk.l}`,
    body: `${lines.join('\n')}\n\nPractice quality this week: ×${q.toFixed(2)} (${q >= 1.08 ? 'strong partners — the players learned a lot' : q <= 0.96 ? 'weak partners — not much to learn from' : 'about our level'}).${wk.blocks < 3 ? ' Three or more blocks a week give the full effect.' : ''}`,
  });
}

/** Monday: AI clubs that would like to scrim the user send invitations (strong / famous clubs get more). */
function incomingInvites(state: GameState, rng: RNG, me: Team) {
  const s = scrimState(state);
  if (s.blocks.filter((b) => b.dir === 'in' && b.status === 'pending').length >= 2) return;
  const days = bookableDays(state).filter((d) => !d.match && !d.booked && d.date > addDays(state.date, 1));
  if (!days.length) return;
  const cands = scrimCandidates(state).filter((t) => !s.blocks.some((b) => b.teamId === t.id && (b.status === 'pending' || b.status === 'accepted') && b.date >= state.date));
  let sent = 0;
  for (const t of rng.shuffle(cands)) {
    if (sent >= 2) break;
    // the other side's view: they ask if *they* would be keen (the user being strong / famous for them)
    const want = scrimOdds(state, t.id);
    const meet = nextMeeting(state, me.id, t.id);
    if (meet !== null && meet <= 10) continue;
    const tg = tierOf(state, t) - tierOf(state, me); // they're lower: they want to step up
    const chance = want.p * 0.05 * (tg > 0 ? 1.6 : 1) * (powerOf(state, t) < powerOf(state, me) ? 1.4 : 0.6);
    if (!rng.chance(chance)) continue;
    const day = rng.pick(days.filter((d) => !s.blocks.some((b) => b.date === d.date && b.status === 'pending' && b.dir === 'in')));
    if (!day || matchOn(state, t.id, day.date)) continue;
    const b: ScrimBlock = { id: `scrim_${state.seq++}`, teamId: t.id, date: day.date, dir: 'in', status: 'pending', sent: state.date };
    s.blocks.unshift(b);
    const msg = pickLine(rng, SCRIM_INVITE_IN, { oppShort: t.short, opp: t.name, short: me.short, team: me.name, date: fmt(day.date) }) || `${t.short} would like to scrim on ${fmt(day.date)}.`;
    addInbox(state, { from: `${t.name} staff`, kind: 'info', subject: `Scrim invitation from ${t.short} (${fmt(day.date)})`, body: `${msg}\n\nTheir lineup ${Math.round(powerOf(state, t))} vs yours ${Math.round(powerOf(state, me))} — practice quality ×${blockQuality(powerOf(state, me), powerOf(state, t), false).toFixed(2)}.`, action: { type: 'scrimInvite', payload: b.id, label: 'Answer invitation' } });
    sent++;
  }
}

function trim(s: ScrimState) {
  // keep the recent past (results feed the page and the weekly quality) and everything open
  const keep = s.blocks.filter((b) => b.status === 'pending' || b.status === 'accepted');
  const done = s.blocks.filter((b) => b.status !== 'pending' && b.status !== 'accepted').slice(0, 80);
  s.blocks = [...keep, ...done].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
