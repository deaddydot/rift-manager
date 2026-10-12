import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Player, Team, Role, RegionId, TransferOffer, LeagueDef } from '../../engine/types';
import { ROLE_LABEL, REGION_LABEL, HIDDEN_LABEL } from '../../engine/types';
import { askingFee, salaryDemand, interest, makeOffer, respondIncoming, offerRenewal, releasePlayer, inTransferWindow, playerOvr } from '../../engine/management/transfers';
import { payrollYearly } from '../../engine/management/finance';
import { respondIncomingOffer } from '../../engine/management/offerActions';
import { StancePill } from '../components/BidStance';
import { scoutedView, scoutCost, scoutPlayer, scoutingPower, knowledgeOf, knowledgeLabel, HIDDEN_KEYS, HIDDEN_NEGATIVE, TRAIT_REVEAL_KNOWLEDGE } from '../../engine/management/scouting';
import { TRAITS } from '../../engine/traits';
import { Panel, Stat, Tabs, Modal, Rating, Portrait, TeamLogo, RoleIcon, Pill, Empty, money, fmtDate, flag, ratingColor } from '../components/kit';
import { InterestDots, RangeTag, RangeBar, KnowledgeTag, SortTh, Pager, MultiSelect, RoleChips, NumField, FilterLabel, leagueOptions, isRealPlayer, playerAge, windowBoundary, windowNote, monthsUntil, TierDot } from './worldKit';

type TabId = 'search' | 'shortlist' | 'offers' | 'contracts' | 'scouting';
type WithShortlist = GameState & { shortlist?: string[] };
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ROLE_SHORT: Record<Role, string> = { top: 'Top', jungle: 'Jgl', mid: 'Mid', adc: 'Bot', support: 'Sup' };

export interface MarketRow {
  p: Player; team: Team | null; league?: LeagueDef; tier: number; age: number | null; ovr: number;
  pot: [number, number]; k: number; ask: number; demand: number; int: number;
}

function buildRows(state: GameState, user: Team): MarketRow[] {
  const out: MarketRow[] = [];
  for (const p of Object.values(state.players)) {
    if (p.retired || !isRealPlayer(p)) continue;
    const team = p.teamId ? state.teams[p.teamId] ?? null : null;
    const league = team ? state.leagues[team.leagueId] : undefined;
    const v = scoutedView(state, p);
    out.push({
      p, team, league, tier: league?.tier ?? 4, age: playerAge(p, state.date), ovr: v.overall, pot: v.potential, k: v.knowledge,
      ask: team && team.id !== user.id ? askingFee(state, p, team) : 0,
      demand: salaryDemand(state, p, user), int: team?.id === user.id ? 1 : interest(state, p, user),
    });
  }
  return out;
}

type SortKey = 'handle' | 'team' | 'league' | 'role' | 'age' | 'ovr' | 'pot' | 'value' | 'ask' | 'demand' | 'int' | 'k' | 'expires';
const sortVal = (r: MarketRow, k: SortKey): number | string => {
  switch (k) {
    case 'handle': return r.p.handle.toLowerCase();
    case 'team': return r.team?.name.toLowerCase() ?? '~';
    case 'league': return r.tier * 1000 + (r.league?.name.charCodeAt(0) ?? 0);
    case 'role': return ['top', 'jungle', 'mid', 'adc', 'support'].indexOf(r.p.role);
    case 'age': return r.age ?? 99;
    case 'ovr': return r.ovr;
    case 'pot': return (r.pot[0] + r.pot[1]) / 2;
    case 'value': return r.p.value;
    case 'ask': return r.ask;
    case 'demand': return r.demand;
    case 'int': return r.int;
    case 'k': return r.k;
    case 'expires': return r.p.contract?.expires ?? '0000';
  }
};
function sortRows(rows: MarketRow[], sort: { key: SortKey; desc: boolean }) {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = sortVal(a, sort.key), y = sortVal(b, sort.key);
    if (x < y) return -dir;
    if (x > y) return dir;
    return b.ovr - a.ovr;
  });
}

interface Filters {
  q: string; roles: Role[]; leagues: string[]; region: RegionId | ''; ageMin: number | ''; ageMax: number | ''; ovrMin: number | ''; ovrMax: number | '';
  freeOnly: boolean; maxFee: number | ''; maxSalary: number | ''; minInterest: number; hideOwn: boolean; affordable: boolean;
}
const DEFAULT_FILTERS: Filters = { q: '', roles: [], leagues: [], region: '', ageMin: '', ageMax: '', ovrMin: '', ovrMax: '', freeOnly: false, maxFee: '', maxSalary: '', minInterest: 0, hideOwn: true, affordable: false };

export default function Transfers(props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const user = state.teams[state.userTeamId];
  const initial = (['search', 'shortlist', 'offers', 'contracts', 'scouting'] as TabId[]).includes((props.tab ?? props.id) as TabId) ? (props.tab ?? props.id) as TabId : 'search';
  const [tab, setTab] = useState<TabId>(initial);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'ovr', desc: true });
  const [page, setPage] = useState(0);
  const [offerFor, setOfferFor] = useState<Player | null>(null);

  const rows = useMemo(() => buildRows(state, user), [state, user, v]);
  const windowOpen = inTransferWindow(state.date);
  const win = windowBoundary(state.date);
  const shortlist = (state as WithShortlist).shortlist ?? [];
  const outgoingPending = state.transferOffers.filter((o) => o.direction === 'outgoing' && o.status === 'pending').length;
  const incomingPending = state.transferOffers.filter((o) => o.direction === 'incoming' && o.status === 'pending').length;
  const expiring = user.roster.map((id) => state.players[id]).filter((p) => p?.contract && monthsUntil(state.date, p.contract.expires) <= 12).length;

  const toggleShort = (id: string) => {
    const s = state as WithShortlist;
    s.shortlist = (s.shortlist ?? []).includes(id) ? s.shortlist!.filter((x) => x !== id) : [...(s.shortlist ?? []), id];
    useStore.getState().bump();
  };
  const doScout = (p: Player) => {
    const r = scoutPlayer(state, p.id);
    useStore.getState().notify(r.message);
    useStore.getState().bump();
  };

  const filtered = useMemo(() => {
    const f = filters;
    const q = f.q.trim().toLowerCase();
    const maxFee = f.maxFee === '' ? Infinity : f.maxFee * 1000;
    const maxSal = f.maxSalary === '' ? Infinity : f.maxSalary * 1000;
    return rows.filter((r) => {
      if (f.hideOwn && r.p.teamId === user.id) return false;
      if (f.freeOnly && r.p.teamId) return false;
      if (q && !(r.p.handle.toLowerCase().includes(q) || r.p.name.toLowerCase().includes(q) || (r.team?.name.toLowerCase().includes(q) ?? false) || (r.team?.short.toLowerCase() === q))) return false;
      if (f.roles.length && !f.roles.includes(r.p.role)) return false;
      if (f.leagues.length && !(r.team && f.leagues.includes(r.team.leagueId))) return false;
      if (f.region && r.team?.region !== f.region) return false;
      if (f.ageMin !== '' && (r.age ?? 0) < f.ageMin) return false;
      if (f.ageMax !== '' && (r.age ?? 99) > f.ageMax) return false;
      if (f.ovrMin !== '' && r.ovr < f.ovrMin) return false;
      if (f.ovrMax !== '' && r.ovr > f.ovrMax) return false;
      if (r.ask > maxFee || r.demand > maxSal) return false;
      if (f.minInterest && Math.round(r.int * 5) < f.minInterest) return false;
      if (f.affordable && r.ask > user.balance) return false;
      return true;
    });
  }, [rows, filters, user]);
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const PER = 40;
  const pages = Math.max(1, Math.ceil(sorted.length / PER));
  const pg = Math.min(page, pages - 1);
  const pageRows = sorted.slice(pg * PER, pg * PER + PER);
  const setF = (patch: Partial<Filters>) => { setFilters({ ...filters, ...patch }); setPage(0); };

  const shortRows = useMemo(() => sortRows(rows.filter((r) => shortlist.includes(r.p.id)), sort), [rows, shortlist, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Transfer Hub</h1>
          <div className="text-sm text-muted mt-1">Scout, shortlist and sign players · {rows.length.toLocaleString()} players in the world database</div>
        </div>
        <div className={`panel-flat px-3 py-2 text-xs flex items-center gap-2 ${windowOpen ? 'text-green-400' : 'text-amber-400'}`}>
          <span className={`w-2 h-2 rounded-full ${windowOpen ? 'bg-green-500' : 'bg-amber-500'}`} />
          {windowNote(state.date)}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Balance" value={money(user.balance)} color={user.balance < 0 ? '#ef4444' : '#f0e6d2'} sub="available for fees" />
        <Stat label="Payroll" value={money(payrollYearly(state, user))} sub="per year (players + staff)" />
        <Stat label="Squad" value={`${user.roster.length}`} sub={`${user.roster.filter((id) => state.players[id]?.isSub).length} subs · max ~10`} />
        <Stat label="Window" value={windowOpen ? 'Open' : 'Closed'} color={windowOpen ? '#22c55e' : '#f59e0b'} sub={`${windowOpen ? 'open until' : 'opens'} ${fmtDate(win.day, { month: 'short', day: 'numeric' })}`} />
        <Stat label="Offers" value={`${outgoingPending} / ${incomingPending}`} sub="outgoing / incoming pending" color={incomingPending ? '#c8aa6e' : undefined} />
        <Stat label="Expiring" value={expiring} sub="contracts within 12 months" color={expiring ? '#f97316' : undefined} />
      </div>

      <div>
        <Tabs<TabId>
          value={tab} onChange={setTab}
          tabs={[
            { id: 'search', label: 'Player search' },
            { id: 'shortlist', label: <>Shortlist <span className="text-dim">({shortlist.length})</span></> },
            { id: 'offers', label: <>Offers {incomingPending > 0 && <span className="ml-1 text-[10px] font-bold bg-gold text-black rounded-full px-1.5">{incomingPending}</span>}</> },
            { id: 'contracts', label: <>Contracts {expiring > 0 && <span className="ml-1 text-[10px] font-bold bg-orange-500 text-black rounded-full px-1.5">{expiring}</span>}</> },
            { id: 'scouting', label: 'Scouting' },
          ]}
        />

        {tab === 'search' && (
          <div className="flex flex-col gap-3">
            <SearchFilters state={state} filters={filters} setF={setF} reset={() => { setFilters(DEFAULT_FILTERS); setPage(0); }} />
            <Panel title={`Results · ${sorted.length.toLocaleString()}`} bodyClass="p-0" right={<span className="text-xs text-muted">Potential shown as scouting estimate · click a row for the full profile</span>}>
              {sorted.length === 0 ? <Empty>No players match these filters.</Empty> : (
                <>
                  <MarketTable rows={pageRows} sort={sort} setSort={setSort} state={state} shortlist={shortlist} toggleShort={toggleShort} onOffer={setOfferFor} onScout={doScout} windowOpen={windowOpen} />
                  <div className="px-3 border-t hairline"><Pager page={pg} pages={pages} setPage={setPage} total={sorted.length} perPage={PER} /></div>
                </>
              )}
            </Panel>
          </div>
        )}

        {tab === 'shortlist' && (
          <Panel title={`Shortlist · ${shortRows.length}`} bodyClass="p-0" right={shortRows.length > 0 && <button className="btn btn-ghost text-xs" onClick={() => { (state as WithShortlist).shortlist = []; useStore.getState().bump(); }}>Clear shortlist</button>}>
            {shortRows.length === 0 ? <Empty>Your shortlist is empty. Use the ☆ star in the player search to track targets.</Empty> : (
              <MarketTable rows={shortRows} sort={sort} setSort={setSort} state={state} shortlist={shortlist} toggleShort={toggleShort} onOffer={setOfferFor} onScout={doScout} windowOpen={windowOpen} />
            )}
          </Panel>
        )}

        {tab === 'offers' && <OffersTab state={state} />}
        {tab === 'contracts' && <ContractsTab state={state} />}
        {tab === 'scouting' && <ScoutingTab state={state} rows={rows} onScout={doScout} onOffer={setOfferFor} />}
      </div>

      {offerFor && <OfferModal state={state} player={offerFor} onClose={() => setOfferFor(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ filters
function SearchFilters({ state, filters: f, setF, reset }: { state: GameState; filters: Filters; setF: (p: Partial<Filters>) => void; reset: () => void }) {
  const opts = useMemo(() => leagueOptions(state), [state]);
  return (
    <div className="panel p-3 flex flex-wrap items-end gap-x-4 gap-y-3">
      <FilterLabel label="Search"><input className="input w-52" placeholder="Handle, name or team…" value={f.q} onChange={(e) => setF({ q: e.target.value })} /></FilterLabel>
      <FilterLabel label="Role"><RoleChips value={f.roles} onChange={(roles) => setF({ roles })} labels={ROLE_LABEL} /></FilterLabel>
      <FilterLabel label="Leagues"><MultiSelect options={opts} value={f.leagues} onChange={(leagues) => setF({ leagues })} placeholder="All leagues" width={180} /></FilterLabel>
      <FilterLabel label="Region">
        <select className="input" value={f.region} onChange={(e) => setF({ region: e.target.value as RegionId | '' })}>
          <option value="">All regions</option>
          {(Object.keys(REGION_LABEL) as RegionId[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
        </select>
      </FilterLabel>
      <FilterLabel label="Age"><NumField value={f.ageMin} onChange={(ageMin) => setF({ ageMin })} placeholder="min" width={56} /><span className="text-dim">–</span><NumField value={f.ageMax} onChange={(ageMax) => setF({ ageMax })} placeholder="max" width={56} /></FilterLabel>
      <FilterLabel label="Overall"><NumField value={f.ovrMin} onChange={(ovrMin) => setF({ ovrMin })} placeholder="min" width={56} /><span className="text-dim">–</span><NumField value={f.ovrMax} onChange={(ovrMax) => setF({ ovrMax })} placeholder="max" width={56} /></FilterLabel>
      <FilterLabel label="Max fee ($k)"><NumField value={f.maxFee} onChange={(maxFee) => setF({ maxFee })} placeholder="any" width={80} /></FilterLabel>
      <FilterLabel label="Max salary ($k/yr)"><NumField value={f.maxSalary} onChange={(maxSalary) => setF({ maxSalary })} placeholder="any" width={80} /></FilterLabel>
      <FilterLabel label="Interest">
        <select className="input" value={f.minInterest} onChange={(e) => setF({ minInterest: Number(e.target.value) })}>
          <option value={0}>Any</option>
          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{'●'.repeat(n)} or more</option>)}
        </select>
      </FilterLabel>
      <div className="flex flex-col gap-1 text-xs">
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={f.freeOnly} onChange={(e) => setF({ freeOnly: e.target.checked })} />Free agents only</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={f.affordable} onChange={(e) => setF({ affordable: e.target.checked })} />Fee within budget</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={f.hideOwn} onChange={(e) => setF({ hideOwn: e.target.checked })} />Hide my players</label>
      </div>
      <button className="btn btn-ghost ml-auto" onClick={reset}>Reset filters</button>
    </div>
  );
}

// ------------------------------------------------------------------ market table
function MarketTable({ rows, sort, setSort, state, shortlist, toggleShort, onOffer, onScout, windowOpen }: {
  rows: MarketRow[]; sort: { key: SortKey; desc: boolean }; setSort: (s: { key: SortKey; desc: boolean }) => void; state: GameState;
  shortlist: string[]; toggleShort: (id: string) => void; onOffer: (p: Player) => void; onScout: (p: Player) => void; windowOpen: boolean;
}) {
  const user = state.teams[state.userTeamId];
  const pendingFor = new Set(state.transferOffers.filter((o) => o.direction === 'outgoing' && o.status === 'pending').map((o) => o.playerId));
  const S = (label: ReactNode, k: SortKey, cls = '', title?: string, defaultDesc = true) => <SortTh label={label} k={k} sort={sort} setSort={setSort} className={cls} title={title} defaultDesc={defaultDesc} />;
  return (
    <div className="overflow-x-auto">
      <table className="tbl [&_td]:px-1.5! [&_th]:px-1.5!">
        <thead>
          <tr>
            <th className="w-6"></th>
            {S('Player', 'handle', '', undefined, false)}
            {S('Team · league', 'team', '', undefined, false)}
            {S('Pos', 'role', '', undefined, false)}
            {S('Age', 'age', 'text-right', undefined, false)}
            {S('Ovr', 'ovr', 'text-center')}
            {S('Pot · known', 'pot', 'text-center', 'Potential — scouted estimate, with your scouting knowledge')}
            {S('Value', 'value', 'text-right')}
            {S('Fee', 'ask', 'text-right', 'Asking transfer fee')}
            {S('Wage', 'demand', 'text-right', 'Yearly salary the player would ask from your club')}
            {S('Interest', 'int', '')}
            {S('Expires', 'expires', 'text-right', 'Contract expiry', false)}
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.p;
            const own = p.teamId === user.id;
            const blocked = !!p.teamId && !windowOpen;
            const starred = shortlist.includes(p.id);
            return (
              <tr key={p.id} className="row" onClick={() => nav('player', p.id)}>
                <td onClick={(e) => { e.stopPropagation(); toggleShort(p.id); }} title={starred ? 'Remove from shortlist' : 'Add to shortlist'} className="text-center">
                  <span className={`text-base leading-none ${starred ? 'text-gold' : 'text-dim hover:text-gold2'}`}>{starred ? '★' : '☆'}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2 min-w-[150px] max-w-[190px]">
                    <Portrait player={p} team={r.team} size={30} />
                    <div className="min-w-0 leading-tight">
                      <div className="font-semibold truncate flex items-center gap-1">{p.handle}{p.isCustom && <span className="text-[9px] text-accent font-bold">CUSTOM</span>}{p.generated && <span className="text-[9px] text-sky-400 font-bold" title="Fictional player generated for this transfer window">{p.teamId ? 'GENERATED' : 'UNSIGNED · GEN'}</span>}</div>
                      <div className="text-[11px] text-dim truncate">{flag(p.country)} {p.name}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {r.team ? (
                    <button className="flex items-center gap-1.5 hover:text-gold2 text-left" onClick={(e) => { e.stopPropagation(); nav('team', r.team!.id); }}>
                      <TeamLogo team={r.team} size={22} />
                      <span className="leading-tight min-w-0">
                        <span className="block truncate max-w-[110px]">{r.team.short}</span>
                        <span className="block text-[10px] text-dim whitespace-nowrap">{r.league?.name ?? '—'}<TierDot tier={r.league?.tier} /></span>
                      </span>
                    </button>
                  ) : <span className="chip text-accent border-accent/40">Free agent</span>}
                </td>
                <td title={ROLE_LABEL[p.role]}><div className="flex items-center gap-1"><RoleIcon role={p.role} size={14} /><span className="text-[11px] text-muted uppercase">{ROLE_SHORT[p.role]}</span></div></td>
                <td className="text-right font-display tabular-nums">{r.age ?? '—'}</td>
                <td className="text-center"><div className="flex justify-center"><Rating v={r.ovr} size="sm" /></div></td>
                <td className="text-center whitespace-nowrap" title={`Scouting knowledge ${r.k}%`}><RangeTag range={r.pot} /> <KnowledgeTag k={r.k} /></td>
                <td className="text-right font-display tabular-nums">{money(p.value)}</td>
                <td className="text-right font-display tabular-nums">{own ? <span className="text-dim">—</span> : r.team ? money(r.ask) : <span className="text-accent">Free</span>}</td>
                <td className="text-right font-display tabular-nums">{money(r.demand)}</td>
                <td><InterestDots value={r.int} /></td>
                <td className="text-right text-xs text-muted tabular-nums">{p.contract ? p.contract.expires.slice(0, 4) : '—'}</td>
                <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {!own && (
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-ghost px-2 py-1 text-xs" disabled={r.k >= 100 || user.balance < scoutCost(state, p)} title={r.k >= 100 ? 'Fully scouted' : `Send a scout (${money(scoutCost(state, p))})`} onClick={() => onScout(p)}>
                        {r.k >= 100 ? 'Known' : <>Scout <span className="text-dim">{money(scoutCost(state, p)).replace('$', '')}</span></>}
                      </button>
                      <button className={`btn px-2 py-1 text-xs ${pendingFor.has(p.id) ? '' : 'btn-gold'}`} disabled={blocked} title={blocked ? 'Transfer window closed — only free agents can be signed' : pendingFor.has(p.id) ? 'An offer is already pending' : 'Make an offer'} onClick={() => onOffer(p)}>
                        {pendingFor.has(p.id) ? 'Pending' : 'Offer'}
                      </button>
                    </div>
                  )}
                  {own && <span className="text-[11px] text-dim">Your player</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ offer modal
function Hint({ level, children }: { level: 'good' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const c = { good: '#22c55e', ok: '#84cc16', warn: '#eab308', bad: '#ef4444' }[level];
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
      <span className="text-muted leading-snug">{children}</span>
    </div>
  );
}

function OfferModal({ state, player: p, onClose }: { state: GameState; player: Player; onClose: () => void }) {
  const user = state.teams[state.userTeamId];
  const owner = p.teamId ? state.teams[p.teamId] ?? null : null;
  const ask = askingFee(state, p, owner);
  const demand = salaryDemand(state, p, user);
  const int = interest(state, p, user);
  const view = scoutedView(state, p);
  const [fee, setFee] = useState<number>(owner ? ask : 0);
  const [salary, setSalary] = useState<number>(demand);
  const [years, setYears] = useState(2);
  const windowOpen = inTransferWindow(state.date);
  const blocked = !!owner && !windowOpen;
  const pending = state.transferOffers.find((o) => o.playerId === p.id && o.direction === 'outgoing' && o.status === 'pending');

  const ratio = owner && ask > 0 ? fee / ask : 1;
  const clubP = owner ? clamp((ratio - 0.92) / 0.1, 0, 1) : 1;
  const wageMin = demand * (0.95 - int * 0.15);
  const wageOk = salary >= wageMin;
  const willP = Math.min(1, int + 0.25);
  const fundsOk = user.balance >= fee;
  const chance = clubP * (wageOk ? 1 : 0) * willP * (fundsOk ? 1 : 0);
  const payroll = payrollYearly(state, user);
  const submit = () => {
    makeOffer(state, p.id, Math.max(0, Math.round(fee)), Math.max(0, Math.round(salary)), years);
    useStore.getState().notify(`Offer for ${p.handle} submitted — expect a reply in your inbox within 3 days.`);
    useStore.getState().bump();
    onClose();
  };
  const step = (v: number, set: (n: number) => void, mult: number) => set(Math.max(0, Math.round((v * mult) / 1000) * 1000));

  return (
    <Modal open onClose={onClose} title={`Transfer offer · ${p.handle}`} width={720}>
      <div className="flex gap-4 items-start">
        <Portrait player={p} team={owner} size={84} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><RoleIcon role={p.role} /><span className="font-display text-2xl font-bold">{p.handle}</span><span className="text-muted text-sm truncate">{flag(p.country)} {p.name}</span></div>
          <div className="text-sm text-muted flex items-center gap-2 mt-0.5">
            {owner ? <><TeamLogo team={owner} size={18} /> {owner.name} · {state.leagues[owner.leagueId]?.name}</> : <span className="text-accent">Free agent</span>}
            <span>· age {playerAge(p, state.date) ?? '?'}</span>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-2 text-center">
            <MiniStat label="Overall" value={<span style={{ color: ratingColor(view.overall) }}>{view.overall}</span>} />
            <MiniStat label="Potential" value={<RangeTag range={view.potential} />} />
            <MiniStat label="Value" value={money(p.value)} />
            <MiniStat label="Salary now" value={p.contract ? money(p.contract.salary) : '—'} />
            <MiniStat label="Contract" value={p.contract ? fmtDate(p.contract.expires, { month: 'short', year: 'numeric' }) : '—'} />
          </div>
        </div>
      </div>

      {blocked && <div className="mt-4 panel-flat px-3 py-2 text-sm text-amber-400">The transfer window is closed until {fmtDate(windowBoundary(state.date).day, { month: 'short', day: 'numeric' })}. Players under contract can only be signed during a window — free agents can be signed any time.</div>}
      {pending && <div className="mt-4 panel-flat px-3 py-2 text-sm text-gold2">You already have a pending offer ({money(pending.fee)} fee, {money(pending.salary)}/yr) — a new offer will be evaluated separately.</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Transfer fee</div>
          <input type="number" className="input w-full font-display text-lg" value={fee} min={0} step={5000} disabled={!owner} onChange={(e) => setFee(Number(e.target.value) || 0)} />
          <div className="text-[11px] text-dim mt-1">{owner ? <>Asking: <span className="text-text">{money(ask)}</span>{p.contract?.buyout ? <> · buyout {money(p.contract.buyout)}</> : null}</> : 'Free agents cost no fee'}</div>
          {owner && <div className="flex gap-1 mt-1.5">{[0.9, 1, 1.1].map((m) => <button key={m} className="btn btn-ghost px-2 py-0.5 text-[11px]" onClick={() => step(ask, setFee, m)}>{m === 1 ? 'Ask' : `${m > 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`}</button>)}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Yearly salary</div>
          <input type="number" className="input w-full font-display text-lg" value={salary} min={0} step={1000} onChange={(e) => setSalary(Number(e.target.value) || 0)} />
          <div className="text-[11px] text-dim mt-1">Demand: <span className="text-text">{money(demand)}</span>/yr</div>
          <div className="flex gap-1 mt-1.5">{[0.9, 1, 1.15].map((m) => <button key={m} className="btn btn-ghost px-2 py-0.5 text-[11px]" onClick={() => step(demand, setSalary, m)}>{m === 1 ? 'Demand' : `${m > 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`}</button>)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Contract length</div>
          <div className="flex gap-1">{[1, 2, 3].map((y) => <button key={y} className={`btn flex-1 justify-center ${years === y ? 'btn-gold' : ''}`} onClick={() => setYears(y)}>{y} yr</button>)}</div>
          <div className="text-[11px] text-dim mt-1">Total wage commitment {money(salary * years)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel-flat p-3 flex flex-col gap-1.5">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Scout's assessment</div>
          {owner ? (
            ratio >= 1.02 ? <Hint level="good">{owner.short} will almost certainly accept this fee.</Hint>
              : ratio >= 0.97 ? <Hint level="ok">Fee is close to their valuation — likely accepted.</Hint>
                : ratio >= 0.92 ? <Hint level="warn">Fee is slightly below their valuation — it may be rejected.</Hint>
                  : <Hint level="bad">{owner.short} will reject this — they want around {money(ask)}.</Hint>
          ) : <Hint level="good">No fee required for a free agent.</Hint>}
          {salary >= demand ? <Hint level="good">{p.handle} is happy with the salary.</Hint>
            : wageOk ? <Hint level="ok">Salary is below the demand but acceptable given their interest.</Hint>
              : <Hint level="bad">Salary too low — {p.handle} expects about {money(demand)} per year (minimum around {money(Math.ceil(wageMin / 1000) * 1000)}).</Hint>}
          <div className="flex items-center gap-2 text-xs">
            <span className={`mt-0 w-2 h-2 rounded-full shrink-0 ${int >= 0.6 ? 'bg-green-500' : int >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-muted">Interest in joining {user.short}:</span><InterestDots value={int} />
            <span className="text-dim">{int >= 0.75 ? 'very keen' : int >= 0.55 ? 'interested' : int >= 0.35 ? 'lukewarm' : 'reluctant'}</span>
          </div>
          {!fundsOk && <Hint level="bad">Insufficient funds: balance {money(user.balance)} is below the fee.</Hint>}
          {user.roster.length >= 10 && <Hint level="warn">Your roster already has {user.roster.length} players.</Hint>}
        </div>
        <div className="panel-flat p-3 flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Estimated chance of success</div>
          <div className="flex items-center gap-3">
            <div className="font-display text-4xl font-bold" style={{ color: ratingColor(30 + chance * 65) }}>{Math.round(chance * 100)}%</div>
            <div className="flex-1 h-2 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${chance * 100}%`, background: ratingColor(30 + chance * 65) }} /></div>
          </div>
          <div className="text-xs text-muted grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span>Balance after fee</span><span className={`text-right font-display ${user.balance - fee < 0 ? 'text-red-400' : 'text-text'}`}>{money(user.balance - fee)}</span>
            <span>Payroll after signing</span><span className="text-right font-display text-text">{money(payroll + salary)}/yr</span>
            <span>Response</span><span className="text-right text-text">within 3 days (inbox)</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" disabled={blocked || p.teamId === user.id} onClick={submit}>Submit offer</button>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="panel-flat px-2 py-1.5 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-dim font-bold">{label}</div>
      <div className="font-display font-bold text-sm truncate">{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------ offers tab
const STATUS_COLOR: Record<TransferOffer['status'], string> = { pending: '#c8aa6e', accepted: '#22c55e', rejected: '#ef4444', withdrawn: '#5b6787', countered: '#38bdf8' };

function OffersTab({ state }: { state: GameState }) {
  const [confirm, setConfirm] = useState<TransferOffer | null>(null);
  const out = state.transferOffers.filter((o) => o.direction === 'outgoing');
  const inc = state.transferOffers.filter((o) => o.direction === 'incoming');
  const respond = (o: TransferOffer, accept: boolean) => {
    // the player has a say (bidTalks.ts): he may refuse personal terms, and reacts either way
    useStore.getState().notify(respondIncomingOffer(state, o.id, accept).message);
    useStore.getState().bump();
    setConfirm(null);
  };
  const withdraw = (o: TransferOffer) => { o.status = 'withdrawn'; o.message = 'Withdrawn by your club.'; useStore.getState().bump(); };
  const news = state.news.filter((n) => n.tags.includes('transfer')).slice(0, 14);

  const PlayerCell = ({ id }: { id: string }) => {
    const p = state.players[id];
    if (!p) return <span className="text-dim">Unknown</span>;
    return (
      <button className="flex items-center gap-2 hover:text-gold2 text-left" onClick={() => nav('player', p.id)}>
        <Portrait player={p} size={26} team={p.teamId ? state.teams[p.teamId] : null} />
        <span className="font-semibold">{p.handle}</span><RoleIcon role={p.role} size={12} />
      </button>
    );
  };
  const TeamCell = ({ id }: { id: string | null }) => {
    const t = id ? state.teams[id] : null;
    if (!t) return <span className="text-accent text-xs">Free agent</span>;
    return <button className="flex items-center gap-1.5 hover:text-gold2" onClick={() => nav('team', t.id)}><TeamLogo team={t} size={18} />{t.short}</button>;
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 flex flex-col gap-4">
        <Panel title={`Incoming bids · ${inc.filter((o) => o.status === 'pending').length} pending`} bodyClass="p-0">
          {inc.length === 0 ? <Empty>No clubs have bid for your players yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Player</th><th>Bidder</th><th className="text-right">Fee</th><th className="text-right">Value</th><th className="text-right">Their wage</th><th>His view</th><th>Expires</th><th>Status</th><th className="text-right">Action</th></tr></thead>
                <tbody>
                  {inc.map((o) => {
                    const p = state.players[o.playerId];
                    return (
                      <tr key={o.id}>
                        <td className="text-xs text-muted whitespace-nowrap">{fmtDate(o.date, { month: 'short', day: 'numeric' })}</td>
                        <td><PlayerCell id={o.playerId} /></td>
                        <td><TeamCell id={o.toTeamId} /></td>
                        <td className="text-right font-display font-bold text-gold2">{money(o.fee)}</td>
                        <td className="text-right font-display text-muted">{p ? money(p.value) : '—'}</td>
                        <td className="text-right font-display">{money(o.salary)}</td>
                        <td><StancePill st={o.stance} /></td>
                        <td className="text-xs text-muted">{fmtDate(o.expires, { month: 'short', day: 'numeric' })}</td>
                        <td title={o.stance?.note ?? o.message}><Pill color={STATUS_COLOR[o.status]}>{o.status}</Pill></td>
                        <td className="text-right whitespace-nowrap">
                          {o.status === 'pending' && p?.teamId === state.userTeamId ? (
                            <div className="flex gap-1 justify-end">
                              <button className="btn btn-gold px-2 py-1 text-xs" onClick={() => setConfirm(o)}>Accept</button>
                              <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => respond(o, false)}>Reject</button>
                            </div>
                          ) : <span className="text-dim text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={`Your offers · ${out.filter((o) => o.status === 'pending').length} pending`} bodyClass="p-0">
          {out.length === 0 ? <Empty>You haven't made any offers. Find targets in the player search.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Player</th><th>From</th><th className="text-right">Fee</th><th className="text-right">Salary</th><th className="text-center">Yrs</th><th>Status</th><th>Response</th><th></th></tr></thead>
                <tbody>
                  {out.map((o) => (
                    <tr key={o.id}>
                      <td className="text-xs text-muted whitespace-nowrap">{fmtDate(o.date, { month: 'short', day: 'numeric' })}</td>
                      <td><PlayerCell id={o.playerId} /></td>
                      <td><TeamCell id={o.fromTeamId} /></td>
                      <td className="text-right font-display">{o.fee ? money(o.fee) : '—'}</td>
                      <td className="text-right font-display">{money(o.salary)}</td>
                      <td className="text-center font-display">{o.years}</td>
                      <td><Pill color={STATUS_COLOR[o.status]}>{o.status}</Pill></td>
                      <td className="text-xs text-muted max-w-[260px]">{o.status === 'pending' ? `Reply expected ${fmtDate(o.expires, { month: 'short', day: 'numeric' })}` : o.message ?? (o.status === 'accepted' ? 'Deal completed.' : '')}</td>
                      <td className="text-right">{o.status === 'pending' && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => withdraw(o)}>Withdraw</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Transfer news">
        {news.length === 0 ? <Empty>No transfer news yet.</Empty> : (
          <div className="flex flex-col divide-y divide-[#141e33]">
            {news.map((n) => (
              <div key={n.id} className="py-2">
                <div className="text-[11px] text-dim">{fmtDate(n.date, { month: 'short', day: 'numeric' })}</div>
                <div className="text-sm font-semibold leading-snug">{n.headline}</div>
                <div className="text-xs text-muted leading-snug">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {confirm && (() => {
        const p = state.players[confirm.playerId];
        const buyer = state.teams[confirm.toTeamId];
        return (
          <Modal open onClose={() => setConfirm(null)} title="Accept bid?" width={460}>
            <div className="text-sm text-muted leading-relaxed">
              Sell <span className="text-text font-semibold">{p?.handle}</span> to <span className="text-text font-semibold">{buyer?.name}</span> for <span className="text-gold2 font-semibold">{money(confirm.fee)}</span>?
              {p && <> Their market value is {money(p.value)}{confirm.fee < p.value ? ' — this bid is below value.' : '.'}</>}
              {p && Object.values(state.teams[state.userTeamId].lineup).includes(p.id) && <div className="mt-2 text-amber-400">{p.handle} is currently in your starting lineup.</div>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={() => respond(confirm, true)}>Accept & sell</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ------------------------------------------------------------------ contracts tab
function releaseCost(state: GameState, p: Player) {
  return p.contract ? Math.round(Math.max(0, (new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) / (365 * 864e5)) * p.contract.salary * 0.5) : 0;
}

function ContractsTab({ state }: { state: GameState }) {
  const user = state.teams[state.userTeamId];
  const [renew, setRenew] = useState<Player | null>(null);
  const [release, setRelease] = useState<Player | null>(null);
  const players = user.roster.map((id) => state.players[id]).filter(Boolean).sort((a, b) => (a.contract?.expires ?? '').localeCompare(b.contract?.expires ?? ''));
  const expiring = players.filter((p) => p.contract && monthsUntil(state.date, p.contract.expires) <= 12);
  const starters = new Set(Object.values(user.lineup).filter(Boolean) as string[]);

  const Row = ({ p, compact }: { p: Player; compact?: boolean }) => {
    const m = p.contract ? monthsUntil(state.date, p.contract.expires) : 0;
    const demand = salaryDemand(state, p, user);
    return (
      <tr className="row" onClick={() => nav('player', p.id)}>
        <td>
          <div className="flex items-center gap-2">
            <Portrait player={p} team={user} size={28} />
            <div className="leading-tight"><div className="font-semibold">{p.handle} {starters.has(p.id) && <span className="text-[9px] text-gold font-bold ml-1">STARTER</span>}</div><div className="text-[11px] text-dim">{flag(p.country)} {p.name}</div></div>
          </div>
        </td>
        <td><RoleIcon role={p.role} size={14} /></td>
        <td className="text-right font-display">{playerAge(p, state.date) ?? '—'}</td>
        <td className="text-center"><div className="flex justify-center"><Rating v={playerOvr(p)} size="sm" /></div></td>
        <td className="text-right font-display">{p.contract ? money(p.contract.salary) : '—'}</td>
        <td className="text-right font-display" style={{ color: demand > (p.contract?.salary ?? 0) * 1.15 ? '#f97316' : undefined }}>{money(demand)}</td>
        <td className="text-right text-xs whitespace-nowrap">{p.contract ? fmtDate(p.contract.expires) : '—'}</td>
        <td className="text-right font-display" style={{ color: m <= 3 ? '#ef4444' : m <= 6 ? '#f97316' : m <= 12 ? '#eab308' : '#8a97b3' }}>{p.contract ? `${Math.max(0, Math.round(m))} mo` : '—'}</td>
        {!compact && <td className="text-right font-display text-muted">{p.contract?.buyout ? money(p.contract.buyout) : '—'}</td>}
        {!compact && <td className="text-right font-display">{money(p.value)}</td>}
        <td className="text-right font-display" style={{ color: p.morale >= 70 ? '#22c55e' : p.morale >= 45 ? '#eab308' : '#ef4444' }}>{Math.round(p.morale)}</td>
        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1 justify-end">
            <button className={`btn px-2 py-1 text-xs ${m <= 12 ? 'btn-gold' : ''}`} onClick={() => setRenew(p)}>{m <= 12 ? 'Renew' : 'Extend'}</button>
            {!compact && <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => setRelease(p)}>Release</button>}
          </div>
        </td>
      </tr>
    );
  };
  const Head = ({ compact }: { compact?: boolean }) => (
    <thead><tr><th>Player</th><th>Pos</th><th className="text-right">Age</th><th className="text-center">Ovr</th><th className="text-right">Salary</th><th className="text-right">Demand</th><th className="text-right">Expires</th><th className="text-right">Left</th>{!compact && <th className="text-right">Buyout</th>}{!compact && <th className="text-right">Value</th>}<th className="text-right">Morale</th><th></th></tr></thead>
  );
  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Expiring within 12 months · ${expiring.length}`} bodyClass="p-0" right={<span className="text-xs text-muted">Contracts expire on Nov 18 — unrenewed players leave as free agents</span>}>
        {expiring.length === 0 ? <Empty>No contracts expire in the next 12 months.</Empty> : (
          <div className="overflow-x-auto"><table className="tbl"><Head compact /><tbody>{expiring.map((p) => <Row key={p.id} p={p} compact />)}</tbody></table></div>
        )}
      </Panel>
      <Panel title={`Squad contracts · ${players.length}`} bodyClass="p-0" right={<span className="text-xs text-muted">Payroll {money(payrollYearly(state, user))}/yr</span>}>
        <div className="overflow-x-auto"><table className="tbl"><Head /><tbody>{players.map((p) => <Row key={p.id} p={p} />)}</tbody></table></div>
      </Panel>
      {renew && <RenewModal state={state} player={renew} onClose={() => setRenew(null)} />}
      {release && (
        <Modal open onClose={() => setRelease(null)} title={`Release ${release.handle}?`} width={480}>
          <div className="flex items-center gap-3">
            <Portrait player={release} team={user} size={56} />
            <div className="text-sm text-muted leading-relaxed">
              Terminating the contract costs <span className="text-red-400 font-semibold">{money(releaseCost(state, release))}</span> (50% of the remaining salary, contract until {release.contract ? fmtDate(release.contract.expires) : '—'}). {release.handle} becomes a free agent immediately.
            </div>
          </div>
          {starters.has(release.id) && <div className="mt-3 text-sm text-amber-400">{release.handle} is in your starting lineup — the slot will be refilled automatically.</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setRelease(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => {
              const cost = releaseCost(state, release);
              releasePlayer(state, release.id);
              useStore.getState().notify(`${release.handle} released (${money(cost)} termination cost)`);
              useStore.getState().bump();
              setRelease(null);
            }}>Release player</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RenewModal({ state, player: p, onClose }: { state: GameState; player: Player; onClose: () => void }) {
  const user = state.teams[state.userTeamId];
  const demand = salaryDemand(state, p, user);
  const [salary, setSalary] = useState(demand);
  const [years, setYears] = useState(2);
  const [result, setResult] = useState<string | null>(null);
  const threshold = demand * (1.02 - (p.morale / 100) * 0.12 - p.hidden.loyalty / 1000);
  const ok = salary >= threshold;
  const submit = () => {
    const r = offerRenewal(state, p.id, Math.round(salary), years);
    useStore.getState().notify(r.message);
    useStore.getState().bump();
    if (r.ok) onClose(); else setResult(r.message);
  };
  return (
    <Modal open onClose={onClose} title={`Contract renewal · ${p.handle}`} width={520}>
      <div className="flex items-center gap-3">
        <Portrait player={p} team={user} size={56} />
        <div className="text-sm">
          <div className="font-display text-xl font-bold">{p.handle} <span className="text-muted text-sm font-sans font-normal">{ROLE_LABEL[p.role]} · {playerAge(p, state.date)} y/o</span></div>
          <div className="text-muted text-xs">Current: {p.contract ? `${money(p.contract.salary)}/yr until ${fmtDate(p.contract.expires)}` : 'no contract'} · Morale {Math.round(p.morale)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Yearly salary</div>
          <input type="number" className="input w-full font-display text-lg" value={salary} step={1000} onChange={(e) => setSalary(Number(e.target.value) || 0)} />
          <div className="text-[11px] text-dim mt-1">Demand {money(demand)}/yr</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Length</div>
          <div className="flex gap-1">{[1, 2, 3].map((y) => <button key={y} className={`btn flex-1 justify-center ${years === y ? 'btn-gold' : ''}`} onClick={() => setYears(y)}>{y} yr</button>)}</div>
          <div className="text-[11px] text-dim mt-1">New expiry Nov 18, {Number(state.date.slice(0, 4)) + years - (state.date.slice(5) > '11-18' ? 0 : 1)}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1.5 panel-flat p-3">
        {ok ? <Hint level="good">{p.handle} is likely to sign at this salary (needs about {money(Math.ceil(threshold / 1000) * 1000)}).</Hint>
          : <Hint level="bad">Too low — {p.handle} will want at least about {money(Math.ceil(threshold / 1000) * 1000)} per year.</Hint>}
        <Hint level={p.morale >= 65 ? 'good' : p.morale >= 45 ? 'warn' : 'bad'}>Higher morale and loyalty make players accept a smaller raise.</Hint>
        <div className="text-xs text-muted mt-1">Payroll change: <span className="font-display text-text">{money(salary - (p.contract?.salary ?? 0), true)}/yr</span></div>
      </div>
      {result && <div className="mt-3 text-sm text-red-400">{result}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" onClick={submit}>Offer contract</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ scouting tab
function ScoutingTab({ state, rows, onScout, onOffer }: { state: GameState; rows: MarketRow[]; onScout: (p: Player) => void; onOffer: (p: Player) => void }) {
  const user = state.teams[state.userTeamId];
  const power = scoutingPower(state, user);
  const scouted = rows.filter((r) => (state.scoutedPlayers[r.p.id] ?? 0) > 0 && r.p.teamId !== user.id).sort((a, b) => b.k - a.k || b.ovr - a.ovr);
  const [sel, setSel] = useState<string | null>(scouted[0]?.p.id ?? null);
  const selRow = scouted.find((r) => r.p.id === sel) ?? scouted[0];
  const tiers: [string, number][] = [['Tier 1 league', 15_000], ['Tier 2 league', 7_000], ['Tier 3 league', 4_000], ['Free agent', 2_000]];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="flex flex-col gap-4">
        <Panel title="Scouting department">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Analytics lab" value={`Lv ${power.lab}`} sub={`+${power.labBonus} knowledge / report`} />
            <Stat label="Per assignment" value={`+${power.min}–${power.max}%`} sub="knowledge gained" color="#c8aa6e" />
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-muted font-semibold">Scouts & analysts</div>
          {power.staff.length === 0 ? <div className="text-xs text-dim mt-1">No scouts or analysts employed — hire one on the Staff page for better reports.</div> : (
            <div className="mt-1 flex flex-col gap-1">
              {power.staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span>{flag(s.country)} {s.handle} <span className="text-dim text-xs">{s.role}</span></span>
                  <span className="font-display font-bold" style={{ color: ratingColor(s.attributes.scouting) }}>{s.attributes.scouting}</span>
                </div>
              ))}
              <div className="text-[11px] text-dim">Staff bonus: +{power.staffBonus} knowledge</div>
            </div>
          )}
          <div className="mt-3 text-[11px] uppercase tracking-wider text-muted font-semibold">Assignment cost</div>
          <div className="grid grid-cols-2 gap-x-4 text-xs mt-1">{tiers.map(([l, c]) => <Fragment key={l}><span className="text-muted">{l}</span><span className="text-right font-display">{l === 'Free agent' ? '$2k–$6k' : money(c)}</span></Fragment>)}</div>
          <div className="mt-3 text-xs text-dim leading-relaxed">
            Knowledge narrows the estimate of hidden attributes (potential, composure, mistakes…). Hidden traits are uncovered at {TRAIT_REVEAL_KNOWLEDGE}% knowledge. Famous players start with a small public baseline; your own players are always fully known.
          </div>
        </Panel>
      </div>
      <Panel title={`Scouted players · ${scouted.length}`} bodyClass="p-0" className="xl:col-span-1">
        {scouted.length === 0 ? <Empty>No scouting reports yet. Use “Scout” in the player search.</Empty> : (
          <div className="max-h-[640px] overflow-auto">
            <table className="tbl">
              <thead><tr><th>Player</th><th className="text-center">Ovr</th><th className="text-center">Pot</th><th>Knowledge</th></tr></thead>
              <tbody>
                {scouted.map((r) => (
                  <tr key={r.p.id} className="row" onClick={() => setSel(r.p.id)} style={{ background: selRow?.p.id === r.p.id ? '#121b30' : undefined }}>
                    <td><div className="flex items-center gap-2"><Portrait player={r.p} team={r.team} size={26} /><div className="leading-tight"><div className="font-semibold">{r.p.handle}</div><div className="text-[10px] text-dim">{r.team?.short ?? 'Free agent'} · {ROLE_LABEL[r.p.role]}</div></div></div></td>
                    <td className="text-center"><div className="flex justify-center"><Rating v={r.ovr} size="sm" /></div></td>
                    <td className="text-center"><RangeTag range={r.pot} /></td>
                    <td className="w-28">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-[#0a1120] overflow-hidden"><div className="h-full bg-gold" style={{ width: `${r.k}%` }} /></div>
                        <KnowledgeTag k={r.k} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {selRow && <ScoutReport state={state} row={selRow} onScout={onScout} onOffer={onOffer} />}
    </div>
  );
}

function ScoutReport({ state, row, onScout, onOffer }: { state: GameState; row: MarketRow; onScout: (p: Player) => void; onOffer: (p: Player) => void }) {
  const p = row.p;
  const v = scoutedView(state, p);
  const k = knowledgeOf(state, p);
  const cost = scoutCost(state, p);
  const user = state.teams[state.userTeamId];
  const hiddenCount = p.traits.filter((t) => TRAITS[t]?.hidden).length;
  return (
    <Panel title="Scouting report" right={<button className="btn btn-ghost text-xs" onClick={() => nav('player', p.id)}>Profile →</button>}>
      <div className="flex items-center gap-3">
        <Portrait player={p} team={row.team} size={56} />
        <div className="min-w-0">
          <div className="font-display text-xl font-bold">{p.handle}</div>
          <div className="text-xs text-muted">{row.team?.name ?? 'Free agent'} · {ROLE_LABEL[p.role]} · {row.age ?? '?'} y/o</div>
          <div className="text-xs mt-0.5"><span className="text-muted">Knowledge</span> <KnowledgeTag k={k} /> <span className="text-dim">({knowledgeLabel(k)})</span></div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {HIDDEN_KEYS.map((key) => <RangeBar key={key} label={HIDDEN_LABEL[key]} range={v.hidden[key]} negative={!!HIDDEN_NEGATIVE[key]} />)}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-muted font-semibold">Traits</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {v.traits.length === 0 && <span className="text-xs text-dim">No known traits.</span>}
        {v.traits.map((t) => {
          const d = TRAITS[t];
          return <span key={t} title={d?.desc}><Pill color={d?.kind === 'positive' ? '#22c55e' : d?.kind === 'negative' ? '#ef4444' : '#8a97b3'}>{d?.name ?? t}{d?.hidden ? ' ◆' : ''}</Pill></span>;
        })}
        {!v.hiddenTraitsRevealed && <span className="text-xs text-dim">Hidden traits unknown until {TRAIT_REVEAL_KNOWLEDGE}%.</span>}
        {v.hiddenTraitsRevealed && hiddenCount === 0 && <span className="text-xs text-dim">No hidden traits.</span>}
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn flex-1 justify-center" disabled={k >= 100 || user.balance < cost} onClick={() => onScout(p)}>{k >= 100 ? 'Fully scouted' : `Scout again (${money(cost)})`}</button>
        <button className="btn btn-gold flex-1 justify-center" disabled={!!p.teamId && !inTransferWindow(state.date)} onClick={() => onOffer(p)}>Make offer</button>
      </div>
    </Panel>
  );
}
