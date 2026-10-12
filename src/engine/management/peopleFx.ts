// Match-day effect of the locker room on a player's effective ratings (read by prep.ts `effective`).
// Kept free of engine imports so prep.ts can use it without an import cycle. Only the user's club
// carries locker-room state, so AI teams return 0 immediately.
import type { GameState, Player, Team, Role } from '../types';

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const SYN: Record<string, number> = {
  'adc|support': 1, 'jungle|mid': 0.85, 'jungle|support': 0.7, 'jungle|top': 0.6, 'mid|support': 0.45,
  'adc|jungle': 0.4, 'adc|mid': 0.3, 'mid|top': 0.3, 'support|top': 0.25, 'adc|top': 0.2,
};
/** How much two positions lean on each other in game (bot lane 1.0 … top–ADC 0.2). */
export const synergy = (a: Role, b: Role) => (a === b ? 0 : SYN[a < b ? `${a}|${b}` : `${b}|${a}`] ?? 0.25);
const LANE: Record<string, string> = {
  'adc|support': 'bot lane', 'jungle|mid': 'mid–jungle duo', 'jungle|support': 'jungle–support roams', 'jungle|top': 'top side',
  'mid|support': 'mid–support roams', 'adc|jungle': 'bot-side jungle tracks', 'adc|mid': 'carry duo', 'mid|top': 'solo lanes', 'support|top': 'top-side vision', 'adc|top': 'carries',
};
export const laneName = (a: Role, b: Role) => (a === b ? 'role battle' : LANE[a < b ? `${a}|${b}` : `${b}|${a}`] ?? 'partnership');

/** Personal issues: per-severity penalty to effective ratings while active (severity 1..3). */
export const ISSUE_INFO: Record<string, { label: string; mood: string; perSev: number; color: string }> = {
  slump: { label: 'Slump', mood: 'Struggling', perSev: 0.5, color: '#f97316' },
  burnout: { label: 'Burnout', mood: 'Exhausted', perSev: 0.7, color: '#f97316' },
  family: { label: 'Family emergency', mood: 'Distracted', perSev: 0.8, color: '#a78bfa' },
  grief: { label: 'Bereavement', mood: 'Grieving', perSev: 0.9, color: '#94a3b8' },
  breakup: { label: 'Breakup', mood: 'Heartbroken', perSev: 0.7, color: '#f472b6' },
  sick: { label: 'Illness', mood: 'Unwell', perSev: 1.1, color: '#84cc16' },
  wrist: { label: 'Wrist pain', mood: 'In pain', perSev: 0.8, color: '#ef4444' },
  back: { label: 'Back pain', mood: 'Sore', perSev: 0.5, color: '#ef4444' },
  homesick: { label: 'Homesick', mood: 'Homesick', perSev: 0.45, color: '#38bdf8' },
  visa: { label: 'Visa stress', mood: 'Stressed', perSev: 0.4, color: '#eab308' },
  contract: { label: 'Contract worries', mood: 'Uneasy', perSev: 0.3, color: '#eab308' },
  fans: { label: 'Online abuse', mood: 'Shaken', perSev: 0.5, color: '#f87171' },
  nerves: { label: 'Big-match nerves', mood: 'Nervous', perSev: 0.6, color: '#eab308' },
  military: { label: 'Military service', mood: 'Preoccupied', perSev: 0.3, color: '#94a3b8' },
  language: { label: 'Language barrier', mood: 'Isolated', perSev: 0.4, color: '#38bdf8' },
};

export interface AdjPart { label: string; v: number; with?: string }

const BOND_CAP = 2.5;

/** Breakdown of the locker-room modifier for one player of the user's club (effective rating points). */
export function peopleParts(state: GameState, p: Player, team: Team): AdjPart[] {
  const ps = state.people;
  if (!ps || ps.teamId !== team.id) return [];
  const out: AdjPart[] = [];
  const me = ps.players[p.id];
  if (me) {
    for (const i of me.issues) {
      const inf = ISSUE_INFO[i.kind];
      if (inf && i.until >= state.date) out.push({ label: inf.label, v: -inf.perSev * i.sev });
    }
    if (me.away && me.away.until >= state.date && !me.away.standIn) out.push({ label: /leave|funeral|trip|family/.test(me.away.reason) ? 'Flying in from leave' : 'Playing when they should rest', v: -1.5 });
    if (me.trust >= 75) out.push({ label: 'Buys into your plan', v: 0.4 });
    else if (me.trust <= 25) out.push({ label: 'Doesn’t trust the staff', v: -0.6 });
  }
  const roles = Object.keys(team.lineup) as Role[];
  const slot = roles.find((r) => team.lineup[r] === p.id);
  if (!slot) return out; // pair effects only apply to the starting five
  const bonds: AdjPart[] = [];
  for (const r of roles) {
    const q = team.lineup[r];
    if (!q || q === p.id) continue;
    const pr = ps.pairs[pairKey(p.id, q)];
    if (!pr) continue;
    const name = state.players[q]?.handle ?? '?';
    const w = synergy(slot, r);
    // bonds pay off most between positions that play together (bot lane, mid–jungle)
    if (pr.aff > 35) bonds.push({ label: `${w >= 0.6 ? 'Synergy' : 'Rapport'} with ${name}`, v: (w >= 0.6 ? w : w * 0.5) * (pr.aff - 35) / 65 * 2.6, with: q });
    else if (pr.aff < -20) out.push({ label: `Tension with ${name}`, v: -(0.5 + 0.5 * w) * (-pr.aff - 20) / 80 * 2, with: q });
    if (pr.heat >= 15) out.push({ label: `Drama with ${name}`, v: -pr.heat / 100 * 2.2, with: q });
    if (pr.mentor && pr.aff > -20) out.push(pr.mentor === p.id ? { label: `Mentoring ${name}`, v: 0.2, with: q } : { label: `Mentored by ${name}`, v: 0.5, with: q });
  }
  const sum = bonds.reduce((s, b) => s + b.v, 0);
  const k = sum > BOND_CAP ? BOND_CAP / sum : 1;
  for (const b of bonds) if (b.v * k >= 0.05) out.push({ ...b, v: b.v * k });
  // competition for the spot: a healthy rival on the bench pushes the starter, a bitter one gets in their head
  let rival: AdjPart | null = null;
  for (const q of team.roster) {
    const o = state.players[q];
    if (!o || q === p.id || o.role !== slot || roles.some((r) => team.lineup[r] === q)) continue;
    const pr = ps.pairs[pairKey(p.id, q)];
    if (!pr) continue;
    const cand = pr.aff >= 0 ? { label: `Pushed by ${o.handle}`, v: 0.4, with: q } : pr.aff <= -35 ? { label: `Bitter rivalry with ${o.handle}`, v: -0.6, with: q } : null;
    if (cand && (!rival || Math.abs(cand.v) > Math.abs(rival.v))) rival = cand;
  }
  if (rival) out.push(rival);
  return out;
}

/** Total locker-room modifier added to every effective attribute (clamped to −5 … +3.5). */
export function peopleAdj(state: GameState, p: Player, team: Team): number {
  if (!state.people || state.people.teamId !== team.id) return 0;
  let s = 0;
  for (const x of peopleParts(state, p, team)) s += x.v;
  return s < -5 ? -5 : s > 3.5 ? 3.5 : s;
}
