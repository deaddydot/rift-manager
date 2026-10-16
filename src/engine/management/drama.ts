// Club drama: the off-the-Rift chaos that makes the world feel alive. Every couple of weeks something happens at the
// user's club — a van parked outside the gaming house for days, cheating accusations after a huge game, an obsessive
// fan, a stage invader, leaked scrims, a tell-all interview, food poisoning in match week, a viral meme, a petition to
// bench someone, a celebrity in the jersey, trash talk, visa trouble, noise complaints, a hacked account, a charity
// stream, tampering accusations, a fan meet gone wrong. Each arrives as an inbox decision (3–4 choices with a cost and
// a consequence), plays out in fan posts, news and creator videos, and some come back days later (the investigation's
// verdict, the van returning, the clap-back aging well or badly). Bigger clubs attract more of it. Around the world,
// other clubs get their share in the news feed. Daily from endDay (game.ts); text in dramaTemplates.ts.
import type { GameState, Player, Team } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addDays, weekday } from '../season/formats';
import { overall } from '../setup';
import { addInbox, addNews } from './news';
import { addLedger } from './finance';
import { emit, baseCtx, fanMood, fill, type Ctx } from './fans';
import { FAN_TEMPLATES, SCENARIO_META } from './fanTemplates';
import { boostFans } from './fanbase';
import { personaOf } from './persona';
import { contentEvent } from './contentFx';
import { sendPlayerAway } from './people';
import { DRAMA_TEXT, DRAMA_FAN, DRAMA_FAN_META, CELEBS, type DramaKind } from './dramaTemplates';

export interface DramaEvent {
  id: string; kind: DramaKind; date: string; expires: string;
  playerId?: string; data: Record<string, string | number>;
  options: { id: string; label: string; hint: string }[]; fallback: string;
  subject: string; body: string; from: string;
  resolved?: string; outcome?: string;
  follow?: { id: string; at: string; done?: boolean }[];
}
export interface DramaState { events: DramaEvent[]; cd: Record<string, string>; roster?: string[]; left?: [string, string][]; world?: string }

/** What an option does. Money is a base amount scaled by the league tier. */
interface Fx {
  money?: number; mood?: number; hype?: number; fans?: number; morale?: number; pMorale?: number; rep?: number; trust?: number;
  chem?: number; fatigue?: number; owner?: number; prestige?: number; away?: number; mistakes?: number;
  news?: boolean; creators?: number; posts?: string;
  follow?: { id: string; days: [number, number]; p?: number; else?: string }[];
}
type Resolve = Fx | ((state: GameState, ev: DramaEvent, rng: RNG) => Fx & { text?: string });
interface Def {
  /** How likely this is right now (0 = can't happen), and which player it is about. */
  weight: (x: Ctx2) => number;
  player?: (x: Ctx2) => Player | undefined;
  cooldown: number;              // days before the same kind can happen again
  fallback: string;              // what happens if the user doesn't answer
  options: Record<string, Resolve>;
  /** Follow-ups: what happens when they come due. */
  follow?: Record<string, Fx>;
  public?: boolean;              // news + fan posts the day it happens
  data?: (x: Ctx2) => Record<string, string | number> | null;
}
interface Ctx2 { state: GameState; team: Team; rng: RNG; fame: number; tier: number; roster: Player[]; starters: Player[] }

const TIER_MONEY: Record<number, number> = { 1: 1, 2: 0.3, 3: 0.08 };
const has = (p: Player, t: string) => p.traits.includes(t);
const best = (list: Player[], f: (p: Player) => number) => [...list].sort((a, b) => f(b) - f(a))[0];
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
const fmtMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

/** The user's most recent series (for after-match drama). */
function lastSeries(state: GameState, team: Team) {
  return Object.values(state.fixtures).filter((f) => f.result && (f.teamA === team.id || f.teamB === team.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
}
function nextSeries(state: GameState, team: Team) {
  return Object.values(state.fixtures).filter((f) => !f.result && f.teamA && f.teamB && (f.teamA === team.id || f.teamB === team.id) && f.date >= state.date).sort((a, b) => a.date.localeCompare(b.date))[0];
}

const DEFS: Record<DramaKind, Def> = {
  stalker_van: {
    weight: (x) => 0.35 * x.fame + (x.roster.some((p) => has(p, 'heartthrob') || has(p, 'fan_favorite')) ? 0.25 : 0),
    player: (x) => best(x.roster, (p) => p.reputation + personaOf(p).looks * 0.3),
    cooldown: 120, fallback: 'ignore', public: true,
    options: {
      police: { money: -3000, mood: 2, morale: 1, owner: 1, creators: 0.3, follow: [{ id: 'van_gone', days: [3, 7] }] },
      statement: { mood: 3, hype: 1, morale: 0.5, follow: [{ id: 'van_back', days: [6, 12], p: 0.3, else: 'van_gone' }] },
      security: { money: -15000, morale: 2.5, mood: 1, follow: [{ id: 'van_gone', days: [3, 6] }] },
      ignore: { morale: -2, pMorale: -2, mood: -2, follow: [{ id: 'van_back', days: [5, 10], p: 0.55, else: 'van_gone' }] },
    },
    follow: { van_back: { morale: -2.5, pMorale: -3, mood: -2, posts: 'drama_stalker_van' }, van_gone: { morale: 1.5, mood: 1, posts: 'drama_van_gone' } },
  },
  cheat_allegation: {
    weight: (x) => {
      const f = lastSeries(x.state, x.team);
      return f && f.result!.winner === x.team.id && days(f.date, x.state.date) <= 3 ? 0.9 : 0.12;
    },
    player: (x) => {
      const f = lastSeries(x.state, x.team);
      const lines = f?.result?.games.flatMap((g) => g.players ?? []).filter((l) => l.teamId === x.team.id) ?? [];
      const top = [...lines].sort((a, b) => b.k + b.a * 0.3 - (a.k + a.a * 0.3))[0];
      return (top && x.state.players[top.playerId]) || best(x.starters, (p) => p.attributes.mechanics);
    },
    cooldown: 90, fallback: 'ignore', public: true,
    options: {
      handcam: (state, ev) => {
        const p = state.players[ev.playerId ?? ''];
        const shy = p && has(p, 'camera_shy');
        return { pMorale: shy ? -2 : 1, trust: 2, fatigue: 1, creators: 0.4, follow: [{ id: 'handcam_win', days: [2, 4] }] };
      },
      league: { trust: 1, follow: [{ id: 'cleared', days: [10, 18], p: 0.85, else: 'minor' }] },
      legal: { money: -8000, owner: 2, mood: -1, creators: 0.6, trust: 3, rep: -0.3 },
      ignore: { pMorale: -2.5, trust: -2, rep: -0.6, mood: -1.5 },
    },
    follow: {
      cleared: { pMorale: 3, rep: 1, mood: 2, trust: 2, news: true, posts: 'drama_cleared' },
      minor: { money: -6000, pMorale: -2, rep: -1.5, mood: -2, news: true, posts: 'drama_minor' },
      handcam_win: { pMorale: 2, rep: 1.2, mood: 2.5, hype: 2, news: true, posts: 'drama_cleared' },
    },
  },
  crazy_fan: {
    weight: (x) => 0.3 * x.fame + 0.1,
    player: (x) => best(x.roster, (p) => p.reputation + personaOf(p).looks * 0.4 + (has(p, 'heartthrob') ? 30 : 0)),
    cooldown: 90, fallback: 'ignore',
    options: {
      escort: { money: -6000, pMorale: 2, trust: 2, follow: [{ id: 'fan_calm', days: [5, 9] }] },
      meet: (state, ev, rng) => {
        const p = state.players[ev.playerId ?? ''];
        const ok = !!p && rng.chance(0.35 + personaOf(p).charisma / 160);
        return ok ? { pMorale: 1, mood: 2, rep: 0.5, follow: [{ id: 'fan_calm', days: [4, 8] }] } : { pMorale: -2, follow: [{ id: 'fan_escalates', days: [6, 10], p: 0.5, else: 'fan_calm' }] };
      },
      police: { money: -1500, pMorale: 1.5, trust: 1, mood: 1, follow: [{ id: 'fan_calm', days: [4, 8] }] },
      ignore: { pMorale: -2.5, trust: -2, follow: [{ id: 'fan_escalates', days: [6, 12], p: 0.45, else: 'fan_calm' }] },
    },
    follow: { fan_escalates: { pMorale: -4, morale: -1.5, money: -4000, news: true }, fan_calm: { pMorale: 1 } },
  },
  stage_invader: {
    weight: (x) => {
      const f = lastSeries(x.state, x.team);
      const c = f ? x.state.competitions[f.competitionId] : undefined;
      return f && f.result!.winner === x.team.id && days(f.date, x.state.date) <= 2 && c && (c.tier === 0 || c.kind === 'playoffs') ? 1.2 : 0;
    },
    player: (x) => best(x.starters, (p) => p.reputation),
    cooldown: 150, fallback: 'pay', public: true,
    data: (x) => ({ amount: fmtMoney(10000 * TIER_MONEY[x.tier]) }),
    options: {
      pay: { money: -10000, owner: 1 },
      defend: { money: -15000, mood: 4, hype: 2, owner: -2, creators: 0.3 },
      invite: { money: -2000, mood: 5, hype: 3, fans: 0.004, creators: 0.5 },
    },
  },
  leaked_scrims: {
    weight: () => 0.22,
    cooldown: 120, fallback: 'ignore', public: true,
    options: {
      hunt: { money: -12000, follow: [{ id: 'leaker_found', days: [5, 10], p: 0.55, else: 'leaker_unknown' }] },
      new_strats: { chem: -2, fatigue: 2, morale: -0.5, mood: 1 },
      ignore: { morale: -1.5, mood: -1 },
    },
    follow: { leaker_found: { morale: 2, mood: 2, owner: 2, news: true }, leaker_unknown: { morale: -1 } },
  },
  tell_all: {
    weight: (x) => (x.state.drama?.left?.some(([, d]) => days(d, x.state.date) <= 120) ? 0.45 : 0),
    cooldown: 150, fallback: 'silence', public: true,
    data: (x) => {
      const gone = x.state.drama?.left?.filter(([, d]) => days(d, x.state.date) <= 120).map(([id]) => x.state.players[id]).filter((p): p is Player => !!p && p.teamId !== x.team.id);
      const p = gone?.length ? x.rng.pick(gone) : undefined;
      return p ? { player: p.handle } : null;
    },
    options: {
      respond: (_s, _e, rng) => (rng.chance(0.55) ? { mood: 3, owner: 1, creators: 0.5 } : { mood: -3, creators: 0.6 }),
      silence: { mood: -1.5, owner: -1, prestige: -0.5 },
      legal: { money: -10000, owner: 2, mood: -2.5, creators: 0.7 },
    },
  },
  food_poisoning: {
    weight: (x) => (nextSeries(x.state, x.team) && days(x.state.date, nextSeries(x.state, x.team)!.date) <= 6 ? 0.3 : 0.1),
    cooldown: 120, fallback: 'push',
    options: {
      rest: { fatigue: -6, morale: 1, chem: -0.5 },
      push: { fatigue: 8, morale: -2 },
      chef: { money: -9000, fatigue: -3, morale: 2.5 },
    },
  },
  internet_outage: {
    weight: () => 0.15, cooldown: 120, fallback: 'wait',
    options: {
      pc_bang: { money: -1500, chem: 1.5, morale: 1, fatigue: 2, mood: 1 },
      hotel: { money: -8000, morale: 0.5 },
      wait: { morale: -1.5, fatigue: -3, chem: -1 },
    },
  },
  viral_meme: {
    weight: (x) => {
      const f = lastSeries(x.state, x.team);
      const bad = f?.result?.games.flatMap((g) => g.players ?? []).some((l) => l.teamId === x.team.id && l.d >= 7);
      return bad && days(f!.date, x.state.date) <= 4 ? 0.7 : 0.15;
    },
    player: (x) => {
      const f = lastSeries(x.state, x.team);
      const worst = [...(f?.result?.games.flatMap((g) => g.players ?? []).filter((l) => l.teamId === x.team.id) ?? [])].sort((a, b) => b.d - a.d)[0];
      return (worst && x.state.players[worst.playerId]) || x.rng.pick(x.starters);
    },
    cooldown: 60, fallback: 'ignore', public: true,
    options: {
      lean_in: (state, ev) => { const p = state.players[ev.playerId ?? '']; const ego = (p?.hidden.ego ?? 40) > 65; return { hype: 3, fans: 0.003, mood: 2, pMorale: ego ? -3 : 1, trust: ego ? -3 : 0, creators: 0.4 }; },
      defend: { pMorale: 2, trust: 3, mood: -0.5 },
      ignore: { pMorale: -1 },
    },
  },
  fan_petition: {
    weight: (x) => (fanMood(x.state, x.team.id).mood < -15 && x.starters.some((p) => p.form <= -3) ? 1 : 0),
    player: (x) => [...x.starters].sort((a, b) => a.form - b.form)[0],
    cooldown: 90, fallback: 'ignore', public: true,
    options: {
      back: { pMorale: 4, trust: 6, mood: -3 },
      bench: (state, ev) => {
        const p = state.players[ev.playerId ?? ''];
        const team = state.teams[state.userTeamId];
        const slot = p ? ROLES.find((r) => team.lineup[r] === p.id) : undefined;
        const sub = slot && p ? team.roster.map((id) => state.players[id]).filter((q) => q && q.id !== p.id && q.role === slot && !ROLES.some((r) => team.lineup[r] === q.id)).sort((a, b) => overall(b.attributes, b.role) - overall(a.attributes, a.role))[0] : undefined;
        if (slot && sub && p) { team.lineup[slot] = sub.id; sub.isSub = false; p.isSub = true; }
        return { pMorale: -6, trust: -8, mood: 4, text: sub ? `${sub.handle} starts.` : 'No substitute on the roster — the bench is symbolic.' };
      },
      ignore: { mood: -1.5, pMorale: -1 },
    },
  },
  celebrity_fan: {
    weight: (x) => 0.18 + 0.25 * x.fame, cooldown: 120, fallback: 'thank', public: true,
    data: (x) => ({ celeb: x.rng.pick(CELEBS) }),
    options: {
      invite: { money: -3000, hype: 4, fans: 0.006, mood: 3, morale: 1.5, creators: 0.5 },
      thank: { hype: 2, fans: 0.003, mood: 1.5 },
      ignore: { mood: -0.5 },
    },
  },
  rival_trashtalk: {
    weight: (x) => (nextSeries(x.state, x.team) && days(x.state.date, nextSeries(x.state, x.team)!.date) <= 5 ? 0.55 : 0),
    player: (x) => best(x.starters, (p) => (has(p, 'trash_talker') ? 50 : 0) + personaOf(p).online + p.hidden.ego * 0.3),
    cooldown: 45, fallback: 'classy', public: true,
    data: (x) => {
      const f = nextSeries(x.state, x.team);
      const opp = f ? x.state.teams[f.teamA === x.team.id ? f.teamB! : f.teamA!] : undefined;
      return opp ? { opp: opp.name, oppShort: opp.short, oppId: opp.id, after: f!.date } : null;
    },
    options: {
      clap_back: { hype: 3, mood: 1.5, morale: 1, creators: 0.5, follow: [{ id: 'verdict', days: [0, 0] }] },
      classy: { owner: 1, mood: 0.5 },
      player: (state, ev) => { const p = state.players[ev.playerId ?? '']; const tt = p && has(p, 'trash_talker'); return { hype: tt ? 5 : 2, pMorale: 2, mood: 1, creators: 0.6, follow: [{ id: 'verdict', days: [0, 0] }] }; },
    },
    follow: { aged_well: { hype: 3, mood: 3, posts: 'drama_aged_well' }, aged_badly: { hype: -2, mood: -4, morale: -1, posts: 'drama_aged_badly' } },
  },
  visa_issue: {
    weight: (x) => {
      const intl = Object.values(x.state.competitions).find((c) => c.tier === 0 && c.season === x.state.season && c.teams.includes(x.team.id) && c.startDate > x.state.date && days(x.state.date, c.startDate) <= 20);
      return intl && !(x.state.drama?.cd[`visa:${intl.id}`]) ? 2 : 0;
    },
    player: (x) => x.rng.pick(x.starters),
    cooldown: 60, fallback: 'wait',
    data: (x) => {
      const intl = Object.values(x.state.competitions).find((c) => c.tier === 0 && c.season === x.state.season && c.teams.includes(x.team.id) && c.startDate > x.state.date && days(x.state.date, c.startDate) <= 20);
      if (!intl) return null;
      x.state.drama!.cd[`visa:${intl.id}`] = x.state.date;
      return { event: intl.name.replace(/\s\d{4}$/, ''), start: intl.startDate, amount: fmtMoney(5000 * TIER_MONEY[x.tier]) };
    },
    options: {
      expedite: { money: -5000, follow: [{ id: 'visa_ok', days: [4, 8], p: 0.8, else: 'visa_late' }] },
      lawyer: { money: -14000, pMorale: 1, follow: [{ id: 'visa_ok', days: [3, 6] }] },
      wait: { pMorale: -1, follow: [{ id: 'visa_ok', days: [8, 14], p: 0.5, else: 'visa_late' }] },
    },
    follow: { visa_ok: { pMorale: 1.5 }, visa_late: { pMorale: -3, away: 4, news: true } },
  },
  noise_complaint: {
    weight: (x) => 0.12 * (x.team.facilities.gamingHouse <= 2 ? 1.6 : 0.6), cooldown: 150, fallback: 'ignore',
    data: (x) => ({ amount: fmtMoney(12000 * TIER_MONEY[x.tier]) }),
    options: {
      soundproof: { money: -12000, morale: 1.5 },
      curfew: { morale: -2, fatigue: -4, owner: 1, mistakes: -0.3 },
      ignore: { follow: [{ id: 'fined', days: [5, 12], p: 0.6 }] },
    },
    follow: { fined: { money: -5000, owner: -2, mood: -0.5 } },
  },
  account_hacked: {
    weight: (x) => 0.12 + x.roster.filter((p) => personaOf(p).online > 65).length * 0.04,
    player: (x) => best(x.roster, (p) => personaOf(p).online + (p.streamer ? 20 : 0)),
    cooldown: 120, fallback: 'statement', public: true,
    options: {
      statement: { mood: 0.5, pMorale: -0.5 },
      audit: { money: -6000, owner: 1, pMorale: 0.5 },
      joke: (_s, _e, rng) => (rng.chance(0.65) ? { hype: 3, mood: 2, fans: 0.002, creators: 0.3 } : { mood: -2, owner: -1, creators: 0.3 }),
    },
  },
  charity_stream: {
    weight: () => 0.2, cooldown: 120, fallback: 'decline', public: true,
    data: (x) => ({ amount: fmtMoney(10000 * TIER_MONEY[x.tier]) }),
    options: {
      stream: { fatigue: 5, fans: 0.004, mood: 3, prestige: 1, hype: 2, chem: 1, creators: 0.3 },
      donate: { money: -10000, prestige: 1, mood: 1.5, owner: 1 },
      decline: { mood: -1 },
    },
  },
  tampering: {
    weight: (x) => (x.state.transferWindowOpen && x.state.transferOffers.some((o) => o.status === 'pending' && o.direction === 'outgoing' && o.fromTeamId && o.fromTeamId !== x.team.id) ? 0.6 : 0),
    cooldown: 120, fallback: 'deny', public: true,
    data: (x) => {
      const o = x.state.transferOffers.find((o2) => o2.status === 'pending' && o2.direction === 'outgoing' && o2.fromTeamId && o2.fromTeamId !== x.team.id);
      const opp = o ? x.state.teams[o.fromTeamId!] : undefined;
      const p = o ? x.state.players[o.playerId] : undefined;
      return opp && p ? { opp: opp.name, oppShort: opp.short, player: p.handle, amount: fmtMoney(30000 * TIER_MONEY[x.tier]) } : null;
    },
    options: {
      deny: { owner: 1, follow: [{ id: 'fined', days: [10, 20], p: 0.35, else: 'dismissed' }] },
      withdraw: (state, ev) => {
        const o = state.transferOffers.find((o2) => o2.status === 'pending' && o2.direction === 'outgoing' && state.players[o2.playerId]?.handle === ev.data.player);
        if (o) o.status = 'withdrawn';
        return { owner: -1, mood: -0.5 };
      },
      apologise: { money: -8000, owner: -1, prestige: -0.5 },
    },
    follow: { fined: { money: -30000, owner: -3, prestige: -1, news: true }, dismissed: { owner: 2, mood: 1, news: true } },
  },
  fan_meet_chaos: {
    weight: (x) => 0.12 + 0.15 * x.fame, cooldown: 150, fallback: 'security', public: true,
    data: (x) => ({ city: x.rng.pick(['Seoul', 'Shanghai', 'Berlin', 'Los Angeles', 'São Paulo', 'Ho Chi Minh City', 'Taipei', 'Madrid', 'Busan', 'Hanoi']), amount: fmtMoney(15000 * TIER_MONEY[x.tier]) }),
    options: {
      refund: { money: -15000, mood: 4, prestige: 0.5 },
      security: { money: -5000, mood: 1, owner: 1 },
      venue: { mood: -3, creators: 0.4 },
    },
  },
};
export const DRAMA_KINDS = Object.keys(DEFS) as DramaKind[];

// ------------------------------------------------------------------ state & helpers
export const dramaState = (state: GameState): DramaState => (state.drama ??= { events: [], cd: {} });
export const dramaLive = (state: GameState, id: string) => { const e = state.drama?.events.find((x) => x.id === id); return !!e && !e.resolved && e.expires >= state.date; };
const pick = (rng: RNG, lines: readonly string[] | undefined, ctx: Ctx) => {
  if (!lines?.length) return '';
  for (let i = 0; i < 8; i++) { const t = fill(rng.pick(lines), ctx); if (t) return t; }
  return '';
};
let registered = false;
function register() {
  if (registered) return;
  registered = true;
  for (const [scen, t] of Object.entries(DRAMA_FAN)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t)) (base[p as keyof typeof base] ??= []).push(...(lines ?? []));
  }
  for (const [k, v] of Object.entries(DRAMA_FAN_META)) SCENARIO_META[k] ??= v;
}
function ctxOf(state: GameState, team: Team, ev: DramaEvent): Ctx {
  const p = ev.playerId ? state.players[ev.playerId] : undefined;
  const staff = team.staff.map((id) => state.staff[id]).find((s) => s && s.role !== 'headCoach');
  return { ...baseCtx(state, team), team: team.name, short: team.short, player: p?.handle, staff: staff?.handle, ...ev.data };
}

/** Apply effects; returns a one-line summary of what changed. */
function apply(state: GameState, team: Team, ev: DramaEvent, fx: Fx, rng: RNG): string {
  const out: string[] = [];
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const p = ev.playerId ? state.players[ev.playerId] : undefined;
  const fm = fanMood(state, team.id);
  if (fx.money) { const m = Math.round(fx.money * (TIER_MONEY[tier] ?? 0.1)); addLedger(state, team, 'Club incidents', m, DRAMA_TEXT[ev.kind]?.subject[0] ?? ev.kind); out.push(`${m < 0 ? '−' : '+'}${fmtMoney(Math.abs(m))}`); }
  if (fx.mood) { fm.mood = clamp(fm.mood + fx.mood, -100, 100); out.push(`fans ${fx.mood > 0 ? '+' : ''}${fx.mood}`); }
  if (fx.hype) team.hype = clamp(team.hype + fx.hype, 0, 100);
  if (fx.fans) boostFans(team, fx.fans);
  const starters = ROLES.map((r) => team.lineup[r]).filter((x): x is string => !!x).map((id) => state.players[id]).filter(Boolean);
  if (fx.morale) { for (const q of team.roster.map((id) => state.players[id]).filter(Boolean)) q.morale = clamp(q.morale + fx.morale, 5, 100); out.push(`team morale ${fx.morale > 0 ? '+' : ''}${fx.morale}`); }
  if (fx.fatigue) for (const q of starters) q.fatigue = clamp(q.fatigue + fx.fatigue, 0, 100);
  if (fx.chem) team.chemistry = clamp(team.chemistry + fx.chem, 10, 100);
  if (fx.mistakes) for (const q of starters) q.hidden.mistakes = Math.max(10, q.hidden.mistakes + fx.mistakes);
  if (p) {
    if (fx.pMorale) { p.morale = clamp(p.morale + fx.pMorale, 5, 100); out.push(`${p.handle} ${fx.pMorale > 0 ? '+' : ''}${fx.pMorale} morale`); }
    if (fx.rep) p.reputation = clamp(p.reputation + fx.rep, 1, 100);
    if (fx.trust) { const me = state.people?.players[p.id]; if (me) me.trust = clamp(me.trust + fx.trust, 0, 100); }
    if (fx.away) { const note = sendPlayerAway(state, p, fx.away, 'visa delay'); if (note) out.push(note); }
  }
  if (fx.owner && state.owner?.teamId === team.id) state.owner.mood = clamp(state.owner.mood + fx.owner * 2, -100, 100);
  if (fx.prestige) team.prestige = clamp(team.prestige + fx.prestige, 0, 100);
  if (fx.creators && rng.chance(fx.creators)) contentEvent(state, 'drama', { ...(p ? { pid: p.id } : {}), p: 0.9 });
  if (fx.posts) { register(); const c = ctxOf(state, team, ev); for (let i = 0, n = rng.int(1, 3); i < n; i++) emit(state, rng, team, fx.posts, c, { playerId: p?.id, replyChance: 0.35 }); }
  if (fx.news) {
    const t = DRAMA_TEXT[ev.kind];
    const c = ctxOf(state, team, ev);
    const h = pick(rng, t?.news?.headline, c), b = pick(rng, t?.news?.body, c);
    if (h && b) addNews(state, { headline: h, body: b, tags: ['drama'], teamIds: [team.id], playerIds: p ? [p.id] : [] });
  }
  return out.join(' · ');
}

// ------------------------------------------------------------------ the user's club
function ctx2(state: GameState, team: Team, rng: RNG): Ctx2 {
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const roster = team.roster.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const starters = ROLES.map((r) => team.lineup[r]).filter((x): x is string => !!x).map((id) => state.players[id]).filter((p): p is Player => !!p);
  const fame = clamp(Math.log10(Math.max(1000, team.fans)) - 3.5, 0, 3) / 3 + (tier === 1 ? 0.2 : 0);
  return { state, team, rng, fame, tier, roster, starters };
}

/** Start a drama for the user's club (debug / tests can force a kind). */
export function startDrama(state: GameState, rng: RNG, force?: DramaKind): DramaEvent | null {
  const team = state.teams[state.userTeamId];
  const st = dramaState(state);
  const x = ctx2(state, team, rng);
  if (!x.starters.length) return null;
  const cands = (force ? [force] : DRAMA_KINDS).map((k) => [k, (st.cd[k] && days(st.cd[k], state.date) < DEFS[k].cooldown && !force) ? 0 : force ? 1 : DEFS[k].weight(x)] as [DramaKind, number]).filter(([, w]) => w > 0);
  if (!cands.length) return null;
  const [kind] = rng.weighted(cands, (c) => c[1]);
  const def = DEFS[kind], t = DRAMA_TEXT[kind];
  if (!t) return null;
  const p = def.player?.(x);
  const data = def.data ? def.data(x) : {};
  if (data === null) return null;
  const ev: DramaEvent = {
    id: `drama_${state.seq++}`, kind, date: state.date, expires: addDays(state.date, 4), playerId: p?.id, data: data ?? {},
    options: Object.keys(def.options).map((id) => ({ id, label: t.options[id]?.label ?? id, hint: t.options[id]?.hint ?? '' })), fallback: def.fallback,
    subject: '', body: '', from: '',
  };
  const c = ctxOf(state, team, ev);
  ev.subject = pick(rng, t.subject, c) || kind;
  ev.body = pick(rng, t.body, c);
  ev.from = rng.pick(t.from) ?? 'Team manager';
  if (!ev.body) return null;
  st.events.unshift(ev);
  if (st.events.length > 40) st.events.length = 40;
  st.cd[kind] = state.date;
  addInbox(state, { from: ev.from, kind: 'media', subject: ev.subject, body: ev.body, action: { type: 'drama', payload: ev.id, label: 'Decide' } });
  if (def.public) {
    register();
    for (let i = 0, n = rng.int(2, 3); i < n; i++) emit(state, rng, team, `drama_${kind}`, c, { playerId: p?.id, replyChance: 0.4 });
    const h = pick(rng, t.news?.headline, c), b = pick(rng, t.news?.body, c);
    if (h && b && rng.chance(0.7)) addNews(state, { headline: h, body: b, tags: ['drama'], teamIds: [team.id], playerIds: p ? [p.id] : [] });
  }
  return ev;
}

/** The user picks an option (inbox). */
export function resolveDrama(state: GameState, id: string, optId: string, ignored = false): { ok: boolean; message: string } {
  const st = dramaState(state);
  const ev = st.events.find((e) => e.id === id);
  if (!ev || ev.resolved) return { ok: false, message: 'Already handled.' };
  const def = DEFS[ev.kind], t = DRAMA_TEXT[ev.kind];
  const r = def.options[optId];
  if (!r || !t) return { ok: false, message: 'Unknown option.' };
  const team = state.teams[state.userTeamId];
  const rng = new RNG(hashString(ev.id + optId) ^ state.seq);
  const fx = typeof r === 'function' ? r(state, ev, rng) : r;
  const summary = apply(state, team, ev, fx, rng);
  const c = ctxOf(state, team, ev);
  const story = pick(rng, t.options[optId]?.outcome, c);
  ev.resolved = optId;
  ev.outcome = [ignored ? 'No answer in time — this is what happened.' : '', story, (fx as { text?: string }).text ?? '', summary ? `(${summary})` : ''].filter(Boolean).join('\n');
  // follow-ups
  for (const f of fx.follow ?? []) {
    const id2 = f.p === undefined || rng.chance(f.p) ? f.id : f.else;
    if (!id2) continue;
    const at = f.id === 'verdict' ? String(ev.data.after ?? addDays(state.date, 5)) : addDays(state.date, rng.int(f.days[0], f.days[1]));
    (ev.follow ??= []).push({ id: id2, at });
  }
  return { ok: true, message: story || 'Handled.' };
}

// ------------------------------------------------------------------ the world
const WORLD_KINDS: DramaKind[] = ['stalker_van', 'cheat_allegation', 'stage_invader', 'leaked_scrims', 'tell_all', 'viral_meme', 'fan_petition', 'celebrity_fan', 'account_hacked', 'tampering', 'fan_meet_chaos', 'crazy_fan', 'food_poisoning', 'visa_issue'];
function worldDrama(state: GameState, rng: RNG) {
  const teams = Object.values(state.teams).filter((t) => t.id !== state.userTeamId && t.roster.length >= 5);
  const team = rng.weighted(teams, (t) => (state.leagues[t.leagueId]?.tier === 1 ? 3 : state.leagues[t.leagueId]?.tier === 2 ? 0.6 : 0.15) * (0.5 + Math.log10(Math.max(1000, t.fans)) / 6));
  if (!team) return;
  let kind = rng.pick(WORLD_KINDS);
  // visa trouble only for clubs travelling to an international event soon
  if (kind === 'visa_issue' && !Object.values(state.competitions).some((c) => c.tier === 0 && c.teams.includes(team.id) && c.startDate > state.date && days(state.date, c.startDate) <= 20)) kind = 'viral_meme';
  const t = DRAMA_TEXT[kind];
  if (!t?.world) return;
  const starters = ROLES.map((r) => team.lineup[r]).filter((x): x is string => !!x).map((id) => state.players[id]).filter((p): p is Player => !!p);
  const p = starters.length ? rng.weighted(starters, (q) => q.reputation + 10) : undefined;
  const other = rng.pick(Object.values(state.teams).filter((o) => o.leagueId === team.leagueId && o.id !== team.id));
  const c: Ctx = { team: team.name, short: team.short, player: p?.handle, opp: other?.name, oppShort: other?.short, celeb: rng.pick(CELEBS), city: rng.pick(['Seoul', 'Berlin', 'Shanghai', 'Los Angeles', 'Taipei', 'São Paulo']), event: 'Worlds', days: rng.int(2, 6), amount: '$20k' };
  const h = pick(rng, t.world.headline, c), b = pick(rng, t.world.body, c);
  if (!h || !b) return;
  addNews(state, { headline: h, body: b, tags: ['drama', 'world'], teamIds: [team.id], playerIds: p ? [p.id] : [] });
  // their fans talk about it in the world feed
  if (DRAMA_FAN[`drama_${kind}`] && rng.chance(0.6)) { register(); emit(state, rng, team, `drama_${kind}`, { ...baseCtx(state, team), ...c }, { playerId: p?.id, replyChance: 0.3 }); }
}

// ------------------------------------------------------------------ daily
/** Daily (endDay): unanswered decisions lapse, follow-ups land, new drama at home (every ~2 weeks) and abroad. */
export function dramaDaily(state: GameState) {
  const team = state.teams[state.userTeamId];
  if (!team) return;
  const st = dramaState(state);
  const rng = new RNG(hashString(state.date + ':drama') ^ state.seq);
  // who left the club (tell-alls)
  const now = team.roster.slice();
  if (st.roster) for (const id of st.roster) if (!now.includes(id)) (st.left ??= []).push([id, state.date]);
  st.roster = now;
  if (st.left && st.left.length > 12) st.left.splice(0, st.left.length - 12);
  for (const ev of st.events) {
    if (!ev.resolved && ev.expires < state.date) resolveDrama(state, ev.id, ev.fallback, true);
    for (const f of ev.follow ?? []) {
      if (f.done || f.at > state.date) continue;
      f.done = true;
      let id = f.id;
      if (id === 'verdict') {
        // the trash talk: did the match go our way?
        const fx = Object.values(state.fixtures).find((x) => x.result && x.date >= ev.date && ((x.teamA === team.id && x.teamB === ev.data.oppId) || (x.teamB === team.id && x.teamA === ev.data.oppId)));
        if (!fx) { if (days(ev.date, state.date) < 14) { f.done = false; f.at = addDays(state.date, 1); } continue; }
        id = fx.result!.winner === team.id ? 'aged_well' : 'aged_badly';
      }
      const fxDef = DEFS[ev.kind].follow?.[id];
      const t = DRAMA_TEXT[ev.kind]?.follow?.[id];
      const c = ctxOf(state, team, ev);
      const summary = fxDef ? apply(state, team, ev, fxDef, rng) : '';
      if (t) addInbox(state, { from: ev.from, kind: 'media', subject: pick(rng, t.subject, c) || ev.subject, body: [pick(rng, t.body, c), summary ? `(${summary})` : ''].filter(Boolean).join('\n\n') });
    }
  }
  // something new at the club: about every two weeks, more for big clubs; one open decision at a time
  const open = st.events.some((e) => !e.resolved);
  const x = ctx2(state, team, rng);
  if (!open && rng.chance((0.05 + 0.04 * x.fame) * (weekday(state.date) === 0 ? 0.5 : 1))) startDrama(state, rng);
  // the world
  if (rng.chance(0.22)) worldDrama(state, rng);
}
