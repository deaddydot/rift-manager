// The live chat's brain (no React): turns the match sim into a Twitch-style chat. Reads new sim events and the game
// state on a real-time timer and produces chat lines from a cast of recurring chatters (personas with a stable voice,
// colours and badges) plus one-off viewers: event reactions, emote waves with a combo counter, memes & copypastas,
// replies and arguments, callouts of what people said earlier (it remembers "gg go next" at 12 minutes…), mods & bots
// (Nightbot, timeouts), sub / gift / bits / raid notices and a channel-points prediction.
//
// Pacing is in real time (chat has to feel live at 1× and at 64×): a token bucket caps released lines per second,
// a priority queue drops stale low-priority lines, and reactions per event shrink at high playback speeds.
// External lines (the in-browser AI chat, see chatFeed.ts) go through the same queue and caps.
import type { MatchSim } from '../../engine/sim/engine';
import type { GameEvent, SimChamp } from '../../engine/sim/simtypes';
import type { Team, Role } from '../../engine/types';
import { NEXUS_HP } from '../../engine/sim/constants';
import { RNG, hashString } from '../../util/rng';
import { fill, type Ctx } from '../../engine/management/fans';
import { liveFlags, loreCtx, type LiveFlag } from '../../engine/management/buzzCore';
import { legacyChat } from '../../engine/management/legacy';
import { useStore } from '../../store/game';
import { useSession } from './session';
import { EMOTE_INFO } from './chatLines';
import { PERSONAS, PERSONA_COUNT, EMOTE_MOOD, REGION_LEAGUE, type Persona, type Moment } from './chatMemes';
import { _drainExternal, _drainDesk, _recordLine, _setMeta, getTemplateShare, type ExternalLine } from './chatFeed';
import { EN_PACK, type ChatPack } from './chatPack';
import { VI_PACK } from './chatVi';
import { pickDesk } from './broadcast/commentary';
import { useCasterPrefs } from './broadcast/prefs';
import { buildBroadcastCtx } from './broadcast/context';
import { AudienceTracker, roundViewers, type AudienceBase } from './broadcast/audience';
import { headlineNotes, WEIRD, type PickReport, type PickNote, type PickKind } from './broadcast/picks';
import { ChatMoments, type MomentHost, type Voice } from './chatMoments';
import { chatWorld, type ChatWorld } from './chatWorld';

// ------------------------------------------------------------------ public types
export type Tone = 'hype' | 'sad' | 'lore';
export type BadgeKind = 'gm' | 'mod' | 'vip' | 'sub' | 'predBlue' | 'predPink' | 'bits' | 'bot' | 'gifter' | 'verified';
export interface Badge { k: BadgeKind; n?: number }
export interface ChatOut {
  id: number;
  kind: 'msg' | 'notice' | 'system';
  name?: string;
  color?: string;
  badges?: Badge[];
  text: string;
  tone?: Tone;
  reply?: { to: string; text: string };
  first?: boolean;        // first-time chatter (highlighted)
  mentionsMe?: boolean;   // someone @'d the manager
  self?: boolean;         // typed by the user
  notice?: 'sub' | 'gift' | 'bits' | 'raid' | 'poll' | 'timeout';
  title?: string;         // notice headline (the text is the attached user message, if any)
  deleted?: boolean;
  persona?: string;
  amount?: number;        // Super Chat amount (YouTube, ₫)
}
export interface PollView { title: string; opts: { label: string; color: string; pct: number; pts: number; users: number }[]; state: 'open' | 'locked' | 'done'; lockIn: number; winner: 0 | 1 | null }
export interface ComboView { token: string; count: number; tone?: Tone; live: boolean; key: number }
export interface BrainMeta { hype: number; viewers: number; poll: PollView | null; combo: ComboView | null; watching: string[]; lore: string | null; lang: 'en' | 'vi'; pinned?: string; cue?: { id: number; kind: 'phone' } }
export interface TickOut { out: ChatOut[]; deleted: number[] }

// ------------------------------------------------------------------ internals
type Who = Persona | 'crowd' | 'mod' | 'bot' | 'gm' | 'ext';
interface Chatter {
  name: string; color: string; who: Who;
  sub: number; mod?: boolean; vip?: boolean; bot?: boolean; bits?: number; gifter?: boolean; pred?: 0 | 1; gm?: boolean;
  regular: boolean; spoke?: boolean; timedOutUntil?: number; first?: boolean;
}
interface Pending { at: number; pri: number; ch: Chatter | null; msg: Omit<ChatOut, 'id'>; wave?: boolean; claim?: boolean; simAt: number; onRelease?: (id: number) => void }
interface Claim { kind: string; ch: Chatter; text: string; t: number; data?: { player?: string; side?: 0 | 1; role?: string } ; done?: boolean }
interface Wave { key: string; token: string; alt: string[]; total: number; spawned: number; count: number; start: number; until: number; tone?: Tone; pri: number; seq: number }
interface Hist { id: number; ch: Chatter | null; text: string; t: number }
interface Poll { title: string; pts: [number, number]; users: [number, number]; state: 'open' | 'locked' | 'done'; lockAt: number; winner: 0 | 1 | null; frac: number }

const NAME_COLORS = ['#ff5a5a', '#6b9bff', '#2fbf71', '#ff7f50', '#9acd32', '#ff8c1a', '#3cb371', '#daa520', '#e0884f', '#5fb3b3', '#3ea6ff', '#ff69b4', '#b18cff', '#00d68f', '#f0c674', '#c084fc', '#f472b6', '#38bdf8', '#facc15', '#fb923c', '#a3e635', '#2dd4bf'];
const MULTI = ['', '', 'double kill', 'triple kill', 'quadra kill', 'PENTAKILL'];
const ROLE_LABEL: Record<Role, string> = { top: 'top', jungle: 'jungle', mid: 'mid', adc: 'bot', support: 'support' };
const nameBefore = (text: string, sep: RegExp) => text.split(sep)[0]?.trim();
const short1 = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fmtPts = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
const isEmote = (w: string) => w in EMOTE_INFO;
const MAX_PER_TICK = 5;

/** The manager's chat handle (the user typing in chat). */
export function managerHandle(): string {
  return (useStore.getState().state?.manager?.name ?? 'Manager').replace(/\s+/g, '_').replace(/[^\w.-]/g, '').slice(0, 24) || 'Manager';
}

/** Read what the chat needs from the stores once per game (anomaly flags, lore, title storylines, series score,
 *  the stream audience model and what's notable about the picks). */
export function readSetup(teams: [Team, Team], us: 0 | 1, sim?: MatchSim) {
  const state = useStore.getState().state;
  const flags: Record<string, LiveFlag> = state ? liveFlags(state) : {};
  const lore = state ? loreCtx(state, teams[0], teams[1]) : null;
  const fans = teams[us].fans ?? 100000;
  const sess = useSession.getState().s;
  let aud: AudienceBase | null = null, picks: PickReport | null = null, vi = false;
  if (sim) {
    try {
      const bc = buildBroadcastCtx(state, sess ? { fixtureId: sess.fixtureId, gameNo: sess.gameNo, series: sess.series, draft: sess.draft } : null, sim, teams, us);
      aud = bc.audience; picks = bc.picks;
      // the Hoàng Luân desk streams on YouTube in Vietnamese: the chat follows (chatVi.ts)
      const mode = useCasterPrefs.getState().mode;
      vi = mode !== 'off' && pickDesk(bc, mode).pbp === 'hoangluan';
    } catch { /* the chat works without them */ }
  }
  // no fixture (e.g. a test game): a rough number from our fanbase
  const base = aud?.viewers ?? Math.round(Math.sqrt(Math.max(1000, fans)) * 35 * (0.7 + (teams[us].hype ?? 50) / 160));
  const f = state && sess ? state.fixtures[sess.fixtureId] : undefined;
  const lc = state && f ? legacyChat(state, f) : null;
  // what the Vietnamese chat knows about the world around the match (chatWorld.ts → chatMoments.ts)
  let world: ChatWorld | null = null;
  if (vi && sim) { try { world = chatWorld(state, f, teams, sim); } catch { /* optional */ } }
  const games = sess?.series.games ?? [];
  const me = teams[us].id;
  const mine = games.filter((g) => g.winner === me).length, theirs = games.filter((g) => g.winner && g.winner !== me).length;
  const bestOf = f?.bestOf ?? 1;
  const leg = lc && f ? { ...lc, need: Math.ceil(bestOf / 2), mine, theirs } : null;
  return {
    flags, lore, base, aud, picks, leg, bestOf, mine, theirs, gameNo: sess?.gameNo ?? games.length + 1,
    comp: (f && state?.competitions[f.competitionId]?.name) || 'Match day', vi,
    patch: state?.patch ?? '26.x',
    me: managerHandle(),
    world,
  };
}
export type ChatSetup = Omit<ReturnType<typeof readSetup>, 'world'> & { world?: ChatWorld | null };

export class ChatBrain {
  /** What the chat says and which platform it pretends to be (Twitch in English, YouTube in Vietnamese). */
  private P: ChatPack;
  private rng: RNG;
  private us: 0 | 1;
  private them: 0 | 1;
  private base: Ctx;
  private roster: Chatter[] = [];
  private byPersona = new Map<Who, Chatter[]>();
  private byName = new Map<string, Chatter>();
  private nightbot: Chatter;
  private elements: Chatter;
  private mods: Chatter[] = [];
  private gm: Chatter;
  private queue: Pending[] = [];
  private seq = 1;
  private tokens = 4;
  private now = 0;
  private startReal = 0;
  private lastNow = 0;
  private lastSimT = 0;
  private rate = 1;               // sim seconds per real second (smoothed): the playback speed
  private pausedFor = 0;
  private excite = 20;
  private mood: keyof typeof EMOTE_MOOD = 'neutral';
  private moodUntil = 0;
  private history: Hist[] = [];
  private claims: Claim[] = [];
  private wave: Wave | null = null;
  private waveSeq = 0;
  private lastWaveAt = -1e9;
  private poll: Poll | null = null;
  private pollUserBets = 0;
  private viewersBoost = 0;
  private raidDone = false;
  private raidAt: number;
  private nextScene = 0;
  private nextNotice = 0;
  private nextBot = 0;
  private nextMod = 0;
  private lastReactAt = 0;
  private endAt = 0;
  private ctxCache: Ctx | null = null;
  private ctxAt = -1;
  private pauseWaved = false;
  private deleted: number[] = [];
  private firstSeen = new Set<string>();
  // game-state watchers (ported from the first chat)
  private idx = 0;
  private started = false;
  private ended = false;
  private chain = new Map<number, number[]>();
  private maxLead = 0;
  private minLead = 0;
  private leadSaid = 0;
  private long = 0;
  private lastClaimCheck = 0;
  private objSeen = new Set<string>();
  private nexusPrev: [number, number] = [NEXUS_HP, NEXUS_HP];
  private nexusHitAt: [number, number] = [-999, -999];
  private inhibAt: [number, number] = [-999, -999];
  private raceSaid = -999;
  private endSaid = -999;
  private defendSaid = -999;
  private aud: AudienceTracker | null = null;
  private picks: PickReport | null = null;
  private pickSaid = new Map<number, number>();
  private audIdx = 0;
  /** The Vietnamese chat's game-reading moments (chatMoments.ts); null for the English chat. */
  private moments: ChatMoments | null = null;
  private cueSeq = 0;
  meta: BrainMeta = { hype: 20, viewers: 0, poll: null, combo: null, watching: [], lore: null, lang: 'en' };

  constructor(private sim: MatchSim, private teams: [Team, Team], userSide: 0 | 1, private setup: ChatSetup) {
    this.P = setup.vi ? VI_PACK : EN_PACK;
    this.us = userSide;
    this.them = (1 - userSide) as 0 | 1;
    this.rng = new RNG(hashString(teams[0].id + teams[1].id + sim.events.length + ':' + Date.now()));
    const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, '') || 'Team';
    const champsOf = (side: 0 | 1) => sim.champs.filter((c) => c.side === side);
    const starOf = (side: 0 | 1) => [...champsOf(side)].sort((a, b) => b.input.mech + b.input.lane + b.input.mastery - (a.input.mech + a.input.lane + a.input.mastery))[0];
    const roleName = (side: 0 | 1, r: Role) => champsOf(side).find((c) => c.role === r)?.input.name;
    const star = starOf(this.us), oppstar = starOf(this.them);
    const region = REGION_LEAGUE[teams[this.us].region] ?? 'LCK', oppregion = REGION_LEAGUE[teams[this.them].region] ?? 'LPL';
    this.base = {
      short: teams[this.us].short, oppShort: teams[this.them].short,
      star: star?.input.name, starchamp: star?.champ.name, oppstar: oppstar?.input.name, oppstarchamp: oppstar?.champ.name,
      ourtop: roleName(this.us, 'top'), ourjg: roleName(this.us, 'jungle'), ourmid: roleName(this.us, 'mid'), ouradc: roleName(this.us, 'adc'), oursup: roleName(this.us, 'support'),
      opptop: roleName(this.them, 'top'), oppjg: roleName(this.them, 'jungle'), oppmid: roleName(this.them, 'mid'), oppadc: roleName(this.them, 'adc'), oppsup: roleName(this.them, 'support'),
      region, oppregion: oppregion === region ? undefined : oppregion,
      a: teams[0].short, b: teams[1].short, comp: setup.comp, patch: setup.patch, bo: setup.bestOf, need: Math.ceil(setup.bestOf / 2),
      gameno: setup.gameNo, series: `${teams[this.us].short} ${setup.mine}-${setup.theirs} ${teams[this.them].short}`, me: setup.me,
      ...(setup.lore ?? {}),
      ...(setup.world?.ctx ?? {}),
    };
    if (setup.leg) Object.assign(this.base, setup.leg.ctx, { short: teams[this.us].short, oppShort: teams[this.them].short });

    // the channel's regulars: seeded by the user's team so the same people show up every game of the save
    const seedRng = new RNG(hashString('chat-regulars:' + teams[this.us].id));
    const subMonths = [0, 0, 1, 2, 3, 5, 6, 9, 12, 14, 18, 24, 30, 36, 48];
    const used = new Set<string>();
    for (const p of PERSONAS) {
      const pats = seedRng.shuffle([...this.P.PERSONA_NAMES[p]]);
      for (let i = 0; i < PERSONA_COUNT[p] && i < pats.length; i++) {
        let name = pats[i].replace('{short}', alnum(teams[this.us].short)).replace('{opp}', alnum(teams[this.them].short)).replace('{n}', String(seedRng.int(2, 99)));
        if (used.has(name)) continue;
        used.add(name);
        const loyal = p === 'superfan' || p === 'doomer' || p === 'copypasta' || p === 'analyst';
        const ch: Chatter = {
          name, who: p, color: NAME_COLORS[hashString(name) % NAME_COLORS.length], regular: true,
          sub: loyal ? seedRng.pick(subMonths.slice(4)) : p === 'rival' || p === 'casual' ? 0 : seedRng.pick(subMonths),
          vip: (p === 'copypasta' || p === 'analyst') && seedRng.chance(0.35), bits: seedRng.chance(0.15) ? seedRng.pick([100, 1000, 5000, 10000]) : undefined,
          gifter: p === 'superfan' && seedRng.chance(0.4),
        };
        this.addChatter(ch);
      }
    }
    for (const n of seedRng.shuffle([...this.P.MOD_NAMES]).slice(0, 2)) this.mods.push(this.addChatter({ name: n, who: 'mod', color: NAME_COLORS[hashString(n) % NAME_COLORS.length], sub: seedRng.int(6, 40), mod: true, regular: true }));
    this.nightbot = this.addChatter({ name: this.P.BOTS.nightbot, who: 'bot', color: '#7c8cff', sub: 0, mod: true, bot: true, regular: true });
    this.elements = this.addChatter({ name: this.P.BOTS.elements, who: 'bot', color: '#53fc18', sub: 0, mod: true, bot: true, regular: true });
    this.gm = { name: setup.me, who: 'gm', color: '#f0c674', sub: 0, gm: true, regular: true };
    this.raidAt = this.rng.range(8, 24) * 60;
    this.aud = setup.aud ? new AudienceTracker(setup.aud) : null;
    this.picks = setup.picks;
    const watching = sim.champs.filter((c) => { const f = setup.flags[c.input.playerId]; return f && f.kind !== 'drop'; }).map((c) => c.input.name);
    this.meta = { hype: 20, viewers: this.aud ? roundViewers(this.aud.viewers) : setup.base, poll: null, combo: null, watching, lore: setup.lore ? this.P.T.lore(String(setup.lore.t1)) : null, lang: this.P.lang, pinned: this.P.CHANNEL_LINES?.[0] };
    if (this.P.lang === 'vi' && setup.world) this.moments = new ChatMoments(this.momentHost(setup.world));
  }

  /** What chatMoments.ts may do through the brain (it never touches chatters or the queue directly). */
  private momentHost(world: ChatWorld): MomentHost {
    const voice = (v: Voice): Chatter => {
      if (typeof v === 'object') return this.byName.get(v.as.toLowerCase()) ?? this.crowd();
      switch (v) {
        case 'speaker': return this.speaker();
        case 'crowd': return this.crowd();
        case 'anyone': return this.anyone();
        case 'member': { const c = this.regular('superfan'); if (c.sub <= 0) c.sub = this.rng.pick([2, 3, 6, 12, 24]); return c; }
        default: return this.regular(v);
      }
    };
    return {
      rng: this.rng, sim: this.sim, teams: this.teams, us: this.us, them: this.them, world, picks: this.picks,
      series: { bestOf: this.setup.bestOf, mine: this.setup.mine, theirs: this.setup.theirs, gameNo: this.setup.gameNo },
      has: (cat) => !!this.P.LINES[cat]?.length,
      pool: (cat) => this.P.LINES[cat],
      f: (pool, extra) => this.f(pool, extra),
      say: (cat, ctx, n, tone, delay, important) => this.say(cat, ctx, n, tone, delay, important),
      line: (who, text, delay, opt = {}) => {
        const ch = voice(who);
        // remember one-off viewers too, so the same person can follow up ({ as: name })
        if (!this.byName.has(ch.name.toLowerCase()) && this.byName.size < 600) this.byName.set(ch.name.toLowerCase(), ch);
        if (text) this.post(ch, text, delay * this.ds(), { reply: opt.reply, tone: opt.tone }, opt.pri ?? 1);
        return ch.name;
      },
      wave: (key, ctx, strength, tokens) => this.startWave(key, ctx, strength, tokens),
      excited: (d) => this.excited(d),
      mood: (m, secs) => this.setMood(m, secs),
      cue: (kind) => { this.meta = { ...this.meta, cue: { id: ++this.cueSeq, kind } }; },
      rate: () => this.rate,
    };
  }

  // ------------------------------------------------------------------ chatters
  private addChatter(ch: Chatter): Chatter {
    this.roster.push(ch);
    this.byName.set(ch.name.toLowerCase(), ch);
    const l = this.byPersona.get(ch.who) ?? [];
    l.push(ch);
    this.byPersona.set(ch.who, l);
    return ch;
  }
  private regular(p: Who, notName?: string): Chatter {
    const l = (this.byPersona.get(p) ?? []).filter((c) => c.name !== notName && !(c.timedOutUntil && c.timedOutUntil > this.now));
    return l.length ? this.rng.pick(l) : this.crowd();
  }
  /** A one-off viewer from the crowd. */
  private crowd(): Chatter {
    const u = this.rng.pick(this.P.USERS).replace(/\{n\}/g, String(this.rng.int(1, 999))).replace(/\{short\}/g, String(this.base.short).replace(/[^A-Za-z0-9]/g, ''));
    const ex = this.byName.get(u.toLowerCase());
    if (ex) return ex;
    const ch: Chatter = { name: u, who: 'crowd', color: NAME_COLORS[hashString(u) % NAME_COLORS.length], sub: this.rng.chance(0.4) ? this.rng.pick([1, 2, 3, 6, 9, 12, 24]) : 0, regular: false };
    if (this.poll && this.rng.chance(0.3)) ch.pred = this.rng.chance(this.pollShare(this.us)) ? this.us : this.them;
    return ch;
  }
  /** Someone from our side of the crowd (fans + neutrals; never the rival fans or the bots). */
  private speaker(): Chatter {
    if (this.rng.chance(0.55)) return this.crowd();
    return this.regular(this.rng.weighted(['superfan', 'memer', 'casual', 'wholesome', 'spammer', 'lurker', 'doomer', 'analyst', 'backseat', 'timezone'] as Persona[], (p) => ({ superfan: 3, memer: 3, casual: 1.2, wholesome: 1, spammer: 1.5, lurker: 0.4, doomer: 1, analyst: 0.8, backseat: 0.6, timezone: 0.4 } as Record<string, number>)[p] ?? 1));
  }
  private anyone(notName?: string): Chatter {
    if (this.rng.chance(0.5)) return this.crowd();
    const l = this.roster.filter((c) => !c.bot && !c.mod && c.name !== notName && c.who !== 'copypasta');
    return this.rng.pick(l);
  }

  // ------------------------------------------------------------------ context
  private gold(side: 0 | 1) { let g = 0; for (const c of this.sim.champs) if (c.side === side) g += c.goldEarned; return g; }
  private lead() { return this.gold(this.us) - this.gold(this.them); }
  private ctx(): Ctx {
    if (this.ctxCache && this.ctxAt === this.now) return this.ctxCache;
    const sim = this.sim, us = this.us, them = this.them, tm = sim.teams, rng = this.rng;
    const lead = this.lead(), k = `${(Math.abs(lead) / 1000).toFixed(1)}k`;
    const mins = Math.max(1, Math.floor(sim.t / 60));
    const leader = lead >= 0 ? this.base.short : this.base.oppShort, trailer = lead >= 0 ? this.base.oppShort : this.base.short;
    const ours = sim.champs.filter((c) => c.side === us), theirs = sim.champs.filter((c) => c.side === them);
    const cs = (l: SimChamp[]) => l.reduce((a, c) => a + c.cs, 0);
    const star = ours.find((c) => c.input.name === this.base.star);
    const flashDown = sim.champs.filter((c) => !c.dead && c.flashReadyAt > sim.t + 30).map((c) => c.input.name).slice(0, 2);
    // the biggest lane gap
    let diff: { role: Role; g: number; name: string; side: 0 | 1 } | null = null;
    for (const r of ['top', 'jungle', 'mid', 'adc', 'support'] as Role[]) {
      const a = ours.find((c) => c.role === r), b = theirs.find((c) => c.role === r);
      if (!a || !b) continue;
      const g = a.goldEarned - b.goldEarned;
      if (Math.abs(g) >= 1200 && (!diff || Math.abs(g) > Math.abs(diff.g))) diff = { role: r, g, name: g > 0 ? a.input.name : b.input.name, side: g > 0 ? us : them };
    }
    const winSide = sim.winner ?? (lead >= 0 ? us : them);
    const mvp = [...sim.champs.filter((c) => c.side === winSide)].sort((a, b) => (b.kills * 3 + b.assists * 2 - b.deaths * 2) - (a.kills * 3 + a.assists * 2 - a.deaths * 2))[0];
    const others = this.P.LEAGUES.filter((l) => l !== this.base.region && l !== this.base.oppregion);
    const upMin = Math.floor((this.now - this.startReal) / 60000) + 74;
    const p = this.poll;
    const c: Ctx = {
      ...this.base,
      mins, score: `${tm[us].kills}-${tm[them].kills}`, gold: k, lead: Math.abs(lead) < 300 ? 'dead even' : `${leader} +${k}`, leader, trailer,
      csdiff: `${cs(ours) - cs(theirs) >= 0 ? '+' : ''}${cs(ours) - cs(theirs)}`,
      starcs: star?.cs, starcspm: star ? (star.cs / Math.max(1, sim.t / 60)).toFixed(1) : undefined,
      drakes: tm[us].dragons.length, oppdrakes: tm[them].dragons.length, towers: tm[us].towers, opptowers: tm[them].towers,
      flashdown: flashDown.length ? flashDown.join(' and ') : undefined,
      gpm: Math.round(this.gold(lead >= 0 ? us : them) / Math.max(1, sim.t / 60)),
      diffrole: diff ? ROLE_LABEL[diff.role] : undefined, diffname: diff?.name, diffside: diff ? this.teams[diff.side].short : undefined, diffgold: diff ? `${(Math.abs(diff.g) / 1000).toFixed(1)}k` : undefined,
      mvp: mvp?.input.name,
      rnd: rng.pick(sim.champs).input.name, rchamp: rng.pick(sim.champs).champ.name,
      item: rng.pick(this.P.ITEMS), role: rng.pick(['top', 'jungle', 'mid', 'bot', 'support']),
      city: rng.pick(this.P.CITIES), city2: rng.pick(this.P.CITIES), hour: rng.int(1, 6), hour2: rng.int(1, 11), region2: rng.pick(others.length ? others : this.P.LEAGUES),
      ka: tm[0].kills, kb: tm[1].kills, uptime: `${Math.floor(upMin / 60)}h ${upMin % 60}m`,
      pollstate: p ? (p.state === 'open' ? 'open' : p.state === 'locked' ? 'locked' : 'closed') : undefined,
      p1: p ? `${this.teams[0].short} ${Math.round(this.pollPct(0))}% · ${this.teams[1].short} ${Math.round(this.pollPct(1))}%` : undefined,
    };
    this.ctxCache = c;
    this.ctxAt = this.now;
    return c;
  }
  private f(pool: readonly string[] | undefined, extra: Ctx = {}): string | null {
    if (!pool?.length) return null;
    const c = { ...this.ctx(), ...extra };
    for (let k = 0; k < 5; k++) { const t = fill(this.rng.pick(pool), c); if (t) return t; }
    return null;
  }

  // ------------------------------------------------------------------ posting
  private badges(ch: Chatter): Badge[] {
    const b: Badge[] = [];
    if (this.P.platform === 'youtube') {
      // YouTube: the channel's own account (verified), moderators, members (months)
      if (ch.gm) b.push({ k: 'gm' });
      if (ch.bot && ch === this.elements) b.push({ k: 'verified' });
      if (ch.mod) b.push({ k: 'mod' });
      if (ch.sub > 0 && !ch.bot) b.push({ k: 'sub', n: ch.sub });
      return b;
    }
    if (ch.gm) b.push({ k: 'gm' });
    if (ch.mod) b.push({ k: 'mod' });
    if (ch.bot) b.push({ k: 'bot' });
    if (ch.vip) b.push({ k: 'vip' });
    if (ch.pred !== undefined) b.push({ k: ch.pred === 0 ? 'predBlue' : 'predPink' });
    if (ch.sub > 0) b.push({ k: 'sub', n: ch.sub });
    if (ch.gifter) b.push({ k: 'gifter' });
    if (ch.bits) b.push({ k: 'bits', n: ch.bits });
    return b;
  }
  /** Delay scale: reactions come faster when the game is played fast. */
  private ds() { return this.rate >= 24 ? 0.45 : this.rate >= 10 ? 0.7 : 1; }
  private enqueue(p: Pending) {
    // keep the queue sorted by release time (binary insert)
    let lo = 0, hi = this.queue.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.queue[m].at <= p.at) lo = m + 1; else hi = m; }
    this.queue.splice(lo, 0, p);
  }
  private post(ch: Chatter, text: string, delay: number, extra: Partial<ChatOut> = {}, pri = 1, opt: { wave?: boolean; claim?: boolean; onRelease?: (id: number) => void } = {}) {
    if (!text) return;
    this.enqueue({ at: this.now + Math.max(0, delay) * 1000, pri, ch, msg: { kind: 'msg', text, ...extra }, wave: opt.wave, claim: opt.claim, simAt: this.sim.t, onRelease: opt.onRelease });
  }
  /** A prediction / call that only makes sense in the game state it was made in (dropped if it goes stale). */
  private postClaim(ch: Chatter, text: string, delay: number, kind: string, data?: Claim['data'], pri = 1) {
    this.post(ch, text, delay, {}, pri, { claim: true, onRelease: () => this.claim(kind, ch, text, data) });
  }
  private notice(n: ChatOut['notice'], title: string, delay: number, text = '', ch: Chatter | null = null, kind: ChatOut['kind'] = 'notice') {
    this.enqueue({ at: this.now + delay * 1000, pri: 3, ch, msg: { kind, notice: n, title, text }, simAt: this.sim.t });
  }
  /** Scale how many lines an event produces: fewer at high speed and when the AI chat takes over. */
  private scaleN(n: number, important = false) {
    const share = 0.45 + 0.55 * getTemplateShare();
    const speed = this.rate >= 32 ? 0.45 : this.rate >= 16 ? 0.65 : 1;
    const x = n * share * speed;
    const out = Math.floor(x) + (this.rng.next() < x - Math.floor(x) ? 1 : 0);
    return important ? Math.max(1, out) : out;
  }
  /** Queue `n` lines of an event category spoken by the crowd. */
  private say(cat: string, ctx: Ctx = {}, n = 1, tone?: Tone, delay = 0.4, important = false) {
    const pool = this.P.LINES[cat];
    if (!pool?.length) return;
    n = this.scaleN(n, important);
    let at = delay * this.ds();
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      // different people say different things (a short pool may still repeat)
      let text = this.f(pool, ctx);
      for (let k = 0; k < 3 && text && used.has(text); k++) text = this.f(pool, ctx);
      if (!text) continue;
      used.add(text);
      this.post(this.speaker(), text, at + this.rng.range(0, 0.4), { tone }, 2);
      at += this.rng.range(0.5, 2.4) * this.ds();
    }
    this.lastReactAt = this.now;
  }
  /** One persona's take on a moment ("good" = good for the user's team). */
  private personaSay(m: Moment, ctx: Ctx = {}, chance = 0.6, delay = 1.2) {
    if (!this.rng.chance(chance * (0.4 + 0.6 * getTemplateShare()))) return;
    const w: Partial<Record<Persona, number>> =
      m === 'good' || m === 'bigGood' || m === 'ahead' || m === 'win'
        ? { superfan: 3, memer: 2, rival: 1.6, doomer: 1, analyst: 1, backseat: 0.5, wholesome: 0.7 }
        : { rival: 3, doomer: 2.5, superfan: 1.6, memer: 1.5, backseat: 1.4, analyst: 1, wholesome: 0.6 };
    const ps = (Object.keys(w) as Persona[]).filter((p) => this.P.PERSONA_REACT[p]?.[m]?.length);
    if (!ps.length) return;
    const p = this.rng.weighted(ps, (x) => w[x] ?? 1);
    // a doomer way ahead doesn't call ff on one lost fight, he predicts the throw
    const lead = this.lead();
    const mm: Moment = p === 'doomer' && m === 'bad' && lead > 2500 ? 'ahead' : m;
    const text = this.f(this.P.PERSONA_REACT[p]![mm] ?? this.P.PERSONA_REACT[p]![m], ctx);
    if (text) this.post(this.regular(p), text, (delay + this.rng.range(0, 1.5)) * this.ds(), {}, 2);
  }
  private setMood(m: keyof typeof EMOTE_MOOD, secs = 12) { this.mood = m; this.moodUntil = this.now + secs * 1000; }
  private excited(d: number) { this.excite = Math.min(100, this.excite + d); }

  // ------------------------------------------------------------------ emote waves
  private startWave(key: string, ctx: Ctx = {}, strength = 0.6, tokens?: string[]) {
    const def = this.P.WAVES[key];
    if (!def || !(tokens?.length || def.tokens.length)) return;
    const active = this.wave && this.now < this.wave.until;
    if (active && this.wave!.pri > def.pri) return;
    if (!active && this.now - this.lastWaveAt < 2500 && def.pri < 3) return;
    const c = { ...this.ctx(), ...ctx };
    const toks = (tokens?.length ? tokens : def.tokens).map((t) => fill(t, c)).filter((t): t is string => !!t);
    if (!toks.length) return;
    const token = this.rng.pick(toks);
    const crowdSize = Math.min(1.6, Math.max(0.6, Math.log10(Math.max(1000, this.meta.viewers)) / 3.6));
    const total = Math.round((def.size[0] + (def.size[1] - def.size[0]) * Math.min(1, strength)) * crowdSize * (this.rate >= 32 ? 0.6 : 1));
    const dur = (3.2 + Math.min(1, strength) * 2.6) * 1000;
    this.wave = { key, token, alt: toks.filter((t) => t !== token), total, spawned: 0, count: 0, start: this.now, until: this.now + dur, tone: def.tone, pri: def.pri, seq: ++this.waveSeq };
    this.lastWaveAt = this.now;
  }
  private waveTick() {
    const w = this.wave;
    if (!w || w.spawned >= w.total) return;
    const due = Math.min(w.total, Math.ceil((w.total * (this.now - w.start)) / Math.max(1, w.until - w.start - 600)));
    while (w.spawned < due) {
      w.spawned++;
      const r = this.rng.next();
      const tok = w.token, alt = w.alt.length ? this.rng.pick(w.alt) : tok;
      // a phrase ("END END END", "WE ARE SO BACK") repeats less than a single emote
      const text = this.rng.chance(1 - this.P.repeat) ? (r < 0.85 ? tok : alt)
        : tok.includes(' ')
        ? r < 0.55 ? tok : r < 0.75 ? `${tok.toUpperCase()}!!!` : r < 0.9 ? `${tok} ${alt}` : `${tok} ${tok}`
        : r < 0.42 ? tok : r < 0.66 ? `${tok} ${tok}` : r < 0.78 ? `${tok} ${tok} ${tok}` : r < 0.88 ? `${tok} ${alt}` : r < 0.94 && !isEmote(tok) ? `${tok.toUpperCase()}!!!` : `${tok} ${tok} ${tok} ${tok}`;
      const occ = text.split(tok).length - 1;
      const seq = w.seq;
      this.post(this.rng.chance(0.75) ? this.crowd() : this.speaker(), text, this.rng.range(0, 0.25), { tone: w.tone }, 2, { wave: true, onRelease: () => { if (this.wave && this.wave.seq === seq) this.wave.count += Math.max(1, occ); } });
    }
  }

  // ------------------------------------------------------------------ claims (chat's memory)
  private claim(kind: string, ch: Chatter, text: string, data?: Claim['data']) {
    if (this.claims.some((c) => !c.done && c.kind === kind && c.ch.name === ch.name)) return;
    if (this.claims.filter((c) => !c.done && c.kind === kind).length >= 6) return;
    this.claims.push({ kind, ch, text, t: this.sim.t, data });
  }
  /** Someone calls out (or credits) what a chatter said earlier, as a Twitch reply. */
  private callout(kind: string, c: Claim, delay: number, extra: Ctx = {}, answerPool?: string[]) {
    c.done = true;
    const pool = this.P.CALLOUTS[kind];
    const when = this.P.T.when(`${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')}`);
    const who = kind === 'ez' || kind === 'stealMiss' || kind === 'fbWrong' || kind === 'longMiss' || kind === 'shortMiss'
      ? this.rng.chance(0.4) ? this.regular('rival') : this.regular(this.rng.pick(['memer', 'doomer', 'casual'] as Persona[]), c.ch.name)
      : this.rng.chance(0.35) ? this.crowd() : this.regular(this.rng.pick(['memer', 'superfan', 'wholesome', 'analyst'] as Persona[]), c.ch.name);
    const text = this.f(pool, { user: c.ch.name, quote: short1(c.text, 40), when, player: c.data?.player, ...extra });
    if (!text) return;
    this.post(who, text, delay, { reply: { to: c.ch.name, text: c.text } }, 2);
    if (answerPool && this.rng.chance(0.55)) {
      const back = this.f(answerPool, {});
      if (back) this.post(c.ch, `@${who.name} ${back}`, delay + this.rng.range(2, 4.5), { reply: { to: who.name, text } }, 2);
    }
    // the pile-on
    if (this.rng.chance(0.5)) {
      const pile = this.f(this.P.T.pileOn, { user: c.ch.name });
      if (pile) this.post(this.crowd(), pile, delay + this.rng.range(1, 3), {}, 1);
    }
  }
  private resolve(kind: string, out: string, filter: (c: Claim) => boolean = () => true, max = 2, answerPool?: string[], extra: Ctx = {}) {
    let n = 0, d = 2.2;
    for (const c of this.claims) {
      if (c.done || c.kind !== kind || !filter(c)) continue;
      if (n++ >= max) { c.done = true; continue; }
      this.callout(out, c, d * this.ds() + this.rng.range(0, 1.5), extra, answerPool);
      d += 2.5;
    }
  }
  /** Lines released in chat also leave claims (works for the AI chat's lines too). */
  private sniff(ch: Chatter, text: string) {
    if (ch.bot || ch.mod || ch.gm || this.sim.winner !== null) return;
    const lead = this.lead();
    const sn = this.P.sniff;
    if (lead <= -1500 && sn.gg.test(text) && ch.who !== 'rival') this.claim('gg', ch, text);
    else if (lead >= 2000 && sn.ez.test(text) && ch.who !== 'rival') this.claim('ez', ch, text);
    else if (sn.steal.test(text) && this.baronLive()) this.claim('steal', ch, text);
  }
  private baronLive() { return this.sim.objectives.some((o) => (o.kind === 'baron' || o.kind === 'elder') && o.alive && o.attackers.size > 0); }

  // ------------------------------------------------------------------ the poll
  private pollShare(side: 0 | 1) { const p = this.poll; if (!p) return 0.5; const t = p.pts[0] + p.pts[1]; return t ? p.pts[side] / t : 0.5; }
  private pollPct(side: 0 | 1) { return this.pollShare(side) * 100; }
  private pollTick(dt: number) {
    const p = this.poll;
    if (!p) return;
    if (p.state === 'open') {
      const lead0 = this.gold(0) - this.gold(1);
      const fav = 0.5 + (this.us === 0 ? 0.12 : -0.12) + Math.max(-0.25, Math.min(0.25, lead0 / 16000));
      p.frac += (Math.min(this.meta.viewers, 250_000) / 2200) * dt * this.rng.range(0.5, 1.5);
      while (p.frac >= 1) {
        p.frac -= 1;
        const side: 0 | 1 = this.rng.chance(fav) ? 0 : 1;
        p.users[side]++;
        p.pts[side] += Math.round(Math.exp(this.rng.normal(7.6, 1.1)));
      }
      if (this.sim.t >= p.lockAt || this.sim.winner !== null) {
        p.state = 'locked';
        this.notice('poll', this.P.T.pollLocked(p.title), 0.2, `${this.teams[0].short} ${Math.round(this.pollPct(0))}% · ${this.teams[1].short} ${Math.round(this.pollPct(1))}%`);
        const bettors = this.roster.filter((c) => c.pred !== undefined);
        for (let i = 0; i < Math.min(2, bettors.length); i++) { const t = this.f(this.P.POLL.locked); if (t) this.post(this.rng.pick(bettors), t, 1 + i * 2, {}, 1); }
      }
    }
    if (p.state !== 'done' && this.sim.winner !== null) {
      p.state = 'done';
      p.winner = this.sim.winner;
      const w = p.winner, l = (1 - w) as 0 | 1;
      const pool = p.pts[w] + p.pts[l];
      this.notice('poll', this.P.T.pollResult(this.teams[w].short), 3, this.P.T.pollResultText(p.users[w], p.users[l], fmtPts(pool)));
      const bettors = this.roster.filter((c) => c.pred !== undefined);
      let d = 5;
      for (const c of this.rng.shuffle(bettors).slice(0, 4)) {
        const t = this.f(c.pred === w ? this.P.POLL.won : this.P.POLL.lost, { pts: fmtPts(Math.exp(this.rng.normal(9, 1))) });
        if (t) this.post(c, t, d, {}, 2);
        d += this.rng.range(1.2, 3);
      }
    }
  }
  private pollView(): PollView | null {
    const p = this.poll;
    if (!p) return null;
    const lockIn = Math.max(0, p.lockAt - this.sim.t);
    return {
      title: p.title, state: p.state, lockIn, winner: p.winner,
      opts: ([0, 1] as const).map((s) => ({ label: this.teams[s].short, color: s === 0 ? '#387aff' : '#f5009b', pct: Math.round(this.pollPct(s)), pts: p.pts[s], users: p.users[s] })),
    };
  }
  /** Fans bet on their team (doomers hedge against it now and then), everyone else follows the crowd. */
  private betSide(ch: Chatter): 0 | 1 {
    if (ch.pred !== undefined) return ch.pred;
    if (ch.who === 'rival') return this.them;
    if (ch.who === 'superfan') return this.us;
    if (ch.who === 'doomer') return this.rng.chance(0.4) ? this.them : this.us;
    return this.rng.chance(Math.max(0.3, Math.min(0.8, this.pollShare(this.us)))) ? this.us : this.them;
  }
  private bet(ch: Chatter, side: 0 | 1, delay: number) {
    const p = this.poll;
    if (!p || p.state !== 'open') return;
    const pts = Math.max(500, Math.round(Math.exp(this.rng.normal(9.2, 1.2)) / 100) * 100);
    const t = this.f(this.P.POLL.bet, { team: this.teams[side].short, pts: fmtPts(pts) });
    if (!t) return;
    this.post(ch, t, delay, {}, 1, { onRelease: () => { ch.pred = side; if (p.state === 'open') { p.pts[side] += pts; p.users[side]++; } } });
    this.pollUserBets++;
  }

  // ------------------------------------------------------------------ the game start
  private start() {
    this.started = true;
    const s = this.setup;
    this.say('start', {}, 3, undefined, 0.2, true);
    if (s.lore) this.say('lore_start', {}, 2, 'lore', 2, true);
    const leg = s.leg;
    if (leg) {
      if (leg.mine + leg.theirs === 0) leg.start.forEach((c, i) => this.say(c, {}, i ? 1 : 2, 'lore', 2.5 + i * 2, true));
      else if (leg.final && leg.mine === leg.need - 1) this.say('leg_chat_mp_us', {}, 2, 'hype', 2.5, true);
      else if (leg.final && leg.theirs === leg.need - 1) this.say('leg_chat_mp_them', {}, 2, 'sad', 2.5, true);
    }
    const odd = this.sim.champs.filter((c) => s.flags[c.input.playerId] && s.flags[c.input.playerId].kind !== 'drop').slice(0, 2);
    for (const c of odd) this.say('anomaly_start', { player: c.input.name }, 1, undefined, 3, true);
    // backseat drafting
    for (let i = 0, d = 2; i < this.rng.int(1, 3); i++, d += this.rng.range(2, 5)) {
      const t = this.f(this.P.DRAFT_TAKES);
      const ch = this.regular(this.rng.pick(['backseat', 'analyst', 'memer', 'rival', 'doomer'] as Persona[]));
      if (!t) continue;
      this.post(ch, t, d, {}, 1);
      if (this.rng.chance(0.35)) { const x = this.f(this.P.BACKSEAT_REPLIES, { user: ch.name }); if (x) this.post(this.anyone(ch.name), x, d + this.rng.range(1.5, 3), { reply: { to: ch.name, text: t } }, 1); }
    }
    // chat reads the draft: weird, signature and counter picks
    this.pickTalk();
    this.moments?.start();
    // predictions people will be held to
    let d = 3;
    for (const pr of this.rng.shuffle([...this.P.PREDICT]).slice(0, this.rng.int(2, 4))) {
      const ch = pr.kind === 'rivalWin' ? this.regular('rival') : this.regular(this.rng.pick(['superfan', 'memer', 'analyst', 'doomer', 'casual'] as Persona[]));
      const text = this.f([pr.text]);
      if (!text) continue;
      const data = { role: pr.role, side: pr.side === 'us' ? this.us : pr.side === 'them' ? this.them : undefined };
      this.postClaim(ch, text, d, pr.kind, data);
      d += this.rng.range(1.5, 4);
    }
    // the channel-points prediction
    this.poll = { title: this.P.T.pollTitle(this.setup.bestOf, this.setup.gameNo), pts: [0, 0], users: [0, 0], state: 'open', lockAt: 600, winner: null, frac: 0 };
    const [pt, ptext] = this.P.T.pollStart(this.poll.title);
    this.notice('poll', pt, 1.5, ptext, this.P.platform === 'youtube' ? this.elements : this.nightbot);
    if (this.P.T.startSystem && this.meta.viewers > 30_000 && this.rng.chance(0.6)) this.notice(undefined, this.P.T.startSystem, 0.5, '', null, 'system');
    for (let i = 0; i < 3; i++) { const ch = this.regular(this.rng.pick(['superfan', 'memer', 'casual', 'rival', 'doomer'] as Persona[])); this.bet(ch, this.betSide(ch), 4 + i * 3 + this.rng.range(0, 3)); }
    this.nextScene = this.now + 6000;
    this.nextNotice = this.now + this.rng.range(8, 20) * 1000;
    this.nextBot = this.now + this.rng.range(25, 50) * 1000;
    this.nextMod = this.now + this.rng.range(60, 120) * 1000;
  }

  // ------------------------------------------------------------------ picks: chat reads the draft
  private pickPersona(n: PickNote): Persona {
    const ours = n.side === this.us;
    const r = this.rng;
    switch (n.kind) {
      case 'troll': return ours ? r.pick(['memer', 'doomer', 'superfan', 'casual'] as Persona[]) : r.pick(['memer', 'superfan', 'casual'] as Persona[]);
      case 'offrole': case 'offmeta': return r.pick(['analyst', 'backseat', 'memer', 'casual'] as Persona[]);
      case 'signature': case 'legacy': case 'onetrick': case 'hotrecord': return ours ? r.pick(['superfan', 'memer', 'wholesome'] as Persona[]) : r.pick(['rival', 'doomer', 'analyst'] as Persona[]);
      case 'first': case 'lowcomfort': case 'coldrecord': return ours ? r.pick(['doomer', 'analyst', 'backseat'] as Persona[]) : r.pick(['superfan', 'memer', 'analyst'] as Persona[]);
      case 'counter': case 'countered': case 'blindmeta': case 'riskyblind': case 'buffed': case 'nerfed': case 'fearless': return r.pick(['analyst', 'backseat', 'analyst', 'memer'] as Persona[]);
      default: return r.pick(['memer', 'analyst', 'casual', 'doomer'] as Persona[]);
    }
  }
  private pickTalk() {
    const r = this.picks;
    if (!r) return;
    let d = 5;
    const notes = headlineNotes(r, this.rng.int(3, 5));
    for (const n of notes) {
      const cat = n.kind === 'troll' && this.rng.chance(0.5) ? (n.side === this.us ? 'pick_troll_us' : 'pick_troll_them') : `pick_${n.kind}`;
      const pool = this.P.LINES[cat] ?? this.P.LINES[`pick_${n.kind}`];
      const ch = this.regular(this.pickPersona(n));
      const text = this.f(pool, { ...n.ctx, me: this.setup.me });
      if (!text) continue;
      this.post(ch, text, d + this.rng.range(0, 1.5), {}, 2);
      // the weird ones always start a little argument
      if (WEIRD.has(n.kind) || n.kind === 'troll') {
        for (let i = 0, k = this.rng.int(1, 3); i < k; i++) { const x = this.f(this.P.LINES.pick_reply, { user: ch.name }); if (x) this.post(this.anyone(ch.name), x, d + 2 + i * this.rng.range(1, 2.2), { reply: { to: ch.name, text } }, 1); }
        if (n.kind === 'troll') this.say(cat, { ...n.ctx, me: this.setup.me }, 2, undefined, d + 3);
      }
      d += this.rng.range(3, 6);
    }
  }
  /** Mid-game: "the Teemo pick is working??", "who let him play Draven". One reaction per kill at most. */
  private pickReact(e: GameEvent) {
    const r = this.picks;
    if (!r || this.rng.chance(0.35)) return;
    const k = this.champ(e.killer), v = this.champ(e.victim);
    const has = (c: SimChamp | undefined, kinds: PickKind[]) => !!c && (r.byIdx.get(c.idx) ?? []).some((n) => kinds.includes(n.kind));
    const note = (c: SimChamp) => (r.byIdx.get(c.idx) ?? [])[0];
    const ready = (c: SimChamp) => this.sim.t - (this.pickSaid.get(c.idx) ?? -1e9) > 160;
    const ctxOf = (c: SimChamp): Ctx => ({ ...(note(c)?.ctx ?? {}), player: c.input.name, champ: c.champ.name, role: ROLE_LABEL[c.role], k: c.kills, d: c.deaths, a: c.assists });
    let cat: string | null = null, who: SimChamp | undefined;
    if (k && ready(k)) {
      if (has(k, ['troll']) && k.kills >= 1) cat = 'pickmid_troll_good';
      else if (has(k, ['offrole', 'offmeta', 'lowcomfort', 'first', 'riskyblind']) && k.kills >= 2) cat = 'pickmid_weird_good';
      else if (has(k, ['signature', 'legacy', 'onetrick', 'hotrecord']) && k.kills >= 3) cat = 'pickmid_signature_good';
      else if (has(k, ['flashy']) && k.kills >= 3) cat = 'pickmid_flashy_good';
      else if (has(k, ['counter']) && v && v.role === k.role && this.sim.t < 900) cat = 'pickmid_counter_good';
      if (cat) who = k;
    }
    if (!cat && v && ready(v)) {
      if (has(v, ['troll', 'offrole', 'offmeta', 'riskyblind']) && v.deaths >= 2) cat = 'pickmid_weird_bad';
      else if (has(v, ['flashy']) && v.deaths >= 3) cat = 'pickmid_flashy_bad';
      else if (has(v, ['lowcomfort', 'first']) && v.deaths >= 3) cat = 'pickmid_lowcomfort_bad';
      if (cat) who = v;
    }
    if (!cat || !who) return;
    this.pickSaid.set(who.idx, this.sim.t);
    const good = cat.endsWith('_good');
    const ours = who.side === this.us;
    this.say(cat, ctxOf(who), cat === 'pickmid_troll_good' ? 2 : 1, good === ours ? 'hype' : undefined, 1.2);
  }
  private pickVerdict(winner: 0 | 1) {
    const r = this.picks;
    if (!r) return;
    const weird = r.notes.filter((n) => n.idx >= 0 && (n.kind === 'troll' || n.kind === 'offrole' || n.kind === 'offmeta'));
    const n = weird[0];
    if (!n) return;
    this.say(n.side === winner ? 'pickend_weird_win' : 'pickend_weird_loss', n.ctx, n.kind === 'troll' ? 2 : 1, undefined, 3);
  }

  // ------------------------------------------------------------------ sim events
  private champ(i?: number) { return i === undefined ? undefined : this.sim.champs[i]; }
  private flagOf(i?: number) { const c = this.champ(i); return c ? this.setup.flags[c.input.playerId] : undefined; }
  private onEvent(e: GameEvent) {
    const mine = e.side === this.us;
    const killCtx = (): Ctx => ({ killer: this.champ(e.killer)?.input.name, kchamp: this.champ(e.killer)?.champ.name, victim: this.champ(e.victim)?.input.name, vchamp: this.champ(e.victim)?.champ.name });
    const speedy = this.rate >= 16;
    switch (e.type) {
      case 'firstBlood': case 'kill': {
        const ctx = killCtx();
        if (e.type === 'firstBlood') {
          this.say(mine ? 'fb_us' : 'fb_them', ctx, 2, undefined, 0.4, true);
          this.excited(10);
          this.startWave(mine ? 'fb_us' : 'fb_them', ctx, 0.3);
          const vRole = this.champ(e.victim)?.role, kRole = this.champ(e.killer)?.role;
          this.resolve('fb', 'fbRight', (c) => (c.data?.role !== undefined && (c.data.role === vRole || c.data.role === kRole)) || (c.data?.side !== undefined && c.data.side === e.side), 2);
          this.resolve('fb', 'fbWrong', () => this.rng.chance(0.6), 1);
          for (const c of this.claims) if (c.kind === 'fb') c.done = true;
        } else if (/SHUTDOWN/.test(e.text)) { this.say(mine ? 'shutdown_us' : 'shutdown_them', ctx, 2); this.excited(8); }
        else if (this.rng.chance(speedy ? 0.45 : 0.7)) { this.say(mine ? 'kill_us' : 'kill_them', ctx, this.rng.chance(0.3) ? 2 : 1); this.excited(4); }
        if (!speedy || this.rng.chance(0.4)) this.personaSay(mine ? 'good' : 'bad', ctx, 0.35);
        this.setMood(mine ? 'hype' : 'sad', 8);
        // a "washed" player answers his critic
        const killer = this.champ(e.killer)?.input.name;
        if (killer) this.resolve('washed', 'washed', (c) => c.data?.player === killer, 1, this.P.HOT_DEFEND, { player: killer });
        if (mine) this.resolve('rivalTaunt', 'rivalQuiet', () => this.rng.chance(0.5), 1);
        // multi-kills: the same killer again within 10 seconds
        if (e.killer !== undefined) {
          const times = (this.chain.get(e.killer) ?? []).filter((t) => e.t - t <= 10);
          times.push(e.t);
          this.chain.set(e.killer, times);
          const n = Math.min(5, times.length);
          if (n >= 2) {
            if (mine) this.say(`${['', '', 'double', 'triple', 'quadra', 'penta'][n]}_us`, ctx, n >= 4 ? 3 : 1, n >= 3 ? 'hype' : undefined, 0.4, true);
            else this.say('multi_them', { ...ctx, multi: MULTI[n] }, n >= 4 ? 2 : 1, n >= 3 ? 'sad' : undefined, 0.4, true);
            if (n === 5) { this.startWave(mine ? 'penta' : 'ace_them', ctx, 1); this.resolve('penta', 'penta', () => true, 2); this.excited(30); this.setMood(mine ? 'hype' : 'sad', 20); }
            else if (n === 4) { this.startWave(mine ? 'quadra' : 'multi_them', ctx, 0.8); this.excited(25); }
            else if (n === 3) { this.startWave(mine ? 'outplay' : 'multi_them', ctx, 0.6); this.excited(12); }
            if (n >= 3 && mine && this.rng.chance(0.5)) this.post(this.speaker(), this.rng.pick(this.P.SMASH), 0.8 * this.ds(), { tone: 'hype' }, 2);
            if (n >= 4) this.say(mine ? 'spam_hype' : 'spam_sad', {}, 2, mine ? 'hype' : 'sad', 1.2);
          }
        }
        // the self-aware bit: chat knows about the overnight upgrade
        const kf = this.flagOf(e.killer), vf = this.flagOf(e.victim);
        if (kf && kf.kind !== 'drop' && this.rng.chance(0.65)) this.say(kf.kind === 'edited' ? 'edited_kill' : kf.kind === 'possessed' ? 'possessed_kill' : 'anomaly_kill', { ...ctx, delta: kf.delta }, 1, undefined, 1.5, true);
        if (vf && vf.kind !== 'drop' && this.rng.chance(0.45)) this.say('anomaly_death', ctx, 1, undefined, 1.8);
        const vc = this.champ(e.victim);
        if (vc && vc.deaths >= 3 && vc.kills <= 1 && this.rng.chance(vc.deaths >= 5 ? 0.7 : 0.4)) this.say('feeder', { player: vc.input.name, k: vc.kills, d: vc.deaths, a: vc.assists }, vc.deaths >= 5 ? 2 : 1, undefined, 1.5);
        if (this.setup.lore && e.side !== undefined && this.teams[e.side].short === this.setup.lore.lpl && this.rng.chance(0.25)) this.say('lore_kill_lpl', {}, 1, 'lore', 2);
        this.pickReact(e);
        break;
      }
      case 'ace':
        this.say(mine ? 'ace_us' : 'ace_them', {}, 2, mine ? 'hype' : 'sad', 0.4, true);
        this.personaSay(mine ? 'bigGood' : 'bigBad', {}, 0.8);
        this.startWave(mine ? 'ace_us' : 'ace_them', {}, 0.8);
        this.excited(18); this.setMood(mine ? 'hype' : 'sad', 15);
        if (!mine && this.lead() < 0) this.ggCall(2.5);
        break;
      case 'dragon': if (this.rng.chance(speedy ? 0.35 : 0.6)) this.say(mine ? 'dragon_us' : 'dragon_them'); this.excited(3); break;
      case 'soul':
        this.say(mine ? 'soul_us' : 'soul_them', {}, 2, undefined, 0.4, true); this.excited(12);
        if (mine) this.startWave('soul_us', {}, 0.5);
        this.personaSay(mine ? 'bigGood' : 'bigBad', {}, 0.5);
        break;
      case 'elder':
        this.say(mine ? 'elder_us' : 'elder_them', {}, 2, mine ? 'hype' : 'sad', 0.4, true); this.excited(18);
        this.startWave(mine ? 'elder_us' : 'elder_them', {}, 0.7);
        this.resolve('steal', 'stealMiss', () => this.rng.chance(0.5), 1);
        break;
      case 'baron':
        this.say(mine ? 'baron_us' : 'baron_them', {}, 2, undefined, 0.4, true); this.excited(15);
        this.startWave(mine ? 'baron_us' : 'baron_them', {}, 0.5);
        this.personaSay(mine ? 'bigGood' : 'bigBad', {}, 0.6);
        this.resolve('steal', 'stealMiss', () => this.rng.chance(0.5), 1);
        for (const c of this.claims) if (c.kind === 'steal') c.done = true;
        break;
      case 'steal': {
        const m = /^(.+?) STEALS the (.+?)!/.exec(e.text);
        const ctx = { player: m?.[1], obj: m?.[2] };
        this.say(mine ? 'steal_us' : 'steal_them', ctx, 3, mine ? 'hype' : 'sad', 0.4, true);
        this.startWave(mine ? 'steal_us' : 'steal_them', ctx, 1);
        this.resolve('steal', 'steal', () => true, 2);
        this.post(this.speaker(), this.rng.pick(this.P.SMASH), 0.6 * this.ds(), { tone: mine ? 'hype' : 'sad' }, 2);
        this.excited(25); this.setMood(mine ? 'laugh' : 'sad', 15);
        break;
      }
      case 'herald': case 'grubs': if (this.rng.chance(0.4)) this.say('minor_obj', { obj: e.type === 'herald' ? 'Rift Herald' : 'Voidgrubs' }); break;
      case 'tower': if (this.rng.chance(speedy ? 0.25 : 0.45)) this.say(mine ? 'tower_us' : 'tower_them'); break;
      case 'inhib':
        this.say(mine ? 'inhib_us' : 'inhib_them', {}, 1, undefined, 0.4, true); this.excited(8);
        if (e.side !== undefined) this.inhibAt[e.side] = this.sim.t;
        break;
      case 'nexus': break; // handled by the end-of-game check
      case 'flash': if (!speedy && this.rng.chance(0.5)) this.say(/flashes away/.test(e.text) ? 'flash_escape' : 'flash_in', { player: nameBefore(e.text, / flashes/) }); break;
      case 'gank': if (this.rng.chance(speedy ? 0.25 : 0.5)) this.say(mine ? 'gank_us' : 'gank_them'); break;
      case 'tp': if (this.rng.chance(speedy ? 0.25 : 0.5)) this.say('tp', { player: nameBefore(e.text, / teleports/) }); break;
      case 'teamfight': case 'ult':
        if ((e.type === 'teamfight' || e.important) && this.rng.chance(0.6)) {
          this.say('big_ult', { player: nameBefore(e.text, /[’']s /) }); this.excited(6);
          if (e.type === 'teamfight' && this.rng.chance(0.35)) this.startWave('outplay', {}, 0.3);
        }
        break;
      case 'info':
        if (/refuses to fall/.test(e.text)) { this.say('lore_nexus', {}, 4, 'lore', 0.4, true); this.startWave('lore_nexus', {}, 1); this.excited(35); }
        else if (/was executed/.test(e.text) && this.rng.chance(0.6)) { this.say('executed', { victim: nameBefore(e.text, / \(/) }); this.setMood('laugh', 6); }
        else if (/steals the enemy/.test(e.text) && this.rng.chance(0.5)) this.say('buff_steal', { player: nameBefore(e.text, / steals/) });
        break;
    }
    this.moments?.onEvent(e);
  }

  private ggCall(delay: number) {
    const ch = this.regular('doomer');
    const text = this.f(this.P.GG_CALLS);
    if (text) this.postClaim(ch, text, delay * this.ds(), 'gg', undefined, 2);
  }

  // ------------------------------------------------------------------ game state (leads, objectives, nexus, the end)
  private watch() {
    const sim = this.sim, us = this.us, them = this.them;
    const lead = this.lead();
    this.maxLead = Math.max(this.maxLead, lead); this.minLead = Math.min(this.minLead, lead);
    if (this.maxLead >= 4000 && lead <= -1000) {
      this.say('throw', {}, 2, 'sad', 0.4, true); this.maxLead = lead; this.excited(15);
      this.startWave('throw', {}, 0.8); this.setMood('laugh', 15);
      this.resolve('ez', 'ez', () => true, 2, this.P.CALLOUTS.ezBack);
      this.resolve('throwCall', 'throwCall', () => true, 1, this.P.T.toldYou);
    }
    if (this.minLead <= -4000 && lead >= 1000) {
      this.say('comeback', {}, 2, 'hype', 0.4, true); this.minLead = lead; this.excited(15);
      this.startWave('comeback', {}, 0.9); this.setMood('hype', 15);
      this.resolve('gg', 'gg', () => true, 3, this.P.CALLOUTS.ggBack);
    }
    if (Math.abs(lead) >= 5000 && sim.t - this.leadSaid > 240) {
      this.say(lead > 0 ? 'lead_us' : 'lead_them', { gold: `${(Math.abs(lead) / 1000).toFixed(1)}k` });
      this.personaSay(lead > 0 ? 'ahead' : 'behind', {}, 0.7, 2.5);
      this.leadSaid = sim.t;
    }
    // chat makes claims it will be held to
    if (sim.winner === null && sim.t - this.lastClaimCheck > 50) {
      this.lastClaimCheck = sim.t;
      const share = getTemplateShare();
      const open = (k: string) => this.claims.filter((c) => !c.done && c.kind === k).length;
      if (lead <= -2500 && open('gg') < 3 && this.rng.chance(0.3 * share + 0.08)) this.ggCall(1);
      else if (lead >= 3000 && open('ez') < 2 && this.rng.chance(0.2 * share + 0.05)) {
        const ch = this.regular('superfan'), text = this.f(this.P.EZ_CALLS);
        if (text) this.postClaim(ch, text, 1, 'ez');
      }
      if (lead >= 4000 && open('throwCall') < 1 && this.rng.chance(0.2 * share + 0.04)) {
        const ch = this.regular('doomer'), text = this.f(this.P.THROW_CALLS);
        if (text) this.postClaim(ch, text, 3, 'throwCall');
      }
    }
    const min = Math.floor(sim.t / 60);
    if ([35, 45, 55].includes(min) && this.long < min) {
      this.long = min; this.say('long_game');
      if (min === 35) this.resolve('long', 'long', () => true, 2);
    }
    // somebody is hitting Baron / Elder / a drake: "BARON CALL", and steal predictions
    for (const o of sim.objectives) {
      if (!o.alive || o.attackers.size === 0 || o.hp > o.maxHp * 0.8 || o.lastHitSide === undefined) continue;
      if (o.kind !== 'baron' && o.kind !== 'elder' && o.kind !== 'dragon') continue;
      const key = `${o.kind}@${o.spawnAt}`;
      if (this.objSeen.has(key)) continue;
      this.objSeen.add(key);
      const big = o.kind !== 'dragon';
      const obj = this.P.T.obj(o.kind);
      const taker = this.teams[o.lastHitSide].short;
      const stealer = sim.champs.find((c) => c.side !== o.lastHitSide && c.role === 'jungle')?.input.name;
      if (big || this.rng.chance(0.4)) { const t = this.f(this.P.BARON_START, { obj, taker }); if (t) this.post(this.speaker(), t, 0.3, {}, 2); }
      if (big && this.rng.chance(0.7)) this.setMood('scared', 10);
      if (this.rng.chance(big ? 0.75 : 0.25)) {
        const ch = this.regular(this.rng.pick(['memer', 'casual', 'doomer', 'analyst', 'superfan'] as Persona[]));
        const text = this.f(this.P.STEAL_CALLS, { stealer });
        if (text) this.postClaim(ch, text, this.rng.range(0.8, 2.2) * this.ds(), 'steal', undefined, 2);
      }
    }
    // the Nexus: end calls, defend calls, base races
    for (const s of [0, 1] as const) {
      if (sim.nexusHp[s] < this.nexusPrev[s] - 1) this.nexusHitAt[s] = sim.t;
      this.nexusPrev[s] = sim.nexusHp[s];
    }
    if (sim.winner === null) {
      const both = sim.t - this.nexusHitAt[0] < 25 && sim.t - this.nexusHitAt[1] < 25;
      const inhibs = sim.t - this.inhibAt[0] < 45 && sim.t - this.inhibAt[1] < 45;
      if ((both || inhibs) && sim.t - this.raceSaid > 90) {
        this.raceSaid = sim.t;
        this.startWave('baserace', {}, 0.9); this.excited(25); this.setMood('scared', 15);
        for (let i = 0; i < 2; i++) { const t = this.f(this.P.NEXUS_LINES.race); if (t) this.post(this.speaker(), t, 0.5 + i * 1.2, {}, 2); }
      } else if (sim.t - this.nexusHitAt[them] < 4 && sim.t - this.endSaid > 60) {
        this.endSaid = sim.t;
        this.startWave('end_us', {}, 0.6);
        const t = this.f(this.P.NEXUS_LINES.end); if (t) this.post(this.speaker(), t, 0.4, {}, 2);
      } else if (sim.t - this.nexusHitAt[us] < 4 && sim.t - this.defendSaid > 60) {
        this.defendSaid = sim.t;
        this.startWave('defend', {}, 0.6); this.setMood('scared', 12);
        const t = this.f(this.P.NEXUS_LINES.defend); if (t) this.post(this.speaker(), t, 0.4, {}, 2);
      }
    }
    // the end
    if (sim.winner !== null && !this.ended) {
      this.ended = true;
      this.endAt = this.now;
      this.queue = this.queue.filter((p) => p.pri >= 2 && !p.claim); // in-game small talk is moot now
      const won = sim.winner === us;
      this.say(won ? 'win' : 'loss', {}, 4, won ? 'hype' : 'sad', 0.2, true);
      this.say(won ? 'spam_hype' : 'spam_sad', {}, 2, won ? 'hype' : 'sad', 1);
      this.startWave(won ? 'win' : 'loss', {}, 1);
      this.personaSay(won ? 'win' : 'loss', {}, 1, 2);
      this.personaSay(won ? 'win' : 'loss', {}, 0.8, 4);
      if (this.setup.lore) this.say('lore_end', {}, 2, 'lore', 2, true);
      const leg = this.setup.leg;
      if (leg && won && leg.mine + 1 >= leg.need) this.say(leg.win, {}, 3, 'hype', 1.5, true);
      else if (leg && !won && leg.theirs + 1 >= leg.need) this.say(leg.loss, {}, 3, 'sad', 1.5, true);
      this.pickVerdict(sim.winner);
      if (won) { this.resolve('gg', 'gg', () => true, 2, this.P.CALLOUTS.ggBack); this.resolve('rivalWin', 'rivalWin', () => true, 2); }
      else this.resolve('ez', 'ez', () => true, 2, this.P.CALLOUTS.ezBack);
      if (sim.t < 28 * 60) this.resolve('long', 'longMiss', () => this.rng.chance(0.7), 1);
      if (won && sim.t < 28 * 60) this.resolve('short', 'short', () => true, 1);
      else this.resolve('short', 'shortMiss', () => this.rng.chance(0.7), 1);
      if (this.rng.chance(0.5)) this.giftBomb(4);
      this.moments?.onEnd(sim.winner);
      this.excited(30);
      this.setMood(won ? 'hype' : 'sad', 30);
    }
  }

  // ------------------------------------------------------------------ ambient chatter
  private ambient(dt: number) {
    const sim = this.sim, share = getTemplateShare();
    const paused = sim.winner === null && this.pausedFor > 2.5;
    let lambda: number;
    if (paused) lambda = 0.5;
    else if (sim.winner !== null) lambda = Math.max(0.25, 2.2 * Math.exp(-(this.now - this.endAt) / 30000));
    else lambda = (0.9 + this.excite / 35) * Math.min(1.9, 1 + 0.2 * Math.log2(Math.max(1, this.rate))) * Math.max(0.7, Math.min(1.3, Math.log10(Math.max(1000, this.meta.viewers)) / 4.5));
    lambda *= share * this.P.pace.ambient;
    if (paused) lambda = Math.max(lambda, 0.25);
    if (!(this.rng.next() < lambda * dt)) return;
    const ctxNow = this.ctx();
    if (paused) {
      const t = this.f(this.P.PAUSE);
      if (t) this.post(this.anyone(), t, 0, {}, 1);
      if (!this.pauseWaved && this.pausedFor > 5) { this.pauseWaved = true; this.startWave('pause', {}, 0.3); }
      return;
    }
    this.pauseWaved = false;
    if (sim.winner !== null) {
      const won = sim.winner === this.us;
      const r = this.rng.next();
      if (r < 0.45) { const t = this.f(this.P.POSTGAME); if (t) this.post(this.anyone(), t, 0, {}, 1); }
      else if (r < 0.7) this.personaSay(won ? 'win' : 'loss', {}, 1, 0);
      else this.post(this.anyone(), this.emoteSpam(won ? 'hype' : 'sad'), 0, {}, 1);
      return;
    }
    const quiet = this.now - this.lastReactAt > 9000;
    const mins = Math.floor(sim.t / 60);
    const lead = this.lead();
    const opts: [string, number][] = [
      ['phase', quiet ? 4 : 2.5], ['persona', 4], ['meme', 2 * (1 + this.excite / 70)], ['emote', 1.6], ['smash', this.excite > 55 ? 0.6 : 0],
      ['diff', ctxNow.diffrole || Math.abs(lead) >= 2000 ? 0.8 : 0], ['farm', quiet && mins < 26 ? 1.8 : 0.15], ['food', quiet ? 0.9 : 0.15],
      ['lead', Math.abs(lead) >= 2500 ? 0.8 : 0], ['pasta', 0.25],
    ];
    const mix = this.P.mix;
    const kind = this.rng.weighted(opts, (o) => o[1] * (mix?.[o[0]] ?? 1))[0];
    const who = this.speaker();
    let text: string | null = null, ch: Chatter = who;
    switch (kind) {
      case 'phase': text = this.f(this.P.LINES[mins < 14 ? 'idle_early' : mins < 28 ? 'idle_mid' : 'idle_late']); break;
      case 'persona': {
        const p = this.rng.weighted(PERSONAS.filter((x) => this.P.PERSONA_IDLE[x].length), (x) => ({ superfan: 3, memer: 3, analyst: 1.5, doomer: 1.4, casual: 1.6, backseat: 1.2, wholesome: 1, timezone: 0.6, regionwar: 0.8, lurker: 0.3, rival: 1.6 } as Record<string, number>)[x] ?? 1);
        ch = this.regular(p);
        text = this.f(this.P.PERSONA_IDLE[p]);
        break;
      }
      case 'meme': ch = this.rng.chance(0.5) ? this.regular('memer') : who; text = this.f(this.P.MEMES); break;
      case 'emote': ch = this.rng.chance(0.5) ? this.regular('spammer') : who; text = this.emoteSpam(this.now < this.moodUntil ? this.mood : quiet ? 'bored' : 'neutral'); break;
      case 'smash': text = this.rng.pick(this.P.SMASH); break;
      case 'diff': ch = this.rng.chance(0.5) ? this.regular(this.rng.pick(['memer', 'analyst', 'rival', 'superfan'] as Persona[])) : who; text = this.f(this.P.DIFF_LINES); break;
      case 'farm': text = this.f(this.P.FARM); break;
      case 'food': text = this.f(this.P.FOOD); break;
      case 'lead': this.personaSay(lead > 0 ? 'ahead' : 'behind', {}, 1, 0); return;
      case 'pasta': ch = this.regular('copypasta'); text = this.f(this.P.COPYPASTAS); break;
    }
    if (text) this.post(ch, text, 0, {}, 1);
  }
  private emoteSpam(mood: keyof typeof EMOTE_MOOD): string {
    const pool = this.P.EMOTE_MOOD[mood] ?? this.P.EMOTE_MOOD.neutral;
    const e = this.rng.pick(pool);
    const n = this.rng.chance(1 - this.P.repeat) ? 1 : this.rng.weighted([1, 2, 3, 4, 6], (x) => ({ 1: 4, 2: 2.5, 3: 2, 4: 1, 6: 0.5 } as Record<number, number>)[x]);
    return Array.from({ length: n }, () => (this.rng.chance(0.15) ? this.rng.pick(pool) : e)).join(' ');
  }

  // ------------------------------------------------------------------ scenes: chatters talking to each other
  private scene() {
    const share = getTemplateShare();
    if (share <= 0.02 || (this.sim.winner !== null && this.now - this.endAt > 45000)) return;
    const quiet = this.now - this.lastReactAt > 9000;
    const open = this.poll?.state === 'open';
    const opts: [string, number][] = [
      ['argue', 2], ['vsOne', 1.2], ['backseat', 1.2], ['qa', quiet ? 2.6 : 1.6], ['timezone', 0.6], ['pasta', 1], ['first', 0.6],
      ['command', 1], ['timeout', 0.55], ['region', 0.7], ['bet', open ? 1.6 : 0], ['latejoin', 0.6],
    ];
    if (this.sim.winner !== null) { opts.length = 0; opts.push(['qa', 1], ['command', 1], ['pasta', 0.6], ['first', 0.4]); }
    // the Vietnamese chat's side talk: lag, corrections, other results, the schedule, the caster, member chants
    if (this.moments && this.rng.chance(this.sim.winner !== null ? 0.55 : 0.35) && this.moments.scene()) return;
    const kind = this.rng.weighted(opts, (o) => o[1])[0];
    const r = this.rng;
    switch (kind) {
      case 'argue': {
        const riv = this.regular('rival'), fan = this.regular('superfan');
        const a = this.f(this.P.ARGUE.open);
        if (!a) return;
        this.postClaim(riv, a, 0, 'rivalTaunt');
        let d = r.range(2, 4);
        const b = this.f(this.P.ARGUE.reply, { user: riv.name });
        if (b) this.post(fan, b, d, { reply: { to: riv.name, text: a } }, 1);
        if (r.chance(0.65)) { d += r.range(2, 4); const c = this.f(this.P.ARGUE.back, { user: fan.name }); if (c) this.post(riv, c, d, { reply: { to: fan.name, text: b ?? '' } }, 1); }
        if (r.chance(0.4)) { d += r.range(1.5, 3); const c = this.f(this.P.ARGUE.last, { user: riv.name }); if (c) this.post(fan, c, d, {}, 1); }
        if (r.chance(0.55)) { d += r.range(1, 3); const c = this.f(this.P.ARGUE.neutral); if (c) this.post(r.chance(0.5) ? this.regular('wholesome') : this.anyone(), c, d, {}, 1); }
        if (r.chance(0.12)) { const m = this.f(this.P.MOD_LINES); if (m) this.post(r.pick(this.mods), m, d + 2, {}, 2); }
        break;
      }
      case 'vsOne': {
        const guy = r.chance(0.5) ? this.crowd() : this.regular(r.pick(['memer', 'regionwar', 'doomer', 'rival', 'backseat'] as Persona[]));
        const take = r.pick(this.P.HOT_TAKES);
        const text = this.f([take.text]);
        if (!text) return;
        const key = /^\{(\w+)\}/.exec(take.text)?.[1];
        const player = take.kind === 'washed' && key ? String(this.ctx()[key] ?? '') || undefined : undefined;
        this.post(guy, text, 0, {}, 1, { onRelease: () => { if (take.kind === 'washed' && player) this.claim('washed', guy, text, { player }); } });
        let d = r.range(1.2, 2.5);
        const n = r.int(4, 7);
        for (let i = 0; i < n; i++) {
          const t = this.f(this.P.ROASTS, { user: guy.name });
          if (t) this.post(this.anyone(guy.name), t, d, { reply: { to: guy.name, text } }, 1);
          d += r.range(0.4, 1.4);
        }
        if (r.chance(0.6)) { const t = this.f(this.P.HOT_DEFEND); if (t) this.post(guy, t, d + r.range(1, 2.5), {}, 1); }
        if (r.chance(0.35)) { const t = this.f([this.P.T.chatVs], { user: guy.name, n: r.int(500, 9000) }); if (t) this.post(this.anyone(guy.name), t, d + r.range(2, 4), {}, 1); }
        break;
      }
      case 'backseat': {
        const b = this.regular('backseat');
        const t = this.f(this.P.PERSONA_IDLE.backseat);
        if (!t) return;
        this.post(b, t, 0, {}, 1);
        let d = r.range(1.5, 3);
        for (let i = 0, n = r.int(2, 4); i < n; i++) {
          const x = this.f(this.P.BACKSEAT_REPLIES, { user: b.name });
          if (x) this.post(this.anyone(b.name), x, d, { reply: { to: b.name, text: t } }, 1);
          d += r.range(0.8, 2);
        }
        if (r.chance(0.45)) { const x = this.f(this.P.BACKSEAT_BACK); if (x) this.post(b, x, d + 1.5, {}, 1); }
        break;
      }
      case 'qa': case 'latejoin': {
        const topic = kind === 'latejoin' ? this.P.QA[0] : r.pick(this.P.QA);
        const asker = kind === 'latejoin' || r.chance(0.4) ? this.crowd() : this.regular('casual');
        const q = this.f(topic.q);
        if (!q) return;
        this.post(asker, q, 0, {}, 1);
        let d = r.range(2, 4.5);
        for (let i = 0, n = r.int(1, 3); i < n; i++) {
          const who = r.chance(0.4) ? this.regular(r.pick(['analyst', 'wholesome', 'memer', 'superfan'] as Persona[]), asker.name) : this.anyone(asker.name);
          const a = this.f(topic.a, { user: asker.name });
          if (a) this.post(who, a, d, { reply: { to: asker.name, text: q } }, 1);
          d += r.range(1, 3);
        }
        if (r.chance(0.25)) this.post(this.anyone(asker.name), this.f(this.P.T.lateJoin, { user: asker.name }) ?? '', d + 1, {}, 1);
        break;
      }
      case 'timezone': {
        const tz = this.regular('timezone');
        const t = this.f(this.P.PERSONA_IDLE.timezone);
        if (!t) return;
        this.post(tz, t, 0, {}, 1);
        for (let i = 0, n = r.int(1, 2), d = r.range(2, 4); i < n; i++, d += r.range(1.5, 3)) {
          const x = this.f(this.P.TIMEZONE_REPLIES, { user: tz.name });
          if (x) this.post(this.anyone(tz.name), x, d, { reply: { to: tz.name, text: t } }, 1);
        }
        break;
      }
      case 'pasta': {
        const p = this.regular('copypasta');
        const t = this.f(this.P.COPYPASTAS);
        if (!t) return;
        this.post(p, t, 0, {}, 1);
        let d = r.range(1, 2.5);
        for (let i = 0, n = r.int(1, 4); i < n; i++) { this.post(this.crowd(), t, d, {}, 1); d += r.range(0.5, 1.6); }
        for (let i = 0, n = r.int(1, 2); i < n; i++) { const x = this.f(this.P.PASTA_REACT); if (x) this.post(this.anyone(), x, d, {}, 1); d += r.range(1, 2); }
        if (r.chance(0.25)) { const m = this.f(this.P.T.pastaMod); if (m) this.post(r.pick(this.mods), m, d + 1, {}, 2); }
        break;
      }
      case 'first': {
        const ch: Chatter = r.chance(0.5) ? this.regular('lurker') : this.crowd();
        if (ch.spoke || this.firstSeen.has(ch.name)) return;
        this.firstSeen.add(ch.name);
        const t = this.f(this.P.FIRST_TIME);
        if (!t) return;
        this.post(ch, t, 0, { first: true }, 1);
        for (let i = 0, n = r.int(1, 2), d = r.range(1.5, 3); i < n; i++, d += r.range(1, 2)) {
          const x = this.f(this.P.WELCOME, { user: ch.name });
          if (x) this.post(this.anyone(ch.name), x, d, { reply: { to: ch.name, text: t } }, 1);
        }
        break;
      }
      case 'command': {
        const cmd = r.pick(Object.keys(this.P.COMMANDS));
        if (cmd === '!predict' && !this.poll) return;
        const ch = this.anyone();
        this.post(ch, cmd, 0, {}, 1);
        const reply = this.f(this.P.COMMANDS[cmd], { user: ch.name });
        if (reply) this.post(this.nightbot, cmd === '!lurk' ? reply : `@${ch.name} ${reply}`, r.range(0.6, 1.4), {}, 3);
        break;
      }
      case 'timeout': {
        const bait = r.pick(this.P.TIMEOUT_BAIT);
        const ch = this.crowd();
        const t = this.f([bait.text]);
        if (!t) return;
        this.post(ch, t, 0, {}, 1, { onRelease: (id) => this.timeout(ch, id, bait.reason) });
        break;
      }
      case 'region': {
        const a = this.regular('regionwar');
        const t = this.f(this.P.PERSONA_IDLE.regionwar);
        if (!t) return;
        this.post(a, t, 0, {}, 1);
        const x = this.f(this.P.REGION_REPLIES, { user: a.name });
        if (x) this.post(this.anyone(a.name), x, r.range(2, 4), { reply: { to: a.name, text: t } }, 1);
        break;
      }
      case 'bet': {
        for (let i = 0, n = r.int(1, 2); i < n; i++) {
          const ch = this.regular(r.pick(['superfan', 'memer', 'casual', 'rival', 'doomer', 'analyst'] as Persona[]));
          this.bet(ch, this.betSide(ch), i * r.range(1, 3));
        }
        break;
      }
    }
  }
  /** A mod times someone out: the line gets deleted, a notice appears, chat reacts, and they come back later. */
  private timeout(ch: Chatter, id: number, reason: string) {
    const secs = this.rng.pick([10, 10, 30, 60]);
    const at = this.rng.range(1, 2.6);
    const warn = this.P.T.warn;
    if (warn) {
      this.post(this.nightbot, warn(ch.name, reason), at, {}, 3, { onRelease: () => { this.deleted.push(id); ch.timedOutUntil = this.now + secs * 1000; } });
      if (this.rng.chance(0.4)) { const t = this.f(this.P.AFTER_TIMEOUT, { user: ch.name }); if (t) this.post(this.anyone(ch.name), t, at + this.rng.range(0.6, 1.5), {}, 1); }
      return;
    }
    this.enqueue({ at: this.now + at * 1000, pri: 3, ch: null, msg: { kind: 'system', notice: 'timeout', title: this.P.T.timeout(ch.name, secs), text: reason }, simAt: this.sim.t, onRelease: () => { this.deleted.push(id); for (const h of this.history) if (h.ch === ch) this.deleted.push(h.id); ch.timedOutUntil = this.now + secs * 1000; } });
    let d = at + this.rng.range(0.6, 1.5);
    for (let i = 0, n = this.rng.int(1, 3); i < n; i++) { const t = this.f(this.P.AFTER_TIMEOUT, { user: ch.name }); if (t) this.post(this.anyone(ch.name), t, d, {}, 1); d += this.rng.range(0.5, 1.5); }
    if (this.rng.chance(0.3)) this.startWave('timeout', {}, 0.2);
    if (secs <= 30 && this.rng.chance(0.7)) {
      const t = this.f(this.P.BACK_FROM_TIMEOUT);
      if (t) this.post(ch, t, at + secs + this.rng.range(1, 4), {}, 1);
    }
  }

  // ------------------------------------------------------------------ notices: subs, gifts, bits, raids, bots
  private notices() {
    if (this.now >= this.nextNotice) {
      this.nextNotice = this.now + this.rng.range(...this.P.pace.notices) * 1000 / (0.7 + this.excite / 100);
      const r = this.rng.next();
      if (r < 0.38) {
        const ch = this.rng.chance(0.6) ? this.regular(this.rng.pick(['superfan', 'memer', 'analyst', 'doomer', 'wholesome', 'copypasta'] as Persona[])) : this.crowd();
        ch.sub = Math.max(2, ch.sub + 1);
        const msg = this.f(this.P.SUB_MSGS, { months: ch.sub });
        this.notice('sub', this.P.T.subRenew(ch.name, ch.sub), 0, msg ?? '', ch);
      } else if (r < 0.55) {
        const ch = this.crowd();
        ch.sub = 1;
        this.notice('sub', this.P.T.subNew(ch.name, this.rng.chance(0.4)), 0, '', ch);
        if (this.rng.chance(0.4)) { const t = this.f([this.P.T.subWelcome], { user: ch.name }); if (t) this.post(this.anyone(ch.name), t, 2, {}, 1); }
      } else if (r < 0.78) {
        // Twitch bits / a YouTube Super Chat
        const ch = this.rng.chance(0.5) ? this.regular('superfan') : this.crowd();
        const amounts = this.P.T.bitsAmounts;
        const amt = this.rng.pick(amounts);
        const big = amt >= amounts[Math.floor(amounts.length * 0.6)];
        if (this.P.platform === 'twitch') ch.bits = Math.max(ch.bits ?? 0, big ? 1000 : 100);
        const msg = this.f(this.P.BITS_MSGS) ?? 'Pog';
        this.enqueue({ at: this.now, pri: 3, ch, msg: { kind: 'notice', notice: 'bits', title: this.P.T.bits(ch.name, amt), text: this.P.T.bitsText(amt, msg), amount: amt }, simAt: this.sim.t });
        if (big) { const t = this.f([this.P.T.bitsReply], { user: ch.name }); if (t) this.post(this.anyone(ch.name), t, 2, {}, 1); }
        this.moments?.onSuperChat(big);
      } else this.giftBomb(this.rng.pick([1, 1, 5, 5, 10, 20, 50]));
    }
    // a raid, once in a while (Twitch)
    if (this.P.raids && !this.raidDone && this.sim.t >= this.raidAt && this.sim.winner === null) {
      this.raidDone = true;
      if (this.rng.chance(0.5)) {
        const raider = this.rng.pick(this.P.RAIDERS), n = Math.round(Math.max(40, Math.min(60000, this.meta.viewers * this.rng.range(0.008, 0.05))) / 10) * 10;
        this.notice('raid', this.P.T.raid(raider, n), 0, '', null);
        this.viewersBoost += n;
        this.startWave('raid', { raider, RAIDER: raider.toUpperCase() }, Math.min(1, 0.3 + n / Math.max(1, this.meta.viewers) * 12));
        const w = this.f(this.P.RAID_WELCOME, { raider }); if (w) this.post(this.rng.pick(this.mods), w, 1.5, {}, 3);
        for (let i = 0, d = 3; i < this.rng.int(3, 6); i++, d += this.rng.range(1, 3)) {
          const t = this.f(this.P.RAID_CHAT, { raider, RAIDER: raider.toUpperCase() });
          if (t) this.post(this.crowd(), t, d, {}, 1);
        }
      }
    }
    // Nightbot and the mods
    if (this.now >= this.nextBot) {
      this.nextBot = this.now + this.rng.range(80, 150) * 1000;
      // YouTube: the channel's own account takes turns with Nightbot (subscribe reminders, the caster on the mic)
      const own = this.P.CHANNEL_LINES?.length && this.rng.chance(0.5);
      const t = this.f(own ? this.P.CHANNEL_LINES : this.P.NIGHTBOT_REMINDERS);
      if (t) this.post(own ? this.elements : this.nightbot, t, 0, {}, 3);
    }
    if (this.now >= this.nextMod) {
      this.nextMod = this.now + this.rng.range(90, 200) * 1000;
      const t = this.f(this.P.MOD_LINES);
      if (t) this.post(this.rng.pick(this.mods), t, 0, {}, 2);
    }
  }
  private giftBomb(n: number) {
    const ch = this.rng.chance(0.6) ? this.regular('superfan') : this.crowd();
    ch.gifter = true;
    ch.sub = Math.max(1, ch.sub);
    if (n === 1) {
      const to = this.crowd();
      to.sub = Math.max(1, to.sub);
      this.notice('gift', this.P.T.giftTo(ch.name, to.name), 0, '', ch);
      const t = this.f([this.P.T.giftOne], { user: ch.name });
      if (t) this.post(to, t, 2.5, {}, 1);
      return;
    }
    this.notice('gift', this.P.T.giftN(ch.name, n), 0, this.P.T.giftNText(n + this.rng.int(0, 300)), ch);
    if (n >= 10) this.startWave('gift', {}, Math.min(1, n / 50));
    for (let i = 0, d = 2; i < Math.min(3, 1 + Math.floor(n / 5)); i++, d += this.rng.range(0.8, 2)) {
      const t = this.f(this.P.GIFT_THANKS, { user: ch.name });
      if (t) this.post(this.crowd(), t, d, {}, 1);
    }
  }

  // ------------------------------------------------------------------ external lines & the manager typing in chat
  private external(l: ExternalLine) {
    let ch: Chatter | undefined;
    if (l.user) {
      ch = this.byName.get(l.user.toLowerCase());
      if (!ch) {
        const p = PERSONAS.includes(l.persona as Persona) ? (l.persona as Persona) : 'ext';
        const h = hashString(l.user);
        ch = { name: l.user, who: p, color: NAME_COLORS[h % NAME_COLORS.length], sub: h % 3 === 0 ? (h % 24) + 1 : 0, regular: false };
        if (this.byName.size < 400) this.byName.set(l.user.toLowerCase(), ch);
      }
    } else ch = PERSONAS.includes(l.persona as Persona) ? this.regular(l.persona as Persona) : this.crowd();
    this.post(ch, l.text, this.rng.range(0.1, 0.9), { persona: l.persona }, 2);
  }
  /** The user typed in chat (as the team's manager). */
  postGM(text: string) {
    const t = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!t) return;
    this.enqueue({ at: this.now, pri: 4, ch: this.gm, msg: { kind: 'msg', text: t, self: true }, simAt: this.sim.t });
    const low = t.toLowerCase();
    const short = String(this.base.short).toLowerCase();
    const pool = /\bff\b|surrender/.test(low) ? this.P.GM_REPLIES.ff : /\bgg\b/.test(low) ? this.P.GM_REPLIES.gg : low.includes(short) ? this.P.GM_REPLIES.team
      : /\?$/.test(low) ? this.P.GM_REPLIES.question : /^(hi|hello|hey|yo)\b/.test(low) ? this.P.GM_REPLIES.hi : this.P.GM_REPLIES.any;
    let d = this.rng.range(1.2, 2.5);
    for (let i = 0, n = this.rng.int(1, 3); i < n; i++) {
      const x = this.f(i === 0 ? pool : this.P.GM_REPLIES.any, { me: this.gm.name });
      if (x) this.post(this.anyone(), x, d, { reply: { to: this.gm.name, text: t } }, 3);
      d += this.rng.range(0.8, 2.2);
    }
    if (this.rng.chance(0.4)) this.post(this.anyone(), this.P.T.gmInChat, d, {}, 2);
  }

  // ------------------------------------------------------------------ the clock
  tick(now: number): TickOut {
    const sim = this.sim;
    if (!this.lastNow) { this.lastNow = now; this.startReal = now; this.lastSimT = sim.t; }
    const dt = Math.min(1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.now = now;
    // playback speed (sim seconds per real second), smoothed; pause detection
    if (dt > 0) {
      const dSim = sim.t - this.lastSimT;
      this.lastSimT = sim.t;
      const inst = dSim / dt;
      if (inst <= 600) this.rate = this.rate * 0.85 + inst * 0.15; // a "skip to result" jump is not a speed
      this.pausedFor = sim.winner === null && dSim === 0 ? this.pausedFor + dt : 0;
    }
    if (!this.started) this.start();
    // new events (after "skip to result" only the last few matter)
    const evs = sim.events;
    if (evs.length - this.idx > 25) this.idx = evs.length - 12;
    for (; this.idx < evs.length; this.idx++) this.onEvent(evs[this.idx]);
    this.watch();
    if (this.moments) { this.moments.tick(now); for (const l of _drainDesk()) this.moments.onDesk(l); }
    for (const l of _drainExternal()) this.external(l);
    this.ambient(dt);
    if (this.now >= this.nextScene) {
      this.nextScene = this.now + (this.rng.range(7, 15) * 1000) / Math.max(0.15, getTemplateShare() * (0.8 + this.excite / 120));
      this.scene();
    }
    this.notices();
    this.waveTick();
    this.pollTick(dt);
    this.excite = Math.max(8, this.excite * Math.pow(0.9, dt));
    const out = this.release(dt);
    // meta for the header / feed: the stream audience (competition, teams, stars, series, live moments) + raids
    let base: number;
    if (this.aud) {
      for (; this.audIdx < evs.length; this.audIdx++) this.aud.onEvent(evs[this.audIdx]);
      base = this.aud.update({ t: sim.t, gold: this.gold(0) - this.gold(1), winner: sim.winner, nexus: sim.nexusHp }, this.viewersBoost) * (0.97 + this.excite / 1500);
    } else base = this.setup.base * (0.8 + this.excite / 250) + this.viewersBoost;
    const drift = 1 + 0.012 * Math.sin(now / 9000) + 0.006 * Math.sin(now / 2300);
    const fade = sim.winner !== null ? Math.max(0.72, 1 - (now - this.endAt) / 300000) : 1;
    const w = this.wave;
    this.meta = {
      ...this.meta,
      hype: Math.round(this.excite),
      viewers: roundViewers(base * drift * fade),
      poll: this.pollView(),
      combo: this.P.combo && w && w.count >= 3 && now < w.until + 1800 ? { token: w.token, count: w.count, tone: w.tone, live: now < w.until, key: w.seq } : null,
    };
    _setMeta({ live: true, hype: this.meta.hype, viewers: this.meta.viewers, gameTime: sim.t, wave: w && now < w.until ? w.token : null });
    const deleted = this.deleted;
    this.deleted = [];
    return { out, deleted };
  }

  /** Release due lines under the rate cap (token bucket), drop stale backlog. */
  private release(dt: number): ChatOut[] {
    const waveOn = !!this.wave && this.now < this.wave.until + 500;
    const pace = this.P.pace;
    const rate = waveOn ? pace.wave : pace.base + this.excite / pace.excite;
    this.tokens = Math.min(rate * 0.7 + 1, this.tokens + rate * dt);
    const out: ChatOut[] = [];
    const keep: Pending[] = [];
    // due lines first by priority class (notices, then real reactions, then wave spam / small talk), each in time order
    const due = this.queue.filter((p) => p.at <= this.now);
    const later = this.queue.filter((p) => p.at > this.now);
    const cls = (p: Pending) => (p.pri >= 3 ? 0 : p.wave ? 2 : p.pri >= 2 ? 1 : 2);
    due.sort((a, b) => cls(a) - cls(b) || a.at - b.at);
    let waves = 0;
    const hooks: (() => void)[] = [];
    for (const p of due) {
      if (out.length >= MAX_PER_TICK + (p.pri >= 3 ? 3 : 0) || (p.wave && waves >= MAX_PER_TICK - 1)) { keep.push(p); continue; }
      if (p.ch?.timedOutUntil && p.ch.timedOutUntil > this.now && p.pri < 4) continue; // timed-out users can't type
      if (p.claim && (this.sim.winner !== null || this.sim.t - p.simAt > 90)) continue; // a call the game has moved past
      if (p.wave && this.now - p.at > 1500) continue; // spam is about the moment
      if (p.pri < 3 && this.tokens < 1) { keep.push(p); continue; }
      if (p.pri < 3) this.tokens -= 1;
      if (p.wave) waves++;
      const id = this.seq++;
      const ch = p.ch;
      const m: ChatOut = { id, ...p.msg };
      if (ch) {
        m.name = ch.name; m.color = ch.color; m.badges = this.badges(ch);
        if (!m.persona && ch.who !== 'crowd' && ch.who !== 'ext') m.persona = ch.who;
        ch.spoke = true;
        if (m.kind === 'msg' && !ch.gm && m.text.includes('@' + this.gm.name)) m.mentionsMe = true;
      }
      out.push(m);
      if (m.kind === 'msg') {
        this.history.push({ id, ch, text: m.text, t: this.sim.t });
        if (this.history.length > 120) this.history.splice(0, this.history.length - 120);
        if (ch) this.sniff(ch, m.text);
      }
      _recordLine({ user: m.name ?? 'system', text: m.kind === 'msg' ? m.text : [m.title, m.text].filter(Boolean).join(' — '), persona: m.persona, t: this.sim.t, kind: m.kind === 'msg' ? 'msg' : 'notice' });
      if (p.onRelease) { const f = p.onRelease; hooks.push(() => f(id)); }
    }
    // stale backlog: drop low-priority lines that are way overdue (64× speed, big fights)
    const q = keep.sort((a, b) => a.at - b.at).concat(later);
    if (q.length > 45) {
      const cut = this.now - 2500;
      this.queue = q.filter((p) => p.pri >= 2 || p.at > cut);
      if (this.queue.length > 90) this.queue = this.queue.filter((p) => p.pri >= 3 || p.at > this.now - 1200 || (p.wave && p.at > this.now - 2000));
      if (this.queue.length > 140) this.queue.splice(0, this.queue.length - 140);
    } else this.queue = q;
    for (const h of hooks) h(); // after the queue is settled: hooks may queue follow-ups (timeouts, claims)
    return out;
  }
}
