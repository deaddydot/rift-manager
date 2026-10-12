// Owner / board relationship: a generated owner persona whose mood reacts to results vs expectations,
// finances, fan mood, transfers and club decisions. Sends personality-flavoured board mail
// (rate-limited), quirky requests with choices (Inbox action 'ownerChoice'), tracks promises with
// deadlines, pays bonuses / budget raises and runs an ultimatum chain when confidence collapses.
import type { GameState, OwnerState, OwnerTrait, OwnerRequest, OwnerPromise, Team, FanMood, FacilityKey } from '../types';
import { FACILITY_INFO } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';
import { markActionDone } from './offerActions';
import { fireStaff } from './staffMarket';
import { inTransferWindow } from './transfers';
import { isPlayed, ord } from './fixtureinfo';
import { headCoach } from '../season/prep';
import { placementLabel } from '../season/season';
import { addDays, weekday } from '../season/formats';
import { fanMood, fanEvent, fill, moodLabel, expectationPhrase, rivalry, type SeriesInfo, type ClubEvent, type Ctx } from './fans';
import {
  OWNER_NAMES, OWNER_TITLES, OWNER_BACKGROUNDS, GREETINGS, SIGNOFFS, PS_LINES, OWNER_T, QUIRK_T, NEPHEW_NAMES, NEPHEW_RANKS, STREAMERS,
  DESIGNS, TWEETS, RENAMES, RITUALS, MASCOTS, PETS, WAGER_STAKES, UPBEAT, type OwnerTemplate,
} from './ownerTemplates';

export { TRAIT_INFO } from './ownerTemplates';

const days = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
const has = (o: OwnerState, t: OwnerTrait) => o.traits.includes(t);
const tierOf = (state: GameState, t: Team) => state.leagues[t.leagueId]?.tier ?? 3;
/** Money scale by tier: tier-1 numbers, ~15% in tier 2, ~4% in tier 3. */
const scale = (state: GameState, t: Team) => [1, 1, 0.15, 0.04][tierOf(state, t)] ?? 0.04;
export const usd = (n: number) => { const a = Math.abs(n); return `${n < 0 ? '−' : ''}$${a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)}`; };
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
const compName = (n?: string) => n?.replace(/\s\d{4}$/, '');
const longDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

export function ownerMoodLabel(m: number): { label: string; color: string } {
  if (m >= 60) return { label: 'Delighted', color: '#f0c674' };
  if (m >= 25) return { label: 'Pleased', color: '#22c55e' };
  if (m >= -10) return { label: 'Neutral', color: '#eab308' };
  if (m >= -40) return { label: 'Displeased', color: '#f97316' };
  return { label: 'Furious', color: '#ef4444' };
}

// ------------------------------------------------------------------ persona
function genOwner(state: GameState, team: Team): OwnerState {
  const rng = new RNG(hashString(team.id + state.id));
  const pool = OWNER_NAMES[team.region] ?? OWNER_NAMES.EMEA;
  const first = rng.pick(pool.first), last = rng.pick(pool.last);
  const traits: OwnerTrait[] = [rng.chance(0.5) ? 'patient' : 'impatient', rng.chance(0.5) ? 'frugal' : 'generous'];
  for (const t of rng.shuffle(['ambitious', 'meddling', 'superstitious', 'publicity', 'oldSchool', 'dataNerd', 'sentimental', 'hotHeaded'] as OwnerTrait[])) {
    if (traits.length >= 4) break;
    if ((t === 'dataNerd' && traits.includes('oldSchool')) || (t === 'oldSchool' && traits.includes('dataNerd')) || (t === 'hotHeaded' && traits.includes('patient'))) continue;
    traits.push(t);
  }
  return {
    teamId: team.id, name: pool.eastern ? `${last} ${first}` : `${first} ${last}`, title: rng.pick(OWNER_TITLES), background: rng.pick(OWNER_BACKGROUNDS)[0], traits,
    mood: 15, hired: state.date, birthday: `${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`, record: { w: 0, l: 0 },
    requests: [], promises: [], ultimatum: 0, cooldown: { quirk: addDays(state.date, -12) }, sent: [], log: [],
  };
}
const lastName = (o: OwnerState, state: GameState) => (OWNER_NAMES[state.teams[o.teamId]?.region]?.eastern ? o.name.split(' ')[0] : o.name.split(' ').slice(-1)[0]);

/** The user's owner (generated on first use, and again when the user takes over another club). */
export function ensureOwner(state: GameState): OwnerState {
  const team = state.teams[state.userTeamId];
  if (state.owner && state.owner.teamId === team.id) return state.owner;
  const o = (state.owner = genOwner(state, team));
  mail(state, o, 'welcome', {}, { pri: 2, force: true });
  return o;
}

// ------------------------------------------------------------------ mail
function baseCtx(state: GameState, o: OwnerState): Ctx {
  const team = state.teams[o.teamId];
  const fm = fanMood(state, team.id);
  return {
    mgr: state.manager.name, team: team.name, short: team.short, owner: o.name, background: OWNER_BACKGROUNDS.find((b) => b[0] === o.background)?.[1] ?? o.background, expect: expectationPhrase(fm.expectation),
    season: state.season, league: state.leagues[team.leagueId]?.name, prerank: fm.preRank ? ord(fm.preRank) : undefined, record: `${o.record.w}-${o.record.l}`,
    fans: moodLabel(fm.mood).label.toLowerCase(), balance: usd(team.balance),
  };
}

function pickLines(rng: RNG, o: OwnerState, table: Partial<Record<OwnerTrait, string[]>> | undefined, generic: string[], pref = 0.65, ok: (l: string) => boolean = () => true): string {
  const own = o.traits.flatMap((t) => table?.[t] ?? []).filter(ok);
  generic = generic.filter(ok);
  return own.length && (rng.chance(pref) || !generic.length) ? rng.pick(own) : rng.pick(generic);
}

function canSend(state: GameState, o: OwnerState, pri: number) {
  const recent = o.sent.filter((d) => d > addDays(state.date, -30));
  const today = recent.filter((d) => d === state.date).length;
  if (pri >= 2) return today < 2;
  const gap = recent.length ? days(recent[recent.length - 1], state.date) : 99;
  return pri === 1 ? recent.length < 6 && gap >= 2 : recent.length < 4 && gap >= 4;
}

function send(state: GameState, o: OwnerState, subject: string, body: string, ctx: Ctx, rng: RNG, req?: OwnerRequest, tone = 0) {
  const greet = fill(pickLines(rng, o, GREETINGS, GREETINGS.any, 0.5, (l) => tone >= 0 || !UPBEAT.has(l)), ctx) ?? `${state.manager.name},`;
  const sign = pickLines(rng, o, SIGNOFFS, SIGNOFFS.any, 0.7, (l) => tone >= 0 || !UPBEAT.has(l));
  const psPool = o.traits.flatMap((t) => PS_LINES[t] ?? []);
  const ps = psPool.length && tone >= 0 && rng.chance(0.2) ? `\n\n${rng.pick(psPool)}` : '';
  addInbox(state, {
    from: `${o.name} (Owner)`, subject, kind: 'board', body: `${greet}\n\n${body}\n\n${sign}\n${o.name}${ps}`,
    action: req ? { type: 'ownerChoice', payload: req.id, label: 'Respond' } : undefined,
  });
  o.sent.push(state.date);
  if (o.sent.length > 40) o.sent.splice(0, o.sent.length - 40);
  note(o, state.date, subject, tone);
}
function note(o: OwnerState, date: string, text: string, tone: number) {
  o.log.unshift({ date, text, tone });
  if (o.log.length > 60) o.log.length = 60;
}

/** Templated owner mail (rate-limited by priority: 2 = key moment, 1 = normal, 0 = flavour). */
function mail(state: GameState, o: OwnerState, key: string, ctx: Ctx, opts: { pri?: number; force?: boolean; tone?: number } = {}): boolean {
  const T: OwnerTemplate | undefined = OWNER_T[key];
  if (!T || (!opts.force && !canSend(state, o, opts.pri ?? 1))) return false;
  const rng = new RNG(hashString(key + state.date) ^ state.seq);
  const c = { ...baseCtx(state, o), ...ctx };
  const subject = fill(rng.pick(T.subj), c) ?? fill(T.subj[0], c) ?? 'A message from the owner';
  let body: string | null = null;
  for (let i = 0; i < 4 && !body; i++) body = fill(pickLines(rng, o, T.trait, T.body), c);
  send(state, o, subject, body ?? fill(T.body[0], c) ?? T.body[0], c, rng, undefined, opts.tone ?? 0);
  return true;
}

/** Cooldown helper: true (and stamps the date) if `key` wasn't used in the last `n` days. */
function cool(state: GameState, o: OwnerState, key: string, n: number) {
  const d = o.cooldown[key];
  if (d && days(d, state.date) < n) return false;
  o.cooldown[key] = state.date;
  return true;
}

// ------------------------------------------------------------------ effects
export interface Fx { owner?: number; conf?: number; cash?: number; cat?: string; morale?: number; moraleEgo?: number; chem?: number; hype?: number; fans?: number; fanMood?: number; fatigue?: number }

function applyFx(state: GameState, o: OwnerState, fx: Fx, label = 'Owner'): string {
  const team = state.teams[o.teamId];
  const out: string[] = [];
  const roster = team.roster.map((id) => state.players[id]).filter(Boolean);
  if (fx.owner) { o.mood = clamp(o.mood + fx.owner, -100, 100); out.push(`Owner mood ${signed(fx.owner)}`); }
  if (fx.conf) { state.board.confidence = clamp(state.board.confidence + fx.conf, 0, 100); out.push(`Board confidence ${signed(fx.conf)}`); }
  if (fx.cash) { addLedger(state, team, fx.cat ?? (fx.cash > 0 ? 'Owner investment' : 'Owner requests'), Math.round(fx.cash), label); out.push(`Club funds ${fx.cash > 0 ? '+' : ''}${usd(Math.round(fx.cash))}`); }
  if (fx.morale) { for (const p of roster) p.morale = clamp(p.morale + fx.morale, 5, 100); out.push(`Squad morale ${signed(fx.morale)}`); }
  if (fx.moraleEgo) { for (const p of roster) if (p.hidden.ego > 60) p.morale = clamp(p.morale + fx.moraleEgo, 5, 100); out.push(`Big egos’ morale ${signed(fx.moraleEgo)}`); }
  if (fx.chem) { team.chemistry = clamp(team.chemistry + fx.chem, 10, 100); out.push(`Chemistry ${signed(fx.chem)}`); }
  if (fx.hype) { team.hype = clamp(team.hype + fx.hype, 0, 100); out.push(`Hype ${signed(fx.hype)}`); }
  if (fx.fans) { team.fans = Math.max(100, Math.round(team.fans * (1 + fx.fans / 100))); out.push(`Fans ${signed(fx.fans)}%`); }
  if (fx.fanMood) { const fm = fanMood(state, team.id); fm.mood = clamp(fm.mood + fx.fanMood, -100, 100); out.push(`Fan mood ${signed(fx.fanMood)}`); }
  if (fx.fatigue) { for (const p of roster) p.fatigue = clamp(p.fatigue + fx.fatigue, 0, 100); out.push(`Fatigue ${signed(fx.fatigue)}`); }
  return out.join(' · ');
}

// ------------------------------------------------------------------ promises
function promise(state: GameState, o: OwnerState, p: Omit<OwnerPromise, 'id' | 'made' | 'status' | 'series' | 'wins'>): OwnerPromise {
  const pr: OwnerPromise = { id: `prm_${state.seq++}`, made: state.date, status: 'open', series: 0, wins: 0, ...p };
  o.promises.unshift(pr);
  if (o.promises.length > 20) o.promises.length = 20;
  return pr;
}
const winSeries = (state: GameState, o: OwnerState, target: number, of: number, source?: string, text?: string) =>
  promise(state, o, { kind: 'winSeries', text: text ?? `Win ${target} of the next ${of} series`, deadline: addDays(state.date, 45 + of * 4), target, data: { of }, source });

function settle(state: GameState, o: OwnerState, p: OwnerPromise, kept: boolean) {
  p.status = kept ? 'kept' : 'broken';
  const ctx: Ctx = { promise: p.text, ...(p.data ?? {}) };
  if (p.source === 'ultimatum' || p.source === 'final') {
    if (kept) { o.ultimatum = 1; applyFx(state, o, { owner: 20, conf: 12 }); mail(state, o, 'reprieve', ctx, { pri: 2, force: true, tone: 2 }); }
    else if (p.source === 'ultimatum') {
      o.ultimatum = 3;
      applyFx(state, o, { owner: -15, conf: -6 });
      const f = winSeries(state, o, 2, 3, 'final', 'Win 2 of the next 3 series (final warning)');
      mail(state, o, 'ultimatum_3', { promise: f.text.replace(/ \(.*\)$/, ''), deadline: longDate(f.deadline) }, { pri: 2, force: true, tone: -2 });
    } else { applyFx(state, o, { owner: -15, conf: -4 }); o.cooldown.final = state.date; mail(state, o, 'last_straw', ctx, { pri: 2, force: true, tone: -2 }); }
    return;
  }
  if (p.source === 'guarantee') {
    applyFx(state, o, kept ? { owner: 15, hype: 6, fanMood: 6 } : { owner: -12, fanMood: -6, conf: -3 });
    fanEvent(state, kept ? 'owner_guarantee_win' : 'owner_guarantee_fail', {}, 2);
    mail(state, o, kept ? 'promise_kept' : 'promise_broken', ctx, { pri: 2, force: true, tone: kept ? 1 : -1 });
    return;
  }
  if (p.source === 'wager') {
    if (kept) applyFx(state, o, { owner: 12, morale: 3 }); else applyFx(state, o, { owner: -8 });
    mail(state, o, kept ? 'wager_won' : 'wager_lost', ctx, { pri: 2, force: true, tone: kept ? 1 : -1 });
    return;
  }
  const m = has(o, 'impatient') ? 1.3 : has(o, 'patient') ? 0.7 : 1;
  applyFx(state, o, kept ? { owner: 12, conf: 6 } : { owner: Math.round(-15 * m), conf: Math.round(-8 * m) });
  mail(state, o, kept ? 'promise_kept' : 'promise_broken', ctx, { pri: 2, force: true, tone: kept ? 1 : -1 });
}

function checkPromises(state: GameState, o: OwnerState) {
  const team = state.teams[o.teamId];
  for (const p of o.promises) {
    if (p.status !== 'open') continue;
    const late = state.date > p.deadline;
    if (p.kind === 'balance') { if (team.balance >= 0 && days(p.made, state.date) >= 14) settle(state, o, p, true); else if (late) settle(state, o, p, false); }
    else if (p.kind === 'signStar') {
      const got = team.roster.some((id) => { const pl = state.players[id]; return !!pl && pl.reputation >= p.target && (pl.contract?.signedOn ?? '') >= p.made; });
      if (got) settle(state, o, p, true); else if (late) settle(state, o, p, false);
    } else if (p.kind === 'playoffs') {
      const c = state.competitions[String(p.data?.comp)];
      if (c && c.status !== 'upcoming') settle(state, o, p, c.teams.includes(team.id)); else if (!c || late) settle(state, o, p, false);
    } else if (p.kind === 'trophy') { if (team.titles.length > Number(p.data?.titles ?? 0)) settle(state, o, p, true); else if (late) settle(state, o, p, false); }
    else if (late) {
      // no matches in the window (off-season): extend once, drop wagers on matchups that never happened
      if (p.kind === 'beatTeam' && !p.series) { p.status = 'kept'; p.text += ' (no match played)'; }
      else if (!p.series && !p.data?.extended) { p.deadline = addDays(p.deadline, 30); p.data = { ...p.data, extended: 1 }; }
      else settle(state, o, p, false);
    }
  }
}

// ------------------------------------------------------------------ quirky requests
type Opt = { id: string; label: string; hint?: string };
export interface Made { data: Record<string, string | number>; options: Opt[]; fallback: string; days?: number }
export interface QuirkDef {
  cd: number;   // days before the same quirk can repeat
  weight: (state: GameState, o: OwnerState, team: Team, fm: FanMood) => number;
  make: (state: GameState, o: OwnerState, team: Team, rng: RNG) => Made | null;
  resolve: (state: GameState, o: OwnerState, req: OwnerRequest, opt: string, rng: RNG) => { out: string; fx: Fx };
}

const nextFixture = (state: GameState, teamId: string) => Object.values(state.fixtures).filter((f) => !f.result && (f.teamA === teamId || f.teamB === teamId) && f.teamA && f.teamB).sort((a, b) => a.date.localeCompare(b.date))[0];
const num = (v: string | number | undefined) => Number(v ?? 0);

const QUIRKS: Record<string, QuirkDef> = {
  nephew: {
    cd: 300, weight: (_s, o) => 1 + (has(o, 'sentimental') ? 0.5 : 0),
    make: (state, o, team, rng) => ({
      data: { nephew: rng.pick(NEPHEW_NAMES).replace('{last}', lastName(o, state)), rank: rng.pick(NEPHEW_RANKS), cost: usd(8000 * scale(state, team)) },
      options: [{ id: 'trial', label: 'Give him a trial week', hint: 'Owner very happy · chemistry & morale dip' }, { id: 'ambassador', label: 'Make him “Community Ambassador”', hint: 'Small cost · owner happy' }, { id: 'decline', label: 'Politely decline', hint: 'Owner upset' }],
      fallback: 'decline',
    }),
    resolve: (state, o, req, opt) => {
      const s = scale(state, state.teams[o.teamId]);
      if (opt === 'trial') { fanEvent(state, 'owner_nephew', { nephew: req.data?.nephew }, 2); return { out: 'trial', fx: { owner: 14, chem: -3, morale: -2 } }; }
      if (opt === 'ambassador') return { out: 'ambassador', fx: { owner: 7, cash: -8000 * s, cat: 'Owner requests', hype: 1 } };
      return { out: 'decline', fx: { owner: has(o, 'sentimental') ? -14 : -9, conf: -2 } };
    },
  },
  streamer: {
    cd: 200, weight: (_s, o) => 0.8 + (has(o, 'publicity') ? 1.5 : 0),
    make: (state, _o, team, rng) => {
      const c = Math.round(60000 * scale(state, team));
      return {
        data: { streamer: rng.pick(STREAMERS), followers: `${(rng.int(8, 60) / 10).toFixed(1)}M`, cost: usd(c), costN: c },
        options: [{ id: 'sign', label: 'Sign them as a content creator', hint: `${usd(c)} · hype & fans up, owner happy` }, { id: 'collab', label: 'Offer a one-off collab stream', hint: 'Cheap · small hype' }, { id: 'decline', label: 'Decline', hint: 'Owner disappointed' }],
        fallback: 'decline',
      };
    },
    resolve: (state, o, req, opt, rng) => {
      const c = num(req.data?.costN);
      if (opt === 'sign') { fanEvent(state, 'owner_streamer', { streamer: req.data?.streamer }, 2); return { out: 'sign', fx: { cash: -c, cat: 'Content creators', hype: 8, fans: 2, owner: 10, fanMood: rng.chance(0.5) ? 4 : -4 } }; }
      if (opt === 'collab') return { out: 'collab', fx: { cash: -c * 0.15, cat: 'Content creators', hype: 3, owner: 2 } };
      return { out: 'decline', fx: { owner: has(o, 'publicity') ? -12 : -7 } };
    },
  },
  jersey: {
    cd: 300, weight: (_s, o) => 0.9 + (has(o, 'publicity') ? 0.5 : 0),
    make: (state, _o, team, rng) => {
      const c = Math.round(30000 * scale(state, team));
      return {
        data: { design: rng.pick(DESIGNS), cost: usd(c), costN: c },
        options: [{ id: 'approve', label: 'Approve the design', hint: `${usd(c)} · hype up, fans split, owner thrilled` }, { id: 'vote', label: 'Let the fans vote', hint: 'Fans like being asked' }, { id: 'veto', label: 'Veto it', hint: 'Owner annoyed' }],
        fallback: 'approve',
      };
    },
    resolve: (state, o, req, opt, rng) => {
      const team = state.teams[o.teamId], c = num(req.data?.costN);
      const make = () => { for (const m of team.merch) if (m.type === 'jersey') m.quality = clamp(m.quality + 6, 0, 100); fanEvent(state, 'owner_jersey', { design: req.data?.design }, 3); };
      if (opt === 'approve') { make(); return { out: 'approve', fx: { cash: -c, cat: 'Owner requests', hype: 4, fanMood: rng.chance(0.5) ? 6 : -6, owner: 12 } }; }
      if (opt === 'vote') { if (rng.chance(0.7)) return { out: 'vote_classic', fx: { fanMood: 5, owner: -4 } }; make(); return { out: 'vote_chaos', fx: { cash: -c, cat: 'Owner requests', fanMood: 2, hype: 3, owner: 8 } }; }
      return { out: 'veto', fx: { owner: -9 } };
    },
  },
  visit: {
    cd: 60, weight: (_s, o) => 0.8 + (has(o, 'meddling') ? 2 : 0),
    make: (state, _o, team) => ({
      data: { cost: usd(3000 * scale(state, team)) },
      options: [{ id: 'scrims', label: 'Let him sit in on scrims', hint: 'Owner happy · big egos irritated' }, { id: 'dinner', label: 'Host a team dinner instead', hint: 'Small cost · morale up' }, { id: 'busy', label: 'Say the team is too busy', hint: 'Owner offended' }],
      fallback: 'scrims',
    }),
    resolve: (state, o, _r, opt) => {
      if (opt === 'scrims') return { out: 'scrims', fx: { owner: 10, moraleEgo: -3, chem: -1 } };
      if (opt === 'dinner') return { out: 'dinner', fx: { cash: -3000 * scale(state, state.teams[o.teamId]), cat: 'Owner requests', morale: 3, owner: 6 } };
      return { out: 'busy', fx: { owner: -7 } };
    },
  },
  tweet: {
    cd: 90, weight: (_s, o) => 0.6 + (has(o, 'publicity') ? 1 : 0) + (has(o, 'hotHeaded') ? 1 : 0),
    make: (state, _o, _t, rng) => {
      const tweet = rng.pick(TWEETS);
      fanEvent(state, 'owner_tweet', { tweet }, 3);
      return {
        data: { tweet },
        options: [{ id: 'delete', label: 'Ask him to delete it', hint: 'Owner sulks · fans calmer' }, { id: 'meme', label: 'Lean into it — print T-shirts', hint: 'Hype & merch money · owner loves it' }, { id: 'statement', label: 'Issue a PR statement', hint: 'Small cost · neutral' }],
        fallback: 'statement',
      };
    },
    resolve: (state, o, _r, opt) => {
      const s = scale(state, state.teams[o.teamId]);
      if (opt === 'delete') return { out: 'delete', fx: { owner: -6, fanMood: 2, morale: 1 } };
      if (opt === 'meme') return { out: 'meme', fx: { hype: 5, cash: 15000 * s, cat: 'Merchandise sales', owner: 5, morale: -1 } };
      return { out: 'statement', fx: { cash: -2000 * s, cat: 'Owner requests', owner: -1, fanMood: 1 } };
    },
  },
  rename: {
    cd: 9999, weight: (state, o) => (o.originalName ? 0 : 0.3 + (has(o, 'publicity') ? 0.5 : 0) + (days(o.hired, state.date) > 120 ? 0.2 : 0)),
    make: (state, o, team, rng) => ({
      data: { newName: rng.pick(RENAMES).replace('{short}', team.short).replace('{last}', lastName(o, state)), oldName: team.name },
      options: [{ id: 'accept', label: 'Accept the rebrand', hint: 'Owner ecstatic · fans outraged' }, { id: 'vote', label: 'Put it to a fan vote', hint: 'The fans will probably say no' }, { id: 'refuse', label: 'Refuse', hint: 'Owner very upset' }],
      fallback: 'refuse', days: 6,
    }),
    resolve: (state, o, req, opt, rng) => {
      const team = state.teams[o.teamId];
      const rebrand = () => {
        o.originalName = team.name;
        o.cooldown.renamed = state.date;
        team.name = String(req.data?.newName ?? team.name);
        addNews(state, { headline: `${o.originalName} rebrand as ${team.name}`, body: `Owner ${o.name} has renamed the club. Fan reaction has been, in a word, loud.`, tags: ['club'], teamIds: [team.id] });
        fanEvent(state, 'owner_rename', { newName: team.name }, 4);
      };
      if (opt === 'accept') { rebrand(); return { out: 'accept', fx: { owner: 18, fanMood: -18, hype: 6 } }; }
      if (opt === 'vote') { if (rng.chance(0.88)) { o.originalName = team.name; return { out: 'vote_keep', fx: { owner: -6, fanMood: 4 } }; } rebrand(); return { out: 'vote_change', fx: { owner: 15, fanMood: -10, hype: 5 } }; }
      o.originalName = team.name;
      return { out: 'refuse', fx: { owner: -14, conf: -3 } };
    },
  },
  rename_back: {
    cd: 9999, weight: (state, o, team, fm) => (o.originalName && team.name !== o.originalName && o.cooldown.renamed && days(o.cooldown.renamed, state.date) > 30 && fm.mood < -10 ? 4 : 0),
    make: (_s, o, team) => ({
      data: { newName: team.name, oldName: o.originalName! },
      options: [{ id: 'revert', label: `Go back to ${o.originalName}`, hint: 'Fans relieved · owner embarrassed' }, { id: 'keep', label: `Stick with ${team.name}`, hint: 'Owner pleased · fans grumble' }],
      fallback: 'keep',
    }),
    resolve: (state, o, _r, opt) => {
      const team = state.teams[o.teamId];
      if (opt === 'revert') { team.name = o.originalName ?? team.name; return { out: 'revert', fx: { owner: -4, fanMood: 12 } }; }
      return { out: 'keep', fx: { owner: 6, fanMood: -6 } };
    },
  },
  fire_coach: {
    cd: 120, weight: (state, o, team, fm) => (headCoach(state, team) && (fm.streak <= -3 || state.board.confidence < 40) ? 1.5 + (has(o, 'meddling') ? 2 : 0) + (has(o, 'impatient') ? 1.5 : 0) : 0),
    make: (state, _o, team) => {
      const c = headCoach(state, team);
      return c ? {
        data: { coach: c.handle, coachId: c.id },
        options: [{ id: 'fire', label: `Release ${c.handle}`, hint: 'Owner satisfied · severance applies' }, { id: 'back', label: `Back ${c.handle} publicly`, hint: 'Owner unhappy · players appreciate it' }, { id: 'review', label: 'Three more series to prove it', hint: 'Creates a promise: 2 wins from 3' }],
        fallback: 'review',
      } : null;
    },
    resolve: (state, o, req, opt) => {
      if (opt === 'fire') { const id = String(req.data?.coachId); if (state.staff[id]?.teamId === o.teamId) fireStaff(state, id); return { out: 'fire', fx: { owner: 10, conf: 3 } }; }
      if (opt === 'back') return { out: 'back', fx: { owner: -10, conf: -4, morale: 2 } };
      winSeries(state, o, 2, 3, undefined, `Win 2 of the next 3 series (${req.data?.coach}’s review)`);
      return { out: 'review', fx: { owner: 2 } };
    },
  },
  star_wish: {
    cd: 150, weight: (state, o) => (inTransferWindow(state.date) ? 0.8 + (has(o, 'ambitious') ? 2 : 0) + (has(o, 'publicity') ? 1 : 0) : 0),
    make: (state, _o, team, rng) => {
      const stars = Object.values(state.players).filter((p) => p.teamId && p.teamId !== team.id && !p.retired && p.reputation >= 70 && state.teams[p.teamId]?.region === team.region).sort((a, b) => b.reputation - a.reputation).slice(0, 12);
      if (!stars.length) return null;
      const s = rng.pick(stars);
      return {
        data: { star: s.handle, starId: s.id, rep: s.reputation },
        options: [{ id: 'try', label: `I’ll try to sign ${s.handle}`, hint: 'Creates a promise: sign a star before the window closes' }, { id: 'realistic', label: 'Explain it isn’t realistic', hint: 'Owner deflated' }],
        fallback: 'realistic',
      };
    },
    resolve: (state, o, req, opt) => {
      if (opt === 'try') {
        promise(state, o, { kind: 'signStar', text: `Sign a star of ${req.data?.star}’s calibre (reputation ${num(req.data?.rep) - 8}+)`, deadline: addDays(state.date, 35), target: num(req.data?.rep) - 8 });
        return { out: 'try', fx: { owner: 6 } };
      }
      return { out: 'realistic', fx: { owner: has(o, 'ambitious') ? -10 : -5, conf: -1 } };
    },
  },
  injection: {
    cd: 180, weight: (_s, o, _t, fm) => (o.mood > 35 && fm.mood > 15 && (has(o, 'generous') || o.mood > 60) ? 1.5 + (has(o, 'generous') ? 1.5 : 0) : 0),
    make: (state, _o, team) => {
      const a = Math.round(200000 * scale(state, team) * (state.board.budgetMultiplier ?? 1) / 1000) * 1000;
      const k = (Object.keys(FACILITY_INFO) as FacilityKey[]).filter((x) => team.facilities[x] < 5).sort((x, y) => team.facilities[x] - team.facilities[y])[0];
      const opts: Opt[] = [{ id: 'cash', label: `${usd(a)} transfer budget`, hint: 'Cash into the club account' }, { id: 'bonus', label: 'A bonus pool for the players', hint: 'Big morale boost' }];
      if (k) opts.splice(1, 0, { id: 'facility', label: `Pay for a ${FACILITY_INFO[k].name} upgrade`, hint: 'One free facility level' });
      return { data: { amount: usd(a), amountN: a, facility: k ? FACILITY_INFO[k].name : '', facilityKey: k ?? '' }, options: opts, fallback: 'cash' };
    },
    resolve: (state, o, req, opt) => {
      const team = state.teams[o.teamId];
      state.board.budgetMultiplier = Math.round(((state.board.budgetMultiplier ?? 1) + 0.05) * 100) / 100;
      if (opt === 'facility' && req.data?.facilityKey) { const k = req.data.facilityKey as FacilityKey; team.facilities[k] = Math.min(5, team.facilities[k] + 1); return { out: 'facility', fx: { owner: 3 } }; }
      if (opt === 'bonus') return { out: 'bonus', fx: { morale: 8, owner: 2 } };
      return { out: 'cash', fx: { cash: num(req.data?.amountN), cat: 'Owner investment', owner: 2 } };
    },
  },
  cost_cuts: {
    cd: 60, weight: (_s, o, team) => (team.balance < 0 ? 3 + (has(o, 'frugal') ? 2 : 0) : 0),
    make: (state, _o, team) => {
      const a = Math.round(300000 * scale(state, team));
      return {
        data: { amount: usd(a), amountN: a, saving: Math.round(40000 * scale(state, team)) },
        options: [{ id: 'promise', label: 'Promise a positive balance within 60 days', hint: 'Creates a promise' }, { id: 'injection', label: `Ask for an emergency ${usd(a)}`, hint: 'Cash now · owner & board lose faith' }, { id: 'cut', label: 'Cut perks (snacks, taxis, hotels)', hint: 'Small savings · morale down' }],
        fallback: 'cut',
      };
    },
    resolve: (state, o, req, opt) => {
      if (opt === 'promise') { promise(state, o, { kind: 'balance', text: 'Get the club balance positive within 60 days', deadline: addDays(state.date, 60), target: 0 }); return { out: 'promise', fx: { owner: 4 } }; }
      if (opt === 'injection') { state.board.budgetMultiplier = Math.max(0.5, Math.round(((state.board.budgetMultiplier ?? 1) - 0.05) * 100) / 100); return { out: 'injection', fx: { cash: num(req.data?.amountN), cat: 'Owner investment', owner: -15, conf: -6 } }; }
      return { out: 'cut', fx: { morale: -4, cash: num(req.data?.saving), cat: 'Cost savings', owner: 6 } };
    },
  },
  superstition: {
    cd: 60, weight: (_s, o) => (has(o, 'superstitious') ? 2.5 : 0.25),
    make: (_s, _o, _t, rng) => ({
      data: { ritual: rng.pick(RITUALS) },
      options: [{ id: 'humor', label: 'Humour him', hint: 'Owner pleased · the spirits will judge the next 3 series' }, { id: 'ignore', label: 'Politely ignore it', hint: 'Owner annoyed' }],
      fallback: 'humor',
    }),
    resolve: (state, o, _r, opt) => {
      if (opt === 'humor') { o.ritual = { until: addDays(state.date, 30), wins: 0, games: 0 }; return { out: 'humor', fx: { owner: 7 } }; }
      return { out: 'ignore', fx: { owner: -5 } };
    },
  },
  documentary: {
    cd: 365, weight: (_s, o) => (has(o, 'publicity') ? 2 : 0.5),
    make: (state, _o, team) => {
      const a = Math.round(120000 * scale(state, team));
      return {
        data: { amount: usd(a), amountN: a },
        options: [{ id: 'accept', label: 'Full access', hint: `+${usd(a)} · hype & fans up · players more tired` }, { id: 'limited', label: 'Match days only', hint: 'Smaller fee' }, { id: 'decline', label: 'Decline', hint: 'Owner disappointed' }],
        fallback: 'limited',
      };
    },
    resolve: (state, o, req, opt) => {
      const a = num(req.data?.amountN);
      if (opt === 'accept') { fanEvent(state, 'owner_documentary', {}, 2); return { out: 'accept', fx: { cash: a, cat: 'Media rights', hype: 8, fans: 3, fatigue: 5, owner: 8 } }; }
      if (opt === 'limited') return { out: 'limited', fx: { cash: a * 0.35, cat: 'Media rights', hype: 3, owner: 2 } };
      return { out: 'decline', fx: { owner: has(o, 'publicity') ? -10 : -5 } };
    },
  },
  spreadsheet: {
    cd: 75, weight: (_s, o) => (has(o, 'dataNerd') ? 2.5 : 0.2),
    make: (state, _o, _t, rng) => {
      const top = Object.entries(state.championPower).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const champ = top.length ? rng.pick(top)[0] : 'Azir';
      return {
        data: { champ, edge: rng.int(3, 9) },
        options: [{ id: 'adopt', label: 'Use his model in draft prep', hint: 'Owner delighted · players find it odd' }, { id: 'thank', label: '“Thanks, I’ll take a look”', hint: 'Neutral' }, { id: 'counter', label: 'Send him your own model', hint: 'Risky: he’ll either love or hate it' }],
        fallback: 'thank',
      };
    },
    resolve: (_s, _o, _r, opt, rng) => {
      if (opt === 'adopt') return { out: 'adopt', fx: { owner: 8, chem: -1 } };
      if (opt === 'counter') return rng.chance(0.5) ? { out: 'counter_good', fx: { owner: 10 } } : { out: 'counter_bad', fx: { owner: -4 } };
      return { out: 'thank', fx: { owner: 1 } };
    },
  },
  bootcamp: {
    cd: 120, weight: (_s, o) => (has(o, 'oldSchool') ? 2.5 : 0.3),
    make: () => ({
      data: {},
      options: [{ id: 'approve', label: 'Approve the bootcamp', hint: 'Chemistry up, rested · egos miserable' }, { id: 'compromise', label: 'Morning runs only', hint: 'Small effects' }, { id: 'decline', label: 'Decline', hint: 'Owner grumpy' }],
      fallback: 'compromise',
    }),
    resolve: (_s, _o, _r, opt) => {
      if (opt === 'approve') return { out: 'approve', fx: { morale: -3, moraleEgo: -3, chem: 3, fatigue: -8, owner: 10 } };
      if (opt === 'compromise') return { out: 'compromise', fx: { morale: -1, chem: 1, owner: 4 } };
      return { out: 'decline', fx: { owner: -8 } };
    },
  },
  party: {
    cd: 300, weight: (state, o) => { const d = days(state.date, `${state.date.slice(0, 4)}-${o.birthday}`); return d >= 3 && d <= 10 ? 5 : 0; },
    make: () => ({
      data: {},
      options: [{ id: 'attend', label: 'The whole team attends', hint: 'Owner delighted · a little tiring' }, { id: 'video', label: 'Players record a birthday video', hint: 'Owner touched' }, { id: 'card', label: 'Send a card', hint: 'Owner unimpressed' }],
      fallback: 'card',
    }),
    resolve: (_s, _o, _r, opt) => {
      if (opt === 'attend') return { out: 'attend', fx: { fatigue: 4, morale: 2, owner: 9 } };
      if (opt === 'video') return { out: 'video', fx: { owner: 5, hype: 1 } };
      return { out: 'card', fx: { owner: -3 } };
    },
  },
  nft: {
    cd: 300, weight: (_s, o, team) => 0.5 + (has(o, 'publicity') ? 0.6 : 0) + (team.balance < 0 ? 1 : 0),
    make: (state, _o, team) => { const a = Math.round(150000 * scale(state, team)); return { data: { amount: usd(a), amountN: a }, options: [{ id: 'accept', label: 'Launch the collectibles', hint: `+${usd(a)} · fans furious` }, { id: 'decline', label: 'Decline', hint: 'Fans relieved · owner mildly annoyed' }], fallback: 'decline' }; },
    resolve: (state, _o, req, opt) => {
      if (opt === 'accept') { fanEvent(state, 'owner_nft', {}, 3); return { out: 'accept', fx: { cash: num(req.data?.amountN), cat: 'Digital collectibles', fanMood: -12, hype: -2, owner: 8 } }; }
      return { out: 'decline', fx: { owner: -6, fanMood: 3 } };
    },
  },
  mascot: {
    cd: 9999, weight: (_s, o) => 0.6 + (has(o, 'publicity') ? 0.5 : 0),
    make: (state, _o, team, rng) => { const c = Math.round(10000 * scale(state, team)); return { data: { mascot: rng.pick(MASCOTS), cost: usd(c), costN: c }, options: [{ id: 'approve', label: 'Approve the mascot', hint: `${usd(c)} · fans & hype up` }, { id: 'decline', label: 'Decline', hint: 'Owner sad' }], fallback: 'approve' }; },
    resolve: (state, _o, req, opt) => {
      if (opt === 'approve') { fanEvent(state, 'owner_mascot', { mascot: req.data?.mascot }, 3); return { out: 'approve', fx: { cash: -num(req.data?.costN), cat: 'Owner requests', hype: 3, fanMood: 4, owner: 6 } }; }
      return { out: 'decline', fx: { owner: -4 } };
    },
  },
  duel: {
    cd: 200, weight: (_s, o) => 0.5 + (has(o, 'hotHeaded') ? 0.5 : 0),
    make: () => ({ data: {}, options: [{ id: 'letwin', label: 'Let him win', hint: 'Owner thrilled' }, { id: 'crush', label: 'Show no mercy', hint: 'Coin flip: respect or a sulk' }, { id: 'decline', label: 'Decline', hint: 'Owner mildly annoyed' }], fallback: 'decline' }),
    resolve: (_s, _o, _r, opt, rng) => {
      if (opt === 'letwin') return { out: 'letwin', fx: { owner: 8 } };
      if (opt === 'crush') return rng.chance(0.5) ? { out: 'crush_good', fx: { owner: 5, hype: 2 } } : { out: 'crush_bad', fx: { owner: -8, hype: 2 } };
      return { out: 'decline', fx: { owner: -2 } };
    },
  },
  charity: {
    cd: 150, weight: (_s, o) => 0.7 + (has(o, 'sentimental') ? 0.6 : 0),
    make: () => ({ data: {}, options: [{ id: 'yes', label: 'Host the charity stream', hint: 'Fans & hype up · a little tiring' }, { id: 'no', label: 'Not this time', hint: 'Owner and fans disappointed' }], fallback: 'yes' }),
    resolve: (state, _o, _r, opt) => {
      if (opt === 'yes') { fanEvent(state, 'owner_charity', {}, 2); return { out: 'yes', fx: { fatigue: 3, fanMood: 6, hype: 3, owner: 6 } }; }
      return { out: 'no', fx: { owner: -4, fanMood: -2 } };
    },
  },
  promise_results: {
    cd: 75, weight: (state, o, _t, fm) => ((fm.streak <= -3 || state.board.confidence < 45) && !o.promises.some((p) => p.status === 'open') ? 2 + (has(o, 'impatient') ? 2 : 0) : 0),
    make: (state, _o, team) => {
      const po = Object.values(state.competitions).filter((c) => c.status === 'upcoming' && c.kind === 'playoffs' && c.leagueId === team.leagueId && c.season === state.season).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      const opts: Opt[] = [{ id: 'win3', label: 'Win 3 of the next 4 series', hint: 'Promise · big swing either way' }];
      if (po) opts.push({ id: 'playoffs', label: `Reach the ${compName(po.name)}`, hint: `Promise · decided on ${po.startDate}` });
      opts.push({ id: 'none', label: 'No promises — trust the process', hint: 'Impatient owners hate this' });
      return { data: { comp: po?.id ?? '', compName: compName(po?.name) ?? '', start: po?.startDate ?? '' }, options: opts, fallback: 'none' };
    },
    resolve: (state, o, req, opt) => {
      if (opt === 'win3') { winSeries(state, o, 3, 4); return { out: 'win3', fx: { owner: 5, conf: 2 } }; }
      if (opt === 'playoffs' && req.data?.comp) { promise(state, o, { kind: 'playoffs', text: `Reach the ${req.data.compName}`, deadline: String(req.data.start), target: 1, data: { comp: req.data.comp } }); return { out: 'playoffs', fx: { owner: 4, conf: 2 } }; }
      return { out: 'none', fx: { owner: has(o, 'impatient') ? -12 : has(o, 'patient') ? 2 : -6 } };
    },
  },
  guarantee: {
    cd: 60, weight: (state, o, team) => {
      const f = nextFixture(state, team.id);
      if (!f || days(state.date, f.date) > 5 || days(state.date, f.date) < 1) return 0;
      const opp = f.teamA === team.id ? f.teamB! : f.teamA!;
      return (rivalry(state, team.id, opp) || state.competitions[f.competitionId]?.kind === 'playoffs' ? 1 : 0.2) * (has(o, 'publicity') ? 3 : 0.8) + (has(o, 'hotHeaded') ? 0.5 : 0);
    },
    make: (state, _o, team) => {
      const f = nextFixture(state, team.id);
      if (!f) return null;
      const opp = state.teams[f.teamA === team.id ? f.teamB! : f.teamA!];
      return { data: { opp: opp.name, oppShort: opp.short, oppId: opp.id }, options: [{ id: 'guarantee', label: `Guarantee a win over ${opp.short}`, hint: 'Promise · win: big boost, loss: humiliation' }, { id: 'humble', label: 'Give a humble answer', hint: 'Owner finds it boring' }], fallback: 'humble', days: Math.max(1, days(state.date, f.date)) };
    },
    resolve: (state, o, req, opt) => {
      if (opt === 'guarantee') { promise(state, o, { kind: 'beatTeam', text: `Beat ${req.data?.oppShort} (public guarantee)`, deadline: addDays(state.date, 20), target: 1, data: { team: String(req.data?.oppId) }, source: 'guarantee' }); return { out: 'guarantee', fx: { owner: 6, hype: 3 } }; }
      return { out: 'humble', fx: { owner: -3 } };
    },
  },
  pet: {
    cd: 9999, weight: (_s, o) => 0.5 + (has(o, 'sentimental') ? 0.4 : 0),
    make: (_s, _o, _t, rng) => ({ data: { mascot: rng.pick(PETS) }, options: [{ id: 'approve', label: 'Welcome aboard, Chief Morale Officer', hint: 'Morale up · fans love it' }, { id: 'decline', label: 'No pets in the gaming house', hint: 'Owner sad' }], fallback: 'approve' }),
    resolve: (state, _o, req, opt) => {
      if (opt === 'approve') { fanEvent(state, 'owner_pet', { mascot: req.data?.mascot }, 2); return { out: 'approve', fx: { morale: 3, owner: 6, fanMood: 2 } }; }
      return { out: 'decline', fx: { owner: -3 } };
    },
  },
  jet: {
    cd: 120, weight: (state, o, team) => {
      const c = Object.values(state.competitions).find((x) => x.tier === 0 && x.teams.includes(team.id) && x.status !== 'done' && x.startDate >= state.date && days(state.date, x.startDate) <= 14);
      const q = Object.values(state.qualified).some((l) => l.some((x) => x.teamId === team.id));
      return c || q ? 1.5 + (has(o, 'generous') ? 1 : 0) + (has(o, 'publicity') ? 1 : 0) : 0;
    },
    make: (state, _o, team) => {
      const c = Object.values(state.competitions).filter((x) => x.tier === 0 && x.status !== 'done' && (x.teams.includes(team.id) || x.status === 'upcoming')).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      return { data: { event: compName(c?.name) ?? 'the international event' }, options: [{ id: 'jet', label: 'Take the private jet', hint: 'Players arrive rested and happy' }, { id: 'commercial', label: 'Fly commercial with the fans', hint: 'Owner finds it a bit sad' }], fallback: 'jet' };
    },
    resolve: (_s, _o, _r, opt) => (opt === 'jet' ? { out: 'jet', fx: { fatigue: -5, morale: 3, owner: 6 } } : { out: 'commercial', fx: { owner: -2, fanMood: 2 } }),
  },
};

/** Topic names for "you ignored me" mails. */
const TOPIC: Record<string, string> = {
  nephew: 'my nephew’s trial', streamer: 'the streamer signing', jersey: 'the new jersey', visit: 'my visit', tweet: 'my post', rename: 'the rebrand', rename_back: 'the club name',
  fire_coach: 'the coach', star_wish: 'my dream signing', injection: 'my investment', cost_cuts: 'the budget', superstition: 'the ritual', documentary: 'the documentary',
  spreadsheet: 'my model', bootcamp: 'the bootcamp', party: 'my party', nft: 'the collectibles', mascot: 'the mascot', duel: 'our 1v1', charity: 'the charity stream',
  promise_results: 'your promise', guarantee: 'the guarantee', pet: 'my dog', jet: 'the travel plans', ultimatum: 'the ultimatum',
};

function openRequest(state: GameState, o: OwnerState, kind: string, made: Made) {
  const req: OwnerRequest = { id: `own_${state.seq++}`, kind, date: state.date, expires: addDays(state.date, made.days ?? 7), options: made.options, fallback: made.fallback, data: made.data };
  o.requests.unshift(req);
  if (o.requests.length > 30) o.requests.length = 30;
  const Q = QUIRK_T[kind];
  const rng = new RNG(hashString(req.id) ^ state.seq);
  const ctx = { ...baseCtx(state, o), ...made.data };
  send(state, o, fill(rng.pick(Q.subj), ctx) ?? Q.subj[0], fill(rng.pick(Q.body), ctx) ?? Q.body[0], ctx, rng, req);
  return req;
}

/** Inbox/UI: is this owner request still waiting for an answer? */
export function ownerRequestLive(state: GameState, id: string) {
  const r = state.owner?.requests.find((x) => x.id === id);
  return !!r && !r.resolved && r.expires >= state.date;
}

function resolveRequest(state: GameState, o: OwnerState, req: OwnerRequest, optId: string, ignored = false) {
  const rng = new RNG(hashString(req.id + optId) ^ state.seq);
  let res: { out: string; fx: Fx };
  if (req.kind === 'ultimatum') {
    if (optId === 'time') { winSeries(state, o, 4, 7, 'ultimatum', 'Win 4 of the next 7 series (ultimatum)'); res = { out: 'time', fx: { owner: -5 } }; }
    else { winSeries(state, o, 3, 5, 'ultimatum', 'Win 3 of the next 5 series (ultimatum)'); res = { out: 'accept', fx: {} }; }
  } else res = QUIRKS[req.kind]?.resolve(state, o, req, optId, rng) ?? { out: optId, fx: {} };
  if (ignored) res.fx.owner = (res.fx.owner ?? 0) - 4;
  const summary = applyFx(state, o, res.fx, `${o.name}: ${TOPIC[req.kind] ?? req.kind}`);
  const ctx = { ...baseCtx(state, o), ...(req.data ?? {}) };
  const lines = QUIRK_T[req.kind]?.out[res.out] ?? [];
  const text = lines.length ? fill(rng.pick(lines), ctx) ?? '' : '';
  req.resolved = optId;
  req.outcome = [text, summary].filter(Boolean).join('\n');
  markActionDone(state, 'ownerChoice', req.id);
  const label = req.options.find((x) => x.id === optId)?.label ?? optId;
  note(o, state.date, `${ignored ? 'No reply — owner decided' : 'You chose'}: ${label}`, (res.fx.owner ?? 0) > 0 ? 1 : (res.fx.owner ?? 0) < 0 ? -1 : 0);
  return summary;
}

/** Answer an owner request from the Inbox / Boardroom. */
export function resolveOwnerChoice(state: GameState, reqId: string, optId: string): { ok: boolean; message: string } {
  const o = state.owner;
  const req = o?.requests.find((r) => r.id === reqId);
  if (!o || !req || req.resolved) { markActionDone(state, 'ownerChoice', reqId); return { ok: false, message: 'This request is no longer open.' }; }
  if (!req.options.some((x) => x.id === optId)) return { ok: false, message: 'Unknown option.' };
  const summary = resolveRequest(state, o, req, optId);
  return { ok: true, message: summary || 'Reply sent.' };
}

function maybeQuirk(state: GameState, o: OwnerState, rng: RNG) {
  if (o.requests.some((r) => !r.resolved)) return;
  const gap = 24 - (has(o, 'meddling') ? 6 : 0) - (has(o, 'publicity') ? 4 : 0) - (has(o, 'hotHeaded') ? 2 : 0) + (has(o, 'patient') ? 4 : 0);
  if (days(o.cooldown.quirk ?? o.hired, state.date) < gap || !rng.chance(0.15) || !canSend(state, o, 2)) return;
  const team = state.teams[o.teamId], fm = fanMood(state, team.id);
  const pool: [string, number][] = [];
  for (const [k, q] of Object.entries(QUIRKS)) {
    const last = o.cooldown['q:' + k];
    if (last && days(last, state.date) < q.cd) continue;
    const w = q.weight(state, o, team, fm);
    if (w > 0) pool.push([k, w]);
  }
  // the friendly wager is announced, not asked
  const f = nextFixture(state, team.id);
  const wagerOk = f && days(state.date, f.date) >= 1 && days(state.date, f.date) <= 4 && (!o.cooldown['q:wager'] || days(o.cooldown['q:wager'], state.date) >= 70);
  if (wagerOk) pool.push(['wager', 0.7 + (rivalry(state, team.id, f!.teamA === team.id ? f!.teamB! : f!.teamA!) ? 2 : 0) + (has(o, 'hotHeaded') ? 1 : 0)]);
  if (!pool.length) return;
  const [kind] = rng.weighted(pool, (x) => x[1]);
  o.cooldown.quirk = state.date;
  o.cooldown['q:' + kind] = state.date;
  if (kind === 'wager') {
    const opp = state.teams[f!.teamA === team.id ? f!.teamB! : f!.teamA!];
    const rivalOwner = `${rng.pick(OWNER_NAMES[opp.region]?.first ?? ['Max'])} ${rng.pick(OWNER_NAMES[opp.region]?.last ?? ['Power'])}`;
    const stake = rng.pick(WAGER_STAKES);
    promise(state, o, { kind: 'beatTeam', text: `Beat ${opp.short} (owner’s wager)`, deadline: addDays(state.date, 14), target: 1, data: { team: opp.id, oppShort: opp.short, rivalOwner, stake }, source: 'wager' });
    mail(state, o, 'wager', { opp: opp.name, oppShort: opp.short, rivalOwner, stake }, { pri: 2, force: true });
    return;
  }
  const made = QUIRKS[kind].make(state, o, team, rng);
  if (made) openRequest(state, o, kind, made);
}

// ------------------------------------------------------------------ reactions
/** After every user series: promises, rituals, owner mood and (rate-limited) mail. */
export function ownerAfterSeries(state: GameState, info: SeriesInfo) {
  const o = ensureOwner(state);
  if (info.teamId !== o.teamId) return;
  const team = state.teams[o.teamId], opp = state.teams[info.oppId];
  if (info.won) o.record.w++; else o.record.l++;
  for (const p of o.promises) {
    if (p.status !== 'open') continue;
    if (p.kind === 'winSeries') {
      p.series++; if (info.won) p.wins++;
      if (p.wins >= p.target) settle(state, o, p, true);
      else if (p.target - p.wins > num(p.data?.of) - p.series) settle(state, o, p, false);
    } else if (p.kind === 'beatTeam' && p.data?.team === info.oppId) { p.series++; settle(state, o, p, info.won); }
  }
  if (o.ritual && o.ritual.until >= state.date) {
    o.ritual.games++; if (info.won) o.ritual.wins++;
    if (o.ritual.games >= 3) {
      const good = o.ritual.wins >= 2;
      applyFx(state, o, { owner: good ? 6 : -2 });
      mail(state, o, good ? 'ritual_good' : 'ritual_bad', { wins: o.ritual.wins }, { pri: 1 });
      o.ritual = undefined;
    }
  }
  // owner mood: results vs expectation, amplified by personality and stakes
  const surprise = info.won ? 1 - info.winProb : info.winProb;
  let d = (info.won ? 2 + 5 * surprise : -(2 + 6 * surprise)) * info.stakes;
  if (!info.won) d *= has(o, 'impatient') ? 1.5 : has(o, 'patient') ? 0.6 : 1;
  if (info.big && has(o, 'ambitious')) d *= 1.3;
  if (info.rival) d *= 1.3;
  o.mood = clamp(o.mood * 0.98 + d, -100, 100);
  state.board.confidence = clamp(state.board.confidence + d * 0.15, 0, 100);
  const ctx: Ctx = { opp: opp?.name, oppShort: opp?.short, score: `${info.my}-${info.their}`, comp: compName(info.comp?.name), winpct: Math.round(info.winProb * 100), streak: Math.abs(info.streak), rival: info.rival ?? undefined };
  const s = scale(state, team);
  if (info.won && [25, 50, 100, 150, 200, 300].includes(o.record.w)) mail(state, o, 'milestone', { n: o.record.w }, { pri: 1, tone: 1 });
  if (info.final || info.elim) o.cooldown['comp:' + info.f.competitionId] = state.date;
  if (info.final && info.won) {
    const amount = Math.round(80000 * s * (info.intl ? (info.comp?.tags?.includes('worlds') ? 3.5 : 2) : 1) * (has(o, 'generous') ? 1.4 : has(o, 'frugal') ? 0.6 : 1) / 1000) * 1000;
    applyFx(state, o, { cash: amount, cat: 'Owner bonus', owner: 20, conf: 10 }, 'Title bonus');
    mail(state, o, 'title', { ...ctx, amount: usd(amount) }, { pri: 2, force: true, tone: 2 });
  } else if (info.final) mail(state, o, 'final_loss', ctx, { pri: 2, tone: -1 });
  else if (info.elim) mail(state, o, 'elim', { ...ctx, place: `out in the ${(info.f.label ?? 'group stage').replace(/\s*\(bye\)/, '')}` }, { pri: 2, tone: -1 });
  else if (info.swissAdvance) mail(state, o, 'big_win', ctx, { pri: 1, tone: 1 });
  else if ([5, 8, 12].includes(info.streak) && cool(state, o, 'wstreak', 20)) {
    if (has(o, 'generous')) applyFx(state, o, { morale: 3, cash: Math.round(30000 * s), cat: 'Owner bonus' }, 'Win-streak bonus');
    mail(state, o, 'win_streak', ctx, { pri: 1, tone: 1 });
  } else if ([-3, -5, -8, -12].includes(info.streak) && cool(state, o, 'lstreak', 10)) mail(state, o, 'loss_streak', ctx, { pri: info.streak <= -5 ? 2 : 1, tone: -1 });
  else {
    const r = new RNG(hashString(info.f.id + 'own') ^ state.seq);
    if (info.rival) { if (r.chance(0.6) && cool(state, o, 'rival', 25)) mail(state, o, info.won ? 'rival_win' : 'rival_loss', ctx, { pri: 1, tone: info.won ? 1 : -1 }); }
    else if (info.won && info.winProb < 0.35 && r.chance(0.6) && cool(state, o, 'bigwin', 12)) mail(state, o, 'big_win', ctx, { pri: 1, tone: 1 });
    else if (!info.won && info.winProb > 0.65 && r.chance(has(o, 'impatient') ? 0.85 : has(o, 'patient') ? 0.3 : 0.55)) mail(state, o, 'bad_loss', ctx, { pri: 1, tone: -1 });
    else if (info.won && info.big && info.their === 0 && r.chance(0.4) && cool(state, o, 'bigwin', 12)) mail(state, o, 'big_win', ctx, { pri: 0, tone: 1 });
  }
}

function onEvent(state: GameState, o: OwnerState, e: ClubEvent) {
  const team = state.teams[o.teamId];
  const p = e.playerId ? state.players[e.playerId] : undefined;
  const s = scale(state, team);
  switch (e.kind) {
    case 'sign_star':
      o.mood = clamp(o.mood + (has(o, 'ambitious') || has(o, 'publicity') ? 6 : 3) - (has(o, 'frugal') ? 3 : 0), -100, 100);
      if (cool(state, o, 'star', 20)) mail(state, o, 'star_signed', { player: p?.handle }, { pri: 1, tone: 1 });
      break;
    case 'depart_fanfav': case 'depart_traitor':
      o.mood = clamp(o.mood + (has(o, 'sentimental') ? -10 : has(o, 'frugal') ? 2 : -4), -100, 100);
      mail(state, o, 'fanfav_sold', { player: p?.handle }, { pri: 1, tone: -1 });
      break;
    case 'sponsor_w': case 'sponsor_sellout':
      o.mood = clamp(o.mood + (has(o, 'publicity') ? 3 : 1) - (has(o, 'oldSchool') && e.kind === 'sponsor_sellout' ? 2 : 0), -100, 100);
      if (cool(state, o, 'sponsor', 30)) mail(state, o, 'sponsor_new', { sponsor: e.data?.sponsor }, { pri: 0 });
      break;
    case 'facility':
      o.mood = clamp(o.mood + (has(o, 'dataNerd') && e.data?.key === 'analyticsLab' ? 4 : 0) - (has(o, 'frugal') ? 2 : 0) - (has(o, 'oldSchool') && e.data?.key === 'gamingHouse' ? 2 : 0), -100, 100);
      if (cool(state, o, 'facility', 30)) mail(state, o, 'facility', { facility: e.data?.facility }, { pri: 0 });
      break;
    case 'coach_new': mail(state, o, 'coach_new', { coach: e.data?.coach }, { pri: 0 }); break;
    case 'payroll':
      o.mood = clamp(o.mood - (has(o, 'frugal') ? 6 : has(o, 'generous') ? 0 : 2), -100, 100);
      if (cool(state, o, 'payroll', 45)) mail(state, o, 'wage_bill', { amount: usd(num(e.data?.amount)) }, { pri: 1 });
      break;
    case 'qualify_intl': {
      if (!cool(state, o, 'intl:' + e.data?.event, 60)) break;
      const amount = has(o, 'generous') ? Math.round(50000 * s / 1000) * 1000 : 0;
      if (amount) applyFx(state, o, { cash: amount, cat: 'Owner bonus' }, 'International preparation');
      applyFx(state, o, { owner: has(o, 'ambitious') ? 8 : 5, conf: 4 });
      mail(state, o, 'qualify_intl', { event: e.data?.event, amount: usd(amount) }, { pri: 2, tone: 1 });
      break;
    }
    case 'playoffs': o.mood = clamp(o.mood + 4, -100, 100); mail(state, o, 'playoffs', { comp: e.data?.comp }, { pri: 1, tone: 1 }); break;
    case 'comp_done': {
      const c = state.competitions[String(e.data?.comp)], place = num(e.data?.place);
      if (!c || c.kind === 'league' || o.cooldown['comp:' + c.id]) break;
      o.cooldown['comp:' + c.id] = state.date;
      if (place > 2) mail(state, o, 'elim', { comp: compName(c.name), place: placementLabel(place, c).toLowerCase() }, { pri: 1, tone: -1 });
      break;
    }
  }
}

/** Weekly: owner mood drifts with fans, nudges board confidence; ultimatum chain. */
function weekly(state: GameState, o: OwnerState) {
  const team = state.teams[o.teamId], fm = fanMood(state, team.id);
  o.mood = clamp(o.mood * 0.97 + fm.mood * (has(o, 'publicity') || has(o, 'sentimental') ? 0.04 : 0.02), -100, 100);
  state.board.confidence = clamp(state.board.confidence + o.mood * 0.012, 0, 100);
  // ultimatum chain
  const c = state.board.confidence;
  const open = o.promises.some((p) => p.status === 'open' && (p.source === 'ultimatum' || p.source === 'final'));
  if (o.ultimatum > 0 && c > 45 && !open) { o.ultimatum = 0; mail(state, o, 'reprieve', {}, { pri: 2, tone: 2 }); }
  else if (!open && o.ultimatum === 0 && c < 30 && cool(state, o, 'ult1', 40)) { o.ultimatum = 1; mail(state, o, 'ultimatum_1', {}, { pri: 2, force: true, tone: -2 }); }
  else if (!open && o.ultimatum === 1 && c < 20 && !o.requests.some((r) => r.kind === 'ultimatum' && !r.resolved) && cool(state, o, 'ult2', 30)) {
    o.ultimatum = 2;
    openRequest(state, o, 'ultimatum', { data: {}, options: [{ id: 'accept', label: 'Accept: 3 wins from the next 5 series', hint: 'Promise · success clears the warnings' }, { id: 'time', label: 'Ask for time: 4 wins from the next 7', hint: 'Promise · owner slightly annoyed' }], fallback: 'accept', days: 5 });
  } else if (!open && o.ultimatum === 3 && c < 15 && (!o.cooldown.final || days(o.cooldown.final, state.date) >= 60)) {
    const f = winSeries(state, o, 2, 3, 'final', 'Win 2 of the next 3 series (final warning)');
    mail(state, o, 'ultimatum_3', { promise: 'Win 2 of the next 3 series', deadline: longDate(f.deadline) }, { pri: 2, force: true, tone: -2 });
  }
  if (team.balance < 0 && cool(state, o, 'neg', 30)) { o.mood = clamp(o.mood - (has(o, 'frugal') ? 8 : 4), -100, 100); mail(state, o, 'finance_negative', {}, { pri: 1, tone: -1 }); }
  if (fm.mood < -50 && cool(state, o, 'fansAngry', 35)) { o.mood = clamp(o.mood - (has(o, 'publicity') || has(o, 'sentimental') ? 6 : 3), -100, 100); mail(state, o, 'fans_angry', {}, { pri: 1, tone: -1 }); }
  if (fm.mood > 55 && cool(state, o, 'fansHappy', 45)) { o.mood = clamp(o.mood + 3, -100, 100); mail(state, o, 'fans_happy', {}, { pri: 0, tone: 1 }); }
}

function monthly(state: GameState, o: OwnerState, rng: RNG) {
  const team = state.teams[o.teamId], fm = fanMood(state, team.id);
  const prev = addDays(state.date, -1).slice(0, 7);
  const fx = Object.values(state.fixtures).filter((f) => isPlayed(f) && f.date.startsWith(prev) && (f.teamA === team.id || f.teamB === team.id));
  const w = fx.filter((f) => f.result!.winner === team.id).length, l = fx.length - w;
  const row = team.monthly.find((m) => m.month === prev);
  const net = row ? Object.values(row.income).reduce((a, b) => a + b, 0) - Object.values(row.expense).reduce((a, b) => a + b, 0) : 0;
  if (!fx.length) return;
  const score = (w - l) * 1.5 + fm.mood / 25 + (net > 0 ? 1 : -1) + o.mood / 40;
  const key = score >= 3 ? 'monthly_good' : score <= -3 ? 'monthly_bad' : 'monthly_meh';
  o.mood = clamp(o.mood + clamp(score, -6, 6), -100, 100);
  const month = new Date(prev + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const repeat = o.cooldown.lastReview === key;
  o.cooldown.lastReview = key;
  if (rng.chance(key === 'monthly_meh' ? 0.3 : key === 'monthly_bad' ? 0.85 : repeat ? 0.35 : 0.75)) mail(state, o, key, { month, record: `${w}-${l}`, net: `${net >= 0 ? '+' : ''}${usd(net)}` }, { pri: key === 'monthly_meh' ? 0 : 1, tone: key === 'monthly_good' ? 1 : key === 'monthly_bad' ? -1 : 0 });
  if (key === 'monthly_good' && o.mood > 40 && (has(o, 'generous') || o.mood > 65) && cool(state, o, 'raise', 150)) {
    const amount = Math.round(120000 * scale(state, team) * (has(o, 'generous') ? 1.3 : 1) / 1000) * 1000;
    applyFx(state, o, { cash: amount, cat: 'Owner investment' }, 'Budget raise');
    state.board.budgetMultiplier = Math.round(((state.board.budgetMultiplier ?? 1) + 0.05) * 100) / 100;
    mail(state, o, 'raise', { amount: usd(amount) }, { pri: 2, force: true, tone: 2 });
  }
  if (net > 400000 * scale(state, team) && cool(state, o, 'profit', 75)) mail(state, o, 'finance_profit', { net: usd(net) }, { pri: 0, tone: 1 });
}

const LUNAR: Record<number, string> = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11' };

/** Daily hook: requests expiring, promises, club events, special days, weekly / monthly reviews, quirks. */
export function ownerDaily(state: GameState, events: ClubEvent[]) {
  const o = ensureOwner(state);
  const team = state.teams[o.teamId];
  const rng = new RNG(hashString(state.date + 'owner') ^ state.seq);
  const md = state.date.slice(5), year = Number(state.date.slice(0, 4));
  for (const r of o.requests) {
    if (r.resolved || r.expires >= state.date) continue;
    resolveRequest(state, o, r, r.fallback, true);
    mail(state, o, 'ignored', { topic: TOPIC[r.kind] ?? 'my request' }, { pri: 0, tone: -1 });
  }
  checkPromises(state, o);
  for (const e of events) onEvent(state, o, e);
  // special days
  if (md === '01-01') mail(state, o, 'new_year', {}, { pri: 0, tone: 1 });
  if (md === (LUNAR[year] ?? '02-10') && ['KR', 'CN', 'APAC'].includes(team.region)) mail(state, o, 'lunar_new_year', {}, { pri: 0, tone: 1 });
  if (md === '12-25') { if (has(o, 'generous')) applyFx(state, o, { morale: 3 }); mail(state, o, 'xmas', {}, { pri: 0, tone: 1 }); }
  if (md === '10-31') mail(state, o, 'halloween', {}, { pri: 0 });
  if (md === o.birthday) mail(state, o, 'birthday', {}, { pri: 0 });
  if (md === o.hired.slice(5) && state.date > o.hired) mail(state, o, 'anniversary', { years: year - Number(o.hired.slice(0, 4)) }, { pri: 1, tone: 1 });
  if (o.cooldown.season !== String(state.season)) {
    if (o.cooldown.season) mail(state, o, 'season_start', {}, { pri: 1 });
    o.cooldown.season = String(state.season);
  }
  if (weekday(state.date) === 1) weekly(state, o);
  if (state.date.slice(8) === '01') monthly(state, o, rng);
  maybeQuirk(state, o, rng);
}

// ------------------------------------------------------------------ hooks for the fan-buzz module
/** Templated owner mail from another module (same rate limits); `cd` = [cooldown key, days]. */
export function ownerMail(state: GameState, key: string, ctx: Ctx, opts: { pri?: number; force?: boolean; tone?: number; cd?: [string, number] } = {}): boolean {
  const o = ensureOwner(state);
  if (opts.cd && !cool(state, o, opts.cd[0], opts.cd[1])) return false;
  return mail(state, o, key, ctx, opts);
}
/** Register an extra choice-request kind; it never fires on its own (weight 0) — open it with ownerAsk. */
export function registerOwnerQuirk(kind: string, def: Omit<QuirkDef, 'weight'>, topic: string) {
  // a module caught in an import cycle can call this before the tables below exist: park it until they do
  if (!quirksReady) { (pendingQuirks ??= []).push([kind, def, topic]); return; }
  QUIRKS[kind] = { ...def, weight: () => 0 };
  TOPIC[kind] = topic;
}
// `var` on purpose: readable (as undefined/false) before this module's body has run
// eslint-disable-next-line no-var
var pendingQuirks: [string, Omit<QuirkDef, 'weight'>, string][] | undefined;
// eslint-disable-next-line no-var
var quirksReady: boolean | undefined;
quirksReady = true;
for (const [k, d, t] of pendingQuirks ?? []) registerOwnerQuirk(k, d, t);
pendingQuirks = undefined;
/** Open a registered request now, unless one is already pending or it ran in the last `cd` days. */
export function ownerAsk(state: GameState, kind: string, rng: RNG): boolean {
  const o = ensureOwner(state), q = QUIRKS[kind];
  if (!q || o.requests.some((r) => !r.resolved) || !canSend(state, o, 2) || !cool(state, o, 'q:' + kind, q.cd)) return false;
  const made = q.make(state, o, state.teams[o.teamId], rng);
  if (!made) return false;
  openRequest(state, o, kind, made);
  return true;
}
/** Nudge the owner's mood (clamped) and note it in his log. */
export function ownerNudge(state: GameState, d: number, why?: string) {
  const o = ensureOwner(state);
  o.mood = clamp(o.mood + d, -100, 100);
  if (why) note(o, state.date, why, Math.sign(d));
}
export const ownerHas = (state: GameState, t: OwnerTrait) => !!state.owner && has(state.owner, t);
export { applyFx as ownerFx, scale as moneyScale };
