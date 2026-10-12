// The player's side of an incoming bid (engine: management/bidTalks.ts): a stance pill for tables and a
// fuller box for the Inbox bid card — how keen he is, why, and what happened after your decision.
import type { BidStance, Player, TransferOffer } from '../../engine/types';
import { STANCE_INFO } from '../../engine/management/bidTalks';
import { Pill } from './kit';

export function StancePill({ st }: { st?: BidStance }) {
  if (!st) return <span className="text-dim text-xs">—</span>;
  const info = STANCE_INFO[st.label];
  return <span title={`${info.label} (${st.v >= 0 ? '+' : ''}${st.v.toFixed(2)}): ${st.why}`}><Pill color={info.color}>{info.label}</Pill></span>;
}

/** Diverging −1 … +1 bar: left = wants to stay, right = wants to go. */
function InterestBar({ v }: { v: number }) {
  const color = STANCE_INFO[v >= 0.4 ? 'eager' : v >= 0.15 ? 'keen' : v > -0.15 ? 'open' : v > -0.4 ? 'reluctant' : 'refuses'].color;
  return (
    <div className="relative h-1.5 rounded-full bg-[#0a1120] w-40 shrink-0" title={`Interest in the move ${v >= 0 ? '+' : ''}${v.toFixed(2)}`}>
      <div className="absolute -top-0.5 -bottom-0.5 w-px bg-[#2a3a5c]" style={{ left: '50%' }} />
      <div className="absolute h-full rounded-full" style={{ left: v >= 0 ? '50%' : `${50 + v * 50}%`, width: `${Math.abs(v) * 50}%`, background: color }} />
    </div>
  );
}

export function StanceBox({ o, p, pending }: { o: TransferOffer; p: Player; pending: boolean }) {
  const st = o.stance;
  if (!st) return null;
  const info = STANCE_INFO[st.label];
  const cur = p.contract?.salary ?? 0;
  const raise = cur ? Math.round((o.salary / cur - 1) * 100) : 0;
  return (
    <div className="rounded-lg border border-[#22304d] bg-[#0d1528] p-3 mb-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="text-[11px] uppercase tracking-wider font-bold text-muted">{p.handle}’s view</span>
        <Pill color={info.color}>{info.label}</Pill>
        <InterestBar v={st.v} />
        <span className="text-dim">stay ← → go</span>
        {cur > 0 && <span className="ml-auto text-muted">Their offer to him: <span className="text-text font-semibold">{raise >= 0 ? '+' : ''}{raise}%</span> on his wage</span>}
      </div>
      <div className="text-text/90 text-[13px] mb-1">{p.handle} {info.phrase} — {st.why}.</div>
      {st.reasons && st.reasons.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {st.reasons.map((r, i) => <span key={i} style={{ color: r.startsWith('+') ? '#fbbf24' : '#38bdf8' }}>{r}</span>)}
        </div>
      )}
      {pending && st.promised && <div className="mt-1.5 text-amber-300">You promised to let him go if a fair bid came — turning this down breaks your word.</div>}
      {pending && (st.label === 'reluctant' || st.label === 'refuses') && <div className="mt-1.5 text-sky-300">If you accept, he may refuse personal terms — and he’ll know you tried to sell him.</div>}
      {pending && (st.label === 'eager' || st.label === 'keen') && !st.promised && <div className="mt-1.5 text-amber-300">He wants this move: turning it down will cost morale and trust, and he may come back to you about it.</div>}
      {!pending && st.note && <div className="mt-1.5 text-muted">Outcome: <span className="text-text">{st.note}</span></div>}
    </div>
  );
}
