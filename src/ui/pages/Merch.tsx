import { useMemo, useState } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Team, MerchProduct } from '../../engine/types';
import { ROLE_LABEL } from '../../engine/types';
import { Panel, Stat, Empty, Modal, Pill, Portrait, Bar, money, num } from '../components/kit';
import { MERCH_TEMPLATES, produceMerch, addMerchLine, merchDemand, starPowerOf } from '../../engine/management/merch';
import { addLedger } from '../../engine/management/finance';
import { clamp } from '../../util/rng';

type Template = (typeof MERCH_TEMPLATES)[number];
const tpl = (type: string): Template | undefined => MERCH_TEMPLATES.find((t) => t.type === type);
const PRESETS = [100, 500, 1000, 5000];
const TYPE_GLYPH: Record<string, string> = { jersey: 'JR', hoodie: 'HD', tee: 'TS', cap: 'CP', mousepad: 'MP', figure: 'FG', signature: 'SG' };

// ------------------------------------------------------------------ demand model (the engine's, merch.ts)
const starPower = starPowerOf;
const priceFactor = (t: Template, price: number) => clamp(Math.pow(t.basePrice / Math.max(1, price), 1.6), 0.15, 2.5);

/** Expected weekly units at `price`. */
function weeklyDemand(state: GameState, team: Team, m: MerchProduct, price = m.price, sp = starPower(state, team)) {
  return merchDemand(state, team, price === m.price ? m : { ...m, price }, sp);
}
const unitCostFor = (m: MerchProduct, qty: number) => m.unitCost * (qty >= 5000 ? 0.8 : qty >= 1000 ? 0.9 : 1) * (0.8 + m.quality / 250);
const maxPrice = (t: Template) => t.basePrice * 3;
/** Profit-maximising price per week ignoring stock limits: (p - c)·p^-1.6 peaks at p = 1.6c / 0.6. */
const suggestedPrice = (m: MerchProduct, t: Template) => Math.round(clamp((1.6 * unitCostFor(m, 1000)) / 0.6, t.basePrice / Math.pow(2.5, 1 / 1.6), maxPrice(t)));

function demandHint(f: number): { label: string; color: string } {
  if (f >= 1.5) return { label: 'Very high', color: '#4ade80' };
  if (f >= 1.1) return { label: 'High', color: '#84cc16' };
  if (f >= 0.85) return { label: 'Normal', color: '#8a97b3' };
  if (f >= 0.5) return { label: 'Low', color: '#fbbf24' };
  return { label: 'Very low', color: '#f87171' };
}

// ------------------------------------------------------------------ page
export default function Merch(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const [produceId, setProduceId] = useState<string | null>(null);
  const [sigPlayer, setSigPlayer] = useState<string>('');
  const [discontinue, setDiscontinue] = useState<string | null>(null);

  const sp = useMemo(() => starPower(state, team), [state, team, v]);
  const rows = team.merch.map((m) => {
    const t = tpl(m.type);
    const demand = weeklyDemand(state, team, m, m.price, sp);
    const units = Math.min(m.stock, Math.round(demand));
    return { m, t, demand, units, revenue: units * m.price, cover: demand > 0 ? m.stock / demand : Infinity, unit: unitCostFor(m, 1000) };
  });
  const weekly = rows.reduce((a, r) => a + r.revenue, 0);
  const weeklyPotential = rows.reduce((a, r) => a + Math.round(r.demand) * r.m.price, 0);
  const lifetime = team.merch.reduce((a, m) => a + m.sold * m.price, 0);
  const stock = team.merch.reduce((a, m) => a + m.stock, 0);
  const sold = team.merch.reduce((a, m) => a + m.sold, 0);
  const last12 = team.monthly.slice(-12);
  const rev12 = last12.reduce((a, r) => a + (r.income['Merchandise sales'] ?? 0), 0);
  const prod12 = last12.reduce((a, r) => a + (r.expense['Merch production'] ?? 0), 0);
  const outOfStock = rows.filter((r) => r.m.stock === 0);
  const lowStock = rows.filter((r) => r.m.stock > 0 && r.cover < 3);

  const setPrice = (m: MerchProduct, price: number) => {
    const t = tpl(m.type);
    if (!t || !Number.isFinite(price)) return;
    m.price = Math.round(clamp(price, 1, maxPrice(t)));
    bump();
  };

  const produce = (m: MerchProduct, qty: number) => {
    const cost = Math.round(unitCostFor(m, qty) * qty);
    if (cost > team.balance) { notify('Not enough money for this production run.'); return; }
    const charged = produceMerch(team, m.id, qty);
    addLedger(state, team, 'Merch production', -charged, `${qty.toLocaleString()} × ${productName(state, m)}`);
    notify(`Produced ${qty.toLocaleString()} × ${productName(state, m)} for ${money(charged)}.`);
    setProduceId(null);
    bump();
  };

  const launch = (type: string, playerId?: string) => {
    const p = addMerchLine(team, type, playerId);
    if (!p) return;
    if (type === 'signature' && playerId) p.name = `${state.players[playerId]?.handle ?? ''} Signature Jersey`.trim();
    notify(`Launched ${p.name}. Order a production run to put it on sale.`);
    setSigPlayer('');
    bump();
  };

  const removeLine = (id: string) => {
    team.merch = team.merch.filter((m) => m.id !== id);
    setDiscontinue(null);
    bump();
  };

  const owned = new Set(team.merch.map((m) => m.type));
  const sigTaken = new Set(team.merch.filter((m) => m.type === 'signature').map((m) => m.playerId));
  const rosterPlayers = team.roster.map((id) => state.players[id]).filter((p) => p && !sigTaken.has(p.id)).sort((a, b) => b.reputation - a.reputation);
  const producing = team.merch.find((m) => m.id === produceId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Merchandise</h1>
          <div className="text-sm text-muted mt-1">Product lines, pricing and production runs · sales post every Monday</div>
        </div>
        <button className="btn" onClick={() => nav('finances')}>Finances →</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Weekly revenue (est.)" value={money(weekly)} sub={weeklyPotential > weekly ? `${money(weeklyPotential)} with full stock` : 'at current prices'} color="#f0e6d2" />
        <Stat label="Lifetime revenue" value={money(lifetime)} sub={`${num(sold)} units sold`} />
        <Stat label="Revenue · 12 months" value={money(rev12)} sub={`Production ${money(prod12)} · net ${money(rev12 - prod12, true)}`} />
        <Stat label="Units in stock" value={num(stock)} sub={`${team.merch.length} product lines`} />
        <Stat label="Fans" value={num(team.fans)} sub={`Hype ${Math.round(team.hype)} · Studio Lv ${team.facilities.contentStudio}`} />
        <Stat label="Star power" value={sp.toFixed(1)} sub="famous & fan-favourite players" />
      </div>

      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div className="panel-flat px-4 py-2.5 text-sm border-amber-700/70 bg-[#2a2012] flex items-center gap-3 flex-wrap">
          <span className="font-display font-bold uppercase tracking-wider text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">! Stock</span>
          {outOfStock.length > 0 && <span>Sold out: <b>{outOfStock.map((r) => productName(state, r.m)).join(', ')}</b>.</span>}
          {lowStock.length > 0 && <span>Under 3 weeks of stock: <b>{lowStock.map((r) => productName(state, r.m)).join(', ')}</b>.</span>}
        </div>
      )}

      <Panel title="Product lines" bodyClass="p-0" right={<span className="text-xs text-muted">Higher prices earn more per unit but cut demand (elasticity 1.6). Quality and fans lift demand.</span>}>
        {team.merch.length === 0 ? <Empty>No product lines yet. Launch one below.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th><th className="w-20">Quality</th><th>Price</th><th>Demand</th>
                  <th className="text-right">Stock</th><th className="text-right">Sales / wk</th><th className="text-right">Margin</th><th className="text-right">Lifetime</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, t, demand, units, revenue, cover, unit }) => {
                  const f = t ? priceFactor(t, m.price) : 1;
                  const hint = demandHint(f);
                  const p = m.playerId ? state.players[m.playerId] : null;
                  const sugg = t ? suggestedPrice(m, t) : m.price;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          {p ? <Portrait player={p} team={team} size={34} /> : <ProductGlyph type={m.type} colors={team.colors} />}
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{productName(state, m)}</div>
                            <div className="text-[11px] text-dim">
                              {t?.name ?? m.type} · list {money(t?.basePrice ?? m.price)}
                              {p && p.teamId !== team.id && <span className="text-red-400"> · player left the club</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><Bar value={m.quality} height={5} /></td>
                      <td>
                        <PriceInput value={m.price} max={t ? maxPrice(t) : 999} onCommit={(x) => setPrice(m, x)} />
                        {t && Math.abs(sugg - m.price) >= 2 && (
                          <button className="text-[10.5px] text-gold hover:text-gold2 mt-0.5 block" title="Profit-maximising price per unit sold (ignores stock limits)" onClick={() => setPrice(m, sugg)}>Suggested {money(sugg)}</button>
                        )}
                      </td>
                      <td>
                        <div className="text-xs font-semibold" style={{ color: hint.color }}>{hint.label}</div>
                        <div className="text-[10.5px] text-dim">×{f.toFixed(2)} vs list · ~{Math.round(demand)}/wk</div>
                      </td>
                      <td className="text-right">
                        <div className={`font-display font-bold ${m.stock === 0 ? 'text-red-400' : cover < 3 ? 'text-amber-300' : ''}`}>{m.stock.toLocaleString()}</div>
                        <div className="text-[10.5px] text-dim">{m.stock === 0 ? 'sold out' : cover === Infinity ? 'no demand' : `${cover >= 52 ? '52+' : cover.toFixed(1)} wks cover`}</div>
                      </td>
                      <td className="text-right">
                        <div className="font-display font-bold">{money(revenue)}</div>
                        <div className="text-[10.5px] text-dim">{units.toLocaleString()} units</div>
                      </td>
                      <td className="text-right">
                        <div className={`font-display font-bold ${m.price - unit < 0 ? 'text-red-400' : ''}`}>{money(m.price - unit)}</div>
                        <div className="text-[10.5px] text-dim">cost ~{money(unit)}</div>
                      </td>
                      <td className="text-right">
                        <div className="font-display font-bold">{money(m.sold * m.price)}</div>
                        <div className="text-[10.5px] text-dim">{m.sold.toLocaleString()} sold</div>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn btn-gold py-1 text-xs" onClick={() => setProduceId(m.id)}>Produce</button>
                        {discontinue === m.id ? (
                          <span className="inline-flex gap-1 ml-1">
                            <button className="btn btn-danger py-1 text-xs" onClick={() => removeLine(m.id)}>Drop{m.stock ? ` ${m.stock}` : ''}</button>
                            <button className="btn btn-ghost py-1 text-xs" onClick={() => setDiscontinue(null)}>✕</button>
                          </span>
                        ) : <button className="btn btn-ghost py-1 text-xs ml-1" title="Discontinue this line" onClick={() => setDiscontinue(m.id)}>✕</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <Panel title="Launch a product line">
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {MERCH_TEMPLATES.map((t) => {
              const isSig = t.type === 'signature';
              const disabled = isSig ? rosterPlayers.length === 0 : owned.has(t.type);
              return (
                <div key={t.type} className={`panel-flat p-3 flex flex-col gap-2 ${disabled && !isSig ? 'opacity-55' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <ProductGlyph type={t.type} colors={team.colors} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-[11px] text-dim">Unit cost {money(t.unitCost)} · list price {money(t.basePrice)}</div>
                    </div>
                    {!isSig && owned.has(t.type) && <Pill color="#4ade80">On sale</Pill>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="w-16">Appeal</span>
                    <div className="flex-1"><Bar value={(t.appeal / 1.2) * 100} showValue={false} color="#c8aa6e" height={4} /></div>
                    <span className="w-8 text-right">{t.appeal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="w-16">Margin</span>
                    <span className="text-text font-semibold">{money(t.basePrice - t.unitCost)}</span>
                    <span>/ unit at list price ({Math.round(((t.basePrice - t.unitCost) / t.basePrice) * 100)}%)</span>
                  </div>
                  {isSig ? (
                    <div className="flex gap-2 mt-auto">
                      <select className="input flex-1 py-1 text-xs" value={sigPlayer} onChange={(e) => setSigPlayer(e.target.value)}>
                        <option value="">Choose a player…</option>
                        {rosterPlayers.map((p) => <option key={p.id} value={p.id}>{p.handle} · {ROLE_LABEL[p.role]} · rep {Math.round(p.reputation)}</option>)}
                      </select>
                      <button className="btn btn-gold py-1 text-xs" disabled={!sigPlayer} onClick={() => launch('signature', sigPlayer)}>Launch</button>
                    </div>
                  ) : (
                    <button className="btn mt-auto justify-center py-1 text-xs" disabled={disabled} onClick={() => launch(t.type)}>{disabled ? 'Already on sale' : 'Launch line'}</button>
                  )}
                  {isSig && <div className="text-[10.5px] text-dim">Signature demand scales with the player&apos;s reputation and collapses if he leaves.</div>}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="How merch sells">
          <ul className="text-xs text-muted space-y-2 leading-relaxed">
            <li><span className="text-text font-semibold">Fans</span> are the base: roughly one sale per 10k fans per week for a standard product, scaled by product appeal.</li>
            <li><span className="text-text font-semibold">Hype</span> (recent results) adds up to +100% demand; <span className="text-text font-semibold">star players</span> add 8% each point of star power.</li>
            <li><span className="text-text font-semibold">Price</span>: demand ∝ (list ÷ price)^1.6, capped between ×0.15 and ×2.5. Above list price you sell fewer, higher-margin units.</li>
            <li><span className="text-text font-semibold">Quality</span> lifts demand (×0.7 – ×1.2) but raises unit cost.</li>
            <li><span className="text-text font-semibold">Content Studio</span> adds +6% demand per level.</li>
            <li><span className="text-text font-semibold">Bulk discount</span>: −10% unit cost from 1,000 units, −20% from 5,000.</li>
            <li>Sold-out lines earn nothing — keep at least a few weeks of cover.</li>
          </ul>
        </Panel>
      </div>

      {producing && <ProduceModal state={state} team={team} m={producing} demand={weeklyDemand(state, team, producing, producing.price, sp)} onClose={() => setProduceId(null)} onProduce={(q) => produce(producing, q)} />}
    </div>
  );
}

function productName(state: GameState, m: MerchProduct) {
  if (m.type === 'signature' && m.playerId) {
    const h = state.players[m.playerId]?.handle;
    if (h && !m.name.includes(h)) return `${h} Signature Jersey`;
  }
  return m.name;
}

function ProductGlyph({ type, colors }: { type: string; colors: [string, string] }) {
  return (
    <div className="w-[34px] h-[34px] rounded-lg shrink-0 flex items-center justify-center font-display font-bold text-xs" style={{ background: `linear-gradient(150deg, ${colors[0]}, ${colors[0]}66)`, color: '#f8fafc', boxShadow: `inset 0 0 0 1px ${colors[1]}55` }}>
      {TYPE_GLYPH[type] ?? type.slice(0, 2).toUpperCase()}
    </div>
  );
}

function PriceInput({ value, max, onCommit }: { value: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => { if (draft !== null) { const n = Number(draft); if (Number.isFinite(n) && n > 0) onCommit(n); setDraft(null); } };
  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => onCommit(value - 5)}>−</button>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-dim text-xs">$</span>
        <input className="input w-[68px] py-1 pl-5 text-sm font-display font-bold" inputMode="numeric" value={draft ?? String(value)} max={max}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(null); }} />
      </div>
      <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => onCommit(value + 5)}>+</button>
    </div>
  );
}

function ProduceModal({ state, team, m, demand, onClose, onProduce }: { state: GameState; team: Team; m: MerchProduct; demand: number; onClose: () => void; onProduce: (qty: number) => void }) {
  const [qty, setQty] = useState(1000);
  const [custom, setCustom] = useState('');
  const q = Math.max(0, Math.floor(custom ? Number(custom) || 0 : qty));
  const unit = unitCostFor(m, q);
  const cost = Math.round(unit * q);
  const after = team.balance - cost;
  const weeks = demand > 0 ? (m.stock + q) / demand : Infinity;
  const discount = q >= 5000 ? '−20% bulk' : q >= 1000 ? '−10% bulk' : 'no bulk discount';
  return (
    <Modal open onClose={onClose} title={`Production run · ${productName(state, m)}`} width={520}>
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">Quantity</div>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button key={p} className={`btn ${!custom && qty === p ? 'btn-gold' : ''}`} onClick={() => { setQty(p); setCustom(''); }}>{p.toLocaleString()}</button>
            ))}
            <input className="input w-28" placeholder="Custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        </div>
        <table className="tbl">
          <tbody>
            <tr><td className="text-muted">Unit cost</td><td className="text-right font-display font-bold">${unit.toFixed(2)} <span className="text-xs text-dim font-sans font-normal">({discount}, quality {m.quality})</span></td></tr>
            <tr><td className="text-muted">Total cost</td><td className="text-right font-display font-bold text-lg text-gold2">{money(cost)}</td></tr>
            <tr><td className="text-muted">Balance after</td><td className={`text-right font-display font-bold ${after < 0 ? 'text-red-400' : ''}`}>{money(after)}</td></tr>
            <tr><td className="text-muted">Stock after</td><td className="text-right font-display font-bold">{(m.stock + q).toLocaleString()} <span className="text-xs text-dim font-sans font-normal">≈ {weeks === Infinity ? '∞' : weeks >= 104 ? '104+' : weeks.toFixed(1)} weeks of sales</span></td></tr>
            <tr><td className="text-muted">Potential revenue</td><td className="text-right font-display font-bold">{money(q * m.price)} <span className="text-xs text-dim font-sans font-normal">at {money(m.price)}</span></td></tr>
          </tbody>
        </table>
        {weeks !== Infinity && weeks > 52 && <div className="text-xs text-amber-300">That is more than a year of stock at current demand — cash will be tied up in inventory.</div>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={q <= 0 || cost > team.balance} onClick={() => onProduce(q)}>{cost > team.balance ? 'Insufficient funds' : `Produce ${q.toLocaleString()} for ${money(cost)}`}</button>
        </div>
      </div>
    </Modal>
  );
}
