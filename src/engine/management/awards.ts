// Awards: Finals MVP for playoff / international winners, Season MVP and All-Pro teams for
// tier-1 leagues at the end of their final playoffs.
import type { GameState, Competition, Player, Role } from '../types';
import { ROLES, ROLE_LABEL } from '../types';
import { addNews, addInbox } from './news';
import { overall } from '../setup';
import { mvpScore } from '../sim/mvp';

/** Season-long performance from accumulated season stats (background fixtures keep no player lines). */
function seasonPerformance(p: Player) {
  const s = p.season;
  if (!s.games) return { games: 0, score: 0 };
  const per10 = Math.max(1, s.minutes / 10);
  return { games: s.games, score: (s.kills * 3 + s.assists * 1.5 - s.deaths * 2) / per10 + (s.wins / s.games) * 10 + (s.mvps / s.games) * 15 + (s.cs / Math.max(1, s.minutes)) * 0.3 };
}

/** Performance score of a player within a set of fixtures (KDA, kill participation proxy, wins, MVPs). */
function performance(state: GameState, fixtureIds: string[], playerId: string) {
  const fromSeason = () => seasonPerformance(state.players[playerId]);
  let games = 0, score = 0;
  for (const id of fixtureIds) {
    const f = state.fixtures[id];
    for (const g of f?.result?.games ?? []) {
      const line = g.players?.find((l) => l.playerId === playerId);
      if (!line) continue;
      games++;
      const mins = g.duration / 60 || 30;
      // judged against the role's norms (same scoring as Player of the Game)
      const ml = (l: typeof line) => ({ role: l.role, k: l.k, d: l.d, a: l.a, damage: l.damage, gold: l.gold, vision: l.vision });
      const team = (g.players ?? []).filter((l) => l.teamId === line.teamId).map(ml);
      const opp = (g.players ?? []).find((l) => l.teamId !== line.teamId && l.role === line.role);
      score += mvpScore(ml(line), team, opp ? ml(opp) : undefined, mins, true) * 4 + (g.winner === line.teamId ? 2 : 0) + (g.mvp === playerId ? 3 : 0);
    }
  }
  return games ? { games, score: score / games } : fromSeason();
}

export function competitionAwards(state: GameState, comp: Competition) {
  const fixtureIds = comp.stages.flatMap((s) => s.fixtures);
  if (!comp.winner) return;
  const champion = state.teams[comp.winner];
  // Finals MVP: best player on the champion in the last stage
  const lastStage = comp.stages[comp.stages.length - 1];
  const champs = (champion?.roster ?? []).map((id) => state.players[id]).filter(Boolean) as Player[];
  // Finals MVP: most Player-of-the-Game awards in the final stage (those are judged per role), then performance
  const gameMvps: Record<string, number> = {};
  for (const id of lastStage?.fixtures ?? []) for (const g of state.fixtures[id]?.result?.games ?? []) if (g.mvp) gameMvps[g.mvp] = (gameMvps[g.mvp] ?? 0) + 1;
  // tie-break on performance relative to the role's typical score (raw KDA would always pick a carry)
  const roleStat: Record<string, { mean: number; sd: number }> = {};
  for (const r of ROLES) {
    const xs = Object.values(state.players).filter((x) => x.role === r && x.season.games >= 5).map((x) => seasonPerformance(x).score);
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    roleStat[r] = { mean, sd: Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length)) || 1 };
  }
  let best: Player | null = null, bs = -Infinity;
  for (const p of champs) {
    const perf = performance(state, lastStage?.fixtures ?? [], p.id);
    const sc = (gameMvps[p.id] ?? 0) * 100 + (perf.score - roleStat[p.role].mean) / roleStat[p.role].sd;
    if ((perf.games || gameMvps[p.id]) && sc > bs) { bs = sc; best = p; }
  }
  if (best && (comp.kind !== 'league')) {
    best.reputation = Math.min(100, best.reputation + (comp.tier === 0 ? 5 : 2));
    best.morale = Math.min(100, best.morale + 6);
    const label = comp.tags?.includes("worlds") ? "Worlds Finals MVP" : `${comp.name.replace(" " + comp.season, "")} Finals MVP`;
    record(state, comp.season, label, best.id);
    if (comp.tier <= 1 || best.teamId === state.userTeamId) addNews(state, { headline: `${best.handle} named ${label}`, body: `${best.handle} (${champion?.name}) is the Finals MVP of the ${comp.name}.`, tags: ['award'], playerIds: [best.id], teamIds: comp.winner ? [comp.winner] : [] });
  }
  // Season awards for tier-1 leagues after their final playoffs of the year
  if (comp.tier === 1 && comp.kind === 'playoffs' && comp.tags?.includes('finals') && comp.leagueId) {
    const leagueComps = Object.values(state.competitions).filter((c) => c.season === comp.season && c.leagueId === comp.leagueId);
    const allFx = leagueComps.flatMap((c) => c.stages.flatMap((s) => s.fixtures));
    const leagueTeams = new Set(Object.values(state.teams).filter((t) => t.leagueId === comp.leagueId).map((t) => t.id));
    const candidates = Object.values(state.players).filter((p) => p.teamId && leagueTeams.has(p.teamId));
    void allFx;
    const scored = candidates.map((p) => ({ p, ...seasonPerformance(p) })).filter((x) => x.games >= 8);
    const allPro: Record<Role, string> = {} as Record<Role, string>;
    for (const r of ROLES) {
      const top = scored.filter((x) => x.p.role === r).sort((a, b) => b.score + overall(b.p.attributes, r) / 20 - (a.score + overall(a.p.attributes, r) / 20))[0];
      if (top) { allPro[r] = top.p.id; top.p.reputation = Math.min(100, top.p.reputation + 2); }
    }
    // Season MVP: the biggest standout relative to the other players in the same role (raw KDA
    // would hand it to a carry every year), with a nudge for the team's success
    const byRole: Record<string, { mean: number; sd: number }> = {};
    for (const r of ROLES) {
      const xs = scored.filter((x) => x.p.role === r).map((x) => x.score);
      const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      byRole[r] = { mean, sd: Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length)) || 1 };
    }
    const standout = (x: (typeof scored)[number]) => (x.score - byRole[x.p.role].mean) / byRole[x.p.role].sd + (x.p.season.wins / Math.max(1, x.p.season.games) - 0.5) * 1.5;
    const mvp = [...scored].sort((a, b) => standout(b) - standout(a))[0];
    if (mvp) {
      record(state, comp.season, `${state.leagues[comp.leagueId]?.name} Season MVP`, mvp.p.id);
      mvp.p.reputation = Math.min(100, mvp.p.reputation + 4);
    }
    for (const r of ROLES) if (allPro[r]) record(state, comp.season, `${state.leagues[comp.leagueId]?.name} All-Pro ${ROLE_LABEL[r]}`, allPro[r]);
    const names = ROLES.map((r) => (allPro[r] ? `${ROLE_LABEL[r]}: ${state.players[allPro[r]].handle}` : '')).filter(Boolean).join(' · ');
    addNews(state, { headline: `${state.leagues[comp.leagueId]?.name} ${comp.season} awards`, body: `Season MVP: ${mvp ? mvp.p.handle : '—'}. All-Pro team — ${names}.`, tags: ['award'], playerIds: Object.values(allPro) });
    const mine = Object.values(allPro).filter((id) => state.players[id]?.teamId === state.userTeamId);
    if (mine.length) addInbox(state, { from: 'League office', subject: `${mine.length} of your players made the All-Pro team`, body: mine.map((id) => state.players[id].handle).join(', ') + ' were named to the All-Pro team.', kind: 'info' });
  }
}

function record(state: GameState, season: number, award: string, playerId: string) {
  let h = state.history.find((x) => x.season === season);
  if (!h) { h = { season, champions: {}, awards: {} }; state.history.push(h); }
  h.awards[award] = playerId;
  const p = state.players[playerId];
  if (p) {
    const car = p.career.find((c) => c.season === season && c.teamId === p.teamId);
    if (car && !car.titles.includes(award)) car.titles.push(award);
  }
}
