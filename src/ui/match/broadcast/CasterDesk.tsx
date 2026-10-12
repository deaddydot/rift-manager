// The caster desk's subtitle bar, directly under the match map: who is talking (avatar initials, name), the current
// line with a short typewriter reveal, the previous line dimmed above it, and the English gloss under Vietnamese lines.
// The commentary engine runs on its own timer; this component re-renders only when a new line starts and writes the
// typewriter straight to the DOM (no canvas work, nothing per frame once the line is out).
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MatchSim } from '../../../engine/sim/engine';
import type { Team } from '../../../engine/types';
import { useStore } from '../../../store/game';
import { useSession } from '../session';
import { getChatMeta } from '../chatFeed';
import { buildBroadcastCtx } from './context';
import { Commentary, pickDesk, type SubLine } from './commentary';
import { CASTERS, type DeskDef } from './castersData';
import { useCasterPrefs, subtitleHeight } from './prefs';

interface Props { sim: MatchSim; teams: [Team, Team]; userSide: 0 | 1; width: number; compact?: boolean }

function CasterDesk({ sim, teams, userSide, width, compact = false }: Props) {
  const mode = useCasterPrefs((x) => x.mode);
  const hidden = useCasterPrefs((x) => x.hidden);
  const gloss = useCasterPrefs((x) => x.gloss);
  const setHidden = useCasterPrefs((x) => x.setHidden);
  const setGloss = useCasterPrefs((x) => x.setGloss);
  const [desk, setDesk] = useState<DeskDef | null>(null);
  const [cur, setCur] = useState<SubLine | null>(null);
  const [prev, setPrev] = useState<SubLine | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const teamsRef = useRef(teams); teamsRef.current = teams;

  // the engine lives as long as this game's viewer (a desk change in Settings starts a new one, without the intro)
  useEffect(() => {
    if (mode === 'off') { setDesk(null); return; }
    const state = useStore.getState().state;
    const sess = useSession.getState().s;
    let eng: Commentary;
    try {
      const bc = buildBroadcastCtx(state, sess ? { fixtureId: sess.fixtureId, gameNo: sess.gameNo, series: sess.series, draft: sess.draft } : null, sim, teamsRef.current, userSide);
      const d = pickDesk(bc, mode);
      eng = new Commentary(sim, bc, d);
      if (sim.t > 90) eng.skipIntro();
      eng.viewers = () => getChatMeta().viewers;
      setDesk(d);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('caster desk unavailable', e);
      return;
    }
    if (import.meta.env.DEV) (window as unknown as { __casters?: Commentary }).__casters = eng; // dev-only: inspect from the console
    setCur(null); setPrev(null);
    const id = window.setInterval(() => {
      const l = eng.tick(performance.now());
      if (l) { setPrev(eng.previous); setCur(l); }
    }, 160);
    return () => window.clearInterval(id);
  }, [sim, mode, userSide]);

  // typewriter: reveal the line over ~0.3–0.9 s, written straight into the span
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !cur) return;
    const text = cur.text;
    if (typeof document !== 'undefined' && document.hidden) { el.textContent = text; return; }
    const total = Math.min(900, Math.max(280, text.length * 13));
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / total);
      el.textContent = text.slice(0, Math.ceil(text.length * k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    el.textContent = '';
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); el.textContent = text; };
  }, [cur]);

  if (mode === 'off') return null;
  const h = subtitleHeight(mode, hidden, compact);
  const label = desk ? (desk.pbp === desk.colour ? CASTERS[desk.pbp].name : `${CASTERS[desk.pbp].name} & ${CASTERS[desk.colour].name}`) : '…';
  const vi = !!desk && (CASTERS[desk.pbp].lang === 'vi' || CASTERS[desk.colour].lang === 'vi');
  const btn = 'text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 border border-line hover:border-gold hover:text-gold2 transition-colors';

  if (hidden) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-2 text-[11px] text-dim rounded-md bg-[#0b1324] ring-1 ring-line" style={{ width, height: h - 4, marginTop: 4 }}>
        <span aria-hidden>🎙</span>
        <span className="truncate">Casters: <span className="text-muted font-semibold">{label}</span></span>
        <button className={`${btn} ml-auto text-muted`} onClick={() => setHidden(false)} title="Show the caster subtitles">Show subtitles</button>
      </div>
    );
  }
  const c = cur ? CASTERS[cur.caster] : desk ? CASTERS[desk.pbp] : null;
  const fs = compact ? 'text-[12.5px]' : 'text-[13.5px]';
  return (
    <div className="shrink-0 rounded-md bg-gradient-to-b from-[#0d1628] to-[#0a1120] ring-1 ring-line overflow-hidden flex flex-col" style={{ width, height: h - 4, marginTop: 4 }}>
      <div className="flex items-center gap-2 px-2 pt-1 text-[10px] uppercase tracking-wider text-dim leading-none">
        <span aria-hidden>🎙</span>
        <span className="truncate">Casters · <span className="text-muted font-semibold normal-case tracking-normal">{label}</span></span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {vi && <button className={`${btn} ${gloss ? 'text-gold2 border-gold/50' : 'text-dim'}`} onClick={() => setGloss(!gloss)} title="English translation under Vietnamese lines">EN</button>}
          <button className={`${btn} text-dim`} onClick={() => setHidden(true)} title="Hide the caster subtitles">Hide</button>
        </span>
      </div>
      <div className="flex-1 min-h-0 flex gap-2 px-2 pb-1 pt-1">
        {c && (
          <div className="shrink-0 flex flex-col items-center pt-0.5 w-9">
            <div key={cur?.id ?? 0} className="relative w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[12px] fadein" style={{ background: `${c.color}26`, color: c.color, boxShadow: `inset 0 0 0 1.5px ${c.color}99` }} title={`${c.name} — ${c.style}`}>
              {c.initials}
              {cur && <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full animate-pulse" style={{ background: c.color }} />}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-end">
          {prev && <div className="truncate text-[10.5px] leading-tight text-dim opacity-70"><span className="font-semibold">{prev.name}:</span> {prev.text}</div>}
          {cur ? (
            <div className={`${fs} leading-snug text-[#e8edf7] line-clamp-2`}>
              <span className="font-bold mr-1" style={{ color: c?.color }}>{cur.name}</span>
              <span ref={textRef} />
            </div>
          ) : (
            <div className={`${fs} leading-snug text-dim italic`}>The casters are getting ready…</div>
          )}
          {cur?.gloss && gloss ? <div key={cur.id} className="truncate text-[10.5px] leading-tight italic text-muted fadein">{cur.gloss}</div> : <div className="h-[13px]" />}
        </div>
      </div>
      <div className="sr-only" aria-live="polite">{cur ? `${cur.name}: ${cur.text}` : ''}</div>
    </div>
  );
}

export default memo(CasterDesk, (a, b) => a.sim === b.sim && a.userSide === b.userSide && a.width === b.width && a.compact === b.compact && a.teams[0].id === b.teams[0].id && a.teams[1].id === b.teams[1].id);
