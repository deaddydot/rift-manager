import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Player, Team, Role, RegionId, LeagueDef, Competition } from '../../engine/types';
import { ROLES, ROLE_LABEL, REGION_LABEL } from '../../engine/types';
import { playerOvr } from '../../engine/management/transfers';
import { scoutedView } from '../../engine/management/scouting';
import { Panel, Stat, Tabs, Rating, Portrait, TeamLogo, RoleIcon, Pill, Empty, money, num, fmtDate, flag, pct, ratingColor } from '../components/kit';
import { RangeTag, KnowledgeTag, SortTh, Pager, MultiSelect, RoleChips, NumField, FilterLabel, leagueOptions, isRealPlayer, playerAge, teamRating, starPlayer, TierDot } from './worldKit';

type TabId = 'players' | 'teams' | 'leagues';
let presetLeague: string | null = null;

export default function DatabasePage({ tab }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((x) => x.v);
  const t: TabId = tab === 'teams' || tab === 'leagues' ? tab : 'players';
  const nPlayers = useMemo(() => Object.values(state.players).filter((p) => isRealPlayer(p) && !p.retired).length, [state, v]);
  const nFree = useMemo(() => Object.values(state.players).filter((p) => isRealPlayer(p) && !p.retired && !p.teamId).length, [state, v]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">World Database</h1>
          <div className="text-sm text-muted mt-1">{nPlayers.toLocaleString()} active players ({nFree} free agents) · {Object.keys(state.teams).length} teams · {Object.keys(state.leagues).length} leagues</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => nav('transfers')}>Transfer hub →</button>
          <button className="btn" onClick={() => nav('champions')}>Champions →</button>
        </div>
      </div>
      <div>
        <Tabs<TabId> value={t} onChange={(x) => nav('database', x)} tabs={[{ id: 'players', label: 'Players' }, { id: 'teams', label: 'Teams' }, { id: 'leagues', label: 'Leagues' }]} />
        {t === 'players' && <PlayersBrowser state={state} />}
        {t === 'teams' && <TeamsBrowser state={state} />}
        {t === 'leagues' && <LeaguesBrowser state={state} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ players
interface PRow { p: Player; team: Team | null; league?: LeagueDef; ovr: number; pot: [number, number]; k: number; age: number | null }
type PSort = 'handle' | 'country' | 'team' | 'league' | 'role' | 'age' | 'ovr' | 'pot' | 'value' | 'salary' | 'expires' | 'rep' | 'rgames' | 'rwr' | 'rkda' | 'sgames' | 'swr';
type Status = 'all' | 'contracted' | 'free' | 'retired' | 'custom' | 'shortlist';

function pSortVal(r: PRow, k: PSort): number | string {
  const p = r.p;
  switch (k) {
    case 'handle': return p.handle.toLowerCase();
    case 'country': return p.country;
    case 'team': return r.team?.name.toLowerCase() ?? '~';
    case 'league': return (r.league?.tier ?? 4) * 1000 + (r.league?.name.charCodeAt(0) ?? 0);
    case 'role': return ROLES.indexOf(p.role);
    case 'age': return r.age ?? 99;
    case 'ovr': return r.ovr;
    case 'pot': return (r.pot[0] + r.pot[1]) / 2;
    case 'value': return p.value;
    case 'salary': return p.contract?.salary ?? 0;
    case 'expires': return p.contract?.expires ?? '0';
    case 'rep': return p.reputation;
    case 'rgames': return p.realStats?.games ?? -1;
    case 'rwr': return p.realStats?.games ? p.realStats.winRate : -1;
    case 'rkda': return p.realStats?.games ? p.realStats.kda : -1;
    case 'sgames': return p.season.games;
    case 'swr': return p.season.games ? p.season.wins / p.season.games : -1;
  }
}

function PlayersBrowser({ state }: { state: GameState }) {
  const v = useStore((s) => s.v);
  const [q, setQ] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [region, setRegion] = useState<RegionId | ''>('');
  const [country, setCountry] = useState('');
  const [ageMin, setAgeMin] = useState<number | ''>('');
  const [ageMax, setAgeMax] = useState<number | ''>('');
  const [ovrMin, setOvrMin] = useState<number | ''>('');
  const [ovrMax, setOvrMax] = useState<number | ''>('');
  const [status, setStatus] = useState<Status>('all');
  const [withRetired, setWithRetired] = useState(false);
  const [sort, setSort] = useState<{ key: PSort; desc: boolean }>({ key: 'ovr', desc: true });
  const [page, setPage] = useState(0);
  const reset = (fn: () => void) => { fn(); setPage(0); };

  const rows = useMemo(() => {
    const out: PRow[] = [];
    for (const p of Object.values(state.players)) {
      if (!isRealPlayer(p)) continue;
      const team = p.teamId ? state.teams[p.teamId] ?? null : null;
      const sv = scoutedView(state, p);
      out.push({ p, team, league: team ? state.leagues[team.leagueId] : undefined, ovr: sv.overall, pot: sv.potential, k: sv.knowledge, age: playerAge(p, state.date) });
    }
    return out;
  }, [state, v]);
  const countries = useMemo(() => [...new Set(rows.map((r) => r.p.country).filter(Boolean))].sort(), [rows]);
  const opts = useMemo(() => leagueOptions(state), [state]);
  const shortlist = (state as GameState & { shortlist?: string[] }).shortlist ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const p = r.p;
      if (status === 'retired') { if (!p.retired) return false; }
      else if (p.retired && !withRetired) return false;
      if (status === 'contracted' && !p.teamId) return false;
      if (status === 'free' && (p.teamId || p.retired)) return false;
      if (status === 'custom' && !p.isCustom) return false;
      if (status === 'shortlist' && !shortlist.includes(p.id)) return false;
      if (s && !(p.handle.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.nativeName ?? '').includes(q.trim()) || (r.team?.name.toLowerCase().includes(s) ?? false))) return false;
      if (roles.length && !roles.includes(p.role)) return false;
      if (leagues.length && !(r.team && leagues.includes(r.team.leagueId))) return false;
      if (region && r.team?.region !== region) return false;
      if (country && p.country !== country) return false;
      if (ageMin !== '' && (r.age ?? 0) < ageMin) return false;
      if (ageMax !== '' && (r.age ?? 99) > ageMax) return false;
      if (ovrMin !== '' && r.ovr < ovrMin) return false;
      if (ovrMax !== '' && r.ovr > ovrMax) return false;
      return true;
    });
  }, [rows, q, roles, leagues, region, country, ageMin, ageMax, ovrMin, ovrMax, status, withRetired, shortlist]);
  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => { const x = pSortVal(a, sort.key), y = pSortVal(b, sort.key); return x < y ? -dir : x > y ? dir : b.ovr - a.ovr; });
  }, [filtered, sort]);
  const PER = 50;
  const pages = Math.max(1, Math.ceil(sorted.length / PER));
  const pg = Math.min(page, pages - 1);
  const S = (label: ReactNode, k: PSort, cls = '', defaultDesc = true, title?: string) => <SortTh label={label} k={k} sort={sort} setSort={(x) => { setSort(x); setPage(0); }} className={cls} defaultDesc={defaultDesc} title={title} />;

  const avgOvr = filtered.length ? Math.round(filtered.reduce((s, r) => s + r.ovr, 0) / filtered.length) : 0;
  const avgAge = filtered.filter((r) => r.age !== null).length ? (filtered.reduce((s, r) => s + (r.age ?? 0), 0) / filtered.filter((r) => r.age !== null).length).toFixed(1) : '—';
  const totalValue = filtered.reduce((s, r) => s + r.p.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <FilterLabel label="Search"><input className="input w-52" placeholder="Handle, name or team…" value={q} onChange={(e) => reset(() => setQ(e.target.value))} /></FilterLabel>
        <FilterLabel label="Role"><RoleChips value={roles} onChange={(x) => reset(() => setRoles(x))} labels={ROLE_LABEL} /></FilterLabel>
        <FilterLabel label="Leagues"><MultiSelect options={opts} value={leagues} onChange={(x) => reset(() => setLeagues(x))} placeholder="All leagues" width={170} /></FilterLabel>
        <FilterLabel label="Region">
          <select className="input" value={region} onChange={(e) => reset(() => setRegion(e.target.value as RegionId | ''))}>
            <option value="">All</option>
            {(Object.keys(REGION_LABEL) as RegionId[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
          </select>
        </FilterLabel>
        <FilterLabel label="Nationality">
          <select className="input w-36" value={country} onChange={(e) => reset(() => setCountry(e.target.value))}>
            <option value="">All</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterLabel>
        <FilterLabel label="Age"><NumField value={ageMin} onChange={(x) => reset(() => setAgeMin(x))} placeholder="min" width={54} /><span className="text-dim">–</span><NumField value={ageMax} onChange={(x) => reset(() => setAgeMax(x))} placeholder="max" width={54} /></FilterLabel>
        <FilterLabel label="Overall"><NumField value={ovrMin} onChange={(x) => reset(() => setOvrMin(x))} placeholder="min" width={54} /><span className="text-dim">–</span><NumField value={ovrMax} onChange={(x) => reset(() => setOvrMax(x))} placeholder="max" width={54} /></FilterLabel>
        <FilterLabel label="Status">
          <select className="input" value={status} onChange={(e) => reset(() => setStatus(e.target.value as Status))}>
            <option value="all">All players</option>
            <option value="contracted">Under contract</option>
            <option value="free">Free agents</option>
            <option value="custom">Custom players</option>
            <option value="shortlist">My shortlist</option>
            <option value="retired">Retired only</option>
          </select>
        </FilterLabel>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-2"><input type="checkbox" className="accent-[#c8aa6e]" checked={withRetired} onChange={(e) => reset(() => setWithRetired(e.target.checked))} />Include retired</label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Matching players" value={filtered.length.toLocaleString()} />
        <Stat label="Average overall" value={avgOvr || '—'} color={avgOvr ? ratingColor(avgOvr) : undefined} />
        <Stat label="Average age" value={avgAge} />
        <Stat label="Combined value" value={money(totalValue)} />
      </div>
      <Panel title="Players" bodyClass="p-0" right={<span className="text-xs text-muted">Potential is your scouting estimate · real stats = 2026 pro games</span>}>
        {sorted.length === 0 ? <Empty>No players match these filters.</Empty> : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl [&_td]:px-1.5! [&_th]:px-1.5!">
                <thead>
                  <tr>
                    {S('Player', 'handle', '', false)}
                    {S('Nat', 'country', '', false)}
                    {S('Team', 'team', '', false)}
                    {S('League', 'league', '', false)}
                    {S('Pos', 'role', '', false)}
                    {S('Age', 'age', 'text-right', false)}
                    {S('Ovr', 'ovr', 'text-center')}
                    {S('Pot', 'pot', 'text-center', true, 'Scouted potential estimate')}
                    {S('Rep', 'rep', 'text-right', true, 'Reputation')}
                    {S('Value', 'value', 'text-right')}
                    {S('Salary', 'salary', 'text-right')}
                    {S('Contract', 'expires', 'text-right', false)}
                    {S('Pro G', 'rgames', 'text-right', true, 'Real 2026 pro games')}
                    {S('WR', 'rwr', 'text-right', true, 'Real 2026 win rate')}
                    {S('KDA', 'rkda', 'text-right', true, 'Real 2026 KDA')}
                    {S('Season', 'swr', 'text-right', true, 'In-game season record')}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(pg * PER, pg * PER + PER).map((r) => {
                    const p = r.p;
                    return (
                      <tr key={p.id} className="row" onClick={() => nav('player', p.id)}>
                        <td>
                          <div className="flex items-center gap-2 min-w-[170px]">
                            <Portrait player={p} team={r.team} size={30} />
                            <div className="leading-tight min-w-0">
                              <div className="font-semibold truncate flex items-center gap-1">
                                {p.handle}
                                {p.isCustom && <span className="text-[9px] text-accent font-bold">CUSTOM</span>}
                                {p.generated && <span className="text-[9px] text-sky-400 font-bold" title="Fictional player generated for this transfer window">{p.teamId ? 'GENERATED' : 'UNSIGNED · GEN'}</span>}
                                {p.retired && <span className="text-[9px] text-dim font-bold">RETIRED</span>}
                                {p.teamId === state.userTeamId && <span className="text-[9px] text-gold font-bold">YOURS</span>}
                              </div>
                              <div className="text-[11px] text-dim truncate">{p.name}{p.nativeName ? ` · ${p.nativeName}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td title={p.country}>{flag(p.country)}</td>
                        <td>
                          {r.team ? (
                            <button className="flex items-center gap-1.5 hover:text-gold2" onClick={(e) => { e.stopPropagation(); nav('team', r.team!.id); }}><TeamLogo team={r.team} size={20} /><span className="truncate max-w-[120px]">{r.team.short}</span></button>
                          ) : <span className="text-xs text-accent">{p.retired ? '—' : 'Free agent'}</span>}
                        </td>
                        <td className="text-xs text-muted whitespace-nowrap">{r.league ? <>{r.league.name}<TierDot tier={r.league.tier} /></> : '—'}</td>
                        <td><div className="flex items-center gap-1"><RoleIcon role={p.role} size={14} /><span className="text-xs text-muted">{ROLE_LABEL[p.role]}</span></div></td>
                        <td className="text-right font-display">{r.age ?? '—'}</td>
                        <td className="text-center"><div className="flex justify-center"><Rating v={r.ovr} size="sm" /></div></td>
                        <td className="text-center whitespace-nowrap"><RangeTag range={r.pot} /> <KnowledgeTag k={r.k} /></td>
                        <td className="text-right font-display text-muted">{p.reputation}</td>
                        <td className="text-right font-display">{money(p.value)}</td>
                        <td className="text-right font-display">{p.contract ? money(p.contract.salary) : '—'}</td>
                        <td className="text-right text-xs text-muted">{p.contract ? p.contract.expires.slice(0, 4) : '—'}</td>
                        <td className="text-right font-display">{p.realStats?.games ?? '—'}</td>
                        <td className="text-right font-display" style={{ color: p.realStats?.games ? (p.realStats.winRate >= 0.55 ? '#22c55e' : p.realStats.winRate < 0.45 ? '#ef4444' : undefined) : undefined }}>{p.realStats?.games ? pct(p.realStats.winRate) : '—'}</td>
                        <td className="text-right font-display">{p.realStats?.games ? p.realStats.kda.toFixed(2) : '—'}</td>
                        <td className="text-right font-display text-muted whitespace-nowrap">{p.season.games ? `${p.season.wins}-${p.season.games - p.season.wins}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 border-t hairline"><Pager page={pg} pages={pages} setPage={setPage} total={sorted.length} perPage={PER} /></div>
          </>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ teams
interface TRow { t: Team; league?: LeagueDef; rating: number; star?: Player; avgAge: number | null; payroll: number; fac: number }
type TSort = 'name' | 'league' | 'rating' | 'fans' | 'prestige' | 'balance' | 'roster' | 'age' | 'fac' | 'record' | 'payroll' | 'hype';

function TeamsBrowser({ state }: { state: GameState }) {
  const v = useStore((s) => s.v);
  const [q, setQ] = useState('');
  const [league, setLeague] = useState<string>(() => presetLeague ?? '');
  useEffect(() => { presetLeague = null; }, []);
  const [tier, setTier] = useState<number | 0>(0);
  const [region, setRegion] = useState<RegionId | ''>('');
  const [sort, setSort] = useState<{ key: TSort; desc: boolean }>({ key: 'rating', desc: true });

  const rows = useMemo(() => Object.values(state.teams).map((t): TRow => {
    const ps = t.roster.map((id) => state.players[id]).filter(Boolean);
    const ages = ps.map((p) => playerAge(p, state.date)).filter((a): a is number => a !== null);
    const facs = Object.values(t.facilities);
    return {
      t, league: state.leagues[t.leagueId], rating: teamRating(state, t), star: starPlayer(state, t),
      avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
      payroll: ps.reduce((s, p) => s + (p.contract?.salary ?? 0), 0),
      fac: facs.length ? facs.reduce((a, b) => a + b, 0) / facs.length : 0,
    };
  }), [state, v]);

  const filtered = rows.filter((r) => {
    if (league && r.t.leagueId !== league) return false;
    if (tier && (r.league?.tier ?? 3) !== tier) return false;
    if (region && r.t.region !== region) return false;
    const s = q.trim().toLowerCase();
    if (s && !(r.t.name.toLowerCase().includes(s) || r.t.short.toLowerCase().includes(s))) return false;
    return true;
  });
  const val = (r: TRow, k: TSort): number | string => {
    switch (k) {
      case 'name': return r.t.name.toLowerCase();
      case 'league': return (r.league?.tier ?? 4) * 1000 + (r.league?.name.charCodeAt(0) ?? 0);
      case 'rating': return r.rating;
      case 'fans': return r.t.fans;
      case 'prestige': return r.t.prestige;
      case 'balance': return r.t.balance;
      case 'roster': return r.t.roster.length;
      case 'age': return r.avgAge ?? 0;
      case 'fac': return r.fac;
      case 'record': return r.t.realRecord?.games ? r.t.realRecord.wins / r.t.realRecord.games : -1;
      case 'payroll': return r.payroll;
      case 'hype': return r.t.hype;
    }
  };
  const dir = sort.desc ? -1 : 1;
  const sorted = [...filtered].sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return x < y ? -dir : x > y ? dir : b.rating - a.rating; });
  const S = (label: ReactNode, k: TSort, cls = '', defaultDesc = true, title?: string) => <SortTh label={label} k={k} sort={sort} setSort={setSort} className={cls} defaultDesc={defaultDesc} title={title} />;
  const leaguesSorted = Object.values(state.leagues).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const sel = league ? state.leagues[league] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <FilterLabel label="Search"><input className="input w-52" placeholder="Team name…" value={q} onChange={(e) => setQ(e.target.value)} /></FilterLabel>
        <FilterLabel label="League">
          <select className="input w-56" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">All leagues</option>
            {[1, 2, 3].map((tr) => (
              <optgroup key={tr} label={`Tier ${tr}`}>
                {leaguesSorted.filter((l) => l.tier === tr).map((l) => <option key={l.id} value={l.id}>{l.name} — {l.fullName}</option>)}
              </optgroup>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel label="Tier">
          <div className="flex gap-1">{[0, 1, 2, 3].map((x) => <button key={x} className={`chip cursor-pointer ${tier === x ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setTier(x)}>{x ? `Tier ${x}` : 'All'}</button>)}</div>
        </FilterLabel>
        <FilterLabel label="Region">
          <select className="input" value={region} onChange={(e) => setRegion(e.target.value as RegionId | '')}>
            <option value="">All</option>
            {(Object.keys(REGION_LABEL) as RegionId[]).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
          </select>
        </FilterLabel>
        {sel && <div className="ml-auto text-xs text-muted pb-2">{sel.fullName} · Tier {sel.tier} · {REGION_LABEL[sel.region]}{sel.franchised ? ' · Franchised' : ''}</div>}
      </div>
      <Panel title={`Teams · ${sorted.length}`} bodyClass="p-0" right={<span className="text-xs text-muted">Rating = average overall of the starting five</span>}>
        {sorted.length === 0 ? <Empty>No teams match.</Empty> : (
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="tbl [&_td]:px-1.5! [&_th]:px-1.5!">
              <thead>
                <tr>
                  <th className="w-8 text-right">#</th>
                  {S('Team', 'name', '', false)}
                  {S('League', 'league', '', false)}
                  {S('Rating', 'rating', 'text-center')}
                  <th>Starting five</th>
                  <th>Star</th>
                  {S('Squad', 'roster', 'text-right', true, 'Roster size · average age')}
                  {S('Fans', 'fans', 'text-right')}
                  {S('Prestige', 'prestige', 'text-right')}
                  {S('Facilities', 'fac', 'text-right', true, 'Average facility level (0-5)')}
                  {S('Payroll', 'payroll', 'text-right', true, 'Player salaries per year')}
                  {S('Balance', 'balance', 'text-right')}
                  {S('2026 record', 'record', 'text-right', true, 'Real 2026 record')}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const t = r.t;
                  const mine = t.id === state.userTeamId;
                  return (
                    <tr key={t.id} className="row" onClick={() => nav('team', t.id)} style={mine ? { background: '#c8aa6e12' } : undefined}>
                      <td className="text-right text-dim font-display">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <TeamLogo team={t} size={28} />
                          <div className="leading-tight">
                            <div className="font-semibold flex items-center gap-1">{t.name}{mine && <span className="text-[9px] text-gold font-bold">YOU</span>}{t.isCustom && <span className="text-[9px] text-accent font-bold">CUSTOM</span>}</div>
                            <div className="text-[11px] text-dim">{t.short} · {flag(t.country)} {t.country ?? ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-muted whitespace-nowrap">{r.league?.name ?? t.leagueId}<TierDot tier={r.league?.tier} /></td>
                      <td className="text-center"><div className="flex justify-center"><Rating v={r.rating} size="sm" /></div></td>
                      <td>
                        <div className="flex -space-x-1.5">
                          {ROLES.map((role) => {
                            const p = t.lineup[role] ? state.players[t.lineup[role]!] : undefined;
                            return p ? <span key={role} title={`${ROLE_LABEL[role]}: ${p.handle} (${playerOvr(p)})`}><Portrait player={p} team={t} size={24} className="ring-1 ring-[#0d1424]" /></span>
                              : <span key={role} title={`${ROLE_LABEL[role]}: empty`} className="w-6 h-6 rounded-lg bg-[#0a1120] ring-1 ring-[#0d1424] inline-block" />;
                          })}
                        </div>
                      </td>
                      <td className="text-xs whitespace-nowrap">{r.star ? <span><span className="font-semibold">{r.star.handle}</span> <span style={{ color: ratingColor(playerOvr(r.star)) }} className="font-display font-bold">{playerOvr(r.star)}</span></span> : '—'}</td>
                      <td className="text-right font-display whitespace-nowrap">{t.roster.length}<span className="text-dim text-[11px]"> · {r.avgAge ? `${r.avgAge.toFixed(1)}y` : '—'}</span></td>
                      <td className="text-right font-display">{num(t.fans)}</td>
                      <td className="text-right font-display" style={{ color: ratingColor(t.prestige) }}>{t.prestige}</td>
                      <td className="text-right font-display text-muted">{r.fac.toFixed(1)}</td>
                      <td className="text-right font-display">{money(r.payroll)}</td>
                      <td className={`text-right font-display ${t.balance < 0 ? 'text-red-400' : ''}`}>{money(t.balance)}</td>
                      <td className="text-right font-display text-muted whitespace-nowrap">{t.realRecord?.games ? `${t.realRecord.wins}-${t.realRecord.losses}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ leagues
const STATUS_COLOR: Record<Competition['status'], string> = { upcoming: '#8a97b3', active: '#22c55e', done: '#c8aa6e' };

function LeaguesBrowser({ state }: { state: GameState }) {
  const v = useStore((s) => s.v);
  const [region, setRegion] = useState<RegionId | ''>('');
  const data = useMemo(() => Object.values(state.leagues).map((l) => {
    const teams = Object.values(state.teams).filter((t) => t.leagueId === l.id);
    const ratings = teams.map((t) => ({ t, r: teamRating(state, t) })).sort((a, b) => b.r - a.r);
    const comps = Object.values(state.competitions).filter((c) => c.leagueId === l.id && c.season === state.season).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const players = teams.reduce((s, t) => s + t.roster.length, 0);
    const fans = teams.reduce((s, t) => s + t.fans, 0);
    return { l, teams, ratings, comps, players, fans, avg: ratings.length ? Math.round(ratings.reduce((s, x) => s + x.r, 0) / ratings.length) : 0 };
  }), [state, v]);
  const intl = useMemo(() => Object.values(state.competitions).filter((c) => !c.leagueId && c.season === state.season).sort((a, b) => a.startDate.localeCompare(b.startDate)), [state, v]);
  const shown = data.filter((d) => !region || d.l.region === region);
  const userLeague = state.teams[state.userTeamId]?.leagueId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className={`chip cursor-pointer ${!region ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRegion('')}>All regions</button>
        {(Object.keys(REGION_LABEL) as RegionId[]).map((r) => <button key={r} className={`chip cursor-pointer ${region === r ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRegion(r)}>{REGION_LABEL[r]}</button>)}
      </div>
      {[1, 2, 3].map((tier) => {
        const list = shown.filter((d) => d.l.tier === tier).sort((a, b) => b.avg - a.avg);
        if (!list.length) return null;
        return (
          <div key={tier}>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="font-display text-lg font-bold text-gold2 uppercase tracking-wider">Tier {tier}</h2>
              <span className="text-xs text-muted">{tier === 1 ? 'Major regional leagues' : tier === 2 ? 'Challenger / ERL leagues' : 'Academy & lower divisions'} · {list.length} leagues</span>
              <div className="flex-1 border-t hairline" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((d) => <LeagueCard key={d.l.id} state={state} d={d} mine={d.l.id === userLeague} />)}
            </div>
          </div>
        );
      })}
      {!region && intl.length > 0 && (
        <Panel title={`International & cross-regional events · ${state.season}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {intl.map((c) => <CompLink key={c.id} c={c} state={state} />)}
          </div>
        </Panel>
      )}
    </div>
  );
}

function CompLink({ c, state }: { c: Competition; state: GameState }) {
  const winner = c.winner ? state.teams[c.winner] : null;
  return (
    <button className="panel-flat px-3 py-2 text-left hover:border-gold transition flex items-center gap-2" onClick={() => nav('competition', c.id)}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[c.status] }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{c.name}</div>
        <div className="text-[11px] text-dim">{fmtDate(c.startDate, { month: 'short', day: 'numeric' })} – {fmtDate(c.endDate, { month: 'short', day: 'numeric' })} · {c.status}{c.prizePool ? ` · ${money(c.prizePool)}` : ''}</div>
      </div>
      {winner && <span className="flex items-center gap-1 text-[11px] text-gold2"><TeamLogo team={winner} size={18} />{winner.short}</span>}
    </button>
  );
}

function LeagueCard({ state, d, mine }: { state: GameState; d: { l: LeagueDef; teams: Team[]; ratings: { t: Team; r: number }[]; comps: Competition[]; players: number; fans: number; avg: number }; mine: boolean }) {
  const { l } = d;
  const active = d.comps.find((c) => c.status === 'active');
  const next = d.comps.find((c) => c.status === 'upcoming');
  const parent = l.parent ? state.leagues[l.parent] : null;
  return (
    <div className={`panel p-4 flex flex-col gap-3 ${mine ? 'border-gold' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold">{l.name}</span>
            <Pill color={l.tier === 1 ? '#c8aa6e' : l.tier === 2 ? '#38bdf8' : '#8a97b3'}>Tier {l.tier}</Pill>
            {l.franchised && <Pill color="#a855f7">Franchised</Pill>}
            {mine && <Pill color="#22c55e">Your league</Pill>}
          </div>
          <div className="text-xs text-muted truncate">{l.fullName} · {REGION_LABEL[l.region]} · {l.country}{parent ? ` · feeds ${parent.name}` : ''}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold leading-none" style={{ color: ratingColor(d.avg) }}>{d.avg}</div>
          <div className="text-[10px] text-dim uppercase">avg rating</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="panel-flat py-1"><div className="font-display font-bold">{d.teams.length}</div><div className="text-[10px] text-dim uppercase">Teams</div></div>
        <div className="panel-flat py-1"><div className="font-display font-bold">{d.players}</div><div className="text-[10px] text-dim uppercase">Players</div></div>
        <div className="panel-flat py-1"><div className="font-display font-bold">{num(d.fans)}</div><div className="text-[10px] text-dim uppercase">Fans</div></div>
      </div>
      <div className="flex flex-col gap-1">
        {d.ratings.slice(0, 4).map(({ t, r }, i) => (
          <button key={t.id} className="flex items-center gap-2 text-sm hover:text-gold2 text-left" onClick={() => nav('team', t.id)}>
            <span className="w-4 text-dim font-display text-xs">{i + 1}</span><TeamLogo team={t} size={20} /><span className="flex-1 truncate">{t.name}</span>
            <span className="font-display font-bold text-xs" style={{ color: ratingColor(r) }}>{r}</span>
          </button>
        ))}
        {d.teams.length > 4 && <div className="text-[11px] text-dim pl-6">+ {d.teams.length - 4} more</div>}
      </div>
      <div className="flex flex-col gap-1">
        {active && <CompLink c={active} state={state} />}
        {!active && next && <CompLink c={next} state={state} />}
        {d.comps.length > 0 && <div className="text-[11px] text-dim">{d.comps.filter((c) => c.status === 'done').length}/{d.comps.length} competitions completed this season</div>}
      </div>
      <div className="flex gap-2 mt-auto">
        <button className="btn flex-1 justify-center text-xs" onClick={() => { presetLeague = l.id; nav('database', 'teams'); }}>Teams</button>
        <button className="btn flex-1 justify-center text-xs" disabled={!d.comps.length} onClick={() => nav('competition', (active ?? next ?? d.comps[d.comps.length - 1]).id)}>Competition</button>
      </div>
    </div>
  );
}

