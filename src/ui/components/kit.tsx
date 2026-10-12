// Shared UI kit: portraits, logos, icons, bars, badges, panels, tabs, modal, formatters.
import { useState, type ReactNode, type CSSProperties } from 'react';
import type { Player, Team, Role } from '../../engine/types';
import { gd } from '../../data/gamedata';
import { hashString } from '../../util/rng';
import { RATING_MAX, ratingBand } from '../../engine/ratings';

const base = import.meta.env.BASE_URL ?? './';
export const asset = (p: string) => (p.startsWith('http') || p.startsWith('data:') ? p : base + p);

// ------------------------------------------------------------------ formatters
export const money = (n: number, sign = false) => {
  const s = Math.abs(n) >= 1e6 ? `$${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(Math.abs(n) / 1e3)}k` : `$${Math.round(Math.abs(n))}`;
  return (n < 0 ? '-' : sign && n > 0 ? '+' : '') + s;
};
export const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());
export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
export const ageOf = (birth: string | undefined, date: string) => (birth ? Math.floor((new Date(date).getTime() - new Date(birth).getTime()) / (365.25 * 864e5)) : null);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ colors
export function ratingColor(v: number) {
  if (v >= 100) return ratingBand(v).color; // Elite / Legendary / Mythic / Immortal (engine/ratings.ts)
  if (v >= 88) return '#f0c674';
  if (v >= 80) return '#22c55e';
  if (v >= 70) return '#84cc16';
  if (v >= 60) return '#eab308';
  if (v >= 50) return '#f97316';
  return '#ef4444';
}

// ------------------------------------------------------------------ flags
const ISO: Record<string, string> = {
  'South Korea': 'KR', Korea: 'KR', China: 'CN', Taiwan: 'TW', 'Hong Kong': 'HK', Macau: 'MO', Vietnam: 'VN', Japan: 'JP', Philippines: 'PH', Thailand: 'TH', Australia: 'AU', 'New Zealand': 'NZ',
  'United States': 'US', Canada: 'CA', Mexico: 'MX', Brazil: 'BR', Argentina: 'AR', Chile: 'CL', Peru: 'PE', Colombia: 'CO', Uruguay: 'UY', Paraguay: 'PY', Venezuela: 'VE', Bolivia: 'BO', Ecuador: 'EC', 'Costa Rica': 'CR', Guatemala: 'GT', 'Dominican Republic': 'DO', 'Puerto Rico': 'PR',
  France: 'FR', Germany: 'DE', Spain: 'ES', Poland: 'PL', Denmark: 'DK', Sweden: 'SE', Norway: 'NO', Finland: 'FI', 'United Kingdom': 'GB', England: 'GB', Scotland: 'GB', Wales: 'GB', Ireland: 'IE', Netherlands: 'NL', Belgium: 'BE', Italy: 'IT', Portugal: 'PT', Greece: 'GR', Cyprus: 'CY', Turkey: 'TR', Türkiye: 'TR',
  'Czech Republic': 'CZ', Czechia: 'CZ', Slovakia: 'SK', Hungary: 'HU', Romania: 'RO', Bulgaria: 'BG', Serbia: 'RS', Croatia: 'HR', Slovenia: 'SI', 'Bosnia and Herzegovina': 'BA', Austria: 'AT', Switzerland: 'CH', Lithuania: 'LT', Latvia: 'LV', Estonia: 'EE', Ukraine: 'UA', Russia: 'RU', Belarus: 'BY',
  Israel: 'IL', Egypt: 'EG', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', Morocco: 'MA', Tunisia: 'TN', Jordan: 'JO', Lebanon: 'LB', Kuwait: 'KW', Qatar: 'QA', Algeria: 'DZ', Iceland: 'IS', Malaysia: 'MY', Singapore: 'SG', Indonesia: 'ID', Kazakhstan: 'KZ', Georgia: 'GE', Armenia: 'AM', Azerbaijan: 'AZ', Mongolia: 'MN',
  Albania: 'AL', 'North Macedonia': 'MK', Montenegro: 'ME', Kosovo: 'XK', Moldova: 'MD', Luxembourg: 'LU', Malta: 'MT', Iran: 'IR', Iraq: 'IQ', Syria: 'SY', Libya: 'LY', Bahrain: 'BH', Oman: 'OM', Pakistan: 'PK', India: 'IN', Bangladesh: 'BD', Cambodia: 'KH', 'South Africa': 'ZA', Nigeria: 'NG',
};
export function flag(country?: string) {
  const code = country ? ISO[country] : undefined;
  if (!code) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ------------------------------------------------------------------ images with fallbacks
export function Portrait({ player, size = 48, team, className = '', style }: { player: Pick<Player, 'handle' | 'imageUrl' | 'image' | 'teamId' | 'role'>; size?: number; team?: Team | null; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const src = player.image ?? player.imageUrl;
  const colors = team?.colors ?? ['#334155', '#0f172a'];
  if (src && !failed) {
    return (
      <div className={`relative overflow-hidden rounded-lg shrink-0 ${className}`} style={{ width: size, height: size, background: `linear-gradient(160deg, ${colors[0]}55, #0b1220)`, ...style }}>
        <img src={asset(src)} alt={player.handle} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover object-top" />
      </div>
    );
  }
  return <Avatar name={player.handle} size={size} colors={colors as [string, string]} className={className} style={style} />;
}

/** Staff photo when there is one (linked from the wiki like player portraits), initials otherwise. */
export function StaffPortrait({ staff, size = 48, colors, className = '', style }: { staff: { handle: string; image?: string }; size?: number; colors: [string, string]; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (staff.image && !failed) {
    return (
      <div className={`relative overflow-hidden rounded-lg shrink-0 ${className}`} style={{ width: size, height: size, background: `linear-gradient(160deg, ${colors[0]}55, #0b1220)`, ...style }}>
        <img src={asset(staff.image)} alt={staff.handle} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover object-top" />
      </div>
    );
  }
  return <Avatar name={staff.handle} size={size} colors={colors} className={className} style={style} />;
}

export function Avatar({ name, size = 48, colors, className = '', style }: { name: string; size?: number; colors: [string, string]; className?: string; style?: CSSProperties }) {
  const h = hashString(name);
  const hue = h % 360;
  const initials = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`rounded-lg shrink-0 ${className}`} style={style}>
      <defs>
        <linearGradient id={`av${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors[0]} stopOpacity="0.85" />
          <stop offset="1" stopColor={`hsl(${hue} 40% 14%)`} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill={`url(#av${h})`} />
      <circle cx="32" cy="25" r="11" fill="#0b1220" opacity="0.55" />
      <path d="M12 60c2-12 10-18 20-18s18 6 20 18" fill="#0b1220" opacity="0.55" />
      <text x="32" y="62" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f8fafc" opacity="0.85" fontFamily="Rajdhani, Inter">{initials}</text>
    </svg>
  );
}

export function TeamLogo({ team, size = 32, className = '' }: { team?: Team | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!team) return <div style={{ width: size, height: size }} className={`rounded bg-slate-800 ${className}`} />;
  if (team.logo && !failed) {
    return <img src={asset(team.logo)} alt={team.short} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} style={{ width: size, height: size }} className={`object-contain shrink-0 ${className}`} />;
  }
  const [c1, c2] = team.colors;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`shrink-0 ${className}`}>
      <path d="M20 2 L36 8 V20 C36 30 28 36 20 38 C12 36 4 30 4 20 V8 Z" fill={c1} stroke={c2} strokeWidth="2" />
      <text x="20" y="24.5" textAnchor="middle" fontSize={team.short.length > 3 ? 9 : 11} fontWeight="800" fill={c2 === '#0a0a0a' || c2 === '#000000' || c2 === '#111827' ? '#fff' : c2} fontFamily="Rajdhani, Inter">{team.short.slice(0, 4)}</text>
    </svg>
  );
}

export function ChampIcon({ id, size = 32, className = '', title, grey }: { id: string; size?: number; className?: string; title?: string; grey?: boolean }) {
  const c = gd().championById[id];
  if (!c) return <div style={{ width: size, height: size }} className={`rounded bg-slate-800 ${className}`} />;
  return <img src={asset(c.image)} alt={c.name} title={title ?? c.name} style={{ width: size, height: size, filter: grey ? 'grayscale(1) brightness(.5)' : undefined }} className={`rounded-md shrink-0 ${className}`} />;
}
export function ItemIcon({ id, size = 24 }: { id: string; size?: number }) {
  const it = gd().itemById[id];
  if (!it) return <div style={{ width: size, height: size }} className="rounded bg-slate-900 border border-slate-800" />;
  return <img src={asset(it.icon)} title={`${it.name} (${it.cost}g)`} alt={it.name} style={{ width: size, height: size }} className="rounded" />;
}

export const ROLE_COLORS: Record<Role, string> = { top: '#f97316', jungle: '#22c55e', mid: '#a855f7', adc: '#ef4444', support: '#38bdf8' };
export function RoleIcon({ role, size = 16 }: { role: Role; size?: number }) {
  const c = ROLE_COLORS[role];
  const paths: Record<Role, ReactNode> = {
    top: <><path d="M3 3h10v3H6v7H3z" fill={c} /><path d="M9 9h8v8H9z" fill={c} opacity=".35" /></>,
    jungle: <path d="M10 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" fill={c} />,
    mid: <><path d="M3 17 17 3" stroke={c} strokeWidth="3" /><path d="M3 3h5v5H3zM12 12h5v5h-5z" fill={c} opacity=".35" /></>,
    adc: <><path d="M17 17H7v-3h7V7h3z" fill={c} /><path d="M3 3h8v8H3z" fill={c} opacity=".35" /></>,
    support: <path d="M10 2 17 5v5c0 4-3 7-7 8-4-1-7-4-7-8V5z" fill={c} />,
  };
  return <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0">{paths[role]}</svg>;
}

// ------------------------------------------------------------------ small widgets
export function Rating({ v, size = 'md' }: { v: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'text-3xl w-14 h-14' : size === 'sm' ? 'text-xs w-7 h-6' : 'text-sm w-9 h-8';
  const c = ratingColor(v);
  return <div className={`font-display font-bold rounded-md flex items-center justify-center ${cls}`} title={`${ratingBand(v).label}: ${ratingBand(v).blurb}`}
    style={{ color: c, background: `${c}1a`, border: `1px solid ${c}55`, boxShadow: v >= 100 ? `0 0 ${v >= 150 ? 12 : 7}px ${c}66` : undefined }}>{Math.round(v)}</div>;
}

export function Bar({ value, max = 100, label, color, showValue = true, height = 6, mark }: { value: number; max?: number; label?: ReactNode; color?: string; showValue?: boolean; height?: number; mark?: number }) {
  const c = color ?? ratingColor(value);
  return (
    <div className="flex items-center gap-2 text-xs">
      {label !== undefined && <div className="w-36 text-muted truncate">{label}</div>}
      <div className="relative flex-1 rounded-full bg-[#0a1120] overflow-hidden" style={{ height }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: `linear-gradient(90deg, ${c}88, ${c})` }} />
        {mark !== undefined && <div className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${(mark / max) * 100}%` }} />}
      </div>
      {showValue && <div className={`${max > 100 ? 'w-8' : 'w-7'} text-right font-display font-bold`} style={{ color: c }}>{Math.round(value)}</div>}
    </div>
  );
}

/** A player skill on the 0..200 rating scale; the tick marks 100 (the best players of 2026 sit just below it). */
export function RatingBar({ value, label, height }: { value: number; label?: ReactNode; height?: number }) {
  return <Bar value={value} max={RATING_MAX} mark={100} label={label} height={height} />;
}

/** "World-class", "Elite"… for an overall or potential (engine/ratings.ts). */
export function RatingBandTag({ v, prefix = '' }: { v: number; prefix?: string }) {
  const b = ratingBand(v);
  return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: b.color }} title={b.blurb}>{prefix}{b.label}</span>;
}

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between px-4 py-2.5 border-b hairline">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-gold2">{title}</h3>
          <div className="flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={`p-4 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="panel-flat px-3 py-2.5 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold leading-tight truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-dim truncate">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 border-b hairline mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${value === t.id ? 'border-gold text-gold2' : 'border-transparent text-muted hover:text-text'}`}>{t.label}</button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel w-full max-h-[90vh] overflow-auto fadein" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b hairline">
          <h3 className="font-display text-lg font-bold text-gold2">{title}</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-center text-muted text-sm py-10">{children}</div>;
}

export function Sparkline({ data, width = 160, height = 40, color = '#c8aa6e', zero = false }: { data: number[]; width?: number; height?: number; color?: string; zero?: boolean }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data, zero ? 0 : Infinity), max = Math.max(...data, zero ? 0 : -Infinity);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`).join(' ');
  const zy = height - ((0 - min) / span) * (height - 4) - 2;
  return (
    <svg width={width} height={height} className="overflow-visible">
      {zero && <line x1="0" x2={width} y1={zy} y2={zy} stroke="#334155" strokeDasharray="3 3" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Pill({ children, color = '#8a97b3' }: { children: ReactNode; color?: string }) {
  return <span className="chip" style={{ color, borderColor: color + '55', background: color + '14' }}>{children}</span>;
}
