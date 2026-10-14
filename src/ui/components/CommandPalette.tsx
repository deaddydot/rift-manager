// Quick-jump command palette (Ctrl/Cmd+K): pages, actions, players, teams, competitions, champions.
import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import type { GameState } from '../../engine/types';
import { ROLE_LABEL } from '../../engine/types';
import { nav, type Route } from '../../store/game';
import { gd } from '../../data/gamedata';
import { HUBS, PALETTE_SHORTCUTS, describeRoute, visibleHubs } from '../nav/config';
import { useDevTools } from '../cheats';
import type { Attention } from '../nav/attention';
import { Portrait, TeamLogo, ChampIcon } from './kit';
import { SearchIcon } from './Nav';

export interface PaletteAction { id: string; label: string; icon: string; hint?: string; keywords?: string; run: () => void }
interface Hit { key: string; group: string; label: string; sub?: string; icon: ReactNode; hint?: string; score: number; run: () => void }

const norm = (s: string | undefined) => (s ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : '');
const SEP = new Set([' ', '-', '.', '_', '(', '/', '&']);
/** 100 exact, ~85 prefix, 60 word-prefix, 40 substring, 0 no match. */
function matchScore(q: string, t: string): number {
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 85 - Math.min(15, t.length - q.length);
  const i = t.indexOf(q);
  if (i < 0) return 0;
  return SEP.has(t[i - 1]) ? 60 : 40;
}
/** Best score across fields; multi-word queries fall back to "every word appears somewhere". */
function best(q: string, words: string[], fields: (string | undefined)[], weights?: number[]): number {
  let s = 0;
  fields.forEach((f, i) => { s = Math.max(s, matchScore(q, f ?? '') * (weights?.[i] ?? 1)); });
  if (!s && words.length > 1) { const hay = fields.join(' '); if (words.every((w) => hay.includes(w))) s = 30; }
  return s;
}

const GROUP_LIMIT: Record<string, number> = { Pages: 6, Actions: 3, Players: 7, Teams: 6, Competitions: 5, Champions: 5 };

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span className="text-gold2 underline decoration-gold/60 underline-offset-2">{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>;
}

export default function CommandPalette({ state, attention, recents, current, actions, onClose }: {
  state: GameState; attention: Attention[]; recents: Route[]; current: string; actions: PaletteAction[]; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const go = (fn: () => void) => { onClose(); fn(); };

  const dev = useDevTools();
  // searchable index, built once per opening
  const index = useMemo(() => ({
    players: Object.values(state.players).map((p) => ({ p, f: [norm(p.handle), norm(p.name), norm(p.nativeName)] })),
    teams: Object.values(state.teams).map((t) => ({ t, f: [norm(t.name), norm(t.short)] })),
    comps: Object.values(state.competitions).map((c) => ({ c, f: [norm(c.name), norm(c.short)] })),
    champs: gd().champions.map((c) => ({ c, f: [norm(c.name), norm(c.id)] })),
    pages: visibleHubs(dev).flatMap((h) => h.pages.map((p) => ({ p, h, f: [norm(p.label), norm(h.label), norm(p.keywords)] }))),
  }), [state, dev]);

  const hits = useMemo<Hit[]>(() => {
    const query = norm(q.trim());
    const out: Hit[] = [];
    const pageHit = (page: string, label: string, icon: string, sub: string | undefined, score: number, route: [string, string?, string?] = [page]): Hit =>
      ({ key: 'page:' + route.join('/'), group: 'Pages', label, sub, icon: <span className="text-lg leading-none">{icon}</span>, hint: 'Page', score, run: () => nav(...route) });

    if (!query) {
      attention.filter((a) => a.todo !== false).forEach((a, i) => {
        const p = HUBS.flatMap((h) => h.pages).find((x) => x.page === a.page);
        const color = a.level === 'info' ? (a.n ? '#c8aa6e' : '#0ac8b9') : '#ef4444';
        out.push({ key: 'att:' + i, group: 'Needs attention', label: a.text, sub: p?.label, icon: <span className="w-2.5 h-2.5 rounded-full mx-[7px]" style={{ background: color }} />, hint: 'Go', score: 0, run: () => nav(...(a.route ?? [a.page])) });
      });
      recents.filter((r) => [r.page, r.id, r.tab].filter(Boolean).join('/') !== current).slice(0, 6).forEach((r) => {
        const d = describeRoute(r, state);
        if (d) out.push({ key: 'recent:' + [r.page, r.id, r.tab].join('/'), group: 'Recent', label: d.label, sub: d.sub, icon: <span className="text-lg leading-none">{d.icon}</span>, hint: 'Recent', score: 0, run: () => nav(r.page, r.id, r.tab) });
      });
      actions.forEach((a) => out.push({ key: 'act:' + a.id, group: 'Actions', label: a.label, icon: <span className="text-lg leading-none">{a.icon}</span>, hint: a.hint, score: 0, run: a.run }));
      index.pages.forEach(({ p, h }) => out.push(pageHit(p.page, p.label, p.icon, h.pages.length > 1 ? h.label : undefined, 0)));
      return out;
    }

    const words = query.split(/\s+/).filter(Boolean);
    const scored: { group: string; score: number; make: () => Hit }[] = [];
    for (const { p, h, f } of index.pages) {
      const s = best(query, words, f, [1, 0.7, 0.65]);
      if (s) scored.push({ group: 'Pages', score: s + 8, make: () => pageHit(p.page, p.label, p.icon, h.pages.length > 1 ? h.label : undefined, s + 8) });
    }
    for (const sc of PALETTE_SHORTCUTS) {
      const s = best(query, words, [norm(sc.label), norm(sc.keywords)], [1, 0.65]);
      if (s) scored.push({ group: 'Pages', score: s + 4, make: () => pageHit(sc.route[0], sc.label, sc.icon, 'World', s + 4, sc.route) });
    }
    for (const a of actions) {
      const s = best(query, words, [norm(a.label), norm(a.keywords)], [1, 0.65]);
      if (s) scored.push({ group: 'Actions', score: s + 6, make: () => ({ key: 'act:' + a.id, group: 'Actions', label: a.label, icon: <span className="text-lg leading-none">{a.icon}</span>, hint: a.hint, score: s + 6, run: a.run }) });
    }
    for (const { p, f } of index.players) {
      let s = best(query, words, [...f, norm(p.teamId ? state.teams[p.teamId]?.short : '')], [1, 0.9, 0.9, 0]);
      if (!s) continue;
      s += (p.teamId === state.userTeamId ? 12 : 0) + (p.teamId ? 3 : 0) + p.reputation / 10 - (p.retired ? 20 : 0);
      scored.push({ group: 'Players', score: s, make: () => {
        const t = p.teamId ? state.teams[p.teamId] : null;
        return { key: 'player:' + p.id, group: 'Players', label: p.handle, sub: [p.name !== p.handle ? p.name : '', ROLE_LABEL[p.role], p.retired ? 'Retired' : t ? t.name : 'Free agent'].filter(Boolean).join(' · '), icon: <Portrait player={p} team={t} size={28} />, hint: 'Player', score: s, run: () => nav('player', p.id) };
      } });
    }
    for (const { t, f } of index.teams) {
      let s = best(query, words, f, [1, 1]);
      if (!s) continue;
      const lg = state.leagues[t.leagueId];
      s += t.prestige / 10 + (t.id === state.userTeamId ? 10 : 0) + (lg?.tier === 1 ? 5 : 0) - (t.parentTeamId ? 3 : 0);
      scored.push({ group: 'Teams', score: s, make: () => ({ key: 'team:' + t.id, group: 'Teams', label: t.name, sub: [t.short !== t.name ? t.short : '', lg?.name].filter(Boolean).join(' · '), icon: <TeamLogo team={t} size={28} />, hint: 'Team', score: s, run: () => nav('team', t.id) }) });
    }
    for (const { c, f } of index.comps) {
      let s = best(query, words, f, [1, 1]);
      if (!s) continue;
      s += (c.season === state.season ? 10 : -5 * Math.abs(state.season - c.season)) + (c.status === 'active' ? 5 : 0) + (5 - Math.min(5, c.tier));
      scored.push({ group: 'Competitions', score: s, make: () => ({ key: 'comp:' + c.id, group: 'Competitions', label: c.name, sub: `${c.season} · ${c.status === 'active' ? 'In progress' : c.status === 'done' ? 'Finished' : 'Upcoming'}`, icon: <span className="text-lg leading-none">🏆</span>, hint: 'Competition', score: s, run: () => nav('competition', c.id) }) });
    }
    for (const { c, f } of index.champs) {
      const s = best(query, words, f, [1, 0.9]);
      if (!s) continue;
      scored.push({ group: 'Champions', score: s, make: () => ({ key: 'champ:' + c.id, group: 'Champions', label: c.name, sub: [c.title, c.positions.map((r) => ROLE_LABEL[r]).join('/')].filter(Boolean).join(' · '), icon: <ChampIcon id={c.id} size={28} />, hint: 'Champion', score: s, run: () => nav('champions', c.id) }) });
    }

    // top N per group, groups ordered by their best hit
    const groups = new Map<string, typeof scored>();
    for (const x of scored) { const g = groups.get(x.group) ?? []; g.push(x); groups.set(x.group, g); }
    const ordered = [...groups.entries()].map(([g, xs]) => { xs.sort((a, b) => b.score - a.score); return [g, xs.slice(0, GROUP_LIMIT[g] ?? 5)] as const; })
      .sort((a, b) => b[1][0].score - a[1][0].score);
    for (const [, xs] of ordered) for (const x of xs) out.push(x.make());
    return out;
  }, [q, index, attention, recents, actions, state, current]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) { e.preventDefault(); setIdx((i) => (hits.length ? (i + 1) % hits.length : 0)); }
    else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) { e.preventDefault(); setIdx((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 6)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 6)); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[idx]; if (h) go(h.run); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const qLower = q.trim().toLowerCase();
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex justify-center items-start pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="panel w-full max-w-[640px] overflow-hidden shadow-2xl shadow-black/70 fadein" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Quick jump">
        <div className="flex items-center gap-3 px-4 h-14 border-b hairline">
          <SearchIcon className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to a page, player, team, competition, champion…"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-dim"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={hits[idx] ? `pal-${idx}` : undefined}
          />
          <span className="kbd text-muted">Esc</span>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[58vh] overflow-y-auto py-1.5">
          {!hits.length && <div className="px-4 py-8 text-center text-muted text-sm">Nothing matches “{q}”.</div>}
          {hits.map((h, i) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            const on = i === idx;
            return (
              <div key={h.key}>
                {header && <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-widest text-dim font-bold">{header}</div>}
                <button
                  id={`pal-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => { if (!on) setIdx(i); }}
                  onClick={() => go(h.run)}
                  className={`w-full flex items-center gap-3 px-4 py-1.5 text-left border-l-2 ${on ? 'bg-[#16213a] border-gold' : 'border-transparent'}`}
                >
                  <span className="w-7 h-7 flex items-center justify-center shrink-0">{h.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${on ? 'text-text' : 'text-text/90'}`}><Highlight text={h.label} q={qLower} /></span>
                    {h.sub && <span className="block text-[11px] text-muted truncate">{h.sub}</span>}
                  </span>
                  {h.hint && <span className={`text-[11px] shrink-0 ${on ? 'text-gold' : 'text-dim'}`}>{on ? '↵ ' : ''}{h.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t hairline text-[11px] text-dim">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span><span className="kbd">Esc</span> close</span>
          <span className="flex-1" />
          <span>Searches pages, players, teams, competitions &amp; champions</span>
        </div>
      </div>
    </div>
  );
}
