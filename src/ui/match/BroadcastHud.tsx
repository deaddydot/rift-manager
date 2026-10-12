// Pro-broadcast scoreboard over the top of the match map (LCK / international style):
//   [series pips][logo] SHORT seed | towers | gold | kills ⚔ [event mark] ⚔ kills | gold | towers | seed SHORT [logo][pips]
//   [bans] grubs · drakes · dragon types · buffs        mm:ss        buffs · dragon types · drakes · grubs [bans]
// Plain HTML scaled from the map size (crisp at any size), pointer-events: none except the hide toggle.
// Everything on it is public on a real broadcast (scores, gold, objectives, bans), so it ignores the fog setting.
import { useMemo, type ReactNode } from 'react';
import type { MatchSim } from '../../engine/sim/engine';
import type { Competition, GameState, Team } from '../../engine/types';
import { DRAGON_COLOR, DRAGON_LABEL, T, type DragonType } from '../../engine/sim/constants';
import { bansOf } from '../../engine/draft/draft';
import { standings } from '../../engine/season/formats';
import { compColor, templateOf } from '../../engine/management/fixtureinfo';
import { useStore } from '../../store/game';
import { useSession } from './session';
import { ChampIcon, TeamLogo, mmss } from '../components/kit';

const ROW1 = 2.3, ROW2 = 1.55; // em
/** HUD font size (px) for a map of `size` px: everything on the HUD is sized in em from this. */
export const hudFont = (size: number) => (size < 560 ? Math.max(8.5, Math.min(12, size * 0.0235)) : Math.max(9.5, Math.min(18, size * 0.0172)));
/** Height the HUD covers at the top of the map (px), e.g. to place other map overlays under it. */
export const hudHeight = (size: number) => Math.ceil((ROW1 + ROW2) * hudFont(size));

const fmtGold = (g: number) => `${(g / 1000).toFixed(1)}K`;

// ------------------------------------------------------------------ static info: seeds, series, bans, event
interface HudStatic { seeds: [string, string]; need: number; wins: [number, number]; bans: [string[], string[]]; mark: { text: string; color: string; title: string } }

const leagueName = (state: GameState, id: string) => state.leagues[id]?.name ?? id;

/** "LCK#5": the team's place in its league table / regular season, or its regional seed at an international event. */
function standingLabel(state: GameState, comp: Competition | undefined, team: Team): string {
  const lg = leagueName(state, team.leagueId);
  if (!comp) return lg;
  if (comp.kind === 'international' || comp.region === 'INTL' || comp.tier === 0) {
    const tpl = templateOf(comp);
    for (const key of [tpl, `${tpl}-PI`]) {
      const q = state.qualified?.[key]?.find((x) => x.teamId === team.id);
      if (q) return `${leagueName(state, q.league || team.leagueId)}#${q.seed}`;
    }
    return lg;
  }
  const tableRank = (c: Competition): number | null => {
    const st = [...c.stages].reverse().find((s) => s.teams.includes(team.id) && (s.format === 'roundRobin' || s.format === 'groups'));
    if (!st) return null;
    const g = st.format === 'groups' ? Object.entries(st.groups ?? {}).find(([, ts]) => ts.includes(team.id))?.[0] : undefined;
    const rows = standings(st, state.fixtures, g);
    const i = rows.findIndex((r) => r.teamId === team.id);
    if (i < 0 || rows.every((r) => r.w + r.l === 0)) return null; // nothing played yet: no table to speak of
    return i + 1;
  };
  if (comp.kind === 'league') {
    const r = tableRank(comp);
    if (r) return `${lg}#${r}`;
  }
  // playoffs / cups: the regular-season finish (latest league competition of the team's league this season)
  const reg = Object.values(state.competitions)
    .filter((c) => c.season === comp.season && c.kind === 'league' && c.leagueId === team.leagueId && c.id !== comp.id && (c.placements?.[team.id] || c.status === 'active'))
    .sort((a, b) => a.endDate.localeCompare(b.endDate)).pop();
  if (reg?.placements?.[team.id]) return `${lg}#${reg.placements[team.id]}`;
  // no regular season yet (e.g. a pre-season cup): its own table, if it has one
  const r = (reg ? tableRank(reg) : null) ?? tableRank(comp);
  return r ? `${lg}#${r}` : lg;
}

function eventMark(state: GameState, c?: Competition): HudStatic['mark'] {
  if (!c) return { text: 'LOL', color: '#c8aa6e', title: 'League of Legends' };
  const tags = c.tags ?? [];
  const text = tags.includes('worlds') ? 'WORLDS' : tags.includes('msi') ? 'MSI' : tags.includes('fst') ? 'FST' : tags.includes('ewc') ? 'EWC'
    : (c.leagueId ? leagueName(state, c.leagueId) : c.short).toUpperCase();
  return { text, color: compColor(c), title: c.name };
}

function hudStatic(teams: [Team, Team]): HudStatic {
  const state = useStore.getState().state;
  const s = useSession.getState().s;
  const empty: HudStatic = { seeds: [teams[0].short, teams[1].short], need: 0, wins: [0, 0], bans: [[], []], mark: { text: 'LOL', color: '#c8aa6e', title: '' } };
  if (!state) return empty;
  const f = s ? state.fixtures[s.fixtureId] ?? s.series.fixture : undefined;
  const comp = f ? state.competitions[f.competitionId] : undefined;
  const bestOf = f?.bestOf ?? 1;
  const games = s?.series.games ?? [];
  const d = s?.draft;
  const flip = d && d.teams[0].teamId !== teams[0].id;
  const bans: [string[], string[]] = d ? (flip ? [bansOf(d, 1), bansOf(d, 0)] : [bansOf(d, 0), bansOf(d, 1)]) : [[], []];
  return {
    seeds: [standingLabel(state, comp, teams[0]), standingLabel(state, comp, teams[1])],
    need: bestOf > 1 ? Math.ceil(bestOf / 2) : 0,
    wins: [games.filter((g) => g.winner === teams[0].id).length, games.filter((g) => g.winner === teams[1].id).length],
    bans: [bans[0].filter(Boolean), bans[1].filter(Boolean)],
    mark: eventMark(state, comp),
  };
}

// ------------------------------------------------------------------ icons (20×20, currentColor)
const Ico = ({ d, children, className = 'bh-ico', color }: { d?: string; children?: ReactNode; className?: string; color?: string }) => (
  <svg viewBox="0 0 20 20" className={className} style={color ? { color } : undefined} fill="currentColor" aria-hidden>{d ? <path d={d} /> : children}</svg>
);
const TowerIco = () => <Ico d="M5 2h2.2v2H9V2h2v2h1.8V2H15v4.2l-1.6 1.6V16H15v2H5v-2h1.6V7.8L5 6.2z" />;
const GoldIco = () => <Ico><circle cx="10" cy="10" r="6.8" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M10 6.2l3.6 3.8-3.6 3.8-3.6-3.8z" /></Ico>;
const SwordsIco = () => (
  <Ico className="bh-ico bh-sw">
    <path d="M17 3l-1.2 3.6-7.6 7.6-2.4-2.4 7.6-7.6zM4.6 10.8l1.2-1.2 4.6 4.6-1.2 1.2zM5.2 13.4l1.4 1.4-2.6 2.6-1.4-1.4z" />
    <path d="M3 3l1.2 3.6 7.6 7.6 2.4-2.4-7.6-7.6zM15.4 10.8l-1.2-1.2-4.6 4.6 1.2 1.2zM14.8 13.4l-1.4 1.4 2.6 2.6 1.4-1.4z" />
  </Ico>
);
const DrakeIco = ({ color }: { color?: string }) => <Ico color={color} d="M10 2.5l2.1 3.6 4.1-1.4-1.4 4 2.7 2.2-3.6 1-1.4 5.1H7.5L6.1 11.9l-3.6-1L5.2 8.7l-1.4-4 4.1 1.4z" />;
const GrubIco = () => <Ico><path d="M3.5 12.2a6.5 5.6 0 0 1 13 0v.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2z" /><path d="M6 15l-1.2 2.4M10 15v2.8M14 15l1.2 2.4" stroke="currentColor" strokeWidth="1.5" /><circle cx="7.8" cy="10.6" r="1.15" fill="#0b0f19" /><circle cx="12.2" cy="10.6" r="1.15" fill="#0b0f19" /></Ico>;
const HeraldIco = () => <Ico><path d="M1.8 10C4.3 5.9 6.9 4 10 4s5.7 1.9 8.2 6c-2.5 4.1-5.1 6-8.2 6s-5.7-1.9-8.2-6z" /><circle cx="10" cy="10" r="2.7" fill="#0b0f19" /></Ico>;
const BaronIco = () => <Ico><path d="M10 2c3.9 0 7 2.9 7 6.6 0 2.5-1.4 4.3-3.3 5.3L13 18l-3-1.8L7 18l-.7-4.1C4.4 12.9 3 11.1 3 8.6 3 4.9 6.1 2 10 2z" /><circle cx="7.4" cy="8.4" r="1.3" fill="#0b0f19" /><circle cx="12.6" cy="8.4" r="1.3" fill="#0b0f19" /></Ico>;

const CSS = `
.bh{position:absolute;top:0;left:0;right:0;display:flex;justify-content:center;pointer-events:none;user-select:none;font-family:Rajdhani,Inter,sans-serif;color:#f8fafc;line-height:1;font-variant-numeric:tabular-nums}
.bh-grid{display:grid;grid-template-columns:1fr auto 1fr;grid-template-rows:${ROW1}em ${ROW2}em;filter:drop-shadow(0 .12em .3em rgba(0,0,0,.6))}
.bh-s{display:flex;align-items:center;position:relative;white-space:nowrap;min-width:0}
.bh-s.l{justify-content:flex-end}
.bh-s.r{flex-direction:row-reverse;justify-content:flex-end}
.bh-r1{gap:.62em;overflow:hidden}
.bh-r1.l{background:linear-gradient(90deg,rgba(6,13,32,.93),#0e2a60 52%,#1c4fc2);clip-path:polygon(0 0,100% 0,100% 100%,.9em 100%);padding:0 .6em 0 1.25em;box-shadow:inset 0 .12em 0 #60a5fa}
.bh-r1.r{background:linear-gradient(270deg,rgba(34,9,7,.93),#6e1c13 52%,#c2410c);clip-path:polygon(0 0,100% 0,calc(100% - .9em) 100%,0 100%);padding:0 1.25em 0 .6em;box-shadow:inset 0 .12em 0 #fbbf24}
.bh-c1{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b1220,#05080f);box-shadow:inset 0 .12em 0 #c8aa6e;padding:0 .3em}
.bh-r2{gap:.42em;background:rgba(4,8,18,.88)}
.bh-r2.l{clip-path:polygon(.9em 0,100% 0,100% 100%,1.7em 100%);padding:0 .5em 0 1.95em}
.bh-r2.r{clip-path:polygon(0 0,calc(100% - .9em) 0,calc(100% - 1.7em) 100%,0 100%);padding:0 1.95em 0 .5em}
.bh-c2{display:flex;align-items:center;justify-content:center;position:relative;background:#0b1220;box-shadow:inset 0 -.1em 0 #c8aa6e}
.bh-time{font-size:1.08em;font-weight:700;letter-spacing:.04em}
.bh-kills{font-size:1.85em;font-weight:700;min-width:1.15em;text-align:center;display:inline-block}
.bh-name{font-size:1.2em;font-weight:700;letter-spacing:.03em}
.bh-seed{font-size:.62em;font-weight:700;color:#dbe4f3;opacity:.82;margin-top:.14em;letter-spacing:.06em}
.bh-team{display:flex;flex-direction:column;justify-content:center}
.bh-s.r .bh-team{align-items:flex-end}
.bh-stat{display:flex;align-items:center;gap:.22em;font-weight:700;font-size:1.02em}
.bh-s.r .bh-stat{flex-direction:row-reverse}
.bh-ico{width:1em;height:1em;flex:none}
.bh-r1 .bh-ico{opacity:.9}
.bh-sw{width:.9em;height:.9em;opacity:.6!important}
.bh-sep{width:.07em;align-self:stretch;margin:.55em 0;background:rgba(255,255,255,.18)}
.bh-pips{display:flex;flex-direction:column;gap:.14em}
.bh-pip{width:.38em;height:.48em;border:.08em solid rgba(240,230,210,.65);transform:skewX(-12deg)}
.bh-pip.on{background:#f0c674;border-color:#f0c674;box-shadow:0 0 .3em #f0c674aa}
.bh-ban{width:1.2em;height:1.2em;border-radius:.15em;background:#0a1120;box-shadow:inset 0 0 0 .06em #1e2a44;overflow:hidden;flex:none}
.bh-ban img{width:100%!important;height:100%!important;border-radius:0;filter:grayscale(1) brightness(.78) contrast(1.05)!important}
.bh-bans{display:flex;gap:.12em}
.bh-s.r .bh-bans{flex-direction:row-reverse}
.bh-obj{display:flex;align-items:center;gap:.18em;font-weight:700;font-size:.92em;color:#e2e8f0}
.bh-s.r .bh-obj{flex-direction:row-reverse}
.bh-obj .bh-ico{width:1.05em;height:1.05em}
.bh-drakes{display:flex;gap:.06em}
.bh-drakes .bh-ico{width:.95em;height:.95em}
.bh-soul{font-size:.62em;font-weight:800;letter-spacing:.08em;padding:.1em .3em;border-radius:.2em;border:.1em solid currentColor}
.bh-buff{display:flex;align-items:center;gap:.22em;padding:.1em .32em;border-radius:.22em;font-weight:700;font-size:.86em;position:relative;overflow:hidden}
.bh-buff>i{position:absolute;left:0;bottom:0;height:.14em;background:currentColor;opacity:.85}
.bh-tab{position:absolute;top:100%;left:50%;transform:translateX(-50%);font-size:.66em;font-weight:700;padding:.18em .55em .22em;background:rgba(4,8,18,.88);border-radius:0 0 .35em .35em;white-space:nowrap}
.bh-pop{animation:bh-pop .75s ease-out}
@keyframes bh-pop{0%{transform:scale(1.6);color:#fde68a;text-shadow:0 0 .45em #fde68a}100%{transform:scale(1);text-shadow:none}}
.bh-flash{position:absolute;inset:0;pointer-events:none;animation:bh-flash 1s ease-out forwards}
@keyframes bh-flash{0%{opacity:.8}100%{opacity:0}}
.bh-toggle{position:absolute;right:.3em;pointer-events:auto;display:flex;align-items:center;gap:.25em;font:700 max(9px,.72em)/1 Rajdhani,Inter,sans-serif;letter-spacing:.06em;color:#cbd5e1;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.25);border-radius:.4em;padding:.25em .4em;opacity:.55;cursor:pointer;transition:opacity .15s}
.bh-toggle:hover{opacity:1;border-color:#c8aa6e}
`;

export default function BroadcastHud({ sim, teams, size, visible, onToggle }: { sim: MatchSim; teams: [Team, Team]; size: number; visible: boolean; onToggle: () => void }) {
  const info = useMemo(() => hudStatic(teams), [teams[0].id, teams[1].id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fs = hudFont(size);
  const compact = size < 560;
  const tiny = size < 420; // smallest maps: drop the decorative separator / swords so the bar fits
  const toggle = (
    <button type="button" className="bh-toggle" style={{ fontSize: fs, top: visible ? `${ROW1 + ROW2 + 0.35}em` : '0.3em' }} title={visible ? 'Hide the broadcast scoreboard (H)' : 'Show the broadcast scoreboard (H)'} onClick={onToggle}>
      {visible ? '✕' : '▣ HUD'}
    </button>
  );
  if (!visible) return <><style>{CSS}</style>{toggle}</>;

  const gold: [number, number] = [0, 0];
  for (const c of sim.champs) gold[c.side] += c.goldEarned;
  const diff = gold[0] - gold[1];
  const t = sim.t;
  const logo = Math.round(fs * 1.75), ban = Math.round(fs * 1.2);

  const side = (s: 0 | 1) => {
    const tm = sim.teams[s];
    const cls = s === 0 ? 'l' : 'r';
    const flashCol = s === 0 ? 'radial-gradient(ellipse at 85% 50%, #93c5fd, transparent 70%)' : 'radial-gradient(ellipse at 15% 50%, #fdba74, transparent 70%)';
    const buffs = [
      tm.baronUntil > t && { k: 'baron', col: '#c084fc', left: tm.baronUntil - t, tot: T.baronBuff, ico: <BaronIco />, label: 'Baron' },
      tm.elderUntil > t && { k: 'elder', col: DRAGON_COLOR.elder, left: tm.elderUntil - t, tot: T.elderBuff, ico: <DrakeIco />, label: 'Elder' },
    ].filter(Boolean) as { k: string; col: string; left: number; tot: number; ico: ReactNode; label: string }[];
    return [
      <div key={`r1${s}`} className={`bh-s bh-r1 ${cls}`} style={{ gridColumn: s === 0 ? 1 : 3, gridRow: 1 }}>
        {tm.kills > 0 && <span key={`f${tm.kills}`} className="bh-flash" style={{ background: flashCol }} />}
        {info.need > 0 && (
          <span className="bh-pips" title={`${info.wins[s]} game${info.wins[s] === 1 ? '' : 's'} won`}>
            {Array.from({ length: info.need }).map((_, i) => <span key={i} className={`bh-pip ${i < info.wins[s] ? 'on' : ''}`} />)}
          </span>
        )}
        <TeamLogo team={teams[s]} size={logo} />
        <span className="bh-team">
          <span className="bh-name">{teams[s].short}</span>
          {!compact && <span className="bh-seed">{info.seeds[s]}</span>}
        </span>
        {!tiny && <span className="bh-sep" />}
        <span className="bh-stat" title="Towers destroyed"><TowerIco /><span key={tm.towers} className={tm.towers ? 'bh-pop' : ''}>{tm.towers}</span></span>
        <span className="bh-stat" title="Team gold" style={{ color: '#fde68a' }}><GoldIco /><span>{fmtGold(gold[s])}</span></span>
        <span key={tm.kills} className={`bh-kills ${tm.kills ? 'bh-pop' : ''}`}>{tm.kills}</span>
        {!tiny && <SwordsIco />}
      </div>,
      <div key={`r2${s}`} className={`bh-s bh-r2 ${cls}`} style={{ gridColumn: s === 0 ? 1 : 3, gridRow: 2 }}>
        {!compact && (
          <span className="bh-bans">
            {Array.from({ length: 5 }).map((_, i) => <span key={i} className="bh-ban">{info.bans[s][i] && <ChampIcon id={info.bans[s][i]} size={ban} grey />}</span>)}
          </span>
        )}
        <span className="bh-obj" title="Voidgrubs"><GrubIco /><span key={tm.grubs} className={tm.grubs ? 'bh-pop' : ''}>{tm.grubs}</span></span>
        {tm.heralds > 0 && !compact && <span className="bh-obj" title="Rift Herald"><HeraldIco /><span>{tm.heralds}</span></span>}
        <span className="bh-obj" title="Dragons"><DrakeIco /><span key={tm.dragons.length} className={tm.dragons.length ? 'bh-pop' : ''}>{tm.dragons.length}</span></span>
        {/* the drakes taken (by element); once a team has the soul, the soul tag stands in for them */}
        {tm.dragons.length > 0 && !tm.soul && (
          <span className="bh-drakes">
            {tm.dragons.map((d: DragonType, i) => <span key={i} title={`${DRAGON_LABEL[d]} Drake`}><DrakeIco color={DRAGON_COLOR[d]} /></span>)}
          </span>
        )}
        {tm.soul && <span className="bh-soul" style={{ color: DRAGON_COLOR[tm.soul] }} title={`${DRAGON_LABEL[tm.soul]} Soul`}>{compact ? 'SOUL' : `${DRAGON_LABEL[tm.soul].toUpperCase()} SOUL`}</span>}
        {tm.elders > 0 && <span className="bh-obj" title="Elder Dragons" style={{ color: DRAGON_COLOR.elder }}><DrakeIco /><span>{tm.elders}</span></span>}
        {tm.barons > 0 && <span className="bh-obj" title="Barons" style={{ color: '#c084fc' }}><BaronIco /><span key={tm.barons} className="bh-pop">{tm.barons}</span></span>}
        {buffs.map((b) => (
          <span key={b.k} className="bh-buff" style={{ color: b.col, background: `${b.col}2b`, boxShadow: `inset 0 0 0 .08em ${b.col}88` }} title={`${b.label} buff`}>
            {b.ico}<span style={{ color: '#f8fafc' }}>{mmss(b.left)}</span>
            <i style={{ width: `${Math.max(0, Math.min(1, b.left / b.tot)) * 100}%` }} />
          </span>
        ))}
      </div>,
    ];
  };

  const markFont = info.mark.text.length > 4 ? 8.5 : info.mark.text.length > 3 ? 10.5 : 12.5;
  return (
    <>
      <style>{CSS}</style>
      <div className="bh" style={{ fontSize: fs }} aria-label="Broadcast scoreboard">
        <div className="bh-grid">
          {side(0)}
          <div className="bh-c1" style={{ gridColumn: 2, gridRow: 1 }} title={info.mark.title}>
            <svg viewBox="0 0 52 40" style={{ width: '2.5em', height: '1.95em' }} aria-label={info.mark.title}>
              <path d="M13 2h26l11 18-11 18H13L2 20z" fill="#0a1020" stroke={info.mark.color} strokeWidth="2.4" />
              <path d="M15.5 6h21l8.6 14-8.6 14h-21L6.9 20z" fill="none" stroke={info.mark.color} strokeOpacity=".35" strokeWidth="1" />
              <text x="26" y={20 + markFont * 0.36} textAnchor="middle" fontSize={markFont} fontWeight="800" fill="#f0e6d2" fontFamily="Rajdhani, Inter, sans-serif" letterSpacing=".5">{info.mark.text}</text>
            </svg>
          </div>
          {side(1)}
          <div className="bh-c2" style={{ gridColumn: 2, gridRow: 2 }}>
            <span className="bh-time">{mmss(t)}</span>
            {Math.abs(diff) >= 100 && (
              <span className="bh-tab" style={{ color: diff > 0 ? '#93c5fd' : '#fca5a5' }} title="Gold lead">
                {diff > 0 ? '◀ ' : ''}{fmtGold(Math.abs(diff))}{diff < 0 ? ' ▶' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      {toggle}
    </>
  );
}
