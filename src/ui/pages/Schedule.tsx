// The user's season schedule: month calendar (matches, international events, transfer
// windows, milestones), a fixture list, and notable fixtures from around the world.
import { useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Competition, GameState, MatchFixture } from '../../engine/types';
import { Panel, Stat, TeamLogo, Empty, Pill, fmtDate } from '../components/kit';
import { addDays, weekday } from '../../engine/season/formats';
import {
  teamFixtures, isPlayed, isBye, outcome, scoreFor, opponentOf, seasonRecord, cleanLabel, seasonMilestones, inTransferWindow, teamStatusIn, byDate, seasonComps, willEnter, compColor, TONE_COLOR,
} from '../../engine/management/fixtureinfo';
import { CompEmblem, MatchRow, StatusChip, FormDots } from './CompetitionPage';

type View = 'calendar' | 'list';
const WIN = '#22c55e', LOSS = '#ef4444';
const daysUntil = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 864e5);
const inDays = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 0 ? `in ${n} days` : `${-n} days ago`);

export default function Schedule(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const user = state.teams[state.userTeamId];
  const [view, setView] = useState<View>('calendar');
  const [month, setMonth] = useState(state.date.slice(0, 7));
  const fixtures = useMemo(() => teamFixtures(state, user.id).filter((f) => !isBye(f)), [v, user.id]);
  const byDay = useMemo(() => {
    const m: Record<string, MatchFixture[]> = {};
    for (const f of fixtures) (m[f.date] ??= []).push(f);
    return m;
  }, [fixtures]);
  const rec = seasonRecord(state, user.id, state.season);
  const next = fixtures.find((f) => !f.result);
  const last = [...fixtures].reverse().find(isPlayed);
  const remaining = fixtures.filter((f) => !f.result && state.competitions[f.competitionId]?.season === state.season).length;
  const form = fixtures.filter(isPlayed).slice(-5).map((f) => outcome(f, user.id));
  const windowOpen = inTransferWindow(state.date);
  let windowChange = state.date;
  for (let i = 0; i < 400 && inTransferWindow(windowChange) === windowOpen; i++) windowChange = addDays(windowChange, 1);

  const nextOpp = next ? opponentOf(next, user.id) : null;
  const lastOpp = last ? opponentOf(last, user.id) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <TeamLogo team={user} size={44} />
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">Schedule</h1>
            <div className="text-sm text-muted">{user.name} · Season {state.season}</div>
          </div>
        </div>
        <div className="flex rounded-lg border border-line2 overflow-hidden">
          {(['calendar', 'list'] as View[]).map((x) => (
            <button key={x} onClick={() => setView(x)} className={`px-4 py-1.5 text-sm font-semibold capitalize ${view === x ? 'bg-gold text-black' : 'text-muted hover:text-text hover:bg-panel2'}`}>{x}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <Stat label="Season record" value={<span>{rec.w}<span className="text-dim">-</span>{rec.l}</span>} sub={`Games ${rec.gw}-${rec.gl}${rec.w + rec.l ? ` · ${Math.round((rec.w / (rec.w + rec.l)) * 100)}% series won` : ''}`} />
        <div className="panel-flat px-3 py-2.5 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Form</div>
          <div className="mt-1.5">{form.length ? <FormDots results={form} size={20} /> : <span className="text-dim text-sm">No matches yet</span>}</div>
          <div className="text-xs text-dim truncate mt-1">{last ? `Last: ${outcome(last, user.id)} ${scoreFor(last, user.id)!.join('-')} vs ${state.teams[lastOpp ?? '']?.short ?? '?'}` : ''}</div>
        </div>
        <button className="panel-flat px-3 py-2.5 min-w-0 text-left hover:border-gold" disabled={!next} onClick={() => next && nav('fixture', next.id)}>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Next match</div>
          {next ? (
            <>
              <div className="flex items-center gap-2 mt-0.5"><TeamLogo team={nextOpp ? state.teams[nextOpp] : null} size={24} /><span className="font-display text-xl font-bold truncate">{nextOpp ? state.teams[nextOpp]?.short : 'TBD'}</span></div>
              <div className="text-xs text-dim truncate">{fmtDate(next.date, { month: 'short', day: 'numeric' })} · {inDays(daysUntil(state.date, next.date))} · {state.competitions[next.competitionId]?.short}</div>
            </>
          ) : <div className="font-display text-xl font-bold text-dim">None scheduled</div>}
        </button>
        <Stat label="Remaining" value={remaining} sub="scheduled series this season" />
        <Stat label="Transfer window" value={windowOpen ? 'Open' : 'Closed'} color={windowOpen ? '#0ac8b9' : '#8a97b3'} sub={`${windowOpen ? 'closes' : 'opens'} ${fmtDate(windowChange, { month: 'short', day: 'numeric' })} (${inDays(daysUntil(state.date, windowChange))})`} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="min-w-0">
          {view === 'calendar'
            ? <MonthCalendar state={state} month={month} setMonth={setMonth} byDay={byDay} />
            : <FixtureList state={state} fixtures={fixtures} />}
        </div>
        <div className="space-y-4 min-w-0">
          <AroundTheWorld state={state} v={v} />
          <KeyDates state={state} />
          <YourCompetitions state={state} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ calendar
interface Band { comp: Competition; color: string; intl: boolean }

function MonthCalendar({ state, month, setMonth, byDay }: { state: GameState; month: string; setMonth: (m: string) => void; byDay: Record<string, MatchFixture[]> }) {
  const user = state.teams[state.userTeamId];
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + dim) / 7) * 7;
  const days = Array.from({ length: total }, (_, i) => addDays(first, i - lead));
  const shift = (k: number) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const comps = Object.values(state.competitions);
  const bandComps = comps.filter((c) => c.tier === 0 || (c.leagueId === user.leagueId && c.tier !== 0) || c.teams.includes(user.id));
  const milestones = [...seasonMilestones(y - 1), ...seasonMilestones(y), ...seasonMilestones(y + 1)];
  const monthFx = Object.entries(byDay).filter(([d]) => d.startsWith(month)).flatMap(([, fs]) => fs);
  const mw = monthFx.filter((f) => outcome(f, user.id) === 'W').length, ml = monthFx.filter((f) => outcome(f, user.id) === 'L').length;
  const seasonMonths = Array.from({ length: 12 }, (_, i) => `${state.season}-${String(i + 1).padStart(2, '0')}`);

  return (
    <Panel bodyClass="p-3" title={
      <span className="flex items-center gap-2">
        <button className="btn btn-ghost px-2 py-0.5" onClick={() => shift(-1)}>‹</button>
        <span className="min-w-[150px] text-center normal-case text-base">{fmtDate(first, { month: 'long', year: 'numeric' })}</span>
        <button className="btn btn-ghost px-2 py-0.5" onClick={() => shift(1)}>›</button>
      </span>
    } right={
      <>
        <span className="text-xs text-muted">{monthFx.length} match{monthFx.length === 1 ? '' : 'es'}{mw + ml ? ` · ${mw}-${ml}` : ''}</span>
        <button className="btn py-1 text-xs" onClick={() => setMonth(state.date.slice(0, 7))}>Today</button>
      </>
    }>
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {seasonMonths.map((sm) => {
          const n = Object.keys(byDay).filter((d) => d.startsWith(sm)).length;
          return (
            <button key={sm} onClick={() => setMonth(sm)} className={`flex-1 min-w-[48px] rounded-md px-1 py-1 text-[11px] font-semibold border ${sm === month ? 'border-gold text-gold2 bg-gold/10' : 'border-line text-muted hover:text-text'} ${sm === state.date.slice(0, 7) ? 'underline decoration-gold underline-offset-2' : ''}`}>
              {fmtDate(`${sm}-01`, { month: 'short' })}
              <div className="text-[9px] text-dim font-normal">{n ? `${n} match${n > 1 ? 'es' : ''}` : '—'}</div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-px bg-line border border-line rounded-lg overflow-hidden">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-[#0a1120] text-[10px] uppercase tracking-wider text-muted font-bold text-center py-1">{d}</div>)}
        {days.map((d, i) => {
          const bands: Band[] = bandComps.filter((c) => c.startDate <= d && c.endDate >= d).map((c) => ({ comp: c, color: compColor(c), intl: c.tier === 0 })).sort((a, b) => Number(b.intl) - Number(a.intl));
          return <DayCell key={d} state={state} d={d} inMonth={d.startsWith(month)} rowStart={i % 7 === 0} bands={bands} matches={byDay[d] ?? []} marks={milestones.filter((x) => x.date === d)} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted">
        <Legend swatch={<span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: WIN }} />} text="Win" />
        <Legend swatch={<span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: LOSS }} />} text="Loss" />
        <Legend swatch={<span className="w-3 h-3 rounded-sm border-2 border-gold" />} text="Upcoming match" />
        <Legend swatch={<span className="w-4 h-2 rounded-sm" style={{ background: '#a855f7aa' }} />} text="International event" />
        <Legend swatch={<span className="w-4 h-2 rounded-sm" style={{ background: '#3b82f655' }} />} text="Your competitions" />
        <Legend swatch={<span className="w-4 h-2 rounded-sm bg-accent/25 border-b-2 border-accent" />} text="Transfer window" />
        <Legend swatch={<span className="w-2 h-2 rounded-full bg-gold" />} text="Milestone" />
      </div>
    </Panel>
  );
}

function Legend({ swatch, text }: { swatch: ReactNode; text: string }) {
  return <span className="flex items-center gap-1.5">{swatch}{text}</span>;
}

function DayCell({ state, d, inMonth, rowStart, bands, matches, marks }: { state: GameState; d: string; inMonth: boolean; rowStart: boolean; bands: Band[]; matches: MatchFixture[]; marks: { label: string; kind: string }[] }) {
  const today = d === state.date;
  const past = d < state.date;
  const tw = inTransferWindow(d);
  const user = state.userTeamId;
  return (
    <div className={`relative min-h-[118px] p-1.5 flex flex-col gap-1 ${tw ? 'bg-[#0b1a22]' : 'bg-[#0b1220]'} ${inMonth ? '' : 'opacity-40'} ${today ? 'outline outline-2 -outline-offset-2 outline-gold z-[1]' : ''}`}
      style={tw ? { boxShadow: 'inset 0 -2px 0 #0ac8b966' } : undefined}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-display font-bold w-6 h-6 flex items-center justify-center rounded-full ${today ? 'bg-gold text-black' : past ? 'text-dim' : 'text-muted'}`}>{Number(d.slice(8))}</span>
        {marks.length > 0 && <span className="w-2 h-2 rounded-full bg-gold" title={marks.map((x) => x.label).join(', ')} />}
      </div>
      {bands.slice(0, 2).map((b) => {
        const isStart = b.comp.startDate === d, isEnd = b.comp.endDate === d;
        const showLabel = isStart || rowStart || d.endsWith('-01');
        return (
          <button key={b.comp.id} onClick={() => nav('competition', b.comp.id)} title={`${b.comp.name} (${fmtDate(b.comp.startDate, { month: 'short', day: 'numeric' })} – ${fmtDate(b.comp.endDate, { month: 'short', day: 'numeric' })})`}
            className={`-mx-1.5 px-1.5 text-[10px] font-semibold text-left truncate leading-4 ${b.intl ? 'h-4' : 'h-3.5'} ${isStart ? 'ml-0 rounded-l' : ''} ${isEnd ? 'mr-0 rounded-r' : ''}`}
            style={{ background: b.intl ? `${b.color}aa` : `${b.color}40`, color: b.intl ? '#0b0f19' : '#cbd5e1' }}>
            {showLabel ? `${b.comp.short}${isStart ? ' · starts' : ''}` : isEnd ? (b.intl ? 'Final' : 'ends') : ' '}
          </button>
        );
      })}
      {matches.map((f) => {
        const opp = opponentOf(f, user);
        const ot = opp ? state.teams[opp] : null;
        const r = outcome(f, user);
        const s = scoreFor(f, user);
        const c = state.competitions[f.competitionId];
        const color = r === 'W' ? WIN : r === 'L' ? LOSS : '#c8aa6e';
        return (
          <button key={f.id} onClick={() => nav('fixture', f.id)} className="rounded-md border px-1 py-0.5 text-left hover:bg-[#16213a] bg-[#0d1628]" style={{ borderColor: `${color}aa` }}>
            <div className="flex items-center gap-1">
              <TeamLogo team={ot} size={16} />
              <span className="text-[11px] font-semibold truncate flex-1">{ot ? ot.short : 'TBD'}</span>
              {r ? <span className="text-[11px] font-display font-bold" style={{ color }}>{r} {s![0]}-{s![1]}</span> : <span className="text-[10px] text-dim">Bo{f.bestOf}</span>}
            </div>
            <div className="text-[9px] truncate" style={{ color: compColor(c) }}>{c?.short}{cleanLabel(f.label) ? ` · ${cleanLabel(f.label)}` : ''}</div>
          </button>
        );
      })}
      {marks.map((x) => <div key={x.label} className={`text-[9px] leading-tight ${x.kind === 'window' ? 'text-accent' : 'text-gold'}`}>{x.label}</div>)}
    </div>
  );
}

// ------------------------------------------------------------------ list
function FixtureList({ state, fixtures }: { state: GameState; fixtures: MatchFixture[] }) {
  const user = state.userTeamId;
  const [filter, setFilter] = useState<'upcoming' | 'results' | 'all'>('upcoming');
  const [comp, setComp] = useState('all');
  const compsUsed = [...new Set(fixtures.map((f) => f.competitionId))].map((id) => state.competitions[id]).filter(Boolean).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let list = fixtures.filter((f) => (filter === 'upcoming' ? !f.result : filter === 'results' ? isPlayed(f) : true));
  if (comp !== 'all') list = list.filter((f) => f.competitionId === comp);
  if (filter === 'results') list = [...list].reverse();
  const groups: [string, MatchFixture[]][] = [];
  for (const f of list) {
    const k = f.date.slice(0, 7);
    const g = groups[groups.length - 1];
    if (g && g[0] === k) g[1].push(f); else groups.push([k, [f]]);
  }
  return (
    <Panel bodyClass="p-0" title="Fixtures & results" right={
      <>
        <select className="input py-1 text-xs" value={comp} onChange={(e) => setComp(e.target.value)}>
          <option value="all">All competitions</option>
          {compsUsed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-md border border-line2 overflow-hidden">
          {(['upcoming', 'results', 'all'] as const).map((x) => (
            <button key={x} onClick={() => setFilter(x)} className={`px-2.5 py-1 text-xs font-semibold capitalize ${filter === x ? 'bg-gold text-black' : 'text-muted hover:text-text'}`}>{x}</button>
          ))}
        </div>
      </>
    }>
      {!groups.length ? <Empty>{filter === 'upcoming' ? 'No upcoming fixtures yet — playoff and international matches appear once those stages are drawn.' : 'No matches played yet.'}</Empty> : groups.map(([mk, fs]) => {
        const w = fs.filter((f) => outcome(f, user) === 'W').length, l = fs.filter((f) => outcome(f, user) === 'L').length;
        return (
          <div key={mk}>
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a1120] border-b hairline sticky top-0 z-[1]">
              <span className="text-xs uppercase tracking-wider font-bold text-gold2">{fmtDate(`${mk}-01`, { month: 'long', year: 'numeric' })}</span>
              <span className="text-[11px] text-muted">{fs.length} match{fs.length === 1 ? '' : 'es'}{w + l ? ` · ${w}-${l}` : ''}</span>
            </div>
            {fs.map((f) => <ListRow key={f.id} state={state} f={f} />)}
          </div>
        );
      })}
    </Panel>
  );
}

function ListRow({ state, f }: { state: GameState; f: MatchFixture }) {
  const user = state.userTeamId;
  const opp = opponentOf(f, user);
  const ot = opp ? state.teams[opp] : null;
  const c = state.competitions[f.competitionId];
  const stage = c?.stages.find((s) => s.id === f.stageId);
  const r = outcome(f, user);
  const s = scoreFor(f, user);
  const n = daysUntil(state.date, f.date);
  const home = f.teamA === user;
  return (
    <div onClick={() => nav('fixture', f.id)} className={`grid grid-cols-[64px_minmax(0,1.1fr)_minmax(0,1.4fr)_110px_100px] items-center gap-3 px-4 py-2 border-b border-[#141e33] cursor-pointer hover:bg-[#111a2e] ${f.date === state.date ? 'bg-gold/10' : ''}`}>
      <div className="leading-tight">
        <div className="font-display text-lg font-bold">{fmtDate(f.date, { day: 'numeric' })}</div>
        <div className="text-[10px] text-muted uppercase">{fmtDate(f.date, { weekday: 'short', month: 'short' })}</div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {c && <CompEmblem comp={c} size={28} />}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{c?.short}</div>
          <div className="text-[11px] text-dim truncate">{stage?.name}{cleanLabel(f.label) ? ` · ${cleanLabel(f.label)}` : f.group ? ` · Group ${f.group}` : stage?.format === 'roundRobin' ? ` · Week ${f.round}` : stage?.format === 'swiss' ? ` · Round ${f.round} (0-0)` : ''}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-dim w-5">{home ? 'vs' : '@'}</span>
        <TeamLogo team={ot} size={26} />
        <div className="min-w-0">
          {ot ? <button className="font-semibold truncate hover:underline block max-w-full text-left" onClick={(e) => { e.stopPropagation(); nav('team', ot.id); }}>{ot.name}</button> : <span className="text-dim italic">To be determined</span>}
          <div className="text-[11px] text-dim">Bo{f.bestOf}{ot ? ` · ${state.leagues[ot.leagueId]?.name ?? ''}` : ''}</div>
        </div>
      </div>
      <div>
        {r ? (
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center text-black/80" style={{ background: r === 'W' ? WIN : LOSS }}>{r}</span>
            <span className="font-display text-xl font-bold">{s![0]}-{s![1]}</span>
          </div>
        ) : <span className={`text-xs font-semibold ${n <= 0 ? 'text-gold' : 'text-accent'}`}>{n <= 0 ? 'Today' : inDays(n)}</span>}
      </div>
      <div className="flex gap-0.5 justify-end">
        {(f.result?.games ?? []).map((g, i) => <span key={i} className="w-3.5 h-3.5 rounded-sm" title={`Game ${i + 1}`} style={{ background: g.winner === user ? WIN : LOSS }} />)}
        {!f.result && <span className="text-[11px] text-dim">{fmtDate(f.date, { weekday: 'long' })}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ side panels
const KIND_RANK: Record<Competition['kind'], number> = { international: 0, playoffs: 1, qualifier: 2, cup: 3, league: 4 };
const LEAGUE_RANK = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'];

function AroundTheWorld({ state, v }: { state: GameState; v: number }) {
  const notable = useMemo(() => Object.values(state.fixtures).filter((f) => {
    const c = state.competitions[f.competitionId];
    return c && c.season === state.season && c.tier <= 1 && f.teamA && f.teamB && !isBye(f);
  }), [v]);
  const rank = (f: MatchFixture) => {
    const c = state.competitions[f.competitionId];
    return c.tier * 100 + KIND_RANK[c.kind] * 10 + Math.max(0, LEAGUE_RANK.indexOf(c.leagueId ?? '')) + (/final/i.test(f.label ?? '') ? -5 : 0);
  };
  const sortF = (a: MatchFixture, b: MatchFixture) => rank(a) - rank(b) || byDate(a, b);
  const today = notable.filter((f) => f.date === state.date).sort(sortF);
  const pastDates = [...new Set(notable.filter((f) => f.date < state.date && isPlayed(f)).map((f) => f.date))].sort().slice(-2);
  const recent = notable.filter((f) => pastDates.includes(f.date) && isPlayed(f)).sort((a, b) => b.date.localeCompare(a.date) || rank(a) - rank(b));
  const nextDates = [...new Set(notable.filter((f) => f.date > state.date && !f.result).map((f) => f.date))].sort().slice(0, 2);
  const upcoming = notable.filter((f) => nextDates.includes(f.date) && !f.result).sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b));
  const Section = ({ title, list, cap = 8 }: { title: string; list: MatchFixture[]; cap?: number }) => (
    list.length ? (
      <div>
        <div className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold text-muted bg-[#0a1120] border-b hairline flex justify-between"><span>{title}</span><span className="text-dim normal-case tracking-normal font-normal">{list.length > cap ? `${cap} of ${list.length}` : list.length}</span></div>
        {list.slice(0, cap).map((f) => <MatchRow key={f.id} state={state} f={f} showDate={false} showComp short />)}
      </div>
    ) : null
  );
  return (
    <Panel title="Around the world" bodyClass="p-0" right={<button className="text-xs text-muted hover:text-gold" onClick={() => nav('competitions')}>All competitions ›</button>}>
      {!today.length && !recent.length && !upcoming.length ? <Empty>No top-tier matches scheduled right now.</Empty> : (
        <>
          <Section title={`Today · ${fmtDate(state.date, { month: 'short', day: 'numeric' })}`} list={today} />
          <Section title={`Latest results${pastDates.length ? ` · ${pastDates.map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(' & ')}` : ''}`} list={recent} cap={6} />
          <Section title={`Coming up${nextDates.length ? ` · ${nextDates.map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(' & ')}` : ''}`} list={upcoming} cap={6} />
        </>
      )}
    </Panel>
  );
}

function KeyDates({ state }: { state: GameState }) {
  const user = state.teams[state.userTeamId];
  const items: { date: string; label: string; color: string; compId?: string }[] = [];
  for (const m of [...seasonMilestones(state.season), ...seasonMilestones(state.season + 1)]) items.push({ date: m.date, label: m.label, color: m.kind === 'window' ? '#0ac8b9' : '#c8aa6e' });
  for (const c of Object.values(state.competitions)) {
    if (c.tier === 0 || (c.leagueId === user.leagueId && c.tier !== 0)) {
      items.push({ date: c.startDate, label: `${c.name} begins`, color: compColor(c), compId: c.id });
      if (c.tier === 0) items.push({ date: c.endDate, label: `${c.short} final`, color: compColor(c), compId: c.id });
    }
  }
  const up = items.filter((x) => x.date >= state.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  return (
    <Panel title="Key dates" bodyClass="p-0">
      {up.map((x, i) => (
        <button key={i} disabled={!x.compId} onClick={() => x.compId && nav('competition', x.compId)} className="w-full flex items-center gap-3 px-3 py-1.5 border-b border-[#141e33] last:border-0 text-left enabled:hover:bg-[#111a2e]">
          <span className="w-1 h-7 rounded" style={{ background: x.color }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{x.label}</div>
            <div className="text-[11px] text-dim">{fmtDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          <span className="text-[11px] text-muted whitespace-nowrap">{inDays(daysUntil(state.date, x.date))}</span>
        </button>
      ))}
    </Panel>
  );
}

function YourCompetitions({ state }: { state: GameState }) {
  const user = state.teams[state.userTeamId];
  const list = seasonComps(state).filter((c) => willEnter(state, c, user.id)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <Panel title="Your competitions" bodyClass="p-0">
      {!list.length ? <Empty>Not entered in any competition yet.</Empty> : list.map((c) => {
        const st = teamStatusIn(state, c, user.id);
        return (
          <button key={c.id} onClick={() => nav('competition', c.id)} className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-[#141e33] last:border-0 text-left hover:bg-[#111a2e]">
            <CompEmblem comp={c} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{c.name}</div>
              <div className="text-[11px] truncate" style={{ color: st ? TONE_COLOR[st.tone] : '#5b6787' }}>{st ? `${st.text}${st.sub ? ` · ${st.sub}` : ''}` : `Starts ${fmtDate(c.startDate, { month: 'short', day: 'numeric' })}`}</div>
            </div>
            <StatusChip status={c.status} />
          </button>
        );
      })}
    </Panel>
  );
}
