// App chrome: sidebar (hubs + hover fly-outs), hub sub-tab bar, top bar, attention badges.
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { nav, useStore } from '../../store/game';
import { nextUserFixture } from '../../engine/game';
import { HUBS, type NavHub } from '../nav/config';
import { summarize, type Attention } from '../nav/attention';
import { canGoBack, MOD_KEY } from '../nav/history';
import { TeamLogo, money, fmtDate } from './kit';


// ------------------------------------------------------------------ badges
/** Badge for a set of attention items: red pill = decisions, gold pill = counts, teal dot = FYI, pulsing red = live. */
export function Badge({ items, compact = false }: { items: Attention[]; compact?: boolean }) {
  if (!items.length) return null;
  const s = summarize(items);
  if (compact) {
    const color = s.live || s.alert ? 'bg-red-500' : s.infoN ? 'bg-gold' : 'bg-accent';
    return <span title={s.title} className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-[#080d18] ${color} ${s.live ? 'pulse-gold' : ''}`} />;
  }
  return (
    <span className="flex items-center gap-1 shrink-0" title={s.title}>
      {s.live && <span className="w-2 h-2 rounded-full bg-red-500 pulse-gold" />}
      {s.alert && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500/90 text-white text-[10px] font-bold flex items-center justify-center">{s.alertN || '!'}</span>}
      {s.infoN > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-black text-[10px] font-bold flex items-center justify-center">{s.infoN}</span>}
      {s.info && !s.infoN && !s.alert && <span className="w-2 h-2 rounded-full bg-accent" />}
    </span>
  );
}

const hubItems = (hub: NavHub, att: Attention[]) => att.filter((a) => hub.pages.some((p) => p.page === a.page));
const pageItems = (page: string, att: Attention[]) => att.filter((a) => a.page === page);

// ------------------------------------------------------------------ sidebar
export function Sidebar({ state, hubId, active, attention, collapsed, onToggle }: {
  state: GameState; hubId: string; active: string; attention: Attention[]; collapsed: boolean; onToggle: () => void;
}) {
  const team = state.teams[state.userTeamId];
  const [fly, setFly] = useState<{ hub: NavHub; top: number; left: number } | null>(null);
  const openT = useRef<number | undefined>(undefined);
  const closeT = useRef<number | undefined>(undefined);
  const clear = () => { window.clearTimeout(openT.current); window.clearTimeout(closeT.current); };
  const scheduleClose = () => { window.clearTimeout(openT.current); window.clearTimeout(closeT.current); closeT.current = window.setTimeout(() => setFly(null), 160); };
  const hover = (hub: NavHub, el: HTMLElement) => {
    // expanded sidebar: single-page hubs need no fly-out (the label is visible already)
    if (!collapsed && hub.pages.length < 2) { scheduleClose(); return; }
    clear();
    const h = 40 + hub.pages.length * 34;
    // measure when showing (the sidebar may still be animating its width)
    const show = () => {
      const r = el.getBoundingClientRect();
      const side = el.closest('aside')?.getBoundingClientRect().right ?? r.right;
      setFly({ hub, left: side + 6, top: Math.max(8, Math.min(r.top - 4, window.innerHeight - h - 8)) });
    };
    if (fly) show(); else openT.current = window.setTimeout(show, 110);
  };
  useEffect(() => () => clear(), []);
  useEffect(() => setFly(null), [active]);

  const LEVEL_ORDER = { live: 0, alert: 1, info: 2 } as const;
  const todo = attention.filter((a) => a.todo !== false).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const main = HUBS.filter((h) => !h.footer);
  const footer = HUBS.filter((h) => h.footer);

  const hubButton = (hub: NavHub, small?: boolean) => {
    const on = hub.id === hubId;
    const items = hubItems(hub, attention);
    return (
      <button
        key={hub.id}
        onClick={() => nav(hub.pages[0].page)}
        onMouseEnter={(e) => hover(hub, e.currentTarget)}
        onMouseLeave={scheduleClose}
        aria-label={hub.label}
        aria-current={on ? 'page' : undefined}
        className={`relative w-full flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-4'} ${small ? 'py-1.5 text-[13px]' : 'py-2 text-sm'} transition border-l-2 ${on ? 'bg-[#121b30] text-gold2 border-gold' : 'text-muted hover:text-text hover:bg-panel border-transparent'}`}
      >
        <span className={`w-5 text-center ${collapsed ? 'text-base' : ''} ${on ? '' : 'opacity-80'}`}>{hub.icon}</span>
        {!collapsed && <span className="flex-1 text-left font-semibold truncate">{hub.label}</span>}
        {!collapsed && hub.pages.length > 1 && !items.length && <span className="text-dim text-xs">›</span>}
        <Badge items={items} compact={collapsed} />
      </button>
    );
  };

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-52'} shrink-0 border-r hairline bg-[#080d18] flex flex-col transition-[width] duration-150`}>
      <button className={`flex items-center gap-3 border-b hairline text-left hover:bg-panel h-14 shrink-0 ${collapsed ? 'justify-center' : 'px-4'}`} onClick={() => nav('team', team.id)} title={`${team.name} — club profile`}>
        <TeamLogo team={team} size={collapsed ? 30 : 34} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-base leading-tight truncate">{team.name}</div>
            <div className="text-[11px] text-muted truncate">{state.leagues[team.leagueId]?.name} · {state.manager.name}</div>
          </div>
        )}
      </button>
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col" onScroll={() => setFly(null)}>
        {main.map((h) => hubButton(h))}
        {!collapsed && todo.length > 0 && (
          <div className="mt-auto pt-4 px-3">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-dim font-bold">To do</div>
            {todo.slice(0, 6).map((a, i) => (
              <button key={i} onClick={() => nav(...(a.route ?? [a.page]))} className="w-full flex items-start gap-2 px-1 py-1 rounded text-[12px] leading-snug text-muted hover:text-text hover:bg-panel text-left">
                <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${a.level === 'info' ? (a.n ? 'bg-gold' : 'bg-accent') : 'bg-red-500'} ${a.level === 'live' ? 'pulse-gold' : ''}`} />
                <span className="flex-1 line-clamp-2">{a.text}</span>
              </button>
            ))}
          </div>
        )}
      </nav>
      <div className="border-t hairline py-1.5">
        {footer.map((h) => hubButton(h, true))}
        <button onClick={onToggle} className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center' : 'px-4'} py-1.5 text-[12px] text-dim hover:text-text`} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <span className="w-5 text-center">{collapsed ? '»' : '«'}</span>
          {!collapsed && <span className="flex-1 text-left">Collapse</span>}
        </button>
      </div>

      {fly && (
        <div className="fixed z-40 panel py-1.5 min-w-[200px] shadow-2xl shadow-black/60 fadein" style={{ left: fly.left, top: fly.top }} onMouseEnter={clear} onMouseLeave={scheduleClose}>
          <div className="px-3 pt-0.5 pb-1.5 text-[10px] uppercase tracking-widest text-dim font-bold">{fly.hub.label}</div>
          {fly.hub.pages.map((p) => {
            const on = p.page === active;
            return (
              <button key={p.page} onClick={() => { setFly(null); nav(p.page); }} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition ${on ? 'text-gold2 bg-[#121b30]' : 'text-muted hover:text-text hover:bg-[#121b30]'}`}>
                <span className="w-5 text-center opacity-80">{p.icon}</span>
                <span className="flex-1">{p.label}</span>
                <Badge items={pageItems(p.page, attention)} />
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// ------------------------------------------------------------------ hub tab bar
export function HubBar({ hub, active, crumb, attention }: { hub: NavHub; active: string; crumb?: string; attention: Attention[] }) {
  if (hub.pages.length < 2 && !crumb) return null;
  return (
    <div className="shrink-0 border-b hairline bg-[#0a1020]">
      <div className="max-w-[1500px] mx-auto px-5 flex items-stretch gap-0.5 h-10 overflow-x-auto">
        {hub.label !== hub.pages[0].label && <div className="flex items-center pr-3 mr-1 text-[10px] uppercase tracking-widest text-dim font-bold whitespace-nowrap">{hub.label}</div>}
        {hub.pages.map((p) => {
          const on = p.page === active;
          return (
            <button key={p.page} onClick={() => nav(p.page)} className={`flex items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${on ? (crumb ? 'border-gold/40 text-text' : 'border-gold text-gold2') : 'border-transparent text-muted hover:text-text'}`}>
              <span className="opacity-75 text-[13px]">{p.icon}</span>{p.label}
              <Badge items={pageItems(p.page, attention)} />
            </button>
          );
        })}
        {crumb && (
          <div className="flex items-center gap-2 pl-2 text-sm min-w-0">
            <span className="text-dim">›</span>
            <span className="text-gold2 font-semibold truncate border-b-2 border-gold h-full flex items-center">{crumb}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ top bar
export function TopBar({ state, onContinue, onSearch }: { state: GameState; onContinue: () => void; onSearch: () => void }) {
  const busy = useStore((s) => s.busy);
  const team = state.teams[state.userTeamId];
  const next = nextUserFixture(state);
  const matchToday = !!state.pendingMatch;
  const oppId = next ? (next.teamA === team.id ? next.teamB : next.teamA) : null;
  const opp = oppId ? state.teams[oppId] : null;
  const back = canGoBack();
  return (
    <header className="h-14 shrink-0 border-b hairline flex items-center gap-3 px-4 bg-[#080d18]">
      <button className="btn btn-ghost px-2 py-1.5 text-muted" disabled={!back} onClick={() => history.back()} title="Back">◀</button>
      <div className="shrink-0">
        <div className="font-display text-lg font-bold leading-none whitespace-nowrap">{fmtDate(state.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div className="text-[11px] text-muted whitespace-nowrap flex items-center gap-1.5">
          Season {state.season} · Patch {state.patch}
          {state.transferWindowOpen && <button onClick={() => nav('transfers')} className="text-accent hover:underline">· <span className="hidden xl:inline">Transfer window</span><span className="xl:hidden">Window</span> open</button>}
        </div>
      </div>
      <button onClick={onSearch} className="ml-2 flex items-center gap-2 h-9 px-3 rounded-lg border border-line2 bg-[#0a1120] text-muted text-sm hover:border-gold hover:text-text transition flex-1 min-w-9 max-w-72" title={`Search (${MOD_KEY}+K or /)`}>
        <SearchIcon />
        <span className="hidden lg:inline flex-1 text-left truncate">Search or jump to…</span>
        <span className="hidden xl:inline kbd opacity-70">{MOD_KEY} K</span>
      </button>
      <div className="flex-1" />
      {next && (
        <button className="flex items-center gap-2.5 text-xs text-muted hover:text-text text-right" onClick={() => nav('match')} title="Match Center">
          <div>
            <div className="whitespace-nowrap">{matchToday ? <span className="text-red-400 font-bold">TODAY</span> : 'Next'} vs <span className="text-text font-semibold">{opp?.name ?? 'TBD'}</span></div>
            <div className="whitespace-nowrap">{fmtDate(next.date, { month: 'short', day: 'numeric' })} · {state.competitions[next.competitionId]?.short}</div>
          </div>
          {opp && <TeamLogo team={opp} size={30} />}
        </button>
      )}
      <button className="text-right pl-1" onClick={() => nav('finances')} title="Finances">
        <div className={`font-display text-lg font-bold leading-none ${team.balance < 0 ? 'text-red-400' : 'text-gold2'}`}>{money(team.balance)}</div>
        <div className="text-[11px] text-muted">Balance</div>
      </button>
      <button className={`btn btn-gold px-5 py-2 text-base whitespace-nowrap ${matchToday ? 'pulse-gold' : ''}`} onClick={onContinue} disabled={busy}>
        {busy ? 'Simulating…' : matchToday ? 'Go to match ▶' : 'Continue ▶'} <span className="kbd ml-1 opacity-60 hidden xl:inline">Space</span>
      </button>
    </header>
  );
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className={`shrink-0 ${className}`}>
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" />
      <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
