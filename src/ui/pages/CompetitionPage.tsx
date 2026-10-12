// Competition page: header, overview (placements, prizes, stats) and one tab per stage
// with a format-specific view (standings, GSL groups, Swiss buckets, brackets).
import { useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Competition, Stage, MatchFixture, GameState, Team, StageFormat } from '../../engine/types';
import { REGION_LABEL } from '../../engine/types';
import { Panel, Stat, Tabs, TeamLogo, ChampIcon, Pill, Empty, Portrait, money, fmtDate, pct, mmss } from '../components/kit';
import { standings, type StageSpec } from '../../engine/season/formats';
import { placementLabel } from '../../engine/season/season';
import { gd } from '../../data/gamedata';
import {
  ord, byDate, involves, isBye, isPlayed, outcome, cleanLabel, stageFixtures, compFixtures, stagePlan, expectedTeams, seedRuleText,
  qualPaths, stageZones, teamStatusIn, compHeadline, aliveTeams, willEnter, FORMAT_LABEL, KIND_LABEL, tierLabel, compColor, TONE_COLOR,
} from '../../engine/management/fixtureinfo';

// ------------------------------------------------------------------ shared bits (also used by other pages)
const FORMAT_DESC: Record<StageFormat, string> = {
  roundRobin: 'Every team plays every other team; the table decides seeding.',
  groups: 'Teams are split into groups and play a round robin inside their group.',
  gsl: 'Four-team groups: two opening matches, a winners’ match and an elimination match, then a decider. Two teams advance per group.',
  swiss: 'Teams are paired against opponents with the same record. Three wins qualify, three losses eliminate.',
  singleElim: 'Knockout bracket — lose once and you are out.',
  doubleElim: 'Upper and lower brackets — a team must lose twice to be eliminated.',
};
const TAG_EMBLEM: [string, string][] = [['worlds', 'WLD'], ['msi', 'MSI'], ['fst', 'FST'], ['ewc', 'EWC'], ['emea_masters', 'EM']];
const LEAGUE_EMBLEM: Record<string, string> = { LCKCL: 'CL', LCKAS: 'AS', CBLOL: 'CBLOL', LPLOL: 'LPLOL', NEXUS: 'NXS' };

export function CompEmblem({ comp, size = 40 }: { comp: Competition; size?: number }) {
  const c = compColor(comp);
  const tag = TAG_EMBLEM.find(([t]) => comp.tags?.includes(t))?.[1];
  const main = (tag ?? (comp.id.endsWith('-KESPA') ? 'KeSPA' : comp.leagueId ? LEAGUE_EMBLEM[comp.leagueId] ?? comp.leagueId : comp.short.split(' ')[0])).slice(0, 6);
  const sub = comp.kind === 'playoffs' ? 'PO' : comp.kind === 'qualifier' ? 'QUAL' : comp.kind === 'cup' && !tag && main !== 'KeSPA' ? 'CUP' : '';
  const fs = Math.max(9, size / (main.length > 4 ? 4.6 : main.length > 3 ? 3.7 : 3.1));
  return (
    <div className="rounded-xl flex flex-col items-center justify-center font-display font-bold shrink-0 leading-none text-center"
      style={{ width: size, height: size, background: `linear-gradient(150deg, ${c}40, ${c}10)`, border: `1px solid ${c}66`, color: c }}>
      <span style={{ fontSize: fs }}>{main}</span>
      {sub && size >= 28 && <span className="opacity-75" style={{ fontSize: Math.max(7, size / 5.5), marginTop: 1 }}>{sub}</span>}
    </div>
  );
}

export function StatusChip({ status }: { status: Competition['status'] | Stage['status'] }) {
  if (status === 'active') return <Pill color="#22c55e"><span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-gold" />Live</Pill>;
  if (status === 'done') return <Pill color="#c8aa6e">Finished</Pill>;
  return <Pill color="#8a97b3">Upcoming</Pill>;
}

export function FormDots({ results, size = 16 }: { results: ('W' | 'L' | null)[]; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {results.map((r, i) => (
        <span key={i} className="rounded-sm text-[9px] font-bold flex items-center justify-center text-black/80" style={{ width: size, height: size, background: r === 'W' ? '#22c55e' : r === 'L' ? '#ef4444' : '#1e2a44' }}>{r ?? ''}</span>
      ))}
    </div>
  );
}


function TeamSide({ team, align, won, lost, user, short }: { team: Team | null; align: 'left' | 'right'; won?: boolean; lost?: boolean; user?: boolean; short?: boolean }) {
  if (!team) return <span className={`text-dim italic text-xs ${align === 'right' ? 'text-right' : ''}`}>TBD</span>;
  return (
    <span className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${lost ? 'opacity-55' : ''}`}>
      <TeamLogo team={team} size={20} />
      <button className={`truncate hover:underline ${won ? 'font-bold' : 'font-medium'} ${user ? 'text-gold2' : ''}`} onClick={(e) => { e.stopPropagation(); nav('team', team.id); }}>
        {short ? team.short : team.name}
      </button>
    </span>
  );
}

/** Compact one-line fixture: [date] [competition] teamA  score  teamB [label]. */
export function MatchRow({ state, f, showDate = true, showComp = false, showLabel = false, short = false }: { state: GameState; f: MatchFixture; showDate?: boolean; showComp?: boolean; showLabel?: boolean; short?: boolean }) {
  const comp = state.competitions[f.competitionId];
  const A = f.teamA ? state.teams[f.teamA] ?? null : null, B = f.teamB ? state.teams[f.teamB] ?? null : null;
  const played = isPlayed(f), bye = isBye(f);
  const user = state.userTeamId;
  const click = A && B && !bye ? () => nav('fixture', f.id) : undefined;
  const cols = [showDate ? '58px' : '', showComp ? '92px' : '', 'minmax(0,1fr)', '58px', 'minmax(0,1fr)', showLabel ? 'minmax(0,110px)' : ''].filter(Boolean).join(' ');
  return (
    <div onClick={click} className={`grid items-center gap-2 px-3 py-1.5 text-[13px] border-b border-[#141e33] last:border-0 ${click ? 'cursor-pointer hover:bg-[#111a2e]' : ''} ${involves(f, user) ? 'bg-gold/[0.07]' : ''}`} style={{ gridTemplateColumns: cols }}>
      {showDate && <span className="text-[11px] text-muted whitespace-nowrap">{fmtDate(f.date, { month: 'short', day: 'numeric' })}</span>}
      {showComp && <span className="text-[11px] font-semibold truncate" style={{ color: compColor(comp) }} title={comp?.name}>{comp?.short}</span>}
      <TeamSide team={A} align="right" short={short} won={played && f.result!.winner === f.teamA} lost={played && f.result!.loser === f.teamA} user={f.teamA === user} />
      <span className="flex items-center justify-center font-display font-bold text-[15px]">
        {played ? (
          <><span className={f.result!.winner === f.teamA ? 'text-gold' : 'text-dim'}>{f.result!.scoreA}</span><span className="text-dim mx-1">:</span><span className={f.result!.winner === f.teamB ? 'text-gold' : 'text-dim'}>{f.result!.scoreB}</span></>
        ) : bye ? <span className="text-[10px] text-dim">BYE</span> : <span className="text-[11px] text-dim font-sans font-semibold">Bo{f.bestOf}</span>}
      </span>
      <TeamSide team={B} align="left" short={short} won={played && f.result!.winner === f.teamB} lost={played && f.result!.loser === f.teamB} user={f.teamB === user} />
      {showLabel && <span className="text-[11px] text-dim truncate text-right">{cleanLabel(f.label) ?? (f.group ? `Group ${f.group}` : `Round ${f.round}`)}</span>}
    </div>
  );
}

const ZONE_COLORS = ['#c8aa6e', '#0ac8b9', '#a855f7', '#38bdf8'];

/** Standings table for a round-robin stage (optionally one group). */
export function StandingsTable({ state, stage, group, zones = [], compact = false, highlight, maxRows }: {
  state: GameState; stage: Stage; group?: string; zones?: { from: number; count: number; label: string }[]; compact?: boolean; highlight?: string; maxRows?: number;
}) {
  const rows = standings(stage, state.fixtures, group);
  const fx = stageFixtures(state, stage).filter((f) => isPlayed(f) && (!group || f.group === group)).sort(byDate);
  const form = (t: string) => fx.filter((f) => involves(f, t)).slice(-5).map((f) => outcome(f, t));
  const user = state.userTeamId;
  const shown = maxRows ? rows.slice(0, maxRows) : rows;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="w-8 text-center">#</th><th>Team</th><th className="text-center">W-L</th>
          {!compact && <th className="text-center">Win%</th>}
          <th className="text-center">Games</th><th className="text-center">Diff</th>
          {!compact && <th>Last 5</th>}
        </tr>
      </thead>
      <tbody>
        {shown.map((r, i) => {
          const t = state.teams[r.teamId];
          const zi = zones.findIndex((z) => i >= z.from && i < z.from + z.count);
          const mine = r.teamId === user, hl = r.teamId === highlight;
          const diff = r.gw - r.gl;
          return (
            <tr key={r.teamId} className={`row ${mine ? 'bg-gold/10' : hl ? 'bg-accent/10' : ''}`} onClick={() => nav('team', r.teamId)}>
              <td className="text-center font-display font-bold text-muted" style={{ boxShadow: zi >= 0 ? `inset 3px 0 0 ${ZONE_COLORS[zi % ZONE_COLORS.length]}` : undefined }}>{i + 1}</td>
              <td>
                <div className="flex items-center gap-2 min-w-0">
                  <TeamLogo team={t} size={22} />
                  <span className={`font-semibold truncate ${mine ? 'text-gold2' : ''}`}>{compact ? t?.short : t?.name}</span>
                </div>
              </td>
              <td className="text-center font-display font-bold text-[15px]">{r.w}-{r.l}</td>
              {!compact && <td className="text-center text-muted">{r.w + r.l ? pct(r.w / (r.w + r.l)) : '—'}</td>}
              <td className="text-center text-muted">{r.gw}-{r.gl}</td>
              <td className={`text-center font-display font-bold ${diff > 0 ? 'text-[#22c55e]' : diff < 0 ? 'text-[#ef4444]' : 'text-dim'}`}>{diff > 0 ? '+' : ''}{diff}</td>
              {!compact && <td><FormDots results={form(r.teamId)} /></td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ZoneLegend({ zones }: { zones: { label: string }[] }) {
  if (!zones.length) return null;
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-muted border-t hairline">
      {zones.map((z, i) => (
        <span key={i} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />{z.label}</span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function CompetitionPage({ id, tab }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const comp = id ? state.competitions[id] : undefined;
  if (!comp) return <Panel title="Competition"><Empty>Competition not found. <button className="text-gold hover:underline" onClick={() => nav('competitions')}>Back to competitions</button></Empty></Panel>;

  const plan = stagePlan(comp);
  const stageTabs = (plan.length ? plan.map((s) => ({ id: s.id, name: s.name })) : comp.stages.map((s) => ({ id: s.id, name: s.name })));
  const built = (sid: string) => comp.stages.find((s) => s.id === sid);
  const activeStage = comp.stages.find((s) => s.status === 'active') ?? (comp.status === 'active' ? comp.stages[comp.stages.length - 1] : undefined);
  const defaultTab = comp.status === 'active' && activeStage ? activeStage.id : 'overview';
  const current = tab && (tab === 'overview' || stageTabs.some((s) => s.id === tab)) ? tab : defaultTab;
  const tabs = [
    { id: 'overview', label: 'Overview' as ReactNode },
    ...stageTabs.map((s) => {
      const st = built(s.id);
      return { id: s.id, label: <span className="flex items-center gap-1.5">{s.name}{st?.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />}{!st && <span className="text-[10px] text-dim">soon</span>}</span> as ReactNode };
    }),
  ];
  const stage = current !== 'overview' ? built(current) : undefined;
  const spec = current !== 'overview' ? plan.find((s) => s.id === current) : undefined;

  return (
    <div className="space-y-4">
      <CompHeader state={state} comp={comp} />
      <Tabs tabs={tabs} value={current} onChange={(t) => nav('competition', comp.id, t)} />
      {current === 'overview' ? <Overview state={state} comp={comp} />
        : stage ? <StageView key={stage.id} state={state} comp={comp} stage={stage} />
          : spec ? <PendingStage state={state} comp={comp} spec={spec} /> : <Empty>Stage not found.</Empty>}
    </div>
  );
}

function CompHeader({ state, comp }: { state: GameState; comp: Competition }) {
  const color = compColor(comp);
  const champion = comp.winner ? state.teams[comp.winner] : null;
  const head = compHeadline(state, comp);
  const leader = !champion && head?.teamId ? state.teams[head.teamId] : null;
  const user = state.teams[state.userTeamId];
  const userStatus = teamStatusIn(state, comp, user.id);
  const n = expectedTeams(state, comp);
  const league = comp.leagueId ? state.leagues[comp.leagueId] : null;
  const fx = compFixtures(state, comp).filter((f) => !isBye(f));
  const played = fx.filter(isPlayed).length;
  const plan = stagePlan(comp);
  const region = comp.region === 'INTL' || !comp.region ? 'International' : REGION_LABEL[comp.region];
  const userIn = willEnter(state, comp, user.id);
  return (
    <div className="panel overflow-hidden">
      <div className="p-5 flex flex-wrap items-center gap-5" style={{ background: `linear-gradient(110deg, ${color}2a, transparent 65%)` }}>
        <CompEmblem comp={comp} size={76} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <button className="hover:text-text" onClick={() => nav('competitions')}>Competitions</button><span>/</span>
            <span>{league?.fullName ?? 'International events'}</span><span>/</span><span>Season {comp.season}</span>
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight mt-0.5">{comp.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <StatusChip status={comp.status} />
            <Pill color={color}>{KIND_LABEL[comp.kind]}</Pill>
            {comp.tier > 0 && <Pill>{tierLabel(comp.tier)}</Pill>}
            <span className="text-xs text-muted">{region} · {fmtDate(comp.startDate, { month: 'short', day: 'numeric' })} – {fmtDate(comp.endDate)}</span>
          </div>
        </div>
        {champion && (
          <button className="flex items-center gap-3 panel-flat px-4 py-3 hover:border-gold" onClick={() => nav('team', champion.id)} style={{ borderColor: '#c8aa6e66' }}>
            <TeamLogo team={champion} size={52} />
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-gold font-bold">{comp.kind === 'league' ? 'Regular season winner' : 'Champion'}</div>
              <div className="font-display text-xl font-bold leading-tight">{champion.name}</div>
              <div className="text-xs text-muted">{state.leagues[champion.leagueId]?.name}</div>
            </div>
          </button>
        )}
        {leader && (
          <button className="flex items-center gap-3 panel-flat px-4 py-3 hover:border-gold" onClick={() => nav('team', leader.id)}>
            <TeamLogo team={leader} size={44} />
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-accent font-bold">Leader</div>
              <div className="font-display text-lg font-bold leading-tight">{leader.name}</div>
              <div className="text-xs text-muted">{head?.text}</div>
            </div>
          </button>
        )}
        {!leader && !champion && head && <div className="panel-flat px-4 py-3 text-sm text-muted">{head.text}</div>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border-t hairline">
        <Stat label="Prize pool" value={comp.prizePool ? money(comp.prizePool) : '—'} sub={comp.prizePool ? `Champion takes ${money(comp.prizePool * (comp.prizeSplit[0] ?? 0))}` : 'No prize money'} color={comp.prizePool ? '#f0e6d2' : undefined} />
        <Stat label="Teams" value={n ?? '?'} sub={comp.teams.length ? 'confirmed field' : 'expected field'} />
        <Stat label="Format" value={plan.length || comp.stages.length} sub={(plan.length ? plan.map((s) => FORMAT_LABEL[s.format]) : comp.stages.map((s) => FORMAT_LABEL[s.format])).join(' → ')} />
        <Stat label="Series played" value={fx.length ? `${played}/${fx.length}` : '—'} sub={comp.status === 'upcoming' ? `starts ${fmtDate(comp.startDate, { month: 'short', day: 'numeric' })}` : comp.status === 'done' ? 'completed' : 'so far'} />
        <Stat label={user.short} value={userStatus?.text ?? (userIn ? 'Participating' : 'Not involved')} sub={userStatus?.sub} color={userStatus ? TONE_COLOR[userStatus.tone] : userIn ? '#0ac8b9' : '#5b6787'} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ state, comp }: { state: GameState; comp: Competition }) {
  const v = useStore((s) => s.v);
  const paths = qualPaths(state, comp);
  const plan = stagePlan(comp);
  const order = comp.placements ? Object.entries(comp.placements).sort((a, b) => a[1] - b[1]).map(([t]) => t) : [];
  const stats = useMemo(() => compStats(state, comp), [v, comp.id]);
  const fx = compFixtures(state, comp).filter((f) => !isBye(f));
  const recent = fx.filter(isPlayed).sort(byDate).reverse().slice(0, 6);
  const upcoming = fx.filter((f) => !f.result).sort(byDate).slice(0, 6);
  const pathFor = (i: number) => paths.find((p) => i >= p.from && i < p.from + p.count);
  const lastStage = comp.stages[comp.stages.length - 1];

  return (
    <div className="grid xl:grid-cols-[1.35fr_1fr] gap-4">
      <div className="space-y-4 min-w-0">
        {comp.status === 'done' && order.length > 0 ? (
          <Panel title="Final placements" bodyClass="p-0" right={<span className="text-xs text-muted">{order.length} teams</span>}>
            <div className="max-h-[560px] overflow-auto">
              <table className="tbl">
                <thead><tr><th className="w-12 text-center">Place</th><th>Team</th><th>Result</th>{comp.kind === 'league' && <th className="text-center">W-L</th>}{comp.prizePool > 0 && <th className="text-right">Prize</th>}{paths.length > 0 && <th>Next</th>}</tr></thead>
                <tbody>
                  {order.map((t, i) => {
                    const team = state.teams[t];
                    const prize = comp.prizePool * (comp.prizeSplit[i] ?? 0);
                    const p = pathFor(i);
                    const rec = comp.kind === 'league' && lastStage ? standings(lastStage, state.fixtures).find((r) => r.teamId === t) : undefined;
                    return (
                      <tr key={t} className={`row ${t === state.userTeamId ? 'bg-gold/10' : ''}`} onClick={() => nav('team', t)}>
                        <td className="text-center font-display font-bold text-lg" style={{ color: i === 0 ? '#f0c674' : i === 1 ? '#cbd5e1' : i <= 3 ? '#d97706' : '#8a97b3' }}>{ord(i + 1)}</td>
                        <td><div className="flex items-center gap-2"><TeamLogo team={team} size={24} /><span className="font-semibold">{team?.name}</span><span className="text-[11px] text-dim">{state.leagues[team?.leagueId ?? '']?.name}</span></div></td>
                        <td className="text-muted text-xs">{placementLabel(i + 1, comp)}</td>
                        {comp.kind === 'league' && <td className="text-center font-display font-bold">{rec ? `${rec.w}-${rec.l}` : '—'}</td>}
                        {comp.prizePool > 0 && <td className="text-right font-display font-bold text-gold2">{prize > 0 ? money(prize) : <span className="text-dim">—</span>}</td>}
                        {paths.length > 0 && <td className="text-xs">{p ? <span className="text-accent">{p.target?.short ?? p.label.split('→ ')[1]}</span> : <span className="text-dim">—</span>}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <Panel title="Prize distribution" bodyClass="p-0" right={<span className="text-xs text-muted">{comp.prizePool ? money(comp.prizePool) : 'No prize pool'}</span>}>
            {comp.prizePool > 0 ? (
              <table className="tbl">
                <thead><tr><th className="w-14 text-center">Place</th><th>Share</th><th className="text-right">Prize</th><th>Qualification</th></tr></thead>
                <tbody>
                  {comp.prizeSplit.map((s, i) => {
                    const p = pathFor(i);
                    return (
                      <tr key={i}>
                        <td className="text-center font-display font-bold">{ord(i + 1)}</td>
                        <td><div className="flex items-center gap-2"><div className="h-1.5 rounded-full bg-gold/70" style={{ width: `${Math.max(4, s * 260)}px` }} /><span className="text-xs text-muted">{(s * 100).toFixed(s < 0.02 ? 2 : 1)}%</span></div></td>
                        <td className="text-right font-display font-bold text-gold2">{money(comp.prizePool * s)}</td>
                        <td className="text-xs text-accent">{p?.label ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="p-4 text-sm text-muted">This is a regular-season or qualifying event without a prize pool. Placements determine seeding and qualification{paths.length ? ':' : '.'}{paths.length > 0 && <ul className="mt-2 space-y-1">{paths.map((p, i) => <li key={i} className="text-accent">{p.label}</li>)}</ul>}</div>}
          </Panel>
        )}

        {(recent.length > 0 || upcoming.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Latest results" bodyClass="p-0">{recent.length ? recent.map((f) => <MatchRow key={f.id} state={state} f={f} short />) : <Empty>No results yet.</Empty>}</Panel>
            <Panel title="Up next" bodyClass="p-0">{upcoming.length ? upcoming.map((f) => <MatchRow key={f.id} state={state} f={f} short />) : <Empty>No scheduled matches.</Empty>}</Panel>
          </div>
        )}

        {stats.champs.length > 0 && (
          <Panel title="Champion pick & ban" right={<span className="text-xs text-muted">{stats.draftGames} drafts · avg game {mmss(stats.avgDur)}</span>} bodyClass="p-0">
            <table className="tbl">
              <thead><tr><th>Champion</th><th className="text-center">Picks</th><th className="text-center">Bans</th><th className="text-center">Presence</th><th className="text-center">Win%</th></tr></thead>
              <tbody>
                {stats.champs.map(([cid, c]) => (
                  <tr key={cid} className="row" onClick={() => nav('champions', cid)}>
                    <td><div className="flex items-center gap-2"><ChampIcon id={cid} size={24} /><span className="font-semibold">{gd().championById[cid]?.name ?? cid}</span></div></td>
                    <td className="text-center">{c.p}</td><td className="text-center text-muted">{c.b}</td>
                    <td className="text-center"><div className="flex items-center gap-2 justify-center"><div className="w-16 h-1.5 bg-[#0a1120] rounded-full overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.min(100, ((c.p + c.b) / stats.draftGames) * 100)}%` }} /></div><span className="text-xs w-9 text-right">{pct((c.p + c.b) / stats.draftGames)}</span></div></td>
                    <td className="text-center" style={{ color: c.p ? (c.w / c.p >= 0.5 ? '#22c55e' : '#ef4444') : undefined }}>{c.p ? pct(c.w / c.p) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      <div className="space-y-4 min-w-0">
        <Panel title="Stages">
          <div className="space-y-2">
            {(plan.length ? plan : comp.stages.map((s) => ({ id: s.id, name: s.name, format: s.format, bestOf: s.bestOf, start: s.startDate, end: s.endDate }) as StageSpec)).map((s, i) => {
              const st = comp.stages.find((x) => x.id === s.id);
              return (
                <button key={s.id} className="w-full text-left panel-flat px-3 py-2.5 hover:border-gold flex items-center gap-3" onClick={() => nav('competition', comp.id, s.id)}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-sm" style={{ background: st?.status === 'done' ? '#c8aa6e22' : st?.status === 'active' ? '#22c55e22' : '#1e2a44', color: st?.status === 'done' ? '#c8aa6e' : st?.status === 'active' ? '#22c55e' : '#8a97b3' }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="text-[11px] text-muted">{FORMAT_LABEL[s.format]} · Bo{s.bestOf}{s.finalBestOf && s.finalBestOf !== s.bestOf ? ` (final Bo${s.finalBestOf})` : ''} · {fmtDate(s.start, { month: 'short', day: 'numeric' })} – {fmtDate(s.end, { month: 'short', day: 'numeric' })}</div>
                  </div>
                  <div className="text-right text-[11px] text-muted">{st ? `${st.teams.length} teams` : ''}</div>
                  <StatusChip status={st ? st.status === 'pending' ? 'upcoming' : st.status : 'upcoming'} />
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Field & qualification">
          <div className="text-sm space-y-2">
            <div><span className="text-muted">Entry: </span>{seedRuleText(state, comp)}</div>
            {paths.length > 0 && (
              <div className="space-y-1">
                {paths.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-sm" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                    {p.target ? <button className="hover:underline text-left" onClick={() => nav('competition', p.target!.id)}>{p.label}</button> : <span>{p.label}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {comp.teams.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {[...comp.teams].sort((a, b) => (comp.placements?.[a] ?? 999) - (comp.placements?.[b] ?? 999)).map((t) => {
                const team = state.teams[t];
                const st = teamStatusIn(state, comp, t);
                return (
                  <button key={t} onClick={() => nav('team', t)} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-left hover:border-gold ${t === state.userTeamId ? 'border-gold/60 bg-gold/10' : 'border-line bg-panel'}`}>
                    <TeamLogo team={team} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{team?.name}</div>
                      {st && <div className="text-[10px] truncate" style={{ color: TONE_COLOR[st.tone] }}>{st.text}{st.sub ? ` · ${st.sub}` : ''}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {stats.leaders.length > 0 && (
          <Panel title="Player leaders" bodyClass="p-0">
            <table className="tbl">
              <thead><tr><th>Player</th><th className="text-center">GP</th><th className="text-center">KDA</th><th className="text-center">K/D/A</th><th className="text-center">MVP</th></tr></thead>
              <tbody>
                {stats.leaders.map((l) => {
                  const p = state.players[l.pid];
                  if (!p) return null;
                  return (
                    <tr key={l.pid} className="row" onClick={() => nav('player', l.pid)}>
                      <td><div className="flex items-center gap-2"><Portrait player={p} team={state.teams[l.team]} size={26} /><div className="min-w-0"><div className="font-semibold truncate">{p.handle}</div><div className="text-[10px] text-dim">{state.teams[l.team]?.short}</div></div></div></td>
                      <td className="text-center text-muted">{l.g}</td>
                      <td className="text-center font-display font-bold text-gold2">{((l.k + l.a) / Math.max(1, l.d)).toFixed(2)}</td>
                      <td className="text-center text-xs text-muted">{l.k}/{l.d}/{l.a}</td>
                      <td className="text-center">{l.mvp || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </div>
  );
}

function compStats(state: GameState, comp: Competition) {
  const champs: Record<string, { p: number; b: number; w: number }> = {};
  const players: Record<string, { pid: string; team: string; g: number; k: number; d: number; a: number; mvp: number }> = {};
  let draftGames = 0, games = 0, dur = 0;
  for (const f of compFixtures(state, comp)) {
    for (const g of f.result?.games ?? []) {
      games++; dur += g.duration;
      if (g.picks[0].length) draftGames++;
      g.picks.forEach((side, si) => side.forEach((c) => { if (!c) return; const m = (champs[c] ??= { p: 0, b: 0, w: 0 }); m.p++; if (g.winner === (si === 0 ? g.blue : g.red)) m.w++; }));
      g.bans.forEach((side) => side.forEach((c) => { if (c) (champs[c] ??= { p: 0, b: 0, w: 0 }).b++; }));
      for (const l of g.players ?? []) {
        const m = (players[l.playerId] ??= { pid: l.playerId, team: l.teamId, g: 0, k: 0, d: 0, a: 0, mvp: 0 });
        m.g++; m.k += l.k; m.d += l.d; m.a += l.a; if (g.mvp === l.playerId) m.mvp++;
      }
    }
  }
  const minGames = Math.max(1, Math.min(4, Math.floor(games / 20)));
  const leaders = Object.values(players).filter((p) => p.g >= minGames).sort((a, b) => (b.k + b.a) / Math.max(1, b.d) - (a.k + a.a) / Math.max(1, a.d)).slice(0, 8);
  return {
    draftGames, games, avgDur: games ? dur / games : 0, leaders,
    champs: draftGames ? Object.entries(champs).sort((a, b) => b[1].p + b[1].b - (a[1].p + a[1].b)).slice(0, 12) : [],
  };
}

// ------------------------------------------------------------------ pending stage
function PendingStage({ state, comp, spec }: { state: GameState; comp: Competition; spec: StageSpec }) {
  const plan = stagePlan(comp);
  const idx = plan.findIndex((s) => s.id === spec.id);
  const direct = (comp as Competition & { direct?: Record<string, string[]> }).direct?.[spec.id] ?? [];
  const prev = idx > 0 ? plan[idx - 1] : null;
  const adv = (spec as StageSpec & { advance?: number }).advance;
  return (
    <Panel title={spec.name}>
      <div className="grid md:grid-cols-3 gap-3">
        <Stat label="Format" value={FORMAT_LABEL[spec.format]} sub={`Best of ${spec.bestOf}${spec.finalBestOf && spec.finalBestOf !== spec.bestOf ? ` · final Bo${spec.finalBestOf}` : ''}`} />
        <Stat label="Dates" value={fmtDate(spec.start, { month: 'short', day: 'numeric' })} sub={`until ${fmtDate(spec.end)}`} />
        <Stat label="Entrants" value={idx === 0 ? expectedTeams(state, comp) ?? '?' : (adv ? adv + direct.length : '?')} sub={idx === 0 ? seedRuleText(state, comp) : `from ${prev?.name ?? 'previous stage'}${direct.length ? ` + ${direct.length} seeded` : ''}`} />
      </div>
      <p className="text-sm text-muted mt-4">{FORMAT_DESC[spec.format]}</p>
      {direct.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">Directly seeded</div>
          <div className="flex flex-wrap gap-2">{direct.map((t) => <button key={t} onClick={() => nav('team', t)} className="chip hover:border-gold"><TeamLogo team={state.teams[t]} size={16} />{state.teams[t]?.short}</button>)}</div>
        </div>
      )}
      <div className="text-sm text-dim mt-4">The draw and fixtures are created when the stage begins.</div>
    </Panel>
  );
}

// ------------------------------------------------------------------ stage views
function StageView({ state, comp, stage }: { state: GameState; comp: Competition; stage: Stage }) {
  const fx = stageFixtures(state, stage).filter((f) => !isBye(f));
  const played = fx.filter(isPlayed).length;
  const header = (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted mb-3">
      <StatusChip status={stage.status === 'pending' ? 'upcoming' : stage.status} />
      <span>{FORMAT_LABEL[stage.format]} · Bo{stage.bestOf}</span>
      <span>{fmtDate(stage.startDate, { month: 'short', day: 'numeric' })} – {fmtDate(stage.endDate, { month: 'short', day: 'numeric' })}</span>
      <span>{stage.teams.length} teams</span>
      <span>{played}/{fx.length} series played</span>
      <span className="text-dim hidden lg:inline">{FORMAT_DESC[stage.format]}</span>
    </div>
  );
  let body: ReactNode;
  switch (stage.format) {
    case 'roundRobin': body = <RoundRobinView state={state} comp={comp} stage={stage} />; break;
    case 'groups': body = <GroupsView state={state} comp={comp} stage={stage} />; break;
    case 'gsl': body = <GslView state={state} stage={stage} />; break;
    case 'swiss': body = <SwissView state={state} comp={comp} stage={stage} />; break;
    default: body = <ElimView state={state} stage={stage} />;
  }
  return <div>{header}{body}</div>;
}

function FixturesByDate({ state, fixtures, showLabel }: { state: GameState; fixtures: MatchFixture[]; showLabel?: boolean }) {
  const byDay: [string, MatchFixture[]][] = [];
  for (const f of [...fixtures].sort(byDate)) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === f.date) last[1].push(f); else byDay.push([f.date, [f]]);
  }
  if (!byDay.length) return <Empty>No fixtures.</Empty>;
  return (
    <div>
      {byDay.map(([d, list]) => (
        <div key={d}>
          <div className={`px-3 py-1 text-[11px] uppercase tracking-wider font-bold bg-[#0a1120] border-b hairline ${d === state.date ? 'text-gold' : 'text-muted'}`}>
            {fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}{d === state.date ? ' · Today' : ''}
          </div>
          {list.map((f) => <MatchRow key={f.id} state={state} f={f} showDate={false} showLabel={showLabel} />)}
        </div>
      ))}
    </div>
  );
}

function RoundRobinView({ state, comp, stage }: { state: GameState; comp: Competition; stage: Stage }) {
  const zones = stageZones(state, comp, stage);
  const fx = stageFixtures(state, stage);
  const rounds = [...new Set(fx.map((f) => f.round))].sort((a, b) => a - b);
  const current = fx.filter((f) => !f.result).sort(byDate)[0]?.round ?? rounds[rounds.length - 1] ?? 1;
  const [round, setRound] = useState<number>(current);
  const list = fx.filter((f) => f.round === round);
  const ri = rounds.indexOf(round);
  const span = list.length ? `${fmtDate(list.map((f) => f.date).sort()[0], { month: 'short', day: 'numeric' })}${list.some((f) => f.date !== list[0].date) ? ` – ${fmtDate(list.map((f) => f.date).sort().slice(-1)[0], { month: 'short', day: 'numeric' })}` : ''}` : '';
  return (
    <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4">
      <Panel title="Standings" bodyClass="p-0" right={<span className="text-xs text-muted">{stage.teams.length} teams</span>}>
        <StandingsTable state={state} stage={stage} zones={zones} />
        <ZoneLegend zones={zones} />
      </Panel>
      <Panel title="Fixtures" bodyClass="p-0" right={
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost px-2 py-1" disabled={ri <= 0} onClick={() => setRound(rounds[ri - 1])}>‹</button>
          <select className="input py-1 text-xs" value={round} onChange={(e) => setRound(Number(e.target.value))}>
            {rounds.map((r) => <option key={r} value={r}>Week {r}{r === current && stage.status === 'active' ? ' (current)' : ''}</option>)}
          </select>
          <button className="btn btn-ghost px-2 py-1" disabled={ri >= rounds.length - 1} onClick={() => setRound(rounds[ri + 1])}>›</button>
        </div>
      }>
        <div className="px-3 py-1.5 text-xs text-muted border-b hairline">Week {round} of {rounds.length} · {span}</div>
        <FixturesByDate state={state} fixtures={list} />
      </Panel>
    </div>
  );
}

function GroupsView({ state, comp, stage }: { state: GameState; comp: Competition; stage: Stage }) {
  const groups = Object.keys(stage.groups ?? {}).sort();
  const zonesAll = stageZones(state, comp, stage);
  const perGroup = zonesAll.length && groups.length ? zonesAll.map((z) => ({ ...z, count: Math.max(1, Math.round(z.count / groups.length)), from: Math.round(z.from / groups.length) })) : [];
  const fx = stageFixtures(state, stage);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {groups.map((g) => (
        <Panel key={g} title={`Group ${g}`} bodyClass="p-0">
          <StandingsTable state={state} stage={stage} group={g} zones={perGroup} compact />
          <div className="border-t hairline max-h-72 overflow-auto"><FixturesByDate state={state} fixtures={fx.filter((f) => f.group === g)} /></div>
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ bracket canvas
const CH = 58;
interface BNode { f: MatchFixture; x: number; y: number }
interface BHead { x: number; y: number; title: string; sub: string }
interface BLink { from: string; to: string; slot: 'A' | 'B'; dashed?: boolean }
interface BLayout { nodes: BNode[]; heads: BHead[]; titles: { y: number; text: string }[]; links: BLink[]; width: number; height: number; cw: number; gapX: number }

const mostCommon = (xs: string[]) => {
  const c: Record<string, number> = {};
  for (const x of xs) c[x] = (c[x] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};
const colSub = (col: MatchFixture[]) => {
  const ds = col.map((f) => f.date).sort();
  const d0 = fmtDate(ds[0], { month: 'short', day: 'numeric' }), d1 = fmtDate(ds[ds.length - 1], { month: 'short', day: 'numeric' });
  return `${d0}${d1 !== d0 ? `–${d1.replace(/^\w+ /, '')}` : ''} · Bo${col[0].bestOf}`;
};

function layoutElim(state: GameState, stage: Stage, cw = 200, gapX = 48): BLayout | null {
  const GAPY = 14, HEAD = 36, TITLE = 26;
  const fx = stageFixtures(state, stage);
  if (!fx.length) return null;
  const isDE = stage.format === 'doubleElim';
  const sectionOf = (f: MatchFixture) => (!isDE ? 'main' : /^Lower/i.test(f.label ?? '') ? 'lower' : /^Grand Final/i.test(f.label ?? '') ? 'final' : 'upper');
  const nodes = new Map<string, BNode>();
  const heads: BHead[] = [];
  const titles: { y: number; text: string }[] = [];
  let top = 0, maxCols = 0;
  for (const sec of isDE ? ['upper', 'lower'] : ['main']) {
    const sf = fx.filter((f) => sectionOf(f) === sec);
    if (!sf.length) continue;
    const rounds = [...new Set(sf.map((f) => f.round))].sort((a, b) => a - b);
    maxCols = Math.max(maxCols, rounds.length);
    if (isDE) titles.push({ y: top, text: sec === 'upper' ? 'Upper bracket' : 'Lower bracket' });
    const y0 = top + (isDE ? TITLE : 0) + HEAD;
    const local = new Map<string, number>();
    rounds.forEach((r, ci) => {
      const col = sf.filter((f) => f.round === r);
      const want = col.map((f, i) => {
        const fd = sf.filter((g) => g.feeds?.winnerTo?.[0] === f.id && local.has(g.id));
        return { f, i, y: fd.length ? fd.reduce((s, g) => s + local.get(g.id)!, 0) / fd.length : NaN };
      });
      want.sort((a, b) => (isNaN(a.y) ? 1e9 + a.i : a.y) - (isNaN(b.y) ? 1e9 + b.i : b.y));
      let prev = -Infinity;
      for (const w of want) {
        let y = isNaN(w.y) ? (prev === -Infinity ? 0 : prev + CH + GAPY) : w.y;
        if (prev !== -Infinity) y = Math.max(y, prev + CH + GAPY);
        local.set(w.f.id, y);
        prev = y;
      }
      const x = ci * (cw + gapX);
      heads.push({ x, y: y0 - HEAD, title: mostCommon(col.map((f) => cleanLabel(f.label) ?? `Round ${r}`)), sub: colSub(col) });
      for (const f of col) nodes.set(f.id, { f, x, y: y0 + local.get(f.id)! });
    });
    top = Math.max(...sf.map((f) => nodes.get(f.id)!.y)) + CH + 34;
  }
  const finals = fx.filter((f) => sectionOf(f) === 'final');
  if (finals.length) {
    const x = maxCols * (cw + gapX);
    finals.forEach((f, i) => {
      const fd = fx.filter((g) => g.feeds?.winnerTo?.[0] === f.id && nodes.has(g.id));
      const y = (fd.length ? fd.reduce((s, g) => s + nodes.get(g.id)!.y, 0) / fd.length : HEAD) + i * (CH + GAPY);
      nodes.set(f.id, { f, x, y });
      heads.push({ x, y: y - HEAD, title: cleanLabel(f.label) ?? 'Final', sub: colSub([f]) });
    });
    maxCols++;
  }
  const links: BLink[] = [];
  for (const n of nodes.values()) {
    const to = n.f.feeds?.winnerTo;
    if (to && nodes.has(to[0])) links.push({ from: n.f.id, to: to[0], slot: to[1] });
  }
  const all = [...nodes.values()];
  return { nodes: all, heads, titles, links, width: maxCols * (cw + gapX) - gapX, height: Math.max(...all.map((n) => n.y)) + CH + 6, cw, gapX };
}

function slotHints(state: GameState, fixtures: MatchFixture[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of fixtures) {
    const who = g.teamA && g.teamB ? `${state.teams[g.teamA]?.short ?? '?'}/${state.teams[g.teamB]?.short ?? '?'}` : cleanLabel(g.label) ?? `R${g.round}`;
    if (g.feeds?.winnerTo) out[g.feeds.winnerTo.join('|')] = `Winner ${who}`;
    if (g.feeds?.loserTo) out[g.feeds.loserTo.join('|')] = `Loser ${who}`;
  }
  return out;
}

function MatchCard({ state, f, x, y, w, hints }: { state: GameState; f: MatchFixture; x: number; y: number; w: number; hints: Record<string, string> }) {
  const played = isPlayed(f), bye = isBye(f);
  const user = state.userTeamId;
  const clickable = !!(f.teamA && f.teamB) && !bye;
  const hasUser = involves(f, user);
  const rows: ['A' | 'B', string | null, number | undefined][] = [['A', f.teamA, f.result?.scoreA], ['B', f.teamB, f.result?.scoreB]];
  return (
    <div onClick={clickable ? () => nav('fixture', f.id) : undefined} title={cleanLabel(f.label)}
      className={`absolute rounded-md border overflow-hidden bg-[#0b1324] transition ${clickable ? 'cursor-pointer hover:border-gold' : ''} ${hasUser ? 'border-gold/70 shadow-[0_0_0_1px_rgba(200,170,110,0.25)]' : 'border-line2'} ${bye ? 'opacity-50' : ''}`}
      style={{ left: x, top: y, width: w, height: CH }}>
      {rows.map(([slot, tid, score], i) => {
        const team = tid ? state.teams[tid] : null;
        const won = played && f.result!.winner === tid, lost = played && f.result!.loser === tid;
        return (
          <div key={slot} className={`flex items-center gap-2 px-2 h-7 ${i === 0 ? 'border-b border-line' : ''} ${tid === user ? 'bg-gold/10' : ''}`}>
            {team ? <TeamLogo team={team} size={18} className={lost ? 'opacity-50' : ''} /> : <div className="w-[18px] h-[18px] rounded bg-[#16213a] shrink-0" />}
            {team ? (
              <button className={`flex-1 text-left truncate text-[13px] hover:underline ${won ? 'font-bold text-text' : lost ? 'text-dim' : 'text-muted'} ${tid === user ? 'text-gold2' : ''}`} onClick={(e) => { e.stopPropagation(); nav('team', team.id); }}>{team.short}</button>
            ) : (
              <span className="flex-1 truncate text-[11px] text-dim italic">{bye && !tid ? 'BYE' : hints[`${f.id}|${slot}`] ?? 'TBD'}</span>
            )}
            <span className={`font-display font-bold text-[15px] w-4 text-right ${won ? 'text-gold' : 'text-dim'}`}>{played ? score : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function BracketCanvas({ state, layout, hints }: { state: GameState; layout: BLayout; hints: Record<string, string> }) {
  const { nodes, heads, titles, links, width, height, cw, gapX } = layout;
  const pos = new Map(nodes.map((n) => [n.f.id, n]));
  const user = state.userTeamId;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width, height, minWidth: width }}>
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
          {links.map((l, i) => {
            const a = pos.get(l.from), b = pos.get(l.to);
            if (!a || !b) return null;
            const x1 = a.x + cw, y1 = a.y + CH / 2, x2 = b.x, y2 = b.y + (l.slot === 'A' ? 15 : 43);
            const xm = x2 - gapX / 2;
            const done = isPlayed(a.f);
            const mine = done && a.f.result!.winner === user;
            return <path key={i} d={`M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`} fill="none" stroke={mine ? '#c8aa6e' : done ? '#4b5d85' : '#24324f'} strokeWidth={mine ? 2 : 1.5} strokeDasharray={l.dashed ? '4 4' : undefined} />;
          })}
        </svg>
        {titles.map((t, i) => (
          <div key={i} className="absolute left-0 right-0 flex items-center gap-3" style={{ top: t.y }}>
            <span className="text-xs uppercase tracking-widest font-bold text-gold2 whitespace-nowrap">{t.text}</span>
            <span className="flex-1 border-t hairline" />
          </div>
        ))}
        {heads.map((h, i) => (
          <div key={i} className="absolute" style={{ left: h.x, top: h.y, width: cw }}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted truncate">{h.title}</div>
            <div className="text-[10px] text-dim">{h.sub}</div>
          </div>
        ))}
        {nodes.map((n) => <MatchCard key={n.f.id} state={state} f={n.f} x={n.x} y={n.y} w={cw} hints={hints} />)}
      </div>
    </div>
  );
}

function ElimView({ state, stage }: { state: GameState; stage: Stage }) {
  const wide = stage.format === 'doubleElim' && stage.teams.length > 6;
  const layout = layoutElim(state, stage, wide ? 182 : 200, wide ? 38 : 48);
  const fx = stageFixtures(state, stage);
  const hints = slotHints(state, fx);
  const alive = aliveTeams(state, stage);
  const champ = fx.find((f) => isPlayed(f) && !f.feeds?.winnerTo)?.result?.winner;
  return (
    <div className="space-y-4">
      <Panel title="Bracket" right={<span className="text-xs text-muted">{champ ? <>Winner: <span className="text-gold2 font-semibold">{state.teams[champ]?.name}</span></> : `${alive.length} of ${stage.teams.length} teams alive`}</span>}>
        {layout ? <BracketCanvas state={state} layout={layout} hints={hints} /> : <Empty>The bracket has not been drawn yet.</Empty>}
      </Panel>
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Panel title="Match schedule" bodyClass="p-0"><FixturesByDate state={state} fixtures={fx.filter((f) => !isBye(f))} showLabel /></Panel>
        <Panel title="Seeding" bodyClass="p-0">
          {stage.teams.map((t, i) => {
            const team = state.teams[t];
            const out = !alive.includes(t);
            return (
              <button key={t} onClick={() => nav('team', t)} className={`w-full flex items-center gap-2 px-3 py-1.5 border-b border-[#141e33] last:border-0 hover:bg-[#111a2e] text-left ${t === state.userTeamId ? 'bg-gold/10' : ''}`}>
                <span className="w-6 font-display font-bold text-muted text-center">{i + 1}</span>
                <TeamLogo team={team} size={20} />
                <span className={`flex-1 truncate text-sm ${out ? 'text-dim line-through decoration-1' : 'font-semibold'}`}>{team?.name}</span>
                {t === champ ? <Pill color="#f0c674">Champion</Pill> : out ? <span className="text-[10px] text-dim">out</span> : <span className="text-[10px] text-accent">alive</span>}
              </button>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ GSL
function layoutGsl(state: GameState, stage: Stage, group: string, cw = 168, gapX = 40): BLayout | null {
  const gf = stageFixtures(state, stage).filter((f) => f.group === group);
  if (!gf.length) return null;
  const HEAD = 36, row = CH + 18;
  const L = (f: MatchFixture) => cleanLabel(f.label) ?? '';
  const opening = gf.filter((f) => L(f).startsWith('Opening'));
  const win = gf.find((f) => L(f).startsWith("Winners'")), elim = gf.find((f) => L(f).startsWith('Elimination')), dec = gf.find((f) => L(f).startsWith('Decider'));
  const nodes: BNode[] = [];
  opening.forEach((f, i) => nodes.push({ f, x: 0, y: HEAD + i * row }));
  if (win) nodes.push({ f: win, x: cw + gapX, y: HEAD });
  if (elim) nodes.push({ f: elim, x: cw + gapX, y: HEAD + row });
  if (dec) nodes.push({ f: dec, x: 2 * (cw + gapX), y: HEAD + row / 2 });
  const heads: BHead[] = [
    { x: 0, y: 0, title: 'Opening', sub: opening[0] ? colSub(opening) : '' },
    { x: cw + gapX, y: 0, title: "Winners' / Elimination", sub: win ? colSub([win]) : '' },
    { x: 2 * (cw + gapX), y: 0, title: 'Decider', sub: dec ? colSub([dec]) : '' },
  ];
  const ids = new Set(nodes.map((n) => n.f.id));
  const links: BLink[] = [];
  for (const n of nodes) {
    if (n.f.feeds?.winnerTo && ids.has(n.f.feeds.winnerTo[0])) links.push({ from: n.f.id, to: n.f.feeds.winnerTo[0], slot: n.f.feeds.winnerTo[1] });
    if (n.f.feeds?.loserTo && ids.has(n.f.feeds.loserTo[0])) links.push({ from: n.f.id, to: n.f.feeds.loserTo[0], slot: n.f.feeds.loserTo[1], dashed: true });
  }
  return { nodes, heads, titles: [], links, width: 3 * cw + 2 * gapX, height: HEAD + 2 * row, cw, gapX };
}

function GslView({ state, stage }: { state: GameState; stage: Stage }) {
  const groups = Object.keys(stage.groups ?? {}).sort();
  const fx = stageFixtures(state, stage);
  const hints = slotHints(state, fx);
  return (
    <div className="grid 2xl:grid-cols-2 gap-4">
      {groups.map((g) => {
        const layout = layoutGsl(state, stage, g);
        const gf = fx.filter((f) => f.group === g);
        const win = gf.find((f) => f.label === "Winners' match"), dec = gf.find((f) => f.label === 'Decider'), elim = gf.find((f) => f.label === 'Elimination match');
        const places: [string, string | undefined, boolean][] = [
          ['1st', win?.result?.winner, true], ['2nd', dec?.result?.winner, true], ['3rd', dec?.result?.loser, false], ['4th', elim?.result?.loser, false],
        ];
        return (
          <Panel key={g} title={`Group ${g}`} right={<div className="flex -space-x-1">{(stage.groups?.[g] ?? []).map((t) => <TeamLogo key={t} team={state.teams[t]} size={20} />)}</div>}>
            {layout ? <BracketCanvas state={state} layout={layout} hints={hints} /> : <Empty>No matches.</Empty>}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {places.map(([label, t, adv]) => (
                <div key={label} className={`panel-flat px-2 py-1.5 ${t === state.userTeamId ? 'border-gold/60' : ''}`}>
                  <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: adv ? '#22c55e' : '#ef4444' }}>{label} · {adv ? 'advance' : 'out'}</div>
                  {t ? <button className="flex items-center gap-1.5 mt-0.5 hover:underline" onClick={() => nav('team', t)}><TeamLogo team={state.teams[t]} size={16} /><span className="text-sm font-semibold truncate">{state.teams[t]?.short}</span></button> : <div className="text-xs text-dim mt-0.5">TBD</div>}
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Swiss
function SwissView({ state, comp, stage }: { state: GameState; comp: Competition; stage: Stage }) {
  const fx = stageFixtures(state, stage).sort(byDate);
  const rounds = [...new Set(fx.map((f) => f.round))].sort((a, b) => a - b);
  const rec: Record<string, { w: number; l: number }> = Object.fromEntries(stage.teams.map((t) => [t, { w: 0, l: 0 }]));
  const key: Record<string, string> = {};
  for (const r of rounds) {
    const rf = fx.filter((f) => f.round === r);
    for (const f of rf) { const a = f.teamA ? rec[f.teamA] : undefined; key[f.id] = a ? `${a.w}-${a.l}` : '?'; }
    for (const f of rf) if (isPlayed(f)) { if (rec[f.result!.winner]) rec[f.result!.winner].w++; if (rec[f.result!.loser]) rec[f.result!.loser].l++; }
  }
  const total = Math.max(stage.rounds ?? 5, rounds.length);
  const teams = [...stage.teams].sort((a, b) => rec[b].w - rec[a].w || rec[a].l - rec[b].l);
  const status = (t: string) => (rec[t].w >= 3 ? 'q' : rec[t].l >= 3 ? 'e' : 'a');
  const zones = stageZones(state, comp, stage);
  return (
    <div className="space-y-4">
      <Panel title="Swiss rounds" bodyClass="p-3">
        <div className="overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${total}, minmax(230px, 1fr))` }}>
            {Array.from({ length: total }, (_, i) => i + 1).map((r) => {
              const rf = fx.filter((f) => f.round === r);
              const buckets: Record<string, MatchFixture[]> = {};
              for (const f of rf) (buckets[key[f.id]] ??= []).push(f);
              const keys = Object.keys(buckets).sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]) || Number(a.split('-')[1]) - Number(b.split('-')[1]));
              return (
                <div key={r} className="space-y-2">
                  <div className="text-xs uppercase tracking-wider font-bold text-muted">Round {r}{rf[0] ? <span className="text-dim font-normal normal-case"> · {fmtDate(rf[0].date, { month: 'short', day: 'numeric' })}</span> : ''}</div>
                  {!rf.length && <div className="panel-flat px-3 py-6 text-center text-xs text-dim">Pairings are drawn after round {r - 1}</div>}
                  {keys.map((k) => {
                    const [w, l] = k.split('-').map(Number);
                    const tag = w === 2 && l === 2 ? 'Decider' : w === 2 ? 'Qualification' : l === 2 ? 'Elimination' : '';
                    return (
                      <div key={k} className="panel-flat overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1 bg-[#0a1120] border-b hairline">
                          <span className="font-display font-bold">{k}</span>
                          <span className="text-[10px] text-muted">{tag && <span className={w === 2 ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{tag} · </span>}Bo{buckets[k][0].bestOf}</span>
                        </div>
                        {buckets[k].map((f) => <MatchRow key={f.id} state={state} f={f} showDate={false} short />)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      <Panel title="Records" bodyClass="p-0" right={<span className="text-xs text-muted">{teams.filter((t) => status(t) === 'q').length} qualified · {teams.filter((t) => status(t) === 'e').length} eliminated</span>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {teams.map((t) => {
            const s = status(t);
            return (
              <button key={t} onClick={() => nav('team', t)} className={`flex items-center gap-2 px-3 py-2 border-b border-r border-[#141e33] hover:bg-[#111a2e] text-left ${t === state.userTeamId ? 'bg-gold/10' : ''}`}>
                <TeamLogo team={state.teams[t]} size={22} />
                <span className={`flex-1 truncate text-sm ${s === 'e' ? 'text-dim' : 'font-semibold'}`}>{state.teams[t]?.name}</span>
                <span className="font-display font-bold" style={{ color: s === 'q' ? '#22c55e' : s === 'e' ? '#ef4444' : '#e6ebf5' }}>{rec[t].w}-{rec[t].l}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-2 text-[11px] text-muted border-t hairline">
          <span><span className="text-[#22c55e] font-semibold">3 wins</span> qualify{zones[0] ? ` (${zones[0].label.toLowerCase()})` : ''}</span>
          <span><span className="text-[#ef4444] font-semibold">3 losses</span> eliminate</span>
          <span>Decisive matches (2 wins or 2 losses) are best of 3</span>
        </div>
      </Panel>
    </div>
  );
}
