// Ephemeral match session (survives navigation; not saved).
import { create } from 'zustand';
import type { SeriesContext } from '../../engine/season/series';
import type { DraftState } from '../../engine/draft/draft';
import type { MatchSim } from '../../engine/sim/engine';
import type { SeriesGame } from '../../engine/types';

export type Phase = 'pre' | 'draft' | 'live' | 'post' | 'done';
export interface MatchSession {
  fixtureId: string;
  series: SeriesContext;
  phase: Phase;
  draft?: DraftState;
  sim?: MatchSim;
  userSide?: 0 | 1;
  lastGame?: SeriesGame;
  gameNo: number;
}

export const useSession = create<{ s: MatchSession | null; v: number; set: (s: MatchSession | null) => void; bump: () => void }>((set, get) => ({
  s: null,
  v: 0,
  set: (s) => set({ s, v: get().v + 1 }),
  bump: () => set({ v: get().v + 1 }),
}));
