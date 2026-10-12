import { useEffect, useMemo, useState, Suspense, startTransition } from 'react';
import { useStore, parseHash, nav, type Route } from './store/game';
import { loadAll } from './data/load';
import MainMenu from './ui/pages/MainMenu';
import { resolveRoute, describeRoute, routeKey, preloadPages } from './ui/nav/config';
import { computeAttention } from './ui/nav/attention';
import { Sidebar, HubBar, TopBar } from './ui/components/Nav';
import { trackHistory } from './ui/nav/history';
import CommandPalette, { type PaletteAction } from './ui/components/CommandPalette';

// Pages, hubs and detail routes are declared in src/ui/nav/config.tsx (one line per page).

export default function App() {
  const db = useStore((s) => s.db);
  const state = useStore((s) => s.state);
  const [progress, setProgress] = useState<[number, string]>([0, 'Loading']);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    loadAll((p, l) => setProgress([p, l])).then(({ db }) => useStore.getState().setDB(db)).catch((e) => setError(String(e)));
    trackHistory(window.location.hash);
    // a transition keeps the current page on screen while the next lazy page loads (no "Loading…" flash)
    const onHash = () => { trackHistory(window.location.hash); startTransition(() => setRoute(parseHash())); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <div className="p-10 text-red-400">Failed to load game data: {error}</div>;
  if (!db) return <Boot progress={progress} />;
  if (!state) return <MainMenu />;
  return <Shell route={route} />;
}

function Boot({ progress }: { progress: [number, string] }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <div className="font-display text-5xl font-bold gold-text tracking-widest">RIFT MANAGER</div>
      <div className="w-72 h-1.5 bg-panel2 rounded-full overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${progress[0] * 100}%` }} /></div>
      <div className="text-muted text-sm">{progress[1]}…</div>
    </div>
  );
}

// ------------------------------------------------------------------ small persisted prefs (localStorage may be unavailable)
function readLS(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeLS(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* private mode etc. */ } }

function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Recently visited routes for the current save (most recent first). */
function useRecents(route: Route, saveId: string) {
  const [list, setList] = useState<Route[]>(() => {
    try {
      const raw = JSON.parse(readLS('rm.recent') ?? 'null') as { save?: string; routes?: Route[] } | null;
      return raw?.save === saveId && Array.isArray(raw.routes) ? raw.routes.filter((r) => r && typeof r.page === 'string') : [];
    } catch { return []; }
  });
  const key = routeKey(route);
  useEffect(() => {
    setList((prev) => {
      const next = [route, ...prev.filter((r) => routeKey(r) !== key)].slice(0, 10);
      writeLS('rm.recent', JSON.stringify({ save: saveId, routes: next }));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, saveId]);
  return list;
}

function Shell({ route }: { route: Route }) {
  const state = useStore((s) => s.state)!;
  const v = useStore((s) => s.v);
  const toast = useStore((s) => s.toast);
  const continueGame = useStore((s) => s.continueGame);
  const [palette, setPalette] = useState(false);
  // null = follow the window width; set once the user toggles explicitly
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(() => { const x = readLS('rm.navCollapsed'); return x === null ? null : x === '1'; });
  const narrow = useMediaQuery('(max-width: 1180px)');
  const collapsed = collapsedPref ?? narrow;
  const toggleSidebar = () => { const nx = !collapsed; setCollapsedPref(nx); writeLS('rm.navCollapsed', nx ? '1' : '0'); };

  const matchToday = state.pendingMatch;
  const recents = useRecents(route, state.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attention = useMemo(() => computeAttention(state), [state, v]);
  const resolved = resolveRoute(route, state);
  const desc = describeRoute(route, state);

  const onContinue = async () => {
    if (matchToday) { nav('match'); return; }
    const m = await continueGame();
    if (m) nav('match');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); return; }
      const el = e.target as HTMLElement;
      const typing = !!el.closest?.('input, textarea, select, [contenteditable]');
      if (palette || typing) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setPalette(true); return; }
      if (e.code !== 'Space' || route.page === 'match') return;
      e.preventDefault();
      if (!useStore.getState().busy) onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const t = window.setTimeout(preloadPages, 1500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = desc ? `${desc.label} · Rift Manager` : 'Rift Manager';
    return () => { document.title = prev; };
  }, [desc?.label]);

  const actions: PaletteAction[] = [
    { id: 'continue', label: matchToday ? 'Go to match' : 'Continue', icon: '▶', hint: 'Space', keywords: 'advance next day sim', run: onContinue },
    { id: 'save', label: 'Save game', icon: '💾', keywords: 'save', run: () => { void useStore.getState().save(); } },
    { id: 'club', label: 'Club profile', icon: '🛡', keywords: 'my team history titles', run: () => nav('team', state.userTeamId) },
    { id: 'sidebar', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', icon: '◧', keywords: 'toggle menu', run: toggleSidebar },
  ];

  return (
    <div className="h-full flex">
      <Sidebar state={state} hubId={resolved.hub.id} active={resolved.active} attention={attention} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar state={state} onContinue={onContinue} onSearch={() => setPalette(true)} />
        <HubBar hub={resolved.hub} active={resolved.active} crumb={resolved.detail ? desc?.label ?? '…' : undefined} attention={attention} />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-8 text-muted">Loading…</div>}>
            <div key={route.page + (route.id ?? '')} className="p-5 fadein max-w-[1500px] mx-auto">{resolved.render(route)}</div>
          </Suspense>
        </main>
      </div>
      {palette && <CommandPalette state={state} attention={attention} recents={recents} current={routeKey(route)} actions={actions} onClose={() => setPalette(false)} />}
      {toast && <div className="fixed bottom-5 right-5 panel px-4 py-3 text-sm fadein z-50">{toast}</div>}
    </div>
  );
}
