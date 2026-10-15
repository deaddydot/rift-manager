// Scrims: find partners, send invitations (clubs answer the next day, based on your power, fame, rapport and their
// schedule), answer theirs, and see what the blocks taught the team. Engine: engine/management/scrims.ts.
import { Fragment, useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Team } from '../../engine/types';
import { Panel, Stat, TeamLogo, Rating, Bar, Pill, Empty, num, fmtDate } from '../components/kit';
import {
  scrimState, scrimCandidates, scrimOdds, bookableDays, sendScrimInvite, cancelScrim, answerScrimInvite, scrimWeek, scrimTrainingMult,
  powerOf, fameOf, partnerOf, blockQuality, openBlocks, MAX_OPEN, SCRIM_GAMES,
} from '../../engine/management/scrims';

type TierFilter = 'all' | 1 | 2 | 3;
const shortDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function Scrims() {
  const state = useGame();
  const v = useStore((s) => s.v);
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const s = scrimState(state);
  const [tier, setTier] = useState<TierFilter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const days = bookableDays(state);
  const firstFree = days.find((d) => !d.match && !d.booked)?.date ?? days[0]?.date;
  const [day, setDay] = useState<Record<string, string>>({});
  const myPower = powerOf(state, team);
  const week = scrimWeek(state);
  const plan = state.trainingPlan;
  const mult = scrimTrainingMult(state, plan?.scrims ?? 40);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return scrimCandidates(state)
      .filter((t) => tier === 'all' || (state.leagues[t.leagueId]?.tier ?? 3) === tier)
      .filter((t) => !qq || t.name.toLowerCase().includes(qq) || t.short.toLowerCase().includes(qq))
      .map((t) => ({ t, power: powerOf(state, t), odds: scrimOdds(state, t.id), pr: s.partners[t.id] }))
      .sort((a, b) => b.power - a.power);
  }, [state, v, tier, q]);

  const upcoming = openBlocks(state).sort((a, b) => a.date.localeCompare(b.date));
  const incoming = upcoming.filter((b) => b.dir === 'in' && b.status === 'pending');
  const booked = upcoming.filter((b) => !(b.dir === 'in' && b.status === 'pending'));
  const played = s.blocks.filter((b) => b.status === 'played' && b.result).slice(0, 12);
  const replies = s.blocks.filter((b) => b.dir === 'out' && (b.status === 'declined' || b.status === 'accepted' || b.status === 'played') && b.reply).slice(0, 6);
  const openCount = upcoming.filter((b) => b.dir === 'out' || b.status === 'accepted').length;

  const invite = (t: Team) => {
    const r = sendScrimInvite(state, t.id, day[t.id] ?? firstFree);
    notify(r.message);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Scrims</h1>
          <div className="text-sm text-muted mt-1">Invite clubs to practise against. Strong partners teach the most — but they pick who they play with.</div>
        </div>
        <button className="btn" onClick={() => nav('training')}>Training plan →</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="This week" value={week.blocks ? `${week.w}-${week.l}` : '—'} sub={week.blocks ? `${week.blocks} block${week.blocks > 1 ? 's' : ''} played (last 7 days)` : 'No scrims played in the last 7 days'} />
        <Stat label="Practice quality" value={`×${week.q.toFixed(2)}`} sub={week.blocks ? (week.blocks < 3 ? 'Play 3+ blocks for the full effect' : 'Full week of scrims') : 'Usual partners at your level'} color={week.q >= 1.06 ? '#22c55e' : week.q <= 0.96 ? '#f97316' : undefined} />
        <Stat label="Training effect" value={`${mult >= 1 ? '+' : ''}${Math.round((mult - 1) * 100)}%`} sub={`Scrims are ${plan?.scrims ?? 40}% of your training week`} color={mult > 1.01 ? '#22c55e' : mult < 0.99 ? '#f97316' : undefined} />
        <Stat label="Your lineup" value={Math.round(myPower)} sub={`Fame ${fameOf(team).toFixed(1)} · ${num(team.fans)} fans`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <Panel title="Find a partner" right={<span className="text-[11px] text-muted">{openCount}/{MAX_OPEN} open blocks</span>} bodyClass="p-0">
          <div className="flex gap-1.5 flex-wrap items-center px-4 py-2.5 border-b hairline">
            {(['all', 1, 2, 3] as TierFilter[]).map((t) => (
              <button key={t} className={`chip px-2.5 py-0.5 text-[11px] ${tier === t ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setTier(t)}>{t === 'all' ? 'All tiers' : `Tier ${t}`}</button>
            ))}
            <input className="input ml-auto w-48 py-1 text-xs" placeholder="Search clubs…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {rows.length === 0 ? <Empty>No clubs to scrim with here.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Club</th><th title="Average rating of their starting five">Lineup</th><th>Fans</th><th title="0–100, 50 = neutral. Grows with every block played.">Rapport</th><th title="Games won-lost against them in scrims">Record</th><th title="Chance they say yes (for the day you pick)">Will they?</th><th title="How much your players learn from a block with them">Practice</th><th></th></tr></thead>
              <tbody>{rows.map(({ t, power, odds, pr }) => {
                const pick = day[t.id] ?? firstFree;
                const dayOdds = pick ? scrimOdds(state, t.id, pick) : odds;
                const waiting = s.blocks.some((b) => b.teamId === t.id && b.dir === 'out' && b.status === 'pending');
                const isOpen = open === t.id;
                const qv = blockQuality(myPower, power, false);
                return (
                  <Fragment key={t.id}>
                    <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : t.id)}>
                      <td>
                        <div className="flex items-center gap-2">
                          <TeamLogo team={t} size={24} />
                          <div className="min-w-0">
                            <button className="font-semibold hover:underline truncate" onClick={(e) => { e.stopPropagation(); nav('team', t.id); }}>{t.name}</button>
                            <div className="text-[11px] text-dim">{state.leagues[t.leagueId]?.name ?? t.leagueId} · tier {state.leagues[t.leagueId]?.tier ?? 3}{t.region !== team.region ? ' · at the event' : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td><Rating v={power} size="sm" /></td>
                      <td className="text-xs">{num(t.fans)}</td>
                      <td className="w-24"><Bar value={pr?.rapport ?? 50} showValue={false} color={(pr?.rapport ?? 50) >= 50 ? '#38bdf8' : '#f97316'} height={5} /></td>
                      <td className="text-xs">{pr?.blocks ? <span><span className="text-win">{pr.w}</span>-<span className="text-loss">{pr.l}</span></span> : <span className="text-dim">—</span>}</td>
                      <td className="whitespace-nowrap"><span className="text-xs font-semibold" style={{ color: dayOdds.color }}>{dayOdds.label}</span> <span className="text-[11px] text-dim">{Math.round(dayOdds.p * 100)}%</span></td>
                      <td className="text-xs font-display font-bold" style={{ color: qv >= 1.06 ? '#22c55e' : qv <= 0.95 ? '#f97316' : '#cbd5e1' }}>×{qv.toFixed(2)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {waiting ? <span className="text-[11px] text-muted">Waiting…</span> : (
                          <div className="flex items-center gap-1">
                            <select className="input py-0.5 text-[11px] w-28" value={pick} onChange={(e) => setDay({ ...day, [t.id]: e.target.value })}>
                              {days.map((d) => <option key={d.date} value={d.date} disabled={d.match || d.booked}>{shortDay(d.date)}{d.match ? ' · match' : d.booked ? ' · booked' : ''}</option>)}
                            </select>
                            <button className="btn btn-gold py-0.5 px-2 text-xs" disabled={openCount >= MAX_OPEN || !pick} onClick={() => invite(t)}>Invite</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={8} className="bg-[#0b1322]">
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs py-1">
                          {dayOdds.factors.length ? dayOdds.factors.map((f, i) => (
                            <div key={i} className="flex items-center justify-between gap-2"><span className="text-muted">{f.text}</span><span className={f.v >= 0 ? 'text-win' : 'text-loss'}>{f.v >= 0 ? '▲' : '▼'}{Math.abs(f.v) >= 1.5 ? (f.v >= 0 ? '▲' : '▼') : ''}</span></div>
                          )) : <span className="text-muted">Nothing stands out either way.</span>}
                          {pr?.last && <div className="text-dim sm:col-span-2 pt-1">Last scrimmed {fmtDate(pr.last)} · {pr.blocks} block{pr.blocks === 1 ? '' : 's'} together</div>}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          )}
        </Panel>

        <div className="space-y-4">
          {incoming.length > 0 && (
            <Panel title="Invitations for you">
              <div className="space-y-2">{incoming.map((b) => {
                const t = state.teams[b.teamId];
                const qv = blockQuality(myPower, powerOf(state, t), false);
                return (
                  <div key={b.id} className="panel-flat p-2.5 flex items-center gap-2">
                    <TeamLogo team={t} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{t?.name}</div>
                      <div className="text-[11px] text-dim">{shortDay(b.date)} · lineup {Math.round(powerOf(state, t))} · practice ×{qv.toFixed(2)}</div>
                    </div>
                    <button className="btn btn-gold py-0.5 px-2 text-xs" onClick={() => { notify(answerScrimInvite(state, b.id, true).message); bump(); }}>Accept</button>
                    <button className="btn py-0.5 px-2 text-xs" onClick={() => { notify(answerScrimInvite(state, b.id, false).message); bump(); }}>Decline</button>
                  </div>
                );
              })}</div>
            </Panel>
          )}

          <Panel title="Next 7 days">
            <div className="space-y-1">{days.map((d) => {
              const bl = booked.filter((b) => b.date === d.date);
              return (
                <div key={d.date} className="flex items-center gap-2 text-sm py-1 border-b border-[#141e33] last:border-0">
                  <span className="w-24 text-xs text-muted shrink-0">{shortDay(d.date)}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {d.match && <span className="text-xs text-loss font-semibold">Official match</span>}
                    {bl.map((b) => {
                      const t = state.teams[b.teamId];
                      return (
                        <div key={b.id} className="flex items-center gap-1.5">
                          <TeamLogo team={t} size={18} />
                          <span className="text-xs font-semibold truncate">{t?.short}</span>
                          {b.status === 'pending' ? <Pill color="#c8aa6e">asked</Pill> : <Pill color="#22c55e">booked</Pill>}
                          <button className="ml-auto text-[11px] text-dim hover:text-loss" title={b.status === 'accepted' ? 'Cancelling a booked block costs rapport' : 'Withdraw the invitation'} onClick={() => { notify(cancelScrim(state, b.id).message); bump(); }}>✕</button>
                        </div>
                      );
                    })}
                    {!d.match && !bl.length && <span className="text-xs text-dim">—</span>}
                  </div>
                </div>
              );
            })}</div>
          </Panel>

          {replies.length > 0 && (
            <Panel title="Latest replies">
              <div className="space-y-2">{replies.map((b) => {
                const t = state.teams[b.teamId];
                const yes = b.status !== 'declined';
                return (
                  <div key={b.id} className="text-xs">
                    <div className="flex items-center gap-1.5 mb-0.5"><TeamLogo team={t} size={16} /><span className="font-semibold">{t?.short}</span><Pill color={yes ? '#22c55e' : '#ef4444'}>{yes ? 'yes' : 'no'}</Pill><span className="text-dim ml-auto">{shortDay(b.date)}</span></div>
                    <div className="text-muted italic leading-snug">“{b.reply}”</div>
                  </div>
                );
              })}</div>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Recent blocks" bodyClass="p-0">
        {played.length === 0 ? <Empty>No scrims played yet. Book a block above — results show up here and in a weekly report from your coaches.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Against</th><th>Games</th><th>Practice</th><th>Standout</th><th>Coaches’ notes</th></tr></thead>
            <tbody>{played.map((b) => {
              const t = state.teams[b.teamId];
              const r = b.result!;
              const st = r.standout ? state.players[r.standout] : undefined;
              return (
                <tr key={b.id}>
                  <td className="text-xs whitespace-nowrap">{shortDay(b.date)}</td>
                  <td><div className="flex items-center gap-1.5"><TeamLogo team={t} size={18} /><span className="text-sm font-semibold">{t?.short}</span></div></td>
                  <td className="font-display font-bold"><span className={r.w > r.l ? 'text-win' : 'text-loss'}>{r.w}-{r.l}</span></td>
                  <td className="text-xs font-display font-bold" style={{ color: r.q >= 1.06 ? '#22c55e' : r.q <= 0.95 ? '#f97316' : '#cbd5e1' }}>×{r.q.toFixed(2)}</td>
                  <td className="text-xs">{st ? <button className="hover:underline" onClick={() => nav('player', st.id)}>{st.handle}</button> : '—'}</td>
                  <td className="text-xs text-muted">{r.note}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="How scrims work">
        <div className="grid md:grid-cols-3 gap-4 text-xs text-muted leading-relaxed">
          <p><b className="text-text">Who says yes.</b> Clubs want partners at least as strong as themselves. A stronger lineup and a bigger name (fans, prestige) open doors; a lower league, a weak lineup, bad rapport or an official match against each other within ten days close them. They answer the day after you ask. Strong, famous clubs also invite you.</p>
          <p><b className="text-text">What it teaches.</b> A block is {SCRIM_GAMES} games. Practice quality runs from ×0.85 against much weaker teams to ×1.30 against much stronger ones. A partner within about 4 points of your level matches your usual practice, and close blocks (3-2, 2-3) add a little. Three or more blocks a week give the full effect. It scales the scrims share of your training plan, so a 40% scrim week against top partners means roughly +20% growth for everyone on the roster.</p>
          <p><b className="text-text">Side effects.</b> Every block adds a little fatigue and chemistry. Results against expectations move morale. Your staff learn about the other roster, which helps your scouting. Rapport grows with each block (cancelling a booked one hurts it), and results against famous clubs tend to leak to the fans and to creators.</p>
        </div>
      </Panel>
    </div>
  );
}
