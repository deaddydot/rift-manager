import { useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { NewsItem, GameState } from '../../engine/types';
import { Panel, Empty, TeamLogo, Portrait, money, fmtDate } from '../components/kit';

const TAG_COLOR: Record<string, string> = {
  transfer: '#38bdf8', title: '#f0c674', patch: '#a78bfa', promotion: '#4ade80', competition: '#0ac8b9', retirement: '#94a3b8',
  sponsor: '#f472b6', staff: '#fb923c', international: '#facc15', playoffs: '#f97316',
  buzz: '#e879f9', lore: '#c084fc',
};
const BASE_TAGS = ['transfer', 'title', 'patch', 'promotion', 'competition', 'retirement'];
const tagColor = (t: string) => TAG_COLOR[t] ?? '#8a97b3';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PAGE = 40;

function daysAgo(state: GameState, d: string) {
  const n = Math.round((new Date(state.date + 'T00:00:00Z').getTime() - new Date(d + 'T00:00:00Z').getTime()) / 864e5);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? `${n} days ago` : n < 30 ? `${Math.floor(n / 7)} week${n < 14 ? '' : 's'} ago` : fmtDate(d);
}

export default function News(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const user = state.teams[state.userTeamId];
  const [tag, setTag] = useState<string>('all');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of state.news) for (const t of n.tags) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [state.news, v]);
  const tags = useMemo(() => [...BASE_TAGS, ...Object.keys(counts).filter((t) => !BASE_TAGS.includes(t)).sort((a, b) => counts[b] - counts[a])], [counts]);

  const involvesUser = (n: NewsItem) => !!n.teamIds?.includes(user.id) || !!n.playerIds?.some((id) => state.players[id]?.teamId === user.id);
  const feed = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return state.news.filter((n) =>
      (tag === 'all' || n.tags.includes(tag)) &&
      (!mine || involvesUser(n)) &&
      (!qq || n.headline.toLowerCase().includes(qq) || n.body.toLowerCase().includes(qq) ||
        n.teamIds?.some((id) => state.teams[id]?.name.toLowerCase().includes(qq)) ||
        n.playerIds?.some((id) => state.players[id]?.handle.toLowerCase().includes(qq))));
  }, [state.news, v, tag, mine, q]);

  // group visible items by date
  const groups = useMemo(() => {
    const out: { date: string; items: NewsItem[] }[] = [];
    for (const n of feed.slice(0, limit)) {
      const g = out[out.length - 1];
      if (g && g.date === n.date) g.items.push(n);
      else out.push({ date: n.date, items: [n] });
    }
    return out;
  }, [feed, limit]);

  const mentioned = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of state.news.slice(0, 200)) for (const id of n.teamIds ?? []) c[id] = (c[id] ?? 0) + 1;
    return Object.entries(c).filter(([id]) => state.teams[id]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [state.news, v]);
  const myNews = useMemo(() => state.news.filter(involvesUser).slice(0, 5), [state.news, v]);
  const transfers = useMemo(() => state.news.filter((n) => n.tags.includes('transfer')).slice(0, 6), [state.news, v]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">News</h1>
          <div className="text-sm text-muted mt-1">Around the world of League esports · {state.news.length} stories</div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-60" placeholder="Search headlines, teams, players…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          <button className={`btn ${mine ? 'btn-gold' : ''}`} onClick={() => { setMine(!mine); setLimit(PAGE); }}>
            <TeamLogo team={user} size={18} /> My club
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button className={`chip px-3 py-1 text-xs ${tag === 'all' ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => { setTag('all'); setLimit(PAGE); }}>All <span className="text-dim">{state.news.length}</span></button>
        {tags.map((t) => (
          <button key={t} className={`chip px-3 py-1 text-xs ${tag === t ? 'text-gold2' : 'hover:text-text'}`}
            style={tag === t ? { borderColor: tagColor(t), background: tagColor(t) + '22' } : { color: counts[t] ? tagColor(t) : '#5b6787' }}
            onClick={() => { setTag(t); setLimit(PAGE); }}>
            {cap(t)} <span className="text-dim">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4 min-w-0">
          {groups.length === 0 ? <div className="panel"><Empty>No stories match these filters.</Empty></div> : groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-display text-sm font-bold uppercase tracking-wider text-gold2">{fmtDate(g.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="text-xs text-dim">{daysAgo(state, g.date)}</span>
                <span className="flex-1 border-t hairline" />
              </div>
              <div className="space-y-2.5">
                {g.items.map((n) => <NewsCard key={n.id} n={n} state={state} highlight={involvesUser(n)} onTag={(t) => { setTag(t); setLimit(PAGE); }} />)}
              </div>
            </div>
          ))}
          {feed.length > limit && (
            <div className="text-center">
              <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Load more ({feed.length - limit} older)</button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel title={`${user.short} in the news`}>
            {myNews.length === 0 ? <div className="text-xs text-dim">No stories about your club yet.</div> : (
              <div className="space-y-2.5">
                {myNews.map((n) => (
                  <div key={n.id} className="text-sm">
                    <div className="font-semibold leading-snug">{n.headline}</div>
                    <div className="text-[11px] text-dim">{fmtDate(n.date)} · {n.tags.map(cap).join(', ')}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Latest transfers" bodyClass="p-0">
            {transfers.length === 0 ? <div className="px-4 py-3 text-xs text-dim">No transfers reported yet.</div> : transfers.map((n) => {
              const p = n.playerIds?.[0] ? state.players[n.playerIds[0]] : undefined;
              const t = p?.teamId ? state.teams[p.teamId] : n.teamIds?.[0] ? state.teams[n.teamIds[0]] : undefined;
              return (
                <button key={n.id} className="w-full flex items-center gap-2.5 px-4 py-2 border-b border-[#141e33] last:border-0 text-left hover:bg-[#111a2e]" onClick={() => p ? nav('player', p.id) : t && nav('team', t.id)}>
                  {p ? <Portrait player={p} team={t} size={30} /> : <TeamLogo team={t} size={30} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{n.headline}</div>
                    <div className="text-[11px] text-dim">{fmtDate(n.date, { month: 'short', day: 'numeric' })}{p ? ` · value ${money(p.value)}` : ''}</div>
                  </div>
                  {t && <TeamLogo team={t} size={20} />}
                </button>
              );
            })}
          </Panel>

          <Panel title="Most covered teams" bodyClass="p-0">
            {mentioned.length === 0 ? <div className="px-4 py-3 text-xs text-dim">—</div> : mentioned.map(([id, n]) => (
              <button key={id} className="w-full flex items-center gap-2.5 px-4 py-1.5 border-b border-[#141e33] last:border-0 text-left hover:bg-[#111a2e]" onClick={() => nav('team', id)}>
                <TeamLogo team={state.teams[id]} size={22} />
                <span className={`flex-1 text-sm truncate ${id === user.id ? 'text-gold2 font-semibold' : ''}`}>{state.teams[id].name}</span>
                <span className="text-xs text-muted font-display font-bold">{n}</span>
              </button>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NewsCard({ n, state, highlight, onTag }: { n: NewsItem; state: GameState; highlight: boolean; onTag: (t: string) => void }) {
  const teams = (n.teamIds ?? []).map((id) => state.teams[id]).filter(Boolean);
  const players = (n.playerIds ?? []).map((id) => state.players[id]).filter(Boolean);
  const mainColor = tagColor(n.tags[0] ?? '');
  const manyTeams = teams.length > 6;
  return (
    <article className="panel p-4 flex gap-4" style={{ boxShadow: `inset 3px 0 0 ${highlight ? '#c8aa6e' : mainColor + '88'}` }}>
      {teams.length > 0 && teams.length <= 2 && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {teams.map((t) => (
            <button key={t.id} title={t.name} onClick={() => nav('team', t.id)} className="rounded-lg p-1 hover:bg-[#16213a]"><TeamLogo team={t} size={teams.length === 1 ? 48 : 36} /></button>
          ))}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {n.tags.map((t) => (
            <button key={t} className="chip py-0 text-[10.5px]" style={{ color: tagColor(t), borderColor: tagColor(t) + '55', background: tagColor(t) + '14' }} onClick={() => onTag(t)}>{cap(t)}</button>
          ))}
          {highlight && <span className="chip py-0 text-[10.5px] text-gold2 border-gold/50">Your club</span>}
        </div>
        <h3 className="font-display text-xl font-bold leading-snug">{n.headline}</h3>
        {n.body && <p className="text-sm text-muted mt-1 leading-relaxed whitespace-pre-line">{n.body}</p>}
        {(players.length > 0 || teams.length > 2) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
            {players.map((p) => {
              const t = p.teamId ? state.teams[p.teamId] : null;
              return (
                <button key={p.id} onClick={() => nav('player', p.id)} className="flex items-center gap-1.5 rounded-full border border-line2 bg-[#0a1120] pl-0.5 pr-2.5 py-0.5 hover:border-gold">
                  <Portrait player={p} team={t} size={22} className="rounded-full" />
                  <span className="text-xs font-semibold">{p.handle}</span>
                  {t && <TeamLogo team={t} size={14} />}
                </button>
              );
            })}
            {teams.length > 2 && (manyTeams ? teams.slice(0, 12) : teams).map((t) => (
              <button key={t.id} title={t.name} onClick={() => nav('team', t.id)} className="flex items-center gap-1 rounded-full border border-line2 bg-[#0a1120] pl-1 pr-2 py-0.5 hover:border-gold">
                <TeamLogo team={t} size={16} />
                <span className="text-[11px] font-semibold">{t.short}</span>
              </button>
            ))}
            {manyTeams && teams.length > 12 && <span className="text-[11px] text-dim">+{teams.length - 12} more</span>}
          </div>
        )}
      </div>
    </article>
  );
}
