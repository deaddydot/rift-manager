import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { SponsorDeal, SponsorOffer, Team } from '../../engine/types';
import { Panel, Stat, Empty, Pill, Bar, money, fmtDate, num } from '../components/kit';
import { sponsorSlots, sponsorPool, sponsorOutlook } from '../../engine/management/sponsors';
import { LEAGUE_ECON } from '../../engine/setup';
import { clamp } from '../../util/rng';
import { activeSponsors, acceptSponsorOffer, declineSponsorOffer, bonusText, bonusProgress } from '../../engine/management/offerActions';

const DAY = 864e5;
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / DAY);

function SponsorBadge({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div className="rounded-lg shrink-0 flex items-center justify-center font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.38, color: '#0b0f19', background: `linear-gradient(145deg, ${color}, ${color}99)`, boxShadow: `0 0 0 1px ${color}66, 0 4px 14px ${color}22` }}>
      {initials}
    </div>
  );
}

const Stars = ({ n }: { n: number }) => (
  <span className="tracking-tight" title={`Brand tier ${n}`}>
    {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'text-gold' : 'text-[#2a3a5c]'}>★</span>)}
  </span>
);

export default function Sponsors(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const econ = LEAGUE_ECON[tier];
  const active = activeSponsors(state, team);
  const expired = team.sponsors.filter((s) => s.endDate < state.date);
  const slots = sponsorSlots(team);
  const full = active.length >= slots;
  const monthly = active.reduce((a, s) => a + s.monthly, 0);
  const remainingValue = active.reduce((a, s) => a + s.monthly * Math.max(0, Math.ceil(daysBetween(state.date, s.endDate) / 30)), 0);
  const offers = [...state.sponsorOffers].sort((a, b) => b.monthly - a.monthly);
  const [confirmDecline, setConfirmDecline] = useState<string | null>(null);
  const outlook = sponsorOutlook(state, team);

  // mirrors generateSponsorOffers() in the engine
  const fanPart = (team.fans / econ.fans) * 0.5;
  const prestigePart = team.prestige / 100;
  const hypePart = team.hype / 200;
  const studioPart = team.facilities.contentStudio * 0.06;
  const appeal = clamp(fanPart + prestigePart + hypePart + studioPart, 0.2, 3);
  const offerRange = (brandTier: number) => [econ.sponsor * brandTier * appeal * 0.25, econ.sponsor * brandTier * appeal * 0.5];

  const accept = (o: SponsorOffer) => {
    const r = acceptSponsorOffer(state, o.id);
    notify(r.message);
    bump();
  };
  const decline = (o: SponsorOffer) => {
    const r = declineSponsorOffer(state, o.id);
    setConfirmDecline(null);
    notify(r.message);
    bump();
  };

  const brands = sponsorPool();
  const currentIds = new Set(active.map((s) => s.sponsorId));
  const pendingIds = new Set(state.sponsorOffers.map((s) => s.sponsorId));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Sponsors</h1>
          <div className="text-sm text-muted mt-1">Commercial partners of {team.name}</div>
        </div>
        <button className="btn" onClick={() => nav('finances')}>Finances →</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="panel-flat px-3 py-2.5 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Slots used</div>
          <div className="font-display text-2xl font-bold leading-tight" style={{ color: full ? '#fbbf24' : undefined }}>{active.length} / {slots}</div>
          <div className="flex gap-1 mt-1">
            {Array.from({ length: slots }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < active.length ? active[i].logoColor : '#1e2a44' }} />
            ))}
          </div>
        </div>
        <Stat label="Monthly income" value={money(monthly)} sub={`${money(monthly * 12)} / year`} />
        <Stat label="Contracted value left" value={money(remainingValue)} sub="across active deals" />
        <Stat label="Pending offers" value={offers.length} color={offers.length ? '#f0c674' : undefined} sub={offers.length ? 'awaiting your decision' : outlook.nextFrom ? `next approach from ${fmtDate(outlook.nextFrom)}` : `~${Math.round(outlook.chance * 100)}% chance each Monday`} />
        <Stat label="Sponsor appeal" value={appeal.toFixed(2)} sub="index (0.2 – 3.0)" color={appeal >= 1.5 ? '#4ade80' : appeal < 0.8 ? '#fbbf24' : undefined} />
        <Stat label="Fans" value={num(team.fans)} sub={`Hype ${Math.round(team.hype)} · Prestige ${Math.round(team.prestige)}`} />
      </div>

      {full && offers.length > 0 && (
        <div className="panel-flat px-4 py-2.5 text-sm border-amber-700/70 bg-[#2a2012] flex items-center gap-3">
          <span className="font-display font-bold uppercase tracking-wider text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">! Slots full</span>
          All {slots} sponsor slots are taken. Upgrade the Content Studio to unlock more slots, or wait for a deal to expire before accepting new offers.
          <button className="btn btn-ghost py-1 text-xs ml-auto" onClick={() => nav('facilities')}>Facilities →</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4">
        <div className="space-y-4">
          <Panel title={`Pending offers (${offers.length})`}>
            {offers.length === 0 ? <Empty>No offers on the table. Brands approach every few weeks — winning titles, growing your fanbase and building the Content Studio attract more and better deals.</Empty> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {offers.map((o) => {
                  const daysLeft = daysBetween(state.date, o.expires);
                  return (
                    <div key={o.id} className="panel-flat p-3.5 flex flex-col gap-2.5 border-gold/30">
                      <div className="flex items-start gap-3">
                        <SponsorBadge name={o.name} color={o.logoColor} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{o.name}</div>
                          <div className="text-xs text-muted">{o.category} · <Stars n={o.tier} /></div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-xl font-bold text-gold2 leading-none">{money(o.monthly)}</div>
                          <div className="text-[11px] text-muted">per month</div>
                        </div>
                      </div>
                      <div className="text-xs italic text-muted">“{o.pitch}”</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-dim">Length</div><div className="font-semibold">{o.months} months</div></div>
                        <div><div className="text-dim">Total value</div><div className="font-semibold">{money(o.monthly * o.months)}</div></div>
                        <div><div className="text-dim">Expires</div><div className={`font-semibold ${daysLeft <= 3 ? 'text-amber-300' : ''}`}>{daysLeft <= 0 ? 'today' : `in ${daysLeft}d`}</div></div>
                      </div>
                      {o.bonus && (
                        <div className="text-xs rounded-md bg-[#0a1120] border hairline px-2.5 py-1.5 flex items-center justify-between gap-2">
                          <span className="text-muted">Bonus: <span className="text-text">{bonusText(o.bonus)}</span></span>
                          <span className="font-display font-bold text-gold2">+{money(o.bonus.amount)}</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-auto">
                        <button className="btn btn-gold flex-1 justify-center" disabled={full} title={full ? 'No free sponsor slot' : undefined} onClick={() => accept(o)}>Accept</button>
                        {confirmDecline === o.id ? (
                          <>
                            <button className="btn btn-danger" onClick={() => decline(o)}>Confirm</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDecline(null)}>Keep</button>
                          </>
                        ) : <button className="btn" onClick={() => setConfirmDecline(o.id)}>Decline</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={`Current deals (${active.length})`} right={<span className="text-xs text-muted">{money(monthly)}/month</span>}>
            {active.length === 0 ? <Empty>No active sponsorships. Accept an offer to start earning monthly income.</Empty> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[...active].sort((a, b) => b.monthly - a.monthly).map((s) => <DealCard key={s.id} deal={s} date={state.date} team={team} />)}
              </div>
            )}
            {expired.length > 0 && (
              <div className="mt-3 text-xs text-dim">Expired (removed on the 1st): {expired.map((s) => s.name).join(', ')}</div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="What drives offers">
            <p className="text-xs text-muted mb-3 leading-relaxed">
              On Mondays a brand may approach your club: at most one at a time, usually every few weeks (more often with few partners, after titles,
              winning runs or fan growth). Brands never compete with a partner in the same category. Offer size scales with the league&apos;s commercial
              level, the brand&apos;s tier and your <span className="text-text font-semibold">sponsor appeal</span>:
            </p>
            <div className="space-y-2.5">
              <Driver label="Fanbase" detail={`${num(team.fans)} fans vs ${num(econ.fans)} league benchmark`} part={fanPart} max={1.5} />
              <Driver label="Prestige" detail={`${Math.round(team.prestige)}/100 long-term reputation`} part={prestigePart} max={1} />
              <Driver label="Hype" detail={`${Math.round(team.hype)}/100 short-term buzz from results`} part={hypePart} max={0.5} />
              <Driver label="Content Studio" detail={`Level ${team.facilities.contentStudio}/5 · also +1 slot per level`} part={studioPart} max={0.3} />
            </div>
            <div className="flex items-center justify-between border-t hairline mt-3 pt-2.5">
              <span className="text-sm text-muted">Sponsor appeal</span>
              <span className="font-display text-2xl font-bold text-gold2">{appeal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Approach chance next Monday</span>
              <span className="font-display font-bold text-text">{outlook.nextFrom ? `from ${fmtDate(outlook.nextFrom)}` : `${Math.round(outlook.chance * 100)}%`}</span>
            </div>
            <table className="tbl mt-2">
              <thead><tr><th>Brand tier</th><th className="text-right">Typical offer / month</th></tr></thead>
              <tbody>
                {[1, 2, 3].map((t) => {
                  const [lo, hi] = offerRange(t);
                  return <tr key={t}><td><Stars n={t} /></td><td className="text-right font-display font-bold">{money(lo)} – {money(hi)}</td></tr>;
                })}
              </tbody>
            </table>
            <ul className="text-xs text-muted mt-3 space-y-1 list-disc pl-4">
              <li>Offers expire after 14 days if you ignore them.</li>
              <li>Deals run 6–24 months and pay on the 1st of each month.</li>
              <li>Bonus clauses pay out for league titles, playoffs, international qualification or fan growth.</li>
              <li>Win matches to build hype, and invest in the Content Studio for more slots and better offers.</li>
            </ul>
          </Panel>

          <Panel title="Brand directory" bodyClass="p-0">
            <div className="max-h-[420px] overflow-auto">
              <table className="tbl">
                <thead><tr><th>Brand</th><th>Tier</th><th className="text-right">Status</th></tr></thead>
                <tbody>
                  {[...brands].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)).map((b) => (
                    <tr key={b.id}>
                      <td>
                        <span className="flex items-center gap-2 min-w-0">
                          <SponsorBadge name={b.name} color={b.color} size={24} />
                          <span className="min-w-0"><span className="block truncate max-w-[190px]">{b.name}</span><span className="block text-[10.5px] text-dim">{b.category}</span></span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap"><Stars n={b.tier} /></td>
                      <td className="text-right">
                        {currentIds.has(b.id) ? <Pill color="#4ade80">Partner</Pill> : pendingIds.has(b.id) ? <Pill color="#f0c674">Offer</Pill> : <span className="text-dim text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Driver({ label, detail, part, max }: { label: string; detail: string; part: number; max: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="font-semibold">{label}</span>
        <span className="font-display font-bold text-gold2">+{part.toFixed(2)}</span>
      </div>
      <Bar value={Math.min(100, (part / max) * 100)} showValue={false} color="#c8aa6e" />
      <div className="text-[11px] text-dim mt-0.5">{detail}</div>
    </div>
  );
}

function DealCard({ deal: s, date, team }: { deal: SponsorDeal; date: string; team: Team }) {
  const total = Math.max(1, daysBetween(s.startDate, s.endDate));
  const elapsed = clamp(daysBetween(s.startDate, date), 0, total);
  const daysLeft = Math.max(0, daysBetween(date, s.endDate));
  const monthsLeft = Math.ceil(daysLeft / 30);
  const bp = s.bonus ? bonusProgress(team, s.bonus) : null;
  return (
    <div className="panel-flat p-3.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <SponsorBadge name={s.name} color={s.logoColor} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{s.name}</div>
          <div className="text-xs text-muted">{s.category} · <Stars n={s.tier} /></div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-bold leading-none">{money(s.monthly)}</div>
          <div className="text-[11px] text-muted">per month</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-muted mb-1">
          <span>{fmtDate(s.startDate)}</span>
          <span className={monthsLeft <= 2 ? 'text-amber-300 font-semibold' : ''}>{monthsLeft} month{monthsLeft === 1 ? '' : 's'} left</span>
          <span>{fmtDate(s.endDate)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#0a1120] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(elapsed / total) * 100}%`, background: s.logoColor }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><div className="text-dim">Deal value</div><div className="font-semibold">{money(s.monthly * Math.round(total / 30))}</div></div>
        <div><div className="text-dim">Still to come</div><div className="font-semibold">{money(s.monthly * monthsLeft)}</div></div>
      </div>
      {s.bonus ? (
        <div className="text-xs rounded-md bg-[#0a1120] border hairline px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Bonus: <span className="text-text">{bonusText(s.bonus)}</span></span>
            <span className="font-display font-bold text-gold2">+{money(s.bonus.amount)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {bp?.achieved ? <Pill color="#4ade80">✓ Achieved</Pill> : <Pill color="#8a97b3">Open</Pill>}
            {bp?.progress !== null && bp?.progress !== undefined && !bp.achieved && (
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-[#141e33] overflow-hidden"><div className="h-full bg-gold" style={{ width: `${bp.progress * 100}%` }} /></div>
                <span className="text-dim">{Math.round(bp.progress * 100)}%</span>
              </div>
            )}
          </div>
        </div>
      ) : <div className="text-xs text-dim">No bonus clause</div>}
    </div>
  );
}
