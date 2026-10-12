import { useGame, nav } from '../../store/game';
import { Panel, TeamLogo, Portrait, Rating, money, num, fmtDate, Stat, Bar, Pill } from '../components/kit';
import { nextUserFixture } from '../../engine/game';
import { standings } from '../../engine/season/formats';
import { ROLES, ROLE_LABEL } from '../../engine/types';
import { overall } from '../../engine/setup';
import { financeSummary, payrollYearly } from '../../engine/management/finance';
import ClubPulseRow from '../components/FanPulseWidget';

export default function Dashboard() {
  const state = useGame();
  const team = state.teams[state.userTeamId];
  const next = nextUserFixture(state);
  const opp = next ? state.teams[next.teamA === team.id ? next.teamB! : next.teamA!] : null;
  const comp = next ? state.competitions[next.competitionId] : null;
  // active league competition for standings
  const leagueComp = Object.values(state.competitions).filter((c) => c.leagueId === team.leagueId && c.status !== 'upcoming' && c.stages.length && c.stages[0].format === 'roundRobin').sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const table = leagueComp ? standings(leagueComp.stages[0], state.fixtures) : [];
  const recent = Object.values(state.fixtures).filter((f) => f.result && (f.teamA === team.id || f.teamB === team.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const fin = financeSummary(team, 1);
  const payroll = payrollYearly(state, team);
  const intl = Object.values(state.competitions).filter((c) => c.tier === 0 && c.season === state.season).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-4">
      {/* hero */}
      <div className="panel overflow-hidden">
        <div className="p-5 flex items-center gap-6" style={{ background: `linear-gradient(110deg, ${team.colors[0]}40, transparent 55%), url(${import.meta.env.BASE_URL}img/rift.webp) right/420px no-repeat` }}>
          <TeamLogo team={team} size={84} />
          <div className="flex-1">
            <div className="font-display text-4xl font-bold leading-none">{team.name}</div>
            <div className="text-muted mt-1">{state.leagues[team.leagueId]?.fullName} · Prestige {Math.round(team.prestige)} · {num(team.fans)} fans</div>
            <div className="flex gap-2 mt-2">{team.titles.slice(-4).map((t, i) => <Pill key={i} color="#c8aa6e">🏆 {t.competition}</Pill>)}</div>
          </div>
          {next && opp ? (
            <button className="panel-flat p-4 flex items-center gap-4 hover:border-gold transition" onClick={() => nav('match')}>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted">Next match · {fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="font-display text-xl font-bold">vs {opp.name}</div>
                <div className="text-xs text-muted">{comp?.name} · Bo{next.bestOf}{next.label ? ` · ${next.label}` : ''}</div>
              </div>
              <TeamLogo team={opp} size={56} />
            </button>
          ) : (() => {
            const upcoming = Object.values(state.competitions).filter((c) => c.status === 'upcoming' && (c.leagueId === team.leagueId || c.seedRule === `league:${team.leagueId}`)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
            return upcoming ? (
              <button className="panel-flat p-4 text-right hover:border-gold transition" onClick={() => nav('competition', upcoming.id)}>
                <div className="text-[11px] uppercase tracking-wider text-muted">Season starts</div>
                <div className="font-display text-xl font-bold">{upcoming.name}</div>
                <div className="text-xs text-muted">{fmtDate(upcoming.startDate, { weekday: 'short', month: 'short', day: 'numeric' })} · fixtures are drawn when it begins</div>
              </button>
            ) : <div className="text-muted">No scheduled matches.</div>;
          })()}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Balance" value={money(team.balance)} sub={`Net last month ${money(fin.net, true)}`} color={team.balance < 0 ? '#ef4444' : '#f0e6d2'} />
        <Stat label="Payroll" value={money(payroll)} sub="per year (players & staff)" />
        <Stat label="Board confidence" value={`${Math.round(state.board.confidence)}%`} sub={state.board.confidence < 30 ? 'Under pressure' : state.board.confidence > 70 ? 'Very happy' : 'Satisfied'} color={state.board.confidence < 30 ? '#ef4444' : '#22c55e'} />
        <Stat label="Hype" value={Math.round(team.hype)} sub={`Chemistry ${Math.round(team.chemistry)}`} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel title={leagueComp ? leagueComp.name : 'League'} right={leagueComp && <button className="btn btn-ghost text-xs" onClick={() => nav('competition', leagueComp.id)}>Full table →</button>} bodyClass="p-0">
          {table.length ? (
            <table className="tbl">
              <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>Games</th></tr></thead>
              <tbody>{table.map((r, i) => {
                const t = state.teams[r.teamId];
                return (
                  <tr key={r.teamId} className={`row ${r.teamId === team.id ? 'bg-[#1a2540]' : ''}`} onClick={() => nav('team', r.teamId)}>
                    <td className="text-muted w-6">{i + 1}</td>
                    <td><div className="flex items-center gap-2"><TeamLogo team={t} size={20} /><span className={r.teamId === team.id ? 'text-gold2 font-semibold' : ''}>{t?.short}</span></div></td>
                    <td className="font-display font-bold">{r.w}-{r.l}</td>
                    <td className="text-muted">{r.gw}-{r.gl}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div className="p-4 text-sm text-muted">The league season hasn't started yet.</div>}
        </Panel>

        <Panel title="Starting lineup" right={<button className="btn btn-ghost text-xs" onClick={() => nav('squad')}>Squad →</button>}>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const id = team.lineup[r];
              const p = id ? state.players[id] : null;
              return (
                <div key={r} className="flex items-center gap-3">
                  <div className="w-14 text-[11px] uppercase text-muted font-bold">{ROLE_LABEL[r]}</div>
                  {p ? <>
                    <Portrait player={p} team={team} size={34} />
                    <button className="flex-1 text-left font-semibold hover:underline" onClick={() => nav('player', p.id)}>{p.handle}</button>
                    <div className="w-20"><Bar value={p.morale} showValue={false} height={4} color="#38bdf8" /></div>
                    <Rating v={overall(p.attributes, r)} size="sm" />
                  </> : <span className="text-muted text-sm">— empty —</span>}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Inbox" right={<button className="btn btn-ghost text-xs" onClick={() => nav('inbox')}>Open →</button>}>
          <div className="space-y-2">
            {state.inbox.slice(0, 6).map((m) => (
              <button key={m.id} className="w-full text-left" onClick={() => nav('inbox')}>
                <div className={`text-sm truncate ${m.read ? 'text-muted' : 'font-semibold'}`}>{m.subject}</div>
                <div className="text-[11px] text-dim">{m.from} · {fmtDate(m.date, { month: 'short', day: 'numeric' })}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Recent results" bodyClass="p-0">
          {recent.length ? (
            <table className="tbl"><tbody>{recent.map((f) => {
              const o = state.teams[f.teamA === team.id ? f.teamB! : f.teamA!];
              const won = f.result!.winner === team.id;
              const my = f.teamA === team.id ? f.result!.scoreA : f.result!.scoreB, their = f.teamA === team.id ? f.result!.scoreB : f.result!.scoreA;
              return (
                <tr key={f.id} className="row" onClick={() => nav('fixture', f.id)}>
                  <td className="text-muted w-16">{fmtDate(f.date, { month: 'short', day: 'numeric' })}</td>
                  <td><div className="flex items-center gap-2"><TeamLogo team={o} size={20} />{o?.name}</div></td>
                  <td className="font-display font-bold">{my}-{their}</td>
                  <td><span className={`font-bold ${won ? 'text-win' : 'text-loss'}`}>{won ? 'W' : 'L'}</span></td>
                </tr>
              );
            })}</tbody></table>
          ) : <div className="p-4 text-sm text-muted">No matches played yet.</div>}
        </Panel>

        <Panel title="Board objectives">
          <ul className="space-y-2 text-sm">{state.board.objectives.map((o) => <li key={o.id} className="flex gap-2"><span className="text-gold">◆</span>{o.text}</li>)}</ul>
          <div className="mt-3"><Bar value={state.board.confidence} label="Confidence" color={state.board.confidence < 30 ? '#ef4444' : '#22c55e'} /></div>
        </Panel>

        <Panel title="International calendar">
          <div className="space-y-2">
            {intl.map((c) => (
              <button key={c.id} className="w-full flex items-center justify-between text-sm hover:text-gold2" onClick={() => nav('competition', c.id)}>
                <span>{c.name.replace(` ${state.season}`, '')}</span>
                <span className="text-muted text-xs">{c.status === 'done' && c.winner ? <span className="flex items-center gap-1"><TeamLogo team={state.teams[c.winner]} size={16} />{state.teams[c.winner]?.short}</span> : fmtDate(c.startDate, { month: 'short', day: 'numeric' })}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <ClubPulseRow />

      <Panel title="Latest news" right={<button className="btn btn-ghost text-xs" onClick={() => nav('news')}>All news →</button>}>
        <div className="grid grid-cols-3 gap-3">
          {state.news.slice(0, 6).map((n) => (
            <div key={n.id} className="panel-flat p-3">
              <div className="text-[11px] text-dim">{fmtDate(n.date, { month: 'short', day: 'numeric' })} · {n.tags.join(', ')}</div>
              <div className="font-semibold text-sm mt-0.5">{n.headline}</div>
              <div className="text-xs text-muted mt-1 line-clamp-2">{n.body}</div>
            </div>
          ))}
          {!state.news.length && <div className="text-sm text-muted">No news yet — press Continue to start the season.</div>}
        </div>
      </Panel>
    </div>
  );
}
