// Navigation config: the single source of truth for hubs, pages and detail routes.
// Adding a page = one line in a hub's `pages` array (the lazy import lives in `render`).
import { lazy, type ComponentType, type ReactNode } from 'react';
import type { Route } from '../../store/game';
import type { GameState } from '../../engine/types';
import { gd } from '../../data/gamedata';

export interface NavPage {
  /** hash route key, e.g. 'squad' -> #/squad */
  page: string;
  label: string;
  icon: string;
  /** extra search terms for the command palette */
  keywords?: string;
  render: (r: Route) => ReactNode;
}
export interface NavHub {
  id: string;
  label: string;
  icon: string;
  /** first page is the hub's landing page */
  pages: NavPage[];
  /** rendered in the sidebar footer instead of the main list */
  footer?: boolean;
}
/** Routes that open an entity (player, team, ...) and belong under a parent page/tab. */
export interface DetailRoute {
  page: string;
  /** the nav page highlighted while this route is open */
  parent: (r: Route, s: GameState) => string;
  render: (r: Route) => ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loader = () => Promise<{ default: ComponentType<any> }>;
const loaders: Loader[] = [];
/** Lazily load a page component; `props` maps the route onto the component's props. */
function lazyPage(load: Loader, props?: (r: Route) => Record<string, unknown>) {
  loaders.push(load);
  const C = lazy(load);
  return (r: Route) => <C {...(props ? props(r) : {})} />;
}
/** Warm the module cache for every page so switching tabs doesn't wait on the network. */
export function preloadPages() {
  for (const l of loaders) l().catch(() => { /* retried by React.lazy on demand */ });
}

export const HUBS: NavHub[] = [
  { id: 'home', label: 'Home', icon: '⌂', pages: [
    { page: 'home', label: 'Home', icon: '⌂', keywords: 'dashboard overview', render: lazyPage(() => import('../pages/Dashboard')) },
  ] },
  { id: 'inbox', label: 'Inbox', icon: '✉', pages: [
    { page: 'inbox', label: 'Inbox', icon: '✉', keywords: 'messages mail decisions', render: lazyPage(() => import('../pages/Inbox')) },
  ] },
  { id: 'squad', label: 'Squad', icon: '👥', pages: [
    { page: 'squad', label: 'Squad', icon: '👥', keywords: 'roster lineup players team', render: lazyPage(() => import('../pages/Squad')) },
    { page: 'tactics', label: 'Tactics', icon: '♟', keywords: 'strategy draft style', render: lazyPage(() => import('../pages/Tactics')) },
    { page: 'training', label: 'Training', icon: '🏋', keywords: 'scrims practice development', render: lazyPage(() => import('../pages/Training')) },
    { page: 'staff', label: 'Staff', icon: '🎧', keywords: 'coach analyst scout psychologist', render: lazyPage(() => import('../pages/StaffPage')) },
    { page: 'dynamics', label: 'Locker room', icon: '🫂', keywords: 'dynamics relationships chemistry morale trust talk drama', render: lazyPage(() => import('../pages/Dynamics')) },
  ] },
  { id: 'matches', label: 'Matches', icon: '⚔', pages: [
    { page: 'match', label: 'Match Center', icon: '⚔', keywords: 'play game draft live', render: lazyPage(() => import('../match/MatchCenter')) },
    { page: 'schedule', label: 'Schedule', icon: '📅', keywords: 'fixtures calendar results', render: lazyPage(() => import('../pages/Schedule')) },
    { page: 'competitions', label: 'Competitions', icon: '🏆', keywords: 'leagues tournaments standings worlds msi', render: lazyPage(() => import('../pages/Competitions')) },
  ] },
  { id: 'club', label: 'Club', icon: '🏢', pages: [
    { page: 'finances', label: 'Finances', icon: '💰', keywords: 'money budget balance salary', render: lazyPage(() => import('../pages/Finances')) },
    { page: 'sponsors', label: 'Sponsors', icon: '🤝', keywords: 'deals partners', render: lazyPage(() => import('../pages/Sponsors')) },
    { page: 'merch', label: 'Merchandise', icon: '👕', keywords: 'merch shop jersey', render: lazyPage(() => import('../pages/Merch')) },
    { page: 'facilities', label: 'Facilities', icon: '🏠', keywords: 'gaming house upgrades', render: lazyPage(() => import('../pages/Facilities')) },
  ] },
  { id: 'office', label: 'Office', icon: '🏛', pages: [
    { page: 'boardroom', label: 'Boardroom', icon: '🏛', keywords: 'owner board objectives requests', render: lazyPage(() => import('../pages/Boardroom')) },
    { page: 'news', label: 'News', icon: '📰', keywords: 'headlines media', render: lazyPage(() => import('../pages/News')) },
    { page: 'fans', label: 'Fan Pulse', icon: '📣', keywords: 'fans social mood hype', render: lazyPage(() => import('../pages/FanPulse')) },
  ] },
  { id: 'market', label: 'Transfers', icon: '🔁', pages: [
    { page: 'transfers', label: 'Transfers', icon: '🔁', keywords: 'market sign buy sell offers free agents scouting', render: lazyPage(() => import('../pages/Transfers')) },
  ] },
  { id: 'world', label: 'World', icon: '🌐', pages: [
    { page: 'database', label: 'Players & Teams', icon: '🔎', keywords: 'database search leagues', render: lazyPage(() => import('../pages/DatabasePage'), (r) => ({ tab: r.id })) },
    { page: 'champions', label: 'Champions', icon: '🛡', keywords: 'meta patch tier list', render: lazyPage(() => import('../pages/Champions'), (r) => ({ id: r.id })) },
  ] },
  // (the online build has no Editor: players, teams and staff stay as they are)
  ...(import.meta.env.VITE_HOSTED === '1' ? [] : [{ id: 'editor', label: 'Editor', icon: '✎', footer: true, pages: [
    { page: 'editor', label: 'Editor', icon: '✎', keywords: 'edit create custom', render: lazyPage(() => import('../pages/Editor'), (r) => ({ kind: r.id, targetId: r.tab })) },
  ] }]),
  { id: 'settings', label: 'Settings', icon: '⚙', footer: true, pages: [
    { page: 'settings', label: 'Save & Settings', icon: '⚙', keywords: 'save load options export', render: lazyPage(() => import('../pages/Settings')) },
  ] },
];

export const DETAILS: DetailRoute[] = [
  { page: 'player', parent: (r, s) => (s.players[r.id ?? '']?.teamId === s.userTeamId ? 'squad' : 'database'), render: lazyPage(() => import('../pages/PlayerPage'), (r) => ({ id: r.id })) },
  { page: 'team', parent: (r, s) => (r.id === s.userTeamId ? 'squad' : 'database'), render: lazyPage(() => import('../pages/TeamPage'), (r) => ({ id: r.id })) },
  { page: 'competition', parent: () => 'competitions', render: lazyPage(() => import('../pages/CompetitionPage'), (r) => ({ id: r.id, tab: r.tab })) },
  { page: 'fixture', parent: () => 'schedule', render: lazyPage(() => import('../pages/FixturePage'), (r) => ({ id: r.id })) },
];

/** Extra palette-only shortcuts into tabs of a page. */
export const PALETTE_SHORTCUTS: { label: string; icon: string; route: [string, string?, string?]; keywords?: string }[] = [
  { label: 'Players database', icon: '🔎', route: ['database', 'players'], keywords: 'search free agents' },
  { label: 'Teams database', icon: '🔎', route: ['database', 'teams'] },
  { label: 'Leagues', icon: '🔎', route: ['database', 'leagues'], keywords: 'regions' },
];

// ------------------------------------------------------------------ lookups
export const PAGES: Record<string, { page: NavPage; hub: NavHub }> = {};
for (const hub of HUBS) for (const page of hub.pages) PAGES[page.page] = { page, hub };
const DETAIL_BY_PAGE: Record<string, DetailRoute> = Object.fromEntries(DETAILS.map((d) => [d.page, d]));

export const HOME = PAGES.home;

/** Resolve a route to what should render plus which hub / nav page is "active". */
export function resolveRoute(r: Route, s: GameState): { render: (r: Route) => ReactNode; hub: NavHub; active: string; detail: boolean } {
  const direct = PAGES[r.page];
  if (direct) return { render: direct.page.render, hub: direct.hub, active: direct.page.page, detail: false };
  const d = DETAIL_BY_PAGE[r.page];
  if (d) {
    const parent = PAGES[d.parent(r, s)] ?? HOME;
    return { render: d.render, hub: parent.hub, active: parent.page.page, detail: true };
  }
  return { render: HOME.page.render, hub: HOME.hub, active: 'home', detail: false };
}

/** Human label for any route (recent list, breadcrumbs, document title). */
export function describeRoute(r: Route, s: GameState): { label: string; sub?: string; icon: string } | null {
  const p = PAGES[r.page];
  if (p) {
    if (r.page === 'champions' && r.id) {
      return { label: gd().championById[r.id]?.name ?? r.id, sub: 'Champion', icon: '🛡' };
    }
    if (r.page === 'database' && r.id) return { label: `${p.page.label} · ${r.id[0].toUpperCase()}${r.id.slice(1)}`, sub: p.hub.label, icon: p.page.icon };
    return { label: p.page.label, sub: p.hub.pages.length > 1 ? p.hub.label : undefined, icon: p.page.icon };
  }
  if (r.page === 'player') { const x = s.players[r.id ?? '']; return x ? { label: x.handle, sub: `Player · ${x.teamId ? s.teams[x.teamId]?.short ?? '' : 'Free agent'}`, icon: '👤' } : null; }
  if (r.page === 'team') { const x = s.teams[r.id ?? '']; return x ? { label: x.name, sub: 'Team', icon: '🛡' } : null; }
  if (r.page === 'competition') { const x = s.competitions[r.id ?? '']; return x ? { label: x.name, sub: 'Competition', icon: '🏆' } : null; }
  if (r.page === 'fixture') {
    const f = s.fixtures[r.id ?? ''];
    if (!f) return null;
    const a = f.teamA ? s.teams[f.teamA]?.short : 'TBD', b = f.teamB ? s.teams[f.teamB]?.short : 'TBD';
    return { label: `${a} vs ${b}`, sub: `Match · ${s.competitions[f.competitionId]?.short ?? ''}`, icon: '⚔' };
  }
  return null;
}

export const routeKey = (r: Route) => [r.page, r.id, r.tab].filter(Boolean).join('/');
