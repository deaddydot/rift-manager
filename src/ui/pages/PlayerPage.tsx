import { useEffect, useMemo, useState } from 'react';
import { HOSTED } from '../../hosted';
import { MASTERY_MAX, masteryTier } from '../../engine/mastery';
import { useGame, useStore, nav } from '../../store/game';
import { Panel, Portrait, TeamLogo, Rating, Bar, RatingBar, RatingBandTag, ChampIcon, Pill, Tabs, Modal, money, fmtDate, ageOf, flag, pct, RoleIcon, Stat, Empty, ratingColor } from '../components/kit';
import { RATING_MAX } from '../../engine/ratings';
import { estimateRange } from '../../engine/management/scouting';
import { ATTRIBUTE_LABEL, HIDDEN_LABEL, ROLE_LABEL, type HiddenAttributes, type MatchHistoryEntry, type PlayerAttributes, type Role } from '../../engine/types';
import { TRAITS } from '../../engine/traits';
import { overall } from '../../engine/setup';
import { gd } from '../../data/gamedata';
import { realHistory } from '../../data/load';
import { salaryDemand, offerRenewal, releasePlayer, askingFee } from '../../engine/management/transfers';
import PlayerBuzz from '../components/PlayerBuzz';
import PlayerTalk from '../components/PlayerTalk';
import PlayerProfile from '../components/PlayerProfile';

const GROUPS: { title: string; keys: (keyof PlayerAttributes)[] }[] = [
  { title: 'Technical', keys: ['mechanics', 'laning', 'farming', 'teamfight'] },
  { title: 'Mental', keys: ['macro', 'vision', 'pathing', 'objectives', 'shotcalling'] },
  { title: 'Character', keys: ['consistency', 'clutch', 'adaptability'] },
];

/** Knowledge of a player 0..100 (own players fully known; fame makes stars better known). */
export function knowledgeOf(state: ReturnType<typeof useGame>, id: string): number {
  const p = state.players[id];
  if (!p) return 0;
  if (p.teamId === state.userTeamId) return 100;
  return Math.min(100, (state.scoutedPlayers[id] ?? 0) + p.reputation * 0.35);
}

export default function PlayerPage({ id }: { id: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const p = state.players[id];
  const [tab, setTab] = useState<'overview' | 'champions' | 'history' | 'career'>('overview');
  const [real, setReal] = useState<MatchHistoryEntry[] | null>(null);
  const [renew, setRenew] = useState(false);
  useEffect(() => { realHistory().then((h) => setReal(h[id] ?? [])).catch(() => setReal([])); }, [id]);
  if (!p) return <Empty>Player not found.</Empty>;
  const team = p.teamId ? state.teams[p.teamId] : null;
  const mine = p.teamId === state.userTeamId;
  const ovr = overall(p.attributes, p.role);
  const age = ageOf(p.birthdate, state.date);
  const know = knowledgeOf(state, id);
  const starter = team ? Object.values(team.lineup).includes(p.id) : false;
  const pool = Object.entries(p.champions).sort((a, b) => b[1] - a[1]);
  const s = p.season;
  const kda = s.deaths ? ((s.kills + s.assists) / s.deaths).toFixed(2) : s.games ? 'Perfect' : '-';

  const hiddenRange = (k: keyof HiddenAttributes): [number, number] => {
    const v = p.hidden[k];
    if (k === 'potential') { // 0..200 scale, never below the current overall; same stable estimate as scouting reports
      const [a, b] = estimateRange(v, know, `${p.id}|potential`, 1, RATING_MAX, 1.5);
      return [Math.max(ovr, a), Math.max(ovr, b)];
    }
    const w = Math.round((100 - know) * 0.35);
    return [Math.max(1, v - w), Math.min(99, v + w)];
  };
  const potShown = know >= 90 ? p.hidden.potential : (hiddenRange('potential')[0] + hiddenRange('potential')[1]) / 2;
  const visibleTraits = p.traits.filter((t) => !TRAITS[t]?.hidden || know >= 70);
  const hiddenCount = p.traits.length - visibleTraits.length;

  const setStarter = () => {
    if (!team) return;
    team.lineup[p.role] = p.id;
    p.isSub = false;
    for (const pid of team.roster) { const q = state.players[pid]; if (q) q.isSub = !Object.values(team.lineup).includes(pid); }
    bump(); notify(`${p.handle} is now the starting ${ROLE_LABEL[p.role]}`);
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="panel overflow-hidden">
        <div className="relative p-5 flex gap-5 items-center" style={{ background: `linear-gradient(110deg, ${team?.colors[0] ?? '#1e293b'}33, transparent 60%)` }}>
          <Portrait player={p} team={team} size={120} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-4xl font-bold leading-none">{p.handle}</h1>
              <RoleIcon role={p.role} size={22} />
              <span className="text-muted font-semibold">{ROLE_LABEL[p.role]}</span>
              {p.isCustom && <Pill color="#a78bfa">Custom</Pill>}
              {p.generated && <Pill color="#38bdf8">{p.teamId ? 'Generated player' : 'Unsigned · generated'}</Pill>}
              {p.retired && <Pill color="#ef4444">Retired</Pill>}
            </div>
            <div className="text-muted mt-1">{flag(p.country)} {p.name}{p.nativeName ? ` (${p.nativeName})` : ''} · {p.country} · {age !== null ? `${age} years old` : 'age unknown'}{p.birthdate ? ` (${fmtDate(p.birthdate)})` : ''}</div>
            <div className="flex items-center gap-2 mt-3">
              {team ? (
                <button className="flex items-center gap-2 hover:underline" onClick={() => nav('team', team.id)}><TeamLogo team={team} size={26} /><span className="font-semibold">{team.name}</span></button>
              ) : <span className="text-muted">Free agent</span>}
              {team && <Pill color={starter ? '#22c55e' : '#8a97b3'}>{starter ? 'Starter' : 'Substitute'}</Pill>}
              {p.playstyle.map((x) => <Pill key={x}>{x}</Pill>)}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="text-center"><Rating v={ovr} size="lg" /><div className="text-[11px] text-muted mt-1">Overall</div><RatingBandTag v={ovr} /></div>
            <div className="text-center">
              <div className="font-display text-xl font-bold" style={{ color: ratingColor(potShown) }}>{know >= 90 ? Math.round(p.hidden.potential) : `${hiddenRange('potential')[0]}–${hiddenRange('potential')[1]}`}</div>
              <div className="text-[11px] text-muted">Potential</div>
              <RatingBandTag v={potShown} prefix="ceiling: " />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-px bg-line border-t hairline">
          {[
            ['Value', money(p.value)], ['Salary', p.contract ? (mine ? money(p.contract.salary) + '/yr' : '—') : '—'], ['Contract', p.contract ? fmtDate(p.contract.expires) : 'None'],
            ['Morale', `${Math.round(p.morale)}`], ['Form', `${p.form >= 0 ? '+' : ''}${p.form.toFixed(1)}`], ['Reputation', `${Math.round(p.reputation)}`],
          ].map(([k, v]) => <div key={k} className="bg-panel px-4 py-2"><div className="text-[10px] uppercase tracking-wider text-muted">{k}</div><div className="font-display font-bold text-lg">{v}</div></div>)}
        </div>
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        {mine && !starter && <button className="btn" onClick={setStarter}>Make starter</button>}
        {mine && <button className="btn" onClick={() => setRenew(true)}>Offer new contract</button>}
        {mine && <button className="btn btn-danger" onClick={() => { if (confirm(`Release ${p.handle}? You pay 50% of the remaining salary.`)) { releasePlayer(state, p.id); bump(); nav('squad'); } }}>Release</button>}
        {!mine && <button className="btn btn-gold" onClick={() => nav('transfers')}>Scout / make offer</button>}
        {!mine && team && <span className="text-sm text-muted self-center">Asking fee ~{money(askingFee(state, p, team))} · demands ~{money(salaryDemand(state, p, state.teams[state.userTeamId]))}/yr from you</span>}
        {!HOSTED && <button className="btn btn-ghost" onClick={() => nav('editor', 'player', p.id)}>Edit in editor</button>}
      </div>

      {mine && <PlayerTalk playerId={p.id} />}

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'champions', label: 'Champion pool' }, { id: 'history', label: 'Match history' }, { id: 'career', label: 'Career' }]} />

      {tab === 'overview' && (
        <div className="grid grid-cols-3 gap-4">
          <Panel title="Attributes" className="col-span-2" right={<span className="text-[11px] text-muted" title="Ratings run 0–200. The best players of 2026 sit around 90; the tick marks 100.">scale 0–200 · tick = 100</span>}>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="text-xs uppercase text-muted font-bold mb-2 tracking-wider">{g.title}</div>
                  <div className="space-y-1.5">{g.keys.map((k) => <RatingBar key={k} label={ATTRIBUTE_LABEL[k]} value={p.attributes[k]} />)}</div>
                </div>
              ))}
              <div>
                <div className="text-xs uppercase text-muted font-bold mb-2 tracking-wider">Style</div>
                <Bar label="Aggression" value={p.attributes.aggression} color="#f97316" />
                <div className="text-[11px] text-dim mt-1">{p.attributes.aggression >= 65 ? 'Looks for fights and forces plays.' : p.attributes.aggression <= 38 ? 'Calculated; waits for the right moment.' : 'Balanced risk-taking.'}</div>
              </div>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="Hidden attributes" right={<span className="text-[11px] text-muted">Knowledge {Math.round(know)}%</span>}>
              <div className="space-y-1.5 text-xs">
                {(['farsight', 'mistakes', 'composure', 'snowball', 'resilience', 'workEthic', 'professionalism', 'ego', 'loyalty'] as (keyof HiddenAttributes)[]).map((k) => {
                  const [lo, hi] = hiddenRange(k);
                  const bad = k === 'mistakes' || k === 'ego';
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <div className="w-36 text-muted">{HIDDEN_LABEL[k]}</div>
                      <div className="flex-1 h-1.5 bg-[#0a1120] rounded-full relative">
                        <div className="absolute h-full rounded-full" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%`, background: bad ? '#f97316aa' : '#c8aa6eaa' }} />
                      </div>
                      <div className="w-14 text-right font-display font-bold">{lo === hi ? lo : `${lo}-${hi}`}</div>
                    </div>
                  );
                })}
              </div>
              {!mine && know < 70 && <div className="text-[11px] text-dim mt-2">Scout this player to narrow the ranges and reveal hidden traits.</div>}
            </Panel>
            <Panel title="Traits">
              <div className="flex flex-wrap gap-1.5">
                {visibleTraits.map((t) => (
                  <span key={t} title={TRAITS[t]?.desc} className="chip" style={{ color: TRAITS[t]?.kind === 'negative' ? '#f87171' : TRAITS[t]?.kind === 'positive' ? '#86efac' : '#cbd5e1' }}>{TRAITS[t]?.name ?? t}</span>
                ))}
                {!visibleTraits.length && <span className="text-sm text-muted">No known traits.</span>}
              </div>
              {hiddenCount > 0 && <div className="text-[11px] text-dim mt-2">{hiddenCount} hidden trait(s) not yet revealed.</div>}
              <div className="mt-2 space-y-1">{visibleTraits.map((t) => <div key={t} className="text-[11px] text-muted"><b className="text-text">{TRAITS[t]?.name}:</b> {TRAITS[t]?.desc}</div>)}</div>
            </Panel>
            <PlayerProfile playerId={p.id} know={know} />
          </div>
          <Panel title={`${state.season} season`} className="col-span-2">
            <div className="grid grid-cols-6 gap-2">
              <Stat label="Games" value={s.games} sub={s.games ? `${s.wins}W ${s.games - s.wins}L` : undefined} />
              <Stat label="KDA" value={kda} sub={`${s.kills}/${s.deaths}/${s.assists}`} />
              <Stat label="CS/min" value={s.minutes ? (s.cs / s.minutes).toFixed(1) : '-'} />
              <Stat label="Gold/min" value={s.minutes ? Math.round(s.gold / s.minutes) : '-'} />
              <Stat label="Dmg/min" value={s.minutes ? Math.round(s.damage / s.minutes) : '-'} />
              <Stat label="MVPs" value={s.mvps} />
            </div>
          </Panel>
          <Panel title="Real 2026 stats" right={<span className="text-[11px] text-muted">Leaguepedia</span>}>
            {p.realStats ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[['Games', p.realStats.games], ['Win rate', pct(p.realStats.winRate)], ['KDA', p.realStats.kda], ['Kill part.', pct(p.realStats.kp)], ['CS/min', p.realStats.csm], ['Gold/min', p.realStats.gpm], ['Dmg/min', p.realStats.dpm], ['Vision/min', p.realStats.vspm], ['Dmg share', pct(p.realStats.dmgShare)], ['Gold share', pct(p.realStats.goldShare)]].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between border-b border-[#141e33] py-1"><span className="text-muted">{k}</span><span className="font-display font-bold">{v}</span></div>
                ))}
              </div>
            ) : <div className="text-sm text-muted">No recorded 2026 games.</div>}
          </Panel>
          <PlayerBuzz playerId={p.id} className="col-span-3" />
        </div>
      )}

      {tab === 'champions' && (
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Champion comfort" right={<span className="text-[10px] text-dim" title="0–200. ~100: can play it like a solid soloQ player. 130: pro-ready, matchups known. 165+: signature — their own tricks and the split-second plays.">0–200 · 100 = solid soloQ · 165+ signature</span>}>
            <div className="grid grid-cols-1 gap-1.5 max-h-[560px] overflow-auto pr-2">
              {pool.slice(0, 40).map(([cid, m]) => (
                <button key={cid} className="flex items-center gap-2 hover:bg-panel2 rounded p-0.5" onClick={() => nav('champions', cid)}>
                  <ChampIcon id={cid} size={28} />
                  <div className="w-28 text-left text-sm truncate">{gd().championById[cid]?.name ?? cid}</div>
                  <div className="flex-1"><Bar value={m} max={MASTERY_MAX} color={masteryTier(m).color} showValue /></div>
                  <div className="w-20 text-[10px] uppercase tracking-wide text-right" style={{ color: masteryTier(m).color }}>{masteryTier(m).label}</div>
                </button>
              ))}
              {!pool.length && <div className="text-sm text-muted">No recorded champions.</div>}
            </div>
          </Panel>
          <Panel title="This season by champion">
            <table className="tbl"><thead><tr><th>Champion</th><th>Games</th><th>Win%</th></tr></thead>
              <tbody>
                {Object.entries(s.champions).sort((a, b) => b[1].games - a[1].games).map(([cid, c]) => (
                  <tr key={cid}><td className="flex items-center gap-2"><ChampIcon id={cid} size={22} />{gd().championById[cid]?.name}</td><td>{c.games}</td><td>{pct(c.wins / c.games)}</td></tr>
                ))}
              </tbody></table>
            {!Object.keys(s.champions).length && <div className="text-sm text-muted">No games this season yet.</div>}
            {mine && <LearnChampion playerId={p.id} />}
          </Panel>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Career mode games"><HistoryTable rows={p.history} /></Panel>
          <Panel title="Real 2026 match history" right={<span className="text-[11px] text-muted">Leaguepedia</span>}>{real === null ? <div className="text-muted text-sm">Loading…</div> : <HistoryTable rows={real} real />}</Panel>
        </div>
      )}

      {tab === 'career' && (
        <Panel title="Career">
          <table className="tbl"><thead><tr><th>Season</th><th>Team</th><th>Games</th><th>Wins</th><th>Titles</th></tr></thead>
            <tbody>{p.career.map((c, i) => <tr key={i}><td>{c.season}</td><td>{c.teamName}</td><td>{c.games}</td><td>{c.wins}</td><td>{c.titles.join(', ')}</td></tr>)}</tbody></table>
          {p.realStats && <div className="text-sm text-muted mt-3">2026 events (real): {p.realStats.events.join(' · ')}</div>}
        </Panel>
      )}

      <RenewModal open={renew} onClose={() => setRenew(false)} playerId={p.id} />
    </div>
  );
}

function HistoryTable({ rows, real }: { rows: MatchHistoryEntry[]; real?: boolean }) {
  const state = useGame();
  if (!rows.length) return <div className="text-sm text-muted">No games.</div>;
  return (
    <table className="tbl">
      <thead><tr><th>Date</th><th>Event</th><th>vs</th><th>Champ</th><th>KDA</th><th>CS</th><th></th></tr></thead>
      <tbody>
        {rows.slice(0, 25).map((r, i) => (
          <tr key={i}>
            <td className="text-muted whitespace-nowrap">{fmtDate(r.date, { month: 'short', day: 'numeric' })}</td>
            <td className="truncate max-w-[160px]" title={r.event}>{r.event}</td>
            <td className="truncate max-w-[120px]">{real ? r.vs : state.teams[r.vs]?.short ?? r.vs}</td>
            <td>{r.champion ? <ChampIcon id={r.champion} size={22} /> : '-'}</td>
            <td className="font-display">{r.k}/{r.d}/{r.a}</td>
            <td>{r.cs}</td>
            <td><span className={`font-bold ${r.win ? 'text-win' : 'text-loss'}`}>{r.win ? 'W' : 'L'}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LearnChampion({ playerId }: { playerId: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const p = state.players[playerId];
  const [q, setQ] = useState('');
  const options = useMemo(() => gd().championsByRole[p.role as Role].filter((c) => (p.champions[c.id] ?? 0) < 130 && c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [q, p]);
  return (
    <div className="mt-4 border-t hairline pt-3">
      <div className="text-xs uppercase text-muted font-bold mb-2">Learn a champion</div>
      {p.learningChampion && <div className="text-sm mb-2 flex items-center gap-2">Currently practising <ChampIcon id={p.learningChampion} size={22} /> <b>{gd().championById[p.learningChampion]?.name}</b> ({Math.round(p.champions[p.learningChampion] ?? 30)})<button className="btn btn-ghost" onClick={() => { p.learningChampion = null; bump(); }}>Stop</button></div>}
      <input className="input w-full mb-2" placeholder="Search champions for this role…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((c) => <button key={c.id} title={c.name} onClick={() => { p.learningChampion = c.id; if (!p.champions[c.id]) p.champions[c.id] = 50; bump(); }}><ChampIcon id={c.id} size={30} /></button>)}
      </div>
    </div>
  );
}

function RenewModal({ open, onClose, playerId }: { open: boolean; onClose: () => void; playerId: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const p = state.players[playerId];
  const team = state.teams[state.userTeamId];
  const demand = p ? salaryDemand(state, p, team) : 0;
  const [salary, setSalary] = useState(demand);
  const [years, setYears] = useState(2);
  useEffect(() => setSalary(demand), [demand, open]);
  if (!p) return null;
  return (
    <Modal open={open} onClose={onClose} title={`New contract for ${p.handle}`}>
      <div className="space-y-3 text-sm">
        <div className="text-muted">Current: {p.contract ? `${money(p.contract.salary)}/yr until ${fmtDate(p.contract.expires)}` : 'none'} · Demand ≈ <b className="text-gold2">{money(demand)}/yr</b></div>
        <label className="block">Yearly salary
          <input type="number" className="input w-full mt-1" value={salary} step={5000} onChange={(e) => setSalary(Number(e.target.value))} />
        </label>
        <div className="flex gap-2">{[1, 2, 3].map((y) => <button key={y} className={`btn ${years === y ? 'btn-gold' : ''}`} onClick={() => setYears(y)}>{y} year{y > 1 ? 's' : ''}</button>)}</div>
        <button className="btn btn-gold w-full justify-center" onClick={() => { const r = offerRenewal(state, p.id, salary, years); notify(r.message); bump(); if (r.ok) onClose(); }}>Offer contract</button>
      </div>
    </Modal>
  );
}
