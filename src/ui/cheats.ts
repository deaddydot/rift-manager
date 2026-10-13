// Easter egg cheats. Session-only: kept in sessionStorage (gone when the tab closes) and never saved with a career.
// Unlock: on the Settings page, click the words "Rift Manager" in the small print at the bottom, then type "faker"
// within a few seconds (no text box — just type). Doing it again switches it off. While it's on, live matches get a
// button that makes the opposing team throw (MatchSim.forceThrow).
import { useSyncExternalStore } from 'react';

const KEY = 'rm.cheat.faker';
const WORD = 'faker';
const ARM_MS = 8000;

let on = (() => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } })();
const subs = new Set<() => void>();

export const fakerMode = () => on;
export function setFakerMode(v: boolean) {
  on = v;
  try { if (v) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch { /* storage blocked: memory only */ }
  for (const f of subs) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useFakerMode = () => useSyncExternalStore(subscribe, fakerMode, () => false);

let disarm: (() => void) | null = null;
/** After the hidden click: listen for the secret word for a few seconds. `done` gets the new state. */
export function armSecret(done: (nowOn: boolean) => void) {
  disarm?.();
  let typed = '';
  const onKey = (e: KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    typed = (typed + e.key.toLowerCase()).slice(-WORD.length);
    if (typed !== WORD) return;
    stop();
    setFakerMode(!on);
    done(on);
  };
  const timer = setTimeout(() => stop(), ARM_MS);
  const stop = () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); disarm = null; };
  window.addEventListener('keydown', onKey);
  disarm = stop;
}
