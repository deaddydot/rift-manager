// The caster desk's brain (no React): watches the match sim and writes subtitle lines for a desk of two casters
// (play-by-play + colour), or one caster on a solo desk. Reads new sim events (kills, fights, objectives, towers,
// ultimates, flashes, team calls), the game state (gold graph, timers, team plans and objective stances, Nexus HP)
// and the broadcast context from the save (season stats, form, titles, comfort, pick notes, head-to-head, lore).
//
// Pacing is in real time: one line on screen at a time, sized to its length, a priority queue where stale low-priority
// moments expire and big moments cut in. Quiet stretches get colour (analysis, storylines, opinions, banter). At 16×+
// the desk switches to recap mode: events are folded into one bigger "here's what happened" line.
import type { MatchSim } from '../../../engine/sim/engine';
import type { GameEvent, SimChamp } from '../../../engine/sim/simtypes';
import { DRAGON_PIT, BARON_PIT, NEXUS, MAP_SIZE, nearestLane, laneDistance, dist, type Vec } from '../../../engine/sim/map';
import { DRAGON_LABEL } from '../../../engine/sim/constants';
import { matchupEdge } from '../../../data/gamedata';
import type { Ctx } from '../../../engine/management/fans';
import { RNG, hashString } from '../../../util/rng';
import { CASTERS, CASTER_POOLS, SHARED, PUNS, RECAP_EN, RECAP_VI, VI, DESKS, type CasterId, type DeskDef, type Tpl } from './castersData';
import type { BroadcastCtx, PlayerInfo } from './context';
import { eventOf } from './audience';
import type { GameState, MatchFixture } from '../../../engine/types';
import { WEIRD, COMFORT_LABEL, type PickNote, type ComfortTier } from './picks';

export interface SubLine {
  id: number; caster: CasterId; name: string; initials: string; color: string; lang: 'en' | 'vi';
  text: string; gloss?: string; cat: string; t: number; pri: number; at: number; dur: number;
}
type Who = 'pbp' | 'colour' | 'any';
interface Moment {
  cat: string; who: Who; pri: number; t: number; real: number; expReal: number; expSim: number;
  ctx: () => Ctx | null; key?: string; caster?: CasterId; follow?: Omit<Moment, 'real' | 'expReal' | 'expSim' | 't'>; notBefore?: number;
}
interface Fight { id: number; start: number; last: number; pos: Vec; kills: { t: number; side: 0 | 1; killer?: number; victim?: number; assists: number[] }[]; gold0: number }
interface Digest { kills: [number, number]; fights: { side: 0 | 1; kw: number; kl: number }[]; objs: { side: 0 | 1; obj: string; objvi: string; w: number }[]; towers: [number, number] }

const VI_TIER: Record<ComfortTier, string> = { unfamiliar: 'gần như chưa chơi tướng này', learning: 'vẫn đang làm quen', comfortable: 'khá thoải mái', mastered: 'đã thành thạo', signature: 'tướng tủ' };
const VI_FORM: Record<string, string> = { 'red-hot': 'cực kỳ sung', 'in great form': 'có phong độ rất cao', 'in decent form': 'có phong độ ổn', steady: 'thi đấu ổn định', 'a little off the pace': 'hơi chững lại', struggling: 'gặp khó khăn', 'ice cold': 'sa sút' };
const VI_RIVAL: Record<string, string> = {
  'the LCK’s marquee rivalry': 'trận kình địch lớn nhất LCK', 'the Telecom War': 'trận Telecom War', 'a storied LCK rivalry': 'một cặp kình địch lâu năm của LCK',
  'a heavyweight LCK clash': 'cuộc đụng độ giữa hai ông lớn LCK', 'a classic LCK matchup': 'một cặp đấu kinh điển của LCK', 'a Worlds-final rematch': 'màn tái đấu chung kết thế giới',
  'LCK vs LPL royalty': 'cuộc đối đầu giữa các ông lớn LCK và LPL', 'the European derby': 'trận derby châu Âu', 'North America’s oldest rivalry': 'cặp kình địch lâu đời nhất Bắc Mỹ',
  'an LCS grudge match': 'một trận ân oán của LCS', 'Brazil’s biggest rivalry': 'cặp kình địch lớn nhất Brazil', 'the Vietnamese derby': 'trận derby Việt Nam',
  'an LPL heavyweight clash': 'cuộc đụng độ giữa hai ông lớn LPL', 'East vs West, the big one': 'cuộc chiến Đông - Tây', 'LCK vs LPL on the world stage': 'LCK đối đầu LPL trên đấu trường thế giới',
  'East vs West': 'cuộc chiến Đông - Tây', 'a playoff rematch': 'màn tái đấu playoffs',
};
const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const FALLBACK: Record<string, string> = {
  kill_solo: 'kill', kill_gank: 'kill', kill_ult: 'kill', dragon_soulpt: 'dragon', tower_first: 'tower', comfort_perf: 'stats_game', open_reply: 'draft_read',
  player_titles: 'player_intro', pkm_good: 'stats_game', baron_after: 'opinion_ahead',
};
const TIMELY = new Set(['drake_timer', 'baron_timer', 'flash_down', 'jungle', 'banter', 'hype', 'level_gap']);
const KILL_CATS = new Set(['fb', 'kill', 'kill_solo', 'kill_gank', 'kill_ult', 'shutdown', 'double', 'triple', 'quadra', 'penta']);
/** fans.fill(), except an empty string is a valid value (optional bits like the stage name). */
function fill(tpl: string, ctx: Ctx): string | null {
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const upper = k.length > 1 && k === k.toUpperCase() && k !== k.toLowerCase();
    let v = ctx[k];
    if (v === undefined && upper) { const key = Object.keys(ctx).find((x) => x.toLowerCase() === k.toLowerCase()); v = key ? ctx[key] : undefined; }
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) { ok = false; return ''; }
    return upper ? String(v).toUpperCase() : String(v);
  });
  return ok ? out.replace(/\s+([,.!?])/g, '$1').trim() : null;
}
/** 1.2 million · 87 thousand · 640 */
export function spokenViewers(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} million`;
  if (n >= 10_000) return `${Math.round(n / 1000)} thousand`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')} thousand`;
  return String(Math.round(n / 10) * 10);
}
export function spokenViewersVi(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',')} triệu`;
  if (n >= 10_000) return `${Math.round(n / 1000)} nghìn`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} nghìn`;
  return String(Math.round(n / 10) * 10);
}
const k1 = (n: number) => `${(Math.abs(n) / 1000).toFixed(1)}k`;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Which desk calls this match: Settings choice, or by the competition (VCS / Vietnamese teams → Hoàng Luân). */
/** The desk "Auto" would pick for a fixture before the game exists (match center pre-game picker). */
export function autoDeskFor(state: GameState, f: MatchFixture): DeskDef {
  const c = state.competitions[f.competitionId];
  const teams = [f.teamA, f.teamB].map((id) => state.teams[id ?? '']).filter(Boolean);
  const vnTeams = teams.filter((t) => t.country === 'Vietnam' || t.leagueId === 'VCS').length;
  const bc = { fixtureId: f.id, event: eventOf(c), leagueId: c?.leagueId, teams: teams.map((t) => ({ region: t.region })), vnTeams, vn: vnTeams > 0 || c?.leagueId === 'VCS' || state.teams[state.userTeamId]?.country === 'Vietnam' };
  return pickDesk(bc as unknown as BroadcastCtx, 'auto');
}

export function pickDesk(bc: BroadcastCtx, pref: string = 'auto'): DeskDef {
  if (pref !== 'auto') { const d = DESKS.find((x) => x.id === pref); if (d) return d; }
  const r = (hashString(bc.fixtureId + ':desk') % 1000) / 1000;
  const intl = ['worlds', 'msi', 'fst', 'ewc'].includes(bc.event);
  const eu = bc.leagueId === 'LEC' || bc.event === 'em' || (!intl && bc.teams.every((t) => t.region === 'EMEA'));
  if (bc.vn) {
    if (r < 0.78) return DESKS.find((d) => d.id === (bc.leagueId === 'VCS' || bc.vnTeams >= 2 ? 'vn' : 'vnduo'))!;
    return DESKS.find((d) => d.id === (r < 0.9 ? 'intl' : 'wit'))!;
  }
  if (eu) return DESKS.find((d) => d.id === (r < 0.75 ? 'eu' : 'wit'))!;
  if (intl) return DESKS.find((d) => d.id === (r < 0.6 ? 'intl' : r < 0.85 ? 'wit' : 'eu'))!;
  return DESKS.find((d) => d.id === (r < 0.7 ? 'intl' : 'wit'))!;
}

function placeOf(p: Vec | undefined): [string, string] {
  if (!p) return ['on the map', 'trên bản đồ'];
  if (dist(p, DRAGON_PIT) < 1900) return ['at the dragon pit', 'ở hang Rồng'];
  if (dist(p, BARON_PIT) < 1900) return ['at the Baron pit', 'ở hang Baron'];
  if (dist(p, NEXUS[0]) < 3600) return ['in the blue base', 'ngay trong nhà xanh'];
  if (dist(p, NEXUS[1]) < 3600) return ['in the red base', 'ngay trong nhà đỏ'];
  const lane = nearestLane(p);
  if (laneDistance(lane, p) < 900) return [`in the ${lane} lane`, `ở ${VI.lane[lane]}`];
  const s = p.x + p.y - MAP_SIZE;
  if (Math.abs(s) < 1500) return ['in the river', 'dưới lòng sông'];
  return s < 0 ? ['in the blue-side jungle', 'trong khu rừng phía xanh'] : ['in the red-side jungle', 'trong khu rừng phía đỏ'];
}

export class Commentary {
  private rng: RNG;
  private seq = 1;
  private idx = 0;
  private now = 0;
  private lastNow = 0;
  private lastSimT = 0;
  private rate = 8;
  private pausedFor = 0;
  private queue: Moment[] = [];
  private busyUntil = 0;
  private lastEnd = 0;
  private lastLineSim = -999;
  private lastSpeaker: CasterId | null = null;
  private used = new Map<string, number>();
  private topicAt = new Map<string, number>();
  private once = new Set<string>();
  private fight: Fight | null = null;
  private fightSeq = 0;
  private chain = new Map<number, number[]>();
  private items = new Map<number, number>();
  private plans: [string, string] = ['', ''];
  private stances: [string, string] = ['', ''];
  private maxLead: [number, number] = [0, 0];
  private goldMark = 0;
  private nexusPrev: [number, number];
  private nexusHitAt: [number, number] = [-999, -999];
  private nexusSaid = -999;
  private raceSaid = -999;
  private fightCheckAt = 0;
  private fightSaid = -999;
  private digest: Digest = { kills: [0, 0], fights: [], objs: [], towers: [0, 0] };
  private ended = false;
  private started = false;
  private fbDone = false;
  private lastBig = -999;
  private lastFlashPlayer = -1;
  private saidPlayer = new Map<string, number>();
  current: SubLine | null = null;
  previous: SubLine | null = null;
  transcript: SubLine[] = [];
  /** keep every line (headless scripts); the UI only needs current/previous */
  keepTranscript = false;
  mode: 'normal' | 'recap' = 'normal';

  /** live viewer count (the stream chat's), for the occasional "N watching" line */
  viewers?: () => number;
  constructor(private sim: MatchSim, private bc: BroadcastCtx, readonly desk: DeskDef, seed = Date.now()) {
    this.rng = new RNG(hashString(bc.fixtureId + ':' + bc.gameNo + ':' + seed));
    this.nexusPrev = [sim.nexusHp[0], sim.nexusHp[1]];
  }
  /** Joining a game already under way (desk changed mid-game): no welcome / draft intro. */
  skipIntro() { this.started = true; }
  get solo() { return this.desk.pbp === this.desk.colour; }
  get casters(): CasterId[] { return this.solo ? [this.desk.pbp] : [this.desk.pbp, this.desk.colour]; }

  // ------------------------------------------------------------------ helpers
  private pl(i?: number): PlayerInfo | undefined { return i === undefined ? undefined : this.bc.players[i]; }
  private ch(i?: number): SimChamp | undefined { return i === undefined ? undefined : this.sim.champs[i]; }
  private short(side: 0 | 1) { return this.bc.teams[side].short; }
  private gold(side: 0 | 1) { let g = 0; for (const c of this.sim.champs) if (c.side === side) g += c.goldEarned; return g; }
  private lead() { return this.gold(0) - this.gold(1); }
  private ultOf(c?: SimChamp) { return c?.champ.abilities.find((a) => a.slot === 'R')?.name; }
  private kda(c?: SimChamp) { return c ? `${c.kills}/${c.deaths}/${c.assists}` : undefined; }
  private seriesLine(): [string, string] {
    const b = this.bc, [a, c] = b.wins, g = b.gameNo;
    if (b.bestOf <= 1) return ['a best-of-one', 'một trận Bo1 duy nhất'];
    if (g === 1) return [`game one of a best-of-${b.bestOf}`, `ván 1 của loạt Bo${b.bestOf}`];
    if (a === b.need - 1 && c === b.need - 1) return [`game ${g}, and it all comes down to this`, `ván ${g} — ván đấu quyết định`];
    if (a === c) return [`game ${g}, the series level at ${a}-${c}`, `ván ${g}, tỷ số đang là ${a}-${c}`];
    const l = a > c ? 0 : 1;
    return [`game ${g}, ${this.short(l)} lead ${Math.max(a, c)}-${Math.min(a, c)}`, `ván ${g}, ${this.short(l)} đang dẫn ${Math.max(a, c)}-${Math.min(a, c)}`];
  }
  private seriesAfter(w: 0 | 1): [string, string] {
    const b = this.bc;
    if (b.bestOf <= 1) return ['What a win.', 'Một chiến thắng xứng đáng!'];
    const s: [number, number] = [b.wins[0] + (w === 0 ? 1 : 0), b.wins[1] + (w === 1 ? 1 : 0)];
    const t = this.short(w);
    if (s[w] >= b.need) return [`${t} win the series ${s[w]}-${s[1 - w]}!`, `${t} thắng chung cuộc ${s[w]}-${s[1 - w]}!`];
    if (s[0] === s[1]) return [`The series is level at ${s[0]}-${s[1]}.`, `Tỷ số loạt trận là ${s[0]}-${s[1]}.`];
    const l = s[0] > s[1] ? 0 : 1;
    return [`${this.short(l)} lead the series ${s[l]}-${s[1 - l]}.`, `${this.short(l)} dẫn ${s[l]}-${s[1 - l]} trong loạt trận.`];
  }
  /** Slots every line can use. */
  private base(): Ctx {
    const b = this.bc, sim = this.sim, lead = this.lead();
    const [sl, slvi] = this.seriesLine();
    const st = b.stage !== 'regular' && b.stageLabel ? ` ${b.stageLabel}` : '';
    const leader = lead >= 0 ? 0 : 1;
    return {
      t0: b.teams[0].short, t1: b.teams[1].short, tn0: b.teams[0].name, tn1: b.teams[1].name, comp: b.comp, stagep: st ? ` —${st}` : '', stagevi: st ? ` —${st}` : '',
      gameno: b.gameNo, bo: b.bestOf, seriesline: sl, seriesvi: slvi, Seriesline: sl[0].toUpperCase() + sl.slice(1), Seriesvi: slvi[0].toUpperCase() + slvi.slice(1), mins: Math.max(1, Math.floor(sim.t / 60)), time: mmss(sim.t),
      k0: sim.teams[0].kills, k1: sim.teams[1].kills, kl0: sim.teams[0].kills, kl1: sim.teams[1].kills,
      lead: k1(lead), leader: this.short(leader as 0 | 1), trailer: this.short((1 - leader) as 0 | 1), gold: k1(lead), patch: b.patch || undefined,
      fav: this.short(b.fav), dog: this.short((1 - b.fav) as 0 | 1), rivalry: b.rivalry, rivalryvi: b.rivalry ? VI_RIVAL[b.rivalry] ?? b.rivalry : undefined,
    };
  }
  private sideCtx(side: 0 | 1): Ctx {
    return { team: this.short(side), oteam: this.short((1 - side) as 0 | 1), tname: this.bc.teams[side].name };
  }
  private playerCtx(p: PlayerInfo | undefined, prefix = ''): Ctx {
    if (!p) return {};
    const c = this.ch(p.idx);
    const o: Ctx = {
      p: p.name, pc: p.champ, skda: p.sg ? p.skda : undefined, sg: p.sg || undefined, mvps: p.sg ? p.mvps : undefined, formw: p.formWord, formvi: VI_FORM[p.formWord],
      kpg: p.sg ? p.kpg : undefined, titles: p.titles.length || undefined, lasttitle: p.titles[p.titles.length - 1], rings: p.rings || undefined,
      titlesw: p.titles.length ? (p.titles.length === 1 ? 'a title' : `${p.titles.length} titles`) : undefined,
      ringsw: p.rings ? (p.rings === 1 ? 'a World Championship' : `${['', 'one', 'two', 'three', 'four', 'five', 'six'][p.rings] ?? p.rings} World Championships`) : undefined,
      kda: this.kda(c), cs: c?.cs, cspm: c ? (c.cs / Math.max(1, this.sim.t / 60)).toFixed(1) : undefined, cg: p.cg >= 2 ? p.cg : undefined, crec: p.cg >= 2 ? `${p.cw}-${p.cg - p.cw}` : undefined,
      comfort: Math.round(p.comfort), tierw: COMFORT_LABEL[p.tier], tiervi: VI_TIER[p.tier], role: p.role === 'adc' ? 'bot' : p.role, rolevi: VI.role[p.role],
      ...this.sideCtx(p.side),
    };
    if (!prefix) return o;
    const out: Ctx = {};
    for (const [k, v] of Object.entries(o)) out[prefix + k] = v;
    return out;
  }
  private killCtx(e: GameEvent): Ctx {
    const k = this.ch(e.killer), v = this.ch(e.victim);
    const kp = this.pl(e.killer), vp = this.pl(e.victim);
    const side = (e.side ?? k?.side ?? 0) as 0 | 1;
    const lane = v ? nearestLane(v.pos) : 'mid';
    const helper = e.assists?.length ? this.ch(e.assists[0])?.input.name : undefined;
    const jg = e.assists?.map((i) => this.ch(i)).find((c) => c?.role === 'jungle')?.input.name ?? (k?.role === 'jungle' ? k.input.name : undefined);
    const ultRecent = this.sim.ultFx.find((u) => u.idx === e.killer && e.t - u.t < 3.5);
    return {
      ...this.sideCtx(side), ...this.playerCtx(kp), v: vp?.name ?? v?.input.name, vc: v?.champ.name, vkda: this.kda(v),
      lane, lanevi: VI.lane[lane], helper, ka: e.assists?.length ?? 0, jg, ult: ultRecent?.name, ULT: ultRecent?.name?.toUpperCase(), streak: v ? Math.max(3, v.killStreak) : undefined,
    };
  }

  // ------------------------------------------------------------------ queueing
  private push(m: Omit<Moment, 'real' | 'expReal' | 'expSim' | 't'> & { t?: number; ttlReal?: number; ttlSim?: number }) {
    const t = m.t ?? this.sim.t;
    const ttlReal = m.ttlReal ?? (m.pri >= 4 ? 9000 : m.pri >= 3 ? 6500 : m.pri >= 2 ? 4800 : 3500);
    const ttlSim = m.ttlSim ?? (m.pri >= 4 ? 200 : m.pri >= 3 ? 70 : 40);
    const full: Moment = { ...m, t, real: this.now, expReal: this.now + ttlReal, expSim: t + ttlSim };
    if (m.key) this.queue = this.queue.filter((q) => q.key !== m.key);
    this.queue.push(full);
    if (this.queue.length > 40) { this.queue.sort((a, b) => b.pri - a.pri); this.queue.length = 30; }
  }
  private cool(topic: string, secs: number): boolean {
    const at = this.topicAt.get(topic);
    if (at !== undefined && this.sim.t - at < secs) return false;
    this.topicAt.set(topic, this.sim.t);
    return true;
  }

  // ------------------------------------------------------------------ lines
  private poolFor(c: CasterId, cat: string): readonly Tpl[] | undefined {
    const def = CASTERS[c];
    const own = CASTER_POOLS[c][cat];
    if (def.lang === 'vi') return own;
    const shared = SHARED[cat];
    if (own?.length && shared?.length) return this.rng.chance(def.own) ? own : shared;
    return own?.length ? own : shared;
  }
  private line(c: CasterId, cat: string, ctx: Ctx, strict = false): { text: string; gloss?: string; tpl: string } | null {
    let pool = this.poolFor(c, cat);
    if (!pool?.length && FALLBACK[cat]) pool = this.poolFor(c, FALLBACK[cat]);
    if (!pool?.length) return null;
    // English casters: if their own pool is exhausted, the shared one may still have fresh lines (and vice versa)
    if (CASTERS[c].lang === 'en') {
      const other = pool === SHARED[cat] ? CASTER_POOLS[c][cat] : SHARED[cat];
      if (other?.length && pool.every((t) => this.used.has(String(t)))) pool = other;
    }
    const partner = this.casters.find((x) => x !== c);
    const full: Ctx = { ...this.base(), ...ctx, partner: partner ? CASTERS[partner].name : undefined, me: CASTERS[c].name };
    // unused templates first, then the least recently used
    const order = [...pool].sort((a, b) => (this.used.get(String(a)) ?? -1e9) - (this.used.get(String(b)) ?? -1e9) || this.rng.next() - 0.5);
    const fresh = order.filter((t) => !this.used.has(String(t)));
    // quiet-moment lines must be fresh; event calls may repeat, but not within two minutes
    const stale = order.filter((t) => this.sim.t - (this.used.get(String(t)) ?? -1e9) > 120);
    const tries = strict ? this.rng.shuffle(fresh) : fresh.length ? this.rng.shuffle(fresh).concat(stale) : stale.length ? stale : order;
    for (const t of tries) {
      if (Array.isArray(t)) {
        const vi = fill(t[0], full), en = fill(t[1], full);
        if (vi && en) { this.used.set(String(t), this.sim.t); return { text: vi, gloss: en, tpl: String(t) }; }
      } else {
        const en = fill(t as string, full);
        if (en) { this.used.set(String(t), this.sim.t); return { text: en, tpl: String(t) }; }
      }
    }
    return null;
  }
  private casterFor(m: Moment): CasterId {
    if (m.caster) return m.caster;
    if (m.who === 'pbp') return this.desk.pbp;
    if (m.who === 'colour') return this.desk.colour;
    if (this.solo) return this.desk.pbp;
    return this.lastSpeaker === this.desk.pbp ? this.desk.colour : this.desk.pbp;
  }
  private emit(c: CasterId, cat: string, text: string, gloss: string | undefined, pri: number): SubLine {
    const def = CASTERS[c];
    const len = Math.max(text.length, gloss ? gloss.length * 0.55 : 0);
    const speedF = this.rate >= 32 ? 0.62 : this.rate >= 16 ? 0.72 : this.rate >= 8 ? 0.88 : 1;
    const dur = Math.round(Math.min(7200, Math.max(2300, 1300 + 54 * len)) * speedF);
    const l: SubLine = { id: this.seq++, caster: c, name: def.name, initials: def.initials, color: def.color, lang: def.lang, text, gloss, cat, t: this.sim.t, pri, at: this.now, dur };
    if (this.current) this.previous = this.current;
    this.current = l;
    this.busyUntil = this.now + dur;
    this.lastEnd = this.busyUntil;
    this.lastLineSim = this.sim.t;
    this.lastSpeaker = c;
    if (this.keepTranscript) this.transcript.push(l);
    else { this.transcript.push(l); if (this.transcript.length > 60) this.transcript.splice(0, this.transcript.length - 60); }
    return l;
  }
  private speak(m: Moment, strict = false): SubLine | null {
    const ctx = m.ctx();
    if (!ctx) return null;
    const c = this.casterFor(m);
    const out = this.line(c, m.cat, ctx, strict);
    if (!out) {
      // the other caster may have a line for it
      const alt = m.caster ? undefined : this.casters.find((x) => x !== c);
      const o2 = alt ? this.line(alt, m.cat, ctx, strict) : null;
      if (!o2 || !alt) return null;
      return this.finish(alt, m, o2, ctx);
    }
    return this.finish(c, m, out, ctx);
  }
  private finish(c: CasterId, m: Moment, out: { text: string; gloss?: string }, ctx: Ctx): SubLine {
    let text = out.text, gloss = out.gloss;
    // Quickshot can't resist a pun on the champion who got the kill
    if (c === 'quickshot' && KILL_CATS.has(m.cat) && typeof ctx.champId === 'string' && PUNS[ctx.champId] && this.rng.chance(0.5)) {
      const pun = this.rng.pick(PUNS[ctx.champId]);
      const p = fill(pun, { ...this.base(), ...ctx });
      if (p && !this.used.has(pun) && text.length < 110) { text += ' ' + p; this.used.set(pun, this.sim.t); }
    }
    const l = this.emit(c, m.cat, text, gloss, m.pri);
    if (m.follow) {
      const f = m.follow;
      this.push({ ...f, notBefore: this.now + 150, ttlReal: 9000, ttlSim: 120 });
    }
    if (m.pri >= 3.8) this.lastBig = this.sim.t;
    return l;
  }

  // ------------------------------------------------------------------ the game start
  private pregame() {
    this.started = true;
    const b = this.bc;
    const P = { ttlSim: 260, ttlReal: 30000 };
    this.push({ cat: 'open', who: 'pbp', pri: 3, ctx: () => ({}), ...P, follow: this.solo ? undefined : { cat: 'open_reply', who: 'colour', pri: 3, ctx: () => ({}) } });
    if (b.wins[0] === b.need - 1 || b.wins[1] === b.need - 1 || b.final) this.push({ cat: 'stakes', who: 'any', pri: 2.6, ctx: () => ({}), ...P });
    if (b.lore) this.push({ cat: 'lore', who: 'any', pri: 2.5, ctx: () => ({ t1: b.lore!.t1, lpl: b.lore!.lpl }), ...P });
    // the draft read: identities and win conditions
    const side = this.rng.chance(0.5) ? 0 : 1;
    this.push({ cat: 'draft_read', who: 'colour', pri: 2.4, ctx: () => this.draftCtx(side as 0 | 1), ...P });
    // pick notes: the 2-3 most interesting picks
    let n = 0;
    for (const note of this.headline()) {
      const cat = this.pickCat(note);
      if (!cat || n >= 3) continue;
      n++;
      this.push({ cat, who: cat === 'pk_troll' ? 'pbp' : n % 2 ? 'colour' : 'any', pri: 2.3 - n * 0.05, ctx: () => { this.once.add(`pk:${note.idx}`); return this.pickCtx(note); }, key: `pick:${note.idx}`, ...P });
    }
    if (b.h2h.length && this.rng.chance(0.75)) this.push({ cat: 'h2h', who: 'colour', pri: 2.1, ctx: () => this.h2hCtx(), ...P });
    const star = [...b.players].sort((x, y) => y.reputation + y.form * 2 - (x.reputation + x.form * 2))[0];
    if (star && star.sg >= 3) this.push({ cat: star.titles.length >= 2 && this.rng.chance(0.5) ? 'player_titles' : 'player_intro', who: 'colour', pri: 2, ctx: () => this.playerCtx(star), ...P });
  }
  private headline(): PickNote[] {
    const out: PickNote[] = [], seen = new Set<number>(), cats = new Set<string>();
    for (const n of this.bc.picks.notes) {
      const cat = this.pickCat(n);
      if (n.weight < 0.33 || seen.has(n.idx) || !cat) continue;
      if (cats.has(cat) && n.weight < 0.9) continue;
      seen.add(n.idx); cats.add(cat); out.push(n);
      if (out.length >= 4) break;
    }
    return out;
  }
  private pickCat(n: PickNote): string | null {
    switch (n.kind) {
      case 'troll': return 'pk_troll';
      case 'offrole': case 'offmeta': return 'pk_weird';
      case 'signature': case 'onetrick': case 'hotrecord': return 'pk_comfort';
      case 'legacy': return 'pk_legacy';
      case 'lowcomfort': case 'first': case 'coldrecord': return 'pk_unfamiliar';
      case 'counter': return n.role === 'jungle' ? 'pk_counter_jg' : 'pk_counter';
      case 'revenge': case 'lostlast': return 'pk_revenge';
      case 'buffed': case 'nerfed': return 'pk_patch';
      case 'fearless': return 'pk_fearless';
      default: return null;
    }
  }
  private pickCtx(n: PickNote): Ctx {
    const p = this.pl(n.idx >= 0 ? n.idx : undefined);
    const x = n.ctx;
    const buff = n.kind === 'buffed';
    return {
      ...(p ? this.playerCtx(p) : this.sideCtx(n.side)), prate: x.prate, mainrole: x.mainrole, opp: x.opp, oppc: x.oppchamp,
      lastvs: x.lastvs, lastkda: x.lastkda, buffnerf: n.kind === 'buffed' || n.kind === 'nerfed' ? (buff ? 'buffed' : 'nerfed') : undefined,
      buffnerfvi: n.kind === 'buffed' || n.kind === 'nerfed' ? (buff ? 'được tăng sức mạnh' : 'bị giảm sức mạnh') : undefined,
      locked: x.locked, gameno: x.gameno ?? this.bc.gameNo, crec: x.rec ?? (p && p.cg >= 2 ? `${p.cw}-${p.cg - p.cw}` : undefined), cg: p && p.cg >= 2 ? p.cg : undefined,
    };
  }
  private draftCtx(side: 0 | 1): Ctx {
    const sty = (s: 0 | 1) => {
      const cs = this.sim.champs.filter((c) => c.side === s).map((c) => c.champ.profile);
      const avg = (k: keyof (typeof cs)[0]) => cs.reduce((a, p) => a + (p[k] as number), 0) / Math.max(1, cs.length);
      const early = avg('early'), late = avg('late');
      const traits: [string, number, string, string][] = [
        ['engage', avg('engage'), 'hard engage', 'lao vào'], ['poke', avg('poke'), 'poke and siege', 'cấu rỉa'], ['splitpush', avg('splitpush'), 'split-push', 'đẩy lẻ'],
        ['pick', avg('pick'), 'pick-off', 'bắt lẻ'], ['teamfight', avg('teamfight') - 0.6, 'five-man teamfight', 'giao tranh tổng'],
      ];
      traits.sort((a, b) => b[1] - a[1]);
      const t = traits[0];
      const phase = early - late >= 0.8 ? ['an early-game', ' mạnh đầu trận'] : late - early >= 0.8 ? ['a scaling', ' mạnh cuối trận'] : ['a', ''];
      return { en: `${phase[0]} ${t[2]} comp`, vi: `đội hình ${t[3]}${phase[1]}`, early, late };
    };
    const a = sty(side), o = sty((1 - side) as 0 | 1);
    const carry = this.sim.champs.filter((c) => c.side === side).sort((x, y) => (y.champ.profile.dps + y.champ.profile.late + y.champ.profile.burst) - (x.champ.profile.dps + x.champ.profile.late + x.champ.profile.burst))[0];
    const jg = this.sim.champs.find((c) => c.side === side && c.role === 'jungle');
    const early = a.early - a.late >= 0.8;
    const wincon = early && jg ? `to snowball early through ${jg.input.name}’s ${jg.champ.name}` : carry ? `to get ${carry.input.name}’s ${carry.champ.name} to two items` : 'to win the big fights';
    const winconvi = early && jg ? `lăn cầu tuyết từ sớm qua ${jg.champ.name} của ${jg.input.name}` : carry ? `đưa ${carry.champ.name} của ${carry.input.name} lên hai món đồ` : 'thắng các pha giao tranh lớn';
    return { ...this.sideCtx(side), tstyle: a.en, ostyle: o.en, tstylevi: a.vi, ostylevi: o.vi, wincon, winconvi, carry: carry?.input.name, carryc: carry?.champ.name };
  }
  private h2hCtx(): Ctx | null {
    const h = this.bc.h2h[this.bc.h2h.length - 1];
    if (!h) return null;
    const loser = h.w === this.short(0) ? this.short(1) : this.short(0);
    const wins = this.bc.h2h.filter((x) => x.w === h.w).length;
    return { h2hline: `${h.w} won ${h.score} in the ${h.comp}`, h2hlinevi: `${h.w} thắng ${h.score} tại ${h.comp}`, loser, h2hw: `${h.w} lead the meetings ${wins}-${this.bc.h2h.length - wins}`, h2hn: this.bc.h2h.length };
  }

  // ------------------------------------------------------------------ events
  private onEvent(e: GameEvent) {
    const sim = this.sim;
    const recap = this.mode === 'recap';
    const side = e.side as 0 | 1 | undefined;
    switch (e.type) {
      case 'firstBlood': case 'kill': {
        if (side === undefined) return;
        this.trackFight(e);
        this.digest.kills[side]++;
        const ctx = this.killCtx(e);
        const champId = this.ch(e.killer)?.champ.id;
        // multi-kills by the same killer within 10 s
        if (e.killer !== undefined) {
          const times = (this.chain.get(e.killer) ?? []).filter((t) => e.t - t <= 10);
          times.push(e.t);
          this.chain.set(e.killer, times);
          const n = Math.min(5, times.length);
          if (n >= 2) {
            const cat = ['', '', 'double', 'triple', 'quadra', 'penta'][n];
            this.push({ cat, who: 'pbp', pri: [0, 0, 3.1, 3.8, 4.5, 5.5][n], ctx: () => ({ ...ctx, champId, PC: String(ctx.pc).toUpperCase() }), key: `multi:${e.killer}` });
            return;
          }
        }
        if (e.type === 'firstBlood') { this.fbDone = true; this.push({ cat: 'fb', who: 'pbp', pri: 3.4, ctx: () => ({ ...ctx, champId }) }); return; }
        if (/SHUTDOWN/.test(e.text)) { this.push({ cat: 'shutdown', who: 'pbp', pri: 3.1, ctx: () => ({ ...ctx, champId }) }); return; }
        if (recap) return;
        // one kill call per fight unless it's a multi-kill (the summary covers the rest)
        const f = this.fight;
        if (f && f.kills.length > 1) return;
        const cat = !e.assists?.length ? 'kill_solo' : ctx.ult && this.rng.chance(0.6) ? 'kill_ult' : ctx.jg && this.ch(e.victim)?.role !== 'jungle' && this.rng.chance(0.6) ? 'kill_gank' : 'kill';
        // the colour caster adds context to a pick now and then (normal speed only)
        const v = this.ch(e.victim), k = this.ch(e.killer);
        const colour = !this.solo && this.rate <= 9 && this.rng.chance(0.3) && v && k && (v.deaths >= 2 || k.kills >= 2);
        this.push({
          cat, who: 'pbp', pri: cat === 'kill_solo' ? 2.5 : 2.1, ctx: () => ({ ...ctx, champId }), key: `fightkill:${f?.id}`,
          follow: colour ? { cat: 'kill_colour', who: 'colour', pri: 2, ctx: () => ({ ...ctx, vd: v!.deaths, pk: k!.kills, kda: this.kda(k), vdw: v!.deaths >= 3 ? `${v!.deaths} times` : undefined }) } : undefined,
        });
        this.pickMid(e);
        return;
      }
      case 'ace':
        if (side === undefined) return;
        this.push({ cat: 'ace', who: 'pbp', pri: 4.4, ctx: () => this.sideCtx(side), key: 'ace' });
        return;
      case 'ult': case 'teamfight': {
        const hits = Number(/hits (\d+)/.exec(e.text)?.[1] ?? 0);
        if (hits < 3 || recap) return;
        const name = /^(.+?)[’']s (.+?) hits/.exec(e.text);
        const c = sim.champs.find((x) => x.input.name === name?.[1]);
        if (!c) return;
        this.push({ cat: 'ult_big', who: 'pbp', pri: 2.9, ctx: () => ({ ...this.playerCtx(this.pl(c.idx)), ult: name?.[2], ULT: name?.[2]?.toUpperCase(), hits }), key: 'ult' });
        return;
      }
      case 'dragon': {
        if (side === undefined) return;
        const tm = sim.teams[side];
        const type = tm.dragons[tm.dragons.length - 1];
        const drake = type ? DRAGON_LABEL[type] : 'Dragon';
        this.digest.objs.push({ side, obj: `${drake} Drake`, objvi: VI.drake[drake] ?? 'Rồng', w: 2 });
        if (recap) return;
        const n = tm.dragons.length;
        const ctx: Ctx = { ...this.sideCtx(side), drake, drakevi: VI.drake[drake], dn: n, odn: sim.teams[1 - side].dragons.length, dnth: NTH[n] ?? String(n), dnvi: VI.nth[n] ?? `thứ ${n}` };
        this.push({ cat: n === 3 && !tm.soul ? 'dragon_soulpt' : 'dragon', who: 'pbp', pri: n === 3 ? 2.8 : 2.2, ctx: () => ctx });
        return;
      }
      case 'soul': {
        if (side === undefined) return;
        const s = sim.teams[side].soul;
        const soul = s ? DRAGON_LABEL[s] : 'Dragon';
        this.push({ cat: 'soul', who: 'pbp', pri: 3.6, ctx: () => ({ ...this.sideCtx(side), soul, soulvi: (VI.drake[soul] ?? soul).replace('Rồng ', ''), SOULVI: (VI.drake[soul] ?? soul).replace('Rồng ', '').toUpperCase() }) });
        return;
      }
      case 'elder':
        if (side === undefined) return;
        this.digest.objs.push({ side, obj: 'Elder Dragon', objvi: 'Rồng Ngàn Tuổi', w: 5 });
        this.push({ cat: 'elder', who: 'pbp', pri: 4.3, ctx: () => ({ ...this.sideCtx(side), until: mmss(sim.teams[side].elderUntil) }) });
        return;
      case 'baron': {
        if (side === undefined) return;
        this.digest.objs.push({ side, obj: 'Baron', objvi: 'Baron', w: 4 });
        const smiter = sim.champs.find((c) => c.side === side && c.role === 'jungle')?.input.name;
        const until = mmss(sim.teams[side].baronUntil);
        const lane = (['top', 'mid', 'bot'] as const)[this.rng.int(0, 2)];
        this.push({
          cat: 'baron', who: 'pbp', pri: 4, ctx: () => ({ ...this.sideCtx(side), until, smiter }),
          follow: recap ? undefined : { cat: 'baron_after', who: 'colour', pri: 2.6, ctx: () => ({ ...this.sideCtx(side), until, lane, lanevi: VI.lane[lane], obj: 'the next tower', objvi: 'trụ tiếp theo' }) },
        });
        return;
      }
      case 'steal': {
        const m = /^(.+?) STEALS the (.+?)!/.exec(e.text);
        const c = sim.champs.find((x) => x.input.name === m?.[1]);
        const obj = m?.[2] ?? 'objective';
        const objvi = VI.obj[obj.replace(/ Drake$/, '') === obj ? obj : 'drake'] ?? (/Drake/.test(obj) ? VI.drake[obj.replace(' Drake', '')] ?? 'Rồng' : obj);
        this.push({ cat: 'steal', who: 'pbp', pri: 4.8, ctx: () => ({ ...this.playerCtx(this.pl(c?.idx)), obj, OBJ: obj.toUpperCase(), objvi, OBJVI: String(objvi).toUpperCase() }), key: 'steal' });
        return;
      }
      case 'herald': case 'grubs':
        if (side === undefined) return;
        if (/summon/.test(e.text)) return;
        this.digest.objs.push({ side, obj: e.type === 'herald' ? 'Rift Herald' : 'Voidgrubs', objvi: e.type === 'herald' ? 'Sứ Giả Khe Nứt' : 'Ấu Trùng Hư Không', w: 1 });
        if (recap) return;
        this.push({ cat: e.type, who: 'pbp', pri: 1.5, ctx: () => this.sideCtx(side) });
        return;
      case 'tower': {
        if (side === undefined) return;
        this.digest.towers[side]++;
        const m = /destroy the (\w+) (\w+) turret/.exec(e.text);
        const lane = m?.[1] ?? 'mid', tier = m?.[2] ?? 'outer';
        const first = /First Tower/.test(e.text);
        if (recap && !first) return;
        const nt = this.sim.teams[side].towers;
        const ctx: Ctx = { ...this.sideCtx(side), lane, lanevi: VI.lane[lane] ?? lane, tier, tiervi: VI.tier[tier] ?? 'trụ', towers: nt, towersw: nt === 1 ? 'one tower' : `${nt} towers` };
        this.push({ cat: first ? 'tower_first' : 'tower', who: 'pbp', pri: first ? 2.3 : tier === 'outer' ? 1.3 : tier === 'nexus' ? 2.6 : 1.8, ctx: () => ctx });
        return;
      }
      case 'inhib': {
        if (side === undefined) return;
        const lane = /the (\w+) inhibitor/.exec(e.text)?.[1] ?? 'mid';
        this.push({ cat: 'inhib', who: 'pbp', pri: 2.9, ctx: () => ({ ...this.sideCtx(side), lane, lanevi: VI.lane[lane] ?? lane }) });
        return;
      }
      case 'flash':
        if (recap || !/flashes away/.test(e.text)) return;
        { const c = sim.champs.find((x) => e.text.startsWith(x.input.name + ' ')); if (c && c.role !== 'support' && sim.t > 150 && this.cool('flash', 150)) { this.lastFlashPlayer = c.idx; this.push({ cat: 'flash_burn', who: 'any', pri: 1.2, ctx: () => ({ ...this.playerCtx(this.pl(c.idx)), oteam: this.short((1 - c.side) as 0 | 1) }) }); } }
        return;
      case 'gank': {
        if (recap || side === undefined || !/collapse on/.test(e.text) || !this.cool('gank', 50)) return;
        const lane = /in the (\w+) lane/.exec(e.text)?.[1] ?? 'mid';
        this.push({ cat: 'gank', who: 'pbp', pri: 1.6, ctx: () => ({ ...this.sideCtx(side), lane, lanevi: VI.lane[lane] ?? lane }) });
        return;
      }
      case 'tp': {
        if (recap || !e.important || !this.cool('tp', 40)) return;
        const c = sim.champs.find((x) => e.text.startsWith(x.input.name + ' '));
        if (c && /into the fight/.test(e.text)) this.push({ cat: 'tp', who: 'pbp', pri: 2, ctx: () => this.playerCtx(this.pl(c.idx)) });
        return;
      }
      case 'info': {
        const t = e.text;
        const who = sim.champs.find((x) => t.startsWith(x.input.name + ' '));
        if (/refuses to fall/.test(t)) { if (this.bc.lore) this.push({ cat: 'lore_nexus', who: 'pbp', pri: 4.6, ctx: () => ({ t1: this.bc.lore!.t1, lpl: this.bc.lore!.lpl }), key: 'lore' }); return; }
        if (/go for the end/.test(t) && who) { this.push({ cat: 'endcall', who: 'pbp', pri: 3.6, ctx: () => ({ ...this.playerCtx(this.pl(who.idx)) }), key: 'endcall' }); return; }
        if (/sneak Baron/.test(t) && side !== undefined) { this.push({ cat: 'baron_sneak', who: 'pbp', pri: 3.7, ctx: () => ({ ...this.sideCtx(side) }) }); return; }
        if (/backdoor/.test(t) && who) { this.push({ cat: 'backdoor', who: 'pbp', pri: 3.8, ctx: () => this.playerCtx(this.pl(who.idx)) }); return; }
        if (recap) return;
        if (/face-checks/.test(t) && who && this.cool('facecheck', 120)) { this.push({ cat: 'facecheck', who: 'colour', pri: 1.3, ctx: () => this.playerCtx(this.pl(who.idx)) }); return; }
        if (/goes in alone on (.+)!/.test(t) && who && this.cool('alone', 90)) { const v = /goes in alone on (.+)!/.exec(t)![1]; this.push({ cat: 'alone', who: 'pbp', pri: 1.7, ctx: () => ({ ...this.playerCtx(this.pl(who.idx)), v }) }); return; }
        if (/was executed/.test(t) && this.cool('executed', 120)) { const v = /^(.+?) \(/.exec(t)?.[1]; this.push({ cat: 'executed', who: 'colour', pri: 1.2, ctx: () => (v ? { v } : null) }); return; }
        const it = /^(.+?) completes (.+)$/.exec(t);
        if (it && who) {
          const n = (this.items.get(who.idx) ?? 0) + 1;
          this.items.set(who.idx, n);
          const carry = who.role === 'adc' || who.role === 'mid' || who.role === 'top' || who.kills >= 3;
          if (carry && n <= 3 && this.cool('item', 75)) this.push({ cat: 'item', who: 'colour', pri: 1.4, ctx: () => ({ ...this.playerCtx(this.pl(who.idx)), item: it[2], nth: NTH[n], nthvi: VI.nth[n] }) });
        }
        return;
      }
    }
  }
  /** Chat-style awareness of weird picks, from the desk: "the Teemo pick is working". */
  private pickMid(e: GameEvent) {
    const k = this.ch(e.killer), v = this.ch(e.victim);
    const notes = (i?: number) => (i === undefined ? [] : this.bc.picks.byIdx.get(i) ?? []);
    if (k && k.kills >= 2 && notes(k.idx).some((n) => WEIRD.has(n.kind)) && this.cool(`pkm:${k.idx}`, 400)) this.push({ cat: 'pkm_good', who: 'colour', pri: 1.9, ctx: () => this.playerCtx(this.pl(k.idx)) });
    else if (v && v.deaths >= 3 && notes(v.idx).some((n) => WEIRD.has(n.kind)) && this.cool(`pkm:${v.idx}`, 400)) this.push({ cat: 'pkm_bad', who: 'colour', pri: 1.8, ctx: () => this.playerCtx(this.pl(v.idx)) });
  }

  // ------------------------------------------------------------------ fights
  private trackFight(e: GameEvent) {
    const pos = e.pos ?? this.ch(e.victim)?.pos;
    if (!pos || e.side === undefined) return;
    const f = this.fight;
    if (f && e.t - f.last < 10 && dist(pos, f.pos) < 3800) {
      f.kills.push({ t: e.t, side: e.side as 0 | 1, killer: e.killer, victim: e.victim, assists: e.assists ?? [] });
      f.last = e.t;
      f.pos = { x: (f.pos.x * 2 + pos.x) / 3, y: (f.pos.y * 2 + pos.y) / 3 };
      return;
    }
    if (f) this.endFight(f);
    // the gold diff before the first kill of this fight (the bounty is already in, so take it back out roughly)
    this.fight = { id: ++this.fightSeq, start: e.t, last: e.t, pos: { ...pos }, kills: [{ t: e.t, side: e.side as 0 | 1, killer: e.killer, victim: e.victim, assists: e.assists ?? [] }], gold0: this.lead() + (e.side === 0 ? -400 : 400) };
  }
  private endFight(f: Fight) {
    this.fight = null;
    if (f.kills.length < 2) return;
    const kw0 = f.kills.filter((k) => k.side === 0).length, kw1 = f.kills.length - kw0;
    const side: 0 | 1 = kw0 >= kw1 ? 0 : 1;
    const kw = Math.max(kw0, kw1), kl = Math.min(kw0, kw1);
    if (kw < 2) return; // a 1-for-1 trade: the kill calls said it all
    this.digest.fights.push({ side, kw, kl });
    if (this.mode === 'recap') return;
    const swing = Math.abs((this.lead() - f.gold0) * (side === 0 ? 1 : -1));
    const score = new Map<number, number>();
    for (const k of f.kills) if (k.side === side) { if (k.killer !== undefined) score.set(k.killer, (score.get(k.killer) ?? 0) + 2); for (const a of k.assists) score.set(a, (score.get(a) ?? 0) + 1); }
    const mvpIdx = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mvp = this.ch(mvpIdx);
    const losers = this.sim.champs.filter((c) => c.side !== side && c.dead).length;
    const baron = this.sim.objectives.find((o) => o.kind === 'baron' && o.alive && this.sim.t >= o.spawnAt);
    const drake = this.sim.objectives.find((o) => (o.kind === 'dragon' || o.kind === 'elder') && o.alive && this.sim.t >= o.spawnAt);
    const next = losers >= 2 && baron ? ['Baron', 'Baron'] : losers >= 2 && drake ? [drake.kind === 'elder' ? 'the Elder Dragon' : 'the dragon', drake.kind === 'elder' ? 'Rồng Ngàn Tuổi' : 'Rồng'] : ['the map', 'cả bản đồ'];
    const even = kw - kl <= 1 && kl >= 1;
    // the ultimate that decided it (winner side, most champions hit)
    const ult = this.sim.ultFx.filter((u) => u.t >= f.start - 4 && u.t <= f.last + 1 && this.sim.champs[u.idx]?.side === side && u.hits.length >= 2).sort((a, b) => b.hits.length - a.hits.length)[0];
    const ulter = ult ? this.sim.champs[ult.idx] : undefined;
    const cat = even ? 'fight_even' : ult && ult.hits.length >= 3 && this.rng.chance(0.6) ? 'fight_ult' : 'fight_sum';
    this.push({
      cat, who: 'colour', pri: Math.min(3.6, 2.4 + 0.25 * (f.kills.length - 2)), ttlSim: 70,
      ctx: () => ({ ...this.sideCtx(side), kw, kl, swing: k1(Math.max(300, swing)), mvp: mvp?.input.name, mvpc: mvp?.champ.name, next: next[0], nextvi: next[1], dead: losers, ulter: ulter?.input.name, ult: ult?.name, hits: ult?.hits.length }),
    });
  }

  // ------------------------------------------------------------------ the game state
  private watch() {
    const sim = this.sim, b = this.bc;
    // a fight is ending
    if (this.fight && sim.t - this.fight.last > 6) this.endFight(this.fight);
    // a fight is breaking out (6+ champions together, both sides in combat)
    if (sim.t >= this.fightCheckAt && this.mode === 'normal') {
      this.fightCheckAt = sim.t + 1;
      if (sim.t - this.fightSaid > 35 && sim.t > 240) {
        const live = sim.champs.filter((c) => !c.dead && sim.t - c.lastCombatAt < 1.5);
        if (live.length >= 6 && live.some((c) => c.side === 0) && live.some((c) => c.side === 1)) {
          const cx = live.reduce((a, c) => a + c.pos.x, 0) / live.length, cy = live.reduce((a, c) => a + c.pos.y, 0) / live.length;
          if (live.filter((c) => Math.hypot(c.pos.x - cx, c.pos.y - cy) < 1800).length >= 6) {
            this.fightSaid = sim.t;
            const [place, placevi] = placeOf({ x: cx, y: cy });
            const first = live.sort((a, c) => c.lastCombatAt - a.lastCombatAt)[0];
            this.push({ cat: 'fight_start', who: 'pbp', pri: 2.7, ttlSim: 12, ctx: () => ({ ...this.sideCtx(first.side as 0 | 1), place, placevi }) });
          }
        }
      }
    }
    // team plans and objective stances (the decision layer)
    for (const s of [0, 1] as const) {
      const tm = sim.teams[s];
      const pk = `${tm.plan.kind}:${tm.plan.target ?? ''}`;
      if (pk !== this.plans[s]) {
        this.plans[s] = pk;
        if (tm.plan.kind === 'objective' && tm.plan.target === 'baron' && this.cool(`setup_baron:${s}`, 90)) {
          const dead = sim.champs.filter((c) => c.side !== s && c.dead).length;
          this.push({ cat: 'setup_baron', who: 'colour', pri: 2.3, ctx: () => ({ ...this.sideCtx(s), dead: dead >= 2 ? dead : undefined }) });
        } else if (tm.plan.kind === 'objective' && tm.plan.target === 'dragon' && sim.t > 270 && this.cool(`setup_dragon:${s}`, 240) && this.rng.chance(0.6)) {
          const o = sim.objectives.find((x) => x.kind === 'dragon' && x.dragonType);
          const drake = o?.dragonType ? DRAGON_LABEL[o.dragonType] : undefined;
          this.push({ cat: 'setup_dragon', who: 'colour', pri: 1.5, ctx: () => (drake ? { ...this.sideCtx(s), drake, drakevi: VI.drake[drake] } : null) });
        } else if (tm.plan.kind === 'siege' && /Baron power play/.test(tm.plan.label) && this.cool(`siege:${s}`, 120)) {
          const lane = tm.plan.target ?? 'mid';
          this.push({ cat: 'siege', who: 'colour', pri: 1.6, ctx: () => ({ ...this.sideCtx(s), lane, lanevi: VI.lane[lane] ?? lane }) });
        }
      }
      const st = tm.objStance;
      const sk = st ? `${st.kind}:${st.stance}` : '';
      if (sk !== this.stances[s]) {
        this.stances[s] = sk;
        if (st && (st.stance === 'bait' || st.stance === 'fight' || st.stance === 'race' || st.stance === 'retreat') && (st.kind === 'baron' || st.kind === 'elder' || (st.kind === 'dragon' && this.rng.chance(0.4))) && this.cool(`stance:${st.kind}:${st.stance}`, 120) && this.mode === 'normal') {
          const obj = st.kind === 'baron' ? 'Baron' : st.kind === 'elder' ? 'Elder Dragon' : 'drake';
          this.push({ cat: `stance_${st.stance}`, who: st.stance === 'race' || st.stance === 'fight' ? 'pbp' : 'colour', pri: st.kind === 'dragon' ? 1.6 : 2.3, ttlSim: 15, ctx: () => ({ ...this.sideCtx(s), obj, objvi: VI.obj[obj] ?? obj }) });
        }
      }
    }
    // gold: comebacks, throws, milestones
    const lead = this.lead();
    for (const s of [0, 1] as const) {
      const mine = s === 0 ? lead : -lead;
      this.maxLead[s] = Math.max(this.maxLead[s], mine);
      if (this.maxLead[s] >= 4000 && mine <= -1000) {
        const was = k1(this.maxLead[s]);
        this.maxLead[s] = mine;
        const o = (1 - s) as 0 | 1;
        this.push({ cat: 'comeback', who: 'pbp', pri: 3.2, ctx: () => ({ ...this.sideCtx(o), was }), follow: this.solo ? undefined : { cat: 'throw', who: 'colour', pri: 3, ctx: () => ({ ...this.sideCtx(s), was }) } });
      }
    }
    const abs = Math.abs(lead), mark = abs >= 10000 ? 3 : abs >= 6000 ? 2 : abs >= 3000 ? 1 : 0;
    if (mark > this.goldMark && sim.t > 360 && this.mode === 'normal') {
      const leader = (lead >= 0 ? 0 : 1) as 0 | 1;
      const fav = b.fav === leader;
      const cat = mark >= 3 ? 'stomp' : !fav && b.favBy > 1 ? 'upset' : 'gold_lead';
      this.push({ cat, who: 'colour', pri: 1.9, ctx: () => this.leadCtx() });
      if (fav === false && b.favBy > 1 && this.cool('cope', 300)) this.push({ cat: 'cope', who: 'any', pri: 1.7, ctx: () => this.leadCtx() });
    }
    this.goldMark = Math.max(abs >= 1500 ? this.goldMark : 0, mark);
    // the Nexus
    for (const s of [0, 1] as const) { if (sim.nexusHp[s] < this.nexusPrev[s] - 1) this.nexusHitAt[s] = sim.t; this.nexusPrev[s] = sim.nexusHp[s]; }
    if (sim.winner === null) {
      if (sim.t - this.nexusHitAt[0] < 25 && sim.t - this.nexusHitAt[1] < 25 && sim.t - this.raceSaid > 90) { this.raceSaid = sim.t; this.push({ cat: 'base_race', who: 'pbp', pri: 4.5, ctx: () => ({}) }); }
      else for (const s of [0, 1] as const) {
        if (sim.t - this.nexusHitAt[s] < 3 && sim.t - this.nexusSaid > 45) { this.nexusSaid = sim.t; const att = (1 - s) as 0 | 1; this.push({ cat: 'nexus_threat', who: 'pbp', pri: 3.5, ctx: () => this.sideCtx(att) }); }
      }
    }
    // the end
    if (sim.winner !== null && !this.ended) {
      this.ended = true;
      const w = sim.winner;
      this.queue = [];
      if (this.fight) this.fight = null;
      const [sa, savi] = this.seriesAfter(w);
      const winners = sim.champs.filter((c) => c.side === w).sort((x, y) => (y.kills * 3 + y.assists * 2 - y.deaths * 2) - (x.kills * 3 + x.assists * 2 - x.deaths * 2));
      const m = winners[0];
      this.push({
        cat: 'end', who: 'pbp', pri: 6, ttlReal: 20000, ttlSim: 1e9, ctx: () => ({ ...this.sideCtx(w), seriesafter: sa, seriesaftervi: savi, TEAM: this.short(w).toUpperCase() }),
        follow: { cat: 'end_colour', who: 'colour', pri: 5, ctx: () => ({ ...this.sideCtx(w), mvp: m?.input.name, mvpc: m?.champ.name, mvpkda: this.kda(m) }) },
      });
    }
  }
  private leadCtx(): Ctx {
    const lead = this.lead(), leader = (lead >= 0 ? 0 : 1) as 0 | 1, trailer = (1 - leader) as 0 | 1;
    const fav = this.bc.fav;
    const favCarry = this.sim.champs.filter((c) => c.side === fav).sort((a, b) => (b.champ.profile.late + b.champ.profile.dps) - (a.champ.profile.late + a.champ.profile.dps))[0];
    return { leader: this.short(leader), trailer: this.short(trailer), lead: k1(lead), favcarry: favCarry?.input.name, ...this.sideCtx(leader), obj: this.nextObj(), objvi: VI.obj[this.nextObj()] ?? 'mục tiêu lớn' };
  }
  private nextObj(): string {
    const t = this.sim.t;
    const name = (k: string) => (k === 'elder' ? 'Elder Dragon' : k === 'baron' ? 'Baron' : k === 'dragon' ? 'the dragon' : k === 'herald' ? 'Rift Herald' : 'Voidgrubs');
    const up = this.sim.objectives.filter((o) => o.alive && t >= o.spawnAt).sort((a, b) => (b.kind === 'baron' || b.kind === 'elder' ? 1 : 0) - (a.kind === 'baron' || a.kind === 'elder' ? 1 : 0));
    if (up.length) return name(up[0].kind);
    const next = this.sim.objectives.filter((o) => o.spawnAt > t).sort((a, b) => a.spawnAt - b.spawnAt)[0];
    return next ? name(next.kind) : 'Baron';
  }

  // ------------------------------------------------------------------ quiet moments
  private idle(): Moment | null {
    const sim = this.sim, t = sim.t, b = this.bc, mins = t / 60;
    const c = this.lastSpeaker === this.desk.colour && !this.solo && this.rng.chance(0.35) ? this.desk.pbp : this.desk.colour;
    const w = CASTERS[c].w;
    const ops: [string, number, () => Moment | null][] = [];
    const mk = (cat: string, ctx: () => Ctx | null, who: Who = 'any', caster?: CasterId): Moment => ({ cat, who, pri: 1, t, real: this.now, expReal: this.now + 4000, expSim: t + 60, ctx, caster: caster ?? (who === 'any' ? c : undefined) });
    const add = (topic: string, weight: number, cool: number, build: () => Moment | null) => {
      const at = this.topicAt.get(topic);
      if (at !== undefined && t - at < cool) return;
      ops.push([topic, weight, build]);
    };
    const lead = this.lead(), abs = Math.abs(lead);
    const champs = sim.champs;
    const fresh = (p: PlayerInfo) => t - (this.saidPlayer.get(p.playerId) ?? -1e9) > 600;
    const said = (p: PlayerInfo) => { this.saidPlayer.set(p.playerId, t); return this.playerCtx(p); };
    // laning: CS gaps, jungle, levels
    if (mins >= 4 && mins < 15) {
      add('cs_lane', 1.3 * w.analysis, 230, () => {
        let best: { a: SimChamp; o: SimChamp; d: number } | null = null;
        for (const a of champs) {
          if (a.side !== 0 || a.role === 'jungle' || a.role === 'support') continue;
          const o = champs.find((x) => x.side === 1 && x.role === a.role);
          if (!o) continue;
          const d = a.cs - o.cs;
          if (!best || Math.abs(d) > Math.abs(best.d)) best = { a, o, d };
        }
        if (!best || Math.abs(best.d) < 12) return null;
        const [hi, lo] = best.d > 0 ? [best.a, best.o] : [best.o, best.a];
        const lane = hi.role === 'adc' ? 'bot' : hi.role;
        if (this.once.has(`cs:${hi.idx}`) && this.rng.chance(0.7)) return null;
        this.once.add(`cs:${hi.idx}`);
        return mk('cs_lane', () => ({ ...this.playerCtx(this.pl(hi.idx)), o: lo.input.name, oc: lo.champ.name, csd: Math.abs(best!.d), lane, lanevi: VI.lane[lane] ?? lane }));
      });
      add('jungle', 0.8 * w.analysis, 200, () => {
        const jg = this.rng.pick(champs.filter((x) => x.role === 'jungle'));
        if (!jg || jg.dead) return null;
        const top = jg.pos.y - jg.pos.x > 0;
        return mk('jungle', () => ({ ...this.sideCtx(jg.side as 0 | 1), jg: jg.input.name, side: top ? 'top' : 'bot', sidevi: top ? 'phía trên' : 'phía dưới' }));
      });
    }
    if (mins < 12) {
      // a lane matchup on paper (op.gg matchup data)
      add('lane_matchup', 1.0 * w.analysis, 200, () => {
        const lanes = (['top', 'mid', 'adc'] as const).map((r) => {
          const a = champs.find((x) => x.side === 0 && x.role === r), o = champs.find((x) => x.side === 1 && x.role === r);
          return a && o ? { a, o, e: matchupEdge(a.champ.id, o.champ.id, r) } : null;
        }).filter((x): x is { a: SimChamp; o: SimChamp; e: number } => !!x && Math.abs(x.e) >= 0.03 && !this.once.has(`mu:${x.a.role}`));
        if (!lanes.length) return null;
        const m = lanes.sort((x, y) => Math.abs(y.e) - Math.abs(x.e))[0];
        this.once.add(`mu:${m.a.role}`);
        const [hi, lo] = m.e > 0 ? [m.a, m.o] : [m.o, m.a];
        const lane = hi.role === 'adc' ? 'bot' : hi.role;
        return mk('lane_matchup', () => ({ ...this.playerCtx(this.pl(hi.idx)), o: lo.input.name, oc: lo.champ.name, lane, lanevi: VI.lane[lane] ?? lane, wr: `${Math.round(50 + Math.abs(m.e) * 50)}%` }));
      });
      // how a team likes to start (tactics)
      for (const s2 of [0, 1] as const) {
        const tac = sim.teams[s2].input.tactics;
        if (tac.earlyFocus !== 'balanced' && !this.once.has(`plan:${s2}`) && mins < 8) {
          const jg = champs.find((x) => x.side === s2 && x.role === 'jungle');
          add(`plan:${s2}`, 0.8 * w.analysis, 9999, () => { this.once.add(`plan:${s2}`); return mk('early_plan', () => ({ ...this.sideCtx(s2), focus: tac.earlyFocus, focusvi: VI.lane[tac.earlyFocus] ?? tac.earlyFocus, jg: jg?.input.name })); });
        }
      }
      // more players to introduce
      const intro = b.players.filter((p) => fresh(p) && (p.star || p.form >= 3 || p.form <= -3) && !this.once.has(`intro:${p.idx}`));
      if (intro.length) add('player_intro', 0.9 * w.story, 150, () => { const p = this.rng.pick(intro); this.once.add(`intro:${p.idx}`); return mk('player_intro', () => said(p)); });
    }
    // the most contested champion of the year is in this game
    const metaPick = [...champs].sort((a, x) => (x.champ.meta?.presence ?? 0) - (a.champ.meta?.presence ?? 0))[0];
    if (metaPick && (metaPick.champ.meta?.presence ?? 0) >= 0.4 && !this.once.has('meta')) add('meta_pick', 0.7 * w.analysis, 9999, () => { this.once.add('meta'); return mk('meta_pick', () => ({ ...this.playerCtx(this.pl(metaPick.idx)), presence: `${Math.round((metaPick.champ.meta?.presence ?? 0) * 100)}%` })); });
    // the audience
    const vw = this.viewers?.() ?? 0;
    if (vw >= 500 && mins >= 3 && !this.once.has('aud') ) add('audience', 0.6 * w.hype + 0.2, 9999, () => { this.once.add('aud'); return mk('audience', () => ({ viewers: spokenViewers(vw), viewersvi: spokenViewersVi(vw) }), 'any', this.desk.pbp); });
    // timers
    const drake = sim.objectives.find((o) => o.kind === 'dragon' && !o.alive || (o.kind === 'dragon' && o.spawnAt > t));
    const dIn = drake ? drake.spawnAt - t : -1;
    if (drake && dIn > 15 && dIn < 75 && drake.dragonType) {
      const name = DRAGON_LABEL[drake.dragonType];
      const prio = this.prioSide('bot');
      add('drake_timer', 2 * w.analysis, 200, () => mk('drake_timer', () => ({ in: Math.round(dIn / 5) * 5, drake: name, drakevi: VI.drake[name], who: this.short(prio) })));
    }
    const baron = sim.objectives.find((o) => o.kind === 'baron');
    const bIn = baron ? baron.spawnAt - t : -1;
    if (baron && bIn > 15 && bIn < 80) {
      const alive = [0, 1].map((s) => champs.filter((x) => x.side === s && !x.dead).length);
      const who = alive[0] === alive[1] ? (lead >= 0 ? 0 : 1) : alive[0] > alive[1] ? 0 : 1;
      add('baron_timer', 2.2 * w.analysis, 240, () => mk('baron_timer', () => ({ in: Math.round(bIn / 5) * 5, who: this.short(who as 0 | 1) })));
    }
    // flash down on a carry
    const noFlash = champs.filter((x) => !x.dead && x.flashReadyAt - t > 100 && x.role !== 'support' && x.idx !== this.lastFlashPlayer).sort((a, x) => x.goldEarned - a.goldEarned)[0];
    if (noFlash && mins >= 6) add('flash_down', 0.6 * w.analysis, 320, () => mk('flash_down', () => ({ ...this.playerCtx(this.pl(noFlash.idx)), oteam: this.short((1 - noFlash.side) as 0 | 1), secs: Math.round((noFlash.flashReadyAt - t) / 10) * 10 })));
    // gold story
    if (mins >= 8) {
      if (abs < 1200) add('gold_even', 0.9 * w.analysis, 300, () => mk('gold_even', () => ({ gold: k1(Math.max(abs, 300)) })));
      else add('gold_lead', 1.1 * w.analysis, 220, () => mk('gold_lead', () => this.leadCtx()));
      const gdm = sim.goldDiff;
      if (gdm.length >= 4) {
        const trend = gdm[gdm.length - 1] - gdm[gdm.length - 4];
        if (Math.abs(trend) >= 1500) add('gold_trend', 1.2 * w.analysis, 260, () => mk('gold_trend', () => ({ ...this.leadCtx(), leader: this.short(trend > 0 ? 0 : 1), trailer: this.short(trend > 0 ? 1 : 0), trend: k1(trend) })));
      }
      const kd = sim.teams[0].kills - sim.teams[1].kills;
      if (abs >= 2500 && ((kd < 0 && lead > 0) || (kd > 0 && lead < 0))) add('kills_vs_gold', 1.4 * w.analysis, 400, () => mk('kills_vs_gold', () => this.leadCtx()));
    }
    // comps & opinions
    if (mins >= 12) {
      const sc = this.scaling();
      if (sc) add('scaling', 1.1 * w.analysis, 420, () => mk('scaling', () => ({ late: this.short(sc.late), early: this.short(sc.early) })));
      if (abs >= 2500) {
        add('opinion_ahead', 1 * w.analysis, 300, () => mk('opinion_ahead', () => ({ ...this.leadCtx() })));
        add('opinion_behind', 0.8 * w.analysis, 300, () => { const l = this.leadCtx(); return mk('opinion_behind', () => ({ ...l, ...this.sideCtx(lead >= 0 ? 1 : 0) })); });
        if (b.favBy > 1 && (lead >= 0 ? 0 : 1) !== b.fav) {
          add('cope', 1.2 * w.story, 330, () => mk('cope', () => this.leadCtx()));
          add('upset', 0.9 * w.hype, 330, () => mk('upset', () => this.leadCtx()));
        }
      }
      if (mins >= 27 && abs < 3000) add('close_late', 1.3 * w.hype, 300, () => mk('close_late', () => ({})));
    }
    // players: season numbers, titles, this game's stats, comfort performances, buzz
    const hot = [...champs].sort((a, x) => (x.kills * 2 + x.assists - x.deaths * 1.5) - (a.kills * 2 + a.assists - a.deaths * 1.5))[0];
    const hp = hot ? this.pl(hot.idx) : undefined;
    if (hot && hp && mins >= 6 && hot.kills + hot.assists >= 4 && t - (this.saidPlayer.get(hp.playerId) ?? -1e9) > 240) {
      const said2 = () => { this.saidPlayer.set(hp.playerId, t); return this.playerCtx(hp); };
      if ((hp.tier === 'signature' || hp.tier === 'mastered') && !this.once.has(`cp:${hp.idx}`)) add('comfort_perf', 1.4 * w.story, 400, () => { this.once.add(`cp:${hp.idx}`); return mk('comfort_perf', said2); });
      else add('stats_game', 1.1 * w.story, 240, () => mk('stats_game', said2));
    }
    const sps = b.players.filter((p) => p.sg >= 4 && fresh(p));
    if (sps.length) { const sp = this.rng.pick(sps); add('stats_season', 1 * w.story, 200, () => mk('stats_season', () => said(sp))); }
    const vet = b.players.filter((p) => (p.titles.length >= 2 || p.rings >= 1) && fresh(p));
    if (vet.length) add('player_titles', 0.45 * w.story, 520, () => { const v = this.rng.pick(vet); return mk('player_titles', () => said(v)); });
    const flagged = b.players.find((p) => p.flag && p.flag.kind !== 'drop');
    if (flagged && !this.once.has('buzz')) add('buzz', 1.2 * w.story, 9999, () => { this.once.add('buzz'); return mk('buzz', () => this.playerCtx(flagged)); });
    for (const s of [0, 1] as const) {
      const ti = b.teams[s];
      if (Math.abs(ti.streak) >= 3 && !this.once.has(`form:${s}`)) add(`form:${s}`, 1 * w.story, 9999, () => { this.once.add(`form:${s}`); return mk(ti.streak > 0 ? 'form' : 'slump', () => ({ ...this.sideCtx(s), streak: Math.abs(ti.streak) })); });
    }
    if ((b.teams[0].w + b.teams[0].l >= 2) && !this.once.has('standings')) add('standings', 0.8 * w.story, 9999, () => { this.once.add('standings'); return mk('standings', () => ({ ...this.sideCtx(0), w: b.teams[0].w, l: b.teams[0].l, ow: b.teams[1].w, ol: b.teams[1].l })); });
    if (b.h2h.length && !this.once.has('h2h')) add('h2h', 0.6 * w.story, 9999, () => { this.once.add('h2h'); return mk('h2h', () => this.h2hCtx()); });
    if (mins >= 10) {
      const wards = [0, 1].map((s) => champs.filter((x) => x.side === s).reduce((a, x) => a + x.wardsPlaced, 0));
      const vs = wards[0] >= wards[1] ? 0 : 1;
      if (Math.abs(wards[0] - wards[1]) >= 8) add('vision', 0.7 * w.analysis, 500, () => mk('vision', () => ({ ...this.sideCtx(vs as 0 | 1), wards: wards[vs], owards: wards[1 - vs] })));
      // level gaps between lane opponents
      for (const a of champs) {
        if (a.side !== 0) continue;
        const o = champs.find((x) => x.side === 1 && x.role === a.role);
        if (o && Math.abs(a.level - o.level) >= 2 && mins < 22) {
          const [hi, lo] = a.level > o.level ? [a, o] : [o, a];
          add('level_gap', 0.7 * w.analysis, 300, () => mk('level_gap', () => ({ ...this.playerCtx(this.pl(hi.idx)), lv: hi.level, o: lo.input.name, olv: lo.level })));
          break;
        }
      }
    }
    // picks not mentioned yet
    const unsaid = this.headline().find((n) => !this.once.has(`pk:${n.idx}`));
    if (unsaid && mins < 18) add(`pk`, 0.9 * w.story, 120, () => { this.once.add(`pk:${unsaid.idx}`); const cat = this.pickCat(unsaid); return cat ? mk(cat, () => this.pickCtx(unsaid)) : null; });
    // hype & banter
    if (t - this.lastBig < 50 || (mins >= 28 && abs < 2500)) add('hype', 0.8 * w.hype, 240, () => mk('hype', () => ({}), 'any', this.desk.pbp));
    if (!this.solo && mins >= 5) add('banter', 1.4 * w.wit + 0.4, 160, () => this.banter());
    // at 16×+ anything about the next few seconds is stale before it's read
    if (this.mode === 'recap') for (let i = ops.length - 1; i >= 0; i--) if (TIMELY.has(ops[i][0])) ops.splice(i, 1);
    if (!ops.length) return null;
    const [topic, , build] = this.rng.weighted(ops, (o) => o[1]);
    this.topicAt.set(topic, t);
    return build();
  }
  private prioSide(lane: 'top' | 'mid' | 'bot'): 0 | 1 {
    // the side whose wave is further up the lane has priority
    const ws = this.sim.waves.filter((w) => w.lane === lane);
    const p = ws.length ? ws.reduce((a, w) => a + w.p * w.count, 0) / Math.max(1, ws.reduce((a, w) => a + w.count, 0)) : 0.5;
    return p >= 0.5 ? 0 : 1;
  }
  private scaling(): { late: 0 | 1; early: 0 | 1 } | null {
    const v = (s: 0 | 1) => this.sim.champs.filter((c) => c.side === s).reduce((a, c) => a + c.champ.profile.late - c.champ.profile.early, 0);
    const d = v(0) - v(1);
    if (Math.abs(d) < 3) return null;
    return d > 0 ? { late: 0, early: 1 } : { late: 1, early: 0 };
  }
  private banter(): Moment | null {
    const sim = this.sim, t = sim.t, lead = this.lead();
    const topics: [string, number, () => Ctx | null][] = [];
    const baron = sim.objectives.find((o) => o.kind === 'baron' && o.alive && t >= o.spawnAt);
    if (baron) topics.push(['baron', 2, () => { const d = sim.champs.filter((c) => c.side !== (lead >= 0 ? 0 : 1) && c.dead).length; return { ...this.sideCtx(lead >= 0 ? 0 : 1), dead: d >= 2 ? d : undefined }; }]);
    if (Math.abs(lead) >= 3000) topics.push(['lead', 1.6, () => this.leadCtx()]);
    const weird = this.bc.picks.notes.find((n) => WEIRD.has(n.kind) && n.idx >= 0);
    if (weird && t > 420) topics.push(['pick', 1.2, () => ({ ...this.playerCtx(this.pl(weird.idx)) })]);
    const sc = this.scaling();
    if (sc && t > 600) topics.push(['scale', 1, () => ({ late: this.short(sc.late), early: this.short(sc.early) })]);
    const hot = [...sim.champs].sort((a, x) => (x.kills * 2 + x.assists - x.deaths) - (a.kills * 2 + a.assists - a.deaths))[0];
    if (hot && hot.kills + hot.assists >= 5) topics.push(['player', 1.2, () => this.playerCtx(this.pl(hot.idx))]);
    if (!this.once.has('bq_misc')) topics.push(['misc', 0.5, () => { this.once.add('bq_misc'); return {}; }]);
    if (!topics.length) return null;
    const [topic, , build] = this.rng.weighted(topics, (x) => x[1]);
    const ctx = build();
    if (!ctx) return null;
    // usually play-by-play asks and colour answers; sometimes the other way round
    const asker = this.rng.chance(0.7) ? this.desk.pbp : this.desk.colour;
    const answer = asker === this.desk.pbp ? this.desk.colour : this.desk.pbp;
    return { cat: `bq_${topic}`, who: 'any', caster: asker, pri: 1.2, t, real: this.now, expReal: this.now + 4000, expSim: t + 60, ctx: () => ctx, follow: { cat: `ba_${topic}`, who: 'any', caster: answer, pri: 2.9, ctx: () => ctx } };
  }

  // ------------------------------------------------------------------ recap mode (16×+)
  private recap(): SubLine | null {
    const d = this.digest;
    const items: { k: string; ctx: Ctx; w: number }[] = [];
    const fights = [...d.fights].sort((a, b) => b.kw + b.kl - (a.kw + a.kl));
    if (fights[0] && fights[0].kw >= 2) items.push({ k: 'fight', ctx: { ...this.sideCtx(fights[0].side), kw: fights[0].kw, kl: fights[0].kl }, w: 3 + fights[0].kw });
    else for (const s of [0, 1] as const) if (d.kills[s] >= 2) items.push({ k: 'kills', ctx: { ...this.sideCtx(s), n: d.kills[s] }, w: 2 + d.kills[s] * 0.5 });
    for (const o of [...d.objs].sort((a, b) => b.w - a.w).slice(0, 2)) items.push({ k: 'obj', ctx: { ...this.sideCtx(o.side), obj: o.obj, objvi: o.objvi }, w: 2 + o.w });
    for (const s of [0, 1] as const) if (d.towers[s] >= 2) items.push({ k: 'towers', ctx: { ...this.sideCtx(s), n: d.towers[s] }, w: 1.5 + d.towers[s] * 0.3 }); else if (d.towers[s] === 1) items.push({ k: 'tower', ctx: this.sideCtx(s), w: 1 });
    if (!items.length) return null;
    this.digest = { kills: [0, 0], fights: [], objs: [], towers: [0, 0] };
    items.sort((a, b) => b.w - a.w);
    const pick = items.slice(0, 3);
    const c = this.desk.pbp;
    const vi = CASTERS[c].lang === 'vi';
    const lead = this.lead();
    const goldCtx = { leader: this.short(lead >= 0 ? 0 : 1), lead: k1(lead) };
    const parts: string[] = [], gloss: string[] = [];
    for (const it of pick) {
      if (vi) { const t = this.rng.pick(RECAP_VI[it.k]); const a = fill(t[0], { ...this.base(), ...it.ctx }), b = fill(t[1], { ...this.base(), ...it.ctx }); if (a && b) { parts.push(a); gloss.push(b); } }
      else { const a = fill(this.rng.pick(RECAP_EN[it.k]), { ...this.base(), ...it.ctx }); if (a) parts.push(a); }
    }
    if (!parts.length) return null;
    const gk = Math.abs(lead) >= 1500 ? 'gold' : 'even';
    if (vi) { const t = this.rng.pick(RECAP_VI[gk]); const a = fill(t[0], goldCtx), b = fill(t[1], goldCtx); if (a && b) { parts.push(a); gloss.push(b); } }
    else { const a = fill(this.rng.pick(RECAP_EN[gk]), goldCtx); if (a) parts.push(a); }
    const join = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ` ${and} ` + xs[xs.length - 1].replace(/^and /, ''));
    let text = join(parts, vi ? 'và' : 'and');
    let g = vi ? join(gloss, 'and') : undefined;
    text = text[0].toUpperCase() + text.slice(1) + (vi ? '!' : '.');
    if (g) g = g[0].toUpperCase() + g.slice(1) + '.';
    const open = this.rng.chance(0.45) ? this.line(c, 'rc_open', {}) : null;
    if (open) { text = `${open.text} ${text}`; if (g && open.gloss) g = `${open.gloss} ${g}`; }
    return this.emit(c, 'recap', text, g, 2);
  }

  // ------------------------------------------------------------------ the clock
  /** Advance to real time `now` (ms); returns a line when a new one starts. */
  tick(now: number): SubLine | null {
    const sim = this.sim;
    if (!this.lastNow) { this.lastNow = now; this.lastSimT = sim.t; this.now = now; }
    const dt = Math.min(1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.now = now;
    if (dt > 0) {
      const dSim = sim.t - this.lastSimT;
      this.lastSimT = sim.t;
      const inst = dSim / dt;
      if (inst <= 600) this.rate = this.rate * 0.85 + inst * 0.15;
      this.pausedFor = sim.winner === null && dSim === 0 ? this.pausedFor + dt : 0;
    }
    this.mode = this.rate >= 15 ? 'recap' : 'normal';
    if (!this.started) this.pregame();
    // new events (after "skip to result", only the end matters)
    const evs = sim.events;
    if (evs.length - this.idx > 40) { this.idx = evs.length - 4; this.digest = { kills: [0, 0], fights: [], objs: [], towers: [0, 0] }; this.fight = null; }
    for (; this.idx < evs.length; this.idx++) this.onEvent(evs[this.idx]);
    this.watch();
    if (this.pausedFor > 2.5) return null;
    // drop what went stale
    this.queue = this.queue.filter((m) => (m.pri >= 5 || (now <= m.expReal && sim.t <= m.expSim)));
    // a big moment cuts in on a small line
    const top = this.best();
    const cur = this.current;
    const busy = now < this.busyUntil;
    if (busy && top && cur && top.pri >= 3.8 && cur.pri <= 2.6 && now - cur.at > 800) this.busyUntil = now;
    if (now < this.busyUntil + 220) return null;
    if (top) {
      this.queue.splice(this.queue.indexOf(top), 1);
      const l = this.speak(top);
      if (l) return l;
    }
    if (this.ended) return null;
    if (this.mode === 'recap') {
      if (now - this.lastEnd > 900 && sim.t - this.lastLineSim > 40) { const r = this.recap(); if (r) return r; }
      if (sim.t - this.lastLineSim < 150) return null;
    }
    // quiet: colour fills the silence
    const simGap = this.rate <= 2.5 ? 7 : this.rate <= 9 ? 16 : 45;
    if (sim.t - this.lastLineSim >= simGap && now - this.lastEnd > (this.rate <= 2.5 ? 2600 : 1200)) {
      for (let i = 0; i < 4; i++) {
        const m = this.idle();
        if (!m) break;
        const l = this.speak(m, true);
        if (l) return l;
      }
      this.lastLineSim = sim.t - simGap / 2; // nothing to say: look again a little later
    }
    return null;
  }
  private best(): Moment | null {
    let b: Moment | null = null;
    for (const m of this.queue) {
      if (m.notBefore && this.now < m.notBefore) continue;
      if (!b || m.pri > b.pri || (m.pri === b.pri && m.t > b.t)) b = m;
    }
    return b;
  }
}
