// Pro draft (tournament draft) with Fearless restrictions and an AI drafter.
import type { Champion, Role } from '../types';
import { MASTERY_MAX, MASTERY_UNKNOWN } from '../mastery';
import { ROLES } from '../types';
import { gd, matchupEdge } from '../../data/gamedata';
import { RNG, clamp } from '../../util/rng';

export type DraftActionType = 'ban' | 'pick';
export interface DraftAction { side: 0 | 1; type: DraftActionType; champion?: string; role?: Role }

// Tournament draft order
export const DRAFT_ORDER: { side: 0 | 1; type: DraftActionType }[] = [
  { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' },
  { side: 0, type: 'pick' }, { side: 1, type: 'pick' }, { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
  { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' },
  { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
];

export interface DraftPlayer { id: string; name: string; role: Role; champions: Record<string, number>; adaptability: number; rating: number; traits: string[] }
export interface DraftTeam { teamId: string; name: string; players: DraftPlayer[]; drafting: number; style: string }

export interface DraftState {
  teams: [DraftTeam, DraftTeam];   // [blue, red]
  actions: DraftAction[];
  step: number;
  unavailable: Set<string>;        // fearless-locked champions
  done: boolean;
}

export function newDraft(blue: DraftTeam, red: DraftTeam, fearlessLocked: string[] = []): DraftState {
  return { teams: [blue, red], actions: [], step: 0, unavailable: new Set(fearlessLocked), done: false };
}

export const picksOf = (d: DraftState, side: 0 | 1) => d.actions.filter((a) => a.side === side && a.type === 'pick');
export const bansOf = (d: DraftState, side: 0 | 1) => d.actions.filter((a) => a.side === side && a.type === 'ban').map((a) => a.champion!);
export function taken(d: DraftState): Set<string> {
  const s = new Set(d.unavailable);
  for (const a of d.actions) if (a.champion) s.add(a.champion);
  return s;
}
export function openRoles(d: DraftState, side: 0 | 1): Role[] {
  const used = new Set(picksOf(d, side).map((a) => a.role));
  return ROLES.filter((r) => !used.has(r));
}
export function currentTurn(d: DraftState) { return DRAFT_ORDER[d.step]; }

export function applyAction(d: DraftState, champion: string, role?: Role) {
  const turn = DRAFT_ORDER[d.step];
  if (!turn || d.done) return;
  if (taken(d).has(champion)) throw new Error(`${champion} is not available`);
  const action: DraftAction = { side: turn.side, type: turn.type, champion };
  if (turn.type === 'pick') action.role = role ?? bestRoleFor(d, turn.side, champion);
  d.actions.push(action);
  d.step++;
  if (d.step >= DRAFT_ORDER.length) { d.done = true; finalizeRoles(d); }
}

// ------------------------------------------------------------------ evaluation
let metaCache: Record<string, { presence: number; winRate: number; byRole: Partial<Record<Role, number>>; picks: number }> | null = null;
export function setMeta(meta: { champions: Record<string, { picks: number; wins: number; bans: number; presence: number; byRole: Partial<Record<Role, number>> }> } | null) {
  metaCache = {};
  if (!meta) return;
  for (const [id, m] of Object.entries(meta.champions)) metaCache[id] = { presence: m.presence, winRate: m.picks ? m.wins / m.picks : 0.5, byRole: m.byRole, picks: m.picks };
}
/** Meta strength 0..1 of a champion in a role (pro presence + win rate + patch shifts). */
export function metaScore(champId: string, role: Role, patchPower: Record<string, number> = {}): number {
  const c = gd().championById[champId];
  if (!c) return 0;
  const m = metaCache?.[champId];
  const roleShare = m && m.picks ? (m.byRole[role] ?? 0) / m.picks : c.positions.includes(role) ? 0.6 : 0;
  const plays = c.positions.includes(role) || roleShare > 0.08;
  if (!plays) return 0;
  const presence = m ? Math.min(1, m.presence * 1.4) : 0.15;
  const wr = m && m.picks > 15 ? (m.winRate - 0.5) * 2 : 0;
  return clamp(0.25 + presence * 0.55 * Math.max(0.3, roleShare) + wr * 0.25 + (patchPower[champId] ?? 0) * 2, 0, 1);
}

export function comfort(p: DraftPlayer, champId: string, role: Role): number {
  const c = gd().championById[champId];
  if (!c) return 0;
  const known = p.champions[champId];
  if (known) return known / MASTERY_MAX;
  const inRole = c.positions.includes(role);
  if (!inRole) return 0.1;
  // unknown in-role champion: depends on adaptability and similarity to their pool
  let sim = 0;
  for (const [cid, mastery] of Object.entries(p.champions)) {
    const o = gd().championById[cid];
    if (!o || mastery < 110) continue;
    if (o.archetype && o.archetype === c.archetype) sim = Math.max(sim, 0.12);
    else if (o.classes.some((x) => c.classes.includes(x))) sim = Math.max(sim, 0.06);
  }
  return clamp(MASTERY_UNKNOWN / MASTERY_MAX - 0.05 + p.adaptability / 100 * 0.15 + sim, 0, 0.55); // never played it: roughly "learning"
}

interface CompSummary { ap: number; ad: number; engage: number; peel: number; front: number; poke: number; early: number; late: number; waveclear: number; cc: number; n: number }
function summarize(ids: string[]): CompSummary {
  const s: CompSummary = { ap: 0, ad: 0, engage: 0, peel: 0, front: 0, poke: 0, early: 0, late: 0, waveclear: 0, cc: 0, n: ids.length };
  for (const id of ids) {
    const c = gd().championById[id];
    if (!c) continue;
    const p = c.profile;
    if (c.adaptive === 'ap') s.ap++; else s.ad++;
    s.engage += p.engage; s.peel += p.peel; s.front += p.tankiness; s.poke += p.poke; s.early += p.early; s.late += p.late; s.waveclear += p.waveclear; s.cc += p.cc;
  }
  return s;
}

/** How much adding `champId` improves our composition (roughly -0.3..0.3). */
export function compFit(ours: string[], champId: string): number {
  const c = gd().championById[champId];
  if (!c) return 0;
  const s = summarize(ours);
  const p = c.profile;
  let v = 0;
  // damage mix
  if (s.n >= 2) {
    if (c.adaptive === 'ap' && s.ap === 0) v += 0.1;
    if (c.adaptive === 'ad' && s.ad === 0) v += 0.08;
    if (c.adaptive === 'ap' && s.ap >= 3) v -= 0.12;
    if (c.adaptive === 'ad' && s.ad >= 4) v -= 0.12;
  }
  // engage & frontline
  const maxEngage = s.n ? s.engage / s.n : 0;
  if (p.engage >= 7 && maxEngage < 5) v += 0.08;
  if (p.tankiness >= 7 && s.front / Math.max(1, s.n) < 5) v += 0.07;
  if (s.n >= 3 && s.front / s.n < 4 && p.tankiness <= 3) v -= 0.05;
  // tempo coherence (all-early or all-late comps are fine; mixed less so)
  if (s.n >= 2) {
    const earlyAvg = s.early / s.n, lateAvg = s.late / s.n;
    const champTempo = p.early - p.late, compTempo = earlyAvg - lateAvg;
    v += Math.sign(champTempo) === Math.sign(compTempo) ? 0.03 : -0.02;
  }
  v += (p.cc - 5) * 0.008 + (p.teamfight - 5) * 0.006;
  return v;
}

/** Lane counter value of our champ vs the enemy champ already picked in that role. */
function counterValue(d: DraftState, side: 0 | 1, champId: string, role: Role): number {
  const enemy = picksOf(d, (1 - side) as 0 | 1).find((a) => a.role === role);
  if (!enemy?.champion) return 0;
  const a = gd().championById[champId].profile, b = gd().championById[enemy.champion].profile;
  // known lane counters (op.gg matchups) are what counter-picking is about
  return clamp((a.laning - b.laning) * 0.015 + (role === 'top' ? (a.splitpush - b.splitpush) * 0.006 : 0) + matchupEdge(champId, enemy.champion, role) * 1.2, -0.25, 0.25);
}

export function pickValue(d: DraftState, side: 0 | 1, champId: string, role: Role, patchPower: Record<string, number>): number {
  const team = d.teams[side];
  const player = team.players.find((p) => p.role === role);
  if (!player) return -1;
  const c = gd().championById[champId];
  if (!c) return -1;
  const meta = metaScore(champId, role, patchPower);
  if (meta <= 0) return -1;
  const comf = comfort(player, champId, role);
  const ours = picksOf(d, side).map((a) => a.champion!);
  // comfort first: teams draft what their players actually play well. Off-pool / low-mastery picks
  // carry a real risk, and comp fit or meta only matter as much as the player can execute them.
  const comfTerm = comf * 0.7 - Math.max(0, 0.65 - comf) * 0.9;
  const signature = (player.champions[champId] ?? 0) >= 165 ? 0.08 : (player.champions[champId] ?? 0) >= 130 ? 0.03 : 0;
  let v = comfTerm + signature + meta * (0.16 + comf * 0.22) + compFit(ours, champId) * (0.45 + comf * 0.55) + counterValue(d, side, champId, role);
  // early picks favour blind-safe / flexible champions
  if (d.step < 12) v += (c.profile.blind - 5) * 0.01 + (c.positions.length > 1 ? 0.02 : 0);
  if (player.traits.includes('one_trick') && comf > 0.8) v += 0.08;
  return v;
}

export function bestRoleFor(d: DraftState, side: 0 | 1, champId: string): Role {
  const roles = openRoles(d, side);
  let best = roles[0], bv = -Infinity;
  for (const r of roles) { const v = pickValue(d, side, champId, r, {}); if (v > bv) { bv = v; best = r; } }
  return best ?? 'mid';
}

/** Re-assign roles at the end of the draft to maximise comfort (handles flex picks). */
function finalizeRoles(d: DraftState) {
  for (const side of [0, 1] as const) {
    const picks = picksOf(d, side);
    // greedy improvement: swap roles when it raises total comfort
    for (let iter = 0; iter < 3; iter++) for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i], b = picks[j];
      const pa = d.teams[side].players.find((p) => p.role === a.role)!, pb = d.teams[side].players.find((p) => p.role === b.role)!;
      if (!pa || !pb) continue;
      const cur = comfort(pa, a.champion!, a.role!) + comfort(pb, b.champion!, b.role!);
      const swp = comfort(pa, b.champion!, a.role!) + comfort(pb, a.champion!, b.role!);
      const ca = gd().championById[a.champion!], cb = gd().championById[b.champion!];
      if (swp > cur + 0.05 && cb.positions.includes(a.role!) && ca.positions.includes(b.role!)) { const r = a.role; a.role = b.role; b.role = r; }
    }
  }
}

/** AI choice for the current turn. */
export function aiChoose(d: DraftState, rng: RNG, patchPower: Record<string, number> = {}): { champion: string; role?: Role } {
  const turn = DRAFT_ORDER[d.step];
  const side = turn.side;
  const team = d.teams[side];
  const opp = d.teams[1 - side];
  const blocked = taken(d);
  const noise = (100 - team.drafting) / 100 * 0.12;
  const all = gd().champions;
  if (turn.type === 'ban') {
    // target opponent's strongest comfort + meta champions in roles they still need, and power picks
    const oppRoles = openRoles(d, (1 - side) as 0 | 1);
    let best = '', bv = -Infinity;
    for (const c of all) {
      if (blocked.has(c.id)) continue;
      let v = 0;
      for (const r of oppRoles) {
        const p = opp.players.find((x) => x.role === r);
        if (!p) continue;
        const m = metaScore(c.id, r, patchPower);
        if (m <= 0) continue;
        v = Math.max(v, comfort(p, c.id, r) * 0.5 + m * 0.45 + (p.rating - 70) / 300);
      }
      // second ban phase: don't ban champions that only fit roles we already filled? (target their open roles only)
      v += rng.normal(0, noise);
      if (v > bv) { bv = v; best = c.id; }
    }
    return { champion: best };
  }
  const roles = openRoles(d, side);
  let best = '', bestRole: Role = roles[0], bv = -Infinity;
  for (const c of all) {
    if (blocked.has(c.id)) continue;
    for (const r of roles) {
      const v = pickValue(d, side, c.id, r, patchPower) + rng.normal(0, noise);
      if (v > bv) { bv = v; best = c.id; bestRole = r; }
    }
  }
  return { champion: best, role: bestRole };
}

export function runAIDraft(d: DraftState, rng: RNG, patchPower: Record<string, number> = {}, untilSide?: 0 | 1) {
  while (!d.done) {
    const turn = DRAFT_ORDER[d.step];
    if (untilSide !== undefined && turn.side === untilSide) return;
    const ch = aiChoose(d, rng, patchPower);
    applyAction(d, ch.champion, ch.role);
  }
}

/** Final draft quality for each side (used by the quick sim): comfort, meta and comp balance. */
export function draftScore(d: DraftState, side: 0 | 1, patchPower: Record<string, number> = {}): number {
  const picks = picksOf(d, side);
  let v = 0;
  const ids: string[] = [];
  for (const a of picks) {
    const p = d.teams[side].players.find((x) => x.role === a.role);
    if (!p) continue;
    v += comfort(p, a.champion!, a.role!) * 0.6 + metaScore(a.champion!, a.role!, patchPower) * 0.4;
    ids.push(a.champion!);
  }
  const s = summarize(ids);
  let comp = 0;
  if (s.ap === 0 || s.ad === 0) comp -= 0.3;
  if (s.engage / Math.max(1, s.n) < 4) comp -= 0.15;
  if (s.front / Math.max(1, s.n) < 4) comp -= 0.15;
  return v / 5 + comp * 0.3;
}

export function championName(id: string) { return gd().championById[id]?.name ?? id; }
export type { Champion };
