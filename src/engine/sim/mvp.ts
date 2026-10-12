// Player of the Game: judged against what's normal for the role, so a top laner who wins his lane
// and frontlines for the team can take it — not only the carry with the most kills.
import type { Role } from '../types';

/**
 * What a typical game looks like for each role (kills, assists, share of team damage, vision per
 * minute), measured from the simulations themselves so no role starts ahead. Full match sims and
 * the quick statistical sim distribute stats differently, so each has its own table.
 */
type Norms = Record<Role, { k: number; a: number; dmg: number; vs: number }>;
const FULL_NORM: Norms = {
  top: { k: 2.1, a: 3.1, dmg: 0.18, vs: 0.45 }, jungle: { k: 2.7, a: 4.1, dmg: 0.21, vs: 1.3 }, mid: { k: 3.1, a: 3.6, dmg: 0.235, vs: 0.47 },
  adc: { k: 3.65, a: 3.3, dmg: 0.25, vs: 0.43 }, support: { k: 1.55, a: 4.9, dmg: 0.125, vs: 1.7 },
};
const QUICK_NORM: Norms = {
  top: { k: 2.85, a: 3.7, dmg: 0.22, vs: 1.0 }, jungle: { k: 2.75, a: 5.2, dmg: 0.16, vs: 1.4 }, mid: { k: 3.65, a: 4.3, dmg: 0.28, vs: 1.0 },
  adc: { k: 4.15, a: 3.6, dmg: 0.27, vs: 0.9 }, support: { k: 1.05, a: 6.7, dmg: 0.07, vs: 3.0 },
};

const FULL_OFFSET: Record<Role, number> = { top: -0.35, jungle: 0.4, mid: 0.1, adc: 0, support: -0.2 };
const QUICK_OFFSET: Record<Role, number> = { top: 0, jungle: 0, mid: 0.05, adc: 0, support: -0.2 };

export interface MvpLine { role: Role; k: number; d: number; a: number; damage: number; gold: number; vision: number; tanked?: number }

export function mvpScore(l: MvpLine, team: MvpLine[], opp: MvpLine | undefined, minutes: number, quick = false): number {
  const n = (quick ? QUICK_NORM : FULL_NORM)[l.role];
  const teamK = Math.max(1, team.reduce((s, x) => s + x.k, 0));
  const teamDmg = Math.max(1, team.reduce((s, x) => s + x.damage, 0));
  let s = (l.k / n.k) * 1.0 + (l.a / n.a) * 0.6 - l.d * 0.35
    + ((l.damage / teamDmg) / n.dmg) * 1.0
    + ((l.k + l.a) / teamK) * 0.5;
  if (opp) s += Math.max(-1.5, Math.min(1.5, (l.gold - opp.gold) / 1500)) * 0.6; // won the matchup
  const teamTank = team.reduce((s2, x) => s2 + (x.tanked ?? 0), 0);
  if (l.tanked !== undefined && teamTank > 0 && l.role !== 'support') s += ((l.tanked / teamTank) / 0.2 - 1) * 0.15; // frontline
  if (l.role === 'support' || l.role === 'jungle') s += ((l.vision / Math.max(1, minutes)) / n.vs - 1) * 0.15;
  // small per-role offsets so the share of awards by role matches pro Player-of-the-Game history:
  // supports win it with standout games, not by default; junglers' objective control isn't in the box score
  s += (quick ? QUICK_OFFSET : FULL_OFFSET)[l.role];
  return s;
}

/** Index (into `lines`) of the MVP among the winning team's lines. */
export function pickMvp(lines: MvpLine[], winners: number[], losers: number[], minutes: number, quick = false): number {
  const team = winners.map((i) => lines[i]);
  let best = winners[0], bs = -Infinity;
  for (const i of winners) {
    const l = lines[i];
    const opp = losers.map((j) => lines[j]).find((x) => x.role === l.role);
    const s = mvpScore(l, team, opp, minutes, quick);
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}
