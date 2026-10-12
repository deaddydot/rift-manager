// Shared helpers for the world / market pages (Transfers, Database, Champions, Editor).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameState, Player, Team, Role } from '../../engine/types';
import { ROLES } from '../../engine/types';
import { overall, ageOn } from '../../engine/setup';
import { inTransferWindow } from '../../engine/management/transfers';
import { ratingColor, fmtDate } from '../components/kit';

// ------------------------------------------------------------------ data helpers
export const isRealPlayer = (p: Player) => !p.id.startsWith('standin_');
export const playerAge = (p: Player, date: string) => { const a = ageOn(p.birthdate, date); return a === null ? null : Math.floor(a); };

/** Team strength: average overall of the starting five (holes filled by best roster player for that role, else 30). */
export function teamRating(state: GameState, team: Team): number {
  const used = new Set<string>();
  let sum = 0;
  for (const r of ROLES) {
    const id = team.lineup[r];
    const p = id ? state.players[id] : undefined;
    if (p && p.teamId === team.id) { used.add(p.id); sum += overall(p.attributes, r); continue; }
    const cand = team.roster.map((x) => state.players[x]).filter((x) => x && !used.has(x.id)).sort((a, b) => (b.role === r ? 15 : 0) + overall(b.attributes, r) - ((a.role === r ? 15 : 0) + overall(a.attributes, r)))[0];
    if (cand) { used.add(cand.id); sum += overall(cand.attributes, r) - (cand.role === r ? 0 : 8); } else sum += 30;
  }
  return Math.round(sum / 5);
}

export function starPlayer(state: GameState, team: Team): Player | undefined {
  return team.roster.map((id) => state.players[id]).filter(Boolean).sort((a, b) => overall(b.attributes, b.role) - overall(a.attributes, a.role))[0];
}

/** Date the transfer window next opens / closes. */
export function nextWindowChange(date: string): { open: boolean; until: string } {
  const open = inTransferWindow(date);
  const d = new Date(date + 'T00:00:00Z');
  for (let i = 0; i < 400; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (inTransferWindow(s) !== open) return { open, until: s };
  }
  return { open, until: date };
}

/** Last open day (when open) or first open day (when closed) of the transfer window. */
export function windowBoundary(date: string): { open: boolean; day: string } {
  const w = nextWindowChange(date);
  if (!w.open) return { open: false, day: w.until };
  const d = new Date(w.until + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return { open: true, day: d.toISOString().slice(0, 10) };
}

export function windowNote(date: string) {
  const w = windowBoundary(date);
  return w.open
    ? `Transfer window open until ${fmtDate(w.day, { month: 'short', day: 'numeric' })} — players under contract can be signed.`
    : `Transfer window closed until ${fmtDate(w.day, { month: 'short', day: 'numeric' })} — only free agents can be signed now.`;
}

export const monthsUntil = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / (30.44 * 864e5);

// ------------------------------------------------------------------ small widgets
export function InterestDots({ value, size = 7 }: { value: number; size?: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value * 5)));
  const c = n >= 4 ? '#22c55e' : n === 3 ? '#84cc16' : n === 2 ? '#eab308' : '#ef4444';
  return (
    <span className="inline-flex gap-[3px] items-center" title={`Interest ${Math.round(value * 100)}%`}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className="rounded-full" style={{ width: size, height: size, background: i < n ? c : '#1e2a44' }} />)}
    </span>
  );
}

export function RangeTag({ range, negative }: { range: [number, number]; negative?: boolean }) {
  const mid = (range[0] + range[1]) / 2;
  const c = ratingColor(negative ? 100 - mid : mid);
  const exact = range[0] === range[1];
  return <span className="font-display font-bold tabular-nums" style={{ color: c }}>{exact ? range[0] : `${range[0]}–${range[1]}`}</span>;
}

/** A 0..max track (100 by default; potential runs to 200) showing an estimated [min,max] band. */
export function RangeBar({ range, negative, label, max = 100 }: { range: [number, number]; negative?: boolean; label?: ReactNode; max?: number }) {
  const [a, b] = range;
  const mid = (a + b) / 2;
  const c = ratingColor(negative ? 100 - mid : mid);
  return (
    <div className="flex items-center gap-2 text-xs">
      {label !== undefined && <div className="w-36 text-muted truncate">{label}</div>}
      <div className="flex-1 relative h-[6px] rounded-full bg-[#0a1120]">
        <div className="absolute top-0 h-full rounded-full" style={{ left: `${(a / max) * 100}%`, width: `${Math.max(1.5, ((b - a) / max) * 100)}%`, background: a === b ? c : `linear-gradient(90deg, ${c}55, ${c})` }} />
        {max > 100 && <div className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${(100 / max) * 100}%` }} />}
      </div>
      <div className="w-12 text-right"><RangeTag range={range} negative={negative} /></div>
    </div>
  );
}

export function TierDot({ tier }: { tier?: number }) {
  const c = tier === 1 ? '#c8aa6e' : tier === 2 ? '#38bdf8' : '#5b6787';
  return <span className="inline-block w-1.5 h-1.5 rounded-full align-middle ml-1" style={{ background: c }} title={tier ? `Tier ${tier} league` : ''} />;
}

export function KnowledgeTag({ k }: { k: number }) {
  const c = k >= 100 ? '#22c55e' : k >= 70 ? '#84cc16' : k >= 40 ? '#eab308' : '#8a97b3';
  return <span className="text-[10px] font-bold font-display tabular-nums" style={{ color: c }} title="Scouting knowledge">{k}%</span>;
}

export function SortTh<K extends string>({ label, k, sort, setSort, className = '', title, defaultDesc = true }: { label: ReactNode; k: K; sort: { key: K; desc: boolean }; setSort: (s: { key: K; desc: boolean }) => void; className?: string; title?: string; defaultDesc?: boolean }) {
  const active = sort.key === k;
  return (
    <th className={`select-none cursor-pointer hover:text-text whitespace-nowrap ${active ? 'text-gold2' : ''} ${className}`} title={title} onClick={() => setSort({ key: k, desc: active ? !sort.desc : defaultDesc })}>
      {label}{active ? (sort.desc ? ' ▾' : ' ▴') : ''}
    </th>
  );
}

export function Pager({ page, pages, setPage, total, perPage }: { page: number; pages: number; setPage: (n: number) => void; total: number; perPage: number }) {
  if (total === 0) return null;
  const from = page * perPage + 1, to = Math.min(total, (page + 1) * perPage);
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted px-1 py-2">
      <div>Showing <span className="text-text font-semibold">{from}–{to}</span> of <span className="text-text font-semibold">{total.toLocaleString()}</span></div>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(0)}>«</button>
        <button className="btn btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
        <span className="px-2">Page <span className="text-text font-semibold">{page + 1}</span> / {pages}</span>
        <button className="btn btn-ghost px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next ›</button>
        <button className="btn btn-ghost px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
      </div>
    </div>
  );
}

/** Dropdown with checkboxes (grouped). */
export function MultiSelect({ options, value, onChange, placeholder = 'Any', width = 220 }: { options: { value: string; label: string; group?: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const groups: Record<string, typeof options> = {};
  for (const o of options) if (!q || o.label.toLowerCase().includes(q.toLowerCase()) || o.value.toLowerCase().includes(q.toLowerCase())) (groups[o.group ?? ''] ??= []).push(o);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const text = value.length === 0 ? placeholder : value.length <= 2 ? value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ') : `${value.length} selected`;
  return (
    <div className="relative" ref={ref} style={{ width }}>
      <button type="button" className="input w-full text-left flex items-center justify-between gap-2" onClick={() => setOpen(!open)}>
        <span className={`truncate ${value.length ? 'text-text' : 'text-muted'}`}>{text}</span><span className="text-dim text-[10px]">▼</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[280px] max-h-80 overflow-auto panel p-2 shadow-2xl">
          <div className="flex gap-1 mb-2">
            <input autoFocus className="input flex-1 py-1 text-xs" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => onChange([])}>Clear</button>
          </div>
          {Object.entries(groups).map(([g, opts]) => (
            <div key={g} className="mb-1.5">
              {g && (
                <button className="w-full text-left text-[10px] uppercase tracking-widest text-dim font-bold px-1 py-0.5 hover:text-gold2" onClick={() => {
                  const all = opts.every((o) => value.includes(o.value));
                  onChange(all ? value.filter((v) => !opts.some((o) => o.value === v)) : [...new Set([...value, ...opts.map((o) => o.value)])]);
                }}>{g}</button>
              )}
              {opts.map((o) => (
                <label key={o.value} className="flex items-center gap-2 px-1 py-0.5 text-xs rounded hover:bg-[#111a2e] cursor-pointer">
                  <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="accent-[#c8aa6e]" />
                  <span className="flex-1 truncate">{o.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoleChips({ value, onChange, labels }: { value: Role[]; onChange: (v: Role[]) => void; labels: Record<Role, string> }) {
  return (
    <div className="flex gap-1">
      {ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button key={r} type="button" className={`chip cursor-pointer ${on ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}>{labels[r]}</button>
        );
      })}
    </div>
  );
}

export function NumField({ value, onChange, placeholder, width = 64, min, max, step }: { value: number | ''; onChange: (v: number | '') => void; placeholder?: string; width?: number; min?: number; max?: number; step?: number }) {
  return <input type="number" className="input py-1" style={{ width }} placeholder={placeholder} value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
}

export function FilterLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wider text-dim font-bold">{label}</div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

/** League options grouped by tier for MultiSelect. */
export function leagueOptions(state: GameState) {
  return Object.values(state.leagues).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)).map((l) => ({ value: l.id, label: `${l.name} · ${l.region}`, group: `Tier ${l.tier}` }));
}
