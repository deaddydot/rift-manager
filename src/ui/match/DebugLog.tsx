import { useMemo, useState } from 'react';
import type { MatchSim } from '../../engine/sim/engine';
import type { DebugCat, DebugEntry } from '../../engine/sim/simtypes';
import { TEAM_COLORS } from './renderer';
import { mmss } from '../components/kit';

const CATS: { id: DebugCat; label: string }[] = [
  { id: 'task', label: 'Tasks' }, { id: 'plan', label: 'Team plan' }, { id: 'call', label: 'Objective calls' },
  { id: 'fight', label: 'Fights' }, { id: 'help', label: 'Help / presence' }, { id: 'wave', label: 'Waves' },
  { id: 'ult', label: 'Ultimates & summons' }, { id: 'cc', label: 'Crowd control' }, { id: 'recall', label: 'Recalls' }, { id: 'flash', label: 'Flash' }, { id: 'base', label: 'Base defense' }, { id: 'stuck', label: 'Stuck' },
];
const DEFAULT_OFF = new Set<DebugCat>(['wave']);

/** Decision log: why players and teams do what they do. Filter by team / player / category, copy as text. */
export default function DebugLog({ sim, selected, onSelect }: { sim: MatchSim; selected: number | null; onSelect: (i: number | null) => void }) {
  const [scope, setScope] = useState<'all' | '0' | '1' | 'selected'>('all');
  const [off, setOff] = useState<Set<DebugCat>>(DEFAULT_OFF);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const log = sim.debugLog;
  const len = log.length;

  const who = (e: DebugEntry) => (e.idx !== null ? sim.champs[e.idx].input.name : e.side !== null ? sim.teams[e.side].input.short : 'Game');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: DebugEntry[] = [];
    for (let i = log.length - 1; i >= 0 && out.length < 400; i--) {
      const e = log[i];
      if (off.has(e.cat)) continue;
      if (scope === '0' || scope === '1') { if (e.side !== Number(scope)) continue; }
      else if (scope === 'selected') { if (selected === null || (e.idx !== selected && !(e.idx === null && e.side === sim.champs[selected].side))) continue; }
      if (q && !(`${who(e)} ${e.text}`.toLowerCase().includes(q))) continue;
      out.push(e);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len, scope, off, query, selected]);

  const copy = () => {
    const text = [...rows].reverse().map((e) => `${mmss(e.t)} ${who(e)} [${e.cat}] ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const toggle = (c: DebugCat) => setOff((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="text-[11px] uppercase text-muted font-bold mr-1">Decision log</div>
        <select className="input text-xs py-1" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="all">Both teams</option>
          <option value="0">{sim.teams[0].input.short} only</option>
          <option value="1">{sim.teams[1].input.short} only</option>
          <option value="selected">Selected player{selected !== null ? `: ${sim.champs[selected].input.name}` : ' (click one)'}</option>
        </select>
        <input className="input text-xs py-1 w-40" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {CATS.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)} className={`text-[10px] px-1.5 py-0.5 rounded border ${off.has(c.id) ? 'border-line text-dim' : 'border-gold/60 text-gold2'}`}>{c.label}</button>
          ))}
        </div>
        <div className="flex-1" />
        <button className="btn text-xs py-1" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      {!sim.debugOn && <div className="text-xs text-dim">Decision logging is off for this match.</div>}
      <div className="max-h-72 overflow-y-auto font-mono text-[11px] leading-snug space-y-px">
        {rows.map((e, i) => (
          <div key={len - i} className="flex gap-2 hover:bg-panel2/60 px-1 rounded">
            <span className="text-dim w-10 shrink-0 text-right">{mmss(e.t)}</span>
            <button className="w-16 shrink-0 truncate text-left font-semibold" style={{ color: e.side === null ? '#cbd5e1' : TEAM_COLORS[e.side] }}
              onClick={() => { if (e.idx !== null) { onSelect(e.idx); setScope('selected'); } }}>{who(e)}</button>
            <span className="w-12 shrink-0 text-dim">{e.cat}</span>
            <span className="text-text/90">{e.text}</span>
          </div>
        ))}
        {!rows.length && sim.debugOn && <div className="text-dim text-xs">Nothing logged for this filter yet.</div>}
      </div>
    </div>
  );
}
