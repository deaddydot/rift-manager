// Fan Pulse & owner UI pieces: mood gauge, social post card, owner choice box and the Dashboard row.
import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { FanPost, GameState } from '../../engine/types';
import { PERSONA_INFO, SCENARIO_META } from '../../engine/management/fanTemplates';
import { moodLabel, expectationLabel } from '../../engine/management/fans';
import { ownerMoodLabel, ownerRequestLive, resolveOwnerChoice, TRAIT_INFO } from '../../engine/management/owner';
import { Panel, Bar, Pill, Portrait, fmtDate } from './kit';
import { perception, days } from '../../engine/management/buzzCore';

export const SENTIMENT_COLOR: Record<number, string> = { 2: '#22c55e', 1: '#84cc16', 0: '#64748b', [-1]: '#f97316', [-2]: '#ef4444' };
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n));
const clock = (mins = 0) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export function postTime(state: GameState, p: FanPost) {
  const n = Math.round((new Date(state.date + 'T00:00:00Z').getTime() - new Date(p.date + 'T00:00:00Z').getTime()) / 864e5);
  const day = n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? `${n}d ago` : fmtDate(p.date, { month: 'short', day: 'numeric' });
  return `${day} · ${clock(p.mins)}`;
}

/** Semicircle gauge for a -100..100 mood. */
export function MoodGauge({ mood, size = 150, label }: { mood: number; size?: number; label?: { label: string; color: string } }) {
  const m = label ?? moodLabel(mood);
  const a = Math.PI * (1 - (Math.max(-100, Math.min(100, mood)) + 100) / 200);
  const r = 44, cx = 50, cy = 50;
  const arc = (from: number, to: number) => `M ${cx + r * Math.cos(from)} ${cy - r * Math.sin(from)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(to)} ${cy - r * Math.sin(to)}`;
  const segs = ['#b91c1c', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#f0c674'];
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 100 56" width={size} height={size * 0.56}>
        {segs.map((c, i) => <path key={i} d={arc(Math.PI - (i * Math.PI) / segs.length - 0.02, Math.PI - ((i + 1) * Math.PI) / segs.length + 0.02)} stroke={c} strokeWidth="7" fill="none" opacity={0.85} />)}
        <line x1={cx} y1={cy} x2={cx + (r - 9) * Math.cos(a)} y2={cy - (r - 9) * Math.sin(a)} stroke="#f0e6d2" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.5" fill="#f0e6d2" />
      </svg>
      <div className="font-display text-xl font-bold leading-none -mt-1" style={{ color: m.color }}>{m.label}</div>
      <div className="text-[11px] text-dim">mood {mood > 0 ? '+' : ''}{Math.round(mood)}</div>
    </div>
  );
}

function Initial({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return <div className="rounded-full shrink-0 flex items-center justify-center font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.45, color, background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}66` }}>{name.replace(/[^A-Za-z0-9]/g, '')[0]?.toUpperCase() ?? '?'}</div>;
}

/** Social-feed post with persona tag, likes and an optional reply. */
export function PostCard({ state, p, compactMode = false }: { state: GameState; p: FanPost; compactMode?: boolean }) {
  const per = PERSONA_INFO[p.persona];
  const team = state.teams[p.teamId];
  const player = p.playerId ? state.players[p.playerId] : undefined;
  const tag = SCENARIO_META[p.topic]?.tag;
  return (
    <div className={`${compactMode ? 'py-2' : 'panel-flat p-3'} flex gap-3`} style={compactMode ? undefined : { boxShadow: `inset 3px 0 0 ${SENTIMENT_COLOR[p.sentiment] ?? '#64748b'}` }}>
      <Initial name={p.user} color={per.color} size={compactMode ? 28 : 36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate">@{p.user}</span>
          <span className="chip py-0 text-[10px]" style={{ color: per.color, borderColor: per.color + '55', background: per.color + '14' }}>{per.label}</span>
          {team && p.teamId !== state.userTeamId && <span className="text-[10px] text-dim">on {team.short}</span>}
          <span className="text-[11px] text-dim ml-auto shrink-0">{postTime(state, p)}</span>
        </div>
        <div className={`${compactMode ? 'text-[13px]' : 'text-sm'} mt-0.5 leading-snug`}>{p.text}</div>
        {!compactMode && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted">
            <span title="Likes">♥ {compact(p.likes)}</span>
            <span title="Reposts">⟳ {compact(p.reposts)}</span>
            {tag && team && <span className="text-dim">#{team.short.replace(/[^A-Za-z0-9]/g, '')}{tag}</span>}
            {player && <button className="flex items-center gap-1 hover:text-gold2" onClick={() => nav('player', player.id)}><Portrait player={player} size={16} className="rounded-full" />{player.handle}</button>}
            {p.fixtureId && state.fixtures[p.fixtureId] && <button className="hover:text-gold2 ml-auto" onClick={() => nav('fixture', p.fixtureId!)}>View match →</button>}
          </div>
        )}
        {!compactMode && p.replies?.map((r, i) => (
          <div key={i} className="flex gap-2 mt-2 pl-2 border-l-2 border-[#1e2a44]">
            <Initial name={r.user} color={PERSONA_INFO[r.persona].color} size={22} />
            <div className="min-w-0 text-[13px]">
              <span className="font-semibold">@{r.user}</span> <span className="text-[10px]" style={{ color: PERSONA_INFO[r.persona].color }}>{PERSONA_INFO[r.persona].label}</span>
              <div className="text-text/90">{r.text}</div>
              <div className="text-[11px] text-dim">♥ {compact(r.likes)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Choice buttons for an owner request (Inbox action 'ownerChoice' and the Boardroom). */
export function OwnerChoiceBox({ state, reqId }: { state: GameState; reqId: string }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const req = state.owner?.requests.find((r) => r.id === reqId);
  if (!req) return <div className="panel-flat p-4 text-sm text-muted">This request is no longer on file.</div>;
  const live = ownerRequestLive(state, reqId);
  const chosen = req.options.find((o) => o.id === req.resolved);
  return (
    <div className={`panel-flat p-4 ${live ? 'border-gold/40' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider font-bold text-gold2">The owner wants an answer</div>
        <div className="text-[11px] text-dim">{live ? `Reply by ${fmtDate(req.expires, { month: 'short', day: 'numeric' })} — otherwise he decides` : chosen ? 'Answered' : 'Expired'}</div>
      </div>
      {live ? (
        <div className="grid gap-2">
          {req.options.map((o) => (
            <button key={o.id} disabled={busy} className="btn justify-between text-left w-full" onClick={() => { setBusy(true); const r = resolveOwnerChoice(state, reqId, o.id); notify(r.message); bump(); setBusy(false); }}>
              <span>{o.label}</span>
              {o.hint && <span className="text-[11px] text-muted font-normal">{o.hint}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm">
          {chosen && <div className="mb-1"><Pill color="#f0c674">{chosen.label}</Pill></div>}
          <div className="whitespace-pre-line text-text/90">{req.outcome ?? 'No reply was sent.'}</div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dashboard row
function FanPanel({ state }: { state: GameState }) {
  const fm = state.fanPulse?.teams[state.userTeamId];
  const posts = (state.fanPulse?.posts ?? []).filter((p) => p.teamId === state.userTeamId).slice(0, 3);
  return (
    <Panel title="Fan Pulse" className="col-span-2" right={<button className="btn btn-ghost text-xs" onClick={() => nav('fans')}>Open feed →</button>}>
      {!fm ? <div className="text-sm text-muted">The fans haven’t made up their minds yet — play some matches.</div> : (
        <div className="flex gap-5">
          <div className="shrink-0 flex flex-col items-center gap-2 w-40">
            <MoodGauge mood={fm.mood} size={140} />
            <div className="w-full space-y-1">
              <Bar value={fm.patience} label="Patience" color="#38bdf8" height={4} />
              <div className="text-[11px] text-muted flex justify-between"><span>Expectation</span><span className="text-text">{expectationLabel(fm.expectation)}</span></div>
              <div className="text-[11px] text-muted flex justify-between"><span>Form</span><span className="font-display font-bold tracking-wider">{[...fm.form.slice(-6)].map((c, i) => <span key={i} className={c === 'W' ? 'text-win' : 'text-loss'}>{c}</span>)}</span></div>
            </div>
          </div>
          <div className="flex-1 min-w-0 divide-y divide-[#141e33]">
            <BuzzHint state={state} />
            {posts.length ? posts.map((p) => <PostCard key={p.id} state={state} p={p} compactMode />) : <div className="text-sm text-muted">No posts yet.</div>}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** The freshest anomaly the fans are talking about (overnight jumps, possessed runs, slumps…), if any. */
function BuzzHint({ state }: { state: GameState }) {
  const e = state.fanPulse?.buzz?.events.find((x) => x.teamId === state.userTeamId && days(x.date, state.date) <= 10 && ['jump', 'drop', 'possessed', 'slump', 'too_good', 'superteam', 'money', 'teleport', 'mystery'].includes(x.kind));
  if (!e) return null;
  const p = e.playerId ? state.players[e.playerId] : undefined;
  const per = p ? perception(state, p.id) : null;
  const text = p ? `${p.handle} — “${per?.label}”` : e.kind === 'too_good' ? `Unbeaten in ${e.data?.streak}: “is this a simulation?”` : e.kind === 'superteam' ? 'The fans think this lineup is too good to be true' : 'The fans are asking where the money came from';
  return (
    <button className="w-full text-left py-1.5 flex items-center gap-2 text-xs hover:text-gold2" onClick={() => (p ? nav('player', p.id) : nav('fans'))}>
      <span className="chip py-0 text-[10px]" style={{ color: per?.color ?? '#e879f9', borderColor: (per?.color ?? '#e879f9') + '55' }}>Buzz</span>
      <span className="truncate">{text}</span>
    </button>
  );
}

function OwnerPanel({ state }: { state: GameState }) {
  const o = state.owner;
  if (!o) return <Panel title="Owner"><div className="text-sm text-muted">The owner will be in touch soon.</div></Panel>;
  const m = ownerMoodLabel(o.mood);
  const pending = o.requests.filter((r) => ownerRequestLive(state, r.id));
  const promises = o.promises.filter((p) => p.status === 'open').slice(0, 2);
  return (
    <Panel title="Owner" right={<button className="btn btn-ghost text-xs" onClick={() => nav('boardroom')}>Boardroom →</button>}>
      <div className="font-display text-lg font-bold leading-tight">{o.name}</div>
      <div className="text-[11px] text-muted mb-2">{o.title}</div>
      <div className="flex gap-1 flex-wrap mb-3">{o.traits.map((t) => <span key={t} title={TRAIT_INFO[t].desc}><Pill color={TRAIT_INFO[t].color}>{TRAIT_INFO[t].label}</Pill></span>)}</div>
      <Bar value={(o.mood + 100) / 2} label={<>Mood · <span style={{ color: m.color }}>{m.label}</span></>} color={m.color} showValue={false} height={5} />
      {o.ultimatum >= 2 && <div className="text-xs text-red-400 mt-2 font-semibold">⚠ {o.ultimatum >= 3 ? 'Final warning issued' : 'Ultimatum in force'}</div>}
      {promises.map((p) => <div key={p.id} className="text-xs mt-2 text-muted"><span className="text-gold">◆</span> {p.text}{p.kind === 'winSeries' ? ` — ${p.wins}/${p.target}` : ''}</div>)}
      {pending.length > 0 && <button className="btn btn-gold w-full mt-3 text-xs" onClick={() => nav('inbox')}>{pending.length} request{pending.length > 1 ? 's' : ''} awaiting your reply</button>}
    </Panel>
  );
}

/** Dashboard row: fan mood + latest posts, owner summary. */
export default function ClubPulseRow() {
  const state = useGame();
  return (
    <div className="grid grid-cols-3 gap-4">
      <FanPanel state={state} />
      <OwnerPanel state={state} />
    </div>
  );
}
