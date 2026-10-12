// Stream audience model: how many people watch a broadcast. Pure functions of the save + the game state (testable
// headless, see scripts/debug/audience.ts), plus a small tracker for the in-game swings.
//
//   viewers = event base (competition, league, stage)  × team draw (fans, hype, prestige of both teams)
//           × star power × rivalry × series state (game 5 / match point) × a little day-to-day noise
//   live    = viewers × trickle-in ramp × (1 + excitement from big moments) × (1 − stomp bleed) (+ raids)
//
// Calibration targets (peaks): Worlds final 1–2M · Worlds knockouts 500k–1M · MSI final 600k–1M ·
// LCK T1 vs GEN 200–400k · average LCK 60–150k · LEC/LCS 30–100k · LCP/CBLOL 10–40k · tier 2 1–10k ·
// tier 3 hundreds to ~2k.
import type { GameState, MatchFixture, SeriesGame, Team, Competition } from '../../../engine/types';
import type { GameEvent } from '../../../engine/sim/simtypes';
import { hashString } from '../../../util/rng';

// ------------------------------------------------------------------ inputs
export interface AudienceTeam { id: string; short: string; leagueId: string; region: string; fans: number; hype: number; prestige: number }
export type StageKind = 'regular' | 'groups' | 'playin' | 'swiss' | 'knockout' | 'quarter' | 'semi' | 'final';
export interface AudienceInput {
  /** worlds | msi | fst | ewc | em | kespa | domestic | qualifier */
  event: string;
  compName: string;
  tier: number;
  leagueId?: string;
  stage: StageKind;
  stageLabel: string;
  bestOf: number;
  teams: [AudienceTeam, AudienceTeam];
  /** fans of a typical team for comparison (league mean domestically, tier-1 mean at internationals) */
  refFans: number;
  /** players in both lineups: reputations (0..100) and whether they carry the Fan Favorite trait */
  stars: { rep: number; fav: boolean }[];
  /** 0..1: how loaded the matchup is (classic rivalries, a final rematch, LCK vs LPL on the world stage) */
  rivalry: number;
  rivalryWhy?: string;
  gameNo: number;
  /** series score before this game, in `teams` order */
  wins: [number, number];
  /** T1 vs LPL under the lore rules */
  lore: boolean;
  seed: number;
}

export interface AudienceBase { viewers: number; raw: number; parts: { k: string; x: number }[]; input: AudienceInput }

// ------------------------------------------------------------------ the tables
/** Average viewers of a regular game, by event / league (before the stage, draw and series multipliers). */
const EVENT_BASE: Record<string, number> = { worlds: 300_000, msi: 190_000, fst: 125_000, ewc: 130_000, em: 11_000, kespa: 42_000 };
const LEAGUE_BASE: Record<string, number> = {
  LCK: 78_000, LPL: 68_000, LEC: 44_000, LCS: 33_000, CBLOL: 19_000, LCP: 16_000,
  LCKCL: 4_200, VCS: 6_500, NACL: 2_400, CD: 2_800, LJL: 2_300, PCS: 2_800, LFL: 4_800, PRM: 2_600, LES: 3_200, TCL: 3_000, NLC: 1_800,
  RL: 1_900, LIT: 1_500, ROL: 1_400, HLL: 1_300, EBL: 1_500, HM: 1_300, LPLOL: 1_400, AL: 2_000,
};
const TIER_BASE: Record<number, number> = { 0: 150_000, 1: 25_000, 2: 2_200, 3: 480 };
/** Stage multiplier per event family. */
const STAGE_MULT: Record<'worlds' | 'msi' | 'minor' | 'domestic', Record<StageKind, number>> = {
  worlds: { regular: 1, groups: 1, playin: 0.55, swiss: 1, knockout: 1.4, quarter: 1.55, semi: 2.0, final: 3.6 },
  msi: { regular: 1, groups: 1, playin: 0.6, swiss: 1, knockout: 1.3, quarter: 1.35, semi: 1.75, final: 2.8 },
  minor: { regular: 1, groups: 1, playin: 0.7, swiss: 1, knockout: 1.3, quarter: 1.35, semi: 1.6, final: 2.5 },
  domestic: { regular: 1, groups: 0.95, playin: 0.8, swiss: 1, knockout: 1.4, quarter: 1.45, semi: 1.65, final: 2.1 },
};
/** Well-known rivalries (team id pairs) and how loaded they are. */
const RIVALS: [string, string, number, string][] = [
  ['t1-lck', 'gen-lck', 0.75, 'the LCK’s marquee rivalry'], ['t1-lck', 'kt-lck', 0.6, 'the Telecom War'], ['t1-lck', 'hle-lck', 0.45, 'a storied LCK rivalry'],
  ['gen-lck', 'hle-lck', 0.4, 'a heavyweight LCK clash'], ['t1-lck', 'dk-lck', 0.4, 'a classic LCK matchup'], ['t1-lck', 'blg-lpl', 0.55, 'a Worlds-final rematch'],
  ['t1-lck', 'jdg-lpl', 0.45, 'LCK vs LPL royalty'], ['gen-lck', 'blg-lpl', 0.35, 'LCK vs LPL royalty'], ['g2-lec', 'fnc-lec', 0.7, 'the European derby'],
  ['tl-lcs', 'c9-lcs', 0.6, 'North America’s oldest rivalry'], ['fly-lcs', 'tl-lcs', 0.3, 'an LCS grudge match'], ['loud-cblol', 'pain-gaming', 0.55, 'Brazil’s biggest rivalry'],
  ['gam-lcp', 'tsw-lcp', 0.5, 'the Vietnamese derby'], ['gam-lcp', 'mvk-lcp', 0.45, 'the Vietnamese derby'], ['tsw-lcp', 'mvk-lcp', 0.35, 'the Vietnamese derby'],
  ['jdg-lpl', 'blg-lpl', 0.35, 'an LPL heavyweight clash'], ['tes-lpl', 'jdg-lpl', 0.3, 'an LPL heavyweight clash'], ['g2-lec', 't1-lck', 0.35, 'East vs West, the big one'],
];
const INTL_EVENTS = new Set(['worlds', 'msi', 'fst', 'ewc', 'em']);

// ------------------------------------------------------------------ helpers
export function eventOf(c: Competition | undefined): string {
  if (!c) return 'domestic';
  const tags = c.tags ?? [];
  if (tags.includes('worlds') || c.id.startsWith('WORLDS')) return 'worlds';
  if (tags.includes('msi') || c.id === 'MSI') return 'msi';
  if (tags.includes('fst') || c.id === 'FST') return 'fst';
  if (tags.includes('ewc') || c.id === 'EWC') return 'ewc';
  if (tags.includes('emea_masters') || c.id.startsWith('EM-')) return 'em';
  if (c.id === 'KESPA') return 'kespa';
  if (c.kind === 'qualifier') return 'qualifier';
  return 'domestic';
}
export function stageOf(c: Competition | undefined, f: MatchFixture): StageKind {
  const stage = c?.stages.find((s) => s.id === f.stageId);
  const label = (f.label ?? '').replace(/\s*\(bye\)$/, '').trim();
  const name = stage?.name ?? '';
  if (/^(Grand )?Final$/.test(label)) return 'final';
  if (/Semifinal$|^Lower Final$|^Upper Final$/.test(label) && !/Upper Semifinal/.test(label)) return 'semi';
  if (/Quarterfinal|Upper Semifinal/.test(label)) return 'quarter';
  if (/Lower Round|Round of|Upper Round/.test(label)) return 'knockout';
  if (/Play-In/i.test(name)) return 'playin';
  if (stage?.format === 'swiss') return 'swiss';
  if (stage?.format === 'gsl' || stage?.format === 'groups' || /Group/i.test(name)) return 'groups';
  if (stage?.format === 'singleElim' || stage?.format === 'doubleElim') return 'knockout';
  if (c?.kind === 'playoffs') return 'knockout';
  return 'regular';
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** How much one team pulls viewers in, relative to a typical team of the event (≈1). */
export function teamPull(t: AudienceTeam, refFans: number): number {
  const fans = Math.max(500, t.fans);
  const f = Math.pow(fans / Math.max(1000, refFans), 0.42);
  return Math.min(2.4, f) * (0.88 + (t.hype ?? 50) / 420) * (0.9 + (t.prestige ?? 50) / 500);
}

// ------------------------------------------------------------------ the base number
export function audienceBase(a: AudienceInput): AudienceBase {
  const parts: { k: string; x: number }[] = [];
  const intl = INTL_EVENTS.has(a.event);
  let base = EVENT_BASE[a.event] ?? (a.leagueId && LEAGUE_BASE[a.leagueId]) ?? TIER_BASE[a.tier] ?? 1000;
  if (a.event === 'qualifier') base *= 1.15;
  if (a.event === 'domestic' && a.compName.includes('Cup')) base *= 0.9;
  parts.push({ k: 'event', x: base });
  const fam = a.event === 'worlds' ? 'worlds' : a.event === 'msi' ? 'msi' : intl || a.event === 'kespa' ? 'minor' : 'domestic';
  const st = STAGE_MULT[fam][a.stage] ?? 1;
  parts.push({ k: `stage:${a.stage}`, x: st });
  const bo = a.bestOf <= 1 && a.stage === 'regular' ? 0.9 : 1;
  if (bo !== 1) parts.push({ k: 'bo1', x: bo });
  // team draw: the bigger name carries the broadcast, the other still adds its own crowd
  const p0 = teamPull(a.teams[0], a.refFans), p1 = teamPull(a.teams[1], a.refFans);
  const draw = 0.62 * Math.max(p0, p1) + 0.38 * Math.min(p0, p1);
  parts.push({ k: 'draw', x: draw });
  // star power
  let star = 1;
  for (const s of a.stars) star += s.rep >= 92 ? 0.05 : s.rep >= 86 ? 0.03 : s.rep >= 80 ? 0.012 : 0;
  star += a.stars.filter((s) => s.fav).length * 0.03;
  star = Math.min(1.32, star);
  parts.push({ k: 'stars', x: star });
  const riv = 1 + a.rivalry * 0.8 * (a.stage === 'final' ? 0.5 : a.stage === 'semi' ? 0.75 : 1); // a final sells itself
  if (a.rivalry > 0) parts.push({ k: 'rivalry', x: riv });
  // series state: the deciding game is the most-watched of a series, game 1 still has people joining
  const need = Math.ceil(a.bestOf / 2);
  let ser = 1;
  if (a.bestOf > 1) {
    const mp = (a.wins[0] === need - 1 ? 1 : 0) + (a.wins[1] === need - 1 ? 1 : 0);
    if (a.gameNo === 1) ser = 0.93;
    else if (mp === 2) ser = a.bestOf >= 5 ? 1.32 : 1.2;
    else if (mp === 1) ser = 1.08 + (a.bestOf >= 5 ? 0.04 : 0);
    else ser = 1 + 0.02 * (a.gameNo - 1);
  }
  if (ser !== 1) parts.push({ k: 'series', x: ser });
  const lore = a.lore ? 1.1 : 1;
  if (lore !== 1) parts.push({ k: 'lore', x: lore });
  const noise = 0.94 + ((a.seed % 1000) / 1000) * 0.12;
  parts.push({ k: 'day', x: noise });
  // the bigger the stage, the less the matchup matters: everyone watches a Worlds final, whoever plays in it
  const m = draw * star * riv * lore;
  const k = MATCHUP_SENS[intl || a.event === 'kespa' ? 'intl' : 'domestic'][a.stage] ?? 1;
  const mm = Math.pow(m, k);
  if (k !== 1) parts.push({ k: `matchup^${k}`, x: mm / m });
  const raw = base * st * bo * mm * ser * noise;
  return { viewers: Math.round(softCap(raw)), raw, parts, input: a };
}
/** How strongly the matchup (draw × stars × rivalry) moves the number, per stage. */
const MATCHUP_SENS: Record<'intl' | 'domestic', Partial<Record<StageKind, number>>> = {
  intl: { regular: 0.8, groups: 0.8, playin: 0.8, swiss: 0.8, knockout: 0.6, quarter: 0.6, semi: 0.5, final: 0.45 },
  domestic: { knockout: 0.85, quarter: 0.85, semi: 0.8, final: 0.7 },
};
/** Very large audiences grow slower (there are only so many people awake). */
export function softCap(v: number): number {
  const K = 1_200_000;
  return v > K ? K + (v - K) * 0.4 : v;
}

// ------------------------------------------------------------------ from the save
function rivalryOf(state: GameState, a: Team, b: Team, event: string): { r: number; why?: string } {
  let r = 0, why: string | undefined;
  for (const [x, y, w, label] of RIVALS) if ((a.id === x && b.id === y) || (a.id === y && b.id === x)) { if (w > r) { r = w; why = label; } }
  // the world stage: LCK vs LPL is always box office, two teams of the same league meeting abroad a little less
  if (INTL_EVENTS.has(event)) {
    const ls = [a.leagueId, b.leagueId];
    if (ls.includes('LCK') && ls.includes('LPL') && r < 0.35) { r = 0.35; why = 'LCK vs LPL on the world stage'; }
    else if (ls.includes('LEC') && (ls.includes('LCK') || ls.includes('LPL')) && r < 0.15) { r = 0.15; why = 'East vs West'; }
  }
  // a fresh grudge: they met in a playoff series this season
  const met = Object.values(state.fixtures).filter((f) => f.result && ((f.teamA === a.id && f.teamB === b.id) || (f.teamA === b.id && f.teamB === a.id)));
  const big = met.filter((f) => { const c = state.competitions[f.competitionId]; const st = stageOf(c, f); return st === 'final' || st === 'semi' || st === 'quarter' || (c?.kind === 'playoffs' && st === 'knockout'); });
  if (big.length && r < 0.2) { r = Math.max(r, Math.min(0.2, 0.08 + 0.04 * big.length)); why ??= 'a playoff rematch'; }
  return { r: Math.min(1, r), why };
}

export interface AudienceFixtureOpts { gameNo?: number; games?: SeriesGame[]; blueId?: string }
/** Build the audience input of a fixture from the save. `games` = games already played in the series. */
export function audienceInput(state: GameState, f: MatchFixture, opts: AudienceFixtureOpts = {}): AudienceInput | null {
  const A = f.teamA ? state.teams[f.teamA] : undefined, B = f.teamB ? state.teams[f.teamB] : undefined;
  if (!A || !B) return null;
  const blueFirst = !opts.blueId || opts.blueId === A.id;
  const [t0, t1] = blueFirst ? [A, B] : [B, A];
  const c = state.competitions[f.competitionId];
  const event = eventOf(c);
  const tier = c?.tier ?? state.leagues[t0.leagueId]?.tier ?? 2;
  const intl = INTL_EVENTS.has(event);
  // the reference crowd: the event's own field at internationals, the league's teams domestically
  const field = intl && c?.teams.length ? c.teams.map((id) => state.teams[id]).filter(Boolean) : [];
  const pool = field.length >= 4 ? field : Object.values(state.teams).filter((t) => (intl ? (state.leagues[t.leagueId]?.tier ?? 3) === 1 : t.leagueId === (c?.leagueId ?? t0.leagueId)));
  const refFans = mean(pool.map((t) => t.fans)) || 100_000;
  const at = (t: Team): AudienceTeam => ({ id: t.id, short: t.short, leagueId: t.leagueId, region: t.region, fans: t.fans, hype: t.hype, prestige: t.prestige });
  const stars: { rep: number; fav: boolean }[] = [];
  for (const t of [t0, t1]) for (const pid of Object.values(t.lineup)) { const p = pid ? state.players[pid] : undefined; if (p) stars.push({ rep: p.reputation, fav: p.traits.includes('fan_favorite') }); }
  const games = opts.games ?? [];
  const wins: [number, number] = [games.filter((g) => g.winner === t0.id).length, games.filter((g) => g.winner === t1.id).length];
  const riv = rivalryOf(state, t0, t1, event);
  const lore = state.settings.loreRules !== false && ((t0.id === 't1-lck' && t1.leagueId === 'LPL') || (t1.id === 't1-lck' && t0.leagueId === 'LPL'));
  const stage = stageOf(c, f);
  return {
    event, compName: c?.name ?? 'Match day', tier, leagueId: c?.leagueId ?? (intl ? undefined : t0.leagueId), stage,
    stageLabel: f.label ?? c?.stages.find((s) => s.id === f.stageId)?.name ?? '', bestOf: f.bestOf, teams: [at(t0), at(t1)], refFans, stars,
    rivalry: riv.r, rivalryWhy: riv.why, gameNo: opts.gameNo ?? games.length + 1, wins, lore, seed: hashString(f.id + ':' + (opts.gameNo ?? games.length + 1)),
  };
}

// ------------------------------------------------------------------ live swings
/** Excitement added by a game event (share of the base audience). */
function eventBoost(e: GameEvent): number {
  switch (e.type) {
    case 'firstBlood': return 0.025;
    case 'kill': return /SHUTDOWN/.test(e.text) ? 0.02 : 0.009;
    case 'ace': return 0.06;
    case 'baron': return 0.05;
    case 'elder': return 0.07;
    case 'steal': return 0.1;
    case 'soul': return 0.04;
    case 'inhib': return 0.025;
    case 'teamfight': return 0.02;
    case 'ult': return e.important ? 0.012 : 0;
    case 'info': return /refuses to fall/.test(e.text) ? 0.08 : /go for the end|backdoor|Surprise Baron|sneak Baron/.test(e.text) ? 0.05 : 0;
    default: return 0;
  }
}

export interface LiveSample { t: number; gold: number; winner: 0 | 1 | null; nexus: [number, number] }
/**
 * In-game audience: people keep trickling in for the first minutes, big moments spike the number (fights,
 * Baron, steals, base races; multi-kills on top), stomps bleed viewers and a close late game pulls people in.
 * Feed it new events and a sample of the game state; it works in game time (any playback speed).
 */
export class AudienceTracker {
  excite = 0;
  bleed = 0;
  peak = 0;
  viewers = 0;
  private lastT = 0;
  private kills: number[] = [];
  private nexusPrev: [number, number] | null = null;
  private raceT = -999;
  constructor(public base: AudienceBase) { this.viewers = Math.round(softCap(base.raw * 0.86)); }

  onEvent(e: GameEvent) {
    let b = eventBoost(e);
    if (e.type === 'kill' || e.type === 'firstBlood') {
      this.kills = this.kills.filter((t) => e.t - t < 12);
      this.kills.push(e.t);
      if (this.kills.length >= 3) b += 0.012 * (this.kills.length - 2); // a teamfight, not a pick
      if (this.kills.length === 4) b += 0.03;
      if (this.kills.length === 5) b += 0.07;
    }
    this.excite = Math.min(0.5, this.excite + b * (1 - this.excite));
  }

  /** Advance to the sample's game time and return the viewer count (raid = extra viewers dropped in). */
  update(s: LiveSample, raid = 0): number {
    const dt = Math.max(0, s.t - this.lastT);
    this.lastT = s.t;
    // base races: both Nexuses taking damage
    if (this.nexusPrev) {
      const hit0 = s.nexus[0] < this.nexusPrev[0] - 1, hit1 = s.nexus[1] < this.nexusPrev[1] - 1;
      if ((hit0 || hit1) && s.t - this.raceT > 20) { this.raceT = s.t; this.excite = Math.min(0.5, this.excite + (hit0 && hit1 ? 0.1 : 0.04)); }
    }
    this.nexusPrev = [s.nexus[0], s.nexus[1]];
    // excitement fades (half-life ~80 s of game time), stomps bleed, close games late hold people
    this.excite *= Math.pow(0.5, dt / 80);
    const g = Math.abs(s.gold), min = s.t / 60;
    if (min > 17 && g > 6000) this.bleed = Math.min(0.28, this.bleed + (dt / 60) * 0.006 * Math.min(3, g / 6000));
    else this.bleed = Math.max(0, this.bleed - (dt / 60) * 0.01);
    const close = min > 24 && g < 3500 ? 0.07 * Math.min(1, (min - 24) / 10) : 0;
    const ramp = 0.86 + 0.14 * Math.min(1, s.t / 540);
    const v = softCap(this.base.raw * ramp * (1 + this.excite + close) * (1 - this.bleed)) + raid;
    this.viewers = Math.round(v);
    if (this.viewers > this.peak) this.peak = this.viewers;
    return this.viewers;
  }
}

/** Round a live count the way a stream shows it. */
export function roundViewers(n: number): number {
  if (n < 1000) return Math.max(0, Math.round(n));
  if (n < 100_000) return Math.round(n / 10) * 10;
  return Math.round(n / 100) * 100;
}
/** 847 · 8.7k · 87.3k · 873k · 1.24M */
export function fmtViewers(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)));
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(2)}M`;
}
