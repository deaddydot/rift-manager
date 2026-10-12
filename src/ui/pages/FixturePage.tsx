// Series page: result header, per-game team stats, draft and box scores — or, for a match
// that has not been played yet, a preview with lineups, head-to-head and form.
import { useState, type ReactNode } from 'react';
import { loreWinner } from '../../engine/season/lore';
import { useGame, nav } from '../../store/game';
import type { GameState, MatchFixture, SeriesGame, GamePlayerLine, Team, Role } from '../../engine/types';
import { ROLES, ROLE_LABEL } from '../../engine/types';
import { Panel, Tabs, TeamLogo, ChampIcon, ItemIcon, RoleIcon, Portrait, Pill, Empty, Rating, num, fmtDate, mmss, pct, flag } from '../components/kit';
import { gd } from '../../data/gamedata';
import { overall } from '../../engine/setup';
import { lineupPlayers } from '../../engine/season/prep';
import {
  isPlayed, isBye, cleanLabel, formOf, headToHead, seasonRecord, scoreFor, opponentOf, lineupRating, gameWinProb, seriesWinProb, teamStatusIn, compColor, TONE_COLOR,
} from '../../engine/management/fixtureinfo';
import { FormDots, MatchRow } from './CompetitionPage';

const BLUE = '#3b82f6', RED = '#ef4444';

export default function FixturePage({ id }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const f = id ? state.fixtures[id] : undefined;
  if (!f) return <Panel title="Match"><Empty>Fixture not found — background matches from previous seasons are not kept.</Empty></Panel>;
  const played = isPlayed(f);
  return (
    <div className="space-y-4">
      <SeriesHeader state={state} f={f} />
      {played ? <PlayedSeries key={f.id} state={state} f={f} /> : isBye(f) ? <Panel><Empty>This slot was a bye — {state.teams[f.result!.winner]?.name ?? 'the seeded team'} advanced automatically.</Empty></Panel> : <Preview state={state} f={f} />}
    </div>
  );
}

// ------------------------------------------------------------------ header
function SeriesHeader({ state, f }: { state: GameState; f: MatchFixture }) {
  const comp = state.competitions[f.competitionId];
  const stage = comp?.stages.find((s) => s.id === f.stageId);
  const A = f.teamA ? state.teams[f.teamA] : null, B = f.teamB ? state.teams[f.teamB] : null;
  const played = isPlayed(f);
  const days = Math.round((new Date(f.date).getTime() - new Date(state.date).getTime()) / 864e5);
  const when = played ? 'Final' : days === 0 ? 'Today' : days > 0 ? `In ${days} day${days === 1 ? '' : 's'}` : 'Pending';
  const games = f.result?.games ?? [];
  const isUserToday = !played && f.date <= state.date && (f.teamA === state.userTeamId || f.teamB === state.userTeamId);
  const ca = A?.colors[0] ?? '#334155', cb = B?.colors[0] ?? '#334155';
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2.5 border-b hairline text-xs text-muted">
        {comp && <button className="font-semibold hover:underline" style={{ color: compColor(comp) }} onClick={() => nav('competition', comp.id)}>{comp.name}</button>}
        {stage && <><span>/</span><button className="hover:text-text" onClick={() => nav('competition', comp!.id, stage.id)}>{stage.name}</button></>}
        {(cleanLabel(f.label) || f.group) && <><span>/</span><span className="text-text">{cleanLabel(f.label) ?? `Group ${f.group}`}</span></>}
        <span className="flex-1" />
        <span>{fmtDate(f.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <Pill>Bo{f.bestOf}</Pill>
        {f.fearless !== false && <Pill color="#a855f7">Fearless draft</Pill>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-6" style={{ background: `linear-gradient(90deg, ${ca}26, transparent 35%, transparent 65%, ${cb}26)` }}>
        <HeaderTeam state={state} season={comp?.season ?? state.season} team={A} align="left" won={played && f.result!.winner === f.teamA} lost={played && f.result!.loser === f.teamA} />
        <div className="text-center min-w-[160px]">
          {played ? (
            <div className="font-display text-6xl font-bold leading-none tracking-wider">
              <span className={f.result!.winner === f.teamA ? 'text-gold2' : 'text-dim'}>{f.result!.scoreA}</span>
              <span className="text-dim mx-3 text-4xl align-middle">–</span>
              <span className={f.result!.winner === f.teamB ? 'text-gold2' : 'text-dim'}>{f.result!.scoreB}</span>
            </div>
          ) : <div className="font-display text-5xl font-bold text-dim">VS</div>}
          <div className={`mt-2 text-xs uppercase tracking-widest font-bold ${played ? 'text-muted' : days === 0 ? 'text-gold' : 'text-accent'}`}>{when}</div>
          {games.length > 0 && (
            <div className="flex justify-center gap-1.5 mt-3">
              {games.map((g, i) => {
                const w = state.teams[g.winner];
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5" title={`Game ${i + 1}: ${w?.name} (${mmss(g.duration)})`}>
                    <TeamLogo team={w} size={22} />
                    <span className="text-[9px] text-dim">G{i + 1}</span>
                  </div>
                );
              })}
            </div>
          )}
          {isUserToday && <button className="btn btn-gold mt-3 pulse-gold" onClick={() => nav('match')}>Go to match ▶</button>}
        </div>
        <HeaderTeam state={state} season={comp?.season ?? state.season} team={B} align="right" won={played && f.result!.winner === f.teamB} lost={played && f.result!.loser === f.teamB} />
      </div>
    </div>
  );
}

function HeaderTeam({ state, season, team, align, won, lost }: { state: GameState; season: number; team: Team | null; align: 'left' | 'right'; won?: boolean; lost?: boolean }) {
  if (!team) return <div className={`text-dim italic ${align === 'right' ? 'text-right' : ''}`}>To be determined</div>;
  const rec = seasonRecord(state, team.id, season);
  const form = formOf(state, team.id, 5, season).map((x) => x.r);
  return (
    <button onClick={() => nav('team', team.id)} className={`flex items-center gap-4 min-w-0 group ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'} ${lost ? 'opacity-70' : ''}`}>
      <TeamLogo team={team} size={84} />
      <div className="min-w-0">
        <div className={`font-display text-3xl font-bold leading-tight truncate group-hover:underline ${team.id === state.userTeamId ? 'text-gold2' : ''}`}>{team.name}</div>
        <div className="text-sm text-muted">{state.leagues[team.leagueId]?.name} · {flag(team.country)} {team.country}</div>
        <div className={`flex items-center gap-2 mt-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="text-xs text-muted">{season}: {rec.w}-{rec.l}</span>
          <FormDots results={form} size={14} />
          {won && <Pill color="#f0c674">Winner</Pill>}
        </div>
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ played series
function PlayedSeries({ state, f }: { state: GameState; f: MatchFixture }) {
  const games = f.result!.games;
  const multi = games.length > 1;
  const [tab, setTab] = useState<string>(multi ? 'series' : 'g0');
  if (!games.length) return <Panel><Empty>No game data was recorded for this series.</Empty></Panel>;
  const tabs = [
    ...(multi ? [{ id: 'series', label: 'Series overview' as ReactNode }] : []),
    ...games.map((g, i) => ({ id: `g${i}`, label: <span className="flex items-center gap-1.5">Game {i + 1}<TeamLogo team={state.teams[g.winner]} size={14} /></span> as ReactNode })),
  ];
  const gi = tab.startsWith('g') ? Number(tab.slice(1)) : -1;
  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {gi >= 0 && games[gi] ? <GameView key={gi} state={state} g={games[gi]} index={gi} /> : <SeriesOverview state={state} f={f} onGame={(i) => setTab(`g${i}`)} />}
    </div>
  );
}

function SeriesOverview({ state, f, onGame }: { state: GameState; f: MatchFixture; onGame: (i: number) => void }) {
  const games = f.result!.games;
  const hasPlayers = games.some((g) => g.players?.length);
  return (
    <div className="space-y-4">
      <Panel title="Games" bodyClass="p-0">
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Blue side</th><th>Red side</th><th>Winner</th><th className="text-center">Time</th><th className="text-center">Kills</th><th className="text-center">Gold</th><th className="text-center">Towers</th><th className="text-center">Drakes</th><th className="text-center">Barons</th><th>MVP</th></tr>
          </thead>
          <tbody>
            {games.map((g, i) => {
              const blue = state.teams[g.blue], red = state.teams[g.red], w = state.teams[g.winner];
              const mvp = g.mvp ? state.players[g.mvp] : null;
              return (
                <tr key={i} className="row" onClick={() => onGame(i)}>
                  <td className="font-display font-bold text-muted">G{i + 1}</td>
                  <td><span className="flex items-center gap-1.5"><span className="w-1 h-4 rounded" style={{ background: BLUE }} /><TeamLogo team={blue} size={18} />{blue?.short}</span></td>
                  <td><span className="flex items-center gap-1.5"><span className="w-1 h-4 rounded" style={{ background: RED }} /><TeamLogo team={red} size={18} />{red?.short}</span></td>
                  <td><span className="flex items-center gap-1.5 font-semibold text-gold2"><TeamLogo team={w} size={18} />{w?.short}</span></td>
                  <td className="text-center font-display">{mmss(g.duration)}</td>
                  <td className="text-center"><Pair a={g.kills[0]} b={g.kills[1]} /></td>
                  <td className="text-center"><Pair a={g.gold[0]} b={g.gold[1]} fmt={(x) => `${(x / 1000).toFixed(1)}k`} /></td>
                  <td className="text-center"><Pair a={g.towers[0]} b={g.towers[1]} /></td>
                  <td className="text-center"><Pair a={g.dragons[0]} b={g.dragons[1]} /></td>
                  <td className="text-center"><Pair a={g.barons[0]} b={g.barons[1]} /></td>
                  <td>{mvp ? <span className="flex items-center gap-1.5"><Portrait player={mvp} team={state.teams[mvp.teamId ?? '']} size={20} />{mvp.handle}</span> : <span className="text-dim">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      {hasPlayers ? (
        <div className="grid 2xl:grid-cols-2 gap-4">
          {[f.teamA!, f.teamB!].map((t) => <SeriesPlayerTable key={t} state={state} teamId={t} games={games} won={f.result!.winner === t} />)}
        </div>
      ) : <Panel><div className="text-sm text-muted">Player statistics were not recorded for this background series.</div></Panel>}
    </div>
  );
}

function Pair({ a, b, fmt = (x: number) => String(x) }: { a: number; b: number; fmt?: (x: number) => string }) {
  return <span className="font-display text-[14px]"><span style={{ color: a > b ? '#93c5fd' : '#8a97b3' }}>{fmt(a)}</span><span className="text-dim mx-1">/</span><span style={{ color: b > a ? '#fca5a5' : '#8a97b3' }}>{fmt(b)}</span></span>;
}

function SeriesPlayerTable({ state, teamId, games, won }: { state: GameState; teamId: string; games: SeriesGame[]; won: boolean }) {
  const team = state.teams[teamId];
  const agg: Record<string, { line: GamePlayerLine; g: number; k: number; d: number; a: number; cs: number; dmg: number; gold: number; mins: number; mvp: number; champs: string[] }> = {};
  for (const g of games) {
    for (const l of g.players ?? []) {
      if (l.teamId !== teamId) continue;
      const m = (agg[l.playerId] ??= { line: l, g: 0, k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, mins: 0, mvp: 0, champs: [] });
      m.g++; m.k += l.k; m.d += l.d; m.a += l.a; m.cs += l.cs; m.dmg += l.damage; m.gold += l.gold; m.mins += g.duration / 60; m.champs.push(l.champion);
      if (g.mvp === l.playerId) m.mvp++;
    }
  }
  const rows = Object.values(agg).sort((a, b) => ROLES.indexOf(a.line.role) - ROLES.indexOf(b.line.role));
  return (
    <Panel title={<span className="flex items-center gap-2"><TeamLogo team={team} size={20} />{team?.name}{won && <Pill color="#f0c674">Winner</Pill>}</span>} bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Player</th><th>Champions</th><th className="text-center">K/D/A</th><th className="text-center">KDA</th><th className="text-center">CS/m</th><th className="text-center">Gold/m</th><th className="text-center">Dmg/m</th><th className="text-center">MVP</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = state.players[r.line.playerId];
              return (
                <tr key={r.line.playerId} className="row" onClick={() => nav('player', r.line.playerId)}>
                  <td><span className="flex items-center gap-2">{p && <Portrait player={p} team={team} size={26} />}<RoleIcon role={r.line.role} size={14} /><span className="font-semibold">{p?.handle ?? '?'}</span></span></td>
                  <td><span className="flex gap-0.5">{r.champs.map((c, i) => <ChampIcon key={i} id={c} size={22} />)}</span></td>
                  <td className="text-center font-display">{r.k}/<span className="text-[#ef4444]">{r.d}</span>/{r.a}</td>
                  <td className="text-center font-display font-bold" style={{ color: kdaColor((r.k + r.a) / Math.max(1, r.d)) }}>{((r.k + r.a) / Math.max(1, r.d)).toFixed(1)}</td>
                  <td className="text-center">{(r.cs / Math.max(1, r.mins)).toFixed(1)}</td>
                  <td className="text-center">{Math.round(r.gold / Math.max(1, r.mins))}</td>
                  <td className="text-center">{Math.round(r.dmg / Math.max(1, r.mins))}</td>
                  <td className="text-center">{r.mvp ? <Pill color="#f0c674">{r.mvp}×</Pill> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const kdaColor = (k: number) => (k >= 6 ? '#f0c674' : k >= 4 ? '#22c55e' : k >= 2.5 ? '#e6ebf5' : k >= 1.5 ? '#f97316' : '#ef4444');

// ------------------------------------------------------------------ one game
function GameView({ state, g, index }: { state: GameState; g: SeriesGame; index: number }) {
  const blue = state.teams[g.blue], red = state.teams[g.red];
  const blueWon = g.winner === g.blue;
  const mins = g.duration / 60;
  const lines = g.players ?? [];
  const hasDraft = g.picks[0].length > 0 || g.picks[1].length > 0;
  const goldDiff = g.gold[0] - g.gold[1];
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <SideHead team={blue} color={BLUE} side="Blue side" won={blueWon} align="left" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted font-bold">Game {index + 1}</div>
            <div className="font-display text-3xl font-bold">{mmss(g.duration)}</div>
            <div className="text-[11px] text-dim">{g.detailed ? 'Full simulation' : 'Quick simulation'}</div>
          </div>
          <SideHead team={red} color={RED} side="Red side" won={!blueWon} align="right" />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-display font-bold text-base" style={{ color: BLUE }}>{(g.gold[0] / 1000).toFixed(1)}k</span>
            <span className="text-muted">Total gold · {goldDiff === 0 ? 'even' : `${goldDiff > 0 ? blue?.short : red?.short} +${(Math.abs(goldDiff) / 1000).toFixed(1)}k`}</span>
            <span className="font-display font-bold text-base" style={{ color: RED }}>{(g.gold[1] / 1000).toFixed(1)}k</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-[#0a1120]">
            <div style={{ width: `${(g.gold[0] / Math.max(1, g.gold[0] + g.gold[1])) * 100}%`, background: `linear-gradient(90deg, ${BLUE}88, ${BLUE})` }} />
            <div className="flex-1" style={{ background: `linear-gradient(90deg, ${RED}, ${RED}88)` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 mt-4">
          <CompareBar label="Kills" a={g.kills[0]} b={g.kills[1]} />
          <CompareBar label="Towers" a={g.towers[0]} b={g.towers[1]} />
          <CompareBar label="Dragons" a={g.dragons[0]} b={g.dragons[1]} />
          <CompareBar label="Barons" a={g.barons[0]} b={g.barons[1]} />
        </div>
      </div>

      <Panel title="Draft">
        {hasDraft ? (
          <div className="grid md:grid-cols-2 gap-6">
            <DraftSide picks={g.picks[0]} bans={g.bans[0]} color={BLUE} team={blue} align="left" lines={lines.filter((l) => l.teamId === g.blue)} state={state} />
            <DraftSide picks={g.picks[1]} bans={g.bans[1]} color={RED} team={red} align="right" lines={lines.filter((l) => l.teamId === g.red)} state={state} />
          </div>
        ) : <div className="text-sm text-muted">The draft for this background game was not recorded.</div>}
      </Panel>

      {lines.length > 0 ? (
        <div className="space-y-4">
          {[[g.blue, BLUE, 'Blue side'] as const, [g.red, RED, 'Red side'] as const].map(([tid, color, side]) => (
            <BoxScore key={tid} state={state} g={g} teamId={tid} color={color} side={side} mins={mins} />
          ))}
        </div>
      ) : <Panel><div className="text-sm text-muted">Player statistics were not recorded for this background game.</div></Panel>}
    </div>
  );
}

function SideHead({ team, color, side, won, align }: { team?: Team; color: string; side: string; won: boolean; align: 'left' | 'right' }) {
  return (
    <button onClick={() => team && nav('team', team.id)} className={`flex items-center gap-3 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <div className="w-1.5 self-stretch rounded" style={{ background: color }} />
      <TeamLogo team={team} size={44} />
      <div className="min-w-0">
        <div className="font-display text-xl font-bold truncate">{team?.name}</div>
        <div className="text-xs" style={{ color }}>{side}</div>
      </div>
      <span className={`font-display text-lg font-bold px-2 rounded ${won ? 'text-[#22c55e] bg-[#22c55e1a]' : 'text-[#ef4444] bg-[#ef44441a]'}`}>{won ? 'VICTORY' : 'DEFEAT'}</span>
    </button>
  );
}

function CompareBar({ label, a, b }: { label: string; a: number; b: number }) {
  const t = Math.max(1, a + b);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-display font-bold text-[15px]" style={{ color: a >= b ? '#93c5fd' : '#8a97b3' }}>{a}</span>
        <span className="text-muted uppercase tracking-wider text-[10px] font-semibold self-center">{label}</span>
        <span className="font-display font-bold text-[15px]" style={{ color: b >= a ? '#fca5a5' : '#8a97b3' }}>{b}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#0a1120] gap-px">
        <div style={{ width: `${(a / t) * 100}%`, background: BLUE }} />
        <div style={{ width: `${(b / t) * 100}%`, background: RED }} className="ml-auto" />
      </div>
    </div>
  );
}

function DraftSide({ state, picks, bans, color, team, align, lines }: { state: GameState; picks: string[]; bans: string[]; color: string; team?: Team; align: 'left' | 'right'; lines: GamePlayerLine[] }) {
  const right = align === 'right';
  return (
    <div className={right ? 'text-right' : ''}>
      <div className={`flex items-center gap-2 mb-2 ${right ? 'flex-row-reverse' : ''}`}>
        <TeamLogo team={team} size={18} /><span className="text-sm font-semibold">{team?.short}</span>
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color }}>Picks</span>
      </div>
      <div className={`flex gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        {picks.map((c, i) => {
          const role = ROLES[i];
          const l = lines.find((x) => x.champion === c);
          const p = l ? state.players[l.playerId] : null;
          return (
            <div key={i} className="flex flex-col items-center gap-1 w-14">
              <div className="relative">
                <ChampIcon id={c} size={48} className="border-2" />
                <span className="absolute -bottom-1 -right-1 bg-[#0b1324] rounded p-0.5"><RoleIcon role={role} size={12} /></span>
              </div>
              <span className="text-[10px] text-muted truncate w-full text-center">{gd().championById[c]?.name ?? c}</span>
              {p && <span className="text-[10px] text-dim truncate w-full text-center -mt-1">{p.handle}</span>}
            </div>
          );
        })}
      </div>
      <div className={`flex items-center gap-1 mt-3 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="text-[10px] uppercase tracking-wider text-dim font-bold mx-1">Bans</span>
        {bans.length ? bans.map((c, i) => (c ? <ChampIcon key={i} id={c} size={26} grey /> : <div key={i} className="w-[26px] h-[26px] rounded bg-[#16213a]" />)) : <span className="text-xs text-dim">none</span>}
      </div>
    </div>
  );
}

function BoxScore({ state, g, teamId, color, side, mins }: { state: GameState; g: SeriesGame; teamId: string; color: string; side: string; mins: number }) {
  const team = state.teams[teamId];
  const lines = (g.players ?? []).filter((l) => l.teamId === teamId).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const teamDmg = lines.reduce((s, l) => s + l.damage, 0) || 1;
  const teamKills = lines.reduce((s, l) => s + l.k, 0) || 1;
  const won = g.winner === teamId;
  const hasItems = lines.some((l) => l.items?.length);
  return (
    <Panel bodyClass="p-0" title={<span className="flex items-center gap-2"><span className="w-1 h-4 rounded" style={{ background: color }} /><TeamLogo team={team} size={20} />{team?.name}<span className="text-[11px] normal-case font-normal tracking-normal" style={{ color }}>{side}</span><span className={`text-[11px] ${won ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{won ? 'Victory' : 'Defeat'}</span></span>}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Player</th><th>Champion</th><th className="text-center">K / D / A</th><th className="text-center">KDA</th><th className="text-center">KP</th><th className="text-center">CS</th><th className="text-center">Gold</th><th>Damage</th><th className="text-center">Vision</th>{hasItems && <th>Items</th>}</tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = state.players[l.playerId];
              const kda = (l.k + l.a) / Math.max(1, l.d);
              const isMvp = g.mvp === l.playerId;
              return (
                <tr key={l.playerId} className={`row ${l.teamId === state.userTeamId ? '' : ''}`} onClick={() => nav('player', l.playerId)}>
                  <td>
                    <div className="flex items-center gap-2">
                      {p && <Portrait player={p} team={team} size={32} />}
                      <RoleIcon role={l.role} size={14} />
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-1.5">{p?.handle ?? '?'}{isMvp && <span className="text-[9px] font-bold px-1 rounded bg-gold text-black">MVP</span>}</div>
                        <div className="text-[10px] text-dim">{ROLE_LABEL[l.role]}</div>
                      </div>
                    </div>
                  </td>
                  <td><div className="flex items-center gap-2"><ChampIcon id={l.champion} size={28} /><span className="text-xs">{gd().championById[l.champion]?.name ?? l.champion}</span></div></td>
                  <td className="text-center font-display text-[15px] whitespace-nowrap">{l.k} / <span className="text-[#ef4444]">{l.d}</span> / {l.a}</td>
                  <td className="text-center font-display font-bold" style={{ color: kdaColor(kda) }}>{kda.toFixed(1)}</td>
                  <td className="text-center text-muted">{pct((l.k + l.a) / teamKills)}</td>
                  <td className="text-center">{l.cs}<div className="text-[10px] text-dim">{(l.cs / Math.max(1, mins)).toFixed(1)}/m</div></td>
                  <td className="text-center">{(l.gold / 1000).toFixed(1)}k</td>
                  <td className="min-w-[130px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#0a1120] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(l.damage / teamDmg) * 100}%`, background: color }} /></div>
                      <span className="text-xs w-12 text-right">{(l.damage / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="text-[10px] text-dim">{pct(l.damage / teamDmg)} of team</div>
                  </td>
                  <td className="text-center">{l.vision}</td>
                  {hasItems && <td><div className="flex gap-0.5">{(l.items ?? []).slice(0, 7).map((it, i) => <ItemIcon key={i} id={it} size={22} />)}</div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ preview
function Preview({ state, f }: { state: GameState; f: MatchFixture }) {
  const A = f.teamA ? state.teams[f.teamA] : null, B = f.teamB ? state.teams[f.teamB] : null;
  if (!A || !B) return <AwaitingTeams state={state} f={f} />;
  const lpA = lineupPlayers(state, A), lpB = lineupPlayers(state, B);
  const rA = lineupRating(state, A), rB = lineupRating(state, B);
  const fated = loreWinner(state, A, B);
  const pg = fated ? (fated === A ? 1 : 0) : gameWinProb(rA, rB);
  const ps = fated ? pg : seriesWinProb(pg, f.bestOf);
  const comp = state.competitions[f.competitionId];
  const h2h = headToHead(state, A.id, B.id);
  const h2hSeason = h2h.filter((x) => state.competitions[x.competitionId]?.season === state.season);
  const winsA = h2hSeason.filter((x) => x.result!.winner === A.id).length;
  const recA = seasonRecord(state, A.id, state.season), recB = seasonRecord(state, B.id, state.season);
  const stA = comp ? teamStatusIn(state, comp, A.id) : null, stB = comp ? teamStatusIn(state, comp, B.id) : null;
  const rows: [string, ReactNode, ReactNode, number, number][] = [
    ['Lineup rating', rA.toFixed(1), rB.toFixed(1), rA, rB],
    ['Season record', `${recA.w}-${recA.l}`, `${recB.w}-${recB.l}`, recA.w - recA.l, recB.w - recB.l],
    ['Games', `${recA.gw}-${recA.gl}`, `${recB.gw}-${recB.gl}`, recA.gw - recA.gl, recB.gw - recB.gl],
    ['Chemistry', Math.round(A.chemistry), Math.round(B.chemistry), A.chemistry, B.chemistry],
    ['Prestige', Math.round(A.prestige), Math.round(B.prestige), A.prestige, B.prestige],
    ['Hype', Math.round(A.hype), Math.round(B.hype), A.hype, B.hype],
  ];
  return (
    <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
      <div className="space-y-4 min-w-0">
        <Panel title="Starting lineups" bodyClass="p-0">
          {ROLES.map((r: Role) => {
            const a = lpA[r], b = lpB[r];
            const oa = overall(a.attributes, r), ob = overall(b.attributes, r);
            return (
              <div key={r} className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 px-4 py-2 border-b border-[#141e33] last:border-0">
                <button className="flex items-center gap-3 min-w-0 text-left hover:bg-[#111a2e] rounded-md p-1" onClick={() => nav('player', a.id)}>
                  <Portrait player={a} team={A} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{a.handle} <span className="text-xs">{flag(a.country)}</span></div>
                    <div className="text-[11px] text-muted">Form <span style={{ color: a.form >= 0 ? '#22c55e' : '#ef4444' }}>{a.form > 0 ? '+' : ''}{a.form.toFixed(1)}</span>{a.season.games ? ` · ${((a.season.kills + a.season.assists) / Math.max(1, a.season.deaths)).toFixed(1)} KDA` : ''}</div>
                  </div>
                  <Rating v={oa} size="sm" />
                </button>
                <div className="flex flex-col items-center"><RoleIcon role={r} size={18} /><span className="text-[9px] text-dim uppercase">{ROLE_LABEL[r]}</span></div>
                <button className="flex flex-row-reverse items-center gap-3 min-w-0 text-right hover:bg-[#111a2e] rounded-md p-1" onClick={() => nav('player', b.id)}>
                  <Portrait player={b} team={B} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate"><span className="text-xs">{flag(b.country)}</span> {b.handle}</div>
                    <div className="text-[11px] text-muted">{b.season.games ? `${((b.season.kills + b.season.assists) / Math.max(1, b.season.deaths)).toFixed(1)} KDA · ` : ''}Form <span style={{ color: b.form >= 0 ? '#22c55e' : '#ef4444' }}>{b.form > 0 ? '+' : ''}{b.form.toFixed(1)}</span></div>
                  </div>
                  <Rating v={ob} size="sm" />
                </button>
              </div>
            );
          })}
        </Panel>
        <div className="grid md:grid-cols-2 gap-4">
          {[A, B].map((t) => (
            <Panel key={t.id} title={<span className="flex items-center gap-2"><TeamLogo team={t} size={18} />{t.short} recent form</span>} bodyClass="p-0">
              <RecentList state={state} teamId={t.id} />
            </Panel>
          ))}
        </div>
      </div>
      <div className="space-y-4 min-w-0">
        <Panel title="Pre-match estimate">
          <div className="flex justify-between items-end mb-1.5">
            <div><div className="font-display text-3xl font-bold" style={{ color: ps >= 0.5 ? '#22c55e' : '#e6ebf5' }}>{pct(ps)}</div><div className="text-xs text-muted">{A.short}</div></div>
            <div className="text-[11px] text-dim text-center">Series win chance<br />per game {pct(pg)} / {pct(1 - pg)}</div>
            <div className="text-right"><div className="font-display text-3xl font-bold" style={{ color: ps < 0.5 ? '#22c55e' : '#e6ebf5' }}>{pct(1 - ps)}</div><div className="text-xs text-muted">{B.short}</div></div>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden"><div style={{ width: `${ps * 100}%`, background: A.colors[0] }} /><div className="flex-1" style={{ background: B.colors[0] }} /></div>
          <div className="text-[11px] text-dim mt-2">{fated ? `It is written: ${fated.name} never lose to an LPL team. (Lore rules — switch off in Settings.)` : 'Based on starting-lineup ratings only — form, draft and tactics can swing it.'}</div>
        </Panel>
        <Panel title="Tale of the tape" bodyClass="p-0">
          <table className="tbl">
            <thead><tr><th className="text-right">{A.short}</th><th className="text-center"></th><th>{B.short}</th></tr></thead>
            <tbody>
              {rows.map(([label, va, vb, na, nb]) => (
                <tr key={label}>
                  <td className={`text-right font-display font-bold text-[15px] ${na > nb ? 'text-gold2' : 'text-muted'}`}>{va}</td>
                  <td className="text-center text-[11px] uppercase tracking-wider text-dim">{label}</td>
                  <td className={`font-display font-bold text-[15px] ${nb > na ? 'text-gold2' : 'text-muted'}`}>{vb}</td>
                </tr>
              ))}
              {(stA || stB) && (
                <tr>
                  <td className="text-right text-xs" style={{ color: stA ? TONE_COLOR[stA.tone] : undefined }}>{stA?.text ?? '—'}</td>
                  <td className="text-center text-[11px] uppercase tracking-wider text-dim">{comp?.short}</td>
                  <td className="text-xs" style={{ color: stB ? TONE_COLOR[stB.tone] : undefined }}>{stB?.text ?? '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
        <Panel title="Head to head" bodyClass="p-0" right={<span className="text-xs text-muted">This season {winsA}-{h2hSeason.length - winsA}</span>}>
          {h2h.length ? h2h.slice(0, 8).map((x) => <MatchRow key={x.id} state={state} f={x} showComp short />) : <Empty>These teams have not met yet.</Empty>}
        </Panel>
      </div>
    </div>
  );
}

function RecentList({ state, teamId }: { state: GameState; teamId: string }) {
  const res = formOf(state, teamId, 6).reverse();
  if (!res.length) return <Empty>No matches played yet.</Empty>;
  return (
    <div>
      {res.map(({ f, r }) => {
        const opp = opponentOf(f, teamId);
        const ot = opp ? state.teams[opp] : null;
        const sc = scoreFor(f, teamId)!;
        return (
          <button key={f.id} onClick={() => nav('fixture', f.id)} className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-[#141e33] last:border-0 hover:bg-[#111a2e] text-left text-sm">
            <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-black/80 ${r === 'W' ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`}>{r}</span>
            <span className="font-display font-bold w-8">{sc[0]}-{sc[1]}</span>
            <TeamLogo team={ot} size={18} />
            <span className="flex-1 truncate">{ot?.name ?? 'TBD'}</span>
            <span className="text-[11px] text-dim">{fmtDate(f.date, { month: 'short', day: 'numeric' })}</span>
          </button>
        );
      })}
    </div>
  );
}

function AwaitingTeams({ state, f }: { state: GameState; f: MatchFixture }) {
  const feeders = Object.values(state.fixtures).filter((g) => g.stageId === f.stageId && g.competitionId === f.competitionId && (g.feeds?.winnerTo?.[0] === f.id || g.feeds?.loserTo?.[0] === f.id));
  const slot = (s: 'A' | 'B') => {
    const tid = s === 'A' ? f.teamA : f.teamB;
    if (tid) return { team: state.teams[tid], src: null as MatchFixture | null, how: '' };
    const src = feeders.find((g) => g.feeds?.winnerTo?.[0] === f.id && g.feeds.winnerTo[1] === s) ?? feeders.find((g) => g.feeds?.loserTo?.[0] === f.id && g.feeds.loserTo[1] === s) ?? null;
    const how = src ? (src.feeds?.winnerTo?.[0] === f.id && src.feeds.winnerTo[1] === s ? 'Winner of' : 'Loser of') : '';
    return { team: null as Team | null, src, how };
  };
  return (
    <Panel title="Awaiting opponents">
      <div className="grid md:grid-cols-2 gap-4">
        {(['A', 'B'] as const).map((s) => {
          const x = slot(s);
          return (
            <div key={s} className="panel-flat p-4">
              {x.team ? (
                <button className="flex items-center gap-3" onClick={() => nav('team', x.team!.id)}><TeamLogo team={x.team} size={40} /><span className="font-display text-xl font-bold">{x.team.name}</span></button>
              ) : x.src ? (
                <div>
                  <div className="text-xs text-muted mb-2">{x.how} {cleanLabel(x.src.label) ?? `round ${x.src.round}`} · {fmtDate(x.src.date, { month: 'short', day: 'numeric' })}</div>
                  <MatchRow state={state} f={x.src} showDate={false} />
                </div>
              ) : <div className="text-dim">To be determined</div>}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-dim mt-3">Line-ups and a preview appear once both teams are known. {f.date > state.date ? `Scheduled for ${fmtDate(f.date)}.` : ''}</div>
    </Panel>
  );
}
