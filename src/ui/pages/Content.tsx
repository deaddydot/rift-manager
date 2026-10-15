// Content: what creators post about the club (watch it: each video plays back as a slideshow with narration and a
// comment section) and the club's own channel (produce vlogs, game shows, talk shows… with your players and a hired
// host / MC; hire the crew). Engines: engine/management/content.ts (creators) and orgContent.ts (the channel).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { CreatorVideo, Creator, GameState, Team, Player, VideoScene, FanReply, ContentUpload, ContentCrew } from '../../engine/types';
import { Panel, Stat, Portrait, TeamLogo, Avatar, Bar, Pill, Empty, Tabs, Modal, num, money, fmtDate, ratingColor } from '../components/kit';
import { PERSONA_INFO } from '../../engine/management/fanTemplates';
import { contentState, creatorById, STYLE_LABEL, KIND_LABEL, weeklyCoverage } from '../../engine/management/content';
import {
  FORMATS, FORMAT_IDS, BUDGETS, channelOf, hostOf, editorOf, capacity, estimate, produce, onCamera, hostScore, qualityLabel, qualityColor,
  crewPool, hireCrew, fireCrew, STAT_LABEL,
} from '../../engine/management/orgContent';
import { reachEngagement, communityEngagement, aiEngagement } from '../../engine/management/contentFx';
import { personaOf } from '../../engine/management/persona';
import type { OrgFormat, VideoKind, CreatorStyle } from '../../engine/management/contentTemplates';

type Tab = 'creators' | 'channel' | 'crew';
const TONE_COLOR = (t: number) => (t > 0 ? '#22c55e' : t < 0 ? '#ef4444' : '#c8aa6e');
const ago = (state: GameState, d: string) => {
  const n = Math.round((new Date(state.date).getTime() - new Date(d).getTime()) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? `${n} days ago` : n < 30 ? `${Math.floor(n / 7)} week${n < 14 ? '' : 's'} ago` : fmtDate(d);
};

export default function Content(_props: { id?: string }) {
  const state = useGame();
  useStore((s) => s.v);
  const [tab, setTab] = useState<Tab>('creators');
  const cs = contentState(state);
  const unseen = cs.videos.filter((v) => !v.seen).length;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold gold-text leading-none">Content</h1>
        <div className="text-sm text-muted mt-1">What the internet makes of {state.teams[state.userTeamId].name} — and what you put out yourselves.</div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'creators', label: <>Creators{unseen ? <span className="ml-1.5 chip px-1.5 py-0 text-[10px] text-gold2 border-gold/50">{unseen} new</span> : null}</> },
        { id: 'channel', label: 'Our channel' },
        { id: 'crew', label: 'Crew' },
      ]} />
      {tab === 'creators' && <CreatorsTab />}
      {tab === 'channel' && <ChannelTab />}
      {tab === 'crew' && <CrewTab />}
    </div>
  );
}

// ------------------------------------------------------------------ creators
function CreatorsTab() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const team = state.teams[state.userTeamId];
  const cs = contentState(state);
  const [kind, setKind] = useState<string | null>(null);
  const [tone, setTone] = useState<'all' | 'pos' | 'neg'>('all');
  const [watch, setWatch] = useState<string | null>(null);
  const vids = cs.videos.filter((v) => (!kind || v.kind === kind) && (tone === 'all' || (tone === 'pos' ? v.tone > 0 : v.tone < 0)));
  const month = cs.videos.filter((v) => v.date > new Date(new Date(state.date).getTime() - 30 * 864e5).toISOString().slice(0, 10));
  const views = month.reduce((s, v) => s + v.views, 0);
  const pos = month.filter((v) => v.tone > 0).length, neg = month.filter((v) => v.tone < 0).length;
  const kinds = [...new Set(cs.videos.map((v) => v.kind))];
  const creators = useMemo(() => {
    const by = new Map<string, { c: Creator; n: number; views: number; tone: number }>();
    for (const v of cs.videos) {
      const c = creatorById(state, v.creatorId);
      if (!c) continue;
      const x = by.get(c.id) ?? { c, n: 0, views: 0, tone: 0 };
      x.n++; x.views += v.views; x.tone += v.tone;
      by.set(c.id, x);
    }
    return [...by.values()].sort((a, b) => b.views - a.views).slice(0, 8);
  }, [cs.videos.length]);
  const current = watch ? cs.videos.find((v) => v.id === watch) : undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Videos (30 days)" value={month.length} sub={`~${weeklyCoverage(state, team).toFixed(1)} a week at your profile`} />
        <Stat label="Views (30 days)" value={num(views)} sub="Across every channel covering you" />
        <Stat label="Tone" value={<span><span className="text-win">{pos}↑</span> <span className="text-loss">{neg}↓</span></span>} sub="Positive / negative videos" />
        <Stat label="Unwatched" value={cs.videos.filter((v) => !v.seen).length} sub="New since you last looked" color="#c8aa6e" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex gap-1.5 flex-wrap items-center">
            <button className={`chip px-2.5 py-0.5 text-[11px] ${!kind ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setKind(null)}>All</button>
            {kinds.map((k) => <button key={k} className={`chip px-2.5 py-0.5 text-[11px] ${kind === k ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setKind(kind === k ? null : k)}>{KIND_LABEL[k as VideoKind] ?? k}</button>)}
            <span className="w-px h-5 bg-[#1e2a44] mx-1" />
            {(['all', 'pos', 'neg'] as const).map((t) => <button key={t} className={`chip px-2.5 py-0.5 text-[11px] ${tone === t ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setTone(t)}>{t === 'all' ? 'Any tone' : t === 'pos' ? 'Positive' : 'Negative'}</button>)}
          </div>
          {vids.length === 0 ? <div className="panel"><Empty>{cs.videos.length ? 'No videos match.' : 'No creator has made a video about your club yet. Results, signings, big matches and your own uploads get you noticed — bigger clubs draw more coverage.'}</Empty></div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
              {vids.map((v) => (
                <button key={v.id} className="text-left group" onClick={() => { v.seen = true; setWatch(v.id); bump(); }}>
                  <Thumb state={state} v={v} team={team} />
                  <div className="flex gap-2 mt-2">
                    <CreatorBadge c={creatorById(state, v.creatorId)} size={30} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-gold2">{v.title}</div>
                      <div className="text-[11px] text-dim truncate">{creatorById(state, v.creatorId)?.channel} · {num(v.views)} views · {ago(state, v.date)}</div>
                    </div>
                    {!v.seen && <span className="ml-auto w-2 h-2 rounded-full bg-gold2 shrink-0 mt-1.5" title="New" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Panel title="Who covers you" bodyClass="p-0">
            {creators.length === 0 ? <div className="px-4 py-3 text-xs text-dim">Nobody yet.</div> : creators.map(({ c, n, views: vv, tone: t }) => (
              <div key={c.id} className="px-4 py-2 border-b border-[#141e33] last:border-0 flex items-center gap-2.5">
                <CreatorBadge c={c} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{c.channel}</div>
                  <div className="text-[11px] text-dim truncate">{c.name} · {STYLE_LABEL[c.style as CreatorStyle]} · {num(c.subs)} subs</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold" style={{ color: TONE_COLOR(Math.sign(Math.round(t / Math.max(1, n) * 2))) }}>{t / n > 0.3 ? 'Friendly' : t / n < -0.3 ? 'Critical' : 'Neutral'}</div>
                  <div className="text-[10px] text-dim">{n} video{n > 1 ? 's' : ''} · {num(vv)}</div>
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="How coverage works">
            <div className="text-[11px] text-muted leading-relaxed space-y-2">
              <p>Creators react to your series, signings and departures, big matches, scrim leaks and your own uploads, and make tier lists, power rankings and breakdowns along the way. Bigger clubs and more hype draw more and bigger channels.</p>
              <p>Positive videos lift hype and fan mood. Negative ones dent them, and players who get called out lose morale (big egos and low composure take it hardest). Any exposure brings in a few curious fans.</p>
            </div>
          </Panel>
        </div>
      </div>
      {current && <VideoPlayer state={state} v={current} team={team} onClose={() => setWatch(null)} />}
    </div>
  );
}

function CreatorBadge({ c, size = 32 }: { c?: Creator; size?: number }) {
  if (!c) return <div style={{ width: size, height: size }} className="rounded-full bg-slate-800 shrink-0" />;
  const initials = c.channel.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+|(?=[A-Z])/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className="rounded-full shrink-0 flex items-center justify-center font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${c.color}, ${c.color}88)`, color: '#0b0f19' }}>{initials || '▶'}</div>;
}

/** YouTube-style thumbnail: club colours, a face, big words. */
function Thumb({ state, v, team, big }: { state: GameState; v: CreatorVideo; team: Team; big?: boolean }) {
  const p = v.playerIds?.[0] ? state.players[v.playerIds[0]] : undefined;
  const c = creatorById(state, v.creatorId);
  const accent = TONE_COLOR(v.tone);
  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-[#1e2a44]" style={{ background: `linear-gradient(135deg, ${team.colors[0]}cc, #0b1220 55%, ${c?.color ?? team.colors[1]}88)` }}>
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 75% 40%, ${accent}66, transparent 55%)` }} />
      {p && <div className="absolute right-0 bottom-0 h-[92%] aspect-square"><Portrait player={p} team={team} size={big ? 260 : 150} className="!w-full !h-full !rounded-none opacity-95" /></div>}
      <div className="absolute left-3 top-3"><TeamLogo team={team} size={big ? 44 : 26} /></div>
      <div className={`absolute left-3 bottom-3 right-[42%] font-display font-black leading-none uppercase ${big ? 'text-5xl' : 'text-2xl'}`} style={{ color: '#fff', textShadow: `0 2px 0 #000, 0 0 12px ${accent}` , WebkitTextStroke: '1px #000' }}>{v.thumb}</div>
      <div className="absolute right-1.5 bottom-1.5 bg-black/80 text-white text-[10px] font-semibold px-1 rounded">{v.mins}:{String((v.views % 50) + 10).padStart(2, '0')}</div>
      <div className="absolute right-1.5 top-1.5 text-[10px] font-bold px-1.5 rounded" style={{ background: accent, color: '#0b0f19' }}>{KIND_LABEL[v.kind as VideoKind] ?? v.kind}</div>
    </div>
  );
}

const SCENE_MS = 5200;
/** Plays a creator video: scene by scene with the narration as subtitles, chapter bar, comments. */
function VideoPlayer({ state, v, team, onClose }: { state: GameState; v: CreatorVideo; team: Team; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [t0, setT0] = useState(() => performance.now());
  const [, tick] = useState(0);
  const n = v.scenes.length;
  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => {
      tick((x) => x + 1);
      if (performance.now() - t0 >= SCENE_MS) { if (i < n - 1) { setI(i + 1); setT0(performance.now()); } else setPlaying(false); }
    }, 100);
    return () => clearInterval(h);
  }, [playing, i, t0, n]);
  const go = (k: number) => { setI(Math.max(0, Math.min(n - 1, k))); setT0(performance.now()); setPlaying(true); };
  const frac = playing ? Math.min(1, (performance.now() - t0) / SCENE_MS) : 1;
  const c = creatorById(state, v.creatorId);
  const s = v.scenes[i];
  return (
    <Modal open onClose={onClose} title={<span className="text-base">{v.title}</span>} width={980}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="min-w-0">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-[#05080f] border border-[#1e2a44] select-none" onClick={() => setPlaying(!playing)}>
            <Scene state={state} v={v} s={s} team={team} c={c} />
            <div className="absolute left-0 right-0 bottom-0 px-6 pb-4 pt-10" style={{ background: 'linear-gradient(transparent, #000c)' }}>
              <div className="text-center text-[15px] leading-snug text-white font-semibold" style={{ textShadow: '0 1px 2px #000' }}>{s.cap}</div>
            </div>
            {!playing && <div className="absolute inset-0 flex items-center justify-center"><div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center text-3xl text-white">▶</div></div>}
          </div>
          <div className="flex gap-0.5 mt-2">{v.scenes.map((_, k) => (
            <button key={k} className="flex-1 h-1.5 rounded-full bg-[#1e2a44] overflow-hidden" onClick={() => go(k)} title={`Part ${k + 1}`}>
              <div className="h-full bg-red-500" style={{ width: `${k < i ? 100 : k === i ? frac * 100 : 0}%` }} />
            </button>
          ))}</div>
          <div className="flex items-center gap-2 mt-2">
            <button className="btn py-1 px-2 text-xs" onClick={() => go(i - 1)} disabled={i === 0}>⏮</button>
            <button className="btn py-1 px-3 text-xs" onClick={() => { if (!playing && i === n - 1 && frac >= 1) go(0); else { setPlaying(!playing); setT0(performance.now()); } }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn py-1 px-2 text-xs" onClick={() => go(i + 1)} disabled={i === n - 1}>⏭</button>
            <span className="text-[11px] text-dim ml-2">Part {i + 1} of {n} · {v.mins} min video</span>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <CreatorBadge c={c} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c?.channel}</div>
              <div className="text-[11px] text-dim">{c?.name} · {num(c?.subs ?? 0)} subscribers · {STYLE_LABEL[(c?.style ?? 'news') as CreatorStyle]}</div>
            </div>
            <div className="text-right text-xs">
              <div className="font-semibold">{num(v.views)} views</div>
              <div className="text-dim">👍 {num(v.likes)} · {fmtDate(v.date)}</div>
            </div>
          </div>
          {c?.tagline && <div className="text-[11px] text-muted mt-2 italic">“{c.tagline}”</div>}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">{v.comments.length} comments</div>
          <Comments list={v.comments} />
        </div>
      </div>
    </Modal>
  );
}

function Comments({ list }: { list: FanReply[] }) {
  if (!list.length) return <div className="text-xs text-dim">No comments.</div>;
  return (
    <div className="space-y-2.5 max-h-[460px] overflow-auto pr-1">{list.map((r, k) => (
      <div key={k} className="flex gap-2">
        <Avatar name={r.user} size={26} colors={[PERSONA_INFO[r.persona]?.color ?? '#64748b', '#0b1220']} />
        <div className="min-w-0">
          <div className="text-[11px]"><span className="font-semibold" style={{ color: PERSONA_INFO[r.persona]?.color }}>@{r.user}</span></div>
          <div className="text-xs leading-snug">{r.text}</div>
          <div className="text-[10px] text-dim mt-0.5">👍 {num(r.likes)}</div>
        </div>
      </div>
    ))}</div>
  );
}

const TIER_COLOR: Record<string, string> = { S: '#f87171', A: '#fb923c', B: '#facc15', C: '#4ade80', D: '#60a5fa' };
function Scene({ state, v, s, team, c }: { state: GameState; v: CreatorVideo; s: VideoScene; team: Team; c?: Creator }) {
  const pl = (id?: string): Player | undefined => (id ? state.players[id] : undefined);
  const tm = (id?: string): Team | undefined => (id ? state.teams[id] : undefined);
  const wrap = (children: ReactNode, bg?: string) => <div key={s.k + v.id + s.cap} className="absolute inset-0 fadein flex items-center justify-center p-4 pb-16" style={{ background: bg ?? `linear-gradient(135deg, ${team.colors[0]}44, #05080f 60%, ${c?.color ?? '#1e293b'}33)` }}>{children}</div>;
  switch (s.k) {
    case 'title': return <div className="absolute inset-0 fadein"><Thumb state={state} v={v} team={team} big /></div>;
    case 'intro': case 'outro': return wrap(
      <div className="flex flex-col items-center gap-3">
        <CreatorBadge c={c} size={96} />
        <div className="font-display text-2xl font-bold text-white">{c?.channel}</div>
        <div className="text-xs text-muted">{s.k === 'outro' ? 'Thanks for watching — subscribe for more' : `${num(c?.subs ?? 0)} subscribers`}</div>
      </div>);
    case 'stat': return wrap(
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {(s.stats ?? []).map((x, k) => (
          <div key={k} className="rounded-lg p-3 bg-black/50 border border-white/10 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">{x.label}</div>
            <div className="font-display text-3xl font-bold" style={{ color: x.good === undefined ? '#fff' : x.good ? '#4ade80' : '#f87171' }}>{x.v}</div>
          </div>
        ))}
      </div>);
    case 'player': {
      const p = pl(s.pid);
      if (!p) return wrap(<div />);
      const pt = p.teamId ? state.teams[p.teamId] : null;
      return wrap(
        <div className="flex items-center gap-6">
          <div className="relative">
            <Portrait player={p} team={pt} size={180} style={{ boxShadow: `0 0 30px ${TONE_COLOR(s.tone ?? 0)}66` }} />
            {s.big && <div className="absolute -top-3 -right-3 w-14 h-14 rounded-lg flex items-center justify-center font-display text-4xl font-black" style={{ background: TIER_COLOR[s.big] ?? '#c8aa6e', color: '#0b0f19' }}>{s.big}</div>}
          </div>
          <div>
            <div className="flex items-center gap-2"><TeamLogo team={pt} size={22} /><span className="text-xs text-muted">{pt?.short}</span></div>
            <div className="font-display text-4xl font-black text-white leading-none mt-1">{p.handle}</div>
            <div className="flex gap-3 mt-3">{(s.stats ?? []).map((x, k) => (
              <div key={k}><div className="text-[10px] uppercase tracking-wider text-muted">{x.label}</div><div className="font-display text-xl font-bold" style={{ color: x.label === 'Rating' ? ratingColor(Number(x.v)) : x.good === undefined ? '#fff' : x.good ? '#4ade80' : '#f87171' }}>{x.v}</div></div>
            ))}</div>
          </div>
        </div>);
    }
    case 'tier': return wrap(
      <div className="w-full max-w-3xl space-y-0.5">
        {(s.tiers ?? []).map((row) => (
          <div key={row.tier} className="flex items-stretch gap-1 min-h-[34px]">
            <div className="w-9 shrink-0 flex items-center justify-center font-display text-xl font-black rounded-l" style={{ background: TIER_COLOR[row.tier], color: '#0b0f19' }}>{row.tier}</div>
            <div className="flex-1 flex flex-wrap gap-1.5 items-center bg-black/40 rounded-r px-2 py-1">
              {row.pids.map((id) => { const p = pl(id); if (!p) return null; const mine = p.teamId === team.id; return (
                <div key={id} className="flex flex-col items-center" style={mine ? { outline: `2px solid #c8aa6e`, borderRadius: 6 } : undefined}>
                  <Portrait player={p} team={p.teamId ? state.teams[p.teamId] : null} size={22} />
                  <div className={`text-[8px] leading-tight max-w-[44px] truncate ${mine ? 'text-gold2 font-bold' : 'text-white/80'}`}>{p.handle}</div>
                </div>
              ); })}
            </div>
          </div>
        ))}
      </div>, '#05080f');
    case 'rank': return wrap(
      <div className="w-full max-w-2xl grid grid-flow-col gap-x-3 gap-y-0.5" style={{ gridTemplateRows: `repeat(${Math.ceil((s.teams ?? []).length / 2)}, minmax(0, 1fr))` }}>
        {(s.teams ?? []).map((id, k) => { const t = tm(id); const mine = id === team.id; return (
          <div key={id} className={`flex items-center gap-2 px-2 py-0.5 rounded ${mine ? 'bg-gold/20 border border-gold/60' : 'bg-black/40'}`}>
            <span className="w-5 font-display font-bold text-white/70 text-sm">{k + 1}</span>
            <TeamLogo team={t} size={16} />
            <span className={`text-xs truncate ${mine ? 'text-gold2 font-bold' : 'text-white'}`}>{t?.name}</span>
          </div>
        ); })}
      </div>, '#05080f');
    case 'score': {
      const a = tm(s.score?.a), b = tm(s.score?.b);
      return wrap(
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center gap-2"><TeamLogo team={a} size={96} /><span className="font-display font-bold text-white">{a?.short}</span></div>
          <div className="font-display text-7xl font-black text-white">{s.score?.sa}<span className="text-white/40 mx-3">–</span>{s.score?.sb}</div>
          <div className="flex flex-col items-center gap-2"><TeamLogo team={b} size={96} /><span className="font-display font-bold text-white">{b?.short}</span></div>
        </div>);
    }
    case 'upload': return wrap(
      <div className="w-full max-w-lg rounded-lg overflow-hidden border border-white/15 bg-black/50">
        <div className="aspect-video flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${team.colors[0]}, ${team.colors[1] ?? '#111'})` }}><TeamLogo team={team} size={80} /></div>
        <div className="p-3"><div className="text-sm font-semibold text-white">{s.big}</div><div className="text-[11px] text-muted">{team.name} · official channel</div></div>
      </div>);
    case 'quote': default: return wrap(
      <div className="text-center max-w-3xl">
        {s.big ? <div className="font-display text-6xl font-black uppercase text-white leading-none" style={{ textShadow: `0 0 24px ${TONE_COLOR(v.tone)}` }}>{s.big}</div>
          : <div className="text-6xl text-white/30 font-serif">“</div>}
      </div>);
  }
}

// ------------------------------------------------------------------ our channel
function ChannelTab() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const ch = channelOf(state);
  const [fmt, setFmt] = useState<OrgFormat>('vlog');
  const [sel, setSel] = useState<string[]>([]);
  const [useHost, setUseHost] = useState(true);
  const [budget, setBudget] = useState(1);
  const [collab, setCollab] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);
  const def = FORMATS[fmt];
  const roster = team.roster.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const ranked = useMemo(() => roster.map((p) => ({ p, ...onCamera(p, fmt) })).sort((a, b) => b.v - a.v), [fmt, roster.length, state.date]);
  const valid = sel.filter((id) => roster.some((p) => p.id === id)).slice(0, def.max);
  const est = estimate(state, fmt, valid, useHost, budget, def.collab ? collab || undefined : undefined);
  const busy = ch.queue.length >= capacity(team);
  const collabs = useMemo(() => contentState(state).creators.filter((c) => (c.league ? c.league === team.leagueId : c.region === team.region || c.region === 'INTL')).sort((a, b) => b.subs - a.subs), [team.region, team.leagueId]);
  const reach = reachEngagement(state, team), comm = communityEngagement(state, team), base = aiEngagement(team);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : def.max === 1 ? [id] : [...sel, id].slice(-def.max));
  const go = () => { const r = produce(state, fmt, valid, useHost, budget, def.collab ? collab || undefined : undefined); notify(r.message); if (r.ok) setSel([]); bump(); };
  const h = hostOf(ch), ed = editorOf(ch);
  const last30 = ch.uploads.filter((u) => u.date > new Date(new Date(state.date).getTime() - 30 * 864e5).toISOString().slice(0, 10));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Subscribers" value={num(ch.subs)} sub={`${num(ch.views)} lifetime views`} />
        <Stat label="Momentum" value={Math.round(ch.momentum)} sub={ch.momentum >= 60 ? 'The algorithm loves you' : ch.momentum >= 30 ? 'Ticking along' : 'Quiet — post more'} color={ch.momentum >= 60 ? '#22c55e' : ch.momentum >= 30 ? '#c8aa6e' : '#f97316'} />
        <Stat label="Community" value={Math.round(ch.community)} sub="How close fans feel to the club" color={ch.community >= 50 ? '#22c55e' : ch.community >= 25 ? '#c8aa6e' : '#f97316'} />
        <Stat label="Uploads (30 days)" value={last30.length} sub={`${num(last30.reduce((s, u) => s + u.views, 0))} views · ${money(last30.reduce((s, u) => s + u.revenue, 0))} ads`} />
        <Stat label="Studio" value={`Lv ${team.facilities.contentStudio}`} sub={`${ch.queue.length}/${capacity(team)} productions · ${h ? 'host ✓' : 'no host'} · ${ed ? 'editor ✓' : 'no editor'}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <Panel title="Make a video">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            {FORMAT_IDS.map((f) => {
              const d = FORMATS[f];
              return (
                <button key={f} className={`panel-flat p-2 text-left transition ${fmt === f ? 'border-gold/70 bg-gold/10' : 'hover:border-[#2a3a5e]'}`} onClick={() => { setFmt(f); setSel(sel.slice(0, d.max)); }}>
                  <div className="text-xl leading-none">{d.icon}</div>
                  <div className="text-xs font-semibold mt-1 leading-tight">{d.label}</div>
                </button>
              );
            })}
          </div>
          <div className="text-xs text-muted mb-3">{def.desc} <span className="text-dim">On camera: {Object.entries(def.w).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k]) => STAT_LABEL[k as keyof typeof STAT_LABEL]).join(', ')}{def.skill ? ', skill' : ''}{def.host ? ` · host matters ${Math.round(def.host * 100)}%` : ''}.</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Cast · pick {def.min === def.max ? def.min : `${def.min}–${def.max}`}</div>
              <div className="space-y-1 max-h-[320px] overflow-auto pr-1">{ranked.map(({ p, v, notes }) => {
                const on = valid.includes(p.id);
                const s = personaOf(p);
                return (
                  <button key={p.id} className={`w-full flex items-center gap-2 rounded px-2 py-1 text-left border ${on ? 'border-gold/60 bg-gold/10' : 'border-transparent hover:bg-[#111a2e]'}`} onClick={() => toggle(p.id)}>
                    <input type="checkbox" readOnly checked={on} className="accent-[#c8aa6e]" />
                    <Portrait player={p} team={team} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.handle} <span className="text-[10px] text-dim font-normal">{Object.keys(def.w).slice(0, 3).map((k) => `${STAT_LABEL[k as keyof typeof STAT_LABEL]} ${s[k as keyof typeof s] ?? '—'}`).join(' · ')}</span></div>
                      {notes.length > 0 && <div className="text-[10px] text-dim truncate">{notes.join(' · ')}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-sm" style={{ color: qualityColor(v) }}>{Math.round(v)}</div>
                      <div className="text-[9px] text-dim">fatigue {Math.round(p.fatigue)}</div>
                    </div>
                  </button>
                );
              })}</div>
            </div>
            <div className="space-y-3">
              {def.host > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Host</div>
                  {h ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={useHost} onChange={(e) => setUseHost(e.target.checked)} className="accent-[#c8aa6e]" />{h.name} hosts <span className="text-dim">(score {Math.round(hostScore(h))})</span></label>
                  ) : <div className="text-xs text-muted">No host hired — a player leads it. <button className="text-gold2 hover:underline" onClick={() => notify('Open the Crew tab to hire a host / MC.')}>Hire one</button></div>}
                </div>
              )}
              {def.collab && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Creator</div>
                  <select className="input w-full text-xs" value={collab} onChange={(e) => setCollab(e.target.value)}>
                    <option value="">Pick a creator…</option>
                    {collabs.map((c) => <option key={c.id} value={c.id}>{c.channel} · {num(c.subs)} subs · {STYLE_LABEL[c.style as CreatorStyle]}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Budget</div>
                <div className="flex gap-1">{BUDGETS.map((b, k) => <button key={k} className={`btn flex-1 py-1 text-xs ${budget === k ? 'btn-gold' : ''}`} onClick={() => setBudget(k)}>{b.label}</button>)}</div>
              </div>
              <div className="panel-flat p-3 space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-xs text-muted">Expected</span><span className="font-display text-xl font-bold" style={{ color: qualityColor(est.quality) }}>{valid.length >= def.min ? `${qualityLabel(est.quality)} · ${est.quality}` : '—'}</span></div>
                <MiniBar label="Cast" v={est.cast} color="#38bdf8" />
                {est.host !== null && <MiniBar label="Host" v={est.host} color="#a78bfa" />}
                <MiniBar label="Production" v={est.prod} color="#c8aa6e" />
                {est.notes.map((n, k) => <div key={k} className="text-[10px] text-amber-300">{n}</div>)}
                <div className="text-[11px] text-muted pt-1">Cost {money(est.cost + est.fee)}{est.fee ? ` (incl. ${money(est.fee)} fee)` : ''} · up in {est.days} day{est.days > 1 ? 's' : ''} · +{def.fatigue} fatigue each, −3% training this week</div>
              </div>
              <button className="btn btn-gold w-full" disabled={busy || valid.length < def.min || (def.collab && !collab) || team.balance < est.cost + est.fee} onClick={go}>
                {busy ? 'Studio busy' : valid.length < def.min ? 'Pick the cast' : team.balance < est.cost + est.fee ? 'Not enough money' : `Start filming · ${money(est.cost + est.fee)}`}
              </button>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          {ch.queue.length > 0 && (
            <Panel title="In production">
              <div className="space-y-2">{ch.queue.map((q) => (
                <div key={q.id} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{FORMATS[q.format as OrgFormat]?.icon}</span>
                  <div className="flex-1 min-w-0"><div className="font-semibold truncate">{q.title}</div><div className="text-[11px] text-dim">Goes up {fmtDate(q.ready)} · {q.players.map((id) => state.players[id]?.handle).filter(Boolean).join(', ')}</div></div>
                </div>
              ))}</div>
            </Panel>
          )}
          <Panel title="Why it matters">
            <div className="space-y-1.5 mb-3">
              <Bar label="Reach (momentum)" value={reach * 100} showValue={false} mark={base * 100} color="#38bdf8" height={5} />
              <Bar label="Community" value={comm * 100} showValue={false} mark={base * 100} color="#a78bfa" height={5} />
              <div className="text-[10px] text-dim">The tick marks the typical club with your studio level.</div>
            </div>
            <div className="text-[11px] text-muted leading-relaxed space-y-2">
              <p><b className="text-text">Momentum</b> grows with every good upload and fades within weeks if you stop. It drives casual fans (up to about +9% fan pull), content revenue and sponsor appeal.</p>
              <p><b className="text-text">Community</b> comes from vlogs, Q&As and spotlights. It turns casual fans into die-hards. The players fans keep seeing in your videos become players they follow.</p>
              <p>The people on camera matter: looks, humor, charisma, smarts, media savvy, online presence, style and comms (from each player’s profile) plus traits such as Meme Lord, Heartthrob or Camera Shy. A charismatic host carries shows, and an editor and the studio lift production. Loose lips on talk shows cause controversies, and repeating the same format bores people.</p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Uploads" bodyClass="p-0">
        {ch.uploads.length === 0 ? <Empty>Nothing uploaded yet.</Empty> : ch.uploads.map((u) => <UploadRow key={u.id} u={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} />)}
      </Panel>
    </div>
  );
}

function MiniBar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 text-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} /></div>
      <span className="w-6 text-right font-display font-bold" style={{ color }}>{Math.round(v)}</span>
    </div>
  );
}

function UploadRow({ u, open, onToggle }: { u: ContentUpload; open: boolean; onToggle: () => void }) {
  const state = useGame();
  const d = FORMATS[u.format as OrgFormat];
  const c = u.collab ? creatorById(state, u.collab) : undefined;
  return (
    <div className="border-b border-[#141e33] last:border-0">
      <button className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#111a2e]" onClick={onToggle}>
        <span className="text-xl w-7 text-center">{d?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{u.title} {u.viral && <Pill color="#f0c674">viral</Pill>} {u.flop && <Pill color="#64748b">flop</Pill>} {u.controversy && <Pill color="#ef4444">controversy</Pill>}</div>
          <div className="text-[11px] text-dim truncate">{fmtDate(u.date)} · {d?.label}{u.host ? ` · hosted by ${u.host}` : ''}{c ? ` · with ${c.channel}` : ''} · {u.players.map((id) => state.players[id]?.handle).filter(Boolean).join(', ')}</div>
        </div>
        <div className="text-right text-xs w-16"><div className="font-display font-bold" style={{ color: qualityColor(u.quality) }}>{u.quality}</div><div className="text-[10px] text-dim">{qualityLabel(u.quality)}</div></div>
        <div className="text-right text-xs w-20"><div className="font-semibold">{num(u.views)}</div><div className="text-[10px] text-dim">views</div></div>
        <div className="text-right text-xs w-20"><div className="font-semibold text-win">+{num(u.subs)}</div><div className="text-[10px] text-dim">subs</div></div>
        <div className="text-right text-xs w-16 hidden sm:block"><div className="font-semibold">+{num(u.fans)}</div><div className="text-[10px] text-dim">fans</div></div>
      </button>
      {open && (
        <div className="px-4 pb-3 grid md:grid-cols-[1fr_300px] gap-4">
          <div className="text-xs space-y-2">
            {u.highlight && <div className="panel-flat p-2.5 italic text-muted">{u.highlight}</div>}
            <div className="text-dim">👍 {num(u.likes)} · {money(u.revenue)} ad revenue{u.controversy ? ` · ${state.players[u.controversy]?.handle ?? 'A player'} said something the internet didn’t like` : ''}</div>
          </div>
          <Comments list={u.comments} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ crew
function CrewTab() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const ch = channelOf(state);
  const pool = crewPool(state);
  const act = (r: { ok: boolean; message: string }) => { notify(r.message); bump(); };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['host', 'editor'] as const).map((role) => {
          const c = ch.crew.find((x) => x.role === role);
          return (
            <Panel key={role} title={role === 'host' ? 'Host / MC' : 'Video editor'}>
              {c ? <CrewCard c={c} team={team} action={<button className="btn py-1 text-xs" onClick={() => act(fireCrew(state, c.id))}>Let go</button>} /> : (
                <div className="text-sm text-muted">{role === 'host' ? 'No host. Game shows and talk shows lean on whoever leads them, so without a host a player does it (−10). A charismatic, funny MC with a following of their own lifts every show.' : 'No editor. The studio does basic cuts. A good editor adds production value and gets videos out a day or two sooner.'}</div>
              )}
            </Panel>
          );
        })}
      </div>
      <Panel title={`Available this month`} right={<span className="text-[11px] text-muted">New candidates on the 1st · hiring costs half a month’s pay up front</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {pool.map((c) => {
            const taken = ch.crew.some((x) => x.role === c.role);
            return <CrewCard key={c.id} c={c} team={team} action={<button className="btn btn-gold py-1 text-xs" disabled={taken} title={taken ? `You already have a ${c.role}` : undefined} onClick={() => act(hireCrew(state, c.id))}>Hire</button>} />;
          })}
        </div>
      </Panel>
    </div>
  );
}

function CrewCard({ c, team, action }: { c: ContentCrew; team: Team; action: ReactNode }) {
  const host = c.role === 'host';
  const score = host ? hostScore(c) : c.skill;
  return (
    <div className="panel-flat p-3">
      <div className="flex items-center gap-2.5 mb-2">
        <Avatar name={c.name} size={40} colors={team.colors} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{c.name}</div>
          <div className="text-[11px] text-dim">{host ? 'Host / MC' : 'Video editor'} · {c.country}{host ? ` · ${num(c.fame)} followers` : ''}</div>
        </div>
        <div className="text-right"><div className="font-display text-xl font-bold" style={{ color: qualityColor(score) }}>{Math.round(score)}</div><div className="text-[10px] text-dim">{money(c.salary)}/mo</div></div>
      </div>
      <div className="space-y-1 mb-2">
        {host ? <>
          <Bar label="Charisma" value={c.charisma} height={4} />
          <Bar label="Humor" value={c.humor} height={4} />
          <Bar label="Looks" value={c.looks} height={4} />
          <Bar label="Game knowledge" value={c.smarts} height={4} />
        </> : <>
          <Bar label="Editing skill" value={c.skill} height={4} />
          <div className="text-[10px] text-dim">Cuts {Math.floor(c.skill / 40)} day{Math.floor(c.skill / 40) === 1 ? '' : 's'} off production · +{Math.round(c.skill * 0.35 - 8)} production value</div>
        </>}
      </div>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}
