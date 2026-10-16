// Stream chat column for the match viewer: Twitch-style in English, YouTube-style in Vietnamese when the Hoàng
// Luân desk casts (the brain picks its language pack, chatPack.ts / chatVi.ts). The brain (chatBrain.ts) produces the lines on its own
// real-time timer; this component only renders them: newest at the bottom, auto-scroll that pauses when the user
// scrolls up (a "new messages" pill brings them back), emote chips, badges, replies, sub/raid notices, the
// channel-points prediction and the emote-combo counter. Cheap by design: memoised rows, a capped list, its own
// timer, and it never touches the canvas. External code can read / feed it through chatFeed.ts.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MatchSim } from '../../engine/sim/engine';
import type { Team } from '../../engine/types';
import { EMOTE_INFO, EMOTE_TINT } from './chatLines';
import { ChatBrain, managerHandle, readSetup, type Badge, type BrainMeta, type ChatOut, type PollView, type ComboView } from './chatBrain';
import { _resetFeed, _setMeta, getChatMeta } from './chatFeed';
import { fmtViewers } from './broadcast/audience';
import { useCasterPrefs } from './broadcast/prefs';

const MAX_LINES = 150;
const MAX_HELD = 300;
const TICK_MS = 100;

interface Props { sim: MatchSim; teams: [Team, Team]; userSide: 0 | 1; collapsed?: boolean; onToggle?: () => void }

function LiveChat({ sim, teams, userSide, collapsed = false, onToggle }: Props) {
  const [lines, setLines] = useState<ChatOut[]>([]);
  const [meta, setMeta] = useState<BrainMeta | null>(null);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(0);
  const [pollOpen, setPollOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [lang, setLang] = useState<'en' | 'vi'>('en');
  const casterMode = useCasterPrefs((x) => x.mode); // the desk decides the chat's language: a new desk, a new chat
  const listRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<ChatBrain | null>(null);
  const heldRef = useRef<ChatOut[]>([]);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const collapsedRef = useRef(collapsed); collapsedRef.current = collapsed;
  const teamsRef = useRef(teams); teamsRef.current = teams;
  const toggleRef = useRef(onToggle); toggleRef.current = onToggle;
  const me = useMemo(() => managerHandle(), []);

  // the brain lives as long as this game's viewer (teams are read once: their identity doesn't change mid-game)
  useEffect(() => {
    _resetFeed();
    const brain = new ChatBrain(sim, teamsRef.current, userSide, readSetup(teamsRef.current, userSide, sim));
    brainRef.current = brain;
    setLines([]); heldRef.current = []; setHeld(0);
    setLang(brain.meta.lang);
    if (import.meta.env.DEV) (window as unknown as { __chat?: ChatBrain }).__chat = brain; // dev-only: poke the chat from the console
    let lastMeta = '';
    const id = window.setInterval(() => {
      const { out, deleted } = brain.tick(performance.now());
      if (deleted.length) {
        const ids = new Set(deleted);
        const mark = (l: ChatOut) => (ids.has(l.id) && !l.deleted ? { ...l, deleted: true } : l);
        heldRef.current = heldRef.current.map(mark);
        setLines((prev) => (prev.some((l) => ids.has(l.id)) ? prev.map(mark) : prev));
      }
      if (out.length) {
        if (pausedRef.current || collapsedRef.current) {
          const h = heldRef.current;
          h.push(...out);
          if (h.length > MAX_HELD) h.splice(0, h.length - MAX_HELD);
          setHeld(h.length);
        } else setLines((prev) => { const n = prev.concat(out); return n.length > MAX_LINES ? n.slice(-MAX_LINES) : n; });
      }
      const m = brain.meta;
      const key = `${m.hype}|${m.viewers}|${m.combo?.key}:${m.combo?.count}:${m.combo?.live}|${m.poll?.state}:${m.poll?.opts[0].pts}:${m.poll?.opts[1].pts}:${Math.ceil(m.poll?.lockIn ?? 0)}`;
      if (key !== lastMeta) { lastMeta = key; setMeta(m); }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      brainRef.current = null;
      _setMeta({ ...getChatMeta(), live: false });
    };
  }, [sim, userSide, casterMode]);

  // newest at the bottom: stick to it unless the user scrolled up
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && !pausedRef.current) el.scrollTop = el.scrollHeight;
  }, [lines, collapsed]);

  const flush = useCallback(() => {
    const h = heldRef.current;
    heldRef.current = [];
    setHeld(0);
    if (h.length) setLines((prev) => prev.concat(h).slice(-MAX_LINES));
  }, []);
  const resume = useCallback(() => {
    setPaused(false);
    pausedRef.current = false;
    flush();
    requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }, [flush]);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    if (!atBottom && !pausedRef.current) { pausedRef.current = true; setPaused(true); }
    else if (atBottom && pausedRef.current) resume();
  };
  // re-opening a collapsed chat shows what was said meanwhile
  useEffect(() => { if (!collapsed && !pausedRef.current) flush(); }, [collapsed, flush]);

  const send = () => {
    const t = draft.trim();
    if (!t || !brainRef.current) return;
    brainRef.current.postGM(t);
    setDraft('');
    if (pausedRef.current) resume();
  };

  const top = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lines.slice(-50)) if (l.kind === 'msg' && !l.deleted) for (const w of l.text.split(/\s+/)) if (w in EMOTE_INFO) c[w] = (c[w] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [lines]);

  const viewers = meta?.viewers ?? 0;
  const hype = meta?.hype ?? 20;
  const vi = lang === 'vi';

  if (collapsed) {
    return (
      <button onClick={() => toggleRef.current?.()} title="Show chat" className="panel h-full w-full flex flex-col items-center gap-2 py-3 text-muted hover:text-text hover:border-gold transition-colors">
        <span className="text-base leading-none">💬</span>
        <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">{vi ? 'Trò chuyện' : 'Stream chat'}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {held > 0 && <span className="text-[10px] font-bold text-gold2 [writing-mode:vertical-rl] rotate-180">{held > 99 ? '99+' : held} new</span>}
      </button>
    );
  }

  return (
    <div className="panel h-full min-h-0 flex flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 border-b border-line px-2.5 pt-2 pb-1.5">
        <div className="flex items-center gap-2">
          {onToggle && <button onClick={() => toggleRef.current?.()} title="Collapse chat" className="text-muted hover:text-text text-sm leading-none px-1 -ml-1 rounded hover:bg-white/5">⇥</button>}
          {vi ? (
            <span className="text-[12px] font-semibold text-text">Trò chuyện trực tiếp <span className="text-[10px] text-dim font-normal">▾</span></span>
          ) : <span className="text-[11px] uppercase tracking-wider text-muted font-bold">Stream chat</span>}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-dim" title={vi ? `${viewers.toLocaleString('vi-VN')} người đang xem` : `${viewers.toLocaleString('en-US')} watching the broadcast`}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-300 font-semibold tabular-nums">{fmtViewers(viewers)}</span>
            <span className="hidden sm:inline">{vi ? 'đang xem' : 'watching'}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded bg-[#0a1120] overflow-hidden" title={`Crowd hype ${hype}`}>
          <div className="h-full rounded transition-all duration-300" style={{ width: `${hype}%`, background: hype > 70 ? '#f0c674' : hype > 40 ? '#fb923c' : '#38bdf8' }} />
        </div>
      </div>
      {vi && meta?.pinned && (
        <div className="shrink-0 px-2.5 py-1.5 text-[11px] leading-snug border-b border-line bg-white/[0.03] flex gap-1.5">
          <span>📌</span><span><span className="font-semibold text-text">RiftTV Việt Nam</span> <span className="text-muted">{meta.pinned}</span></span>
        </div>
      )}
      {meta?.poll && <PollCard poll={meta.poll} open={pollOpen} onToggle={() => setPollOpen((o) => !o)} vi={vi} />}
      {(meta?.lore || (meta?.watching.length ?? 0) > 0) && (
        <div className="shrink-0 px-2.5 py-1 text-[10.5px] leading-snug border-b border-line bg-fuchsia-500/5 text-fuchsia-300">
          {meta?.lore && <div>📌 {meta.lore}</div>}
          {(meta?.watching.length ?? 0) > 0 && <div>👀 {vi ? `Chat đang soi kỹ ${meta!.watching.join(', ')}.` : `Chat is watching ${meta!.watching.join(', ')} closely.`}</div>}
        </div>
      )}
      {/* messages */}
      <div className="relative flex-1 min-h-0">
        {meta?.combo && <Combo combo={meta.combo} />}
        <div ref={listRef} onScroll={onScroll} role="log" aria-label="Stream chat" className="absolute inset-0 overflow-y-auto overflow-x-hidden [overflow-anchor:none]">
          {/* min-h-full + justify-end: a young chat starts at the bottom, like Twitch */}
          <div className="min-h-full flex flex-col justify-end py-1">
            {lines.length === 0 && <div className="text-dim text-xs px-3 py-2">{vi ? 'Chào mừng bạn đến với cuộc trò chuyện trực tiếp! Hãy giữ bình luận văn minh và tôn trọng mọi người.' : 'Welcome to the chat room!'}</div>}
            {lines.map((l) => (vi ? <YtRow key={l.id} m={l} me={me} /> : <ChatRow key={l.id} m={l} me={me} />))}
          </div>
        </div>
        {paused && (
          <button onClick={resume} className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 rounded-full bg-[#1f2a44]/95 border border-line2 px-3 py-1 text-[11px] font-semibold text-gold2 shadow-lg shadow-black/50 hover:border-gold fadein whitespace-nowrap">
            {vi ? (held > 0 ? `↓ ${held > 99 ? '99+' : held} tin nhắn mới` : '⏸ Đã tạm dừng · ↓') : held > 0 ? `↓ ${held > 99 ? '99+' : held} new messages` : '⏸ Chat paused due to scroll · ↓'}
          </button>
        )}
      </div>
      {/* footer: send box + top emotes */}
      <div className="shrink-0 border-t border-line p-2 space-y-1.5">
        <div className="flex gap-1.5">
          <input
            className="input flex-1 min-w-0 py-1.5! text-[12px]!" value={draft} maxLength={200} placeholder={vi ? `Trò chuyện với tên ${me}…` : `Send a message as ${me}`}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); }}
          />
          <button className="btn btn-gold py-1! px-2.5! text-xs!" onClick={send} disabled={!draft.trim()}>{vi ? 'Gửi' : 'Chat'}</button>
        </div>
        {!vi && <div className="flex items-center gap-1 flex-wrap min-h-[16px]">
          <span className="text-[10px] uppercase text-dim font-bold mr-0.5">Top</span>
          {top.length ? top.map(([w, n]) => <span key={w} className="inline-flex items-center gap-1"><Emote w={w} /><span className="text-[10px] text-dim">×{n}</span></span>) : <span className="text-[10px] text-dim">—</span>}
        </div>}
      </div>
    </div>
  );
}

export default memo(LiveChat, (a, b) => a.sim === b.sim && a.userSide === b.userSide && a.collapsed === b.collapsed && a.teams[0].id === b.teams[0].id && a.teams[1].id === b.teams[1].id && !!a.onToggle === !!b.onToggle);

// ------------------------------------------------------------------ rows
const ChatRow = memo(function ChatRow({ m, me }: { m: ChatOut; me: string }) {
  if (m.kind === 'system') {
    return <div className="px-2.5 py-0.5 text-[11.5px] italic text-dim" title={m.text || undefined}>{m.title}</div>;
  }
  if (m.kind === 'notice') {
    const accent = m.notice === 'raid' ? '#0ac8b9' : m.notice === 'poll' ? '#387aff' : m.notice === 'bits' ? '#c084fc' : '#9146ff';
    const icon = m.notice === 'raid' ? '⚔' : m.notice === 'poll' ? '🔮' : m.notice === 'bits' ? '◆' : m.notice === 'gift' ? '🎁' : '★';
    return (
      <div className="mx-1 my-1 rounded px-2 py-1.5 text-[12px] leading-snug border-l-[3px] fadein" style={{ borderColor: accent, background: `${accent}1a` }}>
        <div className="font-semibold text-text"><span className="mr-1" style={{ color: accent }}>{icon}</span>{m.title}</div>
        {m.text && (
          <div className="mt-0.5 text-[12px] break-words">
            {m.name && m.notice !== 'poll' && <span className="font-bold mr-1" style={{ color: m.color }}>{m.name}:</span>}
            {m.notice === 'poll' ? <span className="text-muted">{m.text}</span> : <Words text={m.text} me={me} />}
          </div>
        )}
      </div>
    );
  }
  const bg = m.self ? 'bg-[#c8aa6e]/10' : m.mentionsMe ? 'bg-red-500/15' : m.first ? 'bg-[#0ac8b9]/10 border-l-2 border-accent' : '';
  const tone = m.tone === 'hype' ? 'text-amber-100' : m.tone === 'sad' ? 'text-slate-400' : m.tone === 'lore' ? 'text-fuchsia-200' : 'text-[#dfe5f2]';
  return (
    <div className={`px-2.5 py-[3px] text-[12.5px] leading-[1.45] break-words hover:bg-white/[0.04] ${bg}`}>
      {m.first && <div className="text-[10px] font-bold text-accent uppercase tracking-wide">First-time chat</div>}
      {m.reply && <div className="text-[10.5px] text-dim truncate">↪ Replying to <span className="font-semibold">@{m.reply.to}</span>: {m.reply.text}</div>}
      {m.badges?.map((b, i) => <BadgeIcon key={i} b={b} />)}
      <span className="font-bold" style={{ color: m.color }}>{m.name}</span>
      <span className="text-dim">: </span>
      {m.deleted ? <span className="italic text-dim">&lt;message deleted&gt;</span> : <span className={tone}><Words text={m.text} me={me} /></span>}
    </div>
  );
});

function Words({ text, me }: { text: string; me: string }) {
  const out: ReactNode[] = [];
  let buf = '';
  const parts = text.split(/(\s+)/);
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (w in EMOTE_INFO) { if (buf) { out.push(buf); buf = ''; } out.push(<Emote key={i} w={w} />); }
    else if (w.length > 1 && w[0] === '@') {
      if (buf) { out.push(buf); buf = ''; }
      const self = w.slice(1).replace(/[^\w.-]/g, '').toLowerCase() === me.toLowerCase();
      out.push(<span key={i} className={`font-semibold ${self ? 'text-red-200 bg-red-500/25 rounded px-0.5' : 'text-text'}`}>{w}</span>);
    } else buf += w;
  }
  if (buf) out.push(buf);
  return <>{out}</>;
}

function Emote({ w }: { w: string }) {
  const [glyph, fam] = EMOTE_INFO[w];
  const tint = EMOTE_TINT[fam];
  return (
    <span title={w} className="inline-flex items-center gap-[2px] align-[-1px] rounded px-1 mx-[1px] text-[10px] font-extrabold leading-[15px] whitespace-nowrap select-none" style={{ background: `${tint}1f`, color: tint, boxShadow: `inset 0 0 0 1px ${tint}33` }}>
      <span className="text-[11px] leading-none">{glyph}</span>{w}
    </span>
  );
}

const SUB_TINT = (n: number) => (n >= 24 ? '#38bdf8' : n >= 12 ? '#a970ff' : n >= 6 ? '#c8aa6e' : n >= 3 ? '#9ca3af' : '#b7793e');
function BadgeIcon({ b }: { b: Badge }) {
  const base = 'inline-flex items-center justify-center w-[15px] h-[15px] rounded-[3px] mr-1 align-[-2px] text-[9px] font-black leading-none text-white';
  switch (b.k) {
    case 'gm': return <span className={`${base} w-auto! px-1 bg-[#e91916]`} title="Manager (broadcaster)">GM</span>;
    case 'mod': return <span className={`${base} bg-[#00ad03]`} title="Moderator">⚔</span>;
    case 'bot': return <span className={`${base} bg-[#5c6bc0]`} title="Verified bot">✓</span>;
    case 'vip': return <span className={`${base} bg-[#e005b9]`} title="VIP">◆</span>;
    case 'predBlue': return <span className={`${base} bg-[#387aff]`} title="Predicted: blue side">1</span>;
    case 'predPink': return <span className={`${base} bg-[#f5009b]`} title="Predicted: red side">2</span>;
    case 'sub': return <span className={`${base} text-[#0b0f19]`} style={{ background: SUB_TINT(b.n ?? 1) }} title={`${b.n}-Month Subscriber`}>★</span>;
    case 'gifter': return <span className={`${base} bg-[#b45309]`} title="Sub gifter">✚</span>;
    case 'bits': return <span className={`${base} bg-[#1f2937] ${(b.n ?? 0) >= 1000 ? 'text-[#a970ff]' : 'text-[#cbd5e1]'}`} title={`cheer ${b.n}`}>♦</span>;
    case 'verified': return <span className={`${base} bg-[#606060]`} title="Kênh chính thức">✓</span>;
  }
}

// ------------------------------------------------------------------ pinned bits
function PollCard({ poll, open, onToggle, vi }: { poll: PollView; open: boolean; onToggle: () => void; vi?: boolean }) {
  const total = poll.opts[0].pts + poll.opts[1].pts;
  const mmss = `${Math.floor(poll.lockIn / 60)}:${String(Math.floor(poll.lockIn % 60)).padStart(2, '0')}`;
  const lock = vi
    ? poll.state === 'open' ? `Đóng sau ${mmss}` : poll.state === 'locked' ? 'Đã đóng · chờ kết quả' : `Kết quả: ${poll.opts[poll.winner ?? 0].label} thắng`
    : poll.state === 'open' ? `Locks in ${mmss}` : poll.state === 'locked' ? 'Locked · waiting for result' : `Result: ${poll.opts[poll.winner ?? 0].label} won`;
  return (
    <div className="shrink-0 border-b border-line bg-[#0b1324] px-2.5 py-1.5">
      <button className="w-full flex items-center gap-1.5 text-left" onClick={onToggle} title={open ? 'Collapse prediction' : 'Show prediction'}>
        <span className="text-[11px]">{vi ? '📊' : '🔮'}</span>
        <span className="text-[11.5px] font-semibold truncate flex-1">{poll.title}</span>
        <span className={`text-[10px] ${poll.state === 'open' ? 'text-gold2' : 'text-dim'}`}>{lock}</span>
        <span className="text-[10px] text-dim">{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          {poll.opts.map((o, i) => {
            const ratio = o.pts ? (total / o.pts).toFixed(2) : '—';
            const won = poll.state === 'done' && poll.winner === i;
            return (
              <div key={i} className={poll.state === 'done' && !won ? 'opacity-50' : ''}>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-bold" style={{ color: o.color }}>{won ? '🏆 ' : ''}{o.label} · {o.pct}%</span>
                  <span className="text-dim">{vi ? `${o.users.toLocaleString('vi-VN')} phiếu` : <>{fmt(o.pts)} pts · 1:{ratio} · 👤 {o.users.toLocaleString('en-US')}</>}</span>
                </div>
                <div className="h-1.5 rounded bg-[#0a1120] overflow-hidden"><div className="h-full rounded transition-all duration-500" style={{ width: `${o.pct}%`, background: o.color }} /></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 flex h-1 rounded overflow-hidden">
          <div style={{ width: `${poll.opts[0].pct}%`, background: poll.opts[0].color }} />
          <div style={{ width: `${poll.opts[1].pct}%`, background: poll.opts[1].color }} />
        </div>
      )}
    </div>
  );
}
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 1e5 ? 0 : 1)}k` : String(n));

function Combo({ combo }: { combo: ComboView }) {
  const info = EMOTE_INFO[combo.token];
  const tint = info ? EMOTE_TINT[info[1]] : combo.tone === 'sad' ? '#7dd3fc' : combo.tone === 'lore' ? '#f0abfc' : '#f0c674';
  return (
    <div key={combo.key} className={`absolute left-1/2 -translate-x-1/2 top-1.5 z-10 pointer-events-none fadein transition-opacity duration-500 ${combo.live ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 shadow-lg shadow-black/60 bg-[#0b1120]/95 whitespace-nowrap" style={{ borderColor: `${tint}88` }}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-dim">Combo</span>
        {info ? <Emote w={combo.token} /> : <span className="text-[11px] font-extrabold" style={{ color: tint }}>{combo.token}</span>}
        <span key={combo.count} className="font-display text-base font-bold leading-none fadein" style={{ color: tint }}>×{combo.count}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ YouTube (Vietnamese) rows
/** Super Chat colours by amount (₫), like YouTube's tiers. */
function scTier(amount: number): { bg: string; head: string; ink: string } {
  if (amount >= 1_000_000) return { bg: '#e91e63', head: '#c2185b', ink: '#fff' };
  if (amount >= 500_000) return { bg: '#f57c00', head: '#e65100', ink: '#fff' };
  if (amount >= 200_000) return { bg: '#ffca28', head: '#ffb300', ink: '#1a1a1a' };
  if (amount >= 100_000) return { bg: '#1de9b6', head: '#00bfa5', ink: '#0b1a17' };
  if (amount >= 50_000) return { bg: '#00e5ff', head: '#00b8d4', ink: '#062026' };
  return { bg: '#1e88e5', head: '#1565c0', ink: '#fff' };
}
function YtAvatar({ name, size = 22 }: { name: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return <span className="inline-flex items-center justify-center rounded-full shrink-0 font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${h % 360} 45% 42%)` }}>{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?'}</span>;
}
const YtRow = memo(function YtRow({ m, me }: { m: ChatOut; me: string }) {
  if (m.kind === 'system') return <div className="px-2.5 py-1 text-[11.5px] text-dim">{m.title}</div>;
  if (m.kind === 'notice') {
    if (m.notice === 'bits') {
      const t = scTier(m.amount ?? 20_000);
      const [who, amt] = (m.title ?? '').split(' · ');
      return (
        <div className="mx-1.5 my-1 rounded-md overflow-hidden text-[12px] leading-snug fadein">
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: t.head, color: t.ink }}>
            <YtAvatar name={m.name ?? who ?? '?'} size={26} />
            <div className="min-w-0"><div className="text-[11px] opacity-80 truncate">{who}</div><div className="font-bold">{amt}</div></div>
          </div>
          {m.text && <div className="px-2.5 py-1.5 break-words" style={{ background: t.bg, color: t.ink }}>{m.text}</div>}
        </div>
      );
    }
    const green = m.notice === 'sub' || m.notice === 'gift';
    const accent = green ? '#0f9d58' : m.notice === 'poll' ? '#3ea6ff' : '#606060';
    return (
      <div className="mx-1.5 my-1 rounded-md px-2.5 py-1.5 text-[12px] leading-snug fadein" style={{ background: `${accent}2a`, boxShadow: `inset 3px 0 0 ${accent}` }}>
        <div className="flex items-center gap-1.5 font-semibold text-text">{m.name && <YtAvatar name={m.name} size={20} />}<span>{m.notice === 'gift' ? '🎁 ' : m.notice === 'poll' ? '📊 ' : ''}{m.title}</span></div>
        {m.text && <div className="mt-0.5 text-[12px] text-muted break-words">{m.text}</div>}
      </div>
    );
  }
  const mod = m.badges?.some((b) => b.k === 'mod');
  const verified = m.badges?.some((b) => b.k === 'verified');
  const member = m.badges?.find((b) => b.k === 'sub');
  const nameCls = m.self ? 'text-[#f0c674]' : verified ? 'bg-[#606060]/60 text-white rounded px-1' : mod ? 'text-[#5e84f1]' : member ? 'text-[#2ba640]' : 'text-[#aaaaaa]';
  return (
    <div className={`flex items-start gap-2 px-2.5 py-[3px] text-[12.5px] leading-[1.45] hover:bg-white/[0.04] ${m.mentionsMe ? 'bg-[#3ea6ff]/15' : ''}`}>
      <YtAvatar name={m.name ?? '?'} />
      <div className="min-w-0 break-words">
        <span className={`font-medium mr-1 ${nameCls}`}>{m.name?.startsWith('@') || verified || m.self ? m.name : `@${m.name}`}</span>
        {mod && <span className="mr-1 text-[#5e84f1]" title="Người kiểm duyệt">🔧</span>}
        {member && <span className="mr-1 inline-flex items-center justify-center rounded-sm bg-[#2ba640] text-white text-[8px] font-black px-[3px] align-[1px]" title={`Hội viên ${member.n} tháng`}>★</span>}
        {m.deleted ? <span className="italic text-dim">[tin nhắn đã bị xoá]</span> : <span className="text-[#f1f1f1]"><Words text={m.text} me={me} /></span>}
      </div>
    </div>
  );
});
