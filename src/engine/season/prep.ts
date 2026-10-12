// Match preparation: effective ratings, draft inputs and sim inputs for a team.
import type { GameState, Player, Team, Role, PlayerAttributes, Staff } from '../types';
import { ROLES } from '../types';
import { clamp } from '../../util/rng';
import type { SimPlayerInput, SimTeamInput } from '../sim/simtypes';
import type { DraftTeam, DraftPlayer } from '../draft/draft';
import { comfort } from '../draft/draft';
import { overall } from '../setup';
import { peopleAdj } from '../management/peopleFx';
import { offRoleMult, prepTraitInput } from '../management/traitEffects';

export function headCoach(state: GameState, team: Team): Staff | undefined {
  return team.staff.map((id) => state.staff[id]).find((s) => s?.role === 'headCoach') ?? team.staff.map((id) => state.staff[id]).find(Boolean);
}

/** Best staff contribution per area (head coach counts partially in every area). */
export function staffBonus(state: GameState, team: Team) {
  const staff = team.staff.map((id) => state.staff[id]).filter(Boolean) as Staff[];
  const best = (role: Staff['role'], k: keyof Staff['attributes']) => Math.max(0, ...staff.filter((s) => s.role === role).map((s) => s.attributes[k]));
  const hc = headCoach(state, team);
  return {
    training: Math.max(hc?.attributes.training ?? 40, best('coach', 'training')),
    development: Math.max((hc?.attributes.development ?? 40) * 0.8, best('coach', 'development'), best('scout', 'development') * 0.8),
    drafting: Math.max(hc?.attributes.drafting ?? 40, best('analyst', 'drafting')),
    scouting: Math.max(best('scout', 'scouting'), best('analyst', 'scouting') * 0.85, (hc?.attributes.scouting ?? 30) * 0.6),
    motivation: Math.max((hc?.attributes.motivation ?? 40) * 0.8, best('psychologist', 'motivation')),
    hasPsychologist: staff.some((s) => s.role === 'psychologist'),
  };
}

/** Starting five, filling holes with best available roster players. */
export function lineupPlayers(state: GameState, team: Team): Record<Role, Player> {
  const out = {} as Record<Role, Player>;
  const used = new Set<string>();
  for (const r of ROLES) {
    const id = team.lineup[r];
    if (id && state.players[id] && state.players[id].teamId === team.id) { out[r] = state.players[id]; used.add(id); }
  }
  for (const r of ROLES) {
    if (out[r]) continue;
    const cands = team.roster.map((id) => state.players[id]).filter((p) => p && !used.has(p.id));
    cands.sort((a, b) => (b.role === r ? 20 : 0) + overall(b.attributes, r) - ((a.role === r ? 20 : 0) + overall(a.attributes, r)));
    const pick = cands[0] ?? makeStandIn(state, team, r);
    out[r] = pick;
    used.add(pick.id);
  }
  return out;
}

/** Emergency stand-in when a roster is short (an amateur sub). */
function makeStandIn(state: GameState, team: Team, role: Role): Player {
  const id = `standin_${team.id}_${role}`;
  if (state.players[id]) return state.players[id];
  const v = 30;
  const attrs = { mechanics: v, laning: v, farming: v, teamfight: v, macro: v, vision: v, pathing: v, objectives: v, shotcalling: v, consistency: v, clutch: v, adaptability: v, aggression: 50 };
  const p: Player = {
    id, handle: `${team.short} Sub`, name: 'Stand-in', country: team.country ?? '', role, teamId: team.id, attributes: attrs,
    hidden: { potential: 40, farsight: 30, mistakes: 60, composure: 40, snowball: 50, resilience: 50, workEthic: 50, professionalism: 50, ego: 30, loyalty: 50, injuryProne: 20 },
    traits: [], champions: {}, playstyle: [], morale: 60, form: 0, fatigue: 0, contract: null, reputation: 1, value: 0,
    season: { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0, minutes: 0, mvps: 0, champions: {} },
    history: [], career: [], personality: { professionalism: 50, ambition: 50, loyalty: 50, temperament: 50 },
  };
  state.players[id] = p;
  return p;
}

/** Effective attributes for a match: form, morale, fatigue, chemistry, coaching and role fit. */
export function effective(state: GameState, p: Player, team: Team, role: Role): PlayerAttributes {
  const coach = headCoach(state, team);
  const a = { ...p.attributes };
  // + locker room (user's club only): duo bonds, rivalries, drama, personal issues, trust
  const adj = p.form * 0.22 + (p.morale - 65) * 0.035 - Math.max(0, p.fatigue - 55) * 0.07 + (team.chemistry - 60) * 0.03 + peopleAdj(state, p, team);
  const offRole = (p.role !== role ? (p.secondaryRoles?.includes(role) ? 5 : 13) : 0) * offRoleMult(p); // Flex Player halves it
  for (const k of Object.keys(a) as (keyof PlayerAttributes)[]) {
    if (k === 'aggression') continue;
    let v = a[k] + adj;
    if (offRole && (k === 'mechanics' || k === 'laning' || k === 'farming' || k === 'macro' || k === 'pathing')) v -= offRole;
    a[k] = clamp(Math.round(v), 1, 99);
  }
  if (coach) {
    a.macro = clamp(a.macro + Math.round((coach.attributes.tactics - 60) * 0.05), 1, 99);
    a.teamfight = clamp(a.teamfight + Math.round((coach.attributes.tactics - 60) * 0.03), 1, 99);
  }
  a.macro = clamp(a.macro + team.facilities.analyticsLab * 0.5, 1, 99);
  return a;
}

export function draftTeam(state: GameState, team: Team): DraftTeam {
  const lp = lineupPlayers(state, team);
  const coach = headCoach(state, team);
  const players: DraftPlayer[] = ROLES.map((r) => {
    const p = lp[r];
    const e = effective(state, p, team, r);
    return { id: p.id, name: p.handle, role: r, champions: p.champions, adaptability: e.adaptability, rating: overall(e, r), traits: p.traits };
  });
  const sb = staffBonus(state, team);
  return { teamId: team.id, name: team.name, players, drafting: clamp(Math.max(coach?.attributes.drafting ?? 50, sb.drafting) + team.facilities.analyticsLab * 3, 1, 99), style: team.tactics.playstyle };
}

export function simTeam(state: GameState, team: Team, picks: Record<Role, string>): SimTeamInput {
  const lp = lineupPlayers(state, team);
  const dt = draftTeam(state, team);
  const players: SimPlayerInput[] = ROLES.map((r) => {
    const p = lp[r];
    const e = effective(state, p, team, r);
    const dp = dt.players.find((x) => x.role === r)!;
    const mastery = Math.round(comfort(dp, picks[r], r) * 200); // 0..200 comfort scale
    return prepTraitInput(state, p, { // + comms clarity, Contract-Year Player (management/traitEffects.ts)
      playerId: p.id, name: p.handle, role: r, championId: picks[r], image: p.imageUrl,
      mech: e.mechanics, lane: e.laning, farm: e.farming, tf: e.teamfight, macro: e.macro, vision: e.vision, pathing: e.pathing, obj: e.objectives,
      aggression: clamp(e.aggression + (team.tactics.aggression - 50) * 0.3, 1, 99), consistency: e.consistency, clutch: e.clutch, shotcalling: e.shotcalling,
      mastery, farsight: p.hidden.farsight, mistakes: p.hidden.mistakes, composure: clamp(p.hidden.composure + (staffBonus(state, team).motivation - 50) * 0.15 + team.facilities.wellness, 1, 99), snowball: p.hidden.snowball, resilience: p.hidden.resilience, traits: p.traits,
    });
  });
  return { teamId: team.id, name: team.name, short: team.short, color: team.colors[0], logo: team.logo, players, tactics: team.tactics, chemistry: team.chemistry, coachDraft: dt.drafting };
}
