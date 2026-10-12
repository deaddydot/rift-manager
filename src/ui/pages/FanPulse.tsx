import { useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { FanPersona, FanPost } from '../../engine/types';
import { Panel, Empty, TeamLogo, Bar, Stat, Sparkline, Portrait, num } from '../components/kit';
import { MoodGauge, PostCard, SENTIMENT_COLOR, compact } from '../components/FanPulseWidget';
import { PERSONA_INFO, SCENARIO_META } from '../../engine/management/fanTemplates';
import { moodLabel, expectationLabel, rivalry } from '../../engine/management/fans';
import { loyalty, diehardShare } from '../../engine/management/fanbase';

type Scope = 'mine' | 'world' | 'all';
type Tone = 'all' | 'pos' | 'neg';
const PAGE = 30;
const PERSONAS = Object.keys(PERSONA_INFO) as FanPersona[];

export default function FanPulse(_props: { id?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const team = state.teams[state.userTeamId];
  const fp = state.fanPulse;
  const fm = fp?.teams[team.id];
  const posts = fp?.posts ?? [];
  const [scope, setScope] = useState<Scope>('mine');
  const [persona, setPersona] = useState<FanPersona | null>(null);
  const [tone, setTone] = useState<Tone>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const feed = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return posts.filter((p) =>
      (scope === 'all' || (scope === 'mine' ? p.teamId === team.id : p.teamId !== team.id)) &&
      (!persona || p.persona === persona) &&
      (tone === 'all' || (tone === 'pos' ? p.sentiment > 0 : p.sentiment < 0)) &&
      (!qq || p.text.toLowerCase().includes(qq) || p.user.toLowerCase().includes(qq)));
  }, [posts, v, scope, persona, tone, q]);

  const mine = useMemo(() => posts.filter((p) => p.teamId === team.id), [posts, v]);
  const trending = useMemo(() => {
    const c: Record<string, { n: number; likes: number; s: number }> = {};
    for (const p of mine.slice(0, 60)) {
      const tag = SCENARIO_META[p.topic]?.tag;
      if (!tag) continue;
      const x = (c[tag] ??= { n: 0, likes: 0, s: 0 });
      x.n++; x.likes += p.likes; x.s += p.sentiment;
    }
    return Object.entries(c).sort((a, b) => b[1].likes - a[1].likes).slice(0, 7);
  }, [mine]);
  const talked = useMemo(() => {
    const c: Record<string, { pos: number; neg: number }> = {};
    for (const p of mine) if (p.playerId && state.players[p.playerId]) { const x = (c[p.playerId] ??= { pos: 0, neg: 0 }); if (p.sentiment > 0) x.pos++; else if (p.sentiment < 0) x.neg++; }
    return Object.entries(c).sort((a, b) => b[1].pos + b[1].neg - (a[1].pos + a[1].neg)).slice(0, 6);
  }, [mine]);
  const mix = useMemo(() => {
    const c: Partial<Record<FanPersona, number>> = {};
    for (const p of mine.slice(0, 80)) c[p.persona] = (c[p.persona] ?? 0) + 1;
    return c;
  }, [mine]);
  const fanbases = useMemo(() => Object.entries(fp?.teams ?? {}).map(([id, m]) => ({ t: state.teams[id], m }))
    .filter((x) => x.t && (x.t.leagueId === team.leagueId || x.t.id === team.id || rivalry(state, team.id, x.t.id)))
    .sort((a, b) => b.m.mood - a.m.mood), [fp, v]);
  const loyal = useMemo(() => loyalty(state, team), [state, team, v]);
  const diehards = team.diehard ?? 0;
  const sentiment = mine.slice(0, 40);
  const pos = sentiment.filter((p) => p.sentiment > 0).length, neg = sentiment.filter((p) => p.sentiment < 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Fan Pulse</h1>
          <div className="text-sm text-muted mt-1">What the {team.short} faithful (and everyone else) are saying · {num(team.fans)} fans, {num(diehards)} die-hard</div>
        </div>
        <input className="input w-64" placeholder="Search posts or users…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
      </div>

      {fm ? (
        <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-3 items-stretch">
          <div className="panel-flat px-4 py-2 flex items-center"><MoodGauge mood={fm.mood} size={150} /></div>
          <Stat label="Patience" value={`${Math.round(fm.patience)}`} sub={fm.patience < 25 ? 'Running out' : fm.patience > 70 ? 'Plenty left' : 'Wearing thin'} color={fm.patience < 25 ? '#ef4444' : '#38bdf8'} />
          <Stat label="Expectation" value={expectationLabel(fm.expectation)} sub={fm.preRank ? `Pre-season #${fm.preRank} of ${fm.leagueSize}` : undefined} />
          <Stat label="Streak" value={fm.streak > 0 ? `W${fm.streak}` : fm.streak < 0 ? `L${-fm.streak}` : '—'} sub={<span className="font-display font-bold tracking-wider">{[...fm.form].map((c, i) => <span key={i} className={c === 'W' ? 'text-win' : 'text-loss'}>{c}</span>)}</span>} color={fm.streak > 0 ? '#22c55e' : fm.streak < 0 ? '#ef4444' : undefined} />
          <Stat label="Matchday" value={fm.attendance !== undefined ? `${fm.attendance}% full` : '—'} sub={`Hype ${Math.round(team.hype)} · ${pos}↑ / ${neg}↓ recent posts`} />
        </div>
      ) : <div className="panel p-4 text-sm text-muted">The fans haven’t formed an opinion yet. Play a few matches.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex gap-1.5 flex-wrap items-center">
            {([['mine', `${team.short} fans`], ['world', 'Around the world'], ['all', 'Everything']] as [Scope, string][]).map(([id, l]) => (
              <button key={id} className={`btn py-1 text-xs ${scope === id ? 'btn-gold' : ''}`} onClick={() => { setScope(id); setLimit(PAGE); }}>{id === 'mine' && <TeamLogo team={team} size={16} />}{l}</button>
            ))}
            <span className="w-px h-5 bg-[#1e2a44] mx-1" />
            {([['all', 'All'], ['pos', 'Positive'], ['neg', 'Negative']] as [Tone, string][]).map(([id, l]) => (
              <button key={id} className={`chip px-2.5 py-0.5 text-[11px] ${tone === id ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => { setTone(id); setLimit(PAGE); }}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {PERSONAS.map((p) => {
              const i = PERSONA_INFO[p], on = persona === p;
              return <button key={p} className="chip px-2 py-0.5 text-[11px]" style={on ? { color: i.color, borderColor: i.color, background: i.color + '22' } : { color: i.color + 'cc' }} onClick={() => { setPersona(on ? null : p); setLimit(PAGE); }}>{i.label}</button>;
            })}
          </div>
          {feed.length === 0 ? <div className="panel"><Empty>No posts match these filters.</Empty></div> : (
            <div className="space-y-2">{feed.slice(0, limit).map((p: FanPost) => <PostCard key={p.id} state={state} p={p} />)}</div>
          )}
          {feed.length > limit && <div className="text-center"><button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Load more ({feed.length - limit})</button></div>}
        </div>

        <div className="space-y-4">
          <Panel title="Fan base">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Die-hard" value={num(diehards)} sub={`${Math.round(diehardShare(team) * 100)}% · stay win or lose`} color="#f0c674" />
              <Stat label="Casual" value={num(team.fans - diehards)} sub="come and go with results" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mt-3 mb-1">What keeps them loyal · {loyal.total.toFixed(2)}</div>
            <div className="space-y-1">
              <Bar label="Club history & honours" value={loyal.history} max={0.35} color="#c8aa6e" showValue={false} height={5} />
              <Bar label="Players they love" value={loyal.players} max={0.3} color="#38bdf8" showValue={false} height={5} />
              <Bar label="Community (content studio)" value={loyal.community} max={0.075} color="#a78bfa" showValue={false} height={5} />
            </div>
            <div className="mt-3 space-y-1.5">
              {loyal.bonds.filter((b) => b.bond > 0.004).slice(0, 5).map((b) => {
                const p = state.players[b.id];
                return (
                  <button key={b.id} className="w-full flex items-center gap-2 text-left hover:bg-[#111a2e] rounded px-1 py-0.5" onClick={() => nav('player', b.id)}>
                    <Portrait player={p} team={team} size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.handle} <span className="text-[11px] text-dim font-normal">~{num(Math.round(diehards * b.bond / loyal.total))} follow him</span></div>
                      <div className="text-[11px] text-dim truncate">{b.reasons.join(' · ')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-dim mt-2 leading-relaxed">Years at the club, personality, streaming, starting every week and local roots turn casual fans into die-hards over months. Sell a favourite and some of his followers leave with him.</div>
          </Panel>
          {fm?.trend && fm.trend.length > 1 && (
            <Panel title="Mood over time">
              <Sparkline data={fm.trend} width={300} height={60} color={moodLabel(fm.mood).color} zero />
              <div className="text-[11px] text-dim mt-1">Weekly fan mood, last {fm.trend.length} weeks</div>
            </Panel>
          )}
          <Panel title="Trending" bodyClass="p-0">
            {trending.length === 0 ? <div className="px-4 py-3 text-xs text-dim">Nothing trending yet.</div> : trending.map(([tag, x]) => (
              <div key={tag} className="px-4 py-2 border-b border-[#141e33] last:border-0 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: SENTIMENT_COLOR[Math.max(-2, Math.min(2, Math.round(x.s / x.n)))] }} />
                <span className="flex-1 text-sm font-semibold truncate">#{team.short.replace(/[^A-Za-z0-9]/g, '')}{tag}</span>
                <span className="text-[11px] text-dim">{x.n} posts · ♥ {compact(x.likes)}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Most talked-about players" bodyClass="p-0">
            {talked.length === 0 ? <div className="px-4 py-3 text-xs text-dim">No player chatter yet.</div> : talked.map(([id, x]) => {
              const p = state.players[id];
              return (
                <button key={id} className="w-full px-4 py-2 border-b border-[#141e33] last:border-0 flex items-center gap-2.5 text-left hover:bg-[#111a2e]" onClick={() => nav('player', id)}>
                  <Portrait player={p} team={p.teamId ? state.teams[p.teamId] : null} size={28} />
                  <span className="flex-1 text-sm font-semibold truncate">{p.handle}</span>
                  <span className="text-[11px] text-win">▲{x.pos}</span><span className="text-[11px] text-loss">▼{x.neg}</span>
                  <span className="text-[11px] text-dim w-14 text-right">morale {Math.round(p.morale)}</span>
                </button>
              );
            })}
          </Panel>
          <Panel title="Who is posting">
            <div className="space-y-1">{PERSONAS.filter((p) => mix[p]).sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0)).map((p) => (
              <Bar key={p} label={PERSONA_INFO[p].label} value={mix[p] ?? 0} max={Math.max(1, ...Object.values(mix).map((n) => n ?? 0))} color={PERSONA_INFO[p].color} showValue={false} height={5} />
            ))}</div>
          </Panel>
          <Panel title="Fanbase moods" bodyClass="p-0">
            {fanbases.length === 0 ? <div className="px-4 py-3 text-xs text-dim">—</div> : fanbases.map(({ t, m }) => {
              const l = moodLabel(m.mood);
              return (
                <button key={t.id} className="w-full px-4 py-1.5 border-b border-[#141e33] last:border-0 flex items-center gap-2 text-left hover:bg-[#111a2e]" onClick={() => nav('team', t.id)}>
                  <TeamLogo team={t} size={20} />
                  <span className={`flex-1 text-sm truncate ${t.id === team.id ? 'text-gold2 font-semibold' : ''}`}>{t.short}</span>
                  <span className="text-[11px] font-semibold" style={{ color: l.color }}>{l.label}</span>
                  <span className="text-[11px] text-dim w-8 text-right">{m.mood > 0 ? '+' : ''}{Math.round(m.mood)}</span>
                </button>
              );
            })}
          </Panel>
        </div>
      </div>
    </div>
  );
}
