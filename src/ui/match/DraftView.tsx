import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { gd } from '../../data/gamedata';
import { useGame } from '../../store/game';
import { DRAFT_ORDER, applyAction, aiChoose, taken, picksOf, bansOf, openRoles, pickValue, comfort, metaScore, currentTurn, type DraftState } from '../../engine/draft/draft';
import { compChecklist, checklistFills } from '../../engine/draft/checklist';
import { MASTERY_TIERS, masteryTier, type MasteryTier } from '../../engine/mastery';
import { ChampIcon, TeamLogo, RoleIcon, ROLE_COLORS, asset } from '../components/kit';
import { ROLES, ROLE_LABEL, type Role, type Team } from '../../engine/types';
import { RNG } from '../../util/rng';
import { autoRole, comfortOf, enemyThreats, laneCounter, matchupsFor, playerFor, synergyHints, tileInfos, type TileInfo } from './draftInsights';

const SIDE_COLOR = ['#3b82f6', '#ef4444'];
const COUNTER_GOOD = '#16a34a', COUNTER_BAD = '#dc2626';
const pctWr = (wr: number) => `${(wr * 100).toFixed(1)}%`;
const champName = (id: string) => gd().championById[id]?.name ?? id;

type SortBy = 'name' | 'comfort';
type ViewSide = 'us' | 'them';

export default function DraftView({ draft, userSide, onDone, gameNo }: { draft: DraftState; userSide: 0 | 1; onDone: () => void; gameNo: number }) {
  const state = useGame();
  const [, force] = useState(0);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [hover, setHover] = useState<string | null>(null);
  const [auto, setAuto] = useState(false); // auto-draft the rest of this game for the user
  // whose comfort the tiles show: our players (also who our pick goes to) or the enemy's (scouting / bans)
  const [viewSide, setViewSide] = useState<ViewSide>('us');
  const [viewRole, setViewRole] = useState<Role | null>(null); // null: auto (best-fitting open role per champion)
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const rng = useMemo(() => new RNG((state.rngState ^ (gameNo * 7919)) >>> 0), [gameNo]); // eslint-disable-line react-hooks/exhaustive-deps
  const turn = currentTurn(draft);
  const myTurn = !draft.done && turn.side === userSide;
  const oppSide = (1 - userSide) as 0 | 1;
  const blocked = useMemo(() => taken(draft), [draft.step]); // eslint-disable-line react-hooks/exhaustive-deps
  const teams = [state.teams[draft.teams[0].teamId], state.teams[draft.teams[1].teamId]];

  // AI acts on its turns
  useEffect(() => {
    if (draft.done) { const t = setTimeout(onDone, 900); return () => clearTimeout(t); }
    if (turn.side === userSide && !auto) return;
    const t = setTimeout(() => {
      const ch = aiChoose(draft, rng, state.championPower);
      applyAction(draft, ch.champion, ch.role);
      force((x) => x + 1);
    }, 650);
    return () => clearTimeout(t);
  });

  const roles = openRoles(draft, userSide);
  const shownSide: 0 | 1 = viewSide === 'us' ? userSide : oppSide;
  // our pick goes to the selected player when that role is still open
  const effRole: Role | null = myTurn && turn?.type === 'pick' && viewSide === 'us' && viewRole && roles.includes(viewRole) ? viewRole : null;

  const suggestions = useMemo(() => {
    if (!myTurn) return [] as { id: string; role?: Role; v: number }[];
    const out: { id: string; role?: Role; v: number }[] = [];
    if (turn.type === 'pick') {
      for (const c of gd().champions) {
        if (blocked.has(c.id)) continue;
        for (const r of roles) { const v = pickValue(draft, userSide, c.id, r, state.championPower); if (v > 0) out.push({ id: c.id, role: r, v }); }
      }
    } else {
      const opp = draft.teams[oppSide];
      const oppRoles = openRoles(draft, oppSide);
      for (const c of gd().champions) {
        if (blocked.has(c.id)) continue;
        let v = 0;
        for (const r of oppRoles) { const p = opp.players.find((x) => x.role === r); if (p) v = Math.max(v, comfort(p, c.id, r) * 0.5 + metaScore(c.id, r, state.championPower) * 0.45); }
        out.push({ id: c.id, v });
      }
    }
    // one suggestion per champion (its best role), best first
    const seen = new Set<string>();
    return out.sort((a, b) => b.v - a.v).filter((s) => !seen.has(s.id) && (seen.add(s.id), true)).slice(0, 8);
  }, [draft.step, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  // per-champion comfort + lane-counter info for the side/player being viewed (memoised: hovering doesn't recompute)
  const info = useMemo(() => {
    const hint = (id: string) => (viewSide === 'us' ? suggestions.find((s) => s.id === id)?.role : undefined);
    return tileInfos(draft, shownSide, viewRole, hint);
  }, [draft.step, viewSide, viewRole, shownSide, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const threats = useMemo(() => enemyThreats(draft, oppSide, blocked), [draft.step, oppSide, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const champs = useMemo(() => {
    const ql = q.toLowerCase();
    const list = gd().champions.filter((c) => (roleFilter === 'all' || c.positions.includes(roleFilter)) && c.name.toLowerCase().includes(ql));
    if (sortBy === 'comfort') list.sort((a, b) => Number(blocked.has(a.id)) - Number(blocked.has(b.id)) || (info.get(b.id)?.v ?? 0) - (info.get(a.id)?.v ?? 0) || a.name.localeCompare(b.name));
    return list;
  }, [q, roleFilter, sortBy, info, blocked]);

  const choose = (id: string, role?: Role) => {
    if (!myTurn || blocked.has(id)) return;
    let r = role ?? effRole ?? undefined;
    if (turn.type === 'pick' && !r) {
      // same player the tile shows when viewing our side; otherwise our best-fitting open role
      r = suggestions.find((s) => s.id === id)?.role ?? (viewSide === 'us' ? info.get(id)?.role : undefined) ?? autoRole(draft, userSide, id);
      if (!roles.includes(r)) r = autoRole(draft, userSide, id);
    }
    applyAction(draft, id, turn.type === 'pick' ? r : undefined);
    if (viewSide === 'us') setViewRole(null);
    force((x) => x + 1);
  };
  const autoDraft = () => {
    setAuto(true);
    while (!draft.done && currentTurn(draft).side === userSide) { const ch = aiChoose(draft, rng, state.championPower); applyAction(draft, ch.champion, ch.role); }
    force((x) => x + 1);
  };

  // the champion grid only re-renders when the draft, filters or viewed player change (not on hover)
  const grid = useMemo(() => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-x-1.5 gap-y-2 max-h-[430px] overflow-y-auto pr-1 pt-1 pl-1">
      {champs.map((c) => <ChampTile key={c.id} id={c.id} name={c.name} info={info.get(c.id)!} blocked={blocked.has(c.id)} locked={draft.unavailable.has(c.id)} canAct={myTurn} onHover={setHover} onChoose={choose} />)}
    </div>
  ), [champs, info, blocked, myTurn, draft.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const sideTeam = draft.teams[shownSide];
  const sideOpen = openRoles(draft, shownSide);
  const sidePicks = picksOf(draft, shownSide);
  const assigning = myTurn && turn.type === 'pick' && viewSide === 'us';
  const isBan = !draft.done && turn.type === 'ban';
  // the hovered champion previews which checklist rows it would fill for the side being viewed
  const preview = hover && !blocked.has(hover) && sidePicks.length < 5 ? hover : null;
  const pickIds = (side: 0 | 1) => picksOf(draft, side).map((a) => a.champion!);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-display text-2xl font-bold">Draft · Game {gameNo}</div>
        <div className="text-sm text-muted">{draft.unavailable.size ? `Fearless: ${draft.unavailable.size} champions locked from earlier games` : 'Fearless draft'}</div>
        {!draft.done && <div className={`font-display text-xl font-bold ${myTurn ? 'text-gold2 pulse-gold px-3 rounded' : 'text-muted'}`}>{myTurn ? `Your ${turn.type}` : `${teams[turn.side].short} ${turn.type}ing…`} <span className="text-sm text-dim">({draft.step + 1}/20)</span></div>}
        {draft.done && <div className="font-display text-xl text-win">Draft complete</div>}
      </div>

      <div className="grid grid-cols-[260px_1fr_260px] gap-3">
        <SideColumn side={0} draft={draft} team={teams[0]} userSide={userSide} preview={shownSide === 0 ? preview : null} />
        <div className="panel p-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {(['all', ...ROLES] as const).map((r) => (
              <button key={r} className={`chip ${roleFilter === r ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => setRoleFilter(r)}>{r === 'all' ? 'All' : <><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</>}</button>
            ))}
            <input className="input flex-1 min-w-[140px]" placeholder="Search champion…" value={q} onChange={(e) => setQ(e.target.value)} />
            {auto ? <button className="btn" onClick={() => setAuto(false)}>Auto-drafting… (take over)</button>
              : !draft.done && <button className="btn" onClick={autoDraft}>Auto-draft for me</button>}
          </div>
          {/* whose comfort the tiles show (and, on our pick, who gets the champion) */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
            <span className="text-muted">{assigning ? 'Pick for:' : 'Comfort of:'}</span>
            <div className="flex rounded-full border border-line2 overflow-hidden">
              {(['us', 'them'] as const).map((s) => (
                <button key={s} className={`px-2 py-0.5 text-[11px] font-semibold ${viewSide === s ? 'bg-[#1b2948] text-gold2' : 'text-muted hover:text-text'}`} onClick={() => { setViewSide(s); setViewRole(null); }}>
                  {s === 'us' ? teams[userSide].short : teams[oppSide].short}
                </button>
              ))}
            </div>
            <button className={`chip ${viewRole === null ? 'border-gold text-gold2' : 'text-muted'}`} title="Each champion shows the open-role player who fits it best" onClick={() => setViewRole(null)}>Auto</button>
            {ROLES.map((r) => {
              const p = sideTeam.players.find((x) => x.role === r);
              const pick = sidePicks.find((a) => a.role === r)?.champion;
              const open = sideOpen.includes(r);
              return (
                <button key={r} className={`chip ${viewRole === r ? 'border-gold text-gold2' : open ? 'text-muted' : 'text-dim'}`} title={open ? `Show ${p?.name}'s comfort${assigning ? ' and give them the pick' : ''}` : `${p?.name} already picked ${pick ? champName(pick) : ''} — comfort preview only`} onClick={() => setViewRole(viewRole === r ? null : r)}>
                  <RoleIcon role={r} size={12} />{p?.name}{pick && <ChampIcon id={pick} size={14} className="opacity-70" />}
                </button>
              );
            })}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-dim">Sort</span>
              {(['name', 'comfort'] as const).map((s) => <button key={s} className={`chip ${sortBy === s ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => setSortBy(s)}>{s === 'name' ? 'A–Z' : 'Comfort'}</button>)}
            </div>
          </div>
          <TierLegend />
          {grid}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-3 mt-3">
            <div className="panel-flat p-2 space-y-2 min-w-0">
              <div>
                <div className="text-[11px] uppercase text-muted font-bold mb-1">{myTurn ? (turn.type === 'ban' ? 'Suggested bans' : 'Suggested picks') : draft.done ? 'Draft complete' : 'Waiting for opponent'}</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => {
                    const p = s.role ? playerFor(draft, userSide, s.role) : undefined;
                    const ci = p && s.role ? comfortOf(p, s.id, s.role) : null;
                    const fills = checklistFills(pickIds(turn.type === 'pick' ? userSide : oppSide), s.id);
                    return (
                      <button key={s.id + (s.role ?? '')} onMouseEnter={() => setHover(s.id)} onClick={() => choose(s.id, s.role)} className="flex items-center gap-1.5 chip hover:border-gold"
                        title={fills.length ? `${turn.type === 'pick' ? 'Fills our' : 'Would fill their'} comp: ${fills.join(', ')}` : undefined}>
                        <ChampIcon id={s.id} size={20} />{champName(s.id)}
                        {p && ci && <span className="text-dim">→ {p.name} <span style={{ color: ci.tier.color }}>{ci.tier.label}</span></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(isBan || (!myTurn && !draft.done)) && threats.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase text-muted font-bold mb-1" title="Mastered (130+) champions of the enemy players who still have to pick">{teams[oppSide].short} comfort picks{isBan && myTurn ? ' — ban targets' : ''}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {threats.map((t) => (
                      <button key={t.id} aria-disabled={!myTurn || !isBan} onMouseEnter={() => setHover(t.id)} onClick={() => { if (isBan) choose(t.id); }} className={`flex items-center gap-1.5 chip ${myTurn && isBan ? 'hover:border-gold' : 'cursor-default'}`} title={`${t.player.name} (${ROLE_LABEL[t.player.role]}) · ${champName(t.id)} · ${t.tier.label} ${t.v}/200`}>
                        <ChampIcon id={t.id} size={20} />
                        <span>{t.player.name} · {champName(t.id)} · <b style={{ color: t.tier.color }}>{t.tier.label}</b> <span className="text-dim">{t.v}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="panel-flat p-2 text-xs min-h-[120px] min-w-0">
              {hover ? <ChampPreview id={hover} draft={draft} userSide={userSide} shownSide={shownSide} tile={info.get(hover)} blocked={blocked} />
                : <span className="text-dim">Hover a champion to see player comfort, lane matchups and comp fit.</span>}
            </div>
          </div>
        </div>
        <SideColumn side={1} draft={draft} team={teams[1]} userSide={userSide} preview={shownSide === 1 ? preview : null} />
      </div>
    </div>
  );
}

function TierLegend() {
  const tiers = [...MASTERY_TIERS].reverse();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-[10px] text-dim">
      {tiers.map((t) => (
        <span key={t.label} className="flex items-center gap-1"><TierPip tier={t} known size={12} />{t.label} {t.min}+</span>
      ))}
      <span className="flex items-center gap-1"><TierPip tier={masteryTier(110)} known={false} size={12} />estimate (not in pool)</span>
      <span className="flex items-center gap-1"><span className="rounded px-1 font-bold text-white" style={{ background: COUNTER_GOOD }}>⚔</span>counters their laner</span>
      <span className="flex items-center gap-1"><span className="rounded px-1 font-bold text-white" style={{ background: COUNTER_BAD }}>⚠</span>countered</span>
    </div>
  );
}

function TierPip({ tier, known, size = 15 }: { tier: MasteryTier; known: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold leading-none shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.58, background: known ? tier.color : '#0b1220', color: known ? '#0b0f19' : tier.color, border: `1.5px solid ${tier.color}` }}>
      {tier.label[0]}
    </span>
  );
}

function ChampTile({ id, name, info, blocked, locked, canAct, onHover, onChoose }: { id: string; name: string; info: TileInfo; blocked: boolean; locked: boolean; canAct: boolean; onHover: (id: string) => void; onChoose: (id: string) => void }) {
  const { tier, v, known, player, counter } = info;
  const unplayable = v < 60;
  // tier-coloured border for real pool champions (comfortable and up); estimates only get a hollow pip
  const ring = !blocked && known && v >= 100 ? `0 0 0 2px ${tier.color}${v >= 165 ? `, 0 0 8px ${tier.color}aa` : ''}` : undefined;
  const ctr = counter && !blocked ? counter : null;
  const ctrText = ctr ? `${ctr.edge > 0 ? 'counters' : 'countered by'} ${champName(ctr.vs)}${ctr.wr !== null ? ` (${pctWr(ctr.wr)} lane WR)` : ''}` : '';
  const title = `${name} — ${player?.name ?? '?'} (${ROLE_LABEL[info.role]}): ${tier.label} ${v}/200${known ? '' : ' (estimate)'}${ctr ? ` · ${ctr.edge > 0 ? '⚔' : '⚠'} ${ctrText}` : ''}${locked ? ' · locked (fearless)' : blocked ? ' · unavailable' : ''}`;
  return (
    <button aria-disabled={blocked || !canAct} onMouseEnter={() => onHover(id)} onClick={() => onChoose(id)} title={title}
      className={`relative group text-left transition-opacity ${blocked || !canAct ? 'cursor-default' : ''} ${!blocked && unplayable ? 'opacity-40 hover:opacity-100' : ''}`}>
      <div className="relative rounded-md" style={{ boxShadow: ring }}>
        <ChampIcon id={id} size={56} grey={blocked} title={title} className={!blocked && canAct ? 'group-hover:brightness-125' : ''} />
        {locked && <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/80">🔒</span>}
        {!blocked && !unplayable && <span className="absolute -top-1 -left-1"><TierPip tier={tier} known={known} /></span>}
        {!blocked && <span className="absolute top-0 right-0 hidden group-hover:block rounded-bl-md rounded-tr-md bg-black/85 px-1 text-[10px] font-bold leading-4" style={{ color: tier.color }}>{known ? '' : '~'}{v}</span>}
        {ctr && (
          <span className="absolute inset-x-0 bottom-0 truncate rounded-b-md px-0.5 text-center text-[8.5px] font-bold leading-[12px] text-white" style={{ background: ctr.edge > 0 ? `${COUNTER_GOOD}e6` : `${COUNTER_BAD}e6` }}>
            {ctr.edge > 0 ? '⚔' : '⚠'} {champName(ctr.vs)}
          </span>
        )}
      </div>
      <div className="text-[9px] text-muted truncate mt-0.5">{name}</div>
    </button>
  );
}

function ChampPreview({ id, draft, userSide, shownSide, tile, blocked }: { id: string; draft: DraftState; userSide: 0 | 1; shownSide: 0 | 1; tile?: TileInfo; blocked: Set<string> }) {
  const state = useGame();
  const c = gd().championById[id];
  if (!c) return null;
  const oppSide = (1 - userSide) as 0 | 1;
  const role: Role = tile?.role ?? c.positions[0] ?? 'mid';
  // comfort of the players on both teams who play it (their role) or have it in their pool
  const rows = (side: 0 | 1) => draft.teams[side].players
    .filter((p) => c.positions.includes(p.role) || (p.champions[id] ?? 0) >= 60)
    .map((p) => ({ p, ...comfortOf(p, id, p.role) }))
    .sort((a, b) => b.v - a.v);
  const ours = rows(userSide), theirs = rows(oppSide);
  const mu = matchupsFor(id, role);
  const enemyPicks = picksOf(draft, (1 - shownSide) as 0 | 1);
  const allyPicks = picksOf(draft, shownSide);
  const laneEnemy = enemyPicks.find((a) => a.role === role)?.champion;
  const counter = laneCounter(draft, shownSide, id, role);
  const allyIds = allyPicks.map((a) => a.champion!).filter((x) => x !== id);
  const hints = synergyHints(allyIds, id);
  const fills = allyPicks.length < 5 && !blocked.has(id) ? checklistFills(allyIds, id) : [];
  const status = (mid: string): { label: string; color: string } | null => {
    if (mid === laneEnemy) return { label: `their ${ROLE_LABEL[role].toLowerCase()}`, color: '#f0e6d2' };
    const e = enemyPicks.find((a) => a.champion === mid);
    if (e) return { label: `picked · ${ROLE_LABEL[e.role!]}`, color: '#cbd5e1' };
    if (allyPicks.some((a) => a.champion === mid)) return { label: 'ally', color: '#8a97b3' };
    if (draft.unavailable.has(mid)) return { label: 'locked', color: '#5b6787' };
    if (blocked.has(mid)) return { label: 'banned', color: '#5b6787' };
    return null;
  };
  const matchRow = (list: { id: string; wr: number }[], good: boolean): ReactNode => (
    <div className="flex flex-wrap gap-1">
      {list.map((m) => {
        const st = status(m.id);
        const enemy = st && (m.id === laneEnemy || st.label.startsWith('picked'));
        const col = good ? COUNTER_GOOD : COUNTER_BAD;
        return (
          <span key={m.id} className={`flex items-center gap-1 rounded px-1 py-0.5 border ${enemy ? '' : 'border-line'} ${st && !enemy ? 'opacity-50' : ''}`}
            style={enemy ? { borderColor: col, background: `${col}33` } : undefined} title={`${c.name} vs ${champName(m.id)}: ${pctWr(m.wr)} win rate in ${ROLE_LABEL[mu!.role]} (op.gg)${st ? ` · ${st.label}` : ''}`}>
            <ChampIcon id={m.id} size={18} grey={!!st && !enemy} />
            <span className="truncate max-w-[70px]">{champName(m.id)}</span>
            <b style={{ color: col }}>{pctWr(m.wr)}</b>
            {st && <span className="text-[9px] uppercase font-bold" style={{ color: st.color }}>{st.label}</span>}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="flex gap-2">
      <ChampIcon id={id} size={44} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-semibold">{c.name} <span className="text-dim">{c.positions.map((p) => ROLE_LABEL[p]).join(' / ')}</span> <span className="text-muted">· Meta {Math.round(metaScore(id, role, state.championPower) * 100)}</span></div>
        {c.notes && <div className="text-dim truncate" title={c.notes}>{c.archetype?.replace('_', ' ')} · {c.notes}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {ours.map((r) => <ComfortLine key={r.p.id} name={r.p.name} role={r.p.role} v={r.v} known={r.known} tier={r.tier} />)}
          {theirs.length > 0 && <span className="text-dim">| them:</span>}
          {theirs.slice(0, 3).map((r) => <ComfortLine key={r.p.id} name={r.p.name} role={r.p.role} v={r.v} known={r.known} tier={r.tier} dim />)}
        </div>
        {laneEnemy && (
          <div className="rounded px-1.5 py-0.5" style={{ background: counter ? `${counter.edge > 0 ? COUNTER_GOOD : COUNTER_BAD}26` : '#111a2e' }}>
            vs <b>{champName(laneEnemy)}</b> <span className="text-dim">({shownSide === userSide ? 'their' : 'our'} {ROLE_LABEL[role].toLowerCase()})</span>:{' '}
            {counter ? <b style={{ color: counter.edge > 0 ? '#4ade80' : '#f87171' }}>{counter.edge > 0 ? '⚔ favoured' : '⚠ unfavoured'}{counter.wr !== null ? ` · ${pctWr(counter.wr)} lane win rate` : ''}</b>
              : <span className="text-muted">no strong matchup either way in the data</span>}
          </div>
        )}
        {mu ? (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase text-dim font-bold">Lane matchups · {ROLE_LABEL[mu.role]} <span className="normal-case font-normal">(op.gg win rate)</span></div>
            <div className="flex items-start gap-1.5"><span className="w-8 shrink-0 text-[10px] font-bold uppercase mt-1" style={{ color: '#4ade80' }}>Easy</span>{matchRow(mu.easy, true)}</div>
            <div className="flex items-start gap-1.5"><span className="w-8 shrink-0 text-[10px] font-bold uppercase mt-1" style={{ color: '#f87171' }}>Hard</span>{matchRow(mu.hard, false)}</div>
          </div>
        ) : <div className="text-dim">No lane matchup data.</div>}
        {fills.length > 0 && (
          <div className="truncate" title={`Unmet rows of ${shownSide === userSide ? 'our' : 'their'} comp checklist that ${c.name} would tick`}>
            <span className="text-dim">{shownSide === userSide ? 'Fills our comp:' : 'Would fill their comp:'}</span> <b className="text-gold2">{fills.join(' · ')}</b>
          </div>
        )}
        {hints.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hints.map((h) => <span key={h.text} className="chip" style={{ color: h.good ? '#86efac' : '#fca5a5', borderColor: h.good ? '#166534' : '#7f1d1d' }}>{h.good ? '✓' : '!'} {h.text}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ComfortLine({ name, role, v, known, tier, dim }: { name: string; role: Role; v: number; known: boolean; tier: MasteryTier; dim?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${dim ? 'opacity-75' : ''}`} title={`${name} (${ROLE_LABEL[role]}): ${tier.label} ${v}/200${known ? '' : ' — estimate, not in their pool'}`}>
      <RoleIcon role={role} size={11} />{name}: <b style={{ color: tier.color }}>{tier.label}</b> <span className="text-dim">{known ? '' : '~'}{v}</span>
    </span>
  );
}

function SideColumn({ side, draft, team, userSide, preview }: { side: 0 | 1; draft: DraftState; team: Team; userSide: 0 | 1; preview: string | null }) {
  const picks = picksOf(draft, side);
  const bans = bansOf(draft, side);
  const players = draft.teams[side].players;
  const turn = currentTurn(draft);
  return (
    <div className="panel p-3" style={{ borderTop: `3px solid ${SIDE_COLOR[side]}` }}>
      <div className="flex items-center gap-2 mb-2">
        <TeamLogo team={team} size={28} />
        <div className="font-display font-bold text-lg truncate">{team.name}</div>
        {side === userSide && <span className="chip text-gold2 border-gold">You</span>}
      </div>
      <div className="text-[11px] uppercase text-muted font-bold">{side === 0 ? 'Blue side' : 'Red side'} · Bans</div>
      <div className="flex gap-1 my-1.5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-9 h-9 rounded bg-[#0a1120] border border-line overflow-hidden">{bans[i] && <ChampIcon id={bans[i]} size={36} grey />}</div>)}
      </div>
      <div className="space-y-1.5 mt-2">
        {ROLES.map((r) => {
          const pick = picks.find((a) => a.role === r);
          const pl = players.find((p) => p.role === r);
          const nextPick = !draft.done && turn.side === side && turn.type === 'pick' && !pick;
          const ci = pick?.champion && pl ? comfortOf(pl, pick.champion, r) : null;
          const ctr = pick?.champion ? laneCounter(draft, side, pick.champion, r) : null;
          return (
            <div key={r} className={`flex items-center gap-2 rounded p-1 ${nextPick ? 'bg-[#1a2540]' : ''}`}>
              <div className="w-12 h-12 shrink-0 rounded overflow-hidden bg-[#0a1120] border border-line" style={ci ? { borderColor: ci.tier.color } : undefined}>{pick?.champion ? <ChampIcon id={pick.champion} size={48} /> : null}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[11px] font-bold uppercase" style={{ color: ROLE_COLORS[r] }}><RoleIcon role={r} size={12} />{ROLE_LABEL[r]}</div>
                <div className="font-semibold truncate">{pl?.name}</div>
                {pick?.champion && (
                  <div className="text-[11px] text-muted truncate" title={ci ? `${pl?.name} · ${champName(pick.champion)} · ${ci.tier.label} ${ci.v}/200${ci.known ? '' : ' (not in pool)'}${ctr ? ` · ${ctr.edge > 0 ? 'counters' : 'countered by'} ${champName(ctr.vs)}` : ''}` : undefined}>
                    {champName(pick.champion)}{ci && <> · <b style={{ color: ci.tier.color }}>{ci.tier.label}</b> <span className="text-dim">{ci.known ? '' : '~'}{ci.v}</span></>}
                    {ctr && <span className="ml-1 font-bold" style={{ color: ctr.edge > 0 ? '#4ade80' : '#f87171' }}>{ctr.edge > 0 ? '⚔' : '⚠'}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <CompChecklist ids={picks.map((a) => a.champion!)} preview={preview} />
    </div>
  );
}

const DOT = { met: '#22c55e', open: '#5b6787', missing: '#ef4444' };
/**
 * The comp-building checklist for one team's picks (engine/draft/checklist.ts): count vs goal and a status
 * dot per row (green met, grey not yet, red still missing once all five are locked); hover lists the picks
 * that tick it. `preview` (a hovered champion) marks the unmet rows it would fill.
 */
function CompChecklist({ ids, preview }: { ids: string[]; preview: string | null }) {
  const rows = compChecklist(ids);
  const fills = new Set(preview ? checklistFills(ids, preview) : []);
  const final = ids.length >= 5;
  const met = rows.filter((r) => r.met).length;
  return (
    <div className="mt-3 pt-2 border-t hairline">
      <div className="flex items-center justify-between text-[11px] uppercase text-muted font-bold mb-1" title="Classic comp-building checklist. Green: met · grey: not yet · red: missing from the final comp. Hover a row for the picks that tick it.">
        <span>Comp checklist</span>
        <span style={{ color: met === rows.length ? DOT.met : undefined }}>{met}/{rows.length}</span>
      </div>
      <div className="text-[11px] leading-[17px]">
        {rows.map((r, i) => {
          const plus = fills.has(r.label) ? gd().championById[preview!]?.name : undefined;
          return (
            <Fragment key={r.key}>
              {r.group === 'damage' && rows[i - 1]?.group !== 'damage' && <div className="text-center text-[10px] uppercase text-dim font-bold mt-0.5">— Damage —</div>}
              <div className="flex items-center gap-1.5 min-w-0" title={`${r.label} ${r.have}/${r.goal} — ${r.rule}\n${r.contributors.length ? r.contributors.join('\n') : 'No pick ticks it yet'}${plus ? `\n+ ${plus} would tick it` : ''}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.met ? DOT.met : final ? DOT.missing : DOT.open }} />
                <span className={`truncate ${r.met ? 'text-text' : 'text-muted'}`}>{r.label}</span>
                {plus && <span className="text-[10px] font-bold text-gold2">+1</span>}
                <span className="ml-auto font-display font-bold tabular-nums" style={{ color: r.met ? DOT.met : final ? DOT.missing : undefined }}>{r.have}/{r.goal}</span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export { asset, DRAFT_ORDER };
