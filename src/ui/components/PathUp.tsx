// "Path up the pyramid" for tier-2/3 clubs: the promotion route, league spots for sale, big-brand interest and
// a running naming-rights deal (engine/management/ascension.ts, franchise.ts).
import { nav } from '../../store/game';
import type { GameState } from '../../engine/types';
import { Panel, Bar, Pill, TeamLogo, money, fmtDate } from './kit';
import { pathUp } from '../../engine/management/ascension';

export default function PathUpPanel({ state }: { state: GameState }) {
  const team = state.teams[state.userTeamId];
  const p = pathUp(state, team);
  if (p.tier === 1 && !p.deal) return null;
  const d = p.dominance;
  const leagueName = state.leagues[p.league]?.name ?? p.league;
  return (
    <Panel title="Path up the pyramid" right={p.targetName ? <span className="text-[11px] text-muted">{leagueName} → <b className="text-text">{p.targetName}</b></span> : undefined}>
      <div className="space-y-4 text-sm">
        {p.deal && (
          <div className="panel-flat p-3" style={{ borderColor: `${p.deal.color}88` }}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-1">Naming-rights partner</div>
            <div className="font-display text-lg font-bold" style={{ color: p.deal.color }}>{team.name} <span className="text-xs text-muted font-normal">· {p.deal.brand} · formerly {p.deal.originalName}</span></div>
            <div className="text-xs text-muted mt-1">
              {money(p.deal.monthly)}/month until {fmtDate(p.deal.until)}.{' '}
              {p.deal.slot?.status === 'pending' ? <>Buyout of {state.teams[p.deal.slot.sellerId]?.name ?? 'a club'}'s {state.leagues[p.deal.targetLeague]?.name} place happens at season rollover.</>
                : p.deal.slot?.status === 'done' ? <>Relegation from the {state.leagues[p.deal.targetLeague]?.name} ends the deal.</> : null}
            </div>
          </div>
        )}
        {p.target && (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-1">Promotion</div>
              <div className="text-xs text-muted">{p.how}</div>
              {p.promotion && <div className="text-xs mt-1">{p.promotion.name}: {fmtDate(p.promotion.start)} · {p.promotion.inField ? <Pill color="#22c55e">qualified</Pill> : p.promotion.status === 'done' ? 'finished' : p.promotion.status === 'active' ? 'in progress' : 'upcoming'}</div>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-1">League spots for sale</div>
              {p.sales.length === 0 ? <div className="text-xs text-muted">None open. Struggling clubs list their places around Nov 25.</div> : p.sales.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1">
                  <TeamLogo team={state.teams[s.sellerId]} size={22} />
                  <div className="flex-1 min-w-0 text-xs"><b>{state.teams[s.sellerId]?.name}</b> · {state.leagues[s.league]?.name} · {money(s.pay)}{s.pledge ? ` (fans pledged ${money(s.pledge)})` : ''}</div>
                  <button className="btn btn-ghost text-xs py-0.5" onClick={() => nav('inbox')}>Review →</button>
                </div>
              ))}
            </div>
            {!p.deal && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-1">Big-brand interest</div>
                {p.offer ? (
                  <div className="text-xs"><b style={{ color: p.offer.color }}>{p.offer.brand}</b> are waiting for an answer until {fmtDate(p.offer.expires)}. <button className="text-gold hover:underline" onClick={() => nav('inbox')}>Open the offer →</button></div>
                ) : (
                  <>
                    <Bar value={p.chance * 100} label={<span className="text-[11px]">Chance after the next title</span>} color="#f472b6" height={5} />
                    <div className="text-xs text-muted mt-1">
                      Global brands back clubs that dominate: win your league's playoffs, keep a big win rate and win titles back to back.
                      {d.wins + d.losses ? ` This season: ${d.wins}-${d.losses}` : ''}{d.recentTitles ? ` · ${d.recentTitles} recent title${d.recentTitles > 1 ? 's' : ''}` : ''}.
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
