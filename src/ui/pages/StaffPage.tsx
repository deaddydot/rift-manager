import { useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { Staff, StaffRole } from '../../engine/types';
import { Panel, Stat, Empty, Modal, Pill, Bar, Rating, Avatar, money, fmtDate, flag, ratingColor } from '../components/kit';
import { payrollYearly } from '../../engine/management/finance';
import {
  MAX_STAFF, STAFF_ATTRS, STAFF_ATTR_LABEL, STAFF_ROLE_INFO, staffMarket, staffRating, staffSalaryDemand, signingFee,
  firingCost, contractExpiry, hireStaff, fireStaff,
} from '../../engine/management/staffMarket';

const ROLES = Object.keys(STAFF_ROLE_INFO) as StaffRole[];
const SHORT: Record<string, string> = { tactics: 'TAC', drafting: 'DRA', training: 'TRN', motivation: 'MOT', scouting: 'SCO', development: 'DEV' };

function RolePill({ role }: { role: StaffRole }) {
  const info = STAFF_ROLE_INFO[role];
  return <Pill color={info?.color ?? '#8a97b3'}>{info?.label ?? role}</Pill>;
}

export default function StaffPage(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');
  const [sort, setSort] = useState<'rating' | 'salary' | 'name'>('rating');
  const [q, setQ] = useState('');
  const [hiring, setHiring] = useState<Staff | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  const staff = team.staff.map((id) => state.staff[id]).filter(Boolean).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || staffRating(b) - staffRating(a));
  const staffPay = staff.reduce((a, s) => a + (s.contract?.salary ?? 0), 0);
  const hc = staff.find((s) => s.role === 'headCoach');
  const avg = staff.length ? Math.round(staff.reduce((a, s) => a + staffRating(s), 0) / staff.length) : 0;
  const full = staff.length >= MAX_STAFF;

  const market = useMemo(() => staffMarket(state), [state, v]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: market.length };
    for (const s of market) c[s.role] = (c[s.role] ?? 0) + 1;
    return c;
  }, [market]);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const rows = market
      .filter((s) => (roleFilter === 'all' || s.role === roleFilter) && (!qq || s.handle.toLowerCase().includes(qq) || s.name.toLowerCase().includes(qq) || s.country.toLowerCase().includes(qq)))
      .map((s) => ({ s, rating: staffRating(s), salary: staffSalaryDemand(state, s, team) }));
    rows.sort((a, b) => (sort === 'rating' ? b.rating - a.rating : sort === 'salary' ? b.salary - a.salary : a.s.handle.localeCompare(b.s.handle)));
    return rows;
  }, [market, roleFilter, sort, q, state, team, v]);

  const release = (s: Staff) => {
    const r = fireStaff(state, s.id);
    setReleasing(null);
    notify(r.message);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Staff</h1>
          <div className="text-sm text-muted mt-1">Backroom team of {team.name} · up to {MAX_STAFF} members</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => nav('training')}>Training →</button>
          <button className="btn" onClick={() => nav('finances')}>Finances →</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Stat label="Staff" value={`${staff.length} / ${MAX_STAFF}`} color={full ? '#fbbf24' : undefined} sub={full ? 'Staff limit reached' : `${MAX_STAFF - staff.length} open position${MAX_STAFF - staff.length === 1 ? '' : 's'}`} />
        <Stat label="Staff payroll" value={money(staffPay)} sub={`${payrollYearly(state, team) ? Math.round((staffPay / payrollYearly(state, team)) * 100) : 0}% of total payroll`} />
        <Stat label="Head coach" value={hc ? hc.handle : 'Vacant'} color={hc ? undefined : '#f87171'} sub={hc ? `Rating ${staffRating(hc)} · TAC ${hc.attributes.tactics} · DRA ${hc.attributes.drafting}` : 'Draft & tactics suffer without one'} />
        <Stat label="Average rating" value={avg || '—'} color={avg ? ratingColor(avg) : undefined} sub="role-weighted" />
        <Stat label="Market" value={market.length} sub={`free agents · season ${state.season}`} />
      </div>

      {!hc && (
        <div className="panel-flat px-4 py-2.5 text-sm border-red-700 bg-[#2a1215] flex items-center gap-3">
          <span className="font-display font-bold uppercase tracking-wider text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300">! No head coach</span>
          Without a head coach the team falls back on another staff member (or nobody) for drafting, tactics and training quality. Appoint one from the market below.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <Panel title={`Current staff (${staff.length})`}>
          {staff.length === 0 ? <Empty>No staff under contract.</Empty> : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {staff.map((s) => {
                const r = staffRating(s);
                const keys = STAFF_ROLE_INFO[s.role]?.keys ?? [];
                const sev = firingCost(state, s);
                const expiring = s.contract && s.contract.expires <= `${state.season}-11-18`;
                return (
                  <div key={s.id} className="panel-flat p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-start gap-3">
                      <Avatar name={s.handle} size={48} colors={team.colors} />
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-lg font-bold leading-tight truncate">{s.handle}</div>
                        <div className="text-xs text-muted truncate">{flag(s.country)} {s.name}</div>
                        <div className="mt-1"><RolePill role={s.role} /></div>
                      </div>
                      <Rating v={r} />
                    </div>
                    <div className="space-y-1">
                      {STAFF_ATTRS.map((k) => (
                        <Bar key={k} value={s.attributes[k]} label={<span className={keys.includes(k) ? 'text-gold2 font-semibold' : ''}>{STAFF_ATTR_LABEL[k]}</span>} height={5} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs border-t hairline pt-2">
                      <div><div className="text-dim">Salary</div><div className="font-display font-bold text-sm">{s.contract ? `${money(s.contract.salary)}/yr` : '—'}</div></div>
                      <div><div className="text-dim">Contract until</div><div className={`font-semibold ${expiring ? 'text-amber-300' : ''}`}>{s.contract ? fmtDate(s.contract.expires) : '—'}</div></div>
                    </div>
                    {releasing === s.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted flex-1">Severance {money(sev)} (50% of remaining contract)</span>
                        <button className="btn btn-danger py-1 text-xs" disabled={sev > Math.max(0, team.balance)} onClick={() => release(s)}>Confirm</button>
                        <button className="btn btn-ghost py-1 text-xs" onClick={() => setReleasing(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost py-1 text-xs self-end" onClick={() => setReleasing(s.id)}>Release · {money(sev)}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Staff roles">
          <div className="space-y-3">
            {ROLES.map((role) => {
              const info = STAFF_ROLE_INFO[role];
              const have = staff.filter((s) => s.role === role).length;
              return (
                <div key={role} className="border-l-2 pl-3" style={{ borderColor: info.color }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm" style={{ color: info.color }}>{info.label}</span>
                    <span className={`text-xs ${have ? 'text-muted' : 'text-dim'}`}>{have ? `${have} on staff` : 'none'}</span>
                  </div>
                  <div className="text-xs text-muted leading-relaxed mt-0.5">{info.effect}</div>
                  <div className="text-[11px] text-dim mt-0.5">Key: {info.keys.map((k) => STAFF_ATTR_LABEL[k]).join(', ')}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title="Staff market"
        bodyClass="p-0"
        right={
          <div className="flex items-center gap-2">
            <input className="input py-1 text-xs w-40" placeholder="Search name / country…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as 'rating' | 'salary' | 'name')}>
              <option value="rating">Sort: rating</option><option value="salary">Sort: salary</option><option value="name">Sort: name</option>
            </select>
          </div>
        }
      >
        <div className="flex gap-1.5 px-4 py-2.5 border-b hairline flex-wrap">
          {(['all', ...ROLES] as const).map((r) => (
            <button key={r} className={`chip px-2.5 py-1 ${roleFilter === r ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setRoleFilter(r)}>
              {r === 'all' ? 'All' : STAFF_ROLE_INFO[r].label} <span className="text-dim">{counts[r] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="max-h-[560px] overflow-auto">
          {list.length === 0 ? <Empty>No candidates match.</Empty> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th><th>Role</th><th className="text-center">Rating</th>
                  {STAFF_ATTRS.map((k) => <th key={k} className="text-center" title={STAFF_ATTR_LABEL[k]}>{SHORT[k]}</th>)}
                  <th className="text-right">Demand / yr</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map(({ s, rating, salary }) => {
                  const keys = STAFF_ROLE_INFO[s.role]?.keys ?? [];
                  return (
                    <tr key={s.id} className="row" onClick={() => setHiring(s)}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={s.handle} size={30} colors={['#334155', '#0f172a']} />
                          <div className="min-w-0">
                            <div className="font-semibold">{s.handle}</div>
                            <div className="text-[11px] text-dim truncate">{flag(s.country)} {s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td><RolePill role={s.role} /></td>
                      <td className="text-center"><div className="inline-block"><Rating v={rating} size="sm" /></div></td>
                      {STAFF_ATTRS.map((k) => (
                        <td key={k} className={`text-center font-display font-bold ${keys.includes(k) ? '' : 'opacity-60'}`} style={{ color: ratingColor(s.attributes[k]) }}>{s.attributes[k]}</td>
                      ))}
                      <td className="text-right">
                        <div className="font-display font-bold">{money(salary)}</div>
                        <div className="text-[10.5px] text-dim">+{money(signingFee(salary))} fee</div>
                      </td>
                      <td className="text-right"><button className="btn btn-gold py-1 text-xs" onClick={(e) => { e.stopPropagation(); setHiring(s); }}>Hire</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 text-[11px] text-dim border-t hairline">The market refreshes every season. Released staff stay available here. Demands scale with quality and your league&apos;s wage level.</div>
      </Panel>

      {hiring && <HireModal s={hiring} onClose={() => setHiring(null)} onHired={() => setHiring(null)} />}
    </div>
  );
}

function HireModal({ s, onClose, onHired }: { s: Staff; onClose: () => void; onHired: () => void }) {
  const state = useGame();
  const bump = useStore((x) => x.bump);
  const notify = useStore((x) => x.notify);
  const team = state.teams[state.userTeamId];
  const [years, setYears] = useState(2);
  const salary = staffSalaryDemand(state, s, team);
  const fee = signingFee(salary);
  const rating = staffRating(s);
  const full = team.staff.length >= MAX_STAFF;
  const hasHC = s.role === 'headCoach' && team.staff.some((id) => state.staff[id]?.role === 'headCoach');
  const broke = team.balance < fee;
  const blocked = full || hasHC || broke;
  const keys = STAFF_ROLE_INFO[s.role]?.keys ?? [];
  const sameRole = team.staff.map((id) => state.staff[id]).filter((x) => x && x.role === s.role);

  const hire = () => {
    const r = hireStaff(state, s.id, years);
    notify(r.message);
    if (r.ok) { bump(); onHired(); }
  };

  return (
    <Modal open onClose={onClose} title={`Hire ${s.handle}`} width={620}>
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <Avatar name={s.handle} size={64} colors={team.colors} />
          <div className="flex-1">
            <div className="font-display text-2xl font-bold leading-tight">{s.handle}</div>
            <div className="text-sm text-muted">{flag(s.country)} {s.name} · {s.country}</div>
            <div className="mt-1.5 flex items-center gap-2"><RolePill role={s.role} /><span className="text-xs text-dim">Reputation {s.reputation}</span></div>
          </div>
          <Rating v={rating} size="lg" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {STAFF_ATTRS.map((k) => (
            <Bar key={k} value={s.attributes[k]} label={<span className={keys.includes(k) ? 'text-gold2 font-semibold' : ''}>{STAFF_ATTR_LABEL[k]}</span>} />
          ))}
        </div>
        <div className="text-xs text-muted leading-relaxed panel-flat px-3 py-2">{STAFF_ROLE_INFO[s.role]?.effect}</div>
        {sameRole.length > 0 && (
          <div className="text-xs text-muted">
            Current {STAFF_ROLE_INFO[s.role].label.toLowerCase()}{sameRole.length > 1 ? 's' : ''}: {sameRole.map((x) => `${x.handle} (${staffRating(x)})`).join(', ')}
          </div>
        )}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">Contract length</div>
          <div className="flex gap-2">
            {[1, 2, 3].map((y) => (
              <button key={y} className={`btn flex-1 justify-center ${years === y ? 'btn-gold' : ''}`} onClick={() => setYears(y)}>
                {y} season{y > 1 ? 's' : ''} <span className="text-[11px] opacity-70">to {contractExpiry(state.date, y).slice(0, 4)}</span>
              </button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <tbody>
            <tr><td className="text-muted">Salary</td><td className="text-right font-display font-bold">{money(salary)} / year <span className="text-xs text-dim font-sans font-normal">({money(salary / 52)}/wk)</span></td></tr>
            <tr><td className="text-muted">Signing fee (paid now)</td><td className="text-right font-display font-bold text-gold2">{money(fee)}</td></tr>
            <tr><td className="text-muted">Contract until</td><td className="text-right font-semibold">{fmtDate(contractExpiry(state.date, years))}</td></tr>
            <tr><td className="text-muted">Total commitment</td><td className="text-right font-display font-bold">{money(fee + salary * years)}</td></tr>
            <tr><td className="text-muted">Payroll after signing</td><td className="text-right font-display font-bold">{money(payrollYearly(state, team) + salary)} / year</td></tr>
          </tbody>
        </table>
        {full && <div className="text-xs text-red-400">Staff limit reached ({MAX_STAFF}). Release someone first.</div>}
        {hasHC && <div className="text-xs text-red-400">You already have a head coach. Release them before appointing a new one.</div>}
        {broke && <div className="text-xs text-red-400">Not enough money to cover the signing fee.</div>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={blocked} onClick={hire}>Sign {s.handle} for {years} season{years > 1 ? 's' : ''}</button>
        </div>
      </div>
    </Modal>
  );
}
