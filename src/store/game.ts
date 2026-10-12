// Global store: the mutable GameState plus a version counter to trigger re-renders.
import { create } from 'zustand';
import type { GameState, MatchFixture } from '../engine/types';
import { createNewGame, type Database } from '../engine/setup';
import { processDay, endDay, nextUserFixture, setBoardObjectives } from '../engine/game';
import { saveGame } from './persist';
import { addInbox } from '../engine/management/news';
import { generateWindowFreeAgents } from '../engine/management/freeAgents';

export interface Route { page: string; id?: string; tab?: string }

interface Store {
  db: Database | null;
  state: GameState | null;
  v: number;
  busy: boolean;
  toast: string | null;
  setDB: (db: Database) => void;
  setState: (s: GameState | null) => void;
  bump: () => void;
  notify: (msg: string) => void;
  newGame: (teamId: string, manager: string) => void;
  save: () => Promise<void>;
  continueGame: (opts?: { maxDays?: number; stopOnMatch?: boolean }) => Promise<MatchFixture | null>;
}

export const useStore = create<Store>((set, get) => ({
  db: null,
  state: null,
  v: 0,
  busy: false,
  toast: null,
  setDB: (db) => set({ db }),
  setState: (s) => set({ state: s, v: get().v + 1 }),
  bump: () => set({ v: get().v + 1 }),
  notify: (msg) => { set({ toast: msg }); setTimeout(() => { if (get().toast === msg) set({ toast: null }); }, 3500); },
  newGame: (teamId, manager) => {
    const db = get().db!;
    const s = createNewGame(db, teamId, manager);
    generateWindowFreeAgents(s); // the game starts inside the winter transfer window
    setBoardObjectives(s);
    const team = s.teams[teamId];
    addInbox(s, {
      from: 'The Board', kind: 'board',
      subject: `Welcome to ${team.name}, ${manager}!`,
      body: `The board welcomes you as the new General Manager of ${team.name}.\n\nObjectives for ${s.season}:\n${s.board.objectives.map((o) => '• ' + o.text).join('\n')}\n\nYour first competitive match is coming up soon — check the Squad, set your Tactics and Training, then press Continue.`,
    });
    set({ state: s, v: get().v + 1 });
  },
  save: async () => {
    const s = get().state;
    if (!s) return;
    await saveGame(s);
    get().notify('Game saved');
  },
  /**
   * Advance day by day until the user's next match (or an unread actionable message, or maxDays).
   * Yields to the UI between days so progress is visible.
   */
  continueGame: async (opts = {}) => {
    const s = get().state;
    if (!s || get().busy) return null;
    set({ busy: true });
    const maxDays = opts.maxDays ?? 60;
    let match: MatchFixture | null = null;
    try {
      for (let d = 0; d < maxDays; d++) {
        match = processDay(s);
        if (match) break;
        const unreadActions = s.inbox.filter((m) => !m.read && m.action && !m.action.done && m.date === s.date).length;
        endDay(s);
        set({ v: get().v + 1 });
        if (unreadActions && d > 0) break;
        if (d % 3 === 2) await new Promise((r) => setTimeout(r, 0));
        const next = nextUserFixture(s);
        if (opts.stopOnMatch !== false && next && next.date <= s.date) { match = processDay(s); if (match) break; }
      }
      if (s.settings.autoSave) await saveGame(s);
    } finally {
      set({ busy: false, v: get().v + 1 });
    }
    return match;
  },
}));

export function useGame(): GameState {
  const s = useStore((x) => x.state);
  useStore((x) => x.v);
  return s!;
}

// ------------------------------------------------------------------ hash router
export function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const [page, id, tab] = h.split('/');
  return { page: page || 'home', id: id || undefined, tab: tab || undefined };
}
export function nav(page: string, id?: string, tab?: string) {
  const parts = [page, id, tab].filter((x) => x !== undefined && x !== null && x !== '').map((x) => encodeURIComponent(String(x)));
  window.location.hash = '/' + parts.join('/');
}
