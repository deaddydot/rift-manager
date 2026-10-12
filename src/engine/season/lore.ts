// Lore rules: a few results the world simply doesn't allow, whatever the numbers say. On by default,
// switchable in Settings. T1 never loses a game to an LPL team.
import type { GameState, Team } from '../types';

export const T1_ID = 't1-lck';

/** The side (0 = blue, 1 = red) that can't lose this game under the lore rules, or null. */
export function destinySide(state: GameState, blue: Team, red: Team): 0 | 1 | null {
  if (state.settings.loreRules === false) return null;
  if (blue.id === T1_ID && red.leagueId === 'LPL') return 0;
  if (red.id === T1_ID && blue.leagueId === 'LPL') return 1;
  return null;
}

/** Whether a fixture between these two teams is decided by the lore rules (and who wins it). */
export function loreWinner(state: GameState, a: Team, b: Team): Team | null {
  const s = destinySide(state, a, b);
  return s === null ? null : s === 0 ? a : b;
}
