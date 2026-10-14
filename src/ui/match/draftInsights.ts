// Read-only draft helpers for the draft screen: who would play a champion, how comfortable they are on it
// (0..200 mastery tiers), lane counters from the op.gg matchup data, simple comp-synergy hints and the
// enemy's comfort picks worth banning. Nothing here changes the draft.
import { gd, matchupEdge } from '../../data/gamedata';
import { comfort, openRoles, picksOf, type DraftPlayer, type DraftState } from '../../engine/draft/draft';
import { checklistCounts, contributions } from '../../engine/draft/checklist';
import { MASTERY_MAX, masteryTier, type MasteryTier } from '../../engine/mastery';
import { ROLES, type Role } from '../../engine/types';

export interface LaneCounter {
  /** the enemy champion locked in this lane */
  vs: string;
  /** matchupEdge (−0.15..0.15): > 0 we counter them, < 0 they counter us */
  edge: number;
  /** our champion's lane win rate in this matchup (op.gg), when either list has it */
  wr: number | null;
}
export interface ComfortInfo { role: Role; player: DraftPlayer | undefined; v: number; known: boolean; tier: MasteryTier }
export interface TileInfo extends ComfortInfo { counter: LaneCounter | null }

/** Comfort of a player on a champion on the 0..200 scale, as the draft and match sims read it. */
export function comfortOf(p: DraftPlayer | undefined, champId: string, role: Role): Omit<ComfortInfo, 'role' | 'player'> {
  if (!p) return { v: 0, known: false, tier: masteryTier(0) };
  const v = Math.round(comfort(p, champId, role) * MASTERY_MAX);
  return { v, known: !!p.champions[champId], tier: masteryTier(v) };
}

export const playerFor = (d: DraftState, side: 0 | 1, role: Role) => d.teams[side].players.find((p) => p.role === role);

/** The role a champion would go to on this side when no player is chosen: the open in-role player most comfortable on it. */
export function autoRole(d: DraftState, side: 0 | 1, champId: string): Role {
  const c = gd().championById[champId];
  const open = openRoles(d, side);
  const cands = open.length ? open : ROLES;
  const inRole = c ? cands.filter((r) => c.positions.includes(r)) : [];
  const pool = inRole.length ? inRole : cands;
  let best = pool[0], bv = -1;
  for (const r of pool) {
    const p = playerFor(d, side, r);
    const v = p ? comfort(p, champId, r) : 0;
    if (v > bv) { bv = v; best = r; }
  }
  return best;
}

/** Our win rate vs `opp` in `role` from either champion's op.gg list (their list gives 1 − their win rate). */
export function laneWinRate(champId: string, opp: string, role: Role): number | null {
  const a = gd().championById[champId]?.matchups?.[role], b = gd().championById[opp]?.matchups?.[role];
  const ea = a?.easy.find((m) => m.id === opp) ?? a?.hard.find((m) => m.id === opp);
  if (ea) return ea.wr;
  const eb = b?.easy.find((m) => m.id === champId) ?? b?.hard.find((m) => m.id === champId);
  return eb ? 1 - eb.wr : null;
}

/** Counter relation with the enemy champion already locked in `role` (null: lane open or no data either way). */
export function laneCounter(d: DraftState, side: 0 | 1, champId: string, role: Role): LaneCounter | null {
  const vs = picksOf(d, (1 - side) as 0 | 1).find((a) => a.role === role)?.champion;
  if (!vs || vs === champId) return null;
  const edge = matchupEdge(champId, vs, role);
  if (!edge) return null;
  return { vs, edge, wr: laneWinRate(champId, vs, role) };
}

/** Per-champion tile info for one side: player (fixed role, suggestion role, or auto), comfort tier, lane counter. */
export function tileInfos(d: DraftState, side: 0 | 1, fixedRole: Role | null, roleHint: (id: string) => Role | undefined): Map<string, TileInfo> {
  const out = new Map<string, TileInfo>();
  for (const c of gd().champions) {
    const role = fixedRole ?? roleHint(c.id) ?? autoRole(d, side, c.id);
    const player = playerFor(d, side, role);
    out.set(c.id, { role, player, ...comfortOf(player, c.id, role), counter: laneCounter(d, side, c.id, role) });
  }
  return out;
}

/** Matchups shown in the info box: the champion's role data (or its first role with data). */
export function matchupsFor(champId: string, role: Role): { role: Role; easy: { id: string; wr: number }[]; hard: { id: string; wr: number }[] } | null {
  const c = gd().championById[champId];
  const m = c?.matchups;
  if (!m) return null;
  const r = m[role] ? role : (c.positions.find((p) => m[p]) ?? (Object.keys(m)[0] as Role | undefined));
  if (!r || !m[r]) return null;
  return { role: r, easy: m[r]!.easy, hard: m[r]!.hard };
}

export interface Hint { text: string; good: boolean }
/**
 * Comp hints for adding `champId` to `ours`, from the champion profiles (same rules as the AI's compFit):
 * engage + follow-up pairs, peel for a carry, and warnings for a lopsided damage mix or no frontline.
 * The checklist rows it would fill are shown separately (checklistFills).
 */
export function synergyHints(ours: string[], champId: string): Hint[] {
  const C = gd().championById;
  const c = C[champId];
  if (!c) return [];
  const p = c.profile;
  const allies = ours.map((id) => C[id]).filter(Boolean);
  const out: Hint[] = [];
  const followUp = (q: typeof p) => q.teamfight >= 7 || q.burst >= 7;
  const engager = allies.filter((a) => a.profile.engage >= 7).sort((a, b) => b.profile.engage - a.profile.engage)[0];
  if (p.engage >= 7) {
    const f = allies.filter((a) => a.profile.engage < 7 && followUp(a.profile)).sort((a, b) => (b.profile.teamfight + b.profile.burst) - (a.profile.teamfight + a.profile.burst))[0];
    if (f) out.push({ text: `Engage for ${f.name}'s follow-up`, good: true });
  } else if (engager && followUp(p)) out.push({ text: `Follows up ${engager.name}'s engage`, good: true });
  if (p.peel >= 7) {
    const carry = allies.filter((a) => a.archetype === 'hypercarry_adc' || (a.profile.late >= 8 && a.profile.dps >= 7))[0];
    if (carry) out.push({ text: `Peels for ${carry.name}`, good: true });
  }
  const kind = contributions(c), have = checklistCounts(allies.map((a) => a.id)), n = allies.length;
  if (kind.magic && !kind.physical && have.magic >= 3) out.push({ text: 'Comp is already magic-heavy', good: false });
  if (n >= 3 && !have.physical && !kind.physical) out.push({ text: 'Still no physical damage', good: false });
  else if (n >= 3 && !have.magic && !kind.magic) out.push({ text: 'Still no magic damage', good: false });
  if (n >= 3 && !have.tank && p.tankiness <= 3) out.push({ text: 'Another squishy — no frontline yet', good: false });
  return out.slice(0, 3);
}

export interface Threat { id: string; player: DraftPlayer; v: number; tier: MasteryTier }
/**
 * Enemy players' Mastered+ champions (130+) in the roles they still have to pick: each player's best few
 * (so one deep pool doesn't fill the list), best first, one entry per champion.
 */
export function enemyThreats(d: DraftState, enemySide: 0 | 1, blocked: Set<string>, n = 10, perPlayer = 3): Threat[] {
  const best = new Map<string, Threat>();
  for (const r of openRoles(d, enemySide)) {
    const p = playerFor(d, enemySide, r);
    if (!p) continue;
    const mine = Object.entries(p.champions).filter(([id, v]) => v >= 130 && !blocked.has(id) && gd().championById[id]).sort((a, b) => b[1] - a[1]).slice(0, perPlayer);
    for (const [id, v] of mine) {
      const cur = best.get(id);
      if (!cur || v > cur.v) best.set(id, { id, player: p, v: Math.round(v), tier: masteryTier(v) });
    }
  }
  return [...best.values()].sort((a, b) => b.v - a.v).slice(0, n);
}
