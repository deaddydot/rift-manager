// Match analyst: watches a game as it is simulated and writes the coaching staff's post-game breakdown — why every
// death happened, the calls the team got wrong, objectives given away, lanes lost, vision, throws, fights.
//
// The engine plays on probabilities, but its choices are made from information the analyst can check afterwards:
//   • explicit mistakes (hidden.ts: face-checking the fog, overextending, a solo engage, a wasted Flash) are flagged
//     the moment they start, and a death while one is running is that mistake's price;
//   • deaths are classified from the situation at the time — alone and outnumbered, ambushed out of the fog (the
//     killer had just appeared from unwarded ground), diving a tower, chasing too deep, farming a side lane with
//     most of the enemy missing, a fight taken at a numbers disadvantage, dying with a full purse;
//   • team calls (ai.ts teamPlan) are made from the team's *beliefs* about the fog (fog.ts); the analyst compares each
//     objective call with what was really there — starting Baron into five enemies the team thought were elsewhere is
//     a misread; conceding a dragon the team had the numbers for is a missed chance;
//   • objectives conceded without anyone near and with nothing traded for them, lanes lost on CS and gold, vision far
//     below the role's norm, leads thrown.
// Created by MatchSim when opts.analyze is set (the user's games); MatchResult.analysis carries the result.
import type { MatchSim } from './engine';
import type { SimChamp, ObjectiveKind, SimObjective } from './simtypes';
import { dist, nearestLane, laneDistance, DRAGON_PIT, BARON_PIT, NEXUS, MAP_SIZE, type Side, type Vec } from './map';

export type MistakeKind =
  | 'facecheck' | 'overextend' | 'solo_engage' | 'wasted_flash' | 'caught' | 'no_vision' | 'tower_dive' | 'chased' | 'outnumbered'
  | 'greedy_farm' | 'unspent' | 'bad_call' | 'missed_call' | 'obj_given' | 'smite_lost' | 'lane_lost' | 'low_vision' | 'throw';
export interface Mistake { t: number; side: Side; who?: number; kind: MistakeKind; text: string; cost: number; sev: 1 | 2 | 3 }
export interface Highlight { t: number; side: Side; who?: number; kind: string; text: string }
export interface FightLog { t: number; end: number; zone: string; kills: [number, number]; size: [number, number] }
export interface ObjLog { t: number; kind: string; side: Side; contested: boolean; stolen?: boolean; note?: string }
export interface AnalysisPlayer {
  idx: number; side: Side; name: string; role: string; champ: string;
  k: number; d: number; a: number; cs: number; cs10: number; csd10: number; gd15: number;
  wards: number; wardsKilled: number; vision: number; deaths: Record<string, number>; score: number;
}
export interface GameAnalysis {
  v: 1; duration: number; winner: Side; teams: [string, string];
  players: AnalysisPlayer[]; mistakes: Mistake[]; highlights: Highlight[]; fights: FightLog[]; objectives: ObjLog[];
  gold: number[];                       // per minute, blue minus red
  calls: { good: [number, number]; bad: [number, number] };
  maxLead: [number, number];            // the biggest gold lead each side held
}

/** Where on the map (for the report). */
export function zoneOf(p: Vec): string {
  if (dist(p, DRAGON_PIT) < 1900) return 'the dragon pit';
  if (dist(p, BARON_PIT) < 1900) return 'the Baron pit';
  if (dist(p, NEXUS[0]) < 3600) return 'the blue base';
  if (dist(p, NEXUS[1]) < 3600) return 'the red base';
  const lane = nearestLane(p);
  if (laneDistance(lane, p) < 900) return `${lane} lane`;
  const s = p.x + p.y - MAP_SIZE;
  if (Math.abs(s) < 1500) return 'the river';
  return s < 0 ? 'the blue-side jungle' : 'the red-side jungle';
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const objName = (k: string) => (k === 'dragon' ? 'the drake' : k === 'elder' ? 'Elder' : k === 'baron' ? 'Baron' : k === 'herald' ? 'Herald' : 'Voidgrubs');
const OBJ_SEV: Record<string, 1 | 2 | 3> = { baron: 3, elder: 3, dragon: 2, herald: 1, grubs: 1 };
/** Wards a minute a role usually places (sim calibration). */
const WARD_NORM: Record<string, number> = { support: 1.3, jungle: 0.5, mid: 0.4, top: 0.36, adc: 0.33 };

interface PendingCall { side: Side; kind: ObjectiveKind; spawn: number; t: number; d: 'take' | 'concede'; seen: number; real: number; caller: number }

export class MatchAnalyst {
  mistakes: Mistake[] = [];
  highlights: Highlight[] = [];
  objectives: ObjLog[] = [];
  private cs10: number[] = [];
  private gold15: number[] = [];
  private deathCause: Record<string, number>[];
  private flaggedFlash = new Set<number>();
  private calls = new Map<string, PendingCall>();
  private callStats = { good: [0, 0] as [number, number], bad: [0, 0] as [number, number] };
  private lastTake: [number, number] = [-999, -999]; // last time each side took a tower / objective (trades)
  private maxLead: [number, number] = [0, 0];

  constructor(private sim: MatchSim) {
    this.deathCause = sim.champs.map(() => ({}));
  }

  private add(m: Mistake) {
    // the same thing twice in a few seconds (a 2-for-1 caught pair, a call re-evaluated) is one entry
    if (this.mistakes.some((x) => x.kind === m.kind && x.side === m.side && x.who === m.who && m.t - x.t < 8)) return;
    this.mistakes.push(m);
  }
  private name(c: SimChamp) { return `${c.input.name} (${c.champ.name})`; }
  private caller(side: Side): SimChamp {
    return [...this.sim.champs.filter((c) => c.side === side)].sort((a, b) => b.input.shotcalling - a.input.shotcalling)[0];
  }

  /** Each tick: early-game snapshots and the lead tracker. */
  tick() {
    const sim = this.sim, t = sim.t;
    if (!this.cs10.length && t >= 600) this.cs10 = sim.champs.map((c) => c.cs);
    if (!this.gold15.length && t >= 900) this.gold15 = sim.champs.map((c) => c.goldEarned);
    if (Math.floor(t) !== Math.floor(t - sim.dt)) {
      let g = 0;
      for (const c of sim.champs) g += c.side === 0 ? c.goldEarned : -c.goldEarned;
      if (g > this.maxLead[0]) this.maxLead[0] = g;
      if (-g > this.maxLead[1]) this.maxLead[1] = -g;
    }
  }

  /** A punishable mistake starts (hidden.ts). A wasted Flash is complete on its own. */
  onMistakeStart(c: SimChamp, kind: string) {
    if (kind === 'flash' && !this.flaggedFlash.has(c.idx)) {
      this.flaggedFlash.add(c.idx);
      this.add({ t: this.sim.t, side: c.side, who: c.idx, kind: 'wasted_flash', text: `${this.name(c)} burned Flash for nothing`, cost: 0, sev: 1 });
    }
  }

  /** A champion died: what went wrong (or nothing did — some deaths are fair trades). */
  onDeath(v: SimChamp, killer: SimChamp | null, assisters: SimChamp[], bounty: number, mistakeKind?: string) {
    const sim = this.sim, t = sim.t, side = v.side, enemy = (1 - side) as Side;
    const zone = zoneOf(v.pos);
    const involved = (killer ? 1 : 0) + assisters.length;
    const foes = sim.champs.filter((e) => e.side === enemy && !e.dead && dist(e.pos, v.pos) < 1700).length;
    const allies = sim.champs.filter((a) => a.side === side && a !== v && !a.dead && dist(a.pos, v.pos) < 1700).length;
    const tm = sim.teams[side];
    // the killer had just stepped out of the fog: nobody on the team saw it coming
    const fromFog = !!killer && (t - (tm.seenSince.get(killer.idx) ?? -99)) < 3.5;
    const enemyHalf = side === 0 ? v.pos.x + v.pos.y > MAP_SIZE + 800 : v.pos.x + v.pos.y < MAP_SIZE - 800;
    // a dive: the enemy tower was shooting them when they died
    const underTower = sim.towers.some((tw) => tw.alive && tw.def.side === enemy && tw.targetIdx === v.idx && dist(tw.def.pos, v.pos) < 950);
    const lane = nearestLane(v.pos);
    const sideLane = (lane === 'top' || lane === 'bot') && laneDistance(lane, v.pos) < 1100;
    const ownLane = t < 840 && v.role !== 'jungle' && laneDistance(lane, v.pos) < 1100 && !enemyHalf;
    const missing = sim.champs.filter((e) => e.side === enemy && !e.dead && !tm.visible.has(e.idx)).length;
    const chasing = v.combatTarget !== null && v.chaseStart > 0 && t - v.chaseStart < 10;
    let cost = bounty + (t > 1500 ? 200 : 0);
    // a death right before / during a big objective costs that objective too
    const bigUp = sim.objectives.some((o) => (o.kind === 'baron' || o.kind === 'elder' || o.kind === 'dragon') && (o.alive || (o.spawnAt > t && o.spawnAt - t < 40)));
    const sev = (base: number): 1 | 2 | 3 => Math.max(1, Math.min(3, base + (cost >= 500 ? 1 : 0) + (t > 1500 && bigUp ? 1 : 0))) as 1 | 2 | 3;
    let kind: MistakeKind | null = null, text = '';
    if (mistakeKind === 'facecheck') { kind = 'facecheck'; text = `${this.name(v)} face-checked ${zone} without vision and died`; }
    else if (mistakeKind === 'overextend') { kind = 'overextend'; text = `${this.name(v)} overextended ${lane} lane and was collapsed on`; }
    else if (mistakeKind === 'engage') { kind = 'solo_engage'; text = `${this.name(v)} went in alone ${allies ? `with ${allies} too far back` : 'with no follow-up'}`; }
    else if (sideLane && allies === 0 && t > 1200 && missing >= 3 && involved >= 2) { kind = 'greedy_farm'; text = `${this.name(v)} farmed ${lane} lane with ${missing} enemies missing`; }
    else if (underTower && allies <= 1) { kind = 'tower_dive'; text = `${this.name(v)} died diving under the tower in ${zone}`; }
    else if (ownLane) { if (fromFog && involved >= 2) { kind = 'no_vision'; text = `${this.name(v)} was ganked in ${zone} with no ward to see it coming`; } }
    else if (fromFog && allies === 0 && involved >= 1 && enemyHalf) { kind = 'no_vision'; text = `${this.name(v)} walked into unwarded ${zone} and was jumped`; }
    else if (allies === 0 && involved >= 2) { kind = 'caught'; text = `${this.name(v)} was caught alone in ${zone} by ${involved}`; }
    else if (chasing && enemyHalf) { kind = 'chased'; text = `${this.name(v)} chased too deep into ${zone}`; }
    else if (foes - (allies + 1) >= 2) { kind = 'outnumbered'; text = `${this.name(v)} fought ${allies + 1}v${foes} in ${zone}`; }
    const cause = kind ?? (ownLane ? 'gank' : allies >= 2 ? 'teamfight' : 'trade');
    this.deathCause[v.idx][cause] = (this.deathCause[v.idx][cause] ?? 0) + 1;
    if (kind) this.add({ t, side, who: v.idx, kind, text, cost, sev: sev(1) });
    if (v.gold >= 2000 && t > 600) this.add({ t, side, who: v.idx, kind: 'unspent', text: `${this.name(v)} died holding ${(v.gold / 1000).toFixed(1)}k unspent gold`, cost: Math.round(v.gold * 0.15), sev: 1 });
    // the other side of it: plays worth showing off
    if (killer) {
      const kAllies = sim.champs.filter((a) => a.side === enemy && !a.dead && dist(a.pos, killer.pos) < 1700).length;
      const kFoes = sim.champs.filter((e) => e.side === side && !e.dead && dist(e.pos, killer.pos) < 1700).length + 1;
      if (kFoes - kAllies >= 2) this.highlights.push({ t, side: enemy, who: killer.idx, kind: 'outplay', text: `${this.name(killer)} won a ${kAllies}v${kFoes} in ${zone}` });
      if (bounty >= 500) this.highlights.push({ t, side: enemy, who: killer.idx, kind: 'shutdown', text: `${this.name(killer)} collected a ${bounty}-gold shutdown on ${v.input.name}` });
    }
  }

  /** A team call on an objective (ai.ts teamPlan): what they believed (`seen`) vs what was really there (`real`). */
  onCall(side: Side, o: SimObjective, d: 'take' | 'hover' | 'concede', seen: number, real: number) {
    if (d === 'hover') return;
    const key = `${side}:${o.kind}:${o.spawnAt}`;
    if (this.calls.has(key)) return; // the first committed call on this spawn is the one that counts
    this.calls.set(key, { side, kind: o.kind, spawn: o.spawnAt, t: this.sim.t, d, seen, real, caller: this.caller(side).idx });
  }

  /** An objective fell: settle the calls on it, and was it given away? */
  onObjective(o: SimObjective, taker: Side, stolen: boolean) {
    const sim = this.sim, t = sim.t, loser = (1 - taker) as Side;
    const near = (s: Side, r: number) => sim.champs.filter((c) => c.side === s && !c.dead && dist(c.pos, o.pos) < r).length;
    const contested = near(loser, 2600) > 0;
    const log: ObjLog = { t, kind: o.kind, side: taker, contested, stolen: stolen || undefined };
    this.objectives.push(log);
    if (stolen) {
      const jg = sim.champs.find((c) => c.side === loser && c.role === 'jungle');
      this.highlights.push({ t, side: taker, kind: 'steal', text: `${objName(o.kind)} stolen at ${mmss(t)}` });
      if (jg) this.add({ t, side: loser, who: jg.idx, kind: 'smite_lost', text: `${this.name(jg)} lost the smite fight for ${objName(o.kind)}`, cost: o.kind === 'baron' ? 1500 : 600, sev: o.kind === 'baron' || o.kind === 'elder' ? 3 : 2 });
    }
    // conceded with nobody anywhere near, nothing traded for it, and enough of the team alive to have shown up
    const alive = sim.champs.filter((c) => c.side === loser && !c.dead).length;
    const traded = t - this.lastTake[loser] < 35;
    // early drakes are routinely conceded; the ones that matter are Baron, Elder and the soul race (3rd drake on)
    const matters = o.kind === 'baron' || o.kind === 'elder' || (o.kind === 'dragon' && sim.teams[taker].dragons.length >= 3);
    if (!contested && !traded && alive >= 4 && matters) {
      log.note = 'uncontested';
      this.add({ t, side: loser, kind: 'obj_given', text: `${objName(o.kind)} given up for free at ${mmss(t)} — ${alive} alive, nobody near, nothing traded`, cost: o.kind === 'baron' ? 1500 : o.kind === 'elder' ? 2000 : 500, sev: OBJ_SEV[o.kind] });
    } else if (traded && !contested) log.note = 'traded';
    this.lastTake[taker] = t;
    // calls made on this spawn
    for (const [key, c] of this.calls) {
      if (c.kind !== o.kind || c.spawn !== o.spawnAt) continue;
      this.calls.delete(key);
      const team = sim.teams[c.side].input.short;
      const callerC = sim.champs[c.caller];
      if (c.d === 'take') {
        if (c.real < -0.35 && taker !== c.side) {
          this.callStats.bad[c.side]++;
          this.add({ t: c.t, side: c.side, who: c.caller, kind: 'bad_call', text: `${team} committed to ${objName(o.kind)} on a misread — they expected to have the numbers, the enemy was there in force (call: ${callerC.input.name})`, cost: o.kind === 'baron' ? 1500 : 600, sev: OBJ_SEV[o.kind] });
        } else if (taker === c.side) this.callStats.good[c.side]++;
      } else if (c.d === 'concede' && c.real > 0.9 && taker !== c.side) {
        this.callStats.bad[c.side]++;
        this.add({ t: c.t, side: c.side, who: c.caller, kind: 'missed_call', text: `${team} conceded ${objName(o.kind)} they had the numbers to take (call: ${callerC.input.name})`, cost: 400, sev: o.kind === 'baron' || o.kind === 'elder' ? 2 : 1 });
      } else if (c.d === 'concede') this.callStats.good[c.side]++;
    }
  }
  /** A tower fell (cross-map trades). */
  onTower(side: Side) { this.lastTake[side] = this.sim.t; }

  // ------------------------------------------------------------------ the report
  finish(): GameAnalysis {
    const sim = this.sim, t = sim.t, mins = Math.max(1, t / 60);
    const winner = (sim.winner ?? 0) as Side;
    const cs10 = this.cs10.length ? this.cs10 : sim.champs.map((c) => c.cs);
    const g15 = this.gold15.length ? this.gold15 : sim.champs.map((c) => c.goldEarned);
    const players: AnalysisPlayer[] = sim.champs.map((c) => {
      const opp = sim.champs.find((e) => e.side !== c.side && e.role === c.role);
      return {
        idx: c.idx, side: c.side, name: c.input.name, role: c.role, champ: c.champ.name,
        k: c.kills, d: c.deaths, a: c.assists, cs: c.cs, cs10: cs10[c.idx], csd10: opp ? cs10[c.idx] - cs10[opp.idx] : 0, gd15: opp ? Math.round(g15[c.idx] - g15[opp.idx]) : 0,
        wards: c.wardsPlaced, wardsKilled: c.wardsKilled, vision: Math.round(c.visionScore), deaths: this.deathCause[c.idx], score: 0,
      };
    });
    // lanes lost (laners only: the jungle and support are judged on other things)
    if (t > 900) for (const p of players) {
      if (p.role === 'jungle' || p.role === 'support') continue;
      if (p.csd10 <= -18 || p.gd15 <= -1500) {
        const c = sim.champs[p.idx];
        this.add({ t: 900, side: p.side, who: p.idx, kind: 'lane_lost', text: `${this.name(c)} lost lane: ${p.csd10} CS at 10, ${p.gd15 >= 0 ? '+' : ''}${(p.gd15 / 1000).toFixed(1)}k gold at 15`, cost: Math.max(0, -p.gd15), sev: p.gd15 <= -2500 || p.csd10 <= -30 ? 2 : 1 });
      }
    }
    // vision far below the role's norm
    if (t > 900) for (const p of players) {
      const norm = (WARD_NORM[p.role] ?? 0.35) * mins;
      if (p.wards < norm * 0.55) this.add({ t: t - 1, side: p.side, who: p.idx, kind: 'low_vision', text: `${this.name(sim.champs[p.idx])} placed ${p.wards} wards in ${Math.round(mins)} minutes (a ${p.role} usually places ~${Math.round(norm)})`, cost: 0, sev: 1 });
    }
    // thrown leads
    for (const s of [0, 1] as Side[]) {
      if (s === winner || this.maxLead[s] < 4000) continue;
      const g = sim.goldDiff.map((x) => (s === 0 ? x : -x));
      let peak = 0, flip = g.length - 1;
      for (let i = 0; i < g.length; i++) if (g[i] > g[peak]) peak = i;
      for (let i = peak; i < g.length; i++) if (g[i] <= 0) { flip = i; break; }
      this.add({ t: flip * 60, side: s, kind: 'throw', text: `${sim.teams[s].input.short} threw a ${(this.maxLead[s] / 1000).toFixed(1)}k gold lead (peak at ${peak}:00, gone by ${flip}:00)`, cost: this.maxLead[s], sev: 3 });
    }
    // fights: kills within 15 s and 3,000 units of each other; size = champions of each side involved
    type F = FightLog & { p: Vec; who: [Set<number>, Set<number>] };
    const fights: F[] = [];
    for (const e of sim.events) {
      if ((e.type !== 'kill' && e.type !== 'firstBlood') || e.side === undefined || !e.pos) continue;
      let f = fights.find((x) => e.t - x.end < 15 && dist(e.pos!, x.p) < 3000);
      if (!f) { f = { t: e.t, end: e.t, zone: zoneOf(e.pos), kills: [0, 0], size: [0, 0], p: e.pos, who: [new Set(), new Set()] }; fights.push(f); }
      f.end = e.t;
      f.kills[e.side]++;
      if (e.killer !== undefined) f.who[e.side].add(e.killer);
      for (const a of e.assists ?? []) f.who[e.side].add(a);
      if (e.victim !== undefined) f.who[(1 - e.side) as Side].add(e.victim);
    }
    const bigFights: FightLog[] = fights.filter((f) => f.kills[0] + f.kills[1] >= 3).map((f) => ({ t: f.t, end: f.end, zone: f.zone, kills: f.kills, size: [f.who[0].size, f.who[1].size] }));
    // a performance score per player (0–10): involvement, deaths, the mistakes on their name, lane, vision, the result
    for (const p of players) {
      const mine = this.mistakes.filter((m) => m.who === p.idx);
      const pen = mine.reduce((s, m) => s + m.sev, 0);
      const good = this.highlights.filter((h) => h.who === p.idx).length;
      const sc = 6 + p.k * 0.22 + p.a * 0.1 - p.d * 0.38 - pen * 0.35 + good * 0.3 + Math.max(-1, Math.min(1, p.csd10 / 25)) + (p.side === winner ? 0.6 : -0.3);
      p.score = Math.round(Math.max(1, Math.min(10, sc)) * 10) / 10;
    }
    this.mistakes.sort((a, b) => a.t - b.t);
    return {
      v: 1, duration: Math.round(t), winner, teams: [sim.teams[0].input.teamId, sim.teams[1].input.teamId],
      players, mistakes: this.mistakes, highlights: this.highlights.slice(0, 30), fights: bigFights, objectives: this.objectives,
      gold: [...sim.goldDiff], calls: this.callStats, maxLead: [Math.round(this.maxLead[0]), Math.round(this.maxLead[1])],
    };
  }
}
