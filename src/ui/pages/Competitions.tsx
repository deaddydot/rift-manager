// Season competitions overview: timeline, live events and every competition grouped by
// International / your league / tier 1 / tier 2 / tier 3 with region & status filters.
import { useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Competition, GameState, RegionId } from '../../engine/types';
import { REGION_LABEL } from '../../engine/types';
import { Panel, TeamLogo, Pill, Empty, money, fmtDate } from '../components/kit';
import { seasonComps, expectedTeams, compHeadline, teamStatusIn, inTransferWindow, willEnter, KIND_LABEL, compColor, TONE_COLOR } from '../../engine/management/fixtureinfo';
import { CompEmblem, StatusChip } from './CompetitionPage';

type StatusFilter = 'all' | 'active' | 'upcoming' | 'done';
const REGIONS: ('all' | 'INTL' | RegionId)[] = ['all', 'INTL', 'KR', 'CN', 'EMEA', 'NA', 'APAC', 'BR'];
const regionName = (r: string) => (r === 'all' ? 'All regions' : r === 'INTL' ? 'International' : REGION_LABEL[r as RegionId] ?? r);

export default function Competitions(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const [region, setRegion] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [season, setSeason] = useState(state.season);
  const [open, setOpen] = useState<Record<string, boolean>>({ intl: true, user: true, t1: true, t2: false, t3: false });
  const user = state.teams[state.userTeamId];
  const userLeague = state.leagues[user.leagueId];
  const seasons = [...new Set(Object.values(state.competitions).map((c) => c.season))].sort((a, b) => b - a);
  const all = useMemo(() => seasonComps(state, season).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.tier - b.tier), [v, season]);

  const filtered = all.filter((c) => {
    if (region !== 'all' && (c.region ?? 'INTL') !== region) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (q && !`${c.name} ${c.short} ${c.leagueId ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const isUserComp = (c: Competition) => c.tier !== 0 && c.leagueId === user.leagueId;
  const sections: { id: string; title: ReactNode; list: Competition[]; group: boolean }[] = [
    { id: 'intl', title: 'International', list: filtered.filter((c) => c.tier === 0), group: false },
    { id: 'user', title: <span className="flex items-center gap-2"><TeamLogo team={user} size={18} />Your league · {userLeague?.fullName ?? user.leagueId}</span>, list: filtered.filter(isUserComp), group: false },
    { id: 't1', title: 'Tier 1 leagues', list: filtered.filter((c) => c.tier === 1 && !isUserComp(c)), group: true },
    { id: 't2', title: 'Tier 2 — challenger leagues', list: filtered.filter((c) => c.tier === 2 && !isUserComp(c)), group: true },
    { id: 't3', title: 'Tier 3 — amateur & academy', list: filtered.filter((c) => c.tier >= 3 && !isUserComp(c)), group: true },
  ];
  const live = all.filter((c) => c.status === 'active' && (c.tier <= 1 || c.teams.includes(user.id)));
  const counts = { active: all.filter((c) => c.status === 'active').length, upcoming: all.filter((c) => c.status === 'upcoming').length, done: all.filter((c) => c.status === 'done').length };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <h1 className="font-display text-3xl font-bold leading-tight">Competitions <span className="text-gold">{season}</span></h1>
          <div className="text-sm text-muted">{all.length} competitions · {counts.active} live · {counts.upcoming} upcoming · {counts.done} finished</div>
        </div>
        {seasons.length > 1 && (
          <select className="input" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {seasons.map((y) => <option key={y} value={y}>Season {y}{y === state.season ? ' (current)' : ''}</option>)}
          </select>
        )}
        <input className="input w-56" placeholder="Search competitions…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex rounded-lg border border-line2 overflow-hidden">
          {(['all', 'active', 'upcoming', 'done'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-semibold capitalize ${status === s ? 'bg-gold text-black' : 'text-muted hover:text-text hover:bg-panel2'}`}>{s === 'active' ? 'Live' : s === 'done' ? 'Finished' : s}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REGIONS.map((r) => (
          <button key={r} onClick={() => setRegion(r)} className={`chip ${region === r ? '!border-gold !text-gold2 !bg-gold/15' : 'text-muted hover:text-text'}`}>{regionName(r)}</button>
        ))}
      </div>

      <SeasonTimeline state={state} comps={all} year={season} />

      {live.length > 0 && status !== 'done' && status !== 'upcoming' && (
        <div>
          <div className="text-[11px] uppercase tracking-widest text-dim font-bold mb-2">Live now</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {live.map((c) => <LiveCard key={c.id} state={state} comp={c} />)}
          </div>
        </div>
      )}

      {sections.map((s) => (
        <Panel key={s.id} bodyClass="p-0" title={
          <button className="flex items-center gap-2 uppercase" onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
            <span className={`text-xs transition ${open[s.id] ? 'rotate-90' : ''}`}>▶</span>{s.title}
          </button>
        } right={<span className="text-xs text-muted">{s.list.length} competitions{s.list.some((c) => c.status === 'active') ? ` · ${s.list.filter((c) => c.status === 'active').length} live` : ''}</span>}>
          {open[s.id] && (s.list.length ? <CompTable state={state} list={s.list} group={s.group} /> : <Empty>No competitions match the filters.</Empty>)}
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ table
function CompTable({ state, list, group }: { state: GameState; list: Competition[]; group: boolean }) {
  const leagueOrder = Object.keys(state.leagues);
  const keyOf = (c: Competition) => c.leagueId ?? (c.tags?.includes('emea_masters') ? 'EMEA Masters' : c.short);
  const groups: [string, Competition[]][] = [];
  if (group) {
    const m = new Map<string, Competition[]>();
    for (const c of list) { const k = keyOf(c); if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); }
    groups.push(...[...m.entries()].sort((a, b) => (leagueOrder.indexOf(a[0]) + 1 || 999) - (leagueOrder.indexOf(b[0]) + 1 || 999)));
  } else groups.push(['', list]);
  return (
    <div className="overflow-x-auto">
      <table className="tbl min-w-[900px]">
        <thead>
          <tr><th className="w-24">Status</th><th>Competition</th><th className="w-44">Dates</th><th className="w-16 text-center">Teams</th><th className="w-24 text-right">Prize</th><th className="w-[30%]">Leader / Champion</th></tr>
        </thead>
        <tbody>
          {groups.map(([k, cs]) => (
            <GroupRows key={k || 'all'} state={state} league={k} comps={cs} showHeader={group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ state, league, comps, showHeader }: { state: GameState; league: string; comps: Competition[]; showHeader: boolean }) {
  const l = state.leagues[league];
  const nTeams = l ? Object.values(state.teams).filter((t) => t.leagueId === l.id).length : 0;
  return (
    <>
      {showHeader && (
        <tr>
          <td colSpan={6} className="!bg-[#0a1120] !py-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-display font-bold text-sm text-gold2">{l?.name ?? league}</span>
              {l && <span className="text-muted">{l.fullName}</span>}
              {l && <span className="text-dim">· {REGION_LABEL[l.region]} · {nTeams} teams{l.franchised ? ' · franchised' : ''}</span>}
            </div>
          </td>
        </tr>
      )}
      {comps.map((c) => <CompRow key={c.id} state={state} comp={c} />)}
    </>
  );
}

function CompRow({ state, comp }: { state: GameState; comp: Competition }) {
  const head = compHeadline(state, comp);
  const headTeam = head?.teamId ? state.teams[head.teamId] : null;
  const n = expectedTeams(state, comp);
  const user = state.userTeamId;
  const us = teamStatusIn(state, comp, user);
  const userIn = willEnter(state, comp, user);
  const days = Math.round((new Date(comp.startDate).getTime() - new Date(state.date).getTime()) / 864e5);
  return (
    <tr className={`row ${userIn ? 'bg-gold/[0.05]' : ''}`} onClick={() => nav('competition', comp.id)}>
      <td><StatusChip status={comp.status} /></td>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <CompEmblem comp={comp} size={30} />
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">{comp.name}{userIn && <span className="text-[9px] font-bold px-1.5 py-px rounded bg-gold text-black">YOU</span>}</div>
            <div className="text-[11px] text-dim flex items-center gap-1.5">
              <span style={{ color: compColor(comp) }}>{KIND_LABEL[comp.kind]}</span>
              {comp.tier > 0 && <span>· {comp.region === 'INTL' || !comp.region ? 'International' : REGION_LABEL[comp.region]}</span>}
              {comp.tier === 0 && comp.prizePool > 0 && <span>· {money(comp.prizePool * (comp.prizeSplit[0] ?? 0))} to the winner</span>}
              {us && <span style={{ color: TONE_COLOR[us.tone] }}>· {us.text}{us.sub ? ` (${us.sub})` : ''}</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="text-xs text-muted whitespace-nowrap">
        {fmtDate(comp.startDate, { month: 'short', day: 'numeric' })} – {fmtDate(comp.endDate, { month: 'short', day: 'numeric' })}
        {comp.status === 'upcoming' && days > 0 && <div className="text-[10px] text-dim">starts in {days} day{days === 1 ? '' : 's'}</div>}
      </td>
      <td className="text-center font-display font-bold">{n ?? '?'}</td>
      <td className="text-right font-display">{comp.prizePool ? <span className="text-gold2">{money(comp.prizePool)}</span> : <span className="text-dim">—</span>}</td>
      <td>
        {headTeam ? (
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={headTeam} size={22} />
            <span className={`font-semibold truncate ${headTeam.id === user ? 'text-gold2' : ''}`}>{headTeam.name}</span>
            {comp.status === 'done' ? <Pill color="#f0c674">{comp.kind === 'league' ? '1st place' : 'Champion'}</Pill> : <span className="text-[11px] text-muted truncate">{head?.text}</span>}
          </div>
        ) : head ? <span className="text-xs text-muted">{head.text}</span> : <span className="text-xs text-dim">—</span>}
      </td>
    </tr>
  );
}

function LiveCard({ state, comp }: { state: GameState; comp: Competition }) {
  const head = compHeadline(state, comp);
  const t = head?.teamId ? state.teams[head.teamId] : null;
  const stage = comp.stages[comp.stages.length - 1];
  const us = teamStatusIn(state, comp, state.userTeamId);
  const c = compColor(comp);
  return (
    <button onClick={() => nav('competition', comp.id)} className="panel p-3 text-left hover:border-gold flex flex-col gap-2" style={{ background: `linear-gradient(140deg, ${c}22, transparent 60%), linear-gradient(180deg, var(--color-panel2), var(--color-panel))` }}>
      <div className="flex items-center gap-2.5">
        <CompEmblem comp={comp} size={34} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{comp.name}</div>
          <div className="text-[11px] text-muted">{stage?.name ?? 'Starting'} · until {fmtDate(comp.endDate, { month: 'short', day: 'numeric' })}</div>
        </div>
        <StatusChip status="active" />
      </div>
      <div className="flex items-center gap-2 text-sm min-h-[24px]">
        {t ? <><TeamLogo team={t} size={20} /><span className="font-semibold truncate">{t.short}</span><span className="text-xs text-muted truncate">leads {head?.text}</span></> : <span className="text-xs text-muted truncate">{head?.text}</span>}
      </div>
      {us && <div className="text-[11px]" style={{ color: TONE_COLOR[us.tone] }}>{state.teams[state.userTeamId].short}: {us.text}{us.sub ? ` · ${us.sub}` : ''}</div>}
    </button>
  );
}

// ------------------------------------------------------------------ season timeline (Gantt)
function SeasonTimeline({ state, comps, year }: { state: GameState; comps: Competition[]; year: number }) {
  const user = state.teams[state.userTeamId];
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year, 11, 31);
  const x = (d: string) => Math.max(0, Math.min(100, ((new Date(d + 'T00:00:00Z').getTime() - start) / (end - start)) * 100));
  const pick = comps.filter((c) => c.tier === 0 || c.leagueId === user.leagueId || willEnter(state, c, user.id));
  // greedy lane packing per group
  const lanes = (list: Competition[]) => {
    const out: Competition[][] = [];
    for (const c of [...list].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      const lane = out.find((l) => l[l.length - 1].endDate < c.startDate);
      if (lane) lane.push(c); else out.push([c]);
    }
    return out;
  };
  const rows: [string, Competition[][]][] = [
    ['International', lanes(pick.filter((c) => c.tier === 0))],
    [state.leagues[user.leagueId]?.name ?? user.leagueId, lanes(pick.filter((c) => c.tier !== 0))],
  ];
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`);
  // transfer windows as shaded spans
  const windows: [string, string][] = [];
  let ws: string | null = null;
  for (let t = start; t <= end; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    const o = inTransferWindow(d);
    if (o && !ws) ws = d;
    if (!o && ws) { windows.push([ws, d]); ws = null; }
  }
  if (ws) windows.push([ws, `${year}-12-31`]);
  const today = state.date.slice(0, 4) === String(year) ? x(state.date) : null;
  return (
    <Panel title="Season timeline" right={<span className="flex items-center gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-accent/25 border border-accent/40" />Transfer window</span><span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-gold" />Today</span></span>}>
      <div className="grid grid-cols-[110px_1fr] gap-x-3">
        <div />
        <div className="relative h-5 text-[10px] text-dim">
          {months.map((m) => <span key={m} className="absolute top-0" style={{ left: `${x(m)}%` }}>{fmtDate(m, { month: 'short' })}</span>)}
        </div>
        {rows.map(([label, ls]) => (
          ls.length ? ls.map((lane, li) => (
            <TimelineLane key={label + li} label={li === 0 ? label : ''} lane={lane} x={x} windows={windows} months={months} today={today} userId={user.id} state={state} />
          )) : null
        ))}
      </div>
    </Panel>
  );
}

function TimelineLane({ state, label, lane, x, windows, months, today, userId }: { state: GameState; label: string; lane: Competition[]; x: (d: string) => number; windows: [string, string][]; months: string[]; today: number | null; userId: string }) {
  return (
    <>
      <div className="text-xs text-muted font-semibold truncate self-center">{label}</div>
      <div className="relative h-7 border-t border-[#141e33]">
        {months.map((m) => <span key={m} className="absolute top-0 bottom-0 border-l border-[#141e33]" style={{ left: `${x(m)}%` }} />)}
        {windows.map(([a, b], i) => <span key={i} className="absolute top-0 bottom-0 bg-accent/10" style={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%` }} />)}
        {lane.map((c) => {
          const col = compColor(c);
          const won = c.winner ? state.teams[c.winner] : null;
          const mine = c.teams.includes(userId);
          return (
            <button key={c.id} onClick={() => nav('competition', c.id)} title={`${c.name} · ${fmtDate(c.startDate, { month: 'short', day: 'numeric' })} – ${fmtDate(c.endDate, { month: 'short', day: 'numeric' })}${won ? ` · won by ${won.name}` : ''}`}
              className="absolute top-1 bottom-1 rounded px-1.5 flex items-center gap-1 overflow-hidden text-[10px] font-semibold hover:brightness-125 whitespace-nowrap"
              style={{ left: `${x(c.startDate)}%`, width: `max(${x(c.endDate) - x(c.startDate)}%, 6px)`, background: `${col}${c.status === 'done' ? '44' : c.status === 'active' ? '88' : '2e'}`, border: `1px solid ${col}${mine ? 'ff' : '77'}`, color: '#f0e6d2' }}>
              {won && <TeamLogo team={won} size={12} />}
              <span className="truncate">{c.short}</span>
            </button>
          );
        })}
        {today !== null && <span className="absolute -top-px -bottom-px w-0.5 bg-gold z-10" style={{ left: `${today}%` }} />}
      </div>
    </>
  );
}

