// What the Vietnamese chat knows about the world around the match (chatMoments.ts): read once per game from the
// save. The clubs chat "sells" a standout player to, who is on an expiring contract, each player's former club, who
// left each team lately, today's other results and tomorrow's fixtures, the stakes (a final, the prize, a title
// defence), who the arena crowd is for, and what time it is in Vietnam (late-night series → "cho anh Lu đi ngủ").
import type { GameState, MatchFixture, Team } from '../../engine/types';
import type { MatchSim } from '../../engine/sim/engine';
import { addDays } from '../../engine/season/formats';
import { isFinalFixture } from '../../engine/management/legacy';
import { hashString } from '../../util/rng';
import type { Ctx } from '../../engine/management/fans';
import { VENUE_CITY } from './chatViLore';

export interface ChatWorld {
  /** template keys: {meal} {daypart} {vnhour} {year} {year1} {cup} {prize} {vnclub} */
  ctx: Ctx;
  vnHour: number;
  late: boolean;
  /** big clubs for the auction ("T1 Raptor", "GAM Raptor"), best known first; never the two on stage */
  clubs: string[];
  vnClub: string | null;
  /** the side of a Vietnamese team, when exactly one is on stage (the caster's "neutral" channel) */
  vnSide: 0 | 1 | null;
  crowd: { side: 0 | 1 | null; region: string; city: string };
  contractYear: string[];
  prevTeam: Record<string, string>;
  exPlayers: [string[], string[]];
  results: string[];
  next: { label: string; when: string }[];
  final: boolean;
  cup: string | null;
  prize: string | null;
  /** consecutive editions of this competition each side has already won (title defence: "vua {cup}", b2b) */
  king: [number, number];
  incident: { player: string; champ: string }[];
}

const REGION_HOUR: Record<string, number> = { KR: 15, CN: 16, APAC: 16, VN: 17, EMEA: 0, NA: 5, BR: 23 };
const dayPart = (h: number) => (h >= 5 && h <= 10 ? 'sáng' : h <= 13 && h > 10 ? 'trưa' : h >= 14 && h <= 17 ? 'chiều' : h >= 18 && h <= 21 ? 'tối' : 'đêm');
const MEAL: Record<string, string> = { sáng: 'bánh mì', trưa: 'cơm trưa', chiều: 'bánh tráng trộn', tối: 'cơm tối', đêm: 'mì tôm' };
const isVN = (t?: Team) => !!t && (t.country === 'Vietnam' || t.leagueId === 'VCS');
const regionKey = (t: Team) => (isVN(t) ? 'VN' : t.region);
const fame = (t: Team) => t.prestige * 2 + Math.log10(Math.max(10, t.fans)) * 12;
const cupName = (name: string) => name.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();

export function chatWorld(state: GameState | null, f: MatchFixture | undefined, teams: [Team, Team], sim: MatchSim): ChatWorld {
  const empty: ChatWorld = {
    ctx: { meal: 'bữa sáng', daypart: 'sáng', vnhour: 9 }, vnHour: 9, late: false, clubs: [], vnClub: null, vnSide: null,
    crowd: { side: null, region: 'other', city: 'Seoul' }, contractYear: [], prevTeam: {}, exPlayers: [[], []], results: [], next: [],
    final: false, cup: null, prize: null, king: [0, 0], incident: [],
  };
  if (!state) return empty;
  const comp = f ? state.competitions[f.competitionId] : undefined;
  const onStage = new Set(teams.map((t) => t.id));
  // when it is in Vietnam: the league's usual slot, an international event by where it is held
  const region = comp?.leagueId === 'VCS' ? 'VN' : comp?.region && comp.region !== 'INTL' ? comp.region : null;
  const intlHost = ['KR', 'CN', 'EMEA', 'NA'][hashString((comp?.id ?? 'x') + ':host') % 4];
  const host = region ?? (comp ? intlHost : regionKey(teams[0]));
  const vnHour = REGION_HOUR[host] ?? 16;
  const part = dayPart(vnHour);
  // the clubs a star gets sold to: the big names of the major leagues, plus the best-known Vietnamese club
  const all = Object.values(state.teams).filter((t) => !onStage.has(t.id) && !t.parentTeamId);
  const majors = all.filter((t) => ['LCK', 'LPL', 'LEC', 'LCS'].includes(t.leagueId) || t.region === 'KR' || t.region === 'CN').sort((a, b) => fame(b) - fame(a)).slice(0, 9);
  const vns = all.filter(isVN).sort((a, b) => fame(b) - fame(a)).slice(0, 2).map((t) => t.short);
  const vnClub = vns[0] ?? null;
  const clubs = [...new Set([...vns, ...majors.map((t) => t.short)])];
  const vnSides = ([0, 1] as const).filter((s) => isVN(teams[s]));
  // the arena: a home crowd, or the clearly more popular team
  const favBy = (ratio: number): 0 | 1 | null => (teams[0].fans >= teams[1].fans * ratio ? 0 : teams[1].fans >= teams[0].fans * ratio ? 1 : null);
  let crowdSide: 0 | 1 | null = null;
  if (region) {
    const home = ([0, 1] as const).filter((s) => regionKey(teams[s]) === region || teams[s].region === region);
    crowdSide = home.length === 1 ? home[0] : favBy(1.4);
  } else crowdSide = favBy(1.6);
  const crowdRegion = crowdSide === null ? 'other' : regionKey(teams[crowdSide]);
  // players: expiring deals, former clubs
  const soon = addDays(state.date, 150);
  const contractYear: string[] = [];
  const prevTeam: Record<string, string> = {};
  for (const c of sim.champs) {
    const p = state.players[c.input.playerId];
    if (!p) continue;
    if (p.contract && p.contract.expires <= soon) contractYear.push(c.input.name);
    const prev = [...p.career].sort((a, b) => b.season - a.season).find((x) => x.teamId && x.teamId !== p.teamId);
    if (prev) prevTeam[c.input.name] = state.teams[prev.teamId]?.short ?? prev.teamName;
  }
  // who left each club in the last year (famous ones first)
  const left: [{ h: string; rep: number }[], { h: string; rep: number }[]] = [[], []];
  for (const p of Object.values(state.players)) {
    if (p.retired || p.reputation < 60) continue;
    for (const s of [0, 1] as const) {
      const id = teams[s].id;
      if (p.teamId !== id && p.career.some((x) => x.teamId === id && x.season >= state.season - 1)) left[s].push({ h: p.handle, rep: p.reputation });
    }
  }
  const exPlayers = left.map((l) => l.sort((a, b) => b.rep - a.rep).slice(0, 2).map((x) => x.h)) as [string[], string[]];
  // today's other results, and what's next
  const results: string[] = [], next: { label: string; when: string }[] = [];
  const tomorrow = addDays(state.date, 1);
  const name = (id: string | null) => (id ? state.teams[id]?.short : undefined);
  const interest = (x: MatchFixture) => [x.teamA, x.teamB].reduce((s, id) => s + (id && state.teams[id] ? fame(state.teams[id]) + (isVN(state.teams[id]) ? 40 : 0) + (id === state.userTeamId ? 80 : 0) : 0), 0);
  const fx = Object.values(state.fixtures).filter((x) => x.id !== f?.id && (x.date === state.date || x.date === tomorrow) && x.teamA && x.teamB).sort((a, b) => interest(b) - interest(a));
  for (const x of fx) {
    const a = name(x.teamA), b = name(x.teamB);
    if (!a || !b) continue;
    if (x.result && x.date === state.date && results.length < 4) results.push(`${a} ${x.result.scoreA}-${x.result.scoreB} ${b}`);
    else if (!x.result && next.length < 3) next.push({ label: `${a} vs ${b}`, when: x.date === state.date ? 'tối nay' : 'mai' });
  }
  // the stakes
  const final = !!f && isFinalFixture(state, f);
  const cup = comp ? cupName(comp.name) : null;
  const prizeUsd = comp ? comp.prizePool * (comp.prizeSplit?.[0] ?? 0) : 0;
  const prize = prizeUsd >= 1000 ? (prizeUsd >= 1e6 ? `${(prizeUsd / 1e6).toFixed(1).replace(/\.0$/, '')} triệu đô` : `${Math.round(prizeUsd / 1000)}k đô`) : null;
  const king: [number, number] = [0, 0];
  if (comp && cup) for (const s of [0, 1] as const) {
    let n = 0;
    while (teams[s].titles.some((x) => x.season === comp.season - 1 - n && cupName(x.competition) === cup)) n++;
    king[s] = n;
  }
  // a famous bad game earlier this season (our analysed games): "{player} {champ} incident"
  const incident: { player: string; champ: string }[] = [];
  const ids = new Map(sim.champs.map((c) => [c.input.playerId, c.input.name]));
  for (const r of state.analysis?.reports ?? []) {
    r.a.players.forEach((ap, i) => {
      const handle = ids.get(r.playerIds[i]);
      if (handle && ap.d >= 7 && !incident.some((x) => x.player === handle)) incident.push({ player: handle, champ: ap.champ });
    });
  }
  return {
    ctx: { meal: MEAL[part], daypart: part, vnhour: vnHour, year: state.season, year1: state.season + 1, cup: cup ?? undefined, prize: prize ?? undefined, vnclub: vnClub ?? undefined },
    vnHour, late: vnHour >= 22 || vnHour <= 4, clubs, vnClub, vnSide: vnSides.length === 1 ? vnSides[0] : null,
    crowd: { side: crowdSide, region: crowdRegion, city: VENUE_CITY[host] ?? 'Seoul' },
    contractYear, prevTeam, exPlayers, results, next, final, cup, prize, king, incident: incident.slice(0, 3),
  };
}
