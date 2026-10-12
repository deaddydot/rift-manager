// Glue between match results / the daily loop and the fan + owner systems.
import type { GameState, MatchFixture } from '../types';
import { fansAfterSeries, fansDaily, fanPulse } from './fans';
import { ownerAfterSeries, ownerDaily, ensureOwner } from './owner';
import { buzzAfterSeries, buzzAnySeries, buzzDaily } from './buzz';
import { legacyAfterSeries, legacyDaily } from './legacy';
import { bidsDaily } from './bidTalks';

/** Called from finishSeries for every completed series. */
export function onSeriesFinished(state: GameState, f: MatchFixture) {
  const info = fansAfterSeries(state, f);
  if (info) { ownerAfterSeries(state, info); buzzAfterSeries(state, info); }
  buzzAnySeries(state, f); // T1-vs-LPL lore anywhere in the world
  legacyAfterSeries(state, f); // title history: back-to-backs, dynasties, rematches, droughts (records finals)
}

/** Called once per day from endDay, after the periodic updates. */
export function reactionsDaily(state: GameState) {
  if (!state.teams[state.userTeamId]) return;
  ownerDaily(state, fansDaily(state));
  buzzDaily(state); // self-aware layer: anomalies, edits, club life
  legacyDaily(state); // title history: season turn, title defences, final eves, anniversaries
  bidsDaily(state); // the player's side of incoming bids: follow-up talks, raised offers, agents
}

/** New games: fan state + owner persona (old saves initialise lazily on the first day). */
export function initReactions(state: GameState) {
  fanPulse(state);
  ensureOwner(state);
}
