// The Vietnamese chat reading the game like the real one does (the second Hoàng Luân stream study, 5.3k messages:
// data-raw/chat/hoangluan-notes.md). The chat brain (chatBrain.ts) owns the chatters, the queue and the pacing; this
// class only decides *when* a moment happens and asks the brain to say it. Lines live in chatVi.ts (MOMENT_LINES),
// tables in chatViLore.ts, world facts in chatWorld.ts. Only the Vietnamese pack has these categories.
//
// What it watches: the gold gap by the minute ("14p gap 6k", "3-3 mà gap 5k"), lane CS / level gaps and a lane that
// "explodes", the coach's draft (most lanes lost early → "lạy cụ ban pick"), ironic hope when the losing side wins a
// fight ("vô địch rồi", "3-2 còn nguyên") and the letdown after, the spells it took to kill a fed carry, shutdown
// gold, wipes and one-second bursts, flashy engages that kill nobody, greedy deaths (the match analyst), the
// scapegoat with 0/5 and advice for him, the tank nobody can kill late, scaling champions' stacks, the late-game
// clock, mercy and "end it", the arena crowd turning into a library, the caster desk (echoing his phrase, puns on his
// words, praising a player who then dies, agreeing with a take, yelling, getting ahead of himself), the series
// (begging for one game in a sweep, bedtime, "game sống thêm 1 tiếng"), the trophy, the MVP auction, rumours, fake
// quotes, "who need {ex-player}", a phone ringing near the mic, and the side talk (lag, corrections, other results,
// the schedule, questions to the caster, member chants).
import type { MatchSim } from '../../engine/sim/engine';
import type { GameEvent, SimChamp } from '../../engine/sim/simtypes';
import type { Role, Team } from '../../engine/types';
import type { RNG } from '../../util/rng';
import type { Ctx } from '../../engine/management/fans';
import { _getChatView, type DeskLine } from './chatFeed';
import { MAP_SIZE } from '../../engine/sim/map';
import type { ChatWorld } from './chatWorld';
import type { PickReport } from './broadcast/picks';
import { CHAMP_NICK, CHAMP_LORE, STACKERS, CROWD_CHANT, DESK_PUNS, punOf, hasPun, nameMatch } from './chatViLore';

type Tone = 'hype' | 'sad' | 'lore';
/** Who should say a line: a viewer from our side of the crowd, a random viewer, anyone, a member, or a persona. */
export type Voice = 'speaker' | 'crowd' | 'anyone' | 'member' | 'superfan' | 'rival' | 'analyst' | 'doomer' | 'memer' | 'casual' | 'backseat' | 'wholesome' | { as: string };
export interface MomentHost {
  rng: RNG; sim: MatchSim; teams: [Team, Team]; us: 0 | 1; them: 0 | 1; world: ChatWorld; picks: PickReport | null;
  series: { bestOf: number; mine: number; theirs: number; gameNo: number };
  has(cat: string): boolean;
  pool(cat: string): string[] | undefined;
  f(pool: readonly string[] | undefined, extra?: Ctx): string | null;
  say(cat: string, ctx?: Ctx, n?: number, tone?: Tone, delay?: number, important?: boolean): void;
  /** Post one line; returns the speaker's name (for replies). */
  line(who: Voice, text: string, delay: number, opt?: { reply?: { to: string; text: string }; tone?: Tone; pri?: number }): string;
  wave(key: string, ctx?: Ctx, strength?: number, tokens?: string[]): void;
  excited(d: number): void;
  mood(m: 'hype' | 'sad' | 'laugh' | 'scared' | 'bored' | 'cope' | 'neutral', secs: number): void;
  cue(kind: 'phone'): void;
  rate(): number;
}

const ROLE_VI: Record<Role, string> = { top: 'top', jungle: 'rừng', mid: 'mid', adc: 'ad', support: 'sp' };
const LANE_VI: Record<Role, string> = { top: 'top', jungle: 'rừng', mid: 'mid', adc: 'bot', support: 'bot' };
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const GREEDY = new Set(['greedy_farm', 'overextend', 'tower_dive', 'chased', 'facecheck', 'solo_engage']);
const PRAISE = /tuyệt vời|xuất sắc|đẳng cấp|quá hay|đáng sợ|hủy diệt|không thể cản|bá đạo|quá đỉnh|vũ khí|thiên tài|quái vật|không ai cản/i;
const PRAISE_CATS = new Set(['player_intro', 'player_titles', 'pk_comfort', 'pk_legacy', 'comfort_perf', 'pkm_good', 'stats_game', 'kill_solo']);
const AGREE_CATS = /^(opinion|draft_read|open_reply|analysis|wincon|macro|banter)/;
const JINX = /kết thúc rồi|chiến thắng đã|cầm chắc|không thể lật|đã xong|không còn đường/i;
const alnum = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '');
const k1 = (g: number) => `${(Math.abs(g) / 1000).toFixed(1).replace(/\.0$/, '')}k`;

export class ChatMoments {
  private kills: { t: number; side: 0 | 1 }[] = [];
  private casts: { t: number; side: 0 | 1; kind: 'R' | 'F' }[] = [];
  private ultCd: number[];
  private flashCd: number[];
  private highHpAt: number[];
  private nextClock = 600;
  private nextLane = 600;
  private nextStack = 480;
  private nextLate = 620;
  private said = new Set<string>();
  private at: Record<string, number> = {};         // sim-time cooldowns
  private realAt: Record<string, number> = {};     // real-time cooldowns (desk lines)
  private coach: { behind: number; ahead: number } | null = null;
  private hope: { side: 0 | 1; t: number; dashed: boolean } | null = null;
  private scape: { idx: number; side: 0 | 1; t: number } | null = null;
  private scapeDeaths = new Map<number, number>();
  private noDmg: { side: 0 | 1; at: number; kills: number }[] = [];
  private praised: { name: string; t: number }[] = [];
  private library = false;
  private aloAt: number | null;
  private lateSide: 0 | 1 | null = null;
  private lowAt: number[] = [];
  private ended = false;
  private now = 0;

  constructor(private h: MomentHost) {
    const n = h.sim.champs.length;
    this.ultCd = new Array(n).fill(0); this.flashCd = new Array(n).fill(0); this.highHpAt = new Array(n).fill(0);
    // the phone near the mic: about one game in nine
    this.aloAt = h.rng.chance(0.11) ? h.rng.range(360, 1500) : null;
    // a scaling draft against an early one: the late-game clock
    const late = (s: 0 | 1) => { const cs = h.sim.champs.filter((c) => c.side === s); return cs.reduce((a, c) => a + (c.champ.profile?.late ?? 5) - (c.champ.profile?.early ?? 5), 0) / Math.max(1, cs.length); };
    const d = late(0) - late(1);
    this.lateSide = d >= 1.8 ? 0 : d <= -1.8 ? 1 : null;
  }

  // ------------------------------------------------------------------ helpers
  private get sim() { return this.h.sim; }
  private short(s: 0 | 1) { return this.h.teams[s].short; }
  private lead(s: 0 | 1) { let g = 0; for (const c of this.sim.champs) g += c.side === s ? c.goldEarned : -c.goldEarned; return g; }
  private need() { return Math.ceil(this.h.series.bestOf / 2); }
  /** Series wins before this game, by side. */
  private wins(s: 0 | 1) { return s === this.h.us ? this.h.series.mine : this.h.series.theirs; }
  private seriesCtx(trail: 0 | 1): Ctx {
    const need = this.need(), bo = this.h.series.bestOf;
    const lead = (1 - trail) as 0 | 1;
    return {
      need, needm1: need - 1, bo, next: this.h.series.gameNo + 1, trail: this.short(trail), leader: this.short(lead),
      seriesHope: bo <= 1 ? 'lật kèo' : `${need}-${need - 1}`, lead3: bo <= 1 ? 'gg' : `${need}-${this.wins(trail)}`,
    };
  }
  private cool(key: string, gap: number) { const t = this.sim.t; if (t - (this.at[key] ?? -1e9) < gap) return false; this.at[key] = t; return true; }
  private coolReal(key: string, gapMs: number) { if (this.now - (this.realAt[key] ?? -1e9) < gapMs) return false; this.realAt[key] = this.now; return true; }
  private once(key: string) { if (this.said.has(key)) return false; this.said.add(key); return true; }
  private nick(c: SimChamp) { const n = CHAMP_NICK[c.champ.id]; return n ? n[0] : c.champ.name; }
  private killsSince(side: 0 | 1, t: number) { return this.kills.filter((k) => k.side === side && k.t >= t).length; }
  private opp(c: SimChamp) { return this.sim.champs.find((x) => x.side !== c.side && x.role === c.role); }
  private pick<T>(a: T[]) { return this.h.rng.pick(a); }

  // ------------------------------------------------------------------ the start: the stream, the draft, the arena
  start() {
    const h = this.h, r = h.rng, sim = this.sim;
    h.say('start_tech', {}, r.int(1, 2), undefined, 1.5);
    if (r.chance(0.45)) h.say('draft_music', {}, r.int(1, 2), undefined, 3);
    let d = 6;
    for (const c of r.shuffle([...sim.champs])) {
      const ctx = { player: c.input.name, champ: c.champ.name, nick: this.nick(c), role: ROLE_VI[c.role] };
      if (nameMatch(c.input.name, c.champ) && r.chance(0.8)) { h.say('name_match', ctx, 2, 'hype', d); d += 3; }
      else if ((c.champ.key ?? 999) <= 40 && r.chance(0.18)) { h.say('pick_old', ctx, 1, undefined, d); d += 2.5; }
      else if ((h.picks?.byIdx.get(c.idx) ?? []).some((n) => n.kind === 'signature' || n.kind === 'legacy' || n.kind === 'onetrick') && r.chance(0.3)) { h.say('name_match', ctx, 1, undefined, d); d += 2.5; }
      else if ((h.picks?.byIdx.get(c.idx) ?? []).some((n) => n.kind === 'offrole' || n.kind === 'offmeta') && r.chance(0.5)) { h.say('pick_ask', ctx, 1, undefined, d); d += 2.5; }
      if (d > 26) break;
    }
    for (const c of r.shuffle([...sim.champs]).slice(0, r.int(0, 2))) h.say('pick_oh', { player: c.input.name, champ: c.champ.name }, 1, undefined, 4 + r.range(0, 8));
    // a bad game someone remembers: the same player on the same champion again
    for (const inc of h.world.incident) {
      const c = sim.champs.find((x) => x.input.name === inc.player);
      if (c && (c.champ.name === inc.champ || c.champ.id === inc.champ || r.chance(0.35))) { h.say('incident', { player: inc.player, champ: inc.champ }, 1, 'lore', 9); break; }
    }
    if (h.series.gameNo >= 2 || (h.series.bestOf > 1 && r.chance(0.5))) h.say('series_predict', this.seriesCtx(this.h.them), r.int(1, 2), undefined, 7);
    this.crowdChant(0.5, 5);
    if (h.world.crowd.side !== null && r.chance(0.6)) h.say('crowd_hear', { city: h.world.crowd.city }, 1, undefined, 8);
    // late at night in Vietnam, a sweep on the cards
    if (h.world.late && this.sweepOn() !== null && r.chance(0.6)) h.say('bed', this.seriesCtx(this.sweepOn()!), 1, undefined, 12);
  }
  /** The side that would complete a sweep by winning this game (Bo3+), or null. */
  private sweepOn(): 0 | 1 | null {
    const need = this.need();
    if (this.h.series.bestOf < 3) return null;
    for (const s of [0, 1] as const) if (this.wins(s) === need - 1 && this.wins((1 - s) as 0 | 1) === 0) return s;
    return null;
  }
  private crowdChant(strength: number, delay = 0) {
    const cr = this.h.world.crowd;
    if (cr.side === null) return;
    const fav = this.short(cr.side);
    const chants = (CROWD_CHANT[cr.region] ?? CROWD_CHANT.other).map((x) => x.replace(/\{FAV\}/g, fav));
    const [a, b] = this.h.rng.shuffle([...chants]);
    if (delay <= 0) this.h.wave('crowd', { chant: a, chant2: b ?? a }, strength);
    else this.h.line('crowd', a, delay);
  }

  // ------------------------------------------------------------------ every chat tick
  tick(now: number) {
    this.now = now;
    const h = this.h, sim = this.sim, t = sim.t, r = h.rng;
    if (sim.winner !== null) return;
    // casts (ultimates, Flashes) and who was healthy when: for "4 ulti 2 flash" and "chết trong 0,3s"
    sim.champs.forEach((c, i) => {
      const ult = c.abilities.find((a) => a.slot === 'R');
      if (ult && ult.cdUntil > this.ultCd[i] + 1) { this.casts.push({ t, side: c.side, kind: 'R' }); }
      if (ult) this.ultCd[i] = ult.cdUntil;
      if (c.flashReadyAt > this.flashCd[i] + 1) this.casts.push({ t, side: c.side, kind: 'F' });
      this.flashCd[i] = c.flashReadyAt;
      if (!c.dead && c.hp >= c.stats.maxHp * 0.85) this.highHpAt[i] = t;
      // a close call: alive on a sliver of HP right after a fight
      if (!c.dead && c.level >= 4 && c.hp > 0 && c.hp < c.stats.maxHp * 0.04 && t - c.lastCombatAt < 1.5 && t - (this.lowAt[i] ?? -1e9) > 150) {
        this.lowAt[i] = t;
        if (r.chance(0.3) && this.cool('close', 75)) h.say('close_call', { name: c.input.name }, r.int(1, 2), undefined, 0.8);
      }
    });
    if (this.casts.length > 80) this.casts = this.casts.filter((x) => t - x.t < 15);
    if (this.kills.length > 200) this.kills = this.kills.filter((x) => t - x.t < 120);
    const lead0 = this.lead(0), abs = Math.abs(lead0), leader: 0 | 1 = lead0 >= 0 ? 0 : 1, trail = (1 - leader) as 0 | 1;
    const mins = Math.floor(t / 60);
    // the gold clock
    if (t >= this.nextClock) {
      this.nextClock = t + r.range(110, 170);
      if (abs >= 3000 && t >= 600) {
        const kw = sim.teams[leader].kills, kl = sim.teams[trail].kills;
        const ctx = { mins, gold: k1(abs), leader: this.short(leader), kw, kl };
        if (kl >= kw - 1 && r.chance(0.6)) h.say('gap_paradox', ctx, abs >= 6000 ? 2 : 1, undefined, 0.5);
        else h.say('gap_clock', ctx, abs >= 8000 ? 3 : abs >= 5000 ? 2 : 1, undefined, 0.5);
      }
    }
    // lanes: CS, levels, a lane far behind; the coach's draft at 14 minutes
    if (t >= this.nextLane) { this.nextLane = t + 60; this.lanes(); }
    // scaling champions, counted
    if (t >= this.nextStack) {
      this.nextStack = t + r.range(200, 270);
      const st = sim.champs.filter((c) => STACKERS[c.champ.id] && !c.dead);
      if (st.length && r.chance(0.65)) {
        const c = r.pick(st), s = STACKERS[c.champ.id];
        const n = s.est(c.cs, c.kills + c.assists, t / 60);
        if (n >= 3) h.say('stacks', { player: c.input.name, champ: this.nick(c), n, unit: s.unit, mins }, r.int(1, 2), undefined, 0.6);
      }
    }
    // the late-game clock for a scaling draft that is behind
    if (this.lateSide !== null && t >= this.nextLate && t < 26 * 60) {
      this.nextLate = t + r.range(200, 260);
      const behind = -this.lead(this.lateSide);
      if (behind >= 1500 && r.chance(0.7)) {
        h.say('late_clock', { late: this.short(this.lateSide), m: r.pick([30, 35, 40]), n: r.pick([3, 4, 5]) }, 1, undefined, 0.5);
        if (behind >= 3500 && r.chance(0.6)) h.say('late_rebut', { mins, gold: k1(behind) }, 1, undefined, 3);
      }
    }
    // the tank nobody will kill late
    if (t >= 1200 && this.cool('tankCheck', 40)) {
      for (const c of sim.champs) {
        if (c.dead || !c.champ.tags.includes('Tank') || (c.champ.profile?.tankiness ?? 0) < 8) continue;
        const items = c.items.filter((i) => i.frac >= 1 && !i.starter).length;
        if ((c.kills + c.assists >= 6 || items >= 4) && this.once(`tank${c.idx}`) && r.chance(0.7)) {
          const text = h.f(h.pool('tank_late'), { champ: this.nick(c) });
          if (!text) continue;
          const asker = h.line('crowd', text, 0.5);
          for (let i = 0, k = r.int(1, 3); i < k; i++) { const a = h.f(h.pool('tank_reply'), { user: asker, champ: this.nick(c) }); if (a) h.line('anyone', a, 2 + i * r.range(1, 2.5), { reply: { to: asker, text } }); }
          break;
        }
      }
    }
    // flashy engages that kill nobody
    for (const p of this.noDmg) if (t >= p.at) {
      p.at = Infinity;
      if (this.kills.filter((k) => k.side === p.side).length === p.kills && this.cool('noDmg', 150) && r.chance(0.55)) {
        h.say('no_dmg', {}, 2, undefined, 0.3);
        if (r.chance(0.35)) h.wave('no_dmg', {}, 0.5);
      }
    }
    this.noDmg = this.noDmg.filter((p) => p.at !== Infinity);
    // the caster in a stomp, mercy, "end it"
    if (abs >= 8000 && this.cool('deskFlat', 240) && r.chance(0.5)) h.say('desk_flat', { trail: this.short(trail) }, 1, undefined, 0.5);
    if (abs >= 10000 && t >= 22 * 60 && this.cool('mercy', 200)) { h.say('mercy', { trail: this.short(trail) }, 2, 'sad', 0.5); if (r.chance(0.3)) h.wave('mercy', {}, 0.5); }
    else if (abs >= 8000 && t >= 28 * 60 && this.cool('drag', 200)) h.say('drag', { leader: this.short(leader), mins }, 2, undefined, 0.5);
    // a sweep on the line: the losing side's fans beg for one game; bedtime
    const sw = this.sweepOn();
    if (sw !== null && this.lead(sw) >= 3500 && t >= 900 && this.cool('beg', 240) && r.chance(0.6)) {
      h.say('sweep_beg', { ...this.seriesCtx((1 - sw) as 0 | 1), gold: k1(this.lead(sw)) }, r.int(1, 2), undefined, 0.5);
      if (h.world.late && r.chance(0.45)) h.say('bed', { ...this.seriesCtx((1 - sw) as 0 | 1), leader: this.short(sw) }, 1, undefined, 3);
    }
    // the arena goes quiet when its team falls behind
    const cs = h.world.crowd.side;
    if (cs !== null && !this.library && this.lead(cs) <= -4500 && this.cool('library', 300)) {
      this.library = true;
      h.say('library', { city: h.world.crowd.city, leader: this.short((1 - cs) as 0 | 1) }, 2, undefined, 0.5);
      if (r.chance(0.45)) h.wave('library', { city: h.world.crowd.city }, 0.5);
    }
    // the phone near the mic
    if (this.aloAt !== null && t >= this.aloAt) {
      this.aloAt = null;
      h.cue('phone');
      h.wave('alo', {}, 1);
      h.say('alo_after', {}, 5, undefined, 4.5, true);
      h.mood('laugh', 20);
    }
  }

  private lanes() {
    const h = this.h, sim = this.sim, t = sim.t, r = h.rng, us = h.us;
    let behind = 0, ahead = 0;
    for (const role of ROLES) {
      const a = sim.champs.find((c) => c.side === us && c.role === role), b = sim.champs.find((c) => c.side !== us && c.role === role);
      if (!a || !b) continue;
      const g = a.goldEarned - b.goldEarned;
      if (g <= -600) behind++; else if (g >= 600) ahead++;
      // the one who is behind, by CS and by level
      const [lo, hi] = a.cs <= b.cs ? [a, b] : [b, a];
      const dcs = hi.cs - lo.cs;
      if (dcs >= 30 && t < 1500 && this.once(`cs${role}${Math.floor(t / 300)}`) && r.chance(0.55)) h.say(role === 'jungle' && r.chance(0.6) ? 'cs_gap_jungle' : 'cs_gap', { role: ROLE_VI[role], n: dcs, name: lo.input.name, a: lo.cs, b: hi.cs }, 1, undefined, 0.5);
      const [llo, lhi] = a.level <= b.level ? [a, b] : [b, a];
      if (lhi.level - llo.level >= 2 && this.once(`lvl${role}${Math.floor(t / 420)}`) && r.chance(0.5)) {
        h.say('lvl_gap', { role: ROLE_VI[role], n: lhi.level - llo.level, name: llo.input.name }, 1, undefined, 0.8);
        if (r.chance(0.25) && this.cool('roleGapWave', 420)) h.wave('role_gap', { role: ROLE_VI[role] }, 0.4);
      }
      // a lane that explodes early
      if (Math.abs(g) >= 2500 && t < 1100 && this.once(`boom${role}${g > 0 ? 1 : 0}`) && r.chance(0.7)) {
        h.say('lane_boom', { lane: LANE_VI[role] }, r.int(1, 2), undefined, 0.5);
        if (r.chance(0.5)) h.say('role_gap', { role: ROLE_VI[role] }, 1, undefined, 2);
      }
      // ours, hopeless in lane: pull the plug
      const me = a;
      if ((b.cs - me.cs >= 40 || -g >= 2000) && t < 1200 && me.role !== 'support' && this.once(`tube${role}`) && r.chance(0.75)) {
        h.say('tube', { role: ROLE_VI[role], name: me.input.name, pun: punOf(me.input.name, (x) => r.pick(x)) }, r.int(1, 3), 'sad', 0.6);
      }
    }
    if (t >= 840 && !this.coach) {
      this.coach = { behind, ahead };
      if (behind >= 3) { h.say('coach_blame', { n: behind }, r.int(2, 3), undefined, 0.8); h.excited(6); }
      else if (ahead >= 3 && r.chance(0.75)) h.say('coach_praise', { n: ahead }, r.int(1, 2), 'hype', 0.8);
    }
  }

  // ------------------------------------------------------------------ events
  onEvent(e: GameEvent) {
    const h = this.h, sim = this.sim, r = h.rng;
    if (e.type === 'tower') {
      const m = /destroy the (top|mid|bot) (outer|inner) turret/.exec(e.text);
      const loser = e.side === undefined ? null : ((1 - e.side) as 0 | 1);
      if (m && loser !== null && ((m[2] === 'outer' && e.t < 600) || (m[2] === 'inner' && e.t < 960)) && this.once(`tw${loser}${m[1]}`) && r.chance(0.6)) h.say('lane_boom', { lane: m[1] }, 1, undefined, 0.4);
      return;
    }
    if (e.type === 'teamfight' || (e.type === 'ult' && /hits [2-5]/.test(e.text) && !/kill/.test(e.text))) {
      if (e.type === 'teamfight') this.offScreen(e.pos);
      if (e.side !== undefined) this.noDmg.push({ side: e.side, at: e.t + 7, kills: this.kills.filter((k) => k.side === e.side).length });
      return;
    }
    if (e.type === 'ace' && e.side !== undefined) {
      const loser = (1 - e.side) as 0 | 1;
      if (this.lead(loser) >= 2000 && this.cool('selfd', 120) && r.chance(0.7)) h.say('self_destruct', { loser: this.short(loser) }, 2, undefined, 1);
      return;
    }
    if ((e.type !== 'kill' && e.type !== 'firstBlood') || e.side === undefined || e.victim === undefined) return;
    const side = e.side, other = (1 - side) as 0 | 1;
    const v = sim.champs[e.victim], k = e.killer !== undefined ? sim.champs[e.killer] : undefined;
    this.kills.push({ t: e.t, side });
    const ctx: Ctx = { victim: v.input.name, killer: k?.input.name, role: ROLE_VI[v.role], k: v.kills, d: v.deaths, team: this.short(side) };
    // a one-second burst
    const secs = e.t - this.highHpAt[v.idx];
    if (secs <= 1.2 && v.level >= 6 && r.chance(0.3)) h.say('burst', { ...ctx, secs: Math.max(0.1, secs).toFixed(1).replace('.', ',') }, 1, undefined, 0.6);
    // what it took to kill a fed carry
    if (v.kills >= 5 && v.kills >= v.deaths * 2) {
      const recent = this.casts.filter((c) => c.side === side && e.t - c.t <= 8);
      const u = recent.filter((c) => c.kind === 'R').length, fl = recent.filter((c) => c.kind === 'F').length;
      if (u + fl >= 3 && r.chance(0.75)) h.say('cost_count', { u, fl }, r.int(1, 2), undefined, 0.8);
    }
    if ((e.bounty ?? 0) >= 500 && r.chance(0.6)) h.say('shutdown_count', { ...ctx, bounty: e.bounty, bountyR: Math.round((e.bounty ?? 0) / 100) * 100 }, r.int(1, 2), undefined, 0.7);
    // greedy deaths (the match analyst says why he died)
    const why = sim.analyst?.mistakes.find((m) => m.who === v.idx && Math.abs(m.t - e.t) <= 1.5 && GREEDY.has(m.kind));
    if (why && r.chance(0.55)) { h.say('greedy', ctx, r.int(1, 3), undefined, 0.5); if (r.chance(0.35) && this.cool('thamWave', 240)) h.wave('tham', {}, 0.4); }
    // the scapegoat, advice for him, a defender, and the teammate who pays it back
    const mates = sim.champs.filter((c) => c.side === v.side);
    if (v.deaths >= 4 && v.kills <= 1 && v.deaths >= Math.max(...mates.map((c) => c.deaths)) && v.deaths - (this.scapeDeaths.get(v.idx) ?? 0) >= 2) {
      this.scapeDeaths.set(v.idx, v.deaths);
      this.scape = { idx: v.idx, side: v.side, t: e.t };
      h.say('scapegoat', ctx, r.int(1, 2), undefined, 1);
      if (v.role === 'adc' && r.chance(0.55)) h.wave('advice', {}, 0.5);
      else if (r.chance(0.5)) h.say(`advice_${v.role}`, ctx, 1, undefined, 2);
      if (r.chance(0.3)) h.say('defend_player', ctx, 1, undefined, 4);
    } else if (this.scape && k && this.scape.side === side && e.t - this.scape.t < 30 && k.idx !== this.scape.idx && r.chance(0.35)) {
      h.say('balance', { victim: sim.champs[this.scape.idx].input.name, killer: k.input.name, team: this.short(side) }, 1, undefined, 1.5);
      this.scape = null;
    }
    // the caster praised him a minute ago
    const pr = this.praised.findIndex((p) => p.name === v.input.name && e.t - p.t < 90);
    if (pr >= 0) { this.praised.splice(pr, 1); if (r.chance(0.75)) h.say('desk_curse', ctx, r.int(1, 3), undefined, 1); }
    // puns and nicknames, a champion's lore, the player who IS the champion
    if (k && hasPun(k.input.name) && r.chance(0.18)) h.say('pun_kill', { kpun: punOf(k.input.name, (x) => r.pick(x)) }, 1, side === h.us ? 'hype' : undefined, 0.8);
    else if ((hasPun(v.input.name) || CHAMP_NICK[v.champ.id]) && r.chance(0.12)) h.say('pun_death', { vpun: punOf(v.input.name, (x) => r.pick(x)), vnick: this.nick(v) }, 1, undefined, 0.8);
    if (k && CHAMP_LORE[k.champ.id] && k.kills >= 2 && r.chance(0.16)) { const tx = h.f(CHAMP_LORE[k.champ.id], { player: k.input.name, team: this.short(side) }); if (tx) h.line('speaker', tx, 1); }
    if (k && nameMatch(k.input.name, k.champ) && k.kills >= 2 && r.chance(0.3)) h.say('name_match', { player: k.input.name, champ: k.champ.name, nick: this.nick(k) }, 1, 'hype', 1);
    // a player on an expiring deal popping off: chat starts selling him
    if (k && h.world.contractYear.includes(k.input.name) && k.kills >= 4 && k.deaths <= 1 && this.once(`cy${k.idx}`)) {
      h.say('contract_year', { player: k.input.name, year1: h.world.ctx.year1 }, 2, undefined, 1);
      this.auction(k.input.name, 0.35);
    }
    const inc = h.world.incident.find((x) => x.player === v.input.name);
    if (inc && v.deaths >= 3 && this.once(`inc${v.idx}`) && r.chance(0.6)) h.say('incident', { player: inc.player, champ: inc.champ }, 1, 'lore', 1.2);
    if (this.killsSince(side, e.t - 6) + this.killsSince(other, e.t - 6) >= 2) this.offScreen(e.pos);
    // wipes
    if (this.killsSince(side, e.t - 5) >= 3 && this.killsSince(other, e.t - 5) === 0 && this.cool('wipe', 60)) {
      h.say('wipe', {}, 2, side === h.us ? 'hype' : undefined, 0.3);
      h.wave('wipe', {}, 0.7);
    }
    // ironic hope: the side that is losing wins a fight… and the letdown
    const trailing = this.lead(side) <= -3500 || (this.wins(side) < this.wins(other) && this.lead(side) <= -1500);
    if (trailing && this.killsSince(side, e.t - 12) >= 2 && this.killsSince(other, e.t - 12) === 0 && this.cool('hope', 150)) {
      this.hope = { side, t: e.t, dashed: false };
      h.say('hope', this.seriesCtx(side), r.int(2, 3), 'hype', 0.4, true);
      h.wave('hope', this.seriesCtx(side), 0.7);
      if (r.chance(0.45)) h.say('desk_hot', {}, 1, undefined, 2.5);
      h.excited(15);
    } else if (this.hope && !this.hope.dashed && side !== this.hope.side && e.t - this.hope.t < 45 && this.killsSince(side, this.hope.t) >= 2) {
      this.hope.dashed = true;
      if (r.chance(0.75)) h.say('hope_dashed', this.seriesCtx(this.hope.side), r.int(1, 2), undefined, 0.6);
    }
    // the arena wakes up
    const cs = h.world.crowd.side;
    if (cs === side && this.library && this.killsSince(side, e.t - 12) >= 2) {
      this.library = false;
      h.say('library_open', {}, 2, 'hype', 0.5);
      this.crowdChant(0.6);
    }
    // the "neutral" Vietnamese channel
    if (h.world.vnSide === side && this.killsSince(side, e.t - 10) >= 2 && this.cool('bias', 400) && r.chance(0.3)) h.say('desk_bias', { vnteam: this.short(side) }, 1, undefined, 2);
  }

  /** A fight the camera isn't looking at: "cam anh ơi" (the user is the one holding the camera). */
  private offScreen(p?: { x: number; y: number }) {
    const v = _getChatView();
    if (!p || !v || v.zoom < 1.2 || this.h.rate() > 12) return;
    const half = MAP_SIZE / 2 / v.zoom;
    const off = Math.max(Math.abs(p.x - v.cx), Math.abs(p.y - v.cy)) / half;
    if (off < 1.25 || !this.cool('cam', 200) || !this.h.rng.chance(0.6)) return;
    this.h.say('cam', {}, 2, undefined, 0.4);
    if (this.h.rng.chance(0.5)) this.h.wave('cam', {}, 0.5);
  }

  /** Chat sells a player around: "T1 Raptor", "GAM Raptor", bare club names, "mua hết". */
  private auction(player: string, strength: number) {
    const clubs = this.h.world.clubs;
    if (!clubs.length) return;
    const toks = this.h.rng.shuffle(clubs.slice(0, 7)).map((c) => `${c} ${player}`);
    if (this.h.world.vnClub) toks.unshift(`${this.h.world.vnClub} ${player}`, `${this.h.world.vnClub} ${player}`);
    this.h.wave('auction', {}, strength, [...toks, ...clubs.slice(0, 3)]);
  }

  // ------------------------------------------------------------------ the caster desk
  onDesk(l: DeskLine) {
    const h = this.h, r = h.rng, sim = this.sim;
    if (l.lang !== 'vi' || sim.winner !== null) return;
    const names = sim.champs.map((c) => c.input.name).filter((n) => n.length >= 3 && l.text.includes(n));
    // praise: chat notices, and remembers (the caster's curse)
    if (names.length && (PRAISE_CATS.has(l.cat) || PRAISE.test(l.text))) {
      for (const n of names) this.praised.push({ name: n, t: sim.t });
      if (this.praised.length > 6) this.praised.splice(0, this.praised.length - 6);
      if (r.chance(0.3) && this.coolReal('praise', 90000)) h.say('desk_praise_seen', {}, 1, undefined, 1.2);
    }
    // a yell
    if ((l.pri >= 4 || (l.text.match(/!/g) ?? []).length >= 2) && r.chance(0.15) && this.coolReal('hot', 120000)) {
      h.say('desk_hot', {}, 1, undefined, 1.5);
      const vs = h.world.vnSide;
      if (vs !== null && this.lead(vs) > 0 && r.chance(0.35)) h.say('desk_bias', { vnteam: this.short(vs) }, 1, undefined, 3);
    }
    // a take chat agrees with
    if (AGREE_CATS.test(l.cat) && r.chance(0.3) && this.coolReal('agree', 80000)) h.say('desk_agree', {}, r.int(2, 4), undefined, 1.5);
    // getting ahead of himself
    if (JINX.test(l.text) && r.chance(0.3) && this.coolReal('jinx', 90000)) h.say('desk_jinx', {}, r.int(1, 2), undefined, 1.5);
    // a word chat twists into a pun wave, or a short exclamation everyone repeats
    if (this.now - (this.realAt.echo ?? -1e9) < 150000) return;
    const pun = DESK_PUNS.find(([re]) => re.test(l.text));
    if (pun && r.chance(0.3)) { this.realAt.echo = this.now; h.wave('echo', {}, 0.6, pun[1]); return; }
    if (l.pri >= 3 && r.chance(0.1)) {
      const frags = l.text.split(/[!?.…—,]/).map((x) => x.trim()).filter((x) => { const w = x.split(/\s+/).length; return w >= 2 && w <= 5 && x.length <= 26 && !/\{|\d/.test(x); });
      if (!frags.length) return;
      const fr = r.pick(frags), low = fr.toLowerCase();
      this.realAt.echo = this.now;
      h.wave('echo', {}, 0.55, [low, low, `${low} :)))`, fr.toUpperCase(), `${low}...`]);
    }
  }

  // ------------------------------------------------------------------ the end of a game (and maybe of the series)
  onEnd(winner: 0 | 1) {
    if (this.ended) return;
    this.ended = true;
    const h = this.h, sim = this.sim, r = h.rng, loser = (1 - winner) as 0 | 1;
    const need = this.need(), bo = h.series.bestOf;
    const wW = this.wins(winner) + 1, wL = this.wins(loser);
    const best = (s: 0 | 1) => [...sim.champs.filter((c) => c.side === s)].sort((a, b) => (b.kills * 3 + b.assists * 2 - b.deaths * 2) - (a.kills * 3 + a.assists * 2 - a.deaths * 2))[0];
    const mvp = best(winner);
    const wctx: Ctx = { winner: this.short(winner), mvp: mvp?.input.name, cup: h.world.cup ?? undefined, prize: h.world.prize ?? undefined, year: h.world.ctx.year, need };
    // the side that was facing elimination survives
    if (bo > 1 && wL === need - 1 && wW < need) {
      h.say('alive', { ...this.seriesCtx(winner), next: h.series.gameNo + 1 }, r.int(2, 3), 'hype', 2, true);
      if (r.chance(0.5)) h.wave('hope', this.seriesCtx(winner), 0.6);
      if (h.world.crowd.side === winner && this.library) h.say('library_open', {}, 1, 'hype', 5);
    }
    // the series is over
    if (bo <= 1 || wW >= need) {
      if (bo > 1 && wL === 0) { h.say('sweep_slang', { need }, r.int(1, 2), undefined, 3); h.say('style_win', wctx, 1, undefined, 5); if (h.world.late && r.chance(0.6)) h.say('bed', { ...this.seriesCtx(loser), leader: this.short(winner) }, 1, undefined, 8); }
      if (h.world.final) {
        if (h.world.prize) h.say('trophy', wctx, r.int(1, 2), 'hype', 6, true);
        const kn = h.world.king[winner];
        if (kn >= 1 && h.world.cup) { h.say('king', { ...wctx, kn: kn + 1, kn1: kn + 2 }, r.int(2, 3), 'hype', 7, true); h.wave('vua', wctx, 0.8); }
        h.say('ceremony', wctx, 1, undefined, 14);
        const ex = h.world.exPlayers[winner][0];
        if (ex && r.chance(0.8)) h.say('who_need', { ex }, r.int(2, 3), undefined, 10);
        if (r.chance(0.6)) h.say('thank_you', wctx, 1, undefined, 18);
      }
      if (mvp && (h.world.final || mvp.kills >= 5 || r.chance(0.5))) {
        this.auction(mvp.input.name, h.world.final ? 0.9 : 0.5);
        h.say('auction', wctx, r.int(1, 2), undefined, 9);
        const club = r.pick(h.world.clubs.length ? h.world.clubs : [this.short(loser)]);
        const rum = h.f(h.pool('rumour'), { ...wctx, club, team: this.short(winner) });
        if (rum && r.chance(0.6)) { const who = h.line('crowd', rum, 16); const back = h.f(h.pool('rumour_reply')); if (back) h.line('anyone', `@${who} ${back}`, 19, { reply: { to: who, text: rum } }); }
      }
      const quoted = sim.champs.find((c) => c.side === winner && h.world.prevTeam[c.input.name] && r.chance(0.5));
      if (quoted && r.chance(0.55)) h.say('fake_quote', { player: quoted.input.name, oldteam: h.world.prevTeam[quoted.input.name] }, 1, undefined, 13);
    } else if (mvp && mvp.kills >= 6 && mvp.deaths <= 2) {
      // a standout game mid-series: the price goes up
      this.auction(mvp.input.name, 0.35);
    }
    // the coach after a draft that lost (or won) the lanes
    if (this.coach) {
      if (loser === h.us && this.coach.behind >= 3 && r.chance(0.8)) h.say('coach_blame_end', {}, r.int(1, 2), undefined, 6);
      else if (winner === h.us && this.coach.ahead >= 3 && r.chance(0.5)) h.say('coach_praise', { n: this.coach.ahead }, 1, 'hype', 7);
    }
    // the scoreboard read aloud
    const carries = sim.champs.filter((c) => c.role !== 'support');
    const top = [...sim.champs].sort((a, b) => b.damageDealt - a.damageDealt)[0];
    const low = [...carries].sort((a, b) => a.damageDealt - b.damageDealt)[0];
    const adc = sim.champs.find((c) => c.side === loser && c.role === 'adc'), sp = sim.champs.find((c) => c.side === loser && c.role === 'support');
    const dctx: Ctx = {
      dname: top?.input.name, dmg: top ? Math.round(top.damageDealt / 1000) : undefined, lowname: low?.input.name, lowdmg: low ? Math.round(low.damageDealt / 1000) : undefined,
      adc: adc && sp && adc.damageDealt < sp.damageDealt * 1.25 ? adc.input.name : undefined, adcdmg: adc ? Math.round(adc.damageDealt / 1000) : undefined,
    };
    if (r.chance(0.8)) h.say('dmg_chart', dctx, r.int(2, 3), undefined, 20);
  }

  /** A big Super Chat lands. */
  onSuperChat(big: boolean) { if (big && this.h.rng.chance(0.6)) this.h.wave('vip', {}, 0.4); }

  // ------------------------------------------------------------------ side talk (the brain's scene slot)
  scene(): boolean {
    const h = this.h, r = h.rng, w = h.world, sim = this.sim;
    const over = sim.winner !== null;
    const opts: [string, number][] = over
      ? [['post', 2], ['results', w.results.length ? 1 : 0], ['schedule', w.next.length ? 1.2 : 0], ['caster', 0.8]]
      : [['caster', 1.4], ['lag', 0.45], ['correct', 0.5], ['results', w.results.length ? 0.7 : 0], ['schedule', w.next.length ? 0.6 : 0], ['police', 0.35], ['chant', 0.6]];
    const kind = r.weighted(opts, (o) => o[1])[0];
    switch (kind) {
      case 'caster': {
        const t = h.f(h.pool('to_caster'));
        if (!t) return false;
        const who = h.line('crowd', t, 0);
        // nobody answers: he asks again (and again)
        if (r.chance(0.3)) { h.line({ as: who }, t, r.range(12, 20)); if (r.chance(0.4)) h.line({ as: who }, t, r.range(30, 45)); }
        else if (r.chance(0.35)) h.line('anyone', r.pick([`@${who} anh ấy đang bình luận mà`, `@${who} hỏi hoài`, `@${who} anh Lu không đọc đâu :)))`, `@${who} chờ hết trận`]), r.range(2, 4), { reply: { to: who, text: t } });
        return true;
      }
      case 'lag': {
        const q = r.pick(['có ai lag không', 'đơ à ae', 'ủa đứng hình', 'sập stream à', 'ủa time đơ hay máy t đơ']);
        const who = h.line('crowd', q, 0);
        for (let i = 0, n = r.int(1, 3); i < n; i++) h.line('anyone', r.pick([`@${who} f5 đi`, `@${who} mạng nhà bạn đấy`, `@${who} bên mình vẫn mượt`, `@${who} không lag`, `@${who} hạ chất lượng xuống`]), 1.5 + i * r.range(1, 2.5), { reply: { to: who, text: q } });
        return true;
      }
      case 'correct': {
        // somebody gets a fact wrong; others correct him with an @
        const c = r.pick(sim.champs), wrongClub = r.pick(w.clubs.length ? w.clubs : [this.short(h.them)]);
        const facts: [string, string][] = [
          [`${c.input.name} đánh cho ${wrongClub} à`, `${c.input.name} của ${this.short(c.side)} mà`],
          [`${c.input.name} đi ${ROLE_VI[r.pick(ROLES.filter((x) => x !== c.role))]} à`, `${c.input.name} đi ${ROLE_VI[c.role]} mà`],
        ];
        if (h.series.bestOf > 1) facts.push([`${this.short(h.us)} đang thua ${h.series.theirs + 1}-${h.series.mine} hả`, `${this.short(h.us)} ${h.series.mine}-${h.series.theirs} ${this.short(h.them)} mà bạn`]);
        const [q, a] = r.pick(facts);
        if (q.includes(wrongClub) && wrongClub === this.short(c.side)) return false;
        const who = h.line('crowd', q, 0);
        h.line('anyone', `@${who} ${a}`, r.range(2, 3.5), { reply: { to: who, text: q } });
        if (r.chance(0.4)) h.line('anyone', `@${who} ${r.pick(['sai rồi', 'xem lại đi bạn', ':)))', 'học lại đi'])}`, r.range(3.5, 5));
        return true;
      }
      case 'results': {
        const res = r.pick(w.results);
        const t = r.pick([`${res} rồi ae`, `kèo kia ${res} rồi`, `bên kia ${res}`, `NÓNG: ${res}`, `${res} kìa anh Lu`]);
        const who = h.line('crowd', t, 0);
        if (r.chance(0.5)) h.line('anyone', r.pick([`@${who} thật à`, `@${who} biết rồi`, `@${who} hay đấy`, `@${who} spoil à :)))`]), r.range(2, 4), { reply: { to: who, text: t } });
        return true;
      }
      case 'schedule': {
        const nx = r.pick(w.next);
        const [a] = nx.label.split(' vs ');
        const q = r.pick([`${a} mấy giờ đánh vậy ae`, 'trận sau mấy giờ ae', `${nx.label} khi nào đánh`, 'mai có trận nào không ae']);
        const who = h.line('crowd', q, 0);
        const ans = h.line('anyone', r.pick([`@${who} ${nx.label} ${nx.when} nha`, `@${who} ${nx.when}`, `@${who} ${nx.when} bạn ơi`]), r.range(2, 4), { reply: { to: who, text: q } });
        if (r.chance(0.3)) h.line({ as: who }, `@${ans} cảm ơn nha`, r.range(5, 7));
        return true;
      }
      case 'police': {
        const q = r.pick(['có ai chơi game khác không ae', 'tối nay xem bóng đá không ae', 'ae ăn tối gì', 'có ai thi IELTS chưa', 'giá vàng hôm nay sao ae']);
        const who = h.line('crowd', q, 0);
        h.line('anyone', r.pick([`@${who} hỏi ngoài LoL thì lên ChatGPT mà hỏi`, `@${who} xem game đi`, `@${who} lạc đề rồi`, `@${who} hỏi tào lao`]), r.range(2, 3.5), { reply: { to: who, text: q } });
        return true;
      }
      case 'chant': {
        const t = h.f(h.pool('member_chant'), { shortx: alnum(this.short(h.us)), starx: alnum(h.f(['{star}']) ?? '') || undefined });
        if (!t) return false;
        h.line('member', t, 0);
        if (r.chance(0.5)) h.line('member', t, r.range(0.8, 2));
        return true;
      }
      case 'post': {
        const cat = r.weighted(['post_series', 'to_caster', 'auction'], (c) => (c === 'post_series' ? 3 : 1));
        const mvp = [...sim.champs.filter((c) => c.side === sim.winner)].sort((a, b) => b.kills - a.kills)[0];
        h.say(cat, { mvp: mvp?.input.name, vnclub: w.vnClub ?? undefined }, 1, undefined, 0);
        return true;
      }
    }
    return false;
  }
}
