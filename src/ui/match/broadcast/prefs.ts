// Caster desk preferences (per browser, localStorage): which desk calls the matches, whether the subtitle bar is
// collapsed, and whether Vietnamese lines show their English gloss.
import { create } from 'zustand';

export type CasterMode = 'auto' | 'off' | string; // or a desk id (castersData DESKS)
const K_MODE = 'rm.casters.mode', K_HIDDEN = 'rm.casters.hidden', K_GLOSS = 'rm.casters.gloss';
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

interface CasterPrefs {
  mode: CasterMode;
  hidden: boolean;
  gloss: boolean;
  setMode: (m: CasterMode) => void;
  setHidden: (h: boolean) => void;
  setGloss: (g: boolean) => void;
}
export const useCasterPrefs = create<CasterPrefs>((set) => ({
  mode: read(K_MODE) ?? 'auto',
  hidden: read(K_HIDDEN) === '1',
  gloss: read(K_GLOSS) !== '0',
  setMode: (mode) => { write(K_MODE, mode); set({ mode }); },
  setHidden: (hidden) => { write(K_HIDDEN, hidden ? '1' : '0'); set({ hidden }); },
  setGloss: (gloss) => { write(K_GLOSS, gloss ? '1' : '0'); set({ gloss }); },
}));

/** Height the subtitle bar takes under the map (LiveMatch sizes the map around it). */
export const SUB_H = { full: 92, compact: 84, collapsed: 30 };
export function subtitleHeight(mode: CasterMode, hidden: boolean, compact: boolean): number {
  if (mode === 'off') return 0;
  if (hidden) return SUB_H.collapsed;
  return compact ? SUB_H.compact : SUB_H.full;
}
