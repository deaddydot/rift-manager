import { useMemo } from 'react';
import { analysisState, coachView } from '../../engine/management/analysis';
import { destinySide } from '../../engine/season/lore';
import { useGame, useStore, nav } from '../../store/game';
import { useSession, type MatchSession } from './session';
import { Panel, TeamLogo, Portrait, Rating, ChampIcon, ItemIcon, RoleIcon, mmss, fmtDate, money, Pill, Empty } from '../components/kit';
import DraftView from './DraftView';
import LiveMatch from './LiveMatch';
import { newSeries, playNextGame, finishSeries, simulateSeries, draftPicks, isBigMatch } from '../../engine/season/series';
import { draftTeam, simTeam, lineupPlayers, effective } from '../../engine/season/prep';
import { newDraft, runAIDraft } from '../../engine/draft/draft';
import { MatchSim } from '../../engine/sim/engine';
import { processDay, nextUserFixture } from '../../engine/game';
import { RNG } from '../../util/rng';
import { ROLES, ROLE_LABEL, type MatchFixture, type SeriesGame, type Team } from '../../engine/types';
import { overall } from '../../engine/setup';
import { gd } from '../../data/gamedata';

// the AI chat controller runs alongside live matches (off unless enabled in Settings; not in the online build)
if (import.meta.env.VITE_HOSTED !== '1') void import('./aiChat/client');

export default function MatchCenter() {
  const state = useGame();
  const session = useSession((x) => x.s);
  useSession((x) => x.v);
  const fixture = state.pendingMatch ? state.fixtures[state.pendingMatch] : null;

  if (session && session.fixtureId && (!fixture || session.fixtureId === fixture.id)) return <SessionView session={session} />;
  if (!fixture) return <NoMatch />;
  return <PreMatch fixture={fixture} />;
}

function NoMatch() {
  const state = useGame();
  const next = nextUserFixture(state);
  const last = Object.values(state.fixtures).filter((f) => f.result && (f.teamA === state.userTeamId || f.teamB === state.userTeamId)).sort((a, b) => b.date.localeCompare(a.date))[0];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Match Center</h1>
      {next ? (
        <Panel title="Next match">
          <div className="flex items-center gap-4">
            <TeamLogo team={state.teams[next.teamA!]} size={56} />
            <div className="font-display text-2xl font-bold">{state.teams[next.teamA!]?.name} vs {state.teams[next.teamB!]?.name}</div>
            <TeamLogo team={state.teams[next.teamB!]} size={56} />
            <div className="ml-auto text-right text-muted text-sm">{fmtDate(next.date, { weekday: 'long', month: 'long', day: 'numeric' })}<br />{state.competitions[next.competitionId]?.name} · Bo{next.bestOf}</div>
          </div>
          <div className="text-sm text-muted mt-3">Press <b className="text-gold2">Continue</b> in the top bar to advance to match day.</div>
        </Panel>
      ) : <Empty>No upcoming matches scheduled.</Empty>}
      {last && <Panel title="Last result"><button className="btn" onClick={() => nav('fixture', last.id)}>View {state.teams[last.teamA!]?.short} {last.result!.scoreA}–{last.result!.scoreB} {state.teams[last.teamB!]?.short} →</button></Panel>}
    </div>
  );
}

function PreMatch({ fixture }: { fixture: MatchFixture }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const setSession = useSession((x) => x.set);
  const user = state.teams[state.userTeamId];
  const oppId = fixture.teamA === user.id ? fixture.teamB! : fixture.teamA!;
  const opp = state.teams[oppId];
  const comp = state.competitions[fixture.competitionId];
  const h2h = Object.values(state.fixtures).filter((f) => f.result && ((f.teamA === user.id && f.teamB === oppId) || (f.teamB === user.id && f.teamA === oppId)));

  const start = () => {
    const series = newSeries(state, fixture);
    const s: MatchSession = { fixtureId: fixture.id, series, phase: 'draft', gameNo: 1 };
    prepareDraft(state, s);
    setSession(s);
  };
  const quick = () => {
    const rng = new RNG(state.rngState ^ 0x5bd1e995);
    simulateSeries(state, fixture, rng, true);
    state.rngState = rng.state;
    state.pendingMatch = null;
    processDay(state);
    bump();
    nav('fixture', fixture.id);
  };

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="text-center text-xs uppercase tracking-widest text-muted">{comp?.name} · {fixture.label ?? (comp?.stages.find((s) => s.id === fixture.stageId)?.name)} · Best of {fixture.bestOf} · {isBigMatch(state, fixture) ? 'Big match' : 'Regular match'}</div>
        <div className="flex items-center justify-center gap-10 mt-3">
          <TeamBlock team={state.teams[fixture.teamA!]} />
          <div className="font-display text-4xl font-bold text-dim">VS</div>
          <TeamBlock team={state.teams[fixture.teamB!]} />
        </div>
        <div className="flex justify-center gap-3 mt-5">
          <button className="btn btn-gold px-6 py-3 text-base" onClick={start}>Play series — draft & watch</button>
          <button className="btn px-6 py-3 text-base" onClick={quick}>Simulate series</button>
        </div>
        {h2h.length > 0 && <div className="text-center text-xs text-muted mt-3">Head-to-head this season: {h2h.map((f) => `${state.teams[f.teamA!].short} ${f.result!.scoreA}-${f.result!.scoreB} ${state.teams[f.teamB!].short}`).join(' · ')}</div>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Lineup team={user} title="Your lineup" />
        <Lineup team={opp} title={`${opp.name} — scouting report`} scouting />
      </div>
    </div>
  );
}

function TeamBlock({ team }: { team: Team }) {
  const state = useGame();
  const lp = lineupPlayers(state, team);
  const str = Math.round(ROLES.reduce((s, r) => s + overall(effective(state, lp[r], team, r), r), 0) / 5);
  return (
    <div className="flex flex-col items-center gap-2 w-64">
      <TeamLogo team={team} size={84} />
      <div className="font-display text-2xl font-bold text-center">{team.name}</div>
      <div className="flex items-center gap-2"><Rating v={str} /><span className="text-xs text-muted">lineup strength</span></div>
    </div>
  );
}

function Lineup({ team, title, scouting }: { team: Team; title: string; scouting?: boolean }) {
  const state = useGame();
  const lp = lineupPlayers(state, team);
  return (
    <Panel title={title}>
      <div className="space-y-2">
        {ROLES.map((r) => {
          const p = lp[r];
          const top = Object.entries(p.champions).sort((a, b) => b[1] - a[1]).slice(0, 5);
          return (
            <div key={r} className="flex items-center gap-3">
              <RoleIcon role={r} />
              <Portrait player={p} team={team} size={38} />
              <button className="w-28 text-left font-semibold truncate hover:underline" onClick={() => nav('player', p.id)}>{p.handle}</button>
              <Rating v={overall(effective(state, p, team, r), r)} size="sm" />
              <div className="flex gap-1 ml-auto">{top.map(([c, m]) => <ChampIcon key={c} id={c} size={26} title={`${gd().championById[c]?.name} (${Math.round(m)})`} />)}</div>
            </div>
          );
        })}
      </div>
      {scouting && <div className="text-[11px] text-dim mt-2">Comfort champions shown — consider banning them in the draft.</div>}
    </Panel>
  );
}

function prepareDraft(state: ReturnType<typeof useGame>, s: MatchSession) {
  const f = state.fixtures[s.fixtureId];
  const blueId = s.series.blueNext, redId = blueId === f.teamA ? f.teamB! : f.teamA!;
  s.userSide = blueId === state.userTeamId ? 0 : 1;
  s.draft = newDraft(draftTeam(state, state.teams[blueId]), draftTeam(state, state.teams[redId]), f.fearless === false ? [] : [...s.series.locked]);
  s.sim = undefined;
  s.phase = 'draft';
}

function SessionView({ session }: { session: MatchSession }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const setSession = useSession((x) => x.set);
  const touch = useSession((x) => x.bump);
  const f = state.fixtures[session.fixtureId];
  const blueId = session.draft ? session.draft.teams[0].teamId : session.series.blueNext;
  const redId = session.draft ? session.draft.teams[1].teamId : (blueId === f.teamA ? f.teamB! : f.teamA!);
  const teams: [Team, Team] = [state.teams[blueId], state.teams[redId]];
  const winsA = session.series.games.filter((g) => g.winner === f.teamA).length, winsB = session.series.games.filter((g) => g.winner === f.teamB).length;

  const startGame = () => {
    const d = session.draft!;
    const big = isBigMatch(state, f);
    session.sim = new MatchSim(simTeam(state, teams[0], draftPicks(d, 0)), simTeam(state, teams[1], draftPicks(d, 1)), { seed: (state.rngState ^ (session.gameNo * 2654435761)) >>> 0, bigMatch: big, debug: true, analyze: true, destiny: destinySide(state, teams[0], teams[1]) ?? undefined });
    session.phase = 'live';
    touch();
  };
  const finishGame = () => {
    const rng = new RNG(state.rngState);
    const game = playNextGame(state, session.series, rng, false, { draft: session.draft!, result: session.sim!.result() });
    state.rngState = rng.state;
    session.lastGame = game;
    session.phase = 'post';
    bump(); touch();
  };
  const nextGame = () => {
    if (session.series.done) {
      finishSeries(state, session.series);
      state.pendingMatch = null;
      processDay(state);
      session.phase = 'done';
      bump(); touch();
      return;
    }
    session.gameNo++;
    prepareDraft(state, session);
    touch();
  };
  const simRest = () => {
    const rng = new RNG(state.rngState);
    // the game on screen counts: a draft in progress is finished as drafted so far, a live game
    // plays on from where it is — only the games after it are simulated from scratch
    if (session.phase === 'draft' && session.draft && !session.series.done) {
      runAIDraft(session.draft, rng, state.championPower);
      startGame();
    }
    if (session.phase === 'live' && session.sim && !session.series.done) {
      session.sim.runToEnd();
      playNextGame(state, session.series, rng, false, { draft: session.draft!, result: session.sim.result() });
    }
    while (!session.series.done) playNextGame(state, session.series, rng, true);
    state.rngState = rng.state;
    finishSeries(state, session.series);
    state.pendingMatch = null;
    processDay(state);
    session.phase = 'done';
    bump(); touch();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <TeamLogo team={state.teams[f.teamA!]} size={32} />
        <div className="font-display text-xl font-bold">{state.teams[f.teamA!].short} {winsA} – {winsB} {state.teams[f.teamB!].short}</div>
        <TeamLogo team={state.teams[f.teamB!]} size={32} />
        <div className="text-sm text-muted">{state.competitions[f.competitionId]?.name} · Bo{f.bestOf} · Game {session.gameNo}</div>
        <div className="flex-1" />
        {session.phase !== 'done' && <button className="btn" onClick={simRest}>Simulate rest of series</button>}
      </div>
      {session.phase === 'draft' && session.draft && <DraftView key={session.gameNo} draft={session.draft} userSide={session.userSide!} gameNo={session.gameNo} onDone={startGame} />}
      {session.phase === 'live' && session.sim && <LiveMatch key={session.gameNo} sim={session.sim} teams={teams} userSide={session.userSide!} onFinished={finishGame} />}
      {session.phase === 'post' && session.lastGame && <PostGame game={session.lastGame} onNext={nextGame} seriesDone={session.series.done} />}
      {session.phase === 'done' && (
        <Panel title="Series complete">
          <div className="flex items-center gap-6">
            <TeamLogo team={state.teams[f.result!.winner]} size={72} />
            <div>
              <div className="font-display text-3xl font-bold gold-text">{state.teams[f.result!.winner].name} win {Math.max(f.result!.scoreA, f.result!.scoreB)}–{Math.min(f.result!.scoreA, f.result!.scoreB)}</div>
              <div className="text-muted">{f.result!.winner === state.userTeamId ? 'Great result for the team.' : 'A tough loss — review the games and adjust.'}</div>
            </div>
            <div className="ml-auto flex gap-2">
              <button className="btn" onClick={() => nav('fixture', f.id)}>Full series stats</button>
              <button className="btn btn-gold" onClick={() => { setSession(null); nav('home'); }}>Back to club</button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** The analyst's first word right after a game (the full breakdown lives on the Game analysis page). */
function QuickTake({ game }: { game: SeriesGame }) {
  const state = useGame();
  const r = analysisState(state).reports.find((x) => x.blue === game.blue && x.red === game.red && Math.abs(x.a.duration - game.duration) < 2);
  if (!r) return null;
  const v = coachView(state, r);
  return (
    <div className="panel px-4 py-3 flex items-start gap-4">
      <div className="text-2xl">📊</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-bold text-gold2 mb-1">{v.analyst}’s first take</div>
        <ul className="text-sm space-y-0.5">{v.reasons.slice(0, 2).map((x, i) => <li key={i}>▸ {x}</li>)}</ul>
        <div className="text-[11px] text-dim mt-1">{v.ours.length} mistake{v.ours.length === 1 ? '' : 's'} on us · {v.theirs.length} on them</div>
      </div>
      <button className="btn" onClick={() => nav('analysis', r.id)}>Full analysis →</button>
    </div>
  );
}

export function PostGame({ game, onNext, seriesDone }: { game: SeriesGame; onNext?: () => void; seriesDone?: boolean }) {
  const state = useGame();
  const blue = state.teams[game.blue], red = state.teams[game.red];
  const mvp = game.players?.find((l) => l.playerId === game.mvp);
  return (
    <div className="space-y-3">
      <div className="panel p-4 flex items-center gap-6">
        <TeamLogo team={state.teams[game.winner]} size={56} />
        <div>
          <div className="font-display text-2xl font-bold">{state.teams[game.winner].name} win in {mmss(game.duration)}</div>
          <div className="text-sm text-muted">Kills {game.kills[0]}–{game.kills[1]} · Gold {money(game.gold[0]).replace('$', '')}–{money(game.gold[1]).replace('$', '')} · Towers {game.towers[0]}–{game.towers[1]} · Dragons {game.dragons[0]}–{game.dragons[1]} · Barons {game.barons[0]}–{game.barons[1]}</div>
        </div>
        {mvp && <div className="ml-auto flex items-center gap-3"><Pill color="#c8aa6e">MVP</Pill><ChampIcon id={mvp.champion} size={36} /><div className="font-semibold">{state.players[mvp.playerId]?.handle}</div><div className="font-display">{mvp.k}/{mvp.d}/{mvp.a}</div></div>}
        {onNext && <button className="btn btn-gold ml-4 px-5 py-2.5" onClick={onNext}>{seriesDone ? 'Finish series' : 'Next game ▶'}</button>}
      </div>
      <QuickTake game={game} />
      <div className="grid grid-cols-2 gap-3">
        {[blue, red].map((team, side) => (
          <Panel key={side} title={<span className="flex items-center gap-2"><TeamLogo team={team} size={20} />{team.name} {side === 0 ? '(blue)' : '(red)'}</span>} bodyClass="p-0">
            <div className="flex gap-1 px-3 pt-2">{game.bans[side].map((b) => <ChampIcon key={b} id={b} size={22} grey />)}</div>
            <table className="tbl"><thead><tr><th>Player</th><th>KDA</th><th>CS</th><th>Gold</th><th>Dmg</th><th>Vis</th><th>Items</th></tr></thead>
              <tbody>{(game.players ?? []).filter((l) => l.teamId === team.id).map((l) => (
                <tr key={l.playerId}>
                  <td><div className="flex items-center gap-2"><ChampIcon id={l.champion} size={26} /><div><div className="font-semibold">{state.players[l.playerId]?.handle}{game.mvp === l.playerId ? ' ⭐' : ''}</div><div className="text-[10px] text-dim">{ROLE_LABEL[l.role]}</div></div></div></td>
                  <td className="font-display">{l.k}/{l.d}/{l.a}</td><td>{l.cs}</td><td>{(l.gold / 1000).toFixed(1)}k</td><td>{(l.damage / 1000).toFixed(1)}k</td><td>{l.vision}</td>
                  <td><div className="flex gap-0.5">{(l.items ?? []).map((i, k) => <ItemIcon key={k} id={i} size={18} />)}</div></td>
                </tr>
              ))}</tbody></table>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export { useMemo };
