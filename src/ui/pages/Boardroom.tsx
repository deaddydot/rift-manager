import { useGame, nav } from '../../store/game';
import { Panel, Empty, Bar, Pill, Stat, TeamLogo, fmtDate } from '../components/kit';
import { OwnerChoiceBox } from '../components/FanPulseWidget';
import PathUpPanel from '../components/PathUp';
import { ownerMoodLabel, ownerRequestLive, TRAIT_INFO } from '../../engine/management/owner';

const WARNING = ['No concerns', 'Concerned', 'Ultimatum issued', 'Final warning'];
const STATUS_COLOR = { open: '#f0c674', kept: '#22c55e', broken: '#ef4444' } as const;
const toneColor = (t: number) => (t > 0 ? '#22c55e' : t < 0 ? '#ef4444' : '#8a97b3');

export default function Boardroom(_props: { id?: string }) {
  const state = useGame();
  const team = state.teams[state.userTeamId];
  const o = state.owner;
  if (!o) return <div className="panel"><Empty>The owner hasn’t introduced themselves yet. Press Continue.</Empty></div>;
  const m = ownerMoodLabel(o.mood);
  const conf = state.board.confidence;
  const pending = o.requests.filter((r) => ownerRequestLive(state, r.id));
  const past = o.requests.filter((r) => !ownerRequestLive(state, r.id)).slice(0, 8);
  const mail = state.inbox.filter((x) => x.from === `${o.name} (Owner)`).slice(0, 8);
  const initials = o.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="p-5 flex items-center gap-5" style={{ background: `linear-gradient(110deg, ${team.colors[0]}30, transparent 60%)` }}>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-display text-3xl font-bold text-gold2 shrink-0" style={{ background: 'linear-gradient(150deg, #c8aa6e44, #0b1220)', boxShadow: 'inset 0 0 0 1px #c8aa6e66' }}>{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-muted">{o.title} · {team.name}</div>
            <div className="font-display text-3xl font-bold leading-tight gold-text">{o.name}</div>
            <div className="text-sm text-muted">{o.name} {o.background}. Your owner since {fmtDate(o.hired)}.</div>
            <div className="flex gap-1.5 flex-wrap mt-2">{o.traits.map((t) => <span key={t} title={TRAIT_INFO[t].desc}><Pill color={TRAIT_INFO[t].color}>{TRAIT_INFO[t].label}</Pill></span>)}</div>
          </div>
          <TeamLogo team={team} size={64} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Owner mood" value={m.label} sub={`${o.mood > 0 ? '+' : ''}${Math.round(o.mood)} / 100`} color={m.color} />
        <Stat label="Board confidence" value={`${Math.round(conf)}%`} sub={WARNING[o.ultimatum] ?? ''} color={conf < 30 ? '#ef4444' : conf > 70 ? '#22c55e' : '#eab308'} />
        <Stat label="Your record" value={`${o.record.w}-${o.record.l}`} sub="series under this owner" />
        <Stat label="Budget multiplier" value={`×${(state.board.budgetMultiplier ?? 1).toFixed(2)}`} sub="raised by owner investments" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4 min-w-0">
          <PathUpPanel state={state} />
          <Panel title={`Awaiting your answer (${pending.length})`}>
            {pending.length === 0 ? <div className="text-sm text-muted">Nothing on the table right now. Enjoy the quiet.</div> : (
              <div className="space-y-3">{pending.map((r) => (
                <div key={r.id}>
                  <div className="text-xs text-dim mb-1">{fmtDate(r.date)} · {r.kind.replace(/_/g, ' ')}</div>
                  <OwnerChoiceBox state={state} reqId={r.id} />
                </div>
              ))}</div>
            )}
          </Panel>
          <Panel title="Promises & ultimatums" bodyClass="p-0">
            {o.promises.length === 0 ? <div className="px-4 py-3 text-sm text-muted">You haven’t promised anything. Yet.</div> : o.promises.map((p) => (
              <div key={p.id} className="px-4 py-2.5 border-b border-[#141e33] last:border-0 flex items-center gap-3">
                <Pill color={STATUS_COLOR[p.status]}>{p.status}</Pill>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{p.text}</div>
                  <div className="text-[11px] text-dim">Made {fmtDate(p.made, { month: 'short', day: 'numeric' })} · deadline {fmtDate(p.deadline, { month: 'short', day: 'numeric' })}{p.source ? ` · ${p.source}` : ''}</div>
                </div>
                {p.kind === 'winSeries' && <div className="w-28"><Bar value={p.wins} max={p.target} label={`${p.wins}/${p.target} (${p.series}/${p.data?.of ?? '?'})`} color={STATUS_COLOR[p.status]} showValue={false} height={5} /></div>}
              </div>
            ))}
          </Panel>
          <Panel title="Past requests" bodyClass="p-0">
            {past.length === 0 ? <div className="px-4 py-3 text-sm text-muted">—</div> : past.map((r) => (
              <div key={r.id} className="px-4 py-2.5 border-b border-[#141e33] last:border-0">
                <div className="flex items-center gap-2 text-xs"><span className="text-dim">{fmtDate(r.date, { month: 'short', day: 'numeric' })}</span><span className="font-semibold capitalize">{r.kind.replace(/_/g, ' ')}</span><span className="text-gold2">→ {r.options.find((x) => x.id === r.resolved)?.label ?? 'no answer'}</span></div>
                {r.outcome && <div className="text-xs text-muted whitespace-pre-line mt-0.5">{r.outcome}</div>}
              </div>
            ))}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Relationship">
            <Bar value={(o.mood + 100) / 2} label="Owner mood" color={m.color} showValue={false} />
            <div className="mt-2"><Bar value={conf} label="Board confidence" color={conf < 30 ? '#ef4444' : '#22c55e'} /></div>
            <ul className="space-y-1.5 text-sm mt-4">{state.board.objectives.map((ob) => <li key={ob.id} className="flex gap-2"><span className="text-gold">◆</span>{ob.text}</li>)}</ul>
          </Panel>
          <Panel title="Timeline" bodyClass="p-0">
            {o.log.length === 0 ? <div className="px-4 py-3 text-xs text-dim">—</div> : o.log.slice(0, 18).map((l, i) => (
              <div key={i} className="px-4 py-1.5 border-b border-[#141e33] last:border-0 flex gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: toneColor(l.tone) }} />
                <span className="text-dim w-12 shrink-0">{fmtDate(l.date, { month: 'short', day: 'numeric' })}</span>
                <span className="text-text/90">{l.text}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Recent mail" right={<button className="btn btn-ghost text-xs" onClick={() => nav('inbox')}>Inbox →</button>} bodyClass="p-0">
            {mail.length === 0 ? <div className="px-4 py-3 text-xs text-dim">—</div> : mail.map((x) => (
              <button key={x.id} className="w-full text-left px-4 py-2 border-b border-[#141e33] last:border-0 hover:bg-[#111a2e]" onClick={() => nav('inbox')}>
                <div className={`text-sm truncate ${x.read ? 'text-muted' : 'font-semibold'}`}>{x.subject}</div>
                <div className="text-[11px] text-dim">{fmtDate(x.date, { month: 'short', day: 'numeric' })}{x.action && !x.action.done ? ' · awaiting reply' : ''}</div>
              </button>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
