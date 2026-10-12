// Season lifecycle: create competitions for a year, start them (resolve seeds), advance
// stages as results come in, and finish them (placements, prizes, qualification, titles).
import type { GameState, Competition, Team } from '../types';
import { RNG } from '../../util/rng';
import { seasonTemplates, INTL_SLOTS, type CompTemplate } from './calendar';
import { buildStage, stageComplete, stageResults, nextSwissRound, standings, type StageSpec } from './formats';
import { addNews, addInbox } from '../management/news';
import { competitionAwards } from '../management/awards';
import { addLedger } from '../management/finance';
import { checkSponsorBonuses } from '../management/sponsors';
import { breakthrough } from '../management/potential';

type CompExt = Competition & { specs?: StageSpec[]; qualifiesTo?: CompTemplate['qualifies']; direct?: Record<string, string[]>; template?: string; countsPoints?: boolean };

const ORDER = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'];

export function compKey(year: number, templateId: string) { return `${year}-${templateId}`; }

export function createSeason(state: GameState, year: number) {
  const leagueIds = Object.keys(state.leagues);
  const names: Record<string, string> = {};
  for (const l of Object.values(state.leagues)) names[l.id] = l.name;
  for (const tpl of seasonTemplates(leagueIds, names)) {
    const id = compKey(year, tpl.id);
    const fix = (mmdd: string) => `${year}-${mmdd}`;
    const comp: CompExt = {
      id, name: `${tpl.name} ${year}`, short: tpl.short, season: year, kind: tpl.kind, leagueId: tpl.league, tier: tpl.tier,
      region: (tpl.region ?? (tpl.league ? state.leagues[tpl.league]?.region : 'INTL')) as Competition['region'],
      startDate: fix(tpl.start), endDate: fix(tpl.end), stages: [], teams: [], status: 'upcoming', prizePool: tpl.prizePool,
      prizeSplit: tpl.prizeSplit ?? defaultSplit(), tags: tpl.tags, seedRule: tpl.seedRule,
      specs: tpl.stages.map((s) => ({ ...s, start: fix(s.start), end: fix(s.end) })), qualifiesTo: tpl.qualifies, template: tpl.id, countsPoints: tpl.points,
    };
    state.competitions[id] = comp;
  }
  state.qualified = {};
}

function defaultSplit() { return [0.35, 0.2, 0.12, 0.12, 0.06, 0.06, 0.045, 0.045]; }

/** Called every day: start competitions, progress stages, finish competitions. */
export function updateCompetitions(state: GameState, rng: RNG) {
  for (const c of Object.values(state.competitions) as CompExt[]) {
    if (c.status === 'upcoming' && c.startDate <= state.date) startCompetition(state, c, rng);
    if (c.status === 'active') progressCompetition(state, c, rng);
  }
}

export function startCompetition(state: GameState, comp: CompExt, rng: RNG) {
  const { teams, direct } = resolveSeeds(state, comp, rng);
  comp.status = 'active';
  comp.teams = [...new Set([...teams, ...Object.values(direct ?? {}).flat()])];
  comp.direct = direct;
  if (teams.length < 2 && !(direct && Object.keys(direct).length)) { comp.status = 'done'; return; }
  const spec = comp.specs![0];
  addStage(state, comp, spec, teams, rng);
  if (comp.tier <= 1 && comp.kind !== 'league') {
    addNews(state, { headline: `${comp.name} begins`, body: `${comp.teams.length} teams compete in the ${comp.name}.`, tags: ['competition'], teamIds: comp.teams });
  }
}

function addStage(state: GameState, comp: CompExt, spec: StageSpec, teams: string[], rng: RNG) {
  const { stage, fixtures } = buildStage(comp, spec, teams, rng);
  stage.status = 'active';
  comp.stages.push(stage);
  for (const f of fixtures) state.fixtures[f.id] = f;
}

/** Resolve fixtures whose empty slot can never be filled (odd brackets): the present team advances. */
function resolveByes(state: GameState, stageFixtures: string[]) {
  let changed = true;
  while (changed) {
    changed = false;
    const fx = stageFixtures.map((id) => state.fixtures[id]);
    const pendingTargets = new Set<string>();
    for (const f of fx) if (!f.result) { if (f.feeds?.winnerTo) pendingTargets.add(f.feeds.winnerTo.join('|')); if (f.feeds?.loserTo) pendingTargets.add(f.feeds.loserTo.join('|')); }
    for (const f of fx) {
      if (f.result) continue;
      const aOpen = !f.teamA && pendingTargets.has(`${f.id}|A`), bOpen = !f.teamB && pendingTargets.has(`${f.id}|B`);
      if (aOpen || bOpen) continue;
      if (f.teamA && f.teamB) continue;
      const w = f.teamA ?? f.teamB;
      f.result = { winner: w ?? '', loser: '', scoreA: 0, scoreB: 0, games: [] };
      f.label = (f.label ?? '') + ' (bye)';
      if (w && f.feeds?.winnerTo) { const n = state.fixtures[f.feeds.winnerTo[0]]; if (n) { if (f.feeds.winnerTo[1] === 'A') n.teamA = w; else n.teamB = w; } }
      changed = true;
    }
  }
}

function progressCompetition(state: GameState, comp: CompExt, rng: RNG) {
  const stage = comp.stages[comp.stages.length - 1];
  if (!stage) return;
  if (stage.format === 'singleElim' || stage.format === 'doubleElim' || stage.format === 'gsl') resolveByes(state, stage.fixtures);
  if (stage.format === 'swiss' && !stageComplete(stage, state.fixtures)) {
    const pending = stage.fixtures.some((id) => !state.fixtures[id].result);
    if (!pending) {
      const next = nextSwissRound(comp, stage, state.fixtures, rng);
      for (const f of next) { state.fixtures[f.id] = f; stage.fixtures.push(f.id); }
    }
    return;
  }
  if (!stageComplete(stage, state.fixtures)) return;
  stage.status = 'done';
  stage.results = stageResults(stage, state.fixtures);
  const idx = comp.specs!.findIndex((s) => s.id === stage.id);
  const nextSpec = comp.specs![idx + 1];
  if (nextSpec) {
    const advance = (nextSpec as StageSpec & { advance?: number }).advance ?? stage.advance;
    let adv = stage.results;
    if (stage.format === 'swiss') adv = adv.slice(0, 8);
    else if (stage.format === 'gsl') adv = adv.slice(0, advance ?? Object.keys(stage.groups ?? {}).length * 2);
    else if (stage.format === 'doubleElim' || stage.format === 'singleElim') adv = adv.slice(0, advance ?? 1);
    else adv = adv.slice(0, advance ?? adv.length);
    const direct = comp.direct?.[nextSpec.id] ?? [];
    let teams = [...direct, ...adv];
    if (nextSpec.format === 'singleElim' && stage.format === 'gsl') teams = gslToBracket(adv);
    if (nextSpec.format === 'swiss') teams = swissSeeds(direct, adv);
    addStage(state, comp, nextSpec, teams, rng);
    return;
  }
  finishCompetition(state, comp);
}

/** Pair group winners with runners-up from other groups. */
function gslToBracket(results: string[]): string[] {
  const n = results.length / 2;
  const firsts = results.slice(0, n), seconds = results.slice(n);
  // bracket seed order expects 1..N; put group winners as top seeds, runners-up reversed
  return [...firsts, ...seconds.reverse()];
}
function swissSeeds(direct: string[], adv: string[]): string[] {
  const all = [...direct, ...adv];
  return all;
}

export function finishCompetition(state: GameState, comp: CompExt) {
  comp.status = 'done';
  // placements: last stage results first, then earlier-stage eliminations in order
  const order: string[] = [];
  for (let i = comp.stages.length - 1; i >= 0; i--) for (const t of comp.stages[i].results ?? stageResults(comp.stages[i], state.fixtures)) if (!order.includes(t)) order.push(t);
  for (const t of comp.teams) if (!order.includes(t)) order.push(t);
  comp.placements = {};
  order.forEach((t, i) => (comp.placements![t] = i + 1));
  comp.winner = order[0];
  // prizes
  if (comp.prizePool > 0) {
    order.forEach((t, i) => {
      const share = comp.prizeSplit[i] ?? 0;
      const team = state.teams[t];
      if (!team || share <= 0) return;
      const amount = Math.round(comp.prizePool * share);
      addLedger(state, team, 'Prize money', amount, comp.name);
    });
  }
  // qualification
  for (const q of comp.qualifiesTo ?? []) {
    const from = q.from ?? 0;
    const league = comp.leagueId ?? '';
    const list = (state.qualified[q.event] ??= []);
    order.slice(from, from + q.count).forEach((t, i) => { if (!list.some((x) => x.teamId === t)) list.push({ teamId: t, league, seed: list.filter((x) => x.league === league).length + 1 + i * 0 }); });
  }
  competitionAwards(state, comp);
  for (const t of comp.teams) { const tm = state.teams[t]; if (tm?.sponsors.some((sp) => sp.bonus && !sp.bonus.achieved)) checkSponsorBonuses(state, tm, comp, order); }
  // history & titles
  order.forEach((t, i) => {
    const team = state.teams[t];
    if (!team) return;
    team.history.push({ season: comp.season, competition: comp.name, placement: i + 1, label: placementLabel(i + 1, comp) });
  });
  const champion = state.teams[order[0]];
  if (champion && comp.kind !== 'league') {
    champion.titles.push({ season: comp.season, competition: comp.name });
    champion.hype = Math.min(100, champion.hype + (comp.tier === 0 ? 30 : 15));
    champion.fans = Math.round(champion.fans * (comp.tier === 0 ? (comp.tags?.includes('worlds') ? 1.35 : 1.15) : 1.06));
    for (const pid of champion.roster) {
      const p = state.players[pid];
      if (!p) continue;
      p.morale = Math.min(100, p.morale + 10);
      p.reputation = Math.min(100, p.reputation + (comp.tier === 0 ? 6 : 2));
      breakthrough(p, comp.tier === 0 ? 4 : comp.tier === 1 ? 2.5 : 1.5); // champions who were at their ceiling find a bit more
      const car = p.career.find((c) => c.season === comp.season && c.teamId === champion.id);
      if (car) car.titles.push(comp.name);
    }
    if (comp.tier <= 1 || champion.id === state.userTeamId) {
      addNews(state, { headline: `${champion.name} win the ${comp.name}!`, body: `${champion.name} are champions of the ${comp.name}.`, tags: ['title'], teamIds: [champion.id] });
    }
  }
  const user = state.userTeamId;
  if (comp.placements[user]) {
    addInbox(state, { from: 'Competition office', subject: `${comp.name}: finished #${comp.placements[user]}`, body: `Your team finished ${placementLabel(comp.placements[user], comp)} in the ${comp.name}.`, kind: 'match' });
  }
  // promotion tournaments
  if (comp.seedRule?.startsWith('promotion:')) {
    const [, league] = comp.seedRule.split(':');
    const winner = order[0];
    const wTeam = state.teams[winner];
    if (wTeam && wTeam.leagueId !== league) {
      const relegated = comp.teams.find((t) => state.teams[t]?.leagueId === league);
      (state as GameState & { promotions?: { promote: string; relegate?: string; league: string }[] }).promotions ??= [];
      (state as GameState & { promotions?: { promote: string; relegate?: string; league: string }[] }).promotions!.push({ promote: winner, relegate: relegated, league });
      addNews(state, { headline: `${wTeam.name} earn promotion to the ${league}!`, body: `${wTeam.name} will compete in the ${league} next season.`, tags: ['promotion'], teamIds: [winner] });
      if (winner === state.userTeamId) addInbox(state, { from: 'The Board', subject: `Promoted to the ${state.leagues[league]?.name ?? league}!`, body: `Incredible work. We won the ${comp.name} and will play in the ${state.leagues[league]?.name ?? league} from next season — bigger revenue share, sponsors and fans await.`, kind: 'board' });
      if (relegated === state.userTeamId) addInbox(state, { from: 'The Board', subject: 'Relegated', body: `We lost our place in the ${state.leagues[league]?.name ?? league}. We will play in the ${state.leagues[wTeam.leagueId]?.name ?? 'regional league'} next season.`, kind: 'board' });
    }
  }
}

export function placementLabel(p: number, comp: Competition) {
  if (comp.kind === 'league') return `${p}${p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th'} (regular season)`;
  return p === 1 ? 'Champion' : p === 2 ? 'Runner-up' : p <= 4 ? 'Top 4' : p <= 8 ? 'Top 8' : p <= 16 ? 'Top 16' : `${p}th`;
}

// ------------------------------------------------------------------ seeding
function leagueTeams(state: GameState, league: string) {
  return Object.values(state.teams).filter((t) => t.leagueId === league).map((t) => t.id);
}
function teamStrength(state: GameState, t: Team) {
  const ps = Object.values(t.lineup).map((id) => (id ? state.players[id] : null)).filter(Boolean);
  if (!ps.length) return 30;
  return ps.reduce((s, p) => s + (p!.attributes.mechanics + p!.attributes.laning + p!.attributes.teamfight + p!.attributes.macro) / 4, 0) / ps.length;
}
export function rankByStrength(state: GameState, ids: string[]) {
  return [...ids].sort((a, b) => teamStrength(state, state.teams[b]) - teamStrength(state, state.teams[a]));
}
function compOf(state: GameState, comp: Competition, templateId: string) {
  return state.competitions[compKey(comp.season, templateId)];
}
function placementsOf(c: Competition | undefined): string[] | null {
  if (!c?.placements) return null;
  return Object.entries(c.placements).sort((a, b) => a[1] - b[1]).map(([t]) => t);
}

/** Avoid same-region teams in the same group (snake into groups, then flatten round-robin). */
function spreadGroups(teams: string[], groups: number, regionOf: (t: string) => string): string[] {
  const buckets: string[][] = Array.from({ length: groups }, () => []);
  const per = Math.ceil(teams.length / groups);
  for (const t of teams) {
    const r = regionOf(t);
    let bi = buckets.findIndex((b) => b.length < per && !b.some((x) => regionOf(x) === r));
    if (bi < 0) bi = buckets.findIndex((b) => b.length < per);
    buckets[bi].push(t);
  }
  const out: string[] = [];
  for (let i = 0; i < per; i++) for (const b of buckets) if (b[i]) out.push(b[i]);
  return out;
}

export function resolveSeeds(state: GameState, comp: CompExt, rng: RNG): { teams: string[]; direct?: Record<string, string[]> } {
  const rule = comp.seedRule ?? '';
  const [kind, a, b, c] = rule.split(':');
  const regionOf = (t: string) => state.teams[t]?.leagueId ?? '';
  switch (kind) {
    case 'league': return { teams: rankByStrength(state, leagueTeams(state, a)) };
    case 'top': {
      const src = placementsOf(compOf(state, comp, a));
      const n = Number(b);
      if (src) return { teams: src.slice(0, n) };
      const league = a.split('-')[0];
      return { teams: rankByStrength(state, leagueTeams(state, league)).slice(0, n) };
    }
    case 'combined': {
      const [x, y] = a.split('+');
      const wins: Record<string, number> = {};
      for (const id of [x, y]) {
        const cc = compOf(state, comp, id);
        if (!cc) continue;
        for (const st of cc.stages) for (const r of standings(st, state.fixtures)) wins[r.teamId] = (wins[r.teamId] ?? 0) + r.w * 100 + (r.gw - r.gl);
      }
      const ids = Object.keys(wins).length ? Object.keys(wins).sort((p, q) => wins[q] - wins[p]) : rankByStrength(state, leagueTeams(state, x.split('-')[0]));
      return { teams: ids.slice(0, Number(b)) };
    }
    case 'placements': {
      const src = placementsOf(compOf(state, comp, a)) ?? [];
      const from = Number(b) - 1, count = Number(c);
      return { teams: src.slice(from, from + count) };
    }
    case 'promotion': {
      const league = a;
      const feeders = b.split(',');
      const summer = Object.values(state.competitions).filter((x) => x.season === comp.season && x.leagueId === league && x.kind === 'league').pop();
      let bottom: string | undefined;
      if (summer?.placements) bottom = Object.entries(summer.placements).sort((p, q) => q[1] - p[1])[0]?.[0];
      if (!bottom) bottom = rankByStrength(state, leagueTeams(state, league)).pop();
      const challengers: string[] = [];
      // academy teams can't be promoted into the league their main team already plays in
      const inLeague = leagueTeams(state, league);
      const eligible = (t: string) => !inLeague.some((x) => sameOrg(state, x, t));
      for (const f of feeders) {
        const po = Object.values(state.competitions).filter((x) => x.season === comp.season && x.leagueId === f && x.kind === 'playoffs' && x.placements).pop();
        const top = (placementsOf(po) ?? rankByStrength(state, leagueTeams(state, f))).filter(eligible);
        for (const t of top.slice(0, feeders.length === 1 ? 3 : 1)) challengers.push(t);
      }
      return { teams: [bottom!, ...challengers].filter(Boolean).slice(0, 4) };
    }
    case 'kespa': {
      const lck = rankByStrength(state, leagueTeams(state, 'LCK'));
      const cl = rankByStrength(state, leagueTeams(state, 'LCKCL')).slice(0, 6);
      return { teams: spreadGroups([...lck, ...cl], 4, (t) => (state.teams[t].leagueId === 'LCK' ? 'A' : 'B') + (lck.indexOf(t) < 4 && lck.indexOf(t) >= 0 ? 'top' : '')) };
    }
    case 'intl': {
      const event = a;
      const q = (ev: string) => state.qualified[ev] ?? [];
      const fill = (ev: string, slots: Record<string, number>) => {
        const out: { teamId: string; league: string; seed: number }[] = [];
        for (const l of ORDER) {
          const n = slots[l] ?? 0;
          const got = q(ev).filter((x) => x.league === l).map((x) => x.teamId);
          const extra = rankByStrength(state, leagueTeams(state, l)).filter((t) => !got.includes(t) && !q('WORLDS').some((x) => x.teamId === t) && !out.some((o) => o.teamId === t));
          const list = [...got, ...extra].slice(0, n);
          list.forEach((t, i) => out.push({ teamId: t, league: l, seed: i + 1 }));
        }
        return out;
      };
      if (event === 'FST') {
        const list = fill('FST', INTL_SLOTS.FST);
        const firsts = list.filter((x) => x.seed === 1).map((x) => x.teamId), rest = list.filter((x) => x.seed > 1).map((x) => x.teamId);
        return { teams: spreadGroups([...firsts, ...rest], 2, regionOf) };
      }
      if (event === 'MSI') {
        const list = fill('MSI', INTL_SLOTS.MSI);
        const isDirect = (x: { league: string; seed: number }) => x.league !== 'CBLOL' && (x.seed === 1 || ((x.league === 'LCK' || x.league === 'LPL') && x.seed === 2));
        const direct = list.filter(isDirect).sort((x, y) => x.seed - y.seed).map((x) => x.teamId);
        const pi = list.filter((x) => !isDirect(x)).map((x) => x.teamId);
        return { teams: pi, direct: { br: direct } };
      }
      if (event === 'WORLDS') {
        const list = fill('WORLDS', INTL_SLOTS.WORLDS);
        const pi = fill('WORLDS-PI', INTL_SLOTS['WORLDS-PI']).map((x) => x.teamId).filter((t) => !list.some((x) => x.teamId === t));
        const ordered = [...list].sort((x, y) => x.seed - y.seed || ORDER.indexOf(x.league) - ORDER.indexOf(y.league)).map((x) => x.teamId);
        // swiss pools: top half vs bottom half by seed
        return { teams: pi.length >= 2 ? pi.slice(0, 2) : pi, direct: { swiss: ordered } };
      }
      if (event === 'EWC') {
        const champs: string[] = [];
        for (const id of ['LCK-rtm', 'LPL-s2-po', 'LEC-spring-po', 'LCS-spring-po', 'LCP-s2-po', 'CBLOL-s1-po']) {
          const w = compOf(state, comp, id)?.winner;
          if (w) champs.push(w);
        }
        const quotas: Record<string, number> = { LCK: 3, LPL: 3, LEC: 3, LCS: 2, LCP: 2, CBLOL: 2 };
        for (const l of ORDER) {
          const have = champs.filter((t) => state.teams[t]?.leagueId === l).length;
          for (const t of rankByStrength(state, leagueTeams(state, l))) {
            if (champs.length >= 16) break;
            if (champs.includes(t)) continue;
            if (champs.filter((x) => state.teams[x]?.leagueId === l).length >= Math.max(have, quotas[l])) break;
            champs.push(t);
          }
        }
        for (const t of rankByStrength(state, ORDER.flatMap((l) => leagueTeams(state, l)))) { if (champs.length >= 16) break; if (!champs.includes(t)) champs.push(t); }
        return { teams: spreadGroups(rankByStrength(state, champs).slice(0, 16), 4, regionOf) };
      }
      if (event === 'EM-spring' || event === 'EM-summer') {
        const got = q(event).map((x) => x.teamId);
        const erl = ['LFL', 'PRM', 'LES', 'TCL', 'NLC', 'RL', 'LIT', 'ROL', 'HLL', 'EBL', 'HM', 'LPLOL', 'AL'].filter((l) => state.leagues[l]);
        const teams = [...got];
        for (const l of erl) if (!teams.some((t) => state.teams[t]?.leagueId === l)) { const best = rankByStrength(state, leagueTeams(state, l))[0]; if (best) teams.push(best); }
        for (const l of ['LFL', 'PRM', 'LES']) { if (teams.length >= 16) break; const nxt = rankByStrength(state, leagueTeams(state, l)).find((t) => !teams.includes(t)); if (nxt) teams.push(nxt); }
        return { teams: spreadGroups(rankByStrength(state, teams).slice(0, 16), 4, regionOf) };
      }
      return { teams: [] };
    }
  }
  return { teams: [] };
}

export type { CompExt };

const AFFILIATE = /\s+(Academy|Youth|Challengers|Rookies)$/i;
/** Same organisation (main team ↔ academy): linked explicitly, or an "X Academy" next to "X …". */
export function sameOrg(state: GameState, a: string, b: string): boolean {
  const ta = state.teams[a], tb = state.teams[b];
  if (!ta || !tb || a === b) return false;
  if (ta.parentTeamId === b || tb.parentTeamId === a) return true;
  const root = (n: string) => n.replace(AFFILIATE, '').trim().toLowerCase();
  const ra = root(ta.name), rb = root(tb.name);
  if (ra === rb) return true;
  return (AFFILIATE.test(ta.name) && tb.name.toLowerCase().startsWith(ra + ' ')) || (AFFILIATE.test(tb.name) && ta.name.toLowerCase().startsWith(rb + ' '));
}
