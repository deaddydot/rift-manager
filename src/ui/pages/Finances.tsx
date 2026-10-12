import { useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Team, FacilityKey } from '../../engine/types';
import { FACILITY_INFO, ROLE_LABEL } from '../../engine/types';
import { Panel, Stat, Portrait, Avatar, Empty, Sparkline, RoleIcon, money, fmtDate } from '../components/kit';
import { payrollYearly, facilityUpkeep, facilityUpkeepMonthly, operationsMonthly, leagueIncomeMonthly } from '../../engine/management/finance';
import { streamWeight } from '../../engine/management/traitEffects';
import { STAFF_ROLE_INFO } from '../../engine/management/staffMarket';
import { activeSponsors } from '../../engine/management/offerActions';

// ------------------------------------------------------------------ data helpers
type MonthRow = { month: string; income: Record<string, number>; expense: Record<string, number> };
type Series = { label: string; color: string; cats: string[] };

// Fixed category → color mapping (stack order = validated palette order, so adjacent segments stay distinct).
const OTHER_COLOR = '#5b6787';
const INCOME_SERIES: Series[] = [
  { label: 'Sponsorships', color: '#3987e5', cats: ['Sponsorships'] },
  { label: 'Transfer income', color: '#d95926', cats: ['Transfer income'] },
  { label: 'League revenue', color: '#199e70', cats: ['League revenue share', 'League stipend'] },
  { label: 'Merchandise', color: '#c98500', cats: ['Merchandise sales'] },
  { label: 'Streaming & content', color: '#d55181', cats: ['Streaming & content'] },
  { label: 'Prize money', color: '#9085e9', cats: ['Prize money'] },
  { label: 'Matchday', color: '#3fb6c2', cats: ['Ticketing & matchday'] },
  { label: 'Owner support', color: '#a7ad3f', cats: ['Owner bonus', 'Owner investment', 'Cost savings'] },
  { label: 'Media & partners', color: '#b873d6', cats: ['Media rights', 'Content creators', 'Digital collectibles', 'Sponsor bonuses'] },
];
const EXPENSE_SERIES: Series[] = [
  { label: 'Salaries', color: '#3987e5', cats: ['Player & staff salaries'] },
  { label: 'Transfer fees', color: '#d95926', cats: ['Transfer fees'] },
  { label: 'Facility upkeep', color: '#199e70', cats: ['Facility upkeep'] },
  { label: 'Operations & travel', color: '#c98500', cats: ['Operations & travel'] },
  { label: 'Facility upgrades', color: '#d55181', cats: ['Facility upgrades'] },
  { label: 'Merch production', color: '#9085e9', cats: ['Merch production'] },
  { label: "Owner's requests", color: '#3fb6c2', cats: ['Owner requests'] },
];
const INCOME_COLOR = '#3987e5';
const EXPENSE_COLOR = '#e66767';
const NET_COLOR = '#f0c674';
const isoAddDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isoAddMonths = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const ONE_OFF = new Set(['Transfer fees', 'Transfer income', 'Facility upgrades', 'Prize money', 'Contract termination', 'Staff signing fees']);

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const monthLabel = (k: string, withYear = false) => {
  const m = new Date(k + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' });
  return withYear ? `${m} '${k.slice(2, 4)}` : m;
};
const prevMonth = (k: string) => { let [y, m] = k.split('-').map(Number); m--; if (m === 0) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };

/** team.monthly plus prize money (the engine books prizes straight to the ledger, bypassing monthly totals). */
function monthMap(team: Team): Map<string, MonthRow> {
  const map = new Map<string, MonthRow>();
  for (const m of team.monthly) map.set(m.month, { month: m.month, income: { ...m.income }, expense: { ...m.expense } });
  for (const e of team.ledger) {
    if (e.category !== 'Prize money') continue;
    const k = e.date.slice(0, 7);
    const orig = team.monthly.find((m) => m.month === k);
    if (orig && orig.income['Prize money'] !== undefined) continue;
    let row = map.get(k);
    if (!row) { row = { month: k, income: {}, expense: {} }; map.set(k, row); }
    row.income['Prize money'] = (row.income['Prize money'] ?? 0) + e.amount;
  }
  return map;
}

function lastMonths(state: GameState, map: Map<string, MonthRow>, n = 12): MonthRow[] {
  const cur = state.date.slice(0, 7);
  const first = [...map.keys()].sort()[0] ?? cur;
  const keys: string[] = [];
  let k = cur;
  for (let i = 0; i < n; i++) {
    if (k < first && keys.length) break;
    keys.unshift(k);
    k = prevMonth(k);
  }
  return keys.map((key) => map.get(key) ?? { month: key, income: {}, expense: {} });
}

function aggregate(rows: MonthRow[]) {
  const income: Record<string, number> = {}, expense: Record<string, number> = {};
  for (const r of rows) {
    for (const [c, v] of Object.entries(r.income)) income[c] = (income[c] ?? 0) + v;
    for (const [c, v] of Object.entries(r.expense)) expense[c] = (expense[c] ?? 0) + v;
  }
  return { income, expense, totalIn: sum(income), totalOut: sum(expense) };
}

function seriesValues(rec: Record<string, number>, series: Series[]) {
  const vals = series.map((s) => s.cats.reduce((a, c) => a + (rec[c] ?? 0), 0));
  const known = new Set(series.flatMap((s) => s.cats));
  const other = Object.entries(rec).filter(([c]) => !known.has(c)).reduce((a, [, v]) => a + v, 0);
  return [...vals, other];
}

function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/** Bar path with a 4px rounded end away from the baseline. */
function barPath(x: number, w: number, base: number, end: number, r = 4) {
  const h = Math.abs(end - base);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (end < base) {
    return `M${x},${base} V${end + rr} Q${x},${end} ${x + rr},${end} H${x + w - rr} Q${x + w},${end} ${x + w},${end + rr} V${base} Z`;
  }
  return `M${x},${base} V${end - rr} Q${x},${end} ${x + rr},${end} H${x + w - rr} Q${x + w},${end} ${x + w},${end - rr} V${base} Z`;
}

// ------------------------------------------------------------------ chart
type ChartMode = 'net' | 'income' | 'expense';

function CashflowChart({ rows, mode }: { rows: MonthRow[]; mode: ChartMode }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 780, H = 250, L = 56, R = 12, T = 14, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const band = plotW / Math.max(1, rows.length);
  const barW = Math.min(38, band * 0.62);
  const series = mode === 'expense' ? EXPENSE_SERIES : INCOME_SERIES;

  const incomes = rows.map((r) => sum(r.income));
  const expenses = rows.map((r) => sum(r.expense));
  const nets = rows.map((_, i) => incomes[i] - expenses[i]);
  let lo = 0, hi = 0;
  if (mode === 'net') { hi = Math.max(1000, ...incomes, ...nets); lo = Math.min(0, ...expenses.map((e) => -e), ...nets); }
  else hi = Math.max(1000, ...(mode === 'income' ? incomes : expenses));
  const empty = incomes.every((x) => !x) && expenses.every((x) => !x);
  const step = niceStep(hi - lo, 4);
  hi = Math.ceil(hi / step) * step;
  lo = Math.floor(lo / step) * step;
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * plotH;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);
  const cx = (i: number) => L + band * i + band / 2;
  const hovered = hover !== null ? rows[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#2a3a5c' : '#141e33'} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#8a97b3" fontFamily="Inter">{money(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = cx(i) - barW / 2;
          const isH = hover === i;
          const label = monthLabel(r.month, i === 0 || r.month.endsWith('-01'));
          return (
            <g key={r.month} opacity={hover === null || isH ? 1 : 0.55}>
              {isH && <rect x={L + band * i + 1} y={T} width={band - 2} height={plotH} fill="#121b30" rx="4" />}
              {mode === 'net' ? (
                <>
                  <path d={barPath(x, barW, y(0) - 1, y(incomes[i]))} fill={INCOME_COLOR} />
                  <path d={barPath(x, barW, y(0) + 1, y(-expenses[i]))} fill={EXPENSE_COLOR} />
                </>
              ) : (() => {
                const vals = seriesValues(mode === 'income' ? r.income : r.expense, series);
                const colors = [...series.map((s) => s.color), OTHER_COLOR];
                const lastIdx = vals.reduce((li, v, k) => (v > 0 ? k : li), -1);
                let acc = 0;
                return vals.map((v, k) => {
                  if (v <= 0) return null;
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  const top = k === lastIdx;
                  const h = y0 - y1 - (k > 0 ? 2 : 0);
                  if (h <= 0.4) return null;
                  return top
                    ? <path key={k} d={barPath(x, barW, y0 - (k > 0 ? 2 : 0), y1)} fill={colors[k]} />
                    : <rect key={k} x={x} y={y1} width={barW} height={h} fill={colors[k]} />;
                });
              })()}
              <text x={cx(i)} y={H - 9} textAnchor="middle" fontSize="10.5" fill={isH ? '#e6ebf5' : '#8a97b3'} fontFamily="Inter">{label}</text>
              <rect x={L + band * i} y={T} width={band} height={plotH + B} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        {empty && <text x={L + plotW / 2} y={T + plotH / 2} textAnchor="middle" fontSize="13" fill="#5b6787" fontFamily="Inter">No transactions yet — weekly items post every Monday</text>}
        {mode === 'net' && rows.length > 1 && (
          <polyline points={nets.map((n, i) => `${cx(i)},${y(n)}`).join(' ')} fill="none" stroke={NET_COLOR} strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
        )}
        {mode === 'net' && nets.map((n, i) => (
          <circle key={i} cx={cx(i)} cy={y(n)} r={hover === i ? 5 : 4} fill={NET_COLOR} stroke="#0d1424" strokeWidth="2" pointerEvents="none" />
        ))}
      </svg>
      {hovered && hover !== null && (
        <div className="absolute pointer-events-none panel px-3 py-2 text-xs shadow-xl z-10 min-w-[190px]"
          style={{ top: 4, left: `${(cx(hover) / W) * 100}%`, transform: `translateX(${hover > rows.length / 2 ? 'calc(-100% - 14px)' : '14px'})` }}>
          <div className="font-display font-bold text-sm text-gold2 mb-1">{monthLabel(hovered.month, true)}{hovered.month === rows[rows.length - 1].month ? ' (to date)' : ''}</div>
          {mode === 'net' ? (
            <>
              <TipRow color={INCOME_COLOR} label="Income" value={money(incomes[hover])} />
              <TipRow color={EXPENSE_COLOR} label="Expenses" value={money(-expenses[hover])} />
              <div className="border-t hairline my-1" />
              <TipRow color={NET_COLOR} label="Net" value={money(nets[hover], true)} round />
            </>
          ) : (() => {
            const vals = seriesValues(mode === 'income' ? hovered.income : hovered.expense, series);
            const labels = [...series.map((s) => s.label), 'Other'];
            const colors = [...series.map((s) => s.color), OTHER_COLOR];
            const total = vals.reduce((a, b) => a + b, 0);
            return (
              <>
                {vals.map((v, k) => v > 0 && <TipRow key={k} color={colors[k]} label={labels[k]} value={money(v)} />)}
                <div className="border-t hairline my-1" />
                <TipRow label="Total" value={money(total)} />
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function TipRow({ color, label, value, round }: { color?: string; label: string; value: string; round?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color ? <span className={round ? 'w-2 h-2 rounded-full' : 'w-2.5 h-2.5 rounded-sm'} style={{ background: color }} /> : <span className="w-2.5" />}
      <span className="text-muted flex-1">{label}</span>
      <span className="font-display font-bold text-text">{value}</span>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; value?: string; round?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-muted">
          <span className={it.round ? 'w-2.5 h-2.5 rounded-full' : 'w-2.5 h-2.5 rounded-sm'} style={{ background: it.color }} />
          {it.label}{it.value && <span className="text-text font-semibold">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Finances(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const team = state.teams[state.userTeamId];
  const v = useStore((s) => s.v);
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const [mode, setMode] = useState<ChartMode>('net');
  const [period, setPeriod] = useState<'this' | 'last' | 'season'>('this');
  const [ledgerCat, setLedgerCat] = useState('all');
  const [ledgerDir, setLedgerDir] = useState<'all' | 'in' | 'out'>('all');
  const [ledgerQ, setLedgerQ] = useState('');
  const [ledgerLimit, setLedgerLimit] = useState(80);

  const map = useMemo(() => monthMap(team), [team, v]);
  const rows = useMemo(() => lastMonths(state, map), [state, map]);
  const curKey = state.date.slice(0, 7);
  const lastKey = prevMonth(curKey);
  const seasonFrom = `${state.season - 1}-12`, seasonTo = `${state.season}-11`;

  const payroll = payrollYearly(state, team);
  const upkeep = facilityUpkeepMonthly(state, team);
  const ops = operationsMonthly(tier);
  const sponsors = activeSponsors(state, team);
  const sponsorMonthly = sponsors.reduce((a, s) => a + s.monthly, 0);
  const fixedMonthly = payroll / 12 + upkeep + ops;

  const thisM = aggregate([map.get(curKey) ?? { month: curKey, income: {}, expense: {} }]);
  const lastM = aggregate(map.get(lastKey) ? [map.get(lastKey)!] : []);
  const seasonRows = [...map.values()].filter((r) => r.month >= seasonFrom && r.month <= seasonTo);
  const seasonAgg = aggregate(seasonRows);

  // historical reference: average operating net (no one-offs) over the last ≤3 complete months
  const complete = [...map.values()].filter((r) => r.month < curKey).sort((a, b) => a.month.localeCompare(b.month)).slice(-3);
  const opNet = (r: MonthRow) => Object.entries(r.income).filter(([c]) => !ONE_OFF.has(c)).reduce((a, [, x]) => a + x, 0) - Object.entries(r.expense).filter(([c]) => !ONE_OFF.has(c)).reduce((a, [, x]) => a + x, 0);
  const histNet = complete.length ? complete.reduce((a, r) => a + opNet(r), 0) / complete.length : null;

  // forward projection from current commitments (sponsors expire on their end dates)
  const leagueRevenue = leagueIncomeMonthly(state, team);
  const cutoff = isoAddDays(state.date, -56);
  const weeklyEntries = team.ledger.filter((e) => (e.category === 'Merchandise sales' || e.category === 'Streaming & content') && e.date > cutoff);
  const weeksSeen = new Set(weeklyEntries.map((e) => e.date)).size;
  const streamers = streamWeight(state, team);
  const contentEstimate = (team.fans / 1000) * (0.9 + team.facilities.contentStudio * 0.35) * (1 + streamers * 0.08) * (0.8 + team.hype / 250) * (tier === 1 ? 1 : 0.6);
  const weeklyIncome = weeksSeen ? weeklyEntries.reduce((a, e) => a + e.amount, 0) / weeksSeen : contentEstimate;
  const weeklyMonthly = (weeklyIncome * 52) / 12;
  const projectedNet = sponsorMonthly + leagueRevenue + weeklyMonthly - fixedMonthly;
  const projection = useMemo(() => {
    const pts = [team.balance];
    let b = team.balance, out: number | null = team.balance < 0 ? 0 : null;
    for (let i = 1; i <= 60; i++) {
      const d = isoAddMonths(curKey + '-01', i);
      const spons = sponsors.filter((x) => x.endDate >= d).reduce((a, x) => a + x.monthly, 0);
      const net = spons + leagueRevenue + weeklyMonthly - fixedMonthly;
      const nb = b + net;
      if (out === null && nb < 0) out = i - 1 + b / Math.max(1, b - nb);
      b = nb;
      if (i <= 24) pts.push(b);
    }
    return { pts, out };
  }, [team.balance, sponsors.length, sponsorMonthly, leagueRevenue, weeklyMonthly, fixedMonthly, curKey]);
  const runway = projection.out === null ? Infinity : projection.out;
  const runwayColor = runway === Infinity ? '#4ade80' : runway < 3 ? '#f87171' : runway < 6 ? '#fbbf24' : '#f0e6d2';
  const runwayText = runway === Infinity ? (projectedNet >= 0 ? 'Sustainable' : '5+ years') : `${runway.toFixed(1)} months`;
  const fixedCover = fixedMonthly > 0 ? Math.max(0, team.balance) / fixedMonthly : Infinity;

  // balance trajectory, reconstructed backwards from monthly nets
  const balanceTrail = useMemo(() => {
    const pts: number[] = [];
    let b = team.balance;
    for (let i = rows.length - 1; i >= 0; i--) { pts.unshift(b); b -= sum(rows[i].income) - sum(rows[i].expense); }
    pts.unshift(b);
    return pts;
  }, [rows, team.balance]);

  const breakdown = period === 'this' ? thisM : period === 'last' ? lastM : seasonAgg;

  // payroll list
  const people = useMemo(() => {
    const list: { key: string; kind: 'player' | 'staff'; id: string; name: string; sub: string; salary: number; expires?: string; render: () => ReactNode }[] = [];
    for (const id of team.roster) {
      const p = state.players[id];
      if (!p) continue;
      list.push({ key: 'p' + id, kind: 'player', id, name: p.handle, sub: ROLE_LABEL[p.role] + (p.isSub ? ' · sub' : ''), salary: p.contract?.salary ?? 0, expires: p.contract?.expires, render: () => <Portrait player={p} team={team} size={28} /> });
    }
    for (const id of team.staff) {
      const s = state.staff[id];
      if (!s) continue;
      list.push({ key: 's' + id, kind: 'staff', id, name: s.handle, sub: STAFF_ROLE_INFO[s.role]?.label ?? s.role, salary: s.contract?.salary ?? 0, expires: s.contract?.expires, render: () => <Avatar name={s.handle} colors={team.colors} size={28} /> });
    }
    return list.sort((a, b) => b.salary - a.salary);
  }, [state, team, v]);
  const playerPayroll = people.filter((x) => x.kind === 'player').reduce((a, x) => a + x.salary, 0);

  // ledger
  const ledgerCats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of team.ledger) c[e.category] = (c[e.category] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [team, v]);
  const ledger = useMemo(() => {
    const q = ledgerQ.trim().toLowerCase();
    return team.ledger
      .map((e, i) => ({ ...e, i }))
      .filter((e) => (ledgerCat === 'all' || e.category === ledgerCat) && (ledgerDir === 'all' || (ledgerDir === 'in' ? e.amount > 0 : e.amount < 0)) && (!q || e.category.toLowerCase().includes(q) || (e.note ?? '').toLowerCase().includes(q)))
      .reverse();
  }, [team, v, ledgerCat, ledgerDir, ledgerQ]);
  const ledgerTotal = ledger.reduce((a, e) => a + e.amount, 0);

  const seasonEnd = `${state.season}-11-18`;
  const warnings: { level: 'critical' | 'warning'; text: string }[] = [];
  if (team.balance < 0) warnings.push({ level: 'critical', text: `The club is ${money(-team.balance)} in debt. The board expects a positive balance — sell players, cut staff or sign sponsors.` });
  else if (runway < 3) warnings.push({ level: 'critical', text: `With current commitments (${money(projectedNet, true)}/month) cash runs out in about ${runway.toFixed(1)} months.` });
  else if (runway < 6) warnings.push({ level: 'warning', text: `Runway is short: about ${runway.toFixed(1)} months of cash at a projected ${money(projectedNet, true)}/month.` });
  if (sponsors.length < 2) warnings.push({ level: 'warning', text: `Only ${sponsors.length} active sponsor${sponsors.length === 1 ? '' : 's'}. Check pending offers on the Sponsors page.` });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Finances</h1>
          <div className="text-sm text-muted mt-1">{team.name} · {state.leagues[team.leagueId]?.name} · Season {state.season}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => nav('sponsors')}>Sponsors</button>
          <button className="btn" onClick={() => nav('merch')}>Merchandise</button>
          <button className="btn" onClick={() => nav('facilities')}>Facilities</button>
        </div>
      </div>

      {warnings.map((w, i) => (
        <div key={i} className={`panel-flat px-4 py-2.5 text-sm flex items-center gap-3 ${w.level === 'critical' ? 'border-red-700 bg-[#2a1215]' : 'border-amber-700/70 bg-[#2a2012]'}`}>
          <span className={`font-display font-bold uppercase tracking-wider text-xs px-2 py-0.5 rounded ${w.level === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{w.level === 'critical' ? '! Critical' : '! Warning'}</span>
          <span>{w.text}</span>
        </div>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat label="Balance" value={money(team.balance)} color={team.balance < 0 ? '#f87171' : '#f0e6d2'} sub={`${money(balanceTrail[balanceTrail.length - 1] - balanceTrail[0], true)} over ${rows.length} mo`} />
        <Stat label="This month net" value={money(thisM.totalIn - thisM.totalOut, true)} color={thisM.totalIn - thisM.totalOut < 0 ? '#f87171' : '#4ade80'} sub={`${money(thisM.totalIn)} in · ${money(thisM.totalOut)} out`} />
        <Stat label="Last month net" value={lastM.totalIn || lastM.totalOut ? money(lastM.totalIn - lastM.totalOut, true) : '—'} color={lastM.totalIn - lastM.totalOut < 0 ? '#f87171' : '#4ade80'} sub={monthLabel(lastKey, true)} />
        <Stat label="Yearly payroll" value={money(payroll)} sub={`${money(payroll / 52)}/week`} />
        <Stat label="Facility upkeep" value={money(upkeep)} sub="per month" />
        <Stat label="Sponsor income" value={money(sponsorMonthly)} sub={`${sponsors.length} deals · per month`} />
        <Stat label="Runway" value={runway === Infinity ? (projectedNet >= 0 ? 'Sustainable' : '5+ yrs') : `${runway.toFixed(1)} mo`} color={runwayColor} sub={`Projected ${money(projectedNet, true)}/mo`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <Panel
          title="Cash flow · last 12 months"
          right={
            <div className="flex gap-1">
              {([['net', 'Income vs expense'], ['income', 'Income by category'], ['expense', 'Expenses by category']] as const).map(([m, l]) => (
                <button key={m} className={`chip px-2.5 py-1 ${mode === m ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setMode(m)}>{l}</button>
              ))}
            </div>
          }
        >
          {mode === 'net' ? (
            <Legend items={[
              { label: 'Income', color: INCOME_COLOR, value: money(rows.reduce((a, r) => a + sum(r.income), 0)) },
              { label: 'Expenses', color: EXPENSE_COLOR, value: money(rows.reduce((a, r) => a + sum(r.expense), 0)) },
              { label: 'Net', color: NET_COLOR, round: true, value: money(rows.reduce((a, r) => a + sum(r.income) - sum(r.expense), 0), true) },
            ]} />
          ) : (() => {
            const series = mode === 'income' ? INCOME_SERIES : EXPENSE_SERIES;
            const totals = rows.reduce((acc, r) => seriesValues(mode === 'income' ? r.income : r.expense, series).map((v, k) => acc[k] + v), new Array(series.length + 1).fill(0) as number[]);
            return <Legend items={[...series.map((s, k) => ({ label: s.label, color: s.color, value: money(totals[k]) })), { label: 'Other', color: OTHER_COLOR, value: money(totals[series.length]) }].filter((x) => x.value !== '$0')} />;
          })()}
          <CashflowChart rows={rows} mode={mode} />
          <div className="text-[11px] text-dim mt-1">Current month is month-to-date. Weekly items (salaries, merch, content) post on Mondays; sponsors, upkeep, league revenue and operations on the 1st.</div>
        </Panel>

        <Panel title="Projected runway" right={<span className="text-xs text-muted">from current commitments</span>}>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <div className="font-display text-4xl font-bold leading-none" style={{ color: runwayColor }}>{runwayText}</div>
              <div className="text-xs text-muted mt-1">{runway === Infinity ? (projectedNet >= 0 ? 'Recurring income covers recurring costs.' : 'Burning cash, but reserves last beyond 5 years.') : 'until the balance hits zero'}</div>
            </div>
            <div className="text-right">
              <Sparkline data={projection.pts} width={140} height={44} color={projection.pts[projection.pts.length - 1] < 0 ? '#f87171' : '#c8aa6e'} zero />
              <div className="text-[10px] text-dim">balance, next 24 months · {money(projection.pts[projection.pts.length - 1])}</div>
            </div>
          </div>
          <table className="tbl">
            <tbody>
              <tr><td className="text-muted">Sponsors (current deals)</td><td className="text-right font-display font-bold">{money(sponsorMonthly, true)}</td></tr>
              <tr><td className="text-muted">{tier === 1 ? 'League revenue share' : tier === 2 ? 'League stipend' : 'League revenue'}</td><td className="text-right font-display font-bold">{money(leagueRevenue, true)}</td></tr>
              <tr><td className="text-muted">Streaming & merch <span className="text-dim text-[11px]">({weeksSeen ? `${weeksSeen}-wk avg` : 'estimate'})</span></td><td className="text-right font-display font-bold">{money(weeklyMonthly, true)}</td></tr>
              <tr><td className="text-muted">Payroll</td><td className="text-right font-display font-bold text-red-300">{money(-payroll / 12)}</td></tr>
              <tr><td className="text-muted">Facility upkeep</td><td className="text-right font-display font-bold text-red-300">{money(-upkeep)}</td></tr>
              <tr><td className="text-muted">Operations & travel</td><td className="text-right font-display font-bold text-red-300">{money(-ops)}</td></tr>
              <tr><td className="font-semibold">Projected monthly net</td><td className={`text-right font-display text-lg font-bold ${projectedNet < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(projectedNet, true)}</td></tr>
              <tr><td className="text-muted">Avg. operating net, last {complete.length || 0} mo</td><td className="text-right text-muted">{histNet === null ? '—' : money(histNet, true)}</td></tr>
              <tr><td className="text-muted">Cash covers fixed costs for</td><td className="text-right text-muted">{fixedCover === Infinity ? '∞' : `${fixedCover.toFixed(1)} months`}</td></tr>
            </tbody>
          </table>
          <div className="text-[11px] text-dim mt-2">Assumes today&apos;s payroll and facilities, sponsors ending on schedule and no prize money, transfers or new deals.</div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1.6fr] gap-4">
        <Panel title="Breakdown by category" right={
          <div className="flex gap-1">
            {([['this', 'This month'], ['last', 'Last month'], ['season', `Season ${state.season}`]] as const).map(([p, l]) => (
              <button key={p} className={`chip px-2.5 py-1 ${period === p ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} onClick={() => setPeriod(p)}>{l}</button>
            ))}
          </div>
        }>
          {breakdown.totalIn === 0 && breakdown.totalOut === 0 ? <Empty>No transactions recorded for this period yet.</Empty> : (
            <div className="grid grid-cols-2 gap-5">
              <CategoryList title="Income" total={breakdown.totalIn} rec={breakdown.income} series={INCOME_SERIES} />
              <CategoryList title="Expenses" total={breakdown.totalOut} rec={breakdown.expense} series={EXPENSE_SERIES} />
              <div className="col-span-2 flex items-center justify-between border-t hairline pt-2.5">
                <span className="text-sm text-muted">Net result</span>
                <span className={`font-display text-2xl font-bold ${breakdown.totalIn - breakdown.totalOut < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(breakdown.totalIn - breakdown.totalOut, true)}</span>
              </div>
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Facility upkeep" right={<button className="btn btn-ghost text-xs py-1" onClick={() => nav('facilities')}>Manage →</button>} bodyClass="p-0">
            <table className="tbl">
              <thead><tr><th>Facility</th><th className="text-center">Lvl</th><th className="text-right">Monthly</th></tr></thead>
              <tbody>
                {(Object.keys(FACILITY_INFO) as FacilityKey[]).map((k) => (
                  <tr key={k}>
                    <td>{FACILITY_INFO[k].name}</td>
                    <td className="text-center font-display font-bold">{team.facilities[k]}</td>
                    <td className="text-right text-muted">{team.facilities[k] ? money(facilityUpkeep(k, team.facilities[k], tier)) : '—'}</td>
                  </tr>
                ))}
                <tr><td className="font-semibold">Total</td><td /><td className="text-right font-display font-bold text-gold2">{money(upkeep)}</td></tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Sponsor income" right={<button className="btn btn-ghost text-xs py-1" onClick={() => nav('sponsors')}>Manage →</button>} bodyClass="p-0">
            {sponsors.length === 0 ? <Empty>No active sponsors.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Sponsor</th><th className="text-right">Monthly</th><th className="text-right">Ends</th></tr></thead>
                <tbody>
                  {[...sponsors].sort((a, b) => b.monthly - a.monthly).map((s) => (
                    <tr key={s.id}>
                      <td><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.logoColor }} /><span className="truncate max-w-[130px]">{s.name}</span></span></td>
                      <td className="text-right font-display font-bold">{money(s.monthly)}</td>
                      <td className="text-right text-muted text-xs">{fmtDate(s.endDate, { month: 'short', year: '2-digit' })}</td>
                    </tr>
                  ))}
                  <tr><td className="font-semibold">Total</td><td className="text-right font-display font-bold text-gold2">{money(sponsorMonthly)}</td><td /></tr>
                </tbody>
              </table>
            )}
            {state.sponsorOffers.length > 0 && <div className="px-4 py-2 text-xs text-gold2 border-t hairline">{state.sponsorOffers.length} pending offer{state.sponsorOffers.length > 1 ? 's' : ''} awaiting a decision</div>}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.15fr] gap-4">
        <Panel title="Yearly payroll" right={<span className="text-xs text-muted">Players {money(playerPayroll)} · Staff {money(payroll - playerPayroll)} · Total <span className="text-gold2 font-semibold">{money(payroll)}</span></span>} bodyClass="p-0">
          <div className="max-h-[460px] overflow-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Position</th><th className="text-right">Salary / yr</th><th className="w-28">Share</th><th className="text-right">Expires</th></tr></thead>
              <tbody>
                {people.map((x) => {
                  const expiring = x.expires && x.expires <= seasonEnd;
                  return (
                    <tr key={x.key} className="row" onClick={() => (x.kind === 'player' ? nav('player', x.id) : nav('staff'))}>
                      <td><span className="flex items-center gap-2">{x.render()}<span className="font-semibold">{x.name}</span></span></td>
                      <td className="text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          {x.kind === 'player' ? <RoleIcon role={state.players[x.id].role} size={14} /> : <span className="w-2 h-2 rounded-full" style={{ background: STAFF_ROLE_INFO[state.staff[x.id].role]?.color ?? '#8a97b3' }} />}
                          {x.sub}
                        </span>
                      </td>
                      <td className="text-right font-display font-bold">{x.salary ? money(x.salary) : '—'}</td>
                      <td><div className="h-1.5 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full rounded-full bg-gold/70" style={{ width: `${payroll ? (x.salary / payroll) * 100 : 0}%` }} /></div></td>
                      <td className={`text-right text-xs ${expiring ? 'text-amber-300 font-semibold' : 'text-muted'}`}>{x.expires ? fmtDate(x.expires, { month: 'short', year: 'numeric' }) : 'None'}{expiring ? ' · expiring' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Ledger" bodyClass="p-0" right={
          <div className="flex items-center gap-2">
            <input className="input py-1 text-xs w-32" placeholder="Search notes…" value={ledgerQ} onChange={(e) => setLedgerQ(e.target.value)} />
            <select className="input py-1 text-xs" value={ledgerDir} onChange={(e) => setLedgerDir(e.target.value as 'all' | 'in' | 'out')}>
              <option value="all">In & out</option><option value="in">Income</option><option value="out">Expenses</option>
            </select>
            <select className="input py-1 text-xs max-w-[170px]" value={ledgerCat} onChange={(e) => { setLedgerCat(e.target.value); setLedgerLimit(80); }}>
              <option value="all">All categories</option>
              {ledgerCats.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
            </select>
          </div>
        }>
          <div className="max-h-[460px] overflow-auto">
            {ledger.length === 0 ? <Empty>No ledger entries match.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {ledger.slice(0, ledgerLimit).map((e) => (
                    <tr key={e.i}>
                      <td className="text-muted whitespace-nowrap text-xs">{fmtDate(e.date)}</td>
                      <td className="whitespace-nowrap">
                        <button className="hover:text-gold2" onClick={() => setLedgerCat(e.category)}>{e.category}</button>
                      </td>
                      <td className="text-muted text-xs truncate max-w-[200px]">{e.note ?? ''}</td>
                      <td className={`text-right font-display font-bold whitespace-nowrap ${e.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(e.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t hairline text-xs text-muted">
            <span>{ledger.length} entries · total <span className={`font-semibold ${ledgerTotal < 0 ? 'text-red-400' : 'text-green-400'}`}>{money(ledgerTotal, true)}</span>{(ledgerCat !== 'all' || ledgerDir !== 'all' || ledgerQ) && <button className="ml-2 text-gold2 hover:underline" onClick={() => { setLedgerCat('all'); setLedgerDir('all'); setLedgerQ(''); }}>clear filters</button>}</span>
            {ledger.length > ledgerLimit && <button className="btn btn-ghost py-1 text-xs" onClick={() => setLedgerLimit((n) => n + 100)}>Show more</button>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CategoryList({ title, total, rec, series }: { title: string; total: number; rec: Record<string, number>; series: Series[] }) {
  const colorOf = (c: string) => series.find((s) => s.cats.includes(c))?.color ?? OTHER_COLOR;
  const entries = Object.entries(rec).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted font-semibold">{title}</span>
        <span className="font-display text-lg font-bold">{money(total)}</span>
      </div>
      {entries.length === 0 ? <div className="text-xs text-dim">None</div> : (
        <div className="space-y-2">
          {entries.map(([c, v]) => (
            <div key={c}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-sm" style={{ background: colorOf(c) }} />{c}</span>
                <span><span className="font-display font-bold text-text">{money(v)}</span> <span className="text-dim">{total ? Math.round((v / total) * 100) : 0}%</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${total ? (v / total) * 100 : 0}%`, background: colorOf(c) }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
