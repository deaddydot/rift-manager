// Team profile: identity & reputation, roster, staff, competitions & standings, results,
// honours & history, sponsors and facilities. Salaries are only shown for the user's team.
import { useMemo } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Team, Player, Staff, MatchFixture, FacilityKey, StaffRole } from '../../engine/types';
import { ROLES, ROLE_LABEL, REGION_LABEL, FACILITY_INFO } from '../../engine/types';
import { Panel, Stat, TeamLogo, Portrait, Avatar, RoleIcon, Rating, Pill, Empty, Sparkline, money, num, fmtDate, ageOf, flag, pct, StaffPortrait } from '../components/kit';
import { overall } from '../../engine/setup';
import {
  teamResults, teamFixtures, seasonRecord, seasonComps, teamStatusIn, outcome, scoreFor, opponentOf, cleanLabel, lineupRating, willEnter, compColor, TONE_COLOR,
} from '../../engine/management/fixtureinfo';
import { CompEmblem, StatusChip, StandingsTable, FormDots } from './CompetitionPage';

const STAFF_LABEL: Record<StaffRole, string> = { headCoach: 'Head Coach', coach: 'Coach', analyst: 'Analyst', psychologist: 'Psychologist', scout: 'Scout' };
const STAFF_ORDER: StaffRole[] = ['headCoach', 'coach', 'analyst', 'psychologist', 'scout'];

export default function TeamPage({ id }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const team = id ? state.teams[id] : undefined;
  if (!team) return <Panel title="Team"><Empty>Team not found.</Empty></Panel>;
  return <TeamView state={state} team={team} />;
}

function TeamView({ state, team }: { state: GameState; team: Team }) {
  const v = useStore((s) => s.v);
  const isUser = team.id === state.userTeamId;
  const league = state.leagues[team.leagueId];
  const results = useMemo(() => teamResults(state, team.id), [v, team.id]);
  const upcoming = useMemo(() => teamFixtures(state, team.id).filter((f) => !f.result && f.teamA && f.teamB), [v, team.id]);
  const rec = seasonRecord(state, team.id, state.season);
  const seasonRes = results.filter((f) => state.competitions[f.competitionId]?.season === state.season).slice().reverse();
  const trend = seasonRes.reduce<number[]>((acc, f) => [...acc, (acc[acc.length - 1] ?? 0) + (outcome(f, team.id) === 'W' ? 1 : -1)], [0]);
  const form = results.slice(0, 5).reverse().map((f) => outcome(f, team.id));
  const lr = lineupRating(state, team);
  const real = team.realRecord;
  const parent = team.parentTeamId ? state.teams[team.parentTeamId] : null;
  const academy = team.academyTeamId ? state.teams[team.academyTeamId] : null;
  const [c1, c2] = team.colors;
  const leagueComps = seasonComps(state).filter((c) => c.leagueId === team.leagueId && c.tier > 0).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const leagueComp = leagueComps.find((c) => c.status === 'active') ?? leagueComps.find((c) => c.status === 'upcoming') ?? leagueComps[leagueComps.length - 1];

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="relative p-5 flex flex-wrap items-center gap-5" style={{ background: `linear-gradient(110deg, ${c1}40, ${c2}10 45%, transparent 75%)` }}>
          <TeamLogo team={team} size={104} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <button className="hover:text-text" onClick={() => nav('database')}>Teams</button><span>/</span>
              <span>{league?.fullName ?? team.leagueId}</span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight flex items-center gap-3">
              {team.name}{team.short !== team.name && <span className="text-xl text-muted font-semibold">{team.short}</span>}
              {isUser && <Pill color="#f0c674">Your club</Pill>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted">
              {leagueComp ? <button className="font-semibold text-text hover:text-gold" onClick={() => nav('competition', leagueComp.id)} title={leagueComp.name}>{league?.name ?? team.leagueId}</button> : <span className="font-semibold text-text">{league?.name ?? team.leagueId}</span>}
              <span>Tier {league?.tier ?? '?'}</span>
              <span>{REGION_LABEL[team.region]}</span>
              {team.country && <span>{flag(team.country)} {team.country}</span>}
              {team.franchise && <Pill color="#0ac8b9">Franchise</Pill>}
              {parent && <button className="hover:text-gold" onClick={() => nav('team', parent.id)}>Academy of <span className="text-text">{parent.name}</span></button>}
              {academy && <button className="hover:text-gold" onClick={() => nav('team', academy.id)}>Academy: <span className="text-text">{academy.name}</span></button>}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <FormDots results={form} size={18} />
              {trend.length > 2 && <Sparkline data={trend} width={140} height={26} zero color={c1 === '#f2f2f2' ? '#c8aa6e' : c1} />}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {isUser ? (
              <div className="flex gap-2">
                <button className="btn" onClick={() => nav('squad')}>Squad</button>
                <button className="btn" onClick={() => nav('tactics')}>Tactics</button>
                <button className="btn" onClick={() => nav('finances')}>Finances</button>
              </div>
            ) : (
              <button className="btn btn-gold" onClick={() => nav('transfers')}>Scout / make offer</button>
            )}
            <button className="btn btn-ghost text-xs" onClick={() => nav('schedule')}>{upcoming[0] ? `Next: ${state.teams[opponentOf(upcoming[0], team.id) ?? '']?.short ?? 'TBD'} · ${fmtDate(upcoming[0].date, { month: 'short', day: 'numeric' })}` : 'No upcoming match'}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 p-3 border-t hairline">
          <Stat label="Prestige" value={Math.round(team.prestige)} sub={prestigeLabel(team.prestige)} color={prestigeColor(team.prestige)} />
          <Stat label="Fans" value={num(team.fans)} sub={team.diehard ? `${num(team.diehard)} die-hard` : 'followers'} />
          <Stat label="Hype" value={Math.round(team.hype)} sub={team.hype >= 70 ? 'buzzing' : team.hype >= 45 ? 'steady' : 'quiet'} color={team.hype >= 70 ? '#f97316' : undefined} />
          <Stat label="Chemistry" value={Math.round(team.chemistry)} sub={team.chemistry >= 75 ? 'excellent' : team.chemistry >= 60 ? 'good' : 'needs work'} color={team.chemistry >= 75 ? '#22c55e' : team.chemistry < 50 ? '#ef4444' : undefined} />
          <Stat label={`${state.season} record`} value={`${rec.w}-${rec.l}`} sub={`games ${rec.gw}-${rec.gl}`} />
          <Stat label="Real 2026" value={real ? `${real.wins}-${real.losses}` : '—'} sub={real?.games ? `${pct(real.wins / real.games)} of ${real.games} games` : 'no data'} />
          <Stat label="Titles" value={team.titles.length} sub={team.titles[team.titles.length - 1] ? `last: ${team.titles[team.titles.length - 1].competition}` : 'none yet'} color={team.titles.length ? '#f0c674' : undefined} />
          {isUser ? <Stat label="Balance" value={money(team.balance)} color={team.balance < 0 ? '#ef4444' : '#f0e6d2'} sub={`lineup ${lr.toFixed(1)} OVR`} /> : <Stat label="Lineup" value={lr.toFixed(1)} sub="avg starting OVR" color={undefined} />}
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <RosterTable state={state} team={team} isUser={isUser} />
          <StaffTable state={state} team={team} isUser={isUser} />
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Recent results" bodyClass="p-0" right={<span className="text-xs text-muted">{results.length} played</span>}>
              {results.length ? results.slice(0, 10).map((f) => <ResultRow key={f.id} state={state} team={team} f={f} />) : <Empty>No matches played yet.</Empty>}
            </Panel>
            <Panel title="Upcoming" bodyClass="p-0">
              {upcoming.length ? upcoming.slice(0, 10).map((f) => <ResultRow key={f.id} state={state} team={team} f={f} />) : <Empty>No fixtures scheduled.</Empty>}
            </Panel>
          </div>
        </div>
        <div className="space-y-4 min-w-0">
          <CompetitionsPanel state={state} team={team} />
          <LeagueTable state={state} team={team} />
          <Honours team={team} />
          <SponsorsPanel team={team} isUser={isUser} />
          <FacilitiesPanel team={team} />
        </div>
      </div>
    </div>
  );
}

const prestigeLabel = (p: number) => (p >= 85 ? 'world elite' : p >= 70 ? 'top contender' : p >= 55 ? 'established' : p >= 40 ? 'rising' : 'grassroots');
const prestigeColor = (p: number) => (p >= 85 ? '#f0c674' : p >= 70 ? '#22c55e' : undefined);

// ------------------------------------------------------------------ roster
function RosterTable({ state, team, isUser }: { state: GameState; team: Team; isUser: boolean }) {
  const lineupRole: Record<string, string> = {};
  for (const r of ROLES) { const id = team.lineup[r]; if (id) lineupRole[id] = r; }
  const players = team.roster.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const sorted = [...players].sort((a, b) => {
    const sa = lineupRole[a.id] ? 0 : 1, sb = lineupRole[b.id] ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ra = ROLES.indexOf((lineupRole[a.id] as typeof ROLES[number]) ?? a.role), rb = ROLES.indexOf((lineupRole[b.id] as typeof ROLES[number]) ?? b.role);
    return ra - rb || overall(b.attributes, b.role) - overall(a.attributes, a.role);
  });
  const payroll = players.reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
  const value = players.reduce((s, p) => s + p.value, 0);
  return (
    <Panel title={`Roster · ${players.length} players`} bodyClass="p-0" right={<span className="text-xs text-muted">Squad value {money(value)}{isUser ? ` · payroll ${money(payroll)}/yr` : ''}</span>}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Player</th><th>Role</th><th className="text-center">Age</th><th className="text-center">OVR</th><th className="text-center">Form</th>
              {isUser && <th className="text-center">Morale</th>}
              <th className="text-center">GP</th><th className="text-center">KDA</th><th className="text-right">Value</th><th>Contract</th>{isUser && <th className="text-right">Salary</th>}<th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const ovr = overall(p.attributes, p.role);
              const age = ageOf(p.birthdate, state.date);
              const st = lineupRole[p.id];
              const s = p.season;
              const kda = s.games ? (s.kills + s.assists) / Math.max(1, s.deaths) : null;
              const expiring = p.contract && p.contract.expires.slice(0, 4) === String(state.season);
              return (
                <tr key={p.id} className="row" onClick={() => nav('player', p.id)}>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Portrait player={p} team={team} size={36} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.handle} <span className="text-xs">{flag(p.country)}</span></div>
                        <div className="text-[11px] text-dim truncate">{p.name}{p.traits.length ? ` · ${p.traits.length} trait${p.traits.length > 1 ? 's' : ''}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="flex items-center gap-1.5"><RoleIcon role={p.role} size={14} /><span className="text-xs">{ROLE_LABEL[p.role]}</span></span></td>
                  <td className="text-center text-muted">{age ?? '—'}</td>
                  <td className="text-center"><div className="flex justify-center"><Rating v={ovr} size="sm" /></div></td>
                  <td className="text-center"><FormValue v={p.form} /></td>
                  {isUser && <td className="text-center" style={{ color: p.morale >= 70 ? '#22c55e' : p.morale < 45 ? '#ef4444' : undefined }}>{Math.round(p.morale)}</td>}
                  <td className="text-center text-muted">{s.games || '—'}</td>
                  <td className="text-center font-display font-bold">{kda !== null ? kda.toFixed(1) : <span className="text-dim font-normal">—</span>}</td>
                  <td className="text-right text-muted">{money(p.value)}</td>
                  <td className={`text-xs whitespace-nowrap ${expiring ? 'text-[#f97316]' : 'text-muted'}`}>{p.contract ? fmtDate(p.contract.expires, { month: 'short', year: 'numeric' }) : 'Free agent'}</td>
                  {isUser && <td className="text-right font-display">{p.contract ? money(p.contract.salary) : '—'}</td>}
                  <td>{st ? <Pill color={'#22c55e'}>Starter · {ROLE_LABEL[st as keyof typeof ROLE_LABEL]}</Pill> : <Pill>Sub</Pill>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isUser && <div className="px-4 py-2 text-[11px] text-dim border-t hairline">Click a player to open their profile. Use <button className="text-gold hover:underline" onClick={() => nav('transfers')}>Transfers</button> to scout or bid.</div>}
    </Panel>
  );
}

function FormValue({ v }: { v: number }) {
  const c = v >= 3 ? '#22c55e' : v <= -3 ? '#ef4444' : '#8a97b3';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative w-10 h-1.5 bg-[#0a1120] rounded-full overflow-hidden">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-line2" />
        <span className="absolute top-0 bottom-0" style={{ background: c, left: v >= 0 ? '50%' : `${50 + (v / 10) * 50}%`, width: `${(Math.abs(v) / 10) * 50}%` }} />
      </span>
      <span className="text-xs font-display font-bold w-7 text-right" style={{ color: c }}>{v > 0 ? '+' : ''}{v.toFixed(1)}</span>
    </span>
  );
}

// ------------------------------------------------------------------ staff
function StaffTable({ state, team, isUser }: { state: GameState; team: Team; isUser: boolean }) {
  const staff = team.staff.map((id) => state.staff[id]).filter((s): s is Staff => !!s).sort((a, b) => STAFF_ORDER.indexOf(a.role) - STAFF_ORDER.indexOf(b.role));
  const keys: [keyof Staff['attributes'], string][] = [['tactics', 'TAC'], ['drafting', 'DRF'], ['training', 'TRN'], ['motivation', 'MOT'], ['scouting', 'SCO'], ['development', 'DEV']];
  return (
    <Panel title={`Staff · ${staff.length}`} bodyClass="p-0" right={isUser ? <button className="text-xs text-muted hover:text-gold" onClick={() => nav('staff')}>Manage staff ›</button> : undefined}>
      {!staff.length ? <Empty>No staff on record.</Empty> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th>{keys.map(([, l]) => <th key={l} className="text-center">{l}</th>)}<th>Contract</th>{isUser && <th className="text-right">Salary</th>}</tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <StaffPortrait staff={s} size={30} colors={team.colors} />
                      <div className="min-w-0"><div className="font-semibold truncate">{s.handle} <span className="text-xs">{flag(s.country)}</span></div><div className="text-[11px] text-dim truncate">{s.name}</div></div>
                    </div>
                  </td>
                  <td className="text-xs">{s.role === 'headCoach' ? <span className="text-gold2 font-semibold">{STAFF_LABEL[s.role]}</span> : STAFF_LABEL[s.role]}</td>
                  {keys.map(([k]) => <td key={k} className="text-center"><div className="flex justify-center"><Rating v={s.attributes[k]} size="sm" /></div></td>)}
                  <td className="text-xs text-muted whitespace-nowrap">{s.contract ? fmtDate(s.contract.expires, { month: 'short', year: 'numeric' }) : '—'}</td>
                  {isUser && <td className="text-right font-display">{s.contract ? money(s.contract.salary) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ results
function ResultRow({ state, team, f }: { state: GameState; team: Team; f: MatchFixture }) {
  const opp = opponentOf(f, team.id);
  const ot = opp ? state.teams[opp] : null;
  const r = outcome(f, team.id);
  const s = scoreFor(f, team.id);
  const c = state.competitions[f.competitionId];
  return (
    <button onClick={() => nav('fixture', f.id)} className="w-full grid grid-cols-[46px_24px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 border-b border-[#141e33] last:border-0 text-left hover:bg-[#111a2e]">
      <span className="text-[11px] text-muted">{fmtDate(f.date, { month: 'short', day: 'numeric' })}</span>
      <TeamLogo team={ot} size={22} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate">{ot?.name ?? 'TBD'}</span>
        <span className="block text-[10px] truncate" style={{ color: compColor(c) }}>{c?.short}{cleanLabel(f.label) ? ` · ${cleanLabel(f.label)}` : ''}</span>
      </span>
      {r ? (
        <span className="flex items-center gap-1.5">
          <span className="font-display font-bold">{s![0]}-{s![1]}</span>
          <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-black/80" style={{ background: r === 'W' ? '#22c55e' : '#ef4444' }}>{r}</span>
        </span>
      ) : <span className="text-[11px] text-dim">Bo{f.bestOf}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ competitions & table
function CompetitionsPanel({ state, team }: { state: GameState; team: Team }) {
  const list = seasonComps(state).filter((c) => willEnter(state, c, team.id)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <Panel title={`${state.season} competitions`} bodyClass="p-0">
      {!list.length ? <Empty>No competitions this season.</Empty> : list.map((c) => {
        const st = teamStatusIn(state, c, team.id);
        return (
          <button key={c.id} onClick={() => nav('competition', c.id)} className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-[#141e33] last:border-0 text-left hover:bg-[#111a2e]">
            <CompEmblem comp={c} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{c.name}</div>
              <div className="text-[11px] text-dim">{fmtDate(c.startDate, { month: 'short', day: 'numeric' })} – {fmtDate(c.endDate, { month: 'short', day: 'numeric' })}</div>
            </div>
            <div className="text-right">
              {st ? <div className="text-xs font-semibold" style={{ color: TONE_COLOR[st.tone] }}>{st.text}</div> : <StatusChip status={c.status} />}
              {st?.sub && <div className="text-[10px] text-muted">{st.sub}</div>}
            </div>
          </button>
        );
      })}
    </Panel>
  );
}

function LeagueTable({ state, team }: { state: GameState; team: Team }) {
  const cands = seasonComps(state).filter((c) => c.teams.includes(team.id) && c.stages.some((s) => s.format === 'roundRobin' || s.format === 'groups'));
  const comp = cands.find((c) => c.status === 'active') ?? cands.filter((c) => c.status === 'done').sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (!comp) return null;
  const stage = [...comp.stages].reverse().find((s) => s.format === 'roundRobin' || s.format === 'groups')!;
  const group = stage.format === 'groups' ? Object.entries(stage.groups ?? {}).find(([, ts]) => ts.includes(team.id))?.[0] : undefined;
  return (
    <Panel title={<button className="uppercase hover:text-gold" onClick={() => nav('competition', comp.id, stage.id)}>{comp.short} table{group ? ` · Group ${group}` : ''}</button>} bodyClass="p-0" right={<StatusChip status={comp.status} />}>
      <StandingsTable state={state} stage={stage} group={group} compact highlight={team.id} />
    </Panel>
  );
}

function Honours({ team }: { team: Team }) {
  const hist = [...team.history].sort((a, b) => b.season - a.season || a.placement - b.placement);
  return (
    <Panel title="Honours & history" bodyClass="p-0" right={<span className="text-xs text-muted">{team.titles.length} title{team.titles.length === 1 ? '' : 's'}</span>}>
      {team.titles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5 border-b hairline">
          {[...team.titles].reverse().map((t, i) => <span key={i} className="chip" style={{ color: '#f0c674', borderColor: '#c8aa6e66', background: '#c8aa6e14' }}><Trophy />{t.competition}{t.competition.includes(String(t.season)) ? '' : ` ${t.season}`}</span>)}
        </div>
      )}
      {hist.length ? (
        <div className="max-h-64 overflow-auto">
          <table className="tbl">
            <thead><tr><th>Season</th><th>Competition</th><th>Result</th></tr></thead>
            <tbody>
              {hist.map((h, i) => (
                <tr key={i}>
                  <td className="text-muted">{h.season}</td>
                  <td className="truncate max-w-[180px]">{h.competition}</td>
                  <td className="text-xs font-semibold" style={{ color: h.placement === 1 ? '#f0c674' : h.placement <= 4 ? '#22c55e' : '#8a97b3' }}>{h.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No completed competitions yet in this career.</Empty>}
    </Panel>
  );
}

function Trophy() {
  return <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M5 2h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 11 13.9V16h3v2H6v-2h3v-2.1A5 5 0 0 1 6.4 11H6a4 4 0 0 1-4-4V4h3zm0 4H4v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 16 7V6z" /></svg>;
}

// ------------------------------------------------------------------ sponsors & facilities
function SponsorsPanel({ team, isUser }: { team: Team; isUser: boolean }) {
  const total = team.sponsors.reduce((s, d) => s + d.monthly, 0);
  return (
    <Panel title={`Sponsors · ${team.sponsors.length}`} bodyClass="p-0" right={isUser ? <span className="text-xs text-muted">{money(total)}/mo</span> : undefined}>
      {!team.sponsors.length ? <Empty>No sponsorship deals.</Empty> : team.sponsors.map((d) => (
        <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#141e33] last:border-0">
          <div className="w-8 h-8 rounded-md flex items-center justify-center font-display font-bold text-sm text-white shrink-0" style={{ background: d.logoColor }}>{d.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{d.name}</div>
            <div className="text-[11px] text-dim">{d.category} · tier {d.tier} · until {fmtDate(d.endDate, { month: 'short', year: 'numeric' })}</div>
          </div>
          {isUser && <span className="font-display font-bold text-gold2">{money(d.monthly)}</span>}
        </div>
      ))}
    </Panel>
  );
}

function FacilitiesPanel({ team }: { team: Team }) {
  const keys = Object.keys(FACILITY_INFO) as FacilityKey[];
  const avg = keys.reduce((s, k) => s + (team.facilities[k] ?? 0), 0) / keys.length;
  return (
    <Panel title="Facilities" right={<span className="text-xs text-muted">avg level {avg.toFixed(1)}</span>}>
      <div className="space-y-2">
        {keys.map((k) => {
          const lv = team.facilities[k] ?? 0;
          return (
            <div key={k} className="flex items-center gap-3" title={FACILITY_INFO[k].desc}>
              <span className="text-sm flex-1 truncate">{FACILITY_INFO[k].name}</span>
              <span className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => <span key={i} className="w-5 h-2 rounded-sm" style={{ background: i <= lv ? (lv >= 4 ? '#c8aa6e' : '#0ac8b9') : '#1e2a44' }} />)}
              </span>
              <span className="font-display font-bold w-4 text-right">{lv}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
