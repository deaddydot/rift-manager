import { useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { FacilityKey } from '../../engine/types';
import { FACILITY_INFO } from '../../engine/types';
import { Panel, Stat, money } from '../components/kit';
import { addLedger, facilityUpkeepMonthly, upgradeCost } from '../../engine/management/finance';
import { sponsorSlots } from '../../engine/management/sponsors';

const MAX_LEVEL = 5;
const KEYS = Object.keys(FACILITY_INFO) as FacilityKey[];
const signed = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)}`;

const GLYPH: Record<FacilityKey, { mark: string; color: string }> = {
  gamingHouse: { mark: 'GH', color: '#f97316' },
  trainingFacility: { mark: 'TF', color: '#22c55e' },
  analyticsLab: { mark: 'AL', color: '#38bdf8' },
  contentStudio: { mark: 'CS', color: '#e879f9' },
  wellness: { mark: 'WC', color: '#34d399' },
  academy: { mark: 'AC', color: '#facc15' },
};

/** Concrete effects per level, mirroring the engine formulas. */
const EFFECTS: Record<FacilityKey, (l: number) => { label: string; value: string }[]> = {
  gamingHouse: (l) => [
    { label: 'Weekly morale drift', value: signed((l - 2) * 0.3) },
    { label: 'Weekly chemistry gain', value: `+${(0.35 + (l - 2) * 0.05).toFixed(2)}` },
    { label: 'Free-agent interest', value: `${signed((l - 2) * 3, 0)}%` },
  ],
  trainingFacility: (l) => [
    { label: 'Training effectiveness', value: `×${(0.85 + l * 0.07).toFixed(2)}` },
  ],
  analyticsLab: (l) => [
    { label: 'Draft quality bonus', value: `+${l * 3}` },
    { label: 'Match-day macro', value: `+${(l * 0.5).toFixed(1)}` },
  ],
  contentStudio: (l) => [
    { label: 'Sponsor slots', value: String(3 + l) },
    { label: 'Streaming revenue', value: `×${(0.9 + l * 0.35).toFixed(2)}` },
    { label: 'Merch demand', value: `×${(0.8 + l * 0.06).toFixed(2)}` },
    { label: 'Sponsor appeal', value: `+${(l * 0.06).toFixed(2)}` },
  ],
  wellness: (l) => [
    { label: 'Extra weekly fatigue recovery', value: l ? `−${(l * 1.2).toFixed(1)}` : '0' },
  ],
  academy: (l) => [
    { label: 'Growth rate for under-20s', value: `+${l * 5}%` },
  ],
};

export default function Facilities(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const [confirm, setConfirm] = useState<FacilityKey | null>(null);
  const upkeep = facilityUpkeepMonthly(team);
  const totalLevels = KEYS.reduce((a, k) => a + team.facilities[k], 0);
  const upgradable = KEYS.filter((k) => team.facilities[k] < MAX_LEVEL);
  const cheapest = upgradable.sort((a, b) => upgradeCost(team, a) - upgradeCost(team, b))[0];
  const totalToMax = KEYS.reduce((a, k) => {
    let s = 0;
    for (let l = team.facilities[k]; l < MAX_LEVEL; l++) s += Math.round(FACILITY_INFO[k].baseCost * Math.pow(1.75, l));
    return a + s;
  }, 0);
  const upgradesThisSeason = team.ledger.filter((e) => e.category === 'Facility upgrades' && e.date.slice(0, 4) === state.date.slice(0, 4)).reduce((a, e) => a - e.amount, 0);

  const upgrade = (k: FacilityKey) => {
    const lvl = team.facilities[k];
    if (lvl >= MAX_LEVEL) return;
    const cost = upgradeCost(team, k);
    if (team.balance < cost) { notify('Not enough money for this upgrade.'); return; }
    addLedger(state, team, 'Facility upgrades', -cost, `${FACILITY_INFO[k].name} → Lv ${lvl + 1}`);
    team.facilities[k] = lvl + 1;
    setConfirm(null);
    notify(`${FACILITY_INFO[k].name} upgraded to level ${lvl + 1}.`);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Facilities</h1>
          <div className="text-sm text-muted mt-1">Invest in infrastructure. Every level raises monthly upkeep, so check your runway first.</div>
        </div>
        <button className="btn" onClick={() => nav('finances')}>Finances →</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Balance" value={money(team.balance)} color={team.balance < 0 ? '#f87171' : '#f0e6d2'} />
        <Stat label="Monthly upkeep" value={money(upkeep)} sub={`${money(upkeep * 12)} per year`} />
        <Stat label="Facility levels" value={`${totalLevels} / ${KEYS.length * MAX_LEVEL}`} sub={`${Math.round((totalLevels / (KEYS.length * MAX_LEVEL)) * 100)}% developed`} />
        <Stat label="Cheapest upgrade" value={cheapest ? money(upgradeCost(team, cheapest)) : '—'} sub={cheapest ? FACILITY_INFO[cheapest].name : 'All facilities maxed'} />
        <Stat label="Cost to max out" value={money(totalToMax)} sub="all remaining levels" />
        <Stat label="Invested this year" value={money(upgradesThisSeason)} sub="facility upgrades" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {KEYS.map((k) => {
          const info = FACILITY_INFO[k];
          const lvl = team.facilities[k];
          const maxed = lvl >= MAX_LEVEL;
          const cost = maxed ? 0 : upgradeCost(team, k);
          const affordable = team.balance >= cost;
          const cur = EFFECTS[k](lvl);
          const next = maxed ? null : EFFECTS[k](lvl + 1);
          const g = GLYPH[k];
          return (
            <section key={k} className="panel p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-lg shrink-0" style={{ background: `linear-gradient(150deg, ${g.color}33, ${g.color}0d)`, color: g.color, boxShadow: `inset 0 0 0 1px ${g.color}55` }}>{g.mark}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold leading-tight">{info.name}</h3>
                    <span className="font-display font-bold text-gold2">Lv {lvl}<span className="text-dim">/{MAX_LEVEL}</span></span>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {Array.from({ length: MAX_LEVEL }, (_, i) => (
                      <span key={i} className="h-2 flex-1 rounded-sm" style={{ background: i < lvl ? `linear-gradient(90deg, #c8aa6e, #f0e6d2)` : '#1e2a44', boxShadow: i === lvl && !maxed ? 'inset 0 0 0 1px #c8aa6e88' : undefined }} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed">{info.desc}</p>

              <table className="tbl">
                <thead><tr><th>Effect</th><th className="text-right">Now</th><th className="text-right">{maxed ? '' : `Lv ${lvl + 1}`}</th></tr></thead>
                <tbody>
                  {cur.map((e, i) => (
                    <tr key={e.label}>
                      <td className="text-muted">{e.label}</td>
                      <td className="text-right font-display font-bold">{e.value}</td>
                      <td className="text-right font-display font-bold text-green-400">{next ? next[i].value : ''}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="text-muted">Upkeep / month</td>
                    <td className="text-right font-display font-bold">{lvl ? money(info.upkeep * lvl) : '$0'}</td>
                    <td className="text-right font-display font-bold text-red-400">{maxed ? '' : money(info.upkeep * (lvl + 1))}</td>
                  </tr>
                </tbody>
              </table>
              {k === 'contentStudio' && <div className="text-[11px] text-dim">Currently {sponsorSlots(team)} sponsor slots. Each level adds one.</div>}

              <div className="mt-auto flex items-center gap-3 pt-1">
                {maxed ? (
                  <div className="flex-1 text-center text-sm font-display font-bold uppercase tracking-wider text-gold2 py-2 rounded-lg border border-gold/40 bg-gold/5">Fully upgraded</div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Upgrade cost</div>
                      <div className={`font-display text-xl font-bold leading-none ${affordable ? '' : 'text-red-400'}`}>{money(cost)}</div>
                      <div className="text-[11px] text-dim">+{money(info.upkeep)}/month upkeep</div>
                    </div>
                    {confirm === k ? (
                      <div className="flex gap-1.5">
                        <button className="btn btn-gold" onClick={() => upgrade(k)}>Confirm</button>
                        <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-gold" disabled={!affordable} title={affordable ? undefined : `Need ${money(cost - team.balance)} more`} onClick={() => setConfirm(k)}>
                        {affordable ? `Upgrade to Lv ${lvl + 1}` : 'Insufficient funds'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Panel title="Upkeep summary" bodyClass="p-0">
        <table className="tbl">
          <thead><tr><th>Facility</th><th className="text-center">Level</th><th className="text-right">Upkeep / level</th><th className="text-right">Monthly upkeep</th><th className="text-right">Yearly upkeep</th><th className="text-right">Next upgrade</th></tr></thead>
          <tbody>
            {KEYS.map((k) => {
              const lvl = team.facilities[k];
              return (
                <tr key={k}>
                  <td className="font-semibold">{FACILITY_INFO[k].name}</td>
                  <td className="text-center font-display font-bold">{lvl}</td>
                  <td className="text-right text-muted">{money(FACILITY_INFO[k].upkeep)}</td>
                  <td className="text-right font-display font-bold">{money(FACILITY_INFO[k].upkeep * lvl)}</td>
                  <td className="text-right text-muted">{money(FACILITY_INFO[k].upkeep * lvl * 12)}</td>
                  <td className="text-right">{lvl >= MAX_LEVEL ? <span className="text-dim">max</span> : money(upgradeCost(team, k))}</td>
                </tr>
              );
            })}
            <tr>
              <td className="font-semibold text-gold2">Total</td>
              <td className="text-center font-display font-bold">{totalLevels}</td>
              <td />
              <td className="text-right font-display font-bold text-gold2">{money(upkeep)}</td>
              <td className="text-right font-display font-bold">{money(upkeep * 12)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
