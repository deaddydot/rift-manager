// What the live match sounds like: reads the sim's events and state each frame and plays the right sound — kills
// (ours and theirs), first blood, multi-kills, aces, shutdowns, objectives, steals, towers, inhibitors, the Nexus,
// the end — and an ultimate plays the caster's signature sound (CommunityDragon) with a whoosh. Our team also pings
// like a real one: danger when someone is being ganked, "enemy missing" when a lane opponent vanishes in laning,
// on-my-way for a teleport, assist when a fight breaks out, the objective call when the team commits to a drake or
// Baron, retreat when it backs off. Pings show on the map too (renderer draws `pings`).
// Sounds are panned by where they happen on screen, quieter off-screen, rate-limited, and thinned out at high speed.
import type { MatchSim } from '../../engine/sim/engine';
import type { View } from '../match/camera';
import { MAP_SIZE, type Vec } from '../../engine/sim/map';
import { ping, sting, champSignature, champSfxUrl, preload, type PingKind, type Sting } from './sound';

export interface MapPing { pos: Vec; kind: PingKind; at: number }
const PING_MS = 2600;

export class MatchAudio {
  /** Debug hook (scripts/debug/sound.ts): every sound the director asks for. */
  static tap: ((what: string) => void) | null = null;
  private idx = 0;
  private ultSeen = new Set<string>();
  private last: Record<string, number> = {};
  private visibleSince = new Map<number, number>();
  private goneSince = new Map<number, number>();
  private missingPinged = new Map<number, number>();
  private calls: Record<string, string> = {};
  private chain = new Map<number, number[]>();
  private ended = false;
  pings: MapPing[] = [];

  constructor(private sim: MatchSim, private us: 0 | 1) {
    preload(sim.champs.map((c) => champSfxUrl(c.champ.id)));
    this.idx = sim.events.length;
    for (const u of sim.ultFx) this.ultSeen.add(`${u.idx}@${u.t}`);
  }

  private ok(key: string, gapMs: number, now: number) {
    if (now - (this.last[key] ?? -1e9) < gapMs) return false;
    this.last[key] = now;
    return true;
  }
  /** Stereo position and loudness of a map point for the current camera view. */
  private place(p: Vec | undefined, view: View): { pan: number; vol: number } {
    if (!p) return { pan: 0, vol: 1 };
    const halfW = MAP_SIZE / 2 / view.zoom;
    const dx = (p.x - view.cx) / halfW, dy = (p.y - view.cy) / halfW;
    const off = Math.max(Math.abs(dx), Math.abs(dy));
    return { pan: Math.max(-0.9, Math.min(0.9, dx * 0.7)), vol: off <= 1 ? 1 : Math.max(0.35, 1 - (off - 1) * 0.5) };
  }
  private addPing(kind: PingKind, pos: Vec, now: number, view: View, sound = true) {
    MatchAudio.tap?.(`ping:${kind}`);
    this.pings.push({ pos: { ...pos }, kind, at: now });
    if (sound) { const pl = this.place(pos, view); ping(kind, pl.pan, pl.vol); }
  }
  /** A ping from the user (the shout buttons). */
  userPing(kind: PingKind, now: number, view: View, pos?: Vec) {
    const mine = this.sim.champs.filter((c) => c.side === this.us && !c.dead);
    const at = pos ?? (mine.length ? { x: mine.reduce((s, c) => s + c.pos.x, 0) / mine.length, y: mine.reduce((s, c) => s + c.pos.y, 0) / mine.length } : { x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
    this.addPing(kind, at, now, view);
  }

  /** Each frame (real time `now` ms, playback `speed`, current camera `view`). */
  tick(now: number, speed: number, view: View) {
    const sim = this.sim, us = this.us, them = (1 - us) as 0 | 1;
    this.pings = this.pings.filter((p) => now - p.at < PING_MS);
    const fast = speed >= 16, veryFast = speed >= 32;
    // ---------------- events
    const evs = sim.events;
    if (evs.length - this.idx > 30) this.idx = evs.length - 10; // skipped ahead: only the latest matter
    for (; this.idx < evs.length; this.idx++) {
      const e = evs[this.idx];
      const good = e.side === us;
      const pl = this.place(e.pos ?? (e.victim !== undefined ? sim.champs[e.victim]?.pos : undefined), view);
      const play = (k: Sting, gap: number, vol = 1, n?: number) => { if (this.ok(k, gap, now)) { MatchAudio.tap?.(`sting:${k}${n ? n : ''}`); sting(k, { pan: pl.pan, vol: pl.vol * vol, n }); } };
      switch (e.type) {
        case 'firstBlood': play('firstBlood', 0); break;
        case 'kill': {
          if (/SHUTDOWN/.test(e.text)) play('shutdown', 400);
          // multi-kills: the same killer within 10 s
          if (e.killer !== undefined) {
            const times = (this.chain.get(e.killer) ?? []).filter((x) => e.t - x <= 10);
            times.push(e.t);
            this.chain.set(e.killer, times);
            if (times.length >= 2) { play('multi', 250, 1, times.length); break; }
          }
          if (!veryFast) play(good ? 'killUs' : 'killThem', fast ? 600 : 180, fast ? 0.6 : 1);
          break;
        }
        case 'ace': play(good ? 'ace' : 'aceThem', 1500); break;
        case 'dragon': case 'soul': if (!veryFast) play('dragon', 2000, good ? 1 : 0.8); break;
        case 'elder': play('elder', 2000); break;
        case 'baron': play('baron', 2000); break;
        case 'herald': case 'grubs': if (!fast) play('herald', 2000, 0.7); break;
        case 'steal': play('steal', 1000); break;
        case 'tower': if (!veryFast) play(good ? 'tower' : 'towerLost', 700); break;
        case 'inhib': play('inhib', 1200); break;
        case 'gank': {
          // enemies collapsing on one of ours: danger ping where it's happening; our jungler going: on my way
          if (fast) break;
          const ganker = sim.champs.find((c) => c.side === e.side && c.task.kind === 'gank' && c.task.targetIdx !== undefined);
          const victim = ganker?.task.targetIdx !== undefined ? sim.champs[ganker.task.targetIdx] : undefined;
          if (e.side === them && victim && this.ok('pingDanger', 4000, now)) this.addPing('danger', victim.pos, now, view);
          else if (e.side === us && ganker && this.ok('pingOmw', 6000, now)) this.addPing('onmyway', ganker.pos, now, view);
          break;
        }
        case 'tp': if (e.side === us && !fast && this.ok('pingTp', 4000, now)) { const c = sim.champs.find((x) => x.side === us && e.text.startsWith(x.input.name)); if (c) this.addPing('onmyway', c.pos, now, view); } break;
        case 'teamfight': if (!fast && this.ok('pingAssist', 5000, now) && e.pos) this.addPing('assist', e.pos, now, view); break;
      }
    }
    // ---------------- ultimates: the caster's signature sound
    for (const u of sim.ultFx) {
      const key = `${u.idx}@${u.t}`;
      if (this.ultSeen.has(key)) continue;
      this.ultSeen.add(key);
      if (veryFast || (fast && !this.ok('ultFast', 1500, now)) || !this.ok('ult', 700, now)) continue;
      const c = sim.champs[u.idx];
      if (!c) continue;
      const pl = this.place(u.from, view);
      MatchAudio.tap?.(`ult:${c.champ.id}`);
      sting('ult', { pan: pl.pan, vol: pl.vol * 0.8 });
      champSignature(c.champ.id, { vol: 0.45 * pl.vol, pan: pl.pan, delay: 0.05, cat: 'match', maxDur: 2.2 });
    }
    if (this.ultSeen.size > 400) this.ultSeen = new Set([...this.ultSeen].slice(-200));
    // ---------------- our team's calls: objective / retreat pings
    if (!fast) {
      const tm = sim.teams[us];
      for (const [kind, call] of Object.entries(tm.objCalls)) {
        if (kind !== 'dragon' && kind !== 'baron' && kind !== 'elder') continue;
        const prev = this.calls[kind];
        if (call.d !== prev) {
          this.calls[kind] = call.d;
          const o = sim.objectives.find((x) => x.kind === kind);
          if (o && call.d === 'take' && prev !== undefined && this.ok('pingObj', 6000, now)) this.addPing('objective', o.pos, now, view);
          else if (o && call.d === 'concede' && prev === 'take' && this.ok('pingRetreat', 6000, now)) this.addPing('retreat', o.pos, now, view);
        }
      }
      // enemy missing: a lane opponent we could see vanishes for a while during laning
      if (sim.t > 90 && sim.t < 840) {
        for (const e of sim.champs) {
          if (e.side !== them || e.dead || e.role === 'jungle') continue;
          const seen = tm.visible.has(e.idx);
          if (seen) { this.visibleSince.set(e.idx, sim.t); this.goneSince.delete(e.idx); continue; }
          if (!this.visibleSince.has(e.idx)) continue;
          const gone = this.goneSince.get(e.idx) ?? sim.t;
          this.goneSince.set(e.idx, gone);
          if (sim.t - gone > 7 && sim.t - (this.missingPinged.get(e.idx) ?? -99) > 60 && this.ok('pingMissing', 8000, now)) {
            this.missingPinged.set(e.idx, sim.t);
            const opp = sim.champs.find((c) => c.side === us && c.role === e.role && !c.dead);
            const last = tm.lastSeen.get(e.idx)?.pos;
            if (opp) this.addPing('missing', last ?? opp.pos, now, view);
          }
        }
      }
    }
    // ---------------- the end
    if (sim.winner !== null && !this.ended) {
      this.ended = true;
      sting('nexus');
      setTimeout(() => sting(sim.winner === us ? 'victory' : 'defeat'), 1400);
    }
  }
}

/** The ping a shout button stands for. */
export const SHOUT_PING: Record<string, PingKind> = { aggressive: 'push', safe: 'retreat', objectives: 'objective', group: 'assist', split: 'onmyway', vision: 'vision' };
