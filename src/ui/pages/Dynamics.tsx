// Locker room: every player's trust / mood / issues at a glance, the web of relationships between
// teammates (bonds, rivalries, drama) as a matrix, team meetings and paid team-building activities.
import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Player } from '../../engine/types';
import { ROLES, ROLE_LABEL } from '../../engine/types';
import { Panel, Portrait, Pill, Bar, Stat, RoleIcon, Empty, fmtDate, money } from '../components/kit';
import { AffinityBar, IssueChips, PlayerChoiceBox, affColor, signed1 } from '../components/PlayerTalk';
import {
  people, trustLabel, moodOf, pairView, peopleParts, playerRequestLive, approachTitle, talkCheck, talkTo,
  MEETINGS, meetingCheck, teamMeeting, ACTIVITIES, activityCheck, activityCost, teamBuilding, type TeamResult, type TalkAction,
} from '../../engine/management/people';

export default function Dynamics(_props: { id?: string; tab?: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const [res, setRes] = useState<TeamResult | null>(null);
  const [sel, setSel] = useState<[string, string] | null>(null);
  const team = state.teams[state.userTeamId];
  const ps = people(state);
  const order = (p: Player) => { const slot = ROLES.findIndex((r) => team.lineup[r] === p.id); return slot >= 0 ? slot : 10 + ROLES.indexOf(p.role); };
  const roster = team.roster.map((id) => state.players[id]).filter(Boolean).sort((a, b) => order(a) - order(b)) as Player[];
  const starters = new Set(ROLES.map((r) => team.lineup[r]).filter(Boolean) as string[]);

  // pairs
  const pairs: { a: Player; b: Player; v: NonNullable<ReturnType<typeof pairView>> }[] = [];
  for (let i = 0; i < roster.length; i++) for (let j = i + 1; j < roster.length; j++) {
    const v = pairView(state, roster[i].id, roster[j].id);
    if (v) pairs.push({ a: roster[i], b: roster[j], v });
  }
  const bonds = pairs.filter((x) => x.v.kind === 'duo' || x.v.kind === 'friends' || x.v.kind === 'mentor').length;
  const rivalries = pairs.filter((x) => (x.v.kind === 'rivals' && x.v.aff < 0) || x.v.kind === 'clash' || x.v.kind === 'tension').length;
  const drama = pairs.filter((x) => x.v.kind === 'drama').length;
  const avgTrust = roster.length ? roster.reduce((s, p) => s + (ps.players[p.id]?.trust ?? 50), 0) / roster.length : 0;
  const issues = roster.reduce((s, p) => s + (ps.players[p.id]?.issues.filter((i) => i.until >= state.date && i.sev > 0 && !i.hidden).length ?? 0), 0);
  const notable = pairs.filter((x) => x.v.kind !== 'neutral' && !(x.v.kind === 'rivals' && Math.abs(x.v.aff) < 15)).sort((x, y) => Math.abs(y.v.aff) + y.v.heat - (Math.abs(x.v.aff) + x.v.heat));
  const live = ps.requests.filter((r) => playerRequestLive(state, r.id));
  const streak = ps.streak > 0 ? `${ps.streak}-series winning streak` : ps.streak < 0 ? `${-ps.streak}-series losing streak` : 'no series played yet';
  const pairFx = (a: Player, b: Player) => {
    const fa = peopleParts(state, a, team).filter((x) => x.with === b.id).reduce((s, x) => s + x.v, 0);
    const fb = peopleParts(state, b, team).filter((x) => x.with === a.id).reduce((s, x) => s + x.v, 0);
    return [fa, fb];
  };
  const selPair = sel ? pairs.find((x) => (x.a.id === sel[0] && x.b.id === sel[1]) || (x.a.id === sel[1] && x.b.id === sel[0])) : undefined;

  const pairTalk = (a: Player, b: Player, act: TalkAction) => {
    const r = talkTo(state, a.id, act, b.id);
    notify(r.ok ? `${a.handle}: “${r.reply}”` : r.message ?? 'Not possible right now.');
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Locker room</h1>
          <div className="text-muted text-sm">Trust, moods and relationships inside {team.name} · {streak}</div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <Stat label="Chemistry" value={Math.round(team.chemistry)} color={team.chemistry >= 70 ? '#22c55e' : team.chemistry >= 50 ? '#eab308' : '#ef4444'} />
        <Stat label="Avg trust in you" value={Math.round(avgTrust)} sub={trustLabel(avgTrust).label} color={trustLabel(avgTrust).color} />
        <Stat label="Personal issues" value={issues} sub={issues ? 'known to you' : 'none you know of'} color={issues ? '#f97316' : undefined} />
        <Stat label="Bonds" value={bonds} sub="duos · friends · mentors" color={bonds ? '#22c55e' : undefined} />
        <Stat label="Rivalries & tension" value={rivalries} color={rivalries ? '#f97316' : undefined} />
        <Stat label="Drama" value={drama} sub={drama ? 'active right now' : 'all quiet'} color={drama ? '#ef4444' : undefined} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* squad cards */}
        <Panel title="Squad" className="col-span-2" bodyClass="p-3">
          {!roster.length ? <Empty>No players.</Empty> : (
            <div className="grid grid-cols-2 gap-2">
              {roster.map((p) => {
                const me = ps.players[p.id];
                const trust = me?.trust ?? 50;
                const tl = trustLabel(trust);
                const mood = moodOf(state, p);
                const impact = peopleParts(state, p, team).reduce((s, x) => s + x.v, 0);
                const waiting = live.some((r) => r.playerId === p.id);
                return (
                  <div key={p.id} className="panel-flat p-2.5 flex gap-3 hover:border-gold/40 cursor-pointer" onClick={() => nav('player', p.id)}>
                    <Portrait player={p} team={team} size={52} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <RoleIcon role={p.role} size={14} />
                        <span className="font-semibold truncate">{p.handle}</span>
                        <span className={`text-[10px] ${starters.has(p.id) ? 'text-win' : 'text-dim'}`}>{starters.has(p.id) ? 'START' : 'SUB'}</span>
                        {waiting && <span className="text-[10px] font-bold text-gold" title="Waiting for your reply">● reply</span>}
                        <span className="ml-auto"><Pill color={mood.color}>{mood.label}</Pill></span>
                      </div>
                      <div title={tl.label}><Bar label={<span className="text-[10px]">Trust</span>} value={trust} color={tl.color} height={4} /></div>
                      <Bar label={<span className="text-[10px]">Morale</span>} value={p.morale} color="#38bdf8" height={4} />
                      <div className="flex items-center gap-2">
                        <IssueChips state={state} p={p} max={2} />
                        {Math.abs(impact) >= 0.05 && <span className="ml-auto text-[11px] font-display font-bold" title="Locker-room effect on match ratings" style={{ color: impact > 0 ? '#22c55e' : '#ef4444' }}>{signed1(impact)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* team actions */}
        <div className="space-y-4">
          <Panel title="Team meeting">
            <div className="grid grid-cols-2 gap-1.5">
              {MEETINGS.map((m) => {
                const chk = meetingCheck(state);
                return <button key={m.id} disabled={!chk.ok} className="btn justify-center text-xs py-1.5" title={`${m.desc}${chk.why ? `\n\n${chk.why}` : ''}`} onClick={() => { const r = teamMeeting(state, m.id); setRes(r); notify(r.message); bump(); }}>{m.label}</button>;
              })}
            </div>
            {!meetingCheck(state).ok && <div className="text-[11px] text-dim mt-1.5">{meetingCheck(state).why}</div>}
          </Panel>
          <Panel title="Team building">
            <div className="space-y-1.5">
              {ACTIVITIES.map((a) => {
                const chk = activityCheck(state, a.id);
                return (
                  <div key={a.id} className="flex items-center gap-2" title={`${a.desc}${chk.why ? `\n\n${chk.why}` : ''}`}>
                    <div className="flex-1 min-w-0"><div className="text-sm truncate">{a.label}</div><div className="text-[11px] text-dim truncate">{chk.ok ? a.desc : chk.why}</div></div>
                    <button disabled={!chk.ok} className="btn text-xs py-1 shrink-0" onClick={() => { const r = teamBuilding(state, a.id); setRes(r); notify(r.message); bump(); }}>{money(activityCost(state, a.id))}</button>
                  </div>
                );
              })}
            </div>
          </Panel>
          {res && res.ok && (
            <div className="panel-flat p-3 text-sm fadein">
              <div className="text-[11px] uppercase tracking-wider font-bold text-gold2 mb-1">Result</div>
              {res.scene && <div className="text-text/90 mb-1">{res.scene}</div>}
              {res.lines?.map((l, i) => <div key={i} className="text-[13px] italic" style={{ color: l.tone > 0 ? '#86efac' : l.tone < 0 ? '#fca5a5' : '#cbd5e1' }}>{l.text}</div>)}
              {res.effects && <div className="text-[11px] text-dim mt-1">{res.effects}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* relationship matrix */}
        <Panel title="Relationships" className="col-span-2" right={<span className="text-[11px] text-muted">Click a cell for details</span>}>
          {roster.length < 2 ? <Empty>Not enough players.</Empty> : (
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 3 }}>
                <thead>
                  <tr>
                    <th />
                    {roster.map((p) => <th key={p.id} className="text-[11px] font-semibold text-muted px-1 max-w-[70px] truncate" title={p.handle}><div className="flex flex-col items-center gap-0.5"><RoleIcon role={p.role} size={12} /><span className="truncate max-w-[64px]">{p.handle}</span></div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((a) => (
                    <tr key={a.id}>
                      <td className="text-xs font-semibold pr-2 whitespace-nowrap"><span className="inline-flex items-center gap-1"><RoleIcon role={a.role} size={12} />{a.handle}</span></td>
                      {roster.map((b) => {
                        if (a.id === b.id) return <td key={b.id} className="w-[64px] h-[34px] rounded bg-[#0a1120]" />;
                        const v = pairView(state, a.id, b.id);
                        if (!v) return <td key={b.id} />;
                        const c = affColor(v.aff, v.heat);
                        const active = sel && ((sel[0] === a.id && sel[1] === b.id) || (sel[0] === b.id && sel[1] === a.id));
                        return (
                          <td key={b.id} className="w-[64px] h-[34px] rounded text-center cursor-pointer select-none" style={{ background: `${c}${v.kind === 'neutral' ? '22' : '38'}`, boxShadow: active ? `inset 0 0 0 2px ${c}` : `inset 0 0 0 1px ${c}55` }}
                            title={`${a.handle} & ${b.handle}: ${v.label} (affinity ${v.aff}${v.heat ? `, heat ${v.heat}` : ''})`} onClick={() => setSel([a.id, b.id])}>
                            <div className="text-[12px] font-display font-bold leading-none" style={{ color: c }}>{v.kind !== 'neutral' ? v.icon + ' ' : ''}{v.aff}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                <Pill color="#22c55e">◆ Duo synergy</Pill><Pill color="#84cc16">♥ Friends</Pill><Pill color="#38bdf8">✦ Mentor</Pill><Pill color="#eab308">⚔ Rivals (same role)</Pill>
                <Pill color="#fb923c">! Tension</Pill><Pill color="#f97316">✕ Clash</Pill><Pill color="#ef4444">‼ Drama</Pill>
              </div>
            </div>
          )}
        </Panel>

        {/* selected pair / notable list */}
        <Panel title={selPair ? `${selPair.a.handle} & ${selPair.b.handle}` : 'Notable relationships'} right={selPair ? <button className="btn btn-ghost text-xs py-0.5" onClick={() => setSel(null)}>✕</button> : undefined}>
          {selPair ? (() => {
            const { a, b, v } = selPair;
            const [fa, fb] = pairFx(a, b);
            const acts: { act: TalkAction; label: string }[] = [{ act: 'mediate', label: 'Mediate' }, { act: 'pairup', label: 'Pair them up' }, { act: 'mentor', label: `${a.handle} mentors ${b.handle}` }];
            return (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><Pill color={v.color}>{v.icon} {v.label}</Pill>{v.duoQ && <Pill color="#38bdf8">paired up</Pill>}</div>
                <div className="flex items-center gap-2"><span className="text-muted text-xs w-16">Affinity</span><AffinityBar v={v.aff} heat={v.heat} width={140} /><b style={{ color: affColor(v.aff, v.heat) }}>{v.aff}</b></div>
                {v.heat > 0 && <div className="flex items-center gap-2"><span className="text-muted text-xs w-16">Drama</span><div className="w-[140px]"><Bar value={v.heat} color="#ef4444" showValue={false} height={5} /></div><b className="text-loss">{v.heat}</b></div>}
                <div className="text-xs text-muted">{ROLE_LABEL[a.role]} & {ROLE_LABEL[b.role]} · together since {fmtDate(v.since, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <div className="text-xs">
                  Match effect: {(starters.has(a.id) && starters.has(b.id)) || Math.abs(fa) + Math.abs(fb) > 0.04
                    ? <><b style={{ color: fa >= 0 ? '#86efac' : '#fca5a5' }}>{a.handle} {signed1(fa)}</b> · <b style={{ color: fb >= 0 ? '#86efac' : '#fca5a5' }}>{b.handle} {signed1(fb)}</b></>
                    : <span className="text-dim">only when both start (or compete for one spot)</span>}
                </div>
                {v.last && <div className="text-xs text-text/85 border-l-2 pl-2" style={{ borderColor: v.last.tone > 0 ? '#22c55e' : '#ef4444' }}><span className="text-dim">{fmtDate(v.last.date, { month: 'short', day: 'numeric' })}:</span> {v.last.text}</div>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {acts.map((x) => {
                    const chk = talkCheck(state, a.id, x.act);
                    const ok = chk.ok && !!chk.targets?.some((t) => t.id === b.id);
                    return <button key={x.act} disabled={!ok} className="btn text-xs py-1" title={ok ? `Uses today’s conversation with ${a.handle}` : chk.why ?? 'Not applicable to this pair'} onClick={() => pairTalk(a, b, x.act)}>{x.label}</button>;
                  })}
                </div>
              </div>
            );
          })() : (
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
              {notable.map(({ a, b, v }) => {
                const [fa, fb] = pairFx(a, b);
                const fx = fa + fb;
                return (
                  <button key={a.id + b.id} className="w-full text-left flex items-center gap-2 text-xs hover:bg-panel2 rounded px-1 py-0.5" onClick={() => setSel([a.id, b.id])}>
                    <span className="w-36 truncate">{a.handle} & {b.handle}</span>
                    <Pill color={v.color}>{v.icon} {v.label}</Pill>
                    {Math.abs(fx) >= 0.05 && <span className="ml-auto" style={{ color: fx > 0 ? '#86efac' : '#fca5a5' }}>{signed1(fx)}</span>}
                  </button>
                );
              })}
              {!notable.length && <div className="text-sm text-muted">No strong bonds or tensions yet — relationships grow with time, results and how you manage them.</div>}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel title="Locker room feed" className="col-span-2">
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
            {ps.feed.slice(0, 40).map((f, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: f.tone > 0 ? '#22c55e' : f.tone < 0 ? '#ef4444' : '#64748b' }} />
                <span className="text-dim text-xs w-12 shrink-0 pt-0.5">{fmtDate(f.date, { month: 'short', day: 'numeric' })}</span>
                <span className="text-text/90">{f.text}</span>
              </div>
            ))}
            {!ps.feed.length && <div className="text-sm text-muted">Nothing to report yet.</div>}
          </div>
        </Panel>
        <Panel title="Waiting for your reply" right={live.length ? <button className="btn btn-ghost text-xs py-0.5" onClick={() => nav('inbox')}>Inbox →</button> : undefined}>
          {live.length ? (
            <div className="space-y-3">
              {live.slice(0, 3).map((r) => {
                const m = state.inbox.find((x) => x.action?.type === 'playerChoice' && x.action.payload === r.id);
                return (
                  <div key={r.id}>
                    <div className="text-[11px] text-muted mb-1">{approachTitle(r.kind)} · {fmtDate(r.date, { month: 'short', day: 'numeric' })}{m ? ` · “${m.subject}”` : ''}</div>
                    {m && <div className="text-[13px] text-text/85 mb-2 whitespace-pre-line">{m.body}</div>}
                    <PlayerChoiceBox state={state} reqId={r.id} />
                  </div>
                );
              })}
            </div>
          ) : <div className="text-sm text-muted">No player is waiting on you.</div>}
        </Panel>
      </div>
    </div>
  );
}
