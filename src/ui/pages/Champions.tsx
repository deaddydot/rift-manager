import { useMemo, useState, type ReactNode } from 'react';
import { masteryTier } from '../../engine/mastery';
import { useGame, useStore, nav } from '../../store/game';
import type { Champion, ChampionProfile, AbilityData, Scaling, Role, GameState, Player } from '../../engine/types';
import { ROLES, ROLE_LABEL } from '../../engine/types';
import { gd } from '../../data/gamedata';
import { playerOvr } from '../../engine/management/transfers';
import { Panel, Stat, Bar, Portrait, TeamLogo, ChampIcon, RoleIcon, ROLE_COLORS, Pill, Empty, asset, pct, ratingColor } from '../components/kit';
import { SortTh } from './worldKit';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const wr = (c: Champion) => (c.meta && c.meta.picks ? c.meta.wins / c.meta.picks : null);

type SortKey = 'presence' | 'winrate' | 'picks' | 'bans' | 'name' | 'difficulty' | 'power';
const SORT_LABEL: Record<SortKey, string> = { presence: 'Pro presence', winrate: 'Win rate', picks: 'Pick count', bans: 'Ban count', name: 'Name', difficulty: 'Difficulty', power: 'Patch power' };

export default function Champions({ id }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const champ = id ? gd().championById[id] : undefined;
  if (id && champ) return <ChampionDetail state={state} c={champ} />;
  return <ChampionGrid state={state} missing={id && !champ ? id : undefined} />;
}

function PowerTag({ v, big }: { v?: number; big?: boolean }) {
  if (!v || Math.abs(v) < 0.005) return big ? <span className="text-muted text-sm">No recent balance changes</span> : null;
  const up = v > 0;
  return (
    <span className={`font-display font-bold ${big ? 'text-lg' : 'text-xs'}`} style={{ color: up ? '#22c55e' : '#ef4444' }} title={`Patch power ${up ? '+' : ''}${(v * 100).toFixed(1)}%`}>
      {up ? '↑' : '↓'} {up ? '+' : ''}{(v * 100).toFixed(1)}%{big ? (up ? ' buffed' : ' nerfed') : ''}
    </span>
  );
}

// ------------------------------------------------------------------ grid
function ChampionGrid({ state, missing }: { state: GameState; missing?: string }) {
  const all = gd().champions;
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [cls, setCls] = useState('');
  const [arch, setArch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'presence', desc: true });
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const classes = useMemo(() => [...new Set(all.flatMap((c) => c.classes))].sort(), [all]);
  const archetypes = useMemo(() => [...new Set(all.map((c) => c.archetype).filter(Boolean) as string[])].sort(), [all]);
  const power = state.championPower ?? {};

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = all.filter((c) => (!s || c.name.toLowerCase().includes(s) || c.title.toLowerCase().includes(s)) && (!role || c.positions.includes(role)) && (!cls || c.classes.includes(cls)) && (!arch || c.archetype === arch));
    const val = (c: Champion): number | string => {
      switch (sort.key) {
        case 'presence': return c.meta?.presence ?? 0;
        case 'winrate': return c.meta && c.meta.picks >= 10 ? c.meta.wins / c.meta.picks : -1;
        case 'picks': return c.meta?.picks ?? 0;
        case 'bans': return c.meta?.bans ?? 0;
        case 'name': return c.name;
        case 'difficulty': return c.difficulty;
        case 'power': return power[c.id] ?? 0;
      }
    };
    const dir = sort.desc ? -1 : 1;
    return out.sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : a.name.localeCompare(b.name); });
  }, [all, q, role, cls, arch, sort, power]);

  const movers = Object.entries(power).filter(([, v]) => Math.abs(v) >= 0.01).sort((a, b) => b[1] - a[1]);
  const buffs = movers.filter(([, v]) => v > 0).slice(0, 6), nerfs = movers.filter(([, v]) => v < 0).reverse().slice(0, 6);
  const topPresence = [...all].sort((a, b) => (b.meta?.presence ?? 0) - (a.meta?.presence ?? 0)).slice(0, 5);
  const S = (label: ReactNode, k: SortKey, cls2 = '', defaultDesc = true) => <SortTh label={label} k={k} sort={sort} setSort={setSort} className={cls2} defaultDesc={defaultDesc} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Champions</h1>
          <div className="text-sm text-muted mt-1">{all.length} champions · game patch {state.patch} · data {gd().patch} · pro stats from {all[0]?.meta?.games?.toLocaleString() ?? '—'} real 2026 games</div>
        </div>
        {missing && <div className="text-sm text-red-400">Unknown champion “{missing}”.</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel title="Most contested (pro)">
          <div className="flex flex-col gap-1.5">
            {topPresence.map((c) => (
              <button key={c.id} className="flex items-center gap-2 text-sm hover:text-gold2 text-left" onClick={() => nav('champions', c.id)}>
                <ChampIcon id={c.id} size={24} /><span className="flex-1">{c.name}</span>
                <span className="font-display font-bold text-gold2">{pct(c.meta?.presence ?? 0)}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={`Patch ${state.patch} · buffs`}>
          {buffs.length === 0 ? <div className="text-sm text-dim">No champions buffed recently.</div> : (
            <div className="flex flex-wrap gap-2">
              {buffs.map(([cid, v]) => <button key={cid} className="flex items-center gap-1.5 panel-flat px-2 py-1 hover:border-gold" onClick={() => nav('champions', cid)}><ChampIcon id={cid} size={22} /><span className="text-xs">{gd().championById[cid]?.name ?? cid}</span><PowerTag v={v} /></button>)}
            </div>
          )}
        </Panel>
        <Panel title={`Patch ${state.patch} · nerfs`}>
          {nerfs.length === 0 ? <div className="text-sm text-dim">No champions nerfed recently.</div> : (
            <div className="flex flex-wrap gap-2">
              {nerfs.map(([cid, v]) => <button key={cid} className="flex items-center gap-1.5 panel-flat px-2 py-1 hover:border-gold" onClick={() => nav('champions', cid)}><ChampIcon id={cid} size={22} /><span className="text-xs">{gd().championById[cid]?.name ?? cid}</span><PowerTag v={v} /></button>)}
            </div>
          )}
        </Panel>
      </div>

      <div className="panel p-3 flex flex-wrap items-center gap-3">
        <input className="input w-56" placeholder="Search champion…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          <button className={`chip cursor-pointer ${!role ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRole('')}>All roles</button>
          {ROLES.map((r) => <button key={r} className={`chip cursor-pointer ${role === r ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRole(role === r ? '' : r)}><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</button>)}
        </div>
        <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
        <select className="input" value={arch} onChange={(e) => setArch(e.target.value)}>
          <option value="">All archetypes</option>
          {archetypes.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
        <div className="flex items-center gap-1 text-xs text-muted">
          Sort
          <select className="input" value={sort.key} onChange={(e) => { const k = e.target.value as SortKey; setSort({ key: k, desc: k !== 'name' }); }}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <button className="btn btn-ghost px-2 py-1" onClick={() => setSort({ ...sort, desc: !sort.desc })}>{sort.desc ? '▾' : '▴'}</button>
        </div>
        <div className="ml-auto flex gap-1">
          <button className={`btn px-3 py-1 ${view === 'grid' ? 'btn-gold' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button className={`btn px-3 py-1 ${view === 'table' ? 'btn-gold' : ''}`} onClick={() => setView('table')}>Table</button>
        </div>
      </div>

      {list.length === 0 ? <Empty>No champions match.</Empty> : view === 'grid' ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
          {list.map((c) => {
            const w = wr(c);
            return (
              <button key={c.id} className="panel-flat p-2 flex flex-col items-center gap-1 hover:border-gold transition group relative" onClick={() => nav('champions', c.id)}>
                {power[c.id] && Math.abs(power[c.id]) >= 0.01 && <span className="absolute top-1 right-1.5"><PowerTag v={power[c.id]} /></span>}
                <ChampIcon id={c.id} size={56} className="group-hover:scale-105 transition" />
                <div className="text-sm font-semibold truncate w-full text-center">{c.name}</div>
                <div className="flex gap-0.5">{c.positions.map((r) => <RoleIcon key={r} role={r} size={12} />)}</div>
                <div className="flex gap-2 text-[10px] text-muted">
                  <span title="Pro presence (picks + bans)"><span className="text-gold2 font-display font-bold text-xs">{pct(c.meta?.presence ?? 0)}</span> PB</span>
                  {w !== null && (c.meta?.picks ?? 0) >= 5 && <span title="Pro win rate"><span className="font-display font-bold text-xs" style={{ color: w >= 0.53 ? '#22c55e' : w < 0.47 ? '#ef4444' : '#e6ebf5' }}>{pct(w)}</span> WR</span>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Panel bodyClass="p-0">
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="tbl">
              <thead>
                <tr>
                  {S('Champion', 'name', '', false)}
                  <th>Roles</th><th>Classes</th><th>Archetype</th>
                  {S('Diff', 'difficulty', 'text-right')}
                  {S('Presence', 'presence', 'text-right')}
                  {S('Picks', 'picks', 'text-right')}
                  {S('Bans', 'bans', 'text-right')}
                  {S('Win rate', 'winrate', 'text-right')}
                  {S('Patch', 'power', 'text-right')}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const w = wr(c);
                  return (
                    <tr key={c.id} className="row" onClick={() => nav('champions', c.id)}>
                      <td><div className="flex items-center gap-2"><ChampIcon id={c.id} size={28} /><div className="leading-tight"><div className="font-semibold">{c.name}</div><div className="text-[11px] text-dim">{c.title}</div></div></div></td>
                      <td><div className="flex gap-1">{c.positions.map((r) => <RoleIcon key={r} role={r} size={14} />)}</div></td>
                      <td className="text-xs text-muted">{c.classes.map(titleCase).join(', ')}</td>
                      <td className="text-xs text-muted">{c.archetype ? titleCase(c.archetype) : '—'}</td>
                      <td className="text-right font-display">{c.difficulty}</td>
                      <td className="text-right font-display text-gold2">{pct(c.meta?.presence ?? 0)}</td>
                      <td className="text-right font-display">{c.meta?.picks ?? 0}</td>
                      <td className="text-right font-display">{c.meta?.bans ?? 0}</td>
                      <td className="text-right font-display" style={{ color: w !== null && (c.meta?.picks ?? 0) >= 10 ? (w >= 0.53 ? '#22c55e' : w < 0.47 ? '#ef4444' : undefined) : '#5b6787' }}>{w !== null ? pct(w) : '—'}</td>
                      <td className="text-right"><PowerTag v={power[c.id]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ detail
const PROFILE_GROUPS: { title: string; keys: (keyof ChampionProfile)[] }[] = [
  { title: 'Power curve', keys: ['early', 'mid', 'late', 'scaling'] },
  { title: 'Lane', keys: ['laning', 'waveclear', 'roam', 'splitpush', 'blind'] },
  { title: 'Fighting', keys: ['teamfight', 'engage', 'burst', 'dps', 'poke', 'pick', 'tankiness', 'sustain', 'mobility'] },
  { title: 'Utility', keys: ['cc', 'peel', 'objective'] },
  { title: 'Jungle', keys: ['clear', 'gank'] },
];
const PROFILE_LABEL: Record<keyof ChampionProfile, string> = {
  early: 'Early game', mid: 'Mid game', late: 'Late game', scaling: 'Scaling', laning: 'Laning', waveclear: 'Waveclear', roam: 'Roaming', splitpush: 'Splitpush',
  blind: 'Blind-pick safety', teamfight: 'Teamfight', engage: 'Engage', burst: 'Burst', dps: 'Sustained DPS', poke: 'Poke', pick: 'Pick potential', tankiness: 'Tankiness',
  sustain: 'Sustain', mobility: 'Mobility', cc: 'Crowd control', peel: 'Peel', objective: 'Objective control', clear: 'Jungle clear', gank: 'Ganking',
};

function fmtNums(arr: number[], suffix = '') {
  if (!arr.length) return '—';
  const r = (n: number) => (Math.abs(n) >= 100 || Number.isInteger(n) ? Math.round(n).toString() : n.toFixed(Math.abs(n) < 1 ? 2 : 1));
  if (arr.every((x) => x === arr[0])) return r(arr[0]) + suffix;
  return arr.map(r).join(' / ') + suffix;
}
const RATIO_LABEL: [keyof Scaling, string][] = [['ap', 'AP'], ['ad', 'AD'], ['bonusAd', 'bonus AD'], ['maxHp', 'max HP'], ['bonusHp', 'bonus HP'], ['bonusArmor', 'bonus armor'], ['bonusMr', 'bonus MR'], ['targetMaxHp', "target's max HP"], ['targetMissingHp', "target's missing HP"]];
function ratios(s: Scaling): ReactNode[] {
  const out: ReactNode[] = [];
  for (const [k, label] of RATIO_LABEL) {
    const v = s[k] as number | undefined;
    if (!v) continue;
    const color = k === 'ap' ? '#a78bfa' : k === 'ad' || k === 'bonusAd' ? '#f97316' : k.toLowerCase().includes('hp') ? '#22c55e' : '#eab308';
    out.push(<span key={k} style={{ color }}> (+{Math.round(v * 1000) / 10}% {label})</span>);
  }
  return out;
}
const DMG_COLOR = { physical: '#f97316', magic: '#a78bfa', true: '#f8fafc' } as const;

function AbilityIcon({ src, slot, size = 48 }: { src: string; slot: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {!failed ? <img src={asset(src)} alt={slot} onError={() => setFailed(true)} className="rounded-md w-full h-full border border-line2" />
        : <div className="rounded-md w-full h-full bg-panel2 border border-line2 flex items-center justify-center font-display font-bold text-gold2">{slot}</div>}
      <span className="absolute -bottom-1 -right-1 text-[10px] font-bold font-display bg-[#0b0f19] border border-gold text-gold2 rounded px-1 leading-tight">{slot}</span>
    </div>
  );
}

function AbilityCard({ a }: { a: AbilityData }) {
  const range = a.range >= 20000 ? '—' : a.range ? `${a.range}` : 'Self';
  return (
    <div className="panel-flat p-3 flex gap-3">
      <AbilityIcon src={a.icon} slot={a.slot} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-lg font-bold leading-none">{a.name}</span>
          <Pill>{a.targeting}</Pill>
          {a.aoe && <Pill color="#38bdf8">AoE</Pill>}
          {a.dash && <Pill color="#22c55e">Dash</Pill>}
          {a.stealth && <Pill color="#a855f7">Stealth</Pill>}
          {a.msBuff ? <Pill color="#84cc16">+{Math.round(a.msBuff * 100)}% MS</Pill> : null}
          {a.asBuff ? <Pill color="#eab308">+{Math.round(a.asBuff * 100)}% AS</Pill> : null}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs mt-2">
          <span className="text-dim">Cooldown</span><span className="font-display text-text">{fmtNums(a.cooldown, 's')}</span>
          <span className="text-dim">Range</span><span className="font-display text-text">{range}</span>
          {a.damage && <><span className="text-dim">Damage</span><span><span className="font-display" style={{ color: DMG_COLOR[a.damage.type] }}>{fmtNums(a.damage.base)}</span>{ratios(a.damage)} <span className="text-dim">{a.damage.type}</span></span></>}
          {a.cc && <><span className="text-dim">Crowd control</span><span className="text-text">{titleCase(a.cc.type)} <span className="font-display">{a.cc.duration ? `${a.cc.duration}s` : ''}</span>{a.cc.amount ? <span className="text-muted"> ({Math.round(a.cc.amount * 100)}%)</span> : null}</span></>}
          {a.shield && <><span className="text-dim">Shield</span><span><span className="font-display text-sky-300">{fmtNums(a.shield.base)}</span>{ratios(a.shield)}</span></>}
          {a.heal && <><span className="text-dim">Heal</span><span><span className="font-display text-green-400">{fmtNums(a.heal.base)}</span>{ratios(a.heal)}</span></>}
        </div>
        <p className="text-xs text-muted leading-relaxed mt-2 whitespace-pre-line">{a.description}</p>
      </div>
    </div>
  );
}

function PowerCurve({ c }: { c: Champion }) {
  const pts = [c.profile.early, c.profile.mid, c.profile.late];
  const W = 220, H = 90;
  const xy = pts.map((v, i) => [20 + i * ((W - 40) / 2), H - 12 - ((v - 1) / 9) * (H - 28)] as const);
  return (
    <svg width={W} height={H} className="overflow-visible">
      {[1, 5, 10].map((g) => { const y = H - 12 - ((g - 1) / 9) * (H - 28); return <g key={g}><line x1={14} x2={W - 14} y1={y} y2={y} stroke="#1e2a44" strokeDasharray="3 3" /><text x={4} y={y + 3} fontSize={8} fill="#5b6787">{g}</text></g>; })}
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="#c8aa6e" strokeWidth={2.5} strokeLinejoin="round" />
      {xy.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={4} fill="#0b0f19" stroke="#f0e6d2" strokeWidth={2} /><text x={x} y={H} fontSize={9} fill="#8a97b3" textAnchor="middle">{['Early', 'Mid', 'Late'][i]}</text><text x={x} y={y - 8} fontSize={10} fill="#f0e6d2" textAnchor="middle" fontWeight={700}>{pts[i]}</text></g>)}
    </svg>
  );
}

function ChampionDetail({ state, c }: { state: GameState; c: Champion }) {
  const v = useStore((x) => x.v);
  const all = gd().champions;
  const sortedByName = useMemo(() => [...all].sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const idx = sortedByName.findIndex((x) => x.id === c.id);
  const prev = sortedByName[(idx - 1 + sortedByName.length) % sortedByName.length];
  const next = sortedByName[(idx + 1) % sortedByName.length];
  const [showAll, setShowAll] = useState(false);
  const power = state.championPower?.[c.id];
  const m = c.meta;
  const w = wr(c);
  const s = c.stats;

  const mains = useMemo(() => Object.values(state.players)
    .filter((p): p is Player => !p.retired && !p.id.startsWith('standin_') && (p.champions[c.id] ?? 0) >= 130)
    .sort((a, b) => (b.champions[c.id] ?? 0) - (a.champions[c.id] ?? 0) || playerOvr(b) - playerOvr(a)), [state, c.id, v]);
  const mine = mains.filter((p) => p.teamId === state.userTeamId);
  const similar = useMemo(() => all.filter((x) => x.id !== c.id && x.archetype && x.archetype === c.archetype).sort((a, b) => (b.meta?.presence ?? 0) - (a.meta?.presence ?? 0)).slice(0, 8), [all, c]);
  const roleTotal = m ? Object.values(m.byRole).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const statRows: [string, number, number, (n: number) => string][] = [
    ['Health', s.hp, s.hpPerLevel, (n) => Math.round(n).toString()],
    ['Health regen (5s)', s.hpRegen, s.hpRegenPerLevel, (n) => n.toFixed(1)],
    ...(s.mana ? [[`${c.resource || 'Mana'}`, s.mana, s.manaPerLevel, (n: number) => Math.round(n).toString()] as [string, number, number, (n: number) => string]] : []),
    ['Armor', s.armor, s.armorPerLevel, (n) => n.toFixed(1)],
    ['Magic resist', s.mr, s.mrPerLevel, (n) => n.toFixed(1)],
    ['Attack damage', s.ad, s.adPerLevel, (n) => n.toFixed(1)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-ghost" onClick={() => nav('champions')}>← All champions</button>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => nav('champions', prev.id)}><ChampIcon id={prev.id} size={20} /> {prev.name}</button>
          <button className="btn btn-ghost" onClick={() => nav('champions', next.id)}>{next.name} <ChampIcon id={next.id} size={20} /></button>
        </div>
      </div>

      {/* header */}
      <div className="panel p-5 relative overflow-hidden">
        <img src={asset(c.image)} alt="" className="absolute -right-10 -top-10 w-80 h-80 opacity-[0.06] blur-sm pointer-events-none" />
        <div className="relative flex gap-5 flex-wrap">
          <ChampIcon id={c.id} size={112} className="rounded-xl border-2 border-gold" />
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-display text-4xl font-bold gold-text leading-none">{c.name}</h1>
              <span className="text-muted italic">{c.title}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.positions.map((r) => <span key={r} className="chip" style={{ color: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] + '55' }}><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</span>)}
              {c.classes.map((x) => <Pill key={x} color="#c8aa6e">{titleCase(x)}</Pill>)}
              {c.archetype && <Pill color="#0ac8b9">{titleCase(c.archetype)}</Pill>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm mt-3">
              <div><span className="text-dim text-xs">Attack</span><div className="capitalize">{c.attackType} · {c.adaptive.toUpperCase()}</div></div>
              <div><span className="text-dim text-xs">Resource</span><div>{c.resource || 'None'}</div></div>
              <div><span className="text-dim text-xs">Power spikes</span><div>{c.powerSpikes?.length ? c.powerSpikes.map((l) => `Lv ${l}`).join(' · ') : '—'}</div></div>
              <div><span className="text-dim text-xs">Patch {state.patch}</span><div><PowerTag v={power} big /></div></div>
            </div>
            <div className="mt-3 max-w-md">
              <div className="flex items-center gap-2 text-xs"><span className="text-dim w-20">Difficulty</span>
                <div className="flex gap-0.5">{Array.from({ length: 10 }, (_, i) => <span key={i} className="w-4 h-2 rounded-sm" style={{ background: i < c.difficulty ? (c.difficulty >= 8 ? '#ef4444' : c.difficulty >= 5 ? '#eab308' : '#22c55e') : '#1e2a44' }} />)}</div>
                <span className="font-display font-bold">{c.difficulty}/10</span>
              </div>
              {c.ratings && (
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {(Object.entries(c.ratings) as [string, number][]).map(([k, v]) => (
                    <div key={k} className="text-center"><div className="text-[10px] text-dim uppercase">{k}</div><div className="flex gap-0.5 justify-center mt-0.5">{[1, 2, 3].map((i) => <span key={i} className="w-3 h-1.5 rounded-sm" style={{ background: i <= v ? '#c8aa6e' : '#1e2a44' }} />)}</div></div>
                  ))}
                </div>
              )}
            </div>
            {c.notes && <p className="text-sm text-muted mt-3 max-w-3xl leading-relaxed border-l-2 border-gold pl-3">{c.notes}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 w-full lg:w-72 content-start">
            <Stat label="Presence" value={pct(m?.presence ?? 0)} color="#f0e6d2" sub="picks + bans / games" />
            <Stat label="Win rate" value={w !== null ? pct(w) : '—'} color={w !== null && (m?.picks ?? 0) >= 10 ? (w >= 0.53 ? '#22c55e' : w < 0.47 ? '#ef4444' : undefined) : undefined} sub={`${m?.wins ?? 0}W ${(m?.picks ?? 0) - (m?.wins ?? 0)}L`} />
            <Stat label="Picks" value={m?.picks ?? 0} sub={m ? `${pct(m.picks / Math.max(1, m.games))} of games` : undefined} />
            <Stat label="Bans" value={m?.bans ?? 0} sub={m ? `${pct(m.bans / Math.max(1, m.games))} of games` : undefined} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* abilities */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Panel title="Abilities">
            <div className="flex flex-col gap-2">
              <div className="panel-flat p-3 flex gap-3">
                <AbilityIcon src={c.passive.icon} slot="P" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-display text-lg font-bold leading-none">{c.passive.name}</span><Pill>passive</Pill></div>
                  <p className="text-xs text-muted leading-relaxed mt-2 whitespace-pre-line">{c.passive.description}</p>
                </div>
              </div>
              {c.abilities.map((a) => <AbilityCard key={a.slot} a={a} />)}
            </div>
          </Panel>
          <Panel title="Base stats & growth">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Stat</th><th className="text-right">Level 1</th><th className="text-right">Per level</th><th className="text-right">Level 9</th><th className="text-right">Level 18</th></tr></thead>
                <tbody>
                  {statRows.map(([label, base, g, f]) => (
                    <tr key={label}><td className="text-muted">{label}</td><td className="text-right font-display">{f(base)}</td><td className="text-right font-display text-gold2">+{f(g)}</td><td className="text-right font-display">{f(base + g * 8 * (0.7025 + 0.0175 * 8))}</td><td className="text-right font-display">{f(base + g * 17)}</td></tr>
                  ))}
                  <tr><td className="text-muted">Attack speed</td><td className="text-right font-display">{s.as.toFixed(3)}</td><td className="text-right font-display text-gold2">+{(s.asPerLevel * (s.asPerLevel < 1 ? 100 : 1)).toFixed(1)}%</td><td className="text-right font-display">{(s.as + s.asRatio * (s.asPerLevel < 1 ? s.asPerLevel : s.asPerLevel / 100) * 8 * (0.7025 + 0.0175 * 8)).toFixed(3)}</td><td className="text-right font-display">{(s.as + s.asRatio * (s.asPerLevel < 1 ? s.asPerLevel : s.asPerLevel / 100) * 17).toFixed(3)}</td></tr>
                  <tr><td className="text-muted">Attack range</td><td className="text-right font-display">{s.range}</td><td className="text-right text-dim">—</td><td className="text-right font-display">{s.range}</td><td className="text-right font-display">{s.range}</td></tr>
                  <tr><td className="text-muted">Move speed</td><td className="text-right font-display">{s.ms}</td><td className="text-right text-dim">—</td><td className="text-right font-display">{s.ms}</td><td className="text-right font-display">{s.ms}</td></tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {c.matchups && Object.keys(c.matchups).length > 0 && <Matchups c={c} />}
          {c.builds && Object.keys(c.builds).length > 0 && <Builds c={c} />}
          <Panel title="Gameplay profile">
            <div className="flex justify-center mb-2"><PowerCurve c={c} /></div>
            {PROFILE_GROUPS.map((g) => (
              <div key={g.title} className="mb-3 last:mb-0">
                <div className="text-[10px] uppercase tracking-widest text-dim font-bold mb-1">{g.title}</div>
                <div className="flex flex-col gap-1">
                  {g.keys.map((k) => <Bar key={k} label={PROFILE_LABEL[k]} value={c.profile[k]} max={10} color={ratingColor(35 + c.profile[k] * 6)} />)}
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Pro play role distribution">
            {!m || !roleTotal ? <div className="text-sm text-dim">Not picked in 2026 pro play.</div> : (
              <div className="flex flex-col gap-1.5">
                {ROLES.filter((r) => (m.byRole[r] ?? 0) > 0).sort((a, b) => (m.byRole[b] ?? 0) - (m.byRole[a] ?? 0)).map((r) => (
                  <div key={r} className="flex items-center gap-2 text-xs">
                    <RoleIcon role={r} size={14} /><span className="w-14 text-muted">{ROLE_LABEL[r]}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${((m.byRole[r] ?? 0) / roleTotal) * 100}%`, background: ROLE_COLORS[r] }} /></div>
                    <span className="w-16 text-right font-display">{m.byRole[r]} <span className="text-dim">({pct((m.byRole[r] ?? 0) / roleTotal)})</span></span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {similar.length > 0 && (
            <Panel title={`Similar ${titleCase(c.archetype ?? '')} picks`}>
              <div className="flex flex-wrap gap-2">
                {similar.map((x) => <button key={x.id} className="flex flex-col items-center gap-0.5 w-14 hover:text-gold2" onClick={() => nav('champions', x.id)}><ChampIcon id={x.id} size={40} /><span className="text-[10px] truncate w-full text-center">{x.name}</span></button>)}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Panel title={`Pro players who main ${c.name} · ${mains.length}`} right={<span className="text-xs text-muted">comfort ≥ 130 (pro-ready){mine.length ? ` · ${mine.length} on your team` : ''}</span>}>
        {mains.length === 0 ? <Empty>No player has high mastery on {c.name}.</Empty> : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {(showAll ? mains : mains.slice(0, 24)).map((p) => {
                const team = p.teamId ? state.teams[p.teamId] : null;
                const mastery = p.champions[c.id];
                const own = p.teamId === state.userTeamId;
                return (
                  <button key={p.id} className={`panel-flat px-2 py-1.5 flex items-center gap-2 text-left hover:border-gold transition ${own ? 'border-gold' : ''}`} onClick={() => nav('player', p.id)}>
                    <Portrait player={p} team={team} size={34} />
                    <div className="flex-1 min-w-0 leading-tight">
                      <div className="font-semibold truncate flex items-center gap-1">{p.handle}<RoleIcon role={p.role} size={12} /></div>
                      <div className="text-[11px] text-dim truncate flex items-center gap-1">{team ? <><TeamLogo team={team} size={14} />{team.short}</> : 'Free agent'} · ovr {playerOvr(p)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-lg leading-none" style={{ color: masteryTier(mastery).color }}>{mastery}</div>
                      <div className="text-[9px] uppercase" style={{ color: masteryTier(mastery).color }}>{masteryTier(mastery).label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {mains.length > 24 && <div className="text-center mt-3"><button className="btn btn-ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${mains.length}`}</button></div>}
          </>
        )}
      </Panel>
    </div>
  );
}

/** Lane matchups per role (op.gg): easiest and hardest lane opponents with this champion's win rate. */
function Matchups({ c }: { c: Champion }) {
  const roles = ROLES.filter((r) => c.matchups?.[r]);
  const [role, setRole] = useState<Role>(roles[0]);
  const m = c.matchups?.[role];
  const row = (x: { id: string; wr: number }, good: boolean) => {
    const o = gd().championById[x.id];
    return (
      <button key={x.id} onClick={() => nav('champions', x.id)} className="flex items-center gap-2 w-full hover:bg-panel2/60 rounded px-1 py-0.5 text-left">
        <ChampIcon id={x.id} size={22} />
        <span className="flex-1 text-sm truncate">{o?.name ?? x.id}</span>
        <span className={`font-display text-sm ${good ? 'text-emerald-400' : 'text-red-400'}`}>{(x.wr * 100).toFixed(1)}%</span>
      </button>
    );
  };
  return (
    <Panel title="Lane matchups">
      {roles.length > 1 && <div className="flex gap-1 mb-2">{roles.map((r) => <button key={r} className={`chip ${r === role ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => setRole(r)}><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</button>)}</div>}
      {m && (
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Strong against</div>{m.easy.map((x) => row(x, true))}</div>
          <div><div className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-1">Weak against</div>{m.hard.map((x) => row(x, false))}</div>
        </div>
      )}
      <div className="text-[10px] text-dim mt-2">Matchup win rates from op.gg (Emerald+, patch 16.20). Counters win more trades, CS and wave control in the laning phase.</div>
    </Panel>
  );
}

/** The item build the simulation buys (op.gg's most played build for the role). */
function Builds({ c }: { c: Champion }) {
  const roles = ROLES.filter((r) => c.builds?.[r]);
  const [role, setRole] = useState<Role>(roles[0]);
  const b = c.builds?.[role];
  const ids = b ? [b.start, b.core[0], b.boots, ...b.core.slice(1), ...b.late].filter((x): x is string => !!x) : [];
  return (
    <Panel title="Build">
      {roles.length > 1 && <div className="flex gap-1 mb-2">{roles.map((r) => <button key={r} className={`chip ${r === role ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => setRole(r)}><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</button>)}</div>}
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id, i) => { const it = gd().itemById[id]; return it ? <img key={id + i} src={asset(it.icon)} title={`${it.name} (${it.cost}g)`} alt={it.name} className="w-8 h-8 rounded border border-line" /> : null; })}
      </div>
      <div className="text-[10px] text-dim mt-2">Starter → first item → boots → core → late items (op.gg, most played).</div>
    </Panel>
  );
}
