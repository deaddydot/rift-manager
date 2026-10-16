// Post-game analysis: the coaching staff's breakdown of the user's recent games — why we won or lost, every mistake
// they caught (ours and theirs) on a gold graph and a timeline, player cards, objectives, fights, the plays worth
// showing off, and a VOD review that turns the mistakes into two weeks of focused training.
// Engines: engine/sim/analysis.ts (the match analyst) and engine/management/analysis.ts (staff, reviews, lessons).
import { useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState } from '../../engine/types';
import { ROLE_LABEL, ATTRIBUTE_LABEL, type Role } from '../../engine/types';
import { Panel, Empty, TeamLogo, Portrait, Pill, Bar, fmtDate } from '../components/kit';
import { analysisState, coachView, reviewWithTeam, mistakeLabel, sevFloor, LESSON_DAYS, type StoredReport } from '../../engine/management/analysis';
import type { Mistake } from '../../engine/sim/analysis';

const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const SEV_COLOR = ['#64748b', '#eab308', '#f97316', '#ef4444'];
const scoreColor = (s: number) => (s >= 7.5 ? '#22c55e' : s >= 6 ? '#84cc16' : s >= 4.5 ? '#c8aa6e' : s >= 3 ? '#f97316' : '#ef4444');

export default function Analysis({ id }: { id?: string }) {
  const state = useGame();
  useStore((s) => s.v);
  const st = analysisState(state);
  const r = (id && st.reports.find((x) => x.id === id)) || st.reports[0];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Game analysis</h1>
        <div className="text-sm text-muted mt-1">Your staff break down every game: the mistakes that cost it, the ones you punished, and what to work on.</div>
      </div>
      {!st.reports.length ? <div className="panel"><Empty>No analysed games yet. Every game your team plays (live or simulated) gets a breakdown here.</Empty></div> : (
        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
          <div className="space-y-4">
            <Panel title="Recent games" bodyClass="p-0">
              {st.reports.map((x) => <ReportRow key={x.id} state={state} r={x} on={x.id === r?.id} />)}
            </Panel>
            <Lessons state={state} />
          </div>
          {r && <Report state={state} r={r} />}
        </div>
      )}
    </div>
  );
}

function ReportRow({ state, r, on }: { state: GameState; r: StoredReport; on: boolean }) {
  const opp = state.teams[r.userSide === 0 ? r.red : r.blue];
  return (
    <button className={`w-full px-3 py-2 border-b border-[#141e33] last:border-0 flex items-center gap-2 text-left ${on ? 'bg-gold/10' : 'hover:bg-[#111a2e]'}`} onClick={() => nav('analysis', r.id)}>
      <span className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold ${r.won ? 'bg-win/20 text-win' : 'bg-loss/20 text-loss'}`}>{r.won ? 'W' : 'L'}</span>
      <TeamLogo team={opp} size={20} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">vs {opp?.short ?? '?'} · game {r.gameNo}</div>
        <div className="text-[10px] text-dim truncate">{fmtDate(r.date, { month: 'short', day: 'numeric' })} · {r.comp.replace(/\s\d{4}$/, '')}</div>
      </div>
      {r.reviewed && <span className="text-[10px] text-accent" title="Reviewed with the team">✓</span>}
    </button>
  );
}

function Lessons({ state }: { state: GameState }) {
  const st = analysisState(state);
  const active = Object.entries(st.lessons).filter(([pid, l]) => l.until >= state.date && state.players[pid]?.teamId === state.userTeamId);
  return (
    <Panel title="Lessons in training">
      {!active.length ? <div className="text-xs text-dim">None right now. Review a game with the team to set some: each player whose mistakes were caught trains their weak spot harder for {LESSON_DAYS} days.</div> : (
        <div className="space-y-1.5">{active.map(([pid, l]) => {
          const p = state.players[pid];
          return (
            <div key={pid} className="flex items-center gap-2 text-xs">
              <Portrait player={p} team={state.teams[state.userTeamId]} size={22} />
              <span className="font-semibold">{p.handle}</span>
              <span className="text-gold2">{ATTRIBUTE_LABEL[l.attr]}</span>
              <span className="ml-auto text-dim">until {fmtDate(l.until, { month: 'short', day: 'numeric' })}</span>
            </div>
          );
        })}</div>
      )}
    </Panel>
  );
}

function Report({ state, r }: { state: GameState; r: StoredReport }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const view = useMemo(() => coachView(state, r), [r, r.reviewed]);
  const [side, setSide] = useState<'ours' | 'theirs'>('ours');
  const a = r.a, us = r.userSide, them = (1 - us) as 0 | 1;
  const me = state.teams[us === 0 ? r.blue : r.red], opp = state.teams[us === 0 ? r.red : r.blue];
  const list = side === 'ours' ? view.ours : view.theirs;
  const pidOf = (idx?: number) => (idx === undefined ? undefined : r.playerIds[idx]);
  return (
    <div className="space-y-4 min-w-0">
      <div className="panel p-4 flex items-center gap-4 flex-wrap">
        <TeamLogo team={me} size={44} />
        <div>
          <div className={`font-display text-2xl font-bold ${r.won ? 'text-win' : 'text-loss'}`}>{r.won ? 'Win' : 'Loss'} vs {opp?.name} · {mm(a.duration)}</div>
          <div className="text-xs text-muted">{r.comp} · game {r.gameNo} · {fmtDate(r.date)} · analysis by {view.analyst}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="w-40" title="How much the staff catch: analysts' drafting and scouting, the head coach, the Analytics Lab">
            <div className="text-[10px] uppercase tracking-wider text-muted">Analysis depth</div>
            <Bar value={view.quality * 100} showValue={false} color="#38bdf8" height={5} />
          </div>
          {r.reviewed
            ? <Pill color="#2dd4bf">Reviewed {fmtDate(r.reviewed, { month: 'short', day: 'numeric' })}</Pill>
            : <button className="btn btn-gold" title={`Lessons for ${LESSON_DAYS} days for the players whose mistakes were caught; costs a little fatigue`} onClick={() => { notify(reviewWithTeam(state, r.id).message); bump(); }}>🎬 Review with the team</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Panel title={r.won ? 'Why we won' : 'Why we lost'}>
          <ul className="space-y-1.5 text-sm">{view.reasons.length ? view.reasons.map((x, i) => <li key={i} className="flex gap-2"><span className="text-gold2">▸</span><span>{x}</span></li>) : <li className="text-muted">A clean game from both sides — it came down to the draft and the fights.</li>}</ul>
          {view.missed > 0 && <div className="text-[11px] text-dim mt-2">{view.missed} smaller mistake{view.missed > 1 ? 's' : ''} went unnoticed — sharper analysts or a better Analytics Lab would catch {view.missed > 1 ? 'them' : 'it'}.</div>}
        </Panel>
        <Panel title="Coach's notes">
          <ul className="space-y-1.5 text-xs text-muted">{view.notes.map((x, i) => <li key={i}>• {x}</li>)}</ul>
          {view.focus.length > 0 && (
            <div className="mt-3 pt-2 border-t hairline space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Work on</div>
              {view.focus.slice(0, 4).map((f) => { const p = state.players[f.playerId]; return p ? <div key={f.playerId} className="text-xs"><span className="font-semibold">{p.handle}</span> · <span className="text-gold2">{ATTRIBUTE_LABEL[f.attr]}</span> <span className="text-dim">({f.why})</span></div> : null; })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Gold and mistakes" right={<span className="text-[11px] text-dim"><span className="text-loss">●</span> our mistakes · <span className="text-win">●</span> theirs</span>}>
        <GoldGraph a={a} us={us} floor={sevFloor(r.quality)} />
      </Panel>

      <Panel title="Mistakes" right={
        <div className="flex gap-1">
          {(['ours', 'theirs'] as const).map((s) => <button key={s} className={`chip px-2 py-0.5 text-[11px] ${side === s ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => setSide(s)}>{s === 'ours' ? `Ours (${view.ours.length})` : `Theirs (${view.theirs.length})`}</button>)}
        </div>
      } bodyClass="p-0">
        {!list.length ? <Empty>{side === 'ours' ? 'Nothing the staff would point at.' : 'They played it clean.'}</Empty> : list.map((m, i) => <MistakeRow key={i} m={m} state={state} pid={pidOf(m.who)} />)}
      </Panel>

      <Panel title="Players" bodyClass="p-0">
        <table className="tbl">
          <thead><tr><th>Player</th><th>Score</th><th>KDA</th><th title="CS difference to the lane opponent at 10:00">CS@10</th><th title="Gold difference to the lane opponent at 15:00">Gold@15</th><th>Wards</th><th>How they died</th></tr></thead>
          <tbody>{a.players.filter((p) => p.side === us).map((p) => {
            const pl = state.players[r.playerIds[p.idx]];
            return (
              <tr key={p.idx}>
                <td><div className="flex items-center gap-2">{pl && <Portrait player={pl} team={me} size={26} />}<div><button className="font-semibold hover:underline" onClick={() => pl && nav('player', pl.id)}>{p.name}</button><div className="text-[10px] text-dim">{ROLE_LABEL[p.role as Role]} · {p.champ}</div></div></div></td>
                <td><span className="font-display font-bold" style={{ color: scoreColor(p.score) }}>{p.score.toFixed(1)}</span></td>
                <td className="font-display">{p.k}/{p.d}/{p.a}</td>
                <td className={p.csd10 >= 0 ? 'text-win' : 'text-loss'}>{p.csd10 >= 0 ? '+' : ''}{p.csd10}</td>
                <td className={p.gd15 >= 0 ? 'text-win' : 'text-loss'}>{p.gd15 >= 0 ? '+' : ''}{(p.gd15 / 1000).toFixed(1)}k</td>
                <td>{p.wards}</td>
                <td><div className="flex gap-1 flex-wrap">{Object.entries(p.deaths).sort((x, y) => y[1] - x[1]).map(([k, n]) => <span key={k} className="chip px-1.5 py-0 text-[10px]" style={{ color: k === 'trade' || k === 'teamfight' || k === 'gank' ? '#94a3b8' : '#f97316' }}>{k === 'trade' ? 'fair trade' : k === 'teamfight' ? 'teamfight' : k === 'gank' ? 'ganked' : mistakeLabel(k).toLowerCase()} ×{n}</span>)}</div></td>
              </tr>
            );
          })}</tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Plays to show off">
          {a.highlights.filter((h) => h.side === us).length ? (
            <ul className="space-y-1 text-xs">{a.highlights.filter((h) => h.side === us).slice(0, 8).map((h, i) => <li key={i}><span className="text-dim mr-1">{mm(h.t)}</span>{h.text}</li>)}</ul>
          ) : <div className="text-xs text-dim">No standout plays.</div>}
        </Panel>
        <Panel title="Objectives">
          <ul className="space-y-1 text-xs">{a.objectives.map((o, i) => (
            <li key={i} className="flex gap-2"><span className="text-dim w-10">{mm(o.t)}</span><span className={o.side === us ? 'text-win' : 'text-loss'}>{o.side === us ? me?.short : opp?.short}</span><span>{o.kind}</span>{o.stolen && <Pill color="#f0c674">stolen</Pill>}{o.note && <span className="text-dim">({o.note})</span>}</li>
          ))}</ul>
          <div className="text-[11px] text-dim mt-2">Calls: {a.calls.good[us]} good reads, {a.calls.bad[us]} misread{a.calls.bad[us] === 1 ? '' : 's'} (theirs: {a.calls.good[them]} / {a.calls.bad[them]})</div>
        </Panel>
        <Panel title="Teamfights">
          {a.fights.length ? (
            <ul className="space-y-1 text-xs">{a.fights.map((f, i) => {
              const won = f.kills[us] > f.kills[them];
              return <li key={i} className="flex gap-2"><span className="text-dim w-10">{mm(f.t)}</span><span className={won ? 'text-win' : f.kills[us] === f.kills[them] ? 'text-muted' : 'text-loss'}>{f.kills[us]}–{f.kills[them]}</span><span className="text-muted">{f.zone}</span><span className="text-dim ml-auto">{f.size[us]}v{f.size[them]}</span></li>;
            })}</ul>
          ) : <div className="text-xs text-dim">No big fights.</div>}
        </Panel>
      </div>
    </div>
  );
}

function MistakeRow({ m, state, pid }: { m: Mistake; state: GameState; pid?: string }) {
  const p = pid ? state.players[pid] : undefined;
  return (
    <div className="px-4 py-2 border-b border-[#141e33] last:border-0 flex items-start gap-3 text-sm">
      <span className="text-[11px] text-dim w-10 shrink-0 pt-0.5">{mm(m.t)}</span>
      <span className="flex gap-0.5 pt-1.5 shrink-0">{[1, 2, 3].map((k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: k <= m.sev ? SEV_COLOR[m.sev] : '#1e293b' }} />)}</span>
      <span className="chip px-1.5 py-0 text-[10px] shrink-0" style={{ color: SEV_COLOR[m.sev] }}>{mistakeLabel(m.kind)}</span>
      <div className="flex-1 min-w-0">
        <div>{m.text}</div>
        {p && <div className="text-[10px] text-dim">{p.handle} · {state.teams[p.teamId ?? '']?.short ?? ''}</div>}
      </div>
      {m.cost > 0 && <span className="text-[11px] text-loss shrink-0">−{m.cost >= 1000 ? `${(m.cost / 1000).toFixed(1)}k` : m.cost}</span>}
    </div>
  );
}

/** Gold difference (our side) over time with mistake markers. */
function GoldGraph({ a, us, floor }: { a: StoredReport['a']; us: 0 | 1; floor: number }) {
  const W = 760, H = 150, pad = 26;
  const g = a.gold.map((x) => (us === 0 ? x : -x));
  if (g.length < 2) return <div className="text-xs text-dim">Too short a game for a graph.</div>;
  const max = Math.max(2000, ...g.map(Math.abs));
  const X = (min: number) => pad + (min / Math.max(1, g.length - 1)) * (W - pad * 2);
  const Y = (v: number) => H / 2 - (v / max) * (H / 2 - 10);
  const pts = g.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const area = `${X(0)},${H / 2} ${pts} ${X(g.length - 1)},${H / 2}`;
  const marks = a.mistakes.filter((m) => m.sev >= floor && m.kind !== 'low_vision');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="#334155" strokeDasharray="4 4" />
      <polygon points={area} fill="#c8aa6e22" />
      <polyline points={pts} fill="none" stroke="#c8aa6e" strokeWidth="2" />
      {[0, 10, 20, 30, 40].filter((m) => m < g.length).map((m) => <text key={m} x={X(m)} y={H - 2} fontSize="10" fill="#64748b" textAnchor="middle">{m}:00</text>)}
      <text x={4} y={14} fontSize="10" fill="#64748b">+{(max / 1000).toFixed(1)}k</text>
      <text x={4} y={H - 14} fontSize="10" fill="#64748b">−{(max / 1000).toFixed(1)}k</text>
      {marks.map((m, i) => {
        const min = Math.min(g.length - 1, m.t / 60);
        const i0 = Math.floor(min), i1 = Math.min(g.length - 1, i0 + 1);
        const v = g[i0] + (g[i1] - g[i0]) * (min - i0);
        const ours = m.side === us;
        return <circle key={i} cx={X(min)} cy={Y(v)} r={2 + m.sev} fill={ours ? '#ef4444' : '#22c55e'} fillOpacity="0.85"><title>{`${mm(m.t)} ${m.text}`}</title></circle>;
      })}
    </svg>
  );
}
