// Top-down League of Legends match simulator.
// Tick-based world simulation: champions (AI driven), minion waves, towers,
// inhibitors, jungle camps, epic monsters, vision and economy.
import { RNG, clamp } from '../../util/rng';
import { dashesFor, stepDash, onTakedown } from './dash';
import { gd, matchupEdge } from '../../data/gamedata';
import type { Role } from '../types';
import {
  type Vec, type Side, type Lane, LANES, TOWERS, INHIBS, NEXUS, FOUNTAIN, CAMPS, DRAGON_PIT, BARON_PIT,
  LANE_LINES, lanePoint, laneMinP, laneMaxP, dist, dist2,
} from './map';
import { T, XP_TO_LEVEL, MAX_LEVEL, TOP_MAX_LEVEL, GOLD, XP, respawnTime, TOWER_STATS, TOWER_RANGE, TOWER_ATTACK_INTERVAL, INHIB_HP, NEXUS_HP, CAMP_STATS, OBJECTIVE_STATS, DRAGON_TYPES, type DragonType, DRAGON_LABEL, MINION, VISION, WARD_DURATION } from './constants';
import { computeStats, itemsFromGold, purchaseOrder, starterFor, abilityRanks, skillOrder, type BuffState } from './champstats';
import type { SimTeamInput, SimOptions, SimChamp, SimTower, SimInhib, SimWave, SimCamp, SimObjective, SimWard, GameEvent, TeamRuntime, MatchResult, ObjectiveKind, Task, DebugCat, DebugEntry, SimSummon, UltFx, Floater } from './simtypes';
import { updateCombat, dealDamage, displayDamage } from './combat';
import { teamMacro, champDecide, champActions } from './ai';
import { updateSummons } from './summons';
import { pickMvp, type MvpLine } from './mvp';
import { applyTraitInputs, rollPerf, updateForm, onDeathTilt } from './hidden';

const ROLE_ORDER: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const SUPER_DPS = 90; // one super minion's damage per second (vs minions; 60% of it against structures)

export class MatchSim {
  rng: RNG;
  t = 0;
  dt: number;
  maxTime: number;
  champs: SimChamp[] = [];
  teams: [TeamRuntime, TeamRuntime];
  towers: SimTower[] = [];
  inhibs: SimInhib[] = [];
  nexusHp: [number, number] = [NEXUS_HP, NEXUS_HP];
  waves: SimWave[] = [];
  camps: SimCamp[] = [];
  objectives: SimObjective[] = [];
  wards: SimWard[] = [];
  events: GameEvent[] = [];
  winner: Side | null = null;
  nextWaveAt = T.minionsFirst;
  waveNo = 0;
  waveIdSeq = 1;
  tickNo = 0;
  /** lore rules: the side that can't lose this game */
  destiny: Side | null = null;
  private destinyNoticeAt = -999;
  /** lore: how much the side facing destiny has cracked (each time the Nexus refuses to fall) */
  curse = 0;
  /** Champions in this tick's processing order (see redFirst). */
  turnOrder: SimChamp[] = [];
  private champsRedFirst: SimChamp[] = [];
  wardIdSeq = 1;
  dragonQueue: DragonType[] = [];
  riftType: DragonType | null = null;
  firstBlood = false;
  firstTowerSide: Side | null = null;
  firstBloodSide: Side | null = null;
  bigMatch: boolean;
  lastVisionAt = -1;
  lastMacroAt = [-10, -10];
  goldDiff: number[] = [];
  debugOn: boolean;
  debugLog: DebugEntry[] = [];
  summons: SimSummon[] = [];
  summonSeq = 1;
  ultFx: UltFx[] = [];
  floaters: Floater[] = [];
  /** Nocturne's Paranoia: until when a team's sight is shrunk to almost nothing. */
  darkUntil: [number, number] = [0, 0];
  private scheduled: { at: number; fn: () => void }[] = [];
  private dbgTask = new Map<number, string>();
  private dbgWave = new Map<number, string>();
  private dbgPlan = ['', ''];
  private dbgCalls = [new Map<string, string>(), new Map<string, string>()];
  /** Idle detection: position snapshot every 4s; a player who barely moves for 12s+ without a reason is "stuck". */
  private idleSnap = new Map<number, { pos: Vec; since: number; logged: boolean }>();
  stuckCount = 0;
  private nextPassiveAt = T.passiveGoldStart;
  recentKills: { t: number; side: Side }[] = [];

  constructor(blue: SimTeamInput, red: SimTeamInput, opts: SimOptions) {
    this.rng = new RNG(opts.seed);
    this.dt = opts.dt ?? 0.25;
    this.maxTime = opts.maxTime ?? 75 * 60;
    this.bigMatch = !!opts.bigMatch;
    this.debugOn = !!opts.debug;
    this.destiny = opts.destiny ?? null;
    if (this.destiny !== null) {
      // lore: the destined side plays out of its mind; the other side feels the weight of history
      const up = (v: number, d: number) => clamp(v + d, 1, 99);
      const lift = (input: SimTeamInput, d: number): SimTeamInput => ({ ...input, players: input.players.map((p) => ({ ...p,
        mech: up(p.mech, d), lane: up(p.lane, d), farm: up(p.farm, d), tf: up(p.tf, d), macro: up(p.macro, d), obj: up(p.obj, d), clutch: up(p.clutch, d),
        composure: up(p.composure, d * 1.2), mistakes: up(p.mistakes, -d), mastery: clamp(p.mastery + d * 1.6, 1, 200) })) });
      if (this.destiny === 0) { blue = lift(blue, 14); red = lift(red, -5); } else { red = lift(red, 14); blue = lift(blue, -5); }
    }
    const mkTeam = (side: Side, input: SimTeamInput): TeamRuntime => {
      const ps = input.players;
      const avgMacro = ps.reduce((s, p) => s + p.macro, 0) / ps.length;
      const caller = Math.max(...ps.map((p) => p.shotcalling));
      const macro = clamp(avgMacro * 0.6 + caller * 0.3 + (input.chemistry ?? 60) * 0.1, 0, 100);
      return {
        side, input, kills: 0, towers: 0, inhibs: 0, dragons: [], soul: null, elders: 0, barons: 0, heralds: 0, grubs: 0, plates: 0,
        baronUntil: 0, elderUntil: 0, herald: false, macro, aggression: input.tactics.aggression,
        plan: { kind: 'laning', until: 0, label: 'Laning phase' }, laneSwap: false, goldTimeline: [],
        visible: new Set(), lastSeen: new Map(), objCalls: {}, setup: {}, seenSince: new Map(), siege: { lane: null, until: 0 },
      };
    };
    this.teams = [mkTeam(0, blue), mkTeam(1, red)];

    // dragon order: first two random elements; the third decides the rift and repeats
    const types = this.rng.shuffle([...DRAGON_TYPES]);
    this.dragonQueue = [types[0], types[1], types[2]];

    // champions
    [blue, red].forEach((team, side) => {
      ROLE_ORDER.forEach((role, i) => {
        const p = applyTraitInputs(team.players.find((x) => x.role === role) ?? team.players[i]);
        const champ = gd().championById[p.championId] ?? gd().champions[0];
        const order = purchaseOrder(champ, role);
        const so = skillOrder(champ);
        const perf = rollPerf(this, p);
        const c: SimChamp = {
          idx: side * 5 + i, side: side as Side, role, input: p, champ,
          pos: { ...FOUNTAIN[side] }, facing: 0, path: [], dest: null,
          hp: 0, level: 1, xp: 0, gold: GOLD.start, goldSpent: 0, goldEarned: GOLD.start, cs: 0,
          kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0, healing: 0,
          visionScore: 0, wardsPlaced: 0, wardsKilled: 0,
          stats: null as never, items: [], order, starter: starterFor(champ, role), skillOrder: so, ranks: { Q: 1, W: 0, E: 0, R: 0 },
          abilities: champ.abilities.map((a) => ({ ...a, cdUntil: 0 })),
          attackReadyAt: 0, flashReadyAt: 0,
          summ2: role === 'jungle' ? 'smite' : role === 'top' ? 'teleport' : role === 'adc' ? (this.rng.chance(0.7) ? 'heal' : 'cleanse') : role === 'support' ? (this.rng.chance(0.6) ? 'ignite' : 'exhaust') : (this.rng.chance(0.55) ? 'teleport' : 'ignite'),
          summ2ReadyAt: 0, smiteCharges: 1,
          ccUntil: 0, ccType: null, slowUntil: 0, slowAmt: 0, shield: 0, shieldUntil: 0,
          dead: false, respawnAt: 0, task: { kind: 'base' }, combatTarget: null, lastCombatAt: -100,
          lastDamagedBy: new Map(), recallUntil: 0, killStreak: 0, lastDecisionAt: -10 + i * 0.1, tradeUntil: 0, nextTradeCheck: 0, tradeMode: false, tradeCasts: 0, moveLockUntil: 0, chaseStart: 0,
          potions: role === 'jungle' ? 1 : role === 'support' ? 1 : 2, potionUntil: 0,
          wardCharges: 1, wardRechargeAt: 0, controlWards: (role === 'support' ? 1 : 0) + (p.traits.includes('control_warder') ? 1 : 0), perf, lastPos: { ...FOUNTAIN[side] }, fx: [],
          laneAssignment: role === 'top' ? 'top' : role === 'mid' ? 'mid' : role === 'jungle' ? 'jungle' : 'bot',
          basePerf: perf, tilt: 0, mistakeUntil: 0, waveIntent: 'hold', waveIntentUntil: 0, alert: 0,
        };
        c.dashes = dashesFor(champ.id);
        this.champs.push(c);
        this.goldSpend(c); // starting items
        this.refresh(c);
        c.hp = c.stats.maxHp;
      });
    });

    // structures
    for (const def of TOWERS) {
      const st = TOWER_STATS[def.tier];
      this.towers.push({ def, hp: st.hp, maxHp: st.hp, alive: true, plates: def.tier === 'outer' ? 5 : 0, shotReadyAt: 0, targetIdx: null, shotsOnTarget: 0 });
    }
    for (const ih of INHIBS) this.inhibs.push({ ...ih, hp: INHIB_HP, maxHp: INHIB_HP, alive: true, respawnAt: 0 });
    this.champsRedFirst = [...this.champs.filter((c) => c.side === 1), ...this.champs.filter((c) => c.side === 0)];
    this.turnOrder = this.champs;
    for (const def of CAMPS) {
      const st = CAMP_STATS[def.kind];
      this.camps.push({ def, hp: st.hp, maxHp: st.hp, alive: false, respawnAt: def.kind === 'scuttle' ? T.scuttleFirst : T.campsFirst, lastHitBy: null });
    }
    this.objectives.push(
      { kind: 'dragon', pos: DRAGON_PIT, hp: 0, maxHp: 0, alive: false, spawnAt: T.dragonFirst, dragonType: this.dragonQueue[0], attackers: new Set() },
      { kind: 'grubs', pos: BARON_PIT, hp: 0, maxHp: 0, alive: false, spawnAt: T.grubsSpawn, attackers: new Set(), count: 3 },
      { kind: 'herald', pos: BARON_PIT, hp: 0, maxHp: 0, alive: false, spawnAt: T.heraldSpawn, attackers: new Set() },
      { kind: 'baron', pos: BARON_PIT, hp: 0, maxHp: 0, alive: false, spawnAt: T.baronSpawn, attackers: new Set() },
    );
    // lane swap decision at game start
    for (const tm of this.teams) {
      const ls = tm.input.tactics.laneSwap;
      tm.laneSwap = ls === 'always' || (ls === 'auto' && this.rng.chance(0.18 + (tm.macro - 60) / 300));
    }
    for (const tm of this.teams) if (tm.laneSwap) {
      const top = this.champs.find((c) => c.side === tm.side && c.role === 'top')!;
      top.laneAssignment = 'bot';
      for (const c of this.champs) if (c.side === tm.side && (c.role === 'adc' || c.role === 'support')) c.laneAssignment = 'top';
      this.event('laneSwap', `${tm.input.short} lane swap: bot duo heads top, ${top.input.name} goes bot`, tm.side);
    }
  }

  // ------------------------------------------------------------------ helpers
  get time() { return this.t; }
  team(side: Side) { return this.teams[side]; }
  enemySide(side: Side): Side { return (1 - side) as Side; }
  alliesOf(side: Side) { return this.champs.filter((c) => c.side === side); }
  enemiesOf(side: Side) { return this.champs.filter((c) => c.side !== side); }
  living(side: Side) { return this.champs.filter((c) => c.side === side && !c.dead); }

  event(type: GameEvent['type'], text: string, side?: Side, extra: Partial<GameEvent> = {}) {
    this.events.push({ t: this.t, type, text, side, ...extra });
  }

  /** Run something later in game time (ult channels landing, delayed impacts). */
  schedule(at: number, fn: () => void) { this.scheduled.push({ at, fn }); }

  /** Floating combat text on the map (big hits). */
  float(pos: Vec, text: string, color: string) { this.floaters.push({ t: this.t, until: this.t + 1.4, pos: { ...pos }, text, color }); }

  /**
   * An ultimate went off: show it on the map (area / path, name, who it hit, damage), float the
   * damage numbers, log it and — when it mattered — put it in the play-by-play.
   */
  recordUlt(c: SimChamp, name: string, icon: string, from: Vec, to: Vec, radius: number, hits: { target: SimChamp; dmg: number }[], opts: { channel?: number; note?: string } = {}) {
    hits = hits.map((h) => ({ target: h.target, dmg: displayDamage(h.dmg) }));
    const damage = Math.round(hits.reduce((s2, h) => s2 + h.dmg, 0));
    this.ultFx.push({ t: this.t, until: this.t + (opts.channel ?? 0) + 1.8, idx: c.idx, name, icon, from: { ...from }, to: { ...to }, radius, hits: hits.map((h) => h.target.input.name), damage, channel: !!opts.channel });
    for (const h of hits) if (h.dmg >= 1) this.float(h.target.pos, `-${Math.round(h.dmg)}`, c.side === 0 ? '#93c5fd' : '#fca5a5');
    const who = hits.length ? ` — hits ${hits.map((h) => h.target.input.name).join(', ')}${damage ? ` for ${damage}` : ''}` : '';
    this.dbg(c, 'ult', `${name}${opts.note ? ` (${opts.note})` : ''}${who}`);
    const kills = hits.filter((h) => h.target.dead).length;
    if (hits.length >= 2 || kills || opts.note) this.event('ult', `${c.input.name}'s ${name}${opts.note ? ` ${opts.note}` : ''}${hits.length ? ` hits ${hits.length}${kills ? `, ${kills} kill${kills > 1 ? 's' : ''}` : ''}` : ''}`, c.side, { important: hits.length >= 3 || kills > 0 });
  }

  /** Decision log entry for a player (SimChamp), a team (Side) or the game (null). No-op unless debug is on. */
  dbg(who: SimChamp | Side | null, cat: DebugCat, text: string) {
    if (!this.debugOn) return;
    const idx = who !== null && typeof who === 'object' ? who.idx : null;
    const side = who === null ? null : typeof who === 'object' ? who.side : who;
    this.debugLog.push({ t: this.t, side, idx, cat, text });
    if (this.debugLog.length > 40000) this.debugLog.splice(0, 10000);
  }

  private checkIdle() {
    const t = this.t;
    for (const c of this.champs) {
      const snap = this.idleSnap.get(c.idx);
      const busy = t < 80 || c.dead || c.recallUntil > t || (c.task.kind === 'flee' && this.towers.some((tw) => tw.alive && tw.def.side === c.side && dist(tw.def.pos, c.pos) < 900)) || c.combatTarget !== null || c.lastCombatAt > t - 3 || dist(c.pos, FOUNTAIN[c.side]) < 2500
        || c.task.kind === 'objective' || c.task.kind === 'group' || c.task.kind === 'defend' || c.task.kind === 'ward' || (c.task.kind === 'jungle' && !!c.task.campId)
        || (c.task.kind === 'lane' && this.waves.some((w) => w.lane === c.task.lane && dist(lanePoint(w.lane, w.p), c.pos) < 1600))
        || (c.task.kind === 'push' && this.waves.some((w) => w.side === c.side && w.lane === c.task.lane && dist(lanePoint(w.lane, w.p), c.pos) < 1800));
      if (!snap || busy || dist(snap.pos, c.pos) > 350) { this.idleSnap.set(c.idx, { pos: { ...c.pos }, since: t, logged: false }); continue; }
      if (!snap.logged && t - snap.since >= 12) {
        snap.logged = true; this.stuckCount++;
        this.dbg(c, 'stuck', `idle ${Math.round(t - snap.since)}s at (${Math.round(c.pos.x)}, ${Math.round(c.pos.y)}) — task ${c.task.kind}${c.task.lane ? ' ' + c.task.lane : ''}${c.task.reason ? ` (${c.task.reason})` : ''}, dest ${c.dest ? `(${Math.round(c.dest.x)}, ${Math.round(c.dest.y)})` : 'none'}`);
      }
    }
  }

  /** Log what changed since the last tick: tasks (with their reason), wave plans, team plans, objective calls. */
  private debugDiff() {
    for (const c of this.champs) {
      const tk = c.dead ? 'dead' : `${c.task.kind}|${c.task.lane ?? ''}|${c.task.objective ?? ''}|${c.task.targetIdx ?? ''}|${c.task.campId ?? ''}`;
      const prev = this.dbgTask.get(c.idx);
      if (prev !== tk) {
        this.dbgTask.set(c.idx, tk);
        if (prev !== undefined && !c.dead) this.dbg(c, 'task', describeTask(this, c.task));
      }
      if (!c.dead && c.task.kind === 'lane' && c.waveReason) {
        const wk = `${c.waveIntent}|${c.waveReason}`;
        if (this.dbgWave.get(c.idx) !== wk) { this.dbgWave.set(c.idx, wk); this.dbg(c, 'wave', `wave: ${c.waveIntent} — ${c.waveReason}${this.t > 840 ? ` (alert ${c.alert.toFixed(2)})` : ''}`); }
      }
    }
    for (const side of [0, 1] as Side[]) {
      const tm = this.teams[side];
      if (tm.plan.label !== this.dbgPlan[side]) { this.dbgPlan[side] = tm.plan.label; this.dbg(side, 'plan', `team plan: ${tm.plan.label}`); }
      for (const [k, call] of Object.entries(tm.objCalls)) {
        if (!call) continue;
        const ck = call.d;
        if (this.dbgCalls[side].get(k) !== ck) { this.dbgCalls[side].set(k, ck); this.dbg(side, 'call', `${k}: ${ck.toUpperCase()} (score ${call.score.toFixed(2)})`); }
      }
      for (const k of [...this.dbgCalls[side].keys()]) if (!tm.objCalls[k as ObjectiveKind]) this.dbgCalls[side].delete(k);
    }
  }

  buffs(c: SimChamp): BuffState {
    const tm = this.teams[c.side];
    const dragons: Record<string, number> = {};
    for (const d of tm.dragons) dragons[d] = (dragons[d] ?? 0) + 1;
    return { baron: tm.baronUntil > this.t, elder: tm.elderUntil > this.t, dragons, soul: tm.soul, t: this.t };
  }

  refresh(c: SimChamp) {
    const prevMax = c.stats?.maxHp ?? 0;
    c.items = itemsFromGold(c.order, c.goldSpent, c.starter);
    c.ranks = abilityRanks(c.level, c.skillOrder);
    c.stats = computeStats(c.champ, c.level, c.items, this.buffs(c), c.role);
    if (prevMax > 0 && c.stats.maxHp > prevMax && !c.dead) c.hp += c.stats.maxHp - prevMax;
    c.hp = Math.min(c.hp, c.stats.maxHp);
  }

  goldSpend(c: SimChamp) {
    c.goldSpent += c.gold;
    c.gold = 0;
    const done = () => c.items.filter((i) => i.frac >= 1 && !i.starter);
    const before = done().length;
    this.refresh(c);
    const after = done();
    if (after.length > before && this.t > 60) {
      const it = gd().itemById[after[after.length - 1].id];
      if (it && it.kind === 'legendary' && after.length <= 3) this.event('info', `${c.input.name} completes ${it.name}`, c.side, { important: false });
    }
  }

  giveGold(c: SimChamp, amount: number) {
    if (amount <= 0) return;
    c.gold += amount;
    c.goldEarned += amount;
  }

  giveXp(c: SimChamp, amount: number) {
    if (c.dead && amount < 50) return;
    c.xp += amount;
    const cap = c.role === 'top' ? TOP_MAX_LEVEL : MAX_LEVEL;
    let leveled = false;
    while (c.level < cap && c.xp >= XP_TO_LEVEL[c.level]) { c.level++; leveled = true; }
    if (leveled) {
      const oldMax = c.stats.maxHp;
      this.refresh(c);
      c.hp = Math.min(c.stats.maxHp, c.hp + (c.stats.maxHp - oldMax));
    }
  }

  setDest(c: SimChamp, p: Vec) {
    if (c.dest && dist2(c.dest, p) < 150 * 150 && c.path.length) return;
    c.dest = { x: p.x, y: p.y };
    c.path = gd().nav.path(c.pos, gd().nav.snap(p));
  }

  speedOf(c: SimChamp) {
    let ms = c.stats.ms;
    if (c.slowUntil > this.t) ms *= 1 - c.slowAmt;
    if (c.ccUntil > this.t && c.ccType === 'polymorph') ms *= 0.6;
    const tm = this.teams[c.side];
    // fast travel in own base / with baron recall handled by recall time
    if (dist(c.pos, FOUNTAIN[c.side]) < 2600) ms *= 1.35;
    if (tm.baronUntil > this.t && c.task.kind === 'push') ms *= 1.03;
    if (c.task.kind === 'flee') ms *= 1.04;
    return ms;
  }

  move(c: SimChamp, dt: number) {
    if (c.dead) return;
    if (c.dashing) { stepDash(this, c); return; } // mid-dash: the dash moves them
    if (c.recallUntil > this.t || c.moveLockUntil > this.t) return;
    if (c.ccUntil > this.t) {
      // charm / taunt: walk toward the caster; fear: run away; polymorph: waddle on; otherwise stuck
      const src = c.ccFrom !== undefined ? this.champs[c.ccFrom] : null;
      const forced = c.ccType === 'charm' || c.ccType === 'taunt' || c.ccType === 'fear';
      if (forced && src && !src.dead) {
        const toward = c.ccType !== 'fear';
        const dx = (src.pos.x - c.pos.x) * (toward ? 1 : -1), dy = (src.pos.y - c.pos.y) * (toward ? 1 : -1);
        const l = Math.hypot(dx, dy) || 1;
        if (!toward || l > 120) {
          const step = this.speedOf(c) * (c.ccType === 'charm' ? 0.65 : c.ccType === 'fear' ? 0.75 : 0.85) * dt;
          const next = { x: c.pos.x + dx / l * step, y: c.pos.y + dy / l * step };
          if (gd().nav.walkable(next)) c.pos = next;
        }
        return;
      }
      if (c.ccType !== 'polymorph') return;
    }
    if ((c.rootUntil ?? 0) > this.t) return;
    let budget = this.speedOf(c) * dt;
    while (budget > 0 && c.path.length) {
      const wp = c.path[0];
      const d = dist(c.pos, wp);
      if (d <= budget) { c.pos = { x: wp.x, y: wp.y }; budget -= d; c.path.shift(); }
      else {
        const f = budget / d;
        c.facing = Math.atan2(wp.y - c.pos.y, wp.x - c.pos.x);
        c.pos = { x: c.pos.x + (wp.x - c.pos.x) * f, y: c.pos.y + (wp.y - c.pos.y) * f };
        budget = 0;
      }
    }
    if (!c.path.length) c.dest = null;
  }

  /** Move directly toward a point (short-range combat steering, falls back to pathing). */
  steer(c: SimChamp, p: Vec, stopAt = 0) {
    const d = dist(c.pos, p);
    if (d <= stopAt) { c.path = []; c.dest = null; return; }
    const target = stopAt > 0 ? { x: p.x - (p.x - c.pos.x) / d * stopAt, y: p.y - (p.y - c.pos.y) / d * stopAt } : p;
    if (d < 700 && gd().nav.los(c.pos, target)) { c.path = [target]; c.dest = target; }
    else this.setDest(c, target);
  }

  // ------------------------------------------------------------------ main loop
  /**
   * Whether red acts first this tick. Acting second is an edge (you react to the other side's fresh
   * decisions in the same tick), so the order is shuffled per tick — a golden-ratio hash, so ticks
   * sampled at any fixed stride (decisions every 2, macro every 10) still split evenly.
   */
  redFirst(): boolean {
    return Math.imul(this.tickNo, 0x9e3779b1) >>> 31 === 1;
  }

  step() {
    if (this.winner !== null) return;
    const dt = this.dt;
    this.t += dt;
    const t = this.t;
    // who moves first this tick: neither side should always get to react to the other's fresh decisions
    this.tickNo++;
    this.turnOrder = this.redFirst() ? this.champsRedFirst : this.champs;

    // passive gold
    if (t >= this.nextPassiveAt) {
      this.nextPassiveAt += 10;
      for (const c of this.champs) {
        let g = GOLD.passivePer10;
        if (c.role === 'adc' && t > 300) g += GOLD.botQuestBonusPerMin / 6;
        if (c.role === 'support') g += 3; // support item
        this.giveGold(c, g);
      }
    }
    // minute snapshots
    if (Math.floor(t / 60) > this.goldDiff.length - 1 && Math.abs(t % 60) < dt) {
      const g0 = this.champs.filter((c) => c.side === 0).reduce((s, c) => s + c.goldEarned, 0);
      const g1 = this.champs.filter((c) => c.side === 1).reduce((s, c) => s + c.goldEarned, 0);
      this.goldDiff.push(Math.round(g0 - g1));
    }

    if (Math.floor(t / 5) !== Math.floor((t - dt) / 5)) for (const c of this.champs) updateForm(this, c, 5);
    this.spawns();
    if (t - this.lastVisionAt >= 0.5) { this.updateVision(); this.lastVisionAt = t; }
    for (const side of (this.redFirst() ? [1, 0] : [0, 1]) as Side[]) if (t - this.lastMacroAt[side] >= 2.5) { teamMacro(this, side); this.lastMacroAt[side] = t; }

    for (const c of this.turnOrder) {
      if (c.dead) {
        if (t >= c.respawnAt) this.respawn(c);
        continue;
      }
      this.regen(c, dt);
      if (c.recallUntil > 0 && t >= c.recallUntil) { c.recallUntil = 0; c.pos = { ...FOUNTAIN[c.side] }; c.path = []; c.dest = null; c.task = { kind: 'base' }; }
      if (t - c.lastDecisionAt >= 0.5) { champDecide(this, c); c.lastDecisionAt = t; }
      this.move(c, dt);
      c.fx = c.fx.filter((f) => f.until > t);
    }
    if (this.debugOn) this.debugDiff();
    if (Math.floor(t / 4) !== Math.floor((t - dt) / 4)) this.checkIdle();
    if (this.scheduled.length) {
      const due = this.scheduled.filter((x) => x.at <= t);
      if (due.length) { this.scheduled = this.scheduled.filter((x) => x.at > t); for (const x of due) x.fn(); }
    }
    updateSummons(this, dt);
    if (this.ultFx.length && this.ultFx[0].until < t) this.ultFx = this.ultFx.filter((f) => f.until >= t);
    if (this.floaters.length && this.floaters[0].until < t) this.floaters = this.floaters.filter((f) => f.until >= t);
    updateCombat(this, dt);
    champActions(this, dt);
    this.updateWaves(dt);
    this.updateTowers(dt);
    this.updateCamps(dt);
    this.updateObjectives(dt);
    this.updateWards();
    this.checkEnd();
    if (t >= this.maxTime && this.winner === null) {
      // safety valve: higher gold wins
      const g0 = this.champs.filter((c) => c.side === 0).reduce((s, c) => s + c.goldEarned, 0);
      const g1 = this.champs.filter((c) => c.side === 1).reduce((s, c) => s + c.goldEarned, 0);
      this.winner = this.destiny ?? (g0 >= g1 ? 0 : 1);
    }
  }

  runToEnd(): MatchResult {
    while (this.winner === null) this.step();
    return this.result();
  }

  regen(c: SimChamp, dt: number) {
    const atFountain = dist(c.pos, FOUNTAIN[c.side]) < 900;
    if (atFountain) {
      c.hp = Math.min(c.stats.maxHp, c.hp + c.stats.maxHp * 0.12 * dt);
      if (this.t < 840 && c.potions < 2 && c.gold >= 50 && c.role !== 'jungle') { c.potions++; c.gold -= 50; }
      if (c.gold > 0) this.goldSpend(c);
      if (c.role === 'support' || c.role === 'jungle') c.controlWards = Math.max(c.controlWards, c.role === 'support' ? 2 : 1);
    } else if (this.t - c.lastCombatAt > 5) {
      c.hp = Math.min(c.stats.maxHp, c.hp + c.stats.hpRegen * dt * (this.t - c.lastCombatAt > 10 ? 1.4 : 1));
    }
    // health potions (Doran's / refillable): 120 hp over 15s
    if (c.potions > 0 && c.potionUntil < this.t && c.hp < c.stats.maxHp * 0.6 && !atFountain) { c.potions--; c.potionUntil = this.t + 15; }
    if (c.potionUntil > this.t) c.hp = Math.min(c.stats.maxHp, c.hp + 8 * dt);
    if (c.shieldUntil < this.t) c.shield = 0;
    // ward charges
    const maxCharges = c.role === 'support' ? 3 + (c.input.vision >= 75 ? 1 : 0) : 2;
    if (c.wardCharges < maxCharges && this.t >= c.wardRechargeAt) {
      c.wardCharges++;
      const sup = c.role === 'support' ? 0.5 : c.role === 'jungle' ? 0.8 : 1;
      // good vision players keep wards cycling (buying, swapping trinkets, using charges on time)
      c.wardRechargeAt = this.t + (210 - c.level * 7) * sup * (1.35 - c.input.vision / 100 * 0.6);
    }
  }

  respawn(c: SimChamp) {
    c.dead = false;
    c.pos = { ...FOUNTAIN[c.side] };
    c.path = []; c.dest = null;
    this.goldSpend(c);
    c.hp = c.stats.maxHp;
    c.task = { kind: 'base' };
    c.ccUntil = 0; c.slowUntil = 0; c.shield = 0; c.rootUntil = 0; c.silenceUntil = 0; c.blindUntil = 0;
    c.lastDamagedBy.clear();
  }

  // ------------------------------------------------------------------ spawns
  spawns() {
    const t = this.t;
    // minion waves
    if (t >= this.nextWaveAt) {
      this.waveNo++;
      const interval = t >= 1800 ? T.waveIntervalLate : t >= 840 ? T.waveIntervalMid : T.waveInterval;
      this.nextWaveAt += interval;
      const cannonEvery = t >= 1500 ? 1 : t >= 900 ? 2 : 3;
      const cannon = this.waveNo % cannonEvery === 0;
      const m = t / 60;
      const meleeHp = MINION.meleeHp + 21 * Math.floor(t / 90);
      const casterHp = MINION.casterHp + 9 * Math.floor(t / 90);
      for (const side of [0, 1] as Side[]) for (const lane of LANES) {
        const enemyInhibDown = this.inhibs.some((ih) => ih.side !== side && ih.lane === lane && !ih.alive);
        const supers = enemyInhibDown ? (this.inhibs.filter((ih) => ih.side !== side && !ih.alive).length >= 3 ? 2 : 1) : 0;
        const count = 6 + (cannon ? 1 : 0) + supers;
        const hp = meleeHp * 3 + casterHp * 3 + (cannon ? MINION.cannonHp + 40 * m : 0) + supers * 1600;
        const gold = (GOLD.melee * 3 + GOLD.caster * 3 + (cannon ? Math.min(GOLD.cannonMax, GOLD.cannonBase + m * 1.5) : 0) + supers * GOLD.superMinion) / count;
        const xp = (XP.melee * 3 + XP.caster * 3 + (cannon ? XP.cannon : 0) + supers * 97) / count;
        // enemy minions already inside our base on this lane: the new wave walks out from the Nexus to meet them
        const intruders = this.waves.some((w) => w.side !== side && w.lane === lane && (side === 0 ? w.p < 0 : w.p > 1));
        const p0 = intruders ? (side === 0 ? laneMinP(lane) : laneMaxP(lane)) : side === 0 ? 0.0 : 1.0;
        this.waves.push({
          id: this.waveIdSeq++, side, lane, p: p0, count, hp, avgHp: hp / count,
          goldEach: gold, xpEach: xp, stopped: false, supers, cannon, empowered: this.teams[side].baronUntil > t,
        });
      }
    }
    // camps
    for (const camp of this.camps) {
      if (!camp.alive && camp.respawnAt > 0 && t >= camp.respawnAt) {
        const st = CAMP_STATS[camp.def.kind];
        const scale = 1 + Math.max(0, t - 120) / 60 * 0.045;
        camp.maxHp = st.hp * scale; camp.hp = camp.maxHp; camp.alive = true; camp.respawnAt = 0;
      }
    }
    // epic monsters
    for (const o of this.objectives) {
      if (o.alive || o.spawnAt <= 0 || t < o.spawnAt) continue;
      if (o.kind === 'herald' && t > T.heraldDespawn) { o.spawnAt = 0; continue; }
      if (o.kind === 'grubs' && t > T.heraldSpawn - 30) { o.spawnAt = 0; continue; }
      if (o.kind === 'herald' && this.objectives.some((x) => x.kind === 'grubs' && x.alive)) continue;
      const st = OBJECTIVE_STATS[o.kind];
      const m = t / 60;
      o.maxHp = (st.hp + st.hpPerMin * m) * 1.15; o.hp = o.maxHp; o.alive = true; o.spawnAt = 0; o.attackers.clear();
      if (o.kind === 'grubs') o.count = 3;
      const label = o.kind === 'dragon' ? `${DRAGON_LABEL[o.dragonType!]} Drake` : o.kind === 'grubs' ? 'Voidgrubs' : o.kind === 'herald' ? 'Rift Herald' : o.kind === 'baron' ? 'Baron Nashor' : 'Elder Dragon';
      this.event('info', `${label} has spawned`, undefined, { important: o.kind === 'baron' || o.kind === 'elder' });
    }
  }

  // ------------------------------------------------------------------ vision
  updateVision() {
    for (const tm of this.teams) {
      const side = tm.side;
      tm.visible.clear();
      const allies = this.living(side);
      const myWards = this.wards.filter((w) => w.side === side);
      const myTowers = this.towers.filter((tw) => tw.alive && tw.def.side === side);
      const myWaves = this.waves.filter((w) => w.side === side);
      for (const e of this.enemiesOf(side)) {
        if (e.dead) continue;
        let seen = false;
        const sight = this.darkUntil[side] > this.t ? 350 : VISION.champion;
        for (const a of allies) if (dist2(a.pos, e.pos) < sight ** 2) { seen = true; break; }
        if (!seen) for (const sm of this.summons) if (sm.side === side && sm.mode !== 'trap' && dist2(sm.pos, e.pos) < 700 ** 2) { seen = true; break; }
        if (!seen) for (const w of myWards) if (dist2(w.pos, e.pos) < VISION.ward ** 2) { seen = true; break; }
        if (!seen) for (const tw of myTowers) if (dist2(tw.def.pos, e.pos) < VISION.tower ** 2) { seen = true; break; }
        if (!seen) for (const w of myWaves) if (dist2(lanePoint(w.lane, w.p), e.pos) < VISION.minion ** 2) { seen = true; break; }
        if (seen) {
          if (!tm.seenSince.has(e.idx)) tm.seenSince.set(e.idx, this.t);
          tm.visible.add(e.idx); tm.lastSeen.set(e.idx, { pos: { ...e.pos }, t: this.t });
        } else tm.seenSince.delete(e.idx);
      }
    }
  }

  isVisibleTo(side: Side, idx: number) { return this.teams[side].visible.has(idx); }

  placeWard(c: SimChamp, pos: Vec, control = false) {
    if (control) { if (c.controlWards <= 0) return; c.controlWards--; }
    else { if (c.wardCharges <= 0) return; c.wardCharges--; if (c.wardRechargeAt < this.t) c.wardRechargeAt = this.t + 120; }
    // replace an existing control ward
    if (control) this.wards = this.wards.filter((w) => !(w.control && w.owner === c.idx));
    this.wards.push({ id: this.wardIdSeq++, side: c.side, pos: { ...pos }, until: control ? this.t + 9999 : this.t + WARD_DURATION + c.level * 2, control, owner: c.idx });
    c.wardsPlaced++;
    c.visionScore += control ? 1.5 : 1;
  }

  updateWards() {
    if (Math.floor(this.t * 4) % 4 !== 0) return;
    this.wards = this.wards.filter((w) => w.until > this.t);
    // sweeping: champions with good vision skill clear enemy wards they walk near
    for (const c of this.champs) {
      if (c.dead) continue;
      const sweeper = c.role === 'support' || c.role === 'jungle';
      const range = sweeper ? 650 : 350;
      for (const w of this.wards) {
        if (w.side === c.side || w.until <= this.t) continue;
        if (dist2(w.pos, c.pos) < range * range) {
          const p = (w.control ? 0.6 : 0.35) * (0.5 + c.input.vision / 100) * (sweeper ? 1 : 0.5);
          if (this.rng.chance(p)) {
            w.until = 0; c.wardsKilled++; c.visionScore += 1.5; this.giveGold(c, GOLD.wardKill);
          }
        }
      }
    }
    for (const c of this.champs) if (!c.dead) c.visionScore += 0.0035 * (c.role === 'support' ? 3 : c.role === 'jungle' ? 1.8 : 1) * (0.6 + c.input.vision / 125);
  }

  // ------------------------------------------------------------------ minion waves
  updateWaves(dt: number) {
    for (const lane of LANES) {
      const len = LANE_LINES[lane].length;
      const ws = this.waves.filter((w) => w.lane === lane && w.count > 0).sort((a, b) => a.p - b.p);
      for (const w of ws) w.stopped = false;
      // wave vs wave: a blue wave and the red wave right in front of it
      for (let i = 0; i + 1 < ws.length; i++) {
        const a = ws[i], b = ws[i + 1];
        if (a.side !== 0 || b.side !== 1 || b.p - a.p >= 380 / len) continue;
        a.stopped = b.stopped = true;
        const ad = this.waveDps(a) * dt * (a.empowered ? 2 : 1), bd = this.waveDps(b) * dt * (b.empowered ? 2 : 1);
        this.damageWave(b, ad, null);
        this.damageWave(a, bd, null);
      }
      // a wave catching up with the one ahead of it on its own side joins it
      for (let i = 0; i + 1 < ws.length; i++) {
        const a = ws[i], b = ws[i + 1];
        if (a.side !== b.side || a.count <= 0 || b.count <= 0 || b.p - a.p >= 250 / len) continue;
        if (a.side === 0) this.mergeWaves(b, a); else this.mergeWaves(a, b);
      }
      // waves vs structures, then walk on
      for (const w of ws) {
        if (w.count <= 0 || w.stopped) continue;
        const target = this.structureAhead(w);
        if (target) {
          w.stopped = true;
          // turrets take heavily reduced damage from minions (inner/base structures even more) —
          // except from super minions, which are built to break bases
          const tierMult = target === 'nexus' ? 0.2 : 'def' in target ? (target.def.tier === 'outer' ? 0.45 : 0.28) : 0.3;
          const superDps = w.supers * SUPER_DPS;
          const dmg = ((this.waveDps(w) - superDps) * (w.empowered ? 4.5 : 1) * tierMult + superDps * (w.empowered ? 1.5 : 1) * 0.6) * dt;
          this.damageStructure(target, dmg, w.side, null);
          continue;
        }
        const sp = MINION.speed / len * dt;
        w.p = clamp(w.p + (w.side === 0 ? sp : -sp), laneMinP(lane), laneMaxP(lane));
      }
    }
    this.waves = this.waves.filter((w) => w.count > 0);
  }

  waveDps(w: SimWave) {
    // big stacked waves can't all reach the front: diminishing returns past ~8 minions
    const eff = w.count <= 8 ? w.count : 8 + Math.sqrt(w.count - 8) * 1.5;
    return eff * MINION.dps * (1 + this.t / 60 * 0.012) + w.supers * SUPER_DPS;
  }

  mergeWaves(a: SimWave, b: SimWave) {
    a.count += b.count; a.hp += b.hp; a.avgHp = a.hp / a.count;
    a.goldEach = (a.goldEach + b.goldEach) / 2; a.xpEach = (a.xpEach + b.xpEach) / 2; a.supers += b.supers;
    a.cannon = a.cannon || b.cannon; a.empowered = a.empowered || b.empowered;
    b.count = 0; b.hp = 0;
  }

  /** Damage a wave; dead minions grant CS/gold/xp to nearby enemy champions. */
  damageWave(w: SimWave, dmg: number, attacker: SimChamp | null) {
    if (w.count <= 0 || dmg <= 0) return;
    w.hp -= dmg;
    const alive = Math.max(0, Math.ceil(w.hp / w.avgHp - 1e-6));
    const died = w.count - alive;
    if (died <= 0) return;
    w.count = alive;
    // super minions are the tankiest — they're the last ones standing, but they do die
    if (w.supers > alive) w.supers = alive;
    const pos = lanePoint(w.lane, w.p);
    const killerSide = (1 - w.side) as Side;
    const near = this.champs.filter((c) => c.side === killerSide && !c.dead && dist2(c.pos, pos) < 1500 * 1500);
    const farmers = near.filter((c) => dist2(c.pos, pos) < 1400 * 1400 && c.recallUntil <= this.t && c.task.kind !== 'flee' && !c.dead);
    for (let i = 0; i < died; i++) {
      // last hit
      let cand: SimChamp | null = attacker && farmers.includes(attacker) ? attacker : null;
      if (!cand && farmers.length) {
        cand = this.rng.weighted(farmers, (c) => (c.role === 'support' ? 0.05 : c.role === 'jungle' ? (this.t > 900 ? 0.5 : 0.12) : 1) * (c.combatTarget !== null ? 0.5 : 1));
      }
      if (cand) {
        const pressure = this.lanePressure(cand);
        // uncontested, pros hardly miss a last hit; a lane opponent zoning you is what costs CS
        const chance = clamp(0.5 + cand.input.farm * 0.0056 * cand.perf - pressure * 0.24 + (cand.role === 'adc' ? 0.02 : 0), 0.3, 0.99);
        if (this.rng.chance(chance)) { cand.cs++; this.giveGold(cand, w.goldEach); }
      }
      // xp to nearby
      if (near.length) {
        const share = near.length === 1 ? 1 : 1.24 / near.length;
        for (const c of near) this.giveXp(c, w.xpEach * share);
      }
    }
  }

  /** How much the enemy laner is zoning this champion (0..1). */
  lanePressure(c: SimChamp): number {
    let p = 0;
    for (const e of this.champs) {
      if (e.side === c.side || e.dead) continue;
      const d = dist(e.pos, c.pos);
      if (d < 900) {
        const adv = (e.input.lane - c.input.lane) / 100 + (e.level - c.level) * 0.06 + (e.hp / e.stats.maxHp - c.hp / c.stats.maxHp) * 0.3
          + (this.t < 840 && e.role === c.role ? matchupEdge(e.champ.id, c.champ.id, c.role) * 4 : 0); // a lane counter zones you off CS
        p += clamp(0.25 + adv, 0, 0.6) * (e.input.aggression / 100 + 0.3) * (e.waveIntent === 'freeze' ? 1.5 : 1);
      }
    }
    return clamp(p, 0, 1);
  }

  structureAhead(w: SimWave): SimTower | SimInhib | 'nexus' | null {
    const len = LANE_LINES[w.lane].length;
    const enemy = (1 - w.side) as Side;
    // towers on this lane, nearest ahead
    let best: SimTower | null = null, bestD = Infinity;
    for (const tw of this.towers) {
      if (!tw.alive || tw.def.side !== enemy || tw.def.lane !== w.lane) continue;
      const tp = this.towerP(tw);
      const ahead = w.side === 0 ? tp - w.p : w.p - tp;
      if (ahead > -0.01 && ahead < bestD) { bestD = ahead; best = tw; }
    }
    if (best && bestD * len < TOWER_RANGE - 100) return best;
    if (best) return null;
    const ih = this.inhibs.find((i) => i.side === enemy && i.lane === w.lane);
    if (ih && ih.alive) {
      const ahead = w.side === 0 ? 1 - w.p : w.p;
      return ahead * len < 600 ? ih : null;
    }
    // inhibitor down: the wave walks into the base — Nexus turrets on the way, then the Nexus
    const pos = lanePoint(w.lane, w.p);
    const nexusTowers = this.towers.filter((tw) => tw.alive && tw.def.side === enemy && tw.def.tier === 'nexus');
    let near: SimTower | null = null, nd = Infinity;
    for (const tw of nexusTowers) { const d = dist(pos, tw.def.pos); if (d < nd) { nd = d; near = tw; } }
    const atEnd = w.side === 0 ? w.p >= laneMaxP(w.lane) - 1e-6 : w.p <= laneMinP(w.lane) + 1e-6;
    if (near && (nd < 650 || atEnd)) return near;
    if (!near && (atEnd || dist(pos, NEXUS[enemy]) < 700)) return 'nexus';
    return null;
  }

  private towerPCache = new Map<string, number>();
  towerP(tw: SimTower) {
    let p = this.towerPCache.get(tw.def.id);
    if (p === undefined) {
      const lane = tw.def.lane === 'base' ? 'mid' : tw.def.lane;
      const pl = LANE_LINES[lane];
      // progress of closest point
      let best = Infinity; p = 0;
      for (let i = 0; i <= 200; i++) { const q = lanePoint(lane, i / 200); const d = dist2(q, tw.def.pos); if (d < best) { best = d; p = i / 200; } }
      void pl;
      this.towerPCache.set(tw.def.id, p);
    }
    return p;
  }

  // ------------------------------------------------------------------ structures
  damageStructure(target: SimTower | SimInhib | 'nexus', dmg: number, side: Side, attacker: SimChamp | null) {
    if (target === 'nexus') {
      const enemy = (1 - side) as Side;
      const nexusTowers = this.towers.some((tw) => tw.alive && tw.def.side === enemy && tw.def.tier === 'nexus');
      const inhibDown = this.inhibs.some((i) => i.side === enemy && !i.alive);
      if (nexusTowers || !inhibDown) return;
      this.nexusHp[enemy] -= dmg;
      if (enemy === this.destiny && this.nexusHp[enemy] <= 0) {
        this.nexusHp[enemy] = 1;
        if (this.t - this.destinyNoticeAt > 60) {
          this.destinyNoticeAt = this.t;
          this.curse = Math.min(1.5, this.curse + 0.5);
          this.event('info', `${this.teams[enemy].input.name}'s Nexus refuses to fall!`, enemy, { important: true });
          for (const c of this.champs) {
            if (c.side !== enemy) c.tilt = Math.min(0.3, c.tilt + 0.08);
            else if (c.dead) c.respawnAt = Math.min(c.respawnAt, this.t + 1); // they come back for it
          }
        }
        return;
      }
      if (this.nexusHp[enemy] <= 0 && this.winner === null) {
        this.winner = side;
        this.event('nexus', `${this.teams[side].input.name} destroy the Nexus!`, side, { important: true });
      }
      return;
    }
    if ('def' in target) {
      const tw = target;
      if (!tw.alive) return;
      // protected towers: inhib turrets need outer & inner dead, nexus towers need an inhibitor down
      if (!this.towerVulnerable(tw)) return;
      let d = dmg;
      if (this.t < 300 && tw.def.tier === 'outer') d *= 0.6; // early fortification
      const grubs = this.teams[side].grubs;
      if (attacker && grubs) d *= 1 + grubs * 0.07;
      const before = tw.hp;
      tw.hp -= d;
      // plates
      if (tw.plates > 0 && this.t < T.platesFall) {
        const plateHp = tw.maxHp / 5;
        while (tw.plates > 0 && tw.hp <= plateHp * (tw.plates - 1)) {
          tw.plates--;
          this.teams[side].plates++;
          const near = this.living(side).filter((c) => dist(c.pos, tw.def.pos) < 1400);
          for (const c of near) this.giveGold(c, GOLD.plate / Math.max(1, near.length) * (near.length > 1 ? 1.3 : 1));
          if (near.length) this.event('plate', `${this.teams[side].input.short} take a turret plate (${tw.def.lane})`, side);
        }
      }
      void before;
      if (tw.hp <= 0) this.destroyTower(tw, side);
    } else {
      const ih = target;
      if (!ih.alive) return;
      const innerDead = !this.towers.some((tw) => tw.alive && tw.def.side === ih.side && tw.def.lane === ih.lane && tw.def.tier === 'inhib');
      if (!innerDead) return;
      ih.hp -= dmg;
      if (ih.hp <= 0) {
        ih.alive = false; ih.respawnAt = this.t + T.inhibRespawn; ih.hp = 0;
        this.teams[side].inhibs++;
        for (const c of this.living(side)) if (dist(c.pos, ih.pos) < 1500) this.giveGold(c, GOLD.inhib);
        this.event('inhib', `${this.teams[side].input.name} destroy the ${ih.lane} inhibitor`, side, { important: true });
      }
    }
  }

  towerVulnerable(tw: SimTower) {
    const s = tw.def.side;
    if (tw.def.tier === 'outer') return true;
    if (tw.def.tier === 'inner') return !this.towers.some((x) => x.alive && x.def.side === s && x.def.lane === tw.def.lane && x.def.tier === 'outer');
    if (tw.def.tier === 'inhib') return !this.towers.some((x) => x.alive && x.def.side === s && x.def.lane === tw.def.lane && x.def.tier === 'inner');
    return this.inhibs.some((i) => i.side === s && !i.alive);
  }

  destroyTower(tw: SimTower, side: Side) {
    tw.alive = false; tw.hp = 0; tw.plates = 0;
    const tm = this.teams[side];
    tm.towers++;
    const local = tw.def.tier === 'outer' ? GOLD.outerTowerLocal : tw.def.tier === 'inner' ? GOLD.innerTowerLocal : tw.def.tier === 'inhib' ? GOLD.inhibTowerLocal : GOLD.nexusTowerLocal;
    const near = this.living(side).filter((c) => dist(c.pos, tw.def.pos) < 1500);
    for (const c of near) this.giveGold(c, local / Math.max(1, near.length));
    for (const c of this.living(side)) this.giveGold(c, GOLD.towerGlobal);
    let firstText = '';
    if (this.firstTowerSide === null) {
      this.firstTowerSide = side; tm.firstTower = true;
      for (const c of near) this.giveGold(c, GOLD.firstTurretBonus / Math.max(1, near.length));
      firstText = ' (First Tower)';
    }
    const lane = tw.def.lane === 'base' ? 'nexus' : tw.def.lane;
    this.event('tower', `${tm.input.name} destroy the ${lane} ${tw.def.tier} turret${firstText}`, side, { important: tw.def.tier !== 'outer' || !!firstText });
  }

  updateTowers(dt: number) {
    const t = this.t;
    for (const ih of this.inhibs) if (!ih.alive && ih.respawnAt > 0 && t >= ih.respawnAt) { ih.alive = true; ih.hp = ih.maxHp; this.event('info', `${this.teams[ih.side].input.short} ${ih.lane} inhibitor respawned`, ih.side); }
    if (t > T.platesFall) for (const tw of this.towers) tw.plates = 0;
    for (const tw of this.towers) {
      if (!tw.alive || t < tw.shotReadyAt) continue;
      const enemy = (1 - tw.def.side) as Side;
      const inRange = this.champs.filter((c) => c.side === enemy && !c.dead && dist2(c.pos, tw.def.pos) < TOWER_RANGE * TOWER_RANGE);
      // aggro: enemy champion that damaged an allied champion recently
      let target: SimChamp | null = null;
      for (const c of inRange) {
        if (c.lastCombatAt > t - 1.5 && c.combatTarget !== null) {
          const victim = this.champs[c.combatTarget];
          if (victim && victim.side === tw.def.side && dist(victim.pos, tw.def.pos) < TOWER_RANGE + 300) { target = c; break; }
        }
      }
      if (!target && tw.targetIdx !== null && tw.targetIdx >= 0) {
        const cur = this.champs[tw.targetIdx];
        if (cur && !cur.dead && inRange.includes(cur)) target = cur;
      }
      const wavesHere = this.waves.filter((w) => w.side === enemy && dist2(lanePoint(w.lane, w.p), tw.def.pos) < (TOWER_RANGE + 150) ** 2);
      if (!target && wavesHere.length) {
        const dmg = TOWER_STATS[tw.def.tier].damage * 2.2;
        this.damageWave(wavesHere[0], dmg, null);
        tw.targetIdx = -1; tw.shotsOnTarget = 0;
        tw.shotReadyAt = t + TOWER_ATTACK_INTERVAL;
        continue;
      }
      if (!target && inRange.length) target = inRange.sort((a, b) => dist2(a.pos, tw.def.pos) - dist2(b.pos, tw.def.pos))[0];
      if (!target) { tw.targetIdx = null; tw.shotsOnTarget = 0; continue; }
      if (tw.targetIdx === target.idx) tw.shotsOnTarget++; else { tw.targetIdx = target.idx; tw.shotsOnTarget = 0; }
      const base = TOWER_STATS[tw.def.tier].damage + t / 60 * 9;
      const dmg = base * (1 + 0.4 * Math.min(3, tw.shotsOnTarget));
      dealDamage(this, null, target, dmg, 'physical', { tower: true });
      target.fx.push({ kind: 'towerShot', until: t + 0.3, to: tw.def.pos });
      tw.shotReadyAt = t + TOWER_ATTACK_INTERVAL;
    }
  }

  // ------------------------------------------------------------------ jungle camps
  updateCamps(dt: number) {
    for (const camp of this.camps) {
      if (!camp.alive) continue;
      const attackers = this.champs.filter((c) => !c.dead && c.task.kind === 'jungle' && c.task.campId === camp.def.id && dist2(c.pos, camp.def.pos) < 450 * 450 && c.ccUntil <= this.t);
      if (!attackers.length) { camp.hp = Math.min(camp.maxHp, camp.hp + camp.maxHp * 0.05 * dt); continue; }
      const st = CAMP_STATS[camp.def.kind];
      for (const c of attackers) {
        const isJg = c.role === 'jungle';
        const clear = c.champ.profile.clear ?? 3;
        const dps = this.monsterDps(c) * (isJg ? 0.95 + clear * 0.13 : 0.6) * (0.72 + c.input.mech / 100 * 0.15 + c.input.pathing / 100 * 0.35) * c.perf;
        let dmg = dps * dt;
        // smite
        const holdSmite = this.objectives.some((o) => o.kind !== 'grubs' && (o.alive || (o.spawnAt > 0 && o.spawnAt - this.t < 45)) && dist2(o.pos, c.pos) < 6000 * 6000);
        if (c.summ2 === 'smite' && this.t >= c.summ2ReadyAt && camp.hp < camp.maxHp * 0.6 && !holdSmite) {
          dmg += 600 + c.level * 20; c.summ2ReadyAt = this.t + (camp.def.kind === 'blue' || camp.def.kind === 'red' ? 30 : 45);
        }
        camp.hp -= dmg;
        camp.lastHitBy = c.idx;
        // camp hits back
        const taken = st.dps * (1 + this.t / 60 * 0.03) * dt / attackers.length * (isJg ? 0.3 : 0.8);
        c.hp -= taken * 100 / (100 + c.stats.armor);
        if (c.hp < 1) c.hp = 1;
      }
      if (camp.hp <= 0) {
        camp.alive = false;
        camp.respawnAt = this.t + (camp.def.kind === 'blue' || camp.def.kind === 'red' ? T.buffRespawn : camp.def.kind === 'scuttle' ? T.scuttleRespawn : T.campRespawn);
        const killer = this.champs[camp.lastHitBy!];
        const scale = 1 + this.t / 60 * 0.012;
        this.giveGold(killer, st.gold * scale);
        this.giveXp(killer, st.xp * 1.55 * (killer.role === 'jungle' ? 0.85 + killer.input.pathing / 100 * 0.3 : 1) * (1 + killer.level * 0.04) * (killer.role === 'jungle' && killer.level < this.avgLevel() - 1 ? 1.25 : 1));
        if (killer.role === 'jungle') killer.hp = Math.min(killer.stats.maxHp, killer.hp + 40 + killer.stats.maxHp * 0.09); // jungle pet / smite sustain
        killer.cs += camp.def.kind === 'wolves' ? 3 : camp.def.kind === 'raptors' ? 6 : camp.def.kind === 'krugs' ? 6 : camp.def.kind === 'scuttle' ? 1 : 4;
        if (camp.def.kind === 'scuttle') {
          // scuttle grants vision of the river
          this.wards.push({ id: this.wardIdSeq++, side: killer.side, pos: { ...camp.def.pos }, until: this.t + 90, control: false, owner: -1 });
        }
        if (killer.side !== camp.def.side && camp.def.side !== -1 && (camp.def.kind === 'blue' || camp.def.kind === 'red')) this.event('info', `${killer.input.name} steals the enemy ${camp.def.kind} buff`, killer.side);
        killer.task = { kind: 'jungle' };
      }
    }
  }

  avgLevel() { return this.champs.reduce((s, c) => s + c.level, 0) / 10; }

  /** Damage per second against a whole minion wave when shoving (AoE abilities hit several minions). */
  waveClearDps(c: SimChamp, minions: number) {
    const s = c.stats;
    const auto = s.ad * s.as * (1 + s.crit * (s.critDmg - 1));
    let abil = 0;
    for (const a of c.abilities) {
      const r = c.ranks[a.slot];
      if (!r || a.slot === 'R') continue;
      const d = a.damage;
      let dmg = 0;
      if (d) dmg = (d.base[Math.min(r, d.base.length) - 1] ?? 0) + (d.ap ?? 0) * s.ap + (d.ad ?? 0) * s.ad + (d.bonusAd ?? 0) * s.bonusAd;
      else continue;
      const cd = (a.cooldown[Math.min(r, a.cooldown.length) - 1] ?? 8) * 100 / (100 + s.ah);
      const hits = a.aoe ? Math.min(minions, 3 + c.champ.profile.waveclear * 0.35) : 1;
      abil += dmg * hits / Math.max(2, cd);
    }
    const wc = 0.55 + c.champ.profile.waveclear / 10 * 0.75;
    return (auto * 1.1 + abil * 0.7) * wc;
  }

  monsterDps(c: SimChamp) {
    const s = c.stats;
    const auto = s.ad * s.as * (1 + s.crit * (s.critDmg - 1));
    let abil = 0;
    for (const a of c.abilities) {
      const r = c.ranks[a.slot];
      if (!r || !a.damage) continue;
      const d = a.damage;
      const dmg = (d.base[Math.min(r, d.base.length) - 1] ?? 0) + (d.ap ?? 0) * s.ap + (d.ad ?? 0) * s.ad + (d.bonusAd ?? 0) * s.bonusAd;
      const cd = (a.cooldown[Math.min(r, a.cooldown.length) - 1] ?? 10) * 100 / (100 + s.ah);
      abil += dmg / Math.max(1.5, cd) * (a.slot === 'R' ? 0.3 : 1);
    }
    const pet = c.role === 'jungle' ? 25 + c.level * 4 : 0;
    return auto + abil * 0.75 + pet;
  }

  // ------------------------------------------------------------------ epic objectives
  updateObjectives(dt: number) {
    const t = this.t;
    // zone control: holding the area around a live / soon-spawning objective with 2+ players
    for (const o of this.objectives) {
      const live = o.alive || (o.spawnAt > 0 && o.spawnAt - t < 60);
      for (const tm of this.teams) {
        const cur = tm.setup[o.kind] ?? 0;
        if (!live) { if (cur) tm.setup[o.kind] = 0; continue; }
        const here = this.champs.filter((c) => c.side === tm.side && !c.dead && dist2(c.pos, o.pos) < 2600 * 2600).length;
        tm.setup[o.kind] = clamp(here >= 2 ? cur + dt * (here >= 4 ? 1.5 : 1) : cur - dt * 0.5, 0, 60);
      }
    }
    for (const tm of this.teams) {
      if (tm.baronUntil && tm.baronUntil <= t) { tm.baronUntil = 0; for (const c of this.alliesOf(tm.side)) this.refresh(c); }
      if (tm.elderUntil && tm.elderUntil <= t) tm.elderUntil = 0;
    }
    for (const o of this.objectives) {
      if (!o.alive) continue;
      const attackers = this.champs.filter((c) => !c.dead && c.task.kind === 'objective' && c.task.objective === o.kind && dist2(c.pos, o.pos) < 650 * 650 && c.ccUntil <= t && c.combatTarget === null);
      if (!attackers.length) {
        // short gaps (someone steps out, a skirmish at the pit) don't heal it; a leash / reset does
        if (t - (o.lastHitAt ?? -99) > 8) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.03 * dt);
        o.attackers.clear();
        continue;
      }
      o.lastHitAt = t; o.lastHitSide = attackers[0].side;
      const st = OBJECTIVE_STATS[o.kind];
      const armorMult = o.kind === 'baron' ? 0.55 : o.kind === 'elder' ? 0.6 : 0.7;
      let total = 0;
      for (const c of attackers) {
        o.attackers.add(c.idx);
        total += this.monsterDps(c) * armorMult * (0.85 + c.input.obj / 100 * 0.25) * dt;
      }
      o.hp -= total;
      // the monster's damage lands mostly on the tankiest attacker, but aggro gets swapped around —
      // spread it by max HP instead of draining one player to nothing
      const mdps = (st.dps + st.dpsPerMin * t / 60) * dt * (o.kind === 'baron' ? 1.2 : 1);
      const hpSum = attackers.reduce((s2, a) => s2 + a.stats.maxHp ** 1.5, 0);
      for (const a of attackers) {
        a.hp -= mdps * (a.stats.maxHp ** 1.5 / hpSum) * 100 / (100 + a.stats.armor);
        if (a.hp < 1) a.hp = 1;
      }
      // smite race
      const smiteDmg = 1200;
      if (o.hp <= smiteDmg) {
        const mySide = attackers[0].side;
        const myJg = attackers.find((c) => c.summ2 === 'smite' && t >= c.summ2ReadyAt - 15);
        const enemyJg = this.champs.find((c) => c.side !== mySide && c.summ2 === 'smite' && !c.dead && dist(c.pos, o.pos) < 900);
        let taker: SimChamp = myJg ?? attackers[0];
        if (enemyJg && (o.kind !== 'grubs')) {
          let pSteal = clamp(0.12 + (enemyJg.input.obj - (myJg?.input.obj ?? 40)) / 220 + (myJg ? 0 : 0.35) + (myJg ? (myJg.input.mistakes - 40) / 400 : 0), 0.03, 0.7);
          if (enemyJg.input.traits.includes('baron_thief')) pSteal = Math.min(0.75, pSteal + 0.12);
          if (enemyJg.input.traits.includes('smite_nerves')) pSteal = Math.max(0, pSteal - 0.08);
          if (myJg?.input.traits.includes('smite_nerves')) pSteal = Math.min(0.75, pSteal + 0.06);
          if (this.rng.chance(pSteal)) { taker = enemyJg; this.event('steal', `${enemyJg.input.name} STEALS the ${this.objName(o)}!`, enemyJg.side, { important: true }); }
        }
        if (taker.summ2 === 'smite') taker.summ2ReadyAt = t + 15;
        this.takeObjective(o, taker);
      }
    }
  }

  objName(o: SimObjective) {
    return o.kind === 'dragon' ? `${DRAGON_LABEL[o.dragonType!]} Drake` : o.kind === 'grubs' ? 'Voidgrubs' : o.kind === 'herald' ? 'Rift Herald' : o.kind === 'baron' ? 'Baron' : 'Elder Dragon';
  }

  takeObjective(o: SimObjective, taker: SimChamp) {
    const side = taker.side;
    const tm = this.teams[side];
    const t = this.t;
    o.alive = false; o.takenBy = side; o.attackers.clear();
    const allies = this.living(side);
    const near = allies.filter((c) => dist(c.pos, o.pos) < 1600);
    switch (o.kind) {
      case 'dragon': {
        const type = o.dragonType!;
        tm.dragons.push(type);
        for (const c of near) this.giveXp(c, 200 + t / 60 * 8);
        for (const c of allies) this.giveGold(c, GOLD.dragonTeam);
        let text = `${tm.input.name} secure the ${DRAGON_LABEL[type]} Drake (${tm.dragons.length})`;
        const total = this.teams[0].dragons.length + this.teams[1].dragons.length;
        if (total === 2 && !this.riftType) { this.riftType = this.dragonQueue[2]; }
        if (tm.dragons.length >= 4 && !tm.soul) {
          tm.soul = this.riftType ?? type;
          text += ` — ${DRAGON_LABEL[tm.soul]} Soul!`;
          this.event('soul', `${tm.input.name} claim the ${DRAGON_LABEL[tm.soul]} Dragon Soul`, side, { important: true });
        }
        this.event('dragon', text, side, { important: tm.dragons.length >= 3 });
        for (const c of this.alliesOf(side)) this.refresh(c);
        // next dragon
        const soulTaken = this.teams.some((x) => x.soul);
        if (soulTaken) {
          o.kind = 'elder'; o.dragonType = undefined; o.spawnAt = t + T.elderRespawn;
        } else {
          o.dragonType = this.riftType ?? this.dragonQueue[Math.min(1, total)];
          o.spawnAt = t + T.dragonRespawn;
        }
        break;
      }
      case 'elder': {
        tm.elders++;
        tm.elderUntil = t + T.elderBuff;
        this.event('elder', `${tm.input.name} slay the Elder Dragon!`, side, { important: true });
        o.spawnAt = t + T.elderRespawn;
        break;
      }
      case 'baron': {
        tm.barons++;
        tm.baronUntil = t + T.baronBuff;
        for (const c of allies) { this.giveGold(c, GOLD.baron); this.giveXp(c, 600); }
        this.event('baron', `${tm.input.name} take Baron Nashor!`, side, { important: true });
        for (const c of this.alliesOf(side)) this.refresh(c);
        o.spawnAt = t + T.baronRespawn;
        break;
      }
      case 'herald': {
        tm.heralds++;
        tm.herald = true;
        for (const c of near) this.giveXp(c, 300);
        this.event('herald', `${tm.input.name} capture the Rift Herald`, side, { important: false });
        o.spawnAt = 0;
        break;
      }
      case 'grubs': {
        tm.grubs += 3;
        for (const c of near) { this.giveXp(c, 120); this.giveGold(c, GOLD.grub * 3 / Math.max(1, near.length)); }
        this.event('grubs', `${tm.input.name} take all 3 Voidgrubs`, side);
        o.spawnAt = 0;
        break;
      }
    }
    void ({} as ObjectiveKind);
  }

  // ------------------------------------------------------------------ kills
  killChampion(victim: SimChamp, killer: SimChamp | null) {
    const t = this.t;
    victim.dead = true;
    victim.deaths++;
    onDeathTilt(victim);
    victim.mistakeUntil = 0;
    victim.respawnAt = t + respawnTime(victim.level, t);
    victim.task = { kind: 'dead' };
    victim.path = []; victim.dest = null; victim.recallUntil = 0; victim.combatTarget = null;
    const killerSide = (1 - victim.side) as Side;
    const kt = this.teams[killerSide];
    // tower / minion / monster finished them: the last enemy champion to damage them in the last 10s
    // gets the kill, otherwise an enemy who was fighting them right there. Only a true execution
    // (nobody involved) doesn't count toward the kill score — so the score always matches the K/D/A
    if (!killer) {
      let lastT = -Infinity;
      for (const [idx, at] of victim.lastDamagedBy) if (this.champs[idx].side === killerSide && at > t - 10 && at > lastT) { lastT = at; killer = this.champs[idx]; }
      if (!killer) killer = this.champs.filter((c) => c.side === killerSide && !c.dead && dist(c.pos, victim.pos) < 1200 && c.lastCombatAt > t - 6)
        .sort((a, b) => dist(a.pos, victim.pos) - dist(b.pos, victim.pos))[0] ?? null;
    }
    if (!killer) {
      victim.killStreak = 0;
      victim.lastDamagedBy.clear();
      this.event('info', `${victim.input.name} (${victim.champ.name}) was executed`, killerSide, { victim: victim.idx, pos: { ...victim.pos } });
      return;
    }
    kt.kills++;
    // assists: anyone on the killer team who damaged the victim in the last 10s, plus nearby allies (CC/heals)
    const assisters: SimChamp[] = [];
    for (const [idx, at] of victim.lastDamagedBy) {
      const c = this.champs[idx];
      if (c && c.side === killerSide && at > t - 10 && c !== killer) assisters.push(c);
    }
    for (const c of this.champs) if (c.side === killerSide && !c.dead && c !== killer && !assisters.includes(c) && dist(c.pos, victim.pos) < 1000 && c.lastCombatAt > t - 6) assisters.push(c);
    let bounty = GOLD.kill;
    if (victim.killStreak >= 2) bounty += Math.min(GOLD.shutdownMax, (victim.killStreak - 1) * GOLD.shutdownPerStreak);
    // deaths streak reduces bounty
    const recentDeaths = victim.deaths - victim.kills;
    if (victim.killStreak === 0 && recentDeaths > 2) bounty = Math.max(100, bounty - (recentDeaths - 2) * 40);
    let fb = '';
    if (!this.firstBlood) { this.firstBlood = true; this.firstBloodSide = killerSide; bounty += GOLD.firstBlood; fb = ' — FIRST BLOOD'; }
    const shut = victim.killStreak >= 3;
    victim.killStreak = 0;
    const xp = XP.killBase + victim.level * XP.killPerLevel;
    if (killer) {
      killer.kills++;
      killer.killStreak++;
      onTakedown(this, killer); // resets (Irelia Q, Kha'Zix E…)
      this.giveGold(killer, bounty);
      this.giveXp(killer, xp);
    } else if (assisters.length) {
      // executed by tower/minions: split bounty
      for (const a of assisters) this.giveGold(a, bounty / assisters.length);
    }
    for (const a of assisters) {
      a.assists++;
      onTakedown(this, a);
      this.giveGold(a, GOLD.assistPool / Math.max(1, assisters.length));
      this.giveXp(a, xp * 0.5 / Math.max(1, assisters.length));
    }
    const kName = killer ? `${killer.input.name} (${killer.champ.name})` : 'Executed';
    const text = `${kName} ${killer ? 'killed' : ''} ${victim.input.name} (${victim.champ.name})${fb}${shut ? ' — SHUTDOWN' : ''}`.replace('Executed  ', 'Executed: ');
    this.event(fb ? 'firstBlood' : 'kill', text, killerSide, { killer: killer?.idx, victim: victim.idx, assists: assisters.map((a) => a.idx), pos: { ...victim.pos }, important: !!fb || shut });
    victim.lastDamagedBy.clear();
    // ace / multi-kill detection
    this.recentKills.push({ t, side: killerSide });
    if (this.living(victim.side).length === 0) this.event('ace', `ACE! ${kt.input.name} wipe out ${this.teams[victim.side].input.name}`, killerSide, { important: true });
  }

  // ------------------------------------------------------------------ end
  checkEnd() {
    // nexus damage by champions handled in combat / waves
  }

  result(): MatchResult {
    const winner = this.winner ?? 0;
    const totalGold = (s: Side) => this.champs.filter((c) => c.side === s).reduce((a, c) => a + c.goldEarned, 0);
    // MVP: from the winning team, judged against what's normal for each role
    const mvpLines: MvpLine[] = this.champs.map((c) => ({ role: c.role, k: c.kills, d: c.deaths, a: c.assists, damage: c.damageDealt, gold: c.goldEarned, vision: c.visionScore, tanked: c.damageTaken }));
    const mvp = pickMvp(mvpLines, this.champs.filter((c) => c.side === winner).map((c) => c.idx), this.champs.filter((c) => c.side !== winner).map((c) => c.idx), this.t / 60);
    return {
      winner,
      duration: this.t,
      teams: this.teams.map((tm) => ({
        side: tm.side, teamId: tm.input.teamId, kills: tm.kills, towers: tm.towers, dragons: [...tm.dragons], barons: tm.barons,
        elders: tm.elders, heralds: tm.heralds, grubs: tm.grubs, gold: Math.round(totalGold(tm.side)), inhibs: tm.inhibs, soul: tm.soul,
      })),
      players: this.champs.map((c) => ({
        idx: c.idx, side: c.side, playerId: c.input.playerId, name: c.input.name, role: c.role, championId: c.champ.id,
        k: c.kills, d: c.deaths, a: c.assists, cs: c.cs, gold: Math.round(c.goldEarned), damage: Math.round(c.damageDealt),
        damageTaken: Math.round(c.damageTaken), vision: Math.round(c.visionScore), items: c.items.filter((i) => i.frac >= 1 && !i.starter).map((i) => i.id),
        level: c.level, wardsPlaced: c.wardsPlaced, healing: Math.round(c.healing),
      })),
      events: this.events,
      goldDiff: this.goldDiff,
      mvp,
      firstBlood: this.firstBloodSide ?? undefined,
      firstTower: this.firstTowerSide ?? undefined,
    };
  }
}

export type { Task };

function describeTask(sim: MatchSim, task: Task): string {
  const who = (i?: number) => (i !== undefined ? sim.champs[i]?.input.name ?? '?' : '?');
  let d: string;
  switch (task.kind) {
    case 'lane': d = `→ ${task.lane} lane`; break;
    case 'objective': d = `→ ${task.objective}`; break;
    case 'gank': d = `→ gank ${who(task.targetIdx)} (${task.lane})`; break;
    case 'roam': d = `→ roam to ${task.lane} on ${who(task.targetIdx)}`; break;
    case 'jungle': d = task.campId ? `→ camp ${task.campId}` : '→ jungle'; break;
    case 'push': d = `→ push ${task.lane}`; break;
    case 'defend': d = `→ defend ${task.lane}`; break;
    case 'help': d = `→ help ${who(task.targetIdx)}`; break;
    case 'group': d = '→ group up'; break;
    default: d = task.kind;
  }
  return task.reason ? `${d} — ${task.reason}` : d;
}
