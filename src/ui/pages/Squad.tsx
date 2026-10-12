import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import { Panel, Portrait, Rating, RoleIcon, money, fmtDate, ageOf, flag, Modal, ROLE_COLORS, ratingColor, Bar } from '../components/kit';
import { ROLES, ROLE_LABEL, type Role, type Player } from '../../engine/types';
import { overall } from '../../engine/setup';
import { TRAITS } from '../../engine/traits';
import { effective, headCoach } from '../../engine/season/prep';

export default function Squad() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const team = state.teams[state.userTeamId];
  const [pickRole, setPickRole] = useState<Role | null>(null);
  const [sort, setSort] = useState<'role' | 'ovr' | 'age' | 'salary' | 'morale'>('role');
  const roster = team.roster.map((id) => state.players[id]).filter(Boolean) as Player[];
  const sorted = [...roster].sort((a, b) => {
    if (sort === 'ovr') return overall(b.attributes, b.role) - overall(a.attributes, a.role);
    if (sort === 'age') return (ageOf(a.birthdate, state.date) ?? 99) - (ageOf(b.birthdate, state.date) ?? 99);
    if (sort === 'salary') return (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0);
    if (sort === 'morale') return b.morale - a.morale;
    return ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || overall(b.attributes, b.role) - overall(a.attributes, a.role);
  });
  const lineupStrength = Math.round(ROLES.reduce((s, r) => { const id = team.lineup[r]; const p = id ? state.players[id] : null; return s + (p ? overall(effective(state, p, team, r), r) : 30); }, 0) / 5);
  const coach = headCoach(state, team);

  const assign = (role: Role, p: Player) => {
    for (const r of ROLES) if (team.lineup[r] === p.id) team.lineup[r] = null;
    team.lineup[role] = p.id;
    for (const q of roster) q.isSub = !Object.values(team.lineup).includes(q.id);
    if (p.role !== role) useStore.getState().notify(`${p.handle} will play off-role (${ROLE_LABEL[role]}) — expect a performance penalty.`);
    setPickRole(null);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Squad</h1>
          <div className="text-muted text-sm">{roster.length} players · chemistry {Math.round(team.chemistry)} · head coach {coach ? coach.handle : 'none'}</div>
        </div>
        <div className="flex items-center gap-3"><span className="text-muted text-sm">Starting five (effective)</span><Rating v={lineupStrength} size="lg" /></div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {ROLES.map((r) => {
          const id = team.lineup[r];
          const p = id ? state.players[id] : null;
          const e = p ? effective(state, p, team, r) : null;
          return (
            <div key={r} className="panel p-3 flex flex-col items-center gap-2 relative" style={{ borderTop: `3px solid ${ROLE_COLORS[r]}` }}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: ROLE_COLORS[r] }}><RoleIcon role={r} />{ROLE_LABEL[r]}</div>
              {p ? (
                <>
                  <button onClick={() => nav('player', p.id)}><Portrait player={p} team={team} size={96} /></button>
                  <button className="font-display text-xl font-bold hover:underline" onClick={() => nav('player', p.id)}>{p.handle}</button>
                  <div className="flex items-center gap-2"><Rating v={overall(e!, r)} size="sm" />{p.role !== r && <span className="text-[11px] text-orange-400">off-role</span>}</div>
                  <div className="w-full space-y-1">
                    <Bar value={p.morale} label={<span className="text-[10px]">Morale</span>} showValue={false} height={4} color="#38bdf8" />
                    <Bar value={50 + p.form * 5} label={<span className="text-[10px]">Form</span>} showValue={false} height={4} color={p.form >= 0 ? '#22c55e' : '#ef4444'} />
                    <Bar value={p.fatigue} label={<span className="text-[10px]">Fatigue</span>} showValue={false} height={4} color="#f97316" />
                  </div>
                </>
              ) : <div className="text-muted text-sm py-10">Empty slot</div>}
              <button className="btn w-full justify-center mt-1" onClick={() => setPickRole(r)}>Change</button>
            </div>
          );
        })}
      </div>

      <Panel title="Roster" right={
        <div className="flex gap-1 text-xs">{(['role', 'ovr', 'age', 'salary', 'morale'] as const).map((s) => <button key={s} className={`chip ${sort === s ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setSort(s)}>{s}</button>)}</div>
      } bodyClass="p-0">
        <table className="tbl">
          <thead><tr><th></th><th>Player</th><th>Role</th><th>Age</th><th>OVR</th><th>POT</th><th>Morale</th><th>Form</th><th>Fatigue</th><th>Salary</th><th>Contract</th><th>Value</th><th>Traits</th></tr></thead>
          <tbody>
            {sorted.map((p) => {
              const ovr = overall(p.attributes, p.role);
              const starter = Object.values(team.lineup).includes(p.id);
              return (
                <tr key={p.id} className="row" onClick={() => nav('player', p.id)}>
                  <td className="w-10"><Portrait player={p} team={team} size={32} /></td>
                  <td><div className="font-semibold">{flag(p.country)} {p.handle} {starter ? <span className="text-[10px] text-win ml-1">START</span> : <span className="text-[10px] text-dim ml-1">SUB</span>}</div><div className="text-[11px] text-dim">{p.name}</div></td>
                  <td><span className="flex items-center gap-1"><RoleIcon role={p.role} />{ROLE_LABEL[p.role]}</span></td>
                  <td>{ageOf(p.birthdate, state.date) ?? '-'}</td>
                  <td><Rating v={ovr} size="sm" /></td>
                  <td className="font-display font-bold" style={{ color: ratingColor(p.hidden.potential) }}>{p.hidden.potential}</td>
                  <td>{Math.round(p.morale)}</td>
                  <td className={p.form >= 0 ? 'text-win' : 'text-loss'}>{p.form >= 0 ? '+' : ''}{p.form.toFixed(1)}</td>
                  <td className={p.fatigue > 70 ? 'text-orange-400' : ''}>{Math.round(p.fatigue)}</td>
                  <td>{p.contract ? money(p.contract.salary) : '-'}</td>
                  <td className="text-muted">{p.contract ? fmtDate(p.contract.expires) : '-'}</td>
                  <td>{money(p.value)}</td>
                  <td className="max-w-[260px]"><div className="flex flex-wrap gap-1">{p.traits.slice(0, 4).map((t) => <span key={t} className="chip" title={TRAITS[t]?.desc} style={{ color: TRAITS[t]?.kind === 'negative' ? '#f87171' : TRAITS[t]?.kind === 'positive' ? '#86efac' : '#cbd5e1' }}>{TRAITS[t]?.name ?? t}</span>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Modal open={!!pickRole} onClose={() => setPickRole(null)} title={pickRole ? `Choose ${ROLE_LABEL[pickRole]}` : ''} width={640}>
        {pickRole && (
          <div className="space-y-1">
            {[...roster].sort((a, b) => (b.role === pickRole ? 50 : 0) + overall(b.attributes, pickRole) - ((a.role === pickRole ? 50 : 0) + overall(a.attributes, pickRole))).map((p) => (
              <button key={p.id} className="w-full flex items-center gap-3 p-2 rounded hover:bg-panel2 text-left" onClick={() => assign(pickRole, p)}>
                <Portrait player={p} team={team} size={36} />
                <div className="flex-1"><div className="font-semibold">{p.handle} <span className="text-xs text-muted">({ROLE_LABEL[p.role]})</span></div><div className="text-xs text-muted">morale {Math.round(p.morale)} · fatigue {Math.round(p.fatigue)}</div></div>
                <Rating v={overall(effective(state, p, team, pickRole), pickRole)} size="sm" />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
