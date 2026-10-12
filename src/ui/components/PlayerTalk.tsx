// Locker-room UI for one player: trust / mood / issues, one-on-one talks with the player's reply,
// relationships with teammates and recent interactions. Also the Inbox choice box for player approaches.
import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Player } from '../../engine/types';
import { ROLE_LABEL } from '../../engine/types';
import { Panel, Portrait, Pill, Bar, RoleIcon, fmtDate } from './kit';
import {
  people, person, talkCheck, talkTo, TALK_ACTIONS, trustLabel, moodOf, pairView, peopleParts, ISSUE_INFO, playerRequestLive, playerRequest,
  resolvePlayerChoice, approachTitle, type TalkAction, type TalkResult, type TalkMeta,
} from '../../engine/management/people';

const REACTION: Record<string, { label: string; color: string }> = {
  pos: { label: 'Landed well', color: '#22c55e' },
  meh: { label: 'Shrugged it off', color: '#eab308' },
  neg: { label: 'Backfired', color: '#ef4444' },
};
const GROUPS: { id: TalkMeta['group']; label: string; color: string }[] = [
  { id: 'support', label: 'Support', color: '#38bdf8' },
  { id: 'demand', label: 'Demand', color: '#f97316' },
  { id: 'team', label: 'Teammates', color: '#a78bfa' },
];
export const signed1 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
export const affColor = (v: number, heat = 0) => (heat >= 30 ? '#ef4444' : v >= 35 ? '#22c55e' : v >= 10 ? '#84cc16' : v > -20 ? '#64748b' : v > -45 ? '#f97316' : '#ef4444');

/** Diverging -100..100 affinity bar. */
export function AffinityBar({ v, heat = 0, width = 110 }: { v: number; heat?: number; width?: number }) {
  return (
    <div className="relative h-1.5 rounded-full bg-[#0a1120] shrink-0" style={{ width }} title={`Affinity ${Math.round(v)}${heat ? ` · drama heat ${Math.round(heat)}` : ''}`}>
      <div className="absolute -top-0.5 -bottom-0.5 w-px bg-[#2a3a5c]" style={{ left: '50%' }} />
      <div className="absolute h-full rounded-full" style={{ left: v >= 0 ? '50%' : `${50 + v / 2}%`, width: `${Math.abs(v) / 2}%`, background: affColor(v, heat) }} />
    </div>
  );
}

/** Issue chips (visible issues only). */
export function IssueChips({ state, p, max = 4 }: { state: GameState; p: Player; max?: number }) {
  const me = state.people?.players[p.id];
  const issues = (me?.issues ?? []).filter((i) => i.until >= state.date && i.sev > 0 && !i.hidden).slice(0, max);
  if (!issues.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {issues.map((i) => {
        const inf = ISSUE_INFO[i.kind];
        return <span key={i.id} title={`Since ${fmtDate(i.since, { month: 'short', day: 'numeric' })} · expected to ease by ${fmtDate(i.until, { month: 'short', day: 'numeric' })}${i.treated ? ' · being handled' : ''}`}><Pill color={inf?.color ?? '#f97316'}>{inf?.label ?? i.kind} {'●'.repeat(i.sev)}</Pill></span>;
      })}
    </div>
  );
}

export default function PlayerTalk({ playerId }: { playerId: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const [last, setLast] = useState<{ pid: string; action: TalkAction; res: TalkResult } | null>(null);
  const [targets, setTargets] = useState<Partial<Record<TalkAction, string>>>({});
  const [open, setOpen] = useState(false);
  const p = state.players[playerId];
  if (!p || p.teamId !== state.userTeamId) return null;
  const team = state.teams[state.userTeamId];
  const ps = people(state);
  const me = person(state, playerId);
  const tl = trustLabel(me.trust);
  const mood = moodOf(state, p);
  const parts = peopleParts(state, p, team);
  const impact = parts.reduce((s, x) => s + x.v, 0);
  const promises = me.promises.filter((x) => x.status === 'open');
  const pending = ps.requests.filter((r) => r.playerId === playerId && playerRequestLive(state, r.id));
  const mates = team.roster.filter((id) => id !== playerId && state.players[id]);
  const away = me.away && me.away.until >= state.date ? me.away : null;
  const reply = last && last.pid === playerId ? last : null;

  const run = (a: TalkAction) => {
    const opts = talkCheck(state, playerId, a).targets;
    const res = talkTo(state, playerId, a, opts?.some((t) => t.id === targets[a]) ? targets[a] : opts?.[0]?.id);
    if (!res.ok) { notify(res.message ?? 'Not possible right now.'); return; }
    setLast({ pid: playerId, action: a, res });
    bump();
  };

  return (
    <Panel title={`Talk to ${p.handle}`} right={<span className="text-[11px] text-muted">One conversation per player per day</span>}>
      <div className="grid gap-5" style={{ gridTemplateColumns: '240px 1fr' }}>
        {/* state */}
        <div className="space-y-2.5 min-w-0">
          <div>
            <Bar label={<span className="text-[11px]">Trust in you</span>} value={me.trust} color={tl.color} height={5} />
            <div className="text-[11px] mt-0.5" style={{ color: tl.color }}>{tl.label}</div>
          </div>
          <Bar label={<span className="text-[11px]">Morale</span>} value={p.morale} color="#38bdf8" height={5} />
          <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Mood</span><Pill color={mood.color}>{mood.label}</Pill></div>
          <div className="flex items-center justify-between text-[11px]" title={parts.length ? parts.map((x) => `${x.label}: ${signed1(x.v)}`).join('\n') : 'No locker-room effect right now'}>
            <span className="text-muted">Match impact (locker room)</span>
            <span className="font-display font-bold text-sm" style={{ color: impact > 0.05 ? '#22c55e' : impact < -0.05 ? '#ef4444' : '#8a97b3' }}>{parts.length ? signed1(impact) : '±0'}</span>
          </div>
          {parts.length > 0 && <div className="space-y-0.5">{parts.slice(0, 6).map((x, i) => <div key={i} className="flex justify-between text-[11px]"><span className="text-dim truncate">{x.label}</span><span style={{ color: x.v >= 0 ? '#86efac' : '#fca5a5' }}>{signed1(x.v)}</span></div>)}</div>}
          <IssueChips state={state} p={p} />
          {away && <div className="text-[11px] text-muted">Away ({away.reason}) until {fmtDate(away.until, { month: 'short', day: 'numeric' })}{away.standIn ? ` · ${state.players[away.standIn]?.handle} starts meanwhile` : ''}</div>}
          {promises.map((x, i) => <div key={i} className="text-[11px] text-gold2">Your promise: {x.text}{x.kind === 'playtime' ? ` (${x.got ?? 0}/${x.need})` : ''} — by {fmtDate(x.deadline, { month: 'short', day: 'numeric' })}</div>)}
          {pending.length > 0 && <button className="btn btn-gold w-full justify-center text-xs py-1" onClick={() => nav('inbox')}>{p.handle} is waiting for your reply →</button>}
        </div>

        {/* talks */}
        <div className="min-w-0">
          <div className="space-y-2">
            {GROUPS.map((g) => (
              <div key={g.id} className="flex items-start gap-2">
                <div className="w-20 shrink-0 text-[10px] uppercase tracking-wider font-bold pt-2" style={{ color: g.color }}>{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {TALK_ACTIONS.filter((a) => a.group === g.id).map((a) => {
                    const chk = talkCheck(state, playerId, a.id);
                    const tgt = chk.targets?.some((t) => t.id === targets[a.id]) ? targets[a.id] : chk.targets?.[0]?.id;
                    return (
                      <div key={a.id} className="flex items-center">
                        <button disabled={!chk.ok} className={`btn py-1 px-2.5 text-xs ${chk.targets ? 'rounded-r-none' : ''}`} title={`${a.desc}${chk.why ? `\n\n${chk.why}` : chk.note ? `\n\n${chk.note}` : ''}`} onClick={() => run(a.id)}>
                          {a.label.replace('…', '')}
                        </button>
                        {chk.ok && chk.targets && (
                          <select className="input py-1 text-xs rounded-l-none border-l-0 max-w-[130px]" value={tgt} onChange={(e) => setTargets((t) => ({ ...t, [a.id]: e.target.value }))}>
                            {chk.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 min-h-[64px]">
            {reply ? (
              <div className="flex gap-3 items-start fadein">
                <Portrait player={p} team={team} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="panel-flat px-3 py-2 relative">
                    <div className="text-[11px] text-muted mb-0.5">You: <b className="text-text">{TALK_ACTIONS.find((a) => a.id === reply.action)?.label.replace('…', '')}</b> <Pill color={REACTION[reply.res.reaction ?? 'meh'].color}>{REACTION[reply.res.reaction ?? 'meh'].label}</Pill></div>
                    <div className="text-sm italic text-text/90">“{reply.res.reply}”</div>
                  </div>
                  {reply.res.effects && <div className="text-[11px] text-dim mt-1">{reply.res.effects}</div>}
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-dim leading-relaxed">
                How {p.handle} reacts depends on their personality (composure, ego, professionalism, temper), how much they trust you, recent results — and repetition: praise every day stops meaning anything, and constant criticism breaks trust.
              </div>
            )}
          </div>
        </div>
      </div>

      <button className="btn btn-ghost text-xs mt-3 px-2 py-1" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Relationships & history</button>
      {open && (
        <div className="grid grid-cols-2 gap-5 mt-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">With teammates</div>
            <div className="space-y-1">
              {mates.map((id) => {
                const q = state.players[id];
                const v = pairView(state, playerId, id);
                if (!v) return null;
                const fx = parts.filter((x) => x.with === id).reduce((s, x) => s + x.v, 0);
                return (
                  <div key={id} className="flex items-center gap-2 text-xs" title={v.last ? `${fmtDate(v.last.date, { month: 'short', day: 'numeric' })}: ${v.last.text}` : undefined}>
                    <RoleIcon role={q.role} size={14} />
                    <button className="w-20 truncate text-left hover:underline" onClick={() => nav('player', id)}>{q.handle}</button>
                    <AffinityBar v={v.aff} heat={v.heat} width={90} />
                    <span className="w-7 text-right font-display font-bold" style={{ color: affColor(v.aff, v.heat) }}>{v.aff}</span>
                    <Pill color={v.color}>{v.icon} {v.label}</Pill>
                    {v.duoQ && <Pill color="#38bdf8">paired up</Pill>}
                    {Math.abs(fx) >= 0.05 && <span className="ml-auto text-[11px]" style={{ color: fx > 0 ? '#86efac' : '#fca5a5' }}>{signed1(fx)}</span>}
                  </div>
                );
              })}
              {!mates.length && <div className="text-sm text-muted">No teammates.</div>}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">Recent interactions</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {me.log.map((l, i) => (
                <div key={i} className="text-xs flex gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: l.tone > 0 ? '#22c55e' : l.tone < 0 ? '#ef4444' : '#eab308' }} />
                  <div className="min-w-0">
                    <span className="text-dim">{fmtDate(l.date, { month: 'short', day: 'numeric' })}</span> <span className="text-text">{l.text}</span>
                    {l.reply && <div className="italic text-muted truncate" title={l.reply}>“{l.reply}”</div>}
                  </div>
                </div>
              ))}
              {!me.log.length && <div className="text-sm text-muted">You haven’t really talked yet.</div>}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Inbox: answer a player's approach (or a staff report about misconduct). */
export function PlayerChoiceBox({ state, reqId }: { state: GameState; reqId: string }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const req = playerRequest(state, reqId);
  if (!req) return <div className="panel-flat p-4 text-sm text-muted">This conversation is no longer on file.</div>;
  const live = playerRequestLive(state, reqId);
  const p = state.players[req.playerId];
  const team = state.teams[state.userTeamId];
  const chosen = req.options.find((o) => o.id === req.resolved);
  const me = p ? state.people?.players[p.id] : undefined;
  const incident = req.kind === 'incident';
  return (
    <div className={`panel-flat p-4 ${live ? 'border-gold/40' : ''}`}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {p && <Portrait player={p} team={team} size={30} />}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider font-bold text-gold2 truncate">{incident ? `How do you handle ${p?.handle ?? 'this'}?` : `${p?.handle ?? 'Your player'} wants an answer`}</div>
            {p && me && <div className="text-[11px] text-muted">{approachTitle(req.kind)} · trust {Math.round(me.trust)} ({trustLabel(me.trust).label.toLowerCase()}) · {ROLE_LABEL[p.role]}</div>}
          </div>
        </div>
        <div className="text-[11px] text-dim shrink-0">{live ? `Reply by ${fmtDate(req.expires, { month: 'short', day: 'numeric' })} — silence is an answer too` : chosen ? 'Answered' : req.resolved === 'left' ? 'Closed' : 'Expired'}</div>
      </div>
      {live ? (
        <div className="grid gap-2">
          {req.options.map((o) => (
            <button key={o.id} disabled={busy} className="btn justify-between text-left w-full" onClick={() => { setBusy(true); const r = resolvePlayerChoice(state, reqId, o.id); notify(r.message); bump(); setBusy(false); }}>
              <span>{o.label}</span>
              {o.hint && <span className="text-[11px] text-muted font-normal text-right">{o.hint}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm">
          {chosen && <div className="mb-1"><Pill color="#f0c674">{chosen.label}</Pill></div>}
          <div className="whitespace-pre-line text-text/90">{req.outcome ?? 'No reply was sent.'}</div>
        </div>
      )}
      {p && p.teamId === state.userTeamId && <button className="btn btn-ghost text-xs mt-2 px-2 py-1" onClick={() => nav('player', p.id)}>Open {p.handle}’s profile →</button>}
    </div>
  );
}
