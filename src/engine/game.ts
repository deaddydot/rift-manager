// Main game loop: advance one day at a time.
import type { GameState, MatchFixture, Team } from './types';
import { ensureMasteryScale } from './mastery';
import { ensureRatingScale } from './management/potential';
import { RNG, clamp } from '../util/rng';
import { updateCompetitions, createSeason, compKey } from './season/season';
import { simulateSeries } from './season/series';
import { weeklyFinance, monthlyFinance } from './management/finance';
import { ratingMilestones, weeklyTraining, yearlyAging } from './management/development';
import { generateSponsorOffers, checkSponsorBonuses } from './management/sponsors';
import { inTransferWindow, processExpiries, expiryReminders, aiTransfers, resolveOffers, incomingBids, generateProspects, movePlayer } from './management/transfers';
import { generateWindowFreeAgents } from './management/freeAgents';
import { addInbox, addNews } from './management/news';
import { listFranchiseSales, applyFranchiseMoves } from './management/franchise';
import { reactionsDaily } from './management/reactions';
import { peopleDaily } from './management/people';
import { personaDaily } from './management/personaTick';
import { addDays, weekday } from './season/formats';
import { overall } from './setup';

export function rngFor(state: GameState) {
  const r = new RNG(state.rngState);
  return { r, save: () => { state.rngState = r.state; } };
}

/** Fixtures to be played today (or overdue) with both teams known. */
export function todaysFixtures(state: GameState): MatchFixture[] {
  return Object.values(state.fixtures).filter((f) => !f.result && f.teamA && f.teamB && f.date <= state.date);
}
export const isUserFixture = (state: GameState, f: MatchFixture) => f.teamA === state.userTeamId || f.teamB === state.userTeamId;

export function nextUserFixture(state: GameState): MatchFixture | undefined {
  return Object.values(state.fixtures).filter((f) => !f.result && isUserFixture(state, f)).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/**
 * Process the current day: start competitions, play AI fixtures, stop at the user's match.
 * Returns the user's fixture if one must be played today.
 */
export function processDay(state: GameState): MatchFixture | null {
  const { r, save } = rngFor(state);
  updateCompetitions(state, r);
  let userMatch: MatchFixture | null = null;
  for (let pass = 0; pass < 6; pass++) {
    const today = todaysFixtures(state);
    if (!today.length) break;
    let played = 0;
    for (const f of today) {
      if (isUserFixture(state, f)) { userMatch = f; continue; }
      const full = state.settings.simDetail === 'all' || (state.settings.simDetail === 'tier1' && (state.competitions[f.competitionId]?.tier ?? 3) <= 1);
      simulateSeries(state, f, r, full);
      played++;
    }
    updateCompetitions(state, r);
    if (!played) break;
  }
  save();
  state.pendingMatch = userMatch?.id ?? null;
  return userMatch;
}

/** Move to the next day: periodic management updates. */
export function endDay(state: GameState) {
  const { r, save } = rngFor(state);
  const prev = state.date;
  state.date = addDays(state.date, 1);
  const d = state.date;
  const md = d.slice(5);
  // weekly (Mondays)
  if (weekday(d) === 1) {
    for (const team of Object.values(state.teams)) {
      weeklyFinance(state, team, r);
      weeklyTraining(state, team, r, team.id === state.userTeamId && state.trainingPlan ? state.trainingPlan : undefined);
    }
    ratingMilestones(state); // new rating bands reached (Elite 100+, Legendary 125+…)
    const user = state.teams[state.userTeamId];
    for (const o of generateSponsorOffers(state, user, r)) {
      state.sponsorOffers.push(o);
      addInbox(state, { from: o.name, subject: `Sponsorship offer: $${Math.round(o.monthly / 1000)}k/month`, body: `${o.name} (${o.category}) offers $${o.monthly.toLocaleString()} per month for ${o.months} months. "${o.pitch}"`, kind: 'sponsor', action: { type: 'sponsorOffer', payload: o.id, label: 'Review offer' } });
    }
    state.sponsorOffers = state.sponsorOffers.filter((o) => o.expires >= d);
    if (inTransferWindow(d)) { aiTransfers(state, r); incomingBids(state, r); }
    expiryReminders(state);
    boardWeekly(state);
    patchShift(state, r);
  }
  // monthly
  if (d.slice(8) === '01') { for (const team of Object.values(state.teams)) monthlyFinance(state, team); checkSponsorBonuses(state, state.teams[state.userTeamId], null); }
  // transfer window notices
  const wasOpen = inTransferWindow(prev), open = inTransferWindow(d);
  if (wasOpen !== open) {
    state.transferWindowOpen = open;
    addInbox(state, { from: 'League office', subject: open ? 'Transfer window is open' : 'Transfer window has closed', body: open ? 'You can now sign players under contract with other teams.' : 'Only free agents can be signed until the next window.', kind: 'info' });
  }
  if (open) generateWindowFreeAgents(state); // fictional free agents: once per window, no-op otherwise
  if (md === '11-18') processExpiries(state, r);
  if (md === '11-20') generateProspects(state, r);
  if (md === '11-25') listFranchiseSales(state, r);
  if (md === '12-01') seasonRollover(state, r);
  resolveOffers(state, r);
  // incoming offers expire
  for (const o of state.transferOffers) if (o.status === 'pending' && o.direction === 'incoming' && o.expires < d) o.status = 'withdrawn';
  // fatigue recovery on non-match days
  for (const id of state.teams[state.userTeamId].roster) {
    const p = state.players[id];
    if (p && p.lastPlayed !== prev) p.fatigue = clamp(p.fatigue - 1.2, 0, 100);
  }
  ensureMasteryScale(state); // free agents / prospects generated today
  ensureRatingScale(state);
  reactionsDaily(state); // fan pulse & owner
  peopleDaily(state, r); // locker room: player approaches, relationships
  personaDaily(state); // off the Rift: profiles & extended traits (lazy init), streaming, media, stamina
  save();
}

// ------------------------------------------------------------------ board
export function setBoardObjectives(state: GameState) {
  const team = state.teams[state.userTeamId];
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const rank = leagueRank(state, team);
  const n = Object.values(state.teams).filter((t) => t.leagueId === team.leagueId).length;
  const objectives: GameState['board']['objectives'] = [];
  if (tier === 1 && rank <= 2) objectives.push({ id: 'worlds', text: 'Qualify for Worlds and reach the knockout stage', target: 'worlds-ko' });
  else if (tier === 1 && rank <= Math.ceil(n / 2)) objectives.push({ id: 'playoffs', text: 'Reach the playoffs in every split', target: 'playoffs' });
  else objectives.push({ id: 'improve', text: 'Finish in the top half of the league', target: 'top-half' });
  objectives.push({ id: 'finance', text: 'Keep the club financially healthy (positive balance)', target: 'balance' });
  if (tier > 1) objectives.push({ id: 'promotion', text: 'Develop players and push for promotion', target: 'promotion' });
  state.board.objectives = objectives;
}

function leagueRank(state: GameState, team: Team) {
  const same = Object.values(state.teams).filter((t) => t.leagueId === team.leagueId);
  const str = (t: Team) => Object.values(t.lineup).reduce((s, id) => s + (id && state.players[id] ? overall(state.players[id].attributes, state.players[id].role) : 30), 0);
  return same.sort((a, b) => str(b) - str(a)).findIndex((t) => t.id === team.id) + 1;
}

function boardWeekly(state: GameState) {
  const team = state.teams[state.userTeamId];
  const recent = Object.values(state.fixtures).filter((f) => f.result && (f.teamA === team.id || f.teamB === team.id) && f.date > addDays(state.date, -14));
  const wins = recent.filter((f) => f.result!.winner === team.id).length, losses = recent.length - wins;
  let delta = (wins - losses) * 1.5;
  if (team.balance < 0) delta -= 4;
  state.board.confidence = clamp(state.board.confidence + delta * 0.5 + (60 - state.board.confidence) * 0.02, 0, 100);
  if (state.board.confidence < 15 && !state.inbox.some((m) => m.subject.startsWith('Board warning') && m.date > addDays(state.date, -30))) {
    addInbox(state, { from: 'The Board', subject: 'Board warning: results must improve', body: 'The board is losing patience. Turn results and finances around or your position will be at risk.', kind: 'board' });
  }
}

/** Small weekly meta shifts (patches): some champions get buffed / nerfed. */
function patchShift(state: GameState, rng: RNG) {
  const day = Number(state.date.slice(8));
  if (weekday(state.date) !== 1 || day > 7 && day <= 14 || day > 21) return; // every ~2 weeks
  const ids = Object.keys(state.championPower);
  for (const id of ids) state.championPower[id] *= 0.6;
  const n = 8;
  const pool = POOL_CACHE.ids;
  if (!pool.length) return;
  const changes: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = pool[Math.floor(rng.next() * pool.length)];
    const delta = (rng.chance(0.5) ? 1 : -1) * (0.03 + rng.next() * 0.05);
    state.championPower[id] = clamp((state.championPower[id] ?? 0) + delta, -0.12, 0.12);
    changes.push(`${id} ${delta > 0 ? '↑' : '↓'}`);
  }
  const [maj, min] = state.patch.split('.').map(Number);
  state.patch = `${maj}.${min + 1}`;
  addNews(state, { headline: `Patch ${state.patch} is live`, body: `Balance changes: ${changes.join(', ')}.`, tags: ['patch'] });
}
export const POOL_CACHE: { ids: string[] } = { ids: [] };

// ------------------------------------------------------------------ season rollover
function seasonRollover(state: GameState, rng: RNG) {
  const year = Number(state.date.slice(0, 4)) + 1;
  // record season summary
  const champions: Record<string, string> = {};
  for (const c of Object.values(state.competitions)) if (c.season === state.season && c.winner && c.kind !== 'league') champions[c.name] = c.winner;
  state.history.push({ season: state.season, champions, awards: {} });
  // promotions / relegations
  const promos = (state as GameState & { promotions?: { promote: string; relegate?: string; league: string }[] }).promotions ?? [];
  for (const p of promos) {
    const up = state.teams[p.promote], down = p.relegate ? state.teams[p.relegate] : undefined;
    if (!up) continue;
    const oldLeague = up.leagueId;
    up.leagueId = p.league;
    // the relegated team drops to the feeder league of its own country (a Japanese LCP team goes
    // to the LJL even if the promoted team came from the VCS); otherwise the promoted team's league
    if (down) {
      const feeders = Object.values(state.leagues).filter((l) => l.parent === p.league && l.tier === 2);
      const country = (down.country ?? '').toLowerCase();
      const home = (country ? feeders.find((l) => (l.country ?? '').toLowerCase().includes(country)) : undefined)
        ?? feeders.find((l) => /sea/i.test(l.country ?? '')); // e.g. an Oceanic team → the PCS
      down.leagueId = home?.id ?? oldLeague;
    }
    addNews(state, { headline: `${up.name} join the ${p.league}`, body: `${up.name} take their place in the ${p.league}${down ? `, replacing ${down.name}` : ''}.`, tags: ['promotion'] });
  }
  (state as GameState & { promotions?: unknown[] }).promotions = [];
  applyFranchiseMoves(state, rng);
  yearlyAging(state, rng);
  // reset season stats, drop finished fixtures of old season to keep saves small
  for (const p of Object.values(state.players)) p.season = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0, minutes: 0, mvps: 0, champions: {} };
  for (const [id, f] of Object.entries(state.fixtures)) {
    const c = state.competitions[f.competitionId];
    if (c && c.season < state.season && !(f.teamA === state.userTeamId || f.teamB === state.userTeamId)) delete state.fixtures[id];
  }
  state.season = year;
  state.patch = `${year % 100}.1`;
  createSeason(state, year);
  setBoardObjectives(state);
  addInbox(state, { from: 'The Board', subject: `Welcome to the ${year} season`, body: `Objectives for ${year}:\n${state.board.objectives.map((o) => '• ' + o.text).join('\n')}`, kind: 'board' });
  void compKey; void movePlayer;
}
