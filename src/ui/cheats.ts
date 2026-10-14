// Easter egg cheats. Session-only: kept in sessionStorage (gone when the tab closes) and never saved with a career.
// Unlock: on the Settings page, click the words "Rift Manager" in the small print at the bottom, then type a secret
// word within a few seconds (no text box — just type). Typing it again switches it off.
//   faker — live matches get a button that makes the opposing team throw (MatchSim.forceThrow)
//   levi  — the dev tools: the Editor (players, teams, staff) opens up even in the online build
import { useSyncExternalStore } from 'react';

export type Cheat = 'faker' | 'levi';
const WORDS: Cheat[] = ['faker', 'levi'];
const ARM_MS = 8000;
const key = (c: Cheat) => `rm.cheat.${c}`;

const on: Record<Cheat, boolean> = Object.fromEntries(WORDS.map((w) => [w, (() => { try { return sessionStorage.getItem(key(w)) === '1'; } catch { return false; } })()])) as Record<Cheat, boolean>;
const subs = new Set<() => void>();

export const cheatOn = (c: Cheat) => on[c];
export function setCheat(c: Cheat, v: boolean) {
  on[c] = v;
  try { if (v) sessionStorage.setItem(key(c), '1'); else sessionStorage.removeItem(key(c)); } catch { /* storage blocked: memory only */ }
  for (const f of subs) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useCheat = (c: Cheat) => useSyncExternalStore(subscribe, () => on[c], () => false);

// the original names, still used by the live match
export const fakerMode = () => on.faker;
export const useFakerMode = () => useCheat('faker');
/** Dev tools (the Editor) available: always in the dev build, in the online build only after "levi". */
export const devToolsOn = () => import.meta.env.VITE_HOSTED !== '1' || on.levi;
export const useDevTools = () => useCheat('levi') || import.meta.env.VITE_HOSTED !== '1';

let disarm: (() => void) | null = null;
/** After the hidden click: listen for a secret word for a few seconds. `done` gets the word and its new state. */
export function armSecret(done: (word: Cheat, nowOn: boolean) => void) {
  disarm?.();
  let typed = '';
  const onKey = (e: KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    typed = (typed + e.key.toLowerCase()).slice(-8);
    const word = WORDS.find((w) => typed.endsWith(w));
    if (!word) return;
    stop();
    setCheat(word, !on[word]);
    done(word, on[word]);
  };
  const timer = setTimeout(() => stop(), ARM_MS);
  const stop = () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); disarm = null; };
  window.addEventListener('keydown', onKey);
  disarm = stop;
}
