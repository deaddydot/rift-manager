import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MatchSim } from '../../engine/sim/engine';
import { MAP_SIZE, type Vec } from '../../engine/sim/map';
import { renderMatch, TEAM_COLORS, ICON_GROWTH } from './renderer';
import { Camera, minimapAlpha, minimapRect, ppu, screenToWorld, type CamMode } from './camera';
import { ChampIcon, ItemIcon, TeamLogo, mmss, Sparkline } from '../components/kit';
import { DRAGON_COLOR } from '../../engine/sim/constants';
import type { Team } from '../../engine/types';
import type { GameEvent } from '../../engine/sim/simtypes';
import { gd } from '../../data/gamedata';
import { useStore } from '../../store/game';
import DebugLog from './DebugLog';
import LiveChat from './LiveChat';
import CasterDesk from './broadcast/CasterDesk';
import { useCasterPrefs, subtitleHeight } from './broadcast/prefs';
import { displayItems } from '../../engine/sim/champstats';
import BroadcastHud, { hudHeight } from './BroadcastHud';

const SPEEDS = [1, 2, 4, 8, 16, 32, 64];
const ZOOM_STEP = 1.4;
// viewer preferences (localStorage may be unavailable: private mode, blocked storage)
const PREF_THEATER = 'rm.match.theater';
const PREF_FIGHTCAM = 'rm.match.fightCam';
const PREF_CHAT = 'rm.match.chatCollapsed';
const PREF_HUD = 'rm.match.hud'; // broadcast scoreboard over the map ('0' = hidden)
// layout: team cards flank the map (min/max column width); the chat is a Twitch-style column on the right
const SIDE_MIN = 160, SIDE_MAX = 270, GAP = 8;
const CHAT_W = 'clamp(272px, 22vw, 340px)', CHAT_RAIL = '40px';
const STACK_BELOW = 900; // narrower than this (root width): the chat goes under the stream
const readLS = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

export default function LiveMatch({ sim, teams, userSide, onFinished }: { sim: MatchSim; teams: [Team, Team]; userSide: 0 | 1; onFinished: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const setCanvas = useCallback((el: HTMLCanvasElement | null) => { canvasRef.current = el; setCanvasEl(el); }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);     // [blue cards | map | red cards]
  const streamRef = useRef<HTMLDivElement>(null);  // everything left of the chat
  const chatCellRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState(8);
  const [paused, setPaused] = useState(false);
  const [, setTick] = useState(0);
  const [size, setSize] = useState(720);
  // Settings → "Fog of war in match viewer" starts the viewer on our team's vision
  const [fog, setFog] = useState<0 | 1 | null>(() => (useStore.getState().state?.settings.showFog ? userSide : null));
  const [selected, setSelected] = useState<number | null>(null);
  const [shout, setShout] = useState<string | null>(null);
  const [theater, setTheaterState] = useState(() => readLS(PREF_THEATER) === '1');
  const [fs, setFs] = useState(false);
  const big = theater || fs;
  const [chatCollapsed, setChatCollapsed] = useState(() => readLS(PREF_CHAT) === '1');
  // caster subtitles under the map take their height out of the map's square
  const casterMode = useCasterPrefs((x) => x.mode);
  const casterHidden = useCasterPrefs((x) => x.hidden);
  const subH = subtitleHeight(casterMode, casterHidden, big);
  const toggleChat = useCallback(() => setChatCollapsed((c) => { writeLS(PREF_CHAT, c ? '0' : '1'); return !c; }), []);
  // broadcast scoreboard over the top of the map (replaces the score panels above it while shown)
  const [hud, setHud] = useState(() => readLS(PREF_HUD) !== '0');
  const toggleHud = useCallback(() => setHud((h) => { writeLS(PREF_HUD, h ? '0' : '1'); return !h; }), []);
  const [stack, setStack] = useState(false);     // narrow window: chat under the stream
  const [roomy, setRoomy] = useState(false);     // page layout with room for the full player cards
  const [chatH, setChatH] = useState(560);       // page layout: chat column height (sticky, fits the viewport)
  const [streamW, setStreamW] = useState(860);
  const camRef = useRef<Camera | null>(null);
  if (!camRef.current) { camRef.current = new Camera(); if (readLS(PREF_FIGHTCAM) === '1') camRef.current.setMode('fight', false); }
  const cam = camRef.current;
  const [camMode, setCamModeState] = useState<CamMode>(cam.mode);
  cam.onMode = setCamModeState; // the camera hands control back itself (e.g. a drag ends the fight cam)

  const speedRef = useRef(speed); speedRef.current = speed;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const fogRef = useRef(fog); fogRef.current = fog;
  const selRef = useRef(selected); selRef.current = selected;
  const sizeRef = useRef(size); sizeRef.current = size;
  const bigRef = useRef(big); bigRef.current = big;
  const prevRef = useRef(new Map<number, Vec>());
  const simTimeRef = useRef(sim.t);

  // ---- layout: the biggest map square that fits between the team columns (normal: also the window height;
  // theater: the stage height), whether the chat column fits beside the stream, and the chat's height
  useEffect(() => {
    const row = rowRef.current, root = rootRef.current;
    if (!row || !root) return;
    const measure = () => {
      setStack(!big && root.clientWidth < STACK_BELOW);
      const W = row.clientWidth;
      const availW = W - 2 * SIDE_MIN - 2 * GAP;
      // page layout: the score panel above the map is hidden while the broadcast HUD is on
      const availH = big ? row.clientHeight - subH : Math.min(window.innerHeight - (hud ? 250 : 340) - subH * 0.6, 900);
      const s = Math.max(big ? 260 : 320, Math.floor(Math.min(availW, availH)));
      setSize(s);
      setRoomy(!big && (W - s) / 2 - GAP >= 228);
      setStreamW(W);
      if (!big) {
        // the page scrolls inside <main>: size the (sticky) chat to the visible area below its top, never taller
        // than the stream column itself
        const cell = chatCellRef.current, main = root.closest('main'), stream = streamRef.current;
        if (cell && main && stream) {
          const top = cell.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
          const h = Math.min(stream.offsetHeight, main.clientHeight - Math.min(Math.max(0, top), 160) - 14);
          setChatH(Math.max(380, Math.floor(h)));
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(root);
    if (streamRef.current) ro.observe(streamRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [big, chatCollapsed, subH, hud]);

  // ---- main loop: step the sim, move the camera, draw (camera lives in a ref: no React renders per frame)
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim?: MatchSim; __cam?: Camera }).__sim = sim; // dev-only: inspect the live sim from the console
    if (import.meta.env.DEV) (window as unknown as { __cam?: Camera }).__cam = camRef.current!;
    let raf = 0, last = performance.now(), uiTick = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && sim.winner === null) {
        simTimeRef.current += dt * speedRef.current;
        let guard = 0;
        while (sim.t < simTimeRef.current && sim.winner === null && guard++ < 1200) {
          for (const c of sim.champs) prevRef.current.set(c.idx, { x: c.pos.x, y: c.pos.y });
          sim.step();
        }
      }
      const alpha = Math.max(0, Math.min(1, 1 - (sim.t - simTimeRef.current) / sim.dt));
      const cam = camRef.current!;
      const cv = canvasRef.current;
      if (cv) {
        // keep the backing store at CSS size × devicePixelRatio (handles resizes and moving between screens)
        const dpr = window.devicePixelRatio || 1;
        const css = sizeRef.current, px = Math.round(css * dpr);
        if (cv.width !== px || cv.height !== px) { cv.width = px; cv.height = px; }
        if (cv.style.width !== `${css}px`) { cv.style.width = `${css}px`; cv.style.height = `${css}px`; }
        const S = px / dpr;
        cam.update(Math.min(dt, 0.25), sim, { S, speed: speedRef.current, selected: selRef.current, prev: prevRef.current, alpha, nowReal: now / 1000, fog: fogRef.current });
        const ctx = cv.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderMatch(ctx, sim, { size: S, prev: prevRef.current, alpha, fog: fogRef.current, selected: selRef.current, showWards: true, view: cam.cur, minimap: true });
        paintIndicator(indRef.current, cam);
      }
      if (now - uiTick > 250) { uiTick = now; setTick((x) => x + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  // ---- canvas input: wheel / pinch zoom at the cursor, drag to pan, click to select, minimap, double-click reset
  useEffect(() => {
    const cv = canvasEl;
    if (!cv) return;
    const cam = camRef.current!;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect(), S = sizeRef.current;
      return { x: ((e.clientX - r.left) / r.width) * S, y: ((e.clientY - r.top) / r.height) * S, S };
    };
    const inMini = (x: number, y: number, S: number) => {
      if (minimapAlpha(cam.cur.zoom) < 0.5) return false;
      const m = minimapRect(S);
      return x >= m.x - 3 && x <= m.x + m.w + 3 && y >= m.y - 3 && y <= m.y + m.w + 3;
    };
    const miniWorld = (x: number, y: number, S: number): Vec => {
      const m = minimapRect(S);
      return { x: clamp((x - m.x) / m.w, 0, 1) * MAP_SIZE, y: (1 - clamp((y - m.y) / m.w, 0, 1)) * MAP_SIZE };
    };
    const hoverCursor = (x: number, y: number, S: number) => {
      cv.style.cursor = inMini(x, y, S) ? 'pointer' : cam.cur.zoom > 1.01 ? 'grab' : 'crosshair';
    };
    const selectAt = (x: number, y: number, S: number) => {
      const w = screenToWorld(cam.cur, x, y, S);
      const iconR = 13 * (S / 760) * cam.cur.zoom ** ICON_GROWTH; // champion icon radius on screen (see renderer)
      const reach = Math.max(24, iconR * 2) / ppu(S, cam.cur.zoom);
      let best: number | null = null, bd = reach;
      for (const c of sim.champs) {
        if (c.dead) continue;
        const f = fogRef.current;
        if (f !== null && c.side !== f && !sim.teams[f].visible.has(c.idx)) continue; // can't click what you can't see
        const d = Math.hypot(c.pos.x - w.x, c.pos.y - w.y);
        if (d < bd) { bd = d; best = c.idx; }
      }
      setSelected(best);
    };

    const pts = new Map<number, { x: number; y: number }>();
    let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; mini: boolean } | null = null;
    let pinch: { d: number; mx: number; my: number } | null = null;
    let gesture = false, gScale = 1;
    const pinchState = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = local(e);
      pts.set(e.pointerId, { x: p.x, y: p.y });
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pts.size === 2) { pinch = pinchState(); drag = null; return; }
      if (pts.size > 2) return;
      const mini = inMini(p.x, p.y, p.S);
      drag = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, mini };
      if (mini) cam.centerOn(miniWorld(p.x, p.y, p.S), false);
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) { hoverCursor(p.x, p.y, p.S); return; }
      pts.set(e.pointerId, { x: p.x, y: p.y });
      if (pts.size === 2 && pinch) {
        const n = pinchState();
        cam.zoomBy(n.d / pinch.d, p.S, n.mx, n.my);
        if (cam.mode === 'manual') cam.panBy(n.mx - pinch.mx, n.my - pinch.my, p.S);
        pinch = n;
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      if (drag.mini) { cam.centerOn(miniWorld(p.x, p.y, p.S), true); return; }
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 5) return;
      drag.moved = true;
      if (cam.cur.zoom > 1.01) { cam.panBy(p.x - drag.x, p.y - drag.y, p.S); cv.style.cursor = 'grabbing'; }
      drag.x = p.x; drag.y = p.y;
    };
    const up = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (had && drag && drag.id === e.pointerId) {
        const p = local(e);
        if (!drag.moved && !drag.mini) selectAt(p.x, p.y, p.S);
        hoverCursor(p.x, p.y, p.S);
        drag = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      const p = local(e);
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // sideways trackpad scroll pans a zoomed map
        if (cam.cur.zoom > 1.01) { e.preventDefault(); cam.panBy(-e.deltaX, 0, p.S); }
        return;
      }
      if (e.ctrlKey && gesture) { e.preventDefault(); return; } // Safari pinch comes through gesture events
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      // in the page layout, scrolling down over the full map scrolls the page instead of trying to zoom out
      if (!bigRef.current && !e.ctrlKey && dy > 0 && cam.cur.zoom <= 1.001 && cam.tgt.zoom <= 1.001) return;
      e.preventDefault();
      cam.zoomBy(clamp(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), 0.5, 2), p.S, p.x, p.y);
    };
    const gStart = (e: Event) => { e.preventDefault(); gesture = true; gScale = 1; };
    const gChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const p = local(g);
      cam.zoomBy(g.scale / gScale, p.S, p.x, p.y);
      gScale = g.scale;
    };
    const gEnd = (e: Event) => { e.preventDefault(); gesture = false; };
    const dbl = (e: MouseEvent) => {
      const p = local(e);
      if (!inMini(p.x, p.y, p.S)) cam.fit();
    };
    const leave = () => { if (!drag) cv.style.cursor = ''; };
    const opts: AddEventListenerOptions = { passive: false };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', leave);
    cv.addEventListener('wheel', wheel, opts);
    cv.addEventListener('dblclick', dbl);
    cv.addEventListener('gesturestart', gStart, opts);
    cv.addEventListener('gesturechange', gChange, opts);
    cv.addEventListener('gestureend', gEnd, opts);
    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('pointerleave', leave);
      cv.removeEventListener('wheel', wheel);
      cv.removeEventListener('dblclick', dbl);
      cv.removeEventListener('gesturestart', gStart);
      cv.removeEventListener('gesturechange', gChange);
      cv.removeEventListener('gestureend', gEnd);
    };
  }, [canvasEl, sim]);

  // ---- camera modes, theater, fullscreen
  const setMode = (m: CamMode) => { cam.setMode(m, false); setCamModeState(m); };
  const toggleFight = () => {
    const on = cam.mode !== 'fight';
    if (on) setMode('fight'); else { setMode('manual'); cam.fit(); }
    writeLS(PREF_FIGHTCAM, on ? '1' : '0');
  };
  const toggleFollow = () => {
    if (cam.mode === 'follow') { setMode('manual'); cam.fit(); }
    else if (selRef.current !== null) setMode('follow');
  };
  const setTheater = (v: boolean) => { setTheaterState(v); writeLS(PREF_THEATER, v ? '1' : '0'); };
  const exitFullscreen = () => {
    const d = document as FsDoc;
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  };
  const toggleFullscreen = () => {
    if (fsElement()) { exitFullscreen(); return; }
    const el = rootRef.current as FsEl | null;
    if (!el) return;
    // no Fullscreen API (e.g. iPhone Safari) or the request is refused: theater mode is the next best thing
    try {
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => setTheater(true));
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else setTheater(true);
    } catch { setTheater(true); }
  };
  const toggleTheater = () => { if (fs) exitFullscreen(); else setTheater(!theater); };

  // The theater overlay is position:fixed inside the page; an ancestor mid-animation (the page's fade-in uses a
  // transform) would trap it in the content column, so finish those animations when theater mode turns on.
  useLayoutEffect(() => {
    if (!big) return;
    for (let el = rootRef.current?.parentElement; el; el = el.parentElement) el.getAnimations?.().forEach((a) => a.finish());
  }, [big]);

  useEffect(() => {
    const root = rootRef.current;
    const on = () => setFs(!!root && fsElement() === root);
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
      if (root && fsElement() === root) exitFullscreen();
    };
  }, []);

  // ---- keyboard shortcuts (re-bound every render so handlers see fresh state)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return;
      const S = sizeRef.current;
      const zoomed = cam.cur.zoom > 1.01;
      if (e.repeat && !/^(\+|=|-|_|Arrow)/.test(e.key)) return; // holding a toggle key shouldn't flicker it
      switch (e.key) {
        case 'z': case 'Z': toggleFight(); break;
        case 'c': case 'C': toggleFollow(); break;
        case 'h': case 'H': toggleHud(); break;
        case 'f': toggleTheater(); break;
        case 'F': toggleFullscreen(); break;
        case '+': case '=': cam.zoomBy(ZOOM_STEP, S); break;
        case '-': case '_': cam.zoomBy(1 / ZOOM_STEP, S); break;
        case '0': cam.fit(); break;
        case 'ArrowLeft': if (!zoomed) return; cam.nudge(-0.2, 0); break;
        case 'ArrowRight': if (!zoomed) return; cam.nudge(0.2, 0); break;
        case 'ArrowUp': if (!zoomed) return; cam.nudge(0, 0.2); break;
        case 'ArrowDown': if (!zoomed) return; cam.nudge(0, -0.2); break;
        case ' ':
          if (sim.winner !== null) return;
          if (el?.closest?.('button')) (el as HTMLElement).blur(); // don't also "click" the focused button
          setPaused((p) => !p);
          break;
        case 'Escape':
          if (fs || !theater) return; // the browser leaves fullscreen on its own
          setTheater(false);
          break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const skip = () => { while (sim.winner === null) sim.step(); simTimeRef.current = sim.t; setTick((x) => x + 1); };
  const tm = sim.teams;
  const gold = (s: 0 | 1) => sim.champs.filter((c) => c.side === s).reduce((a, c) => a + c.goldEarned, 0);
  const goldLead = gold(0) - gold(1);
  const events = sim.events.filter((e) => e.type !== 'plate' && (e.type !== 'info' || e.important || /face-checks|burns Flash|goes in alone|spots the opening|reads the map|backdoor/i.test(e.text))).slice(big ? -16 : -9).reverse();
  const myTeam = tm[userSide];

  const applyShout = (id: string) => {
    const tac = myTeam.input.tactics;
    if (id === 'aggressive') tac.aggression = Math.min(95, tac.aggression + 20);
    if (id === 'safe') tac.aggression = Math.max(5, tac.aggression - 20);
    if (id === 'objectives') tac.objectivePriority = sim.t > 1200 ? 'baron' : 'dragons';
    if (id === 'group') tac.playstyle = 'teamfight';
    if (id === 'split') tac.playstyle = 'splitpush';
    if (id === 'vision') tac.visionFocus = Math.min(95, tac.visionFocus + 25);
    setShout(id);
    setTimeout(() => setShout(null), 2500);
  };

  // ---- pieces shared by the page layout and theater mode
  const mapBox = (
    <div className="relative shrink-0 rounded-lg ring-1 ring-line" style={{ width: size, height: size }}>
      {/* no CSS border on the canvas itself: its box must be exactly `size` px for a crisp 1:1 backing store */}
      <canvas ref={setCanvas} className="block rounded-lg" style={{ touchAction: 'none' }} />
      <div ref={indRef} style={{ top: hud ? hudHeight(size) + 6 : 8 }} className="absolute left-2 hidden items-center gap-1.5 rounded-md border border-line bg-[#020617]/80 px-2 py-0.5 text-[11px] font-semibold text-gold2 pointer-events-none select-none">
        <span data-dot className="w-1.5 h-1.5 rounded-full" />
        <span data-text />
      </div>
      <BroadcastHud sim={sim} teams={teams} size={size} visible={hud} onToggle={toggleHud} />
      {sim.winner !== null && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg fadein">
          <TeamLogo team={teams[sim.winner]} size={90} />
          <div className="font-display text-4xl font-bold gold-text mt-3">{teams[sim.winner].name} win!</div>
          <div className="text-muted">{mmss(sim.t)} · {tm[0].kills}–{tm[1].kills}</div>
          <button className="btn btn-gold mt-5 px-6 py-2.5 text-base" onClick={onFinished}>Continue ▶</button>
        </div>
      )}
    </div>
  );
  const btnSm = 'py-1! px-2! text-xs!'; // compact controls (.btn is un-layered CSS: utilities need `!` to win)
  const playback = (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      <button className={`btn ${btnSm}`} title="Pause / play (Space)" onClick={() => setPaused(!paused)}>{big ? (paused ? '▶' : '❚❚') : paused ? '▶ Play' : '❚❚ Pause'}</button>
      <div className="flex gap-1">{SPEEDS.map((s) => <button key={s} className={`btn py-1! px-1.5! text-xs! ${speed === s ? 'btn-gold' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
      <button className={`btn ${btnSm}`} title="Skip to the result" onClick={skip} disabled={sim.winner !== null}>{big ? '⏭' : 'Skip to result ⏭'}</button>
      <select className="input py-1! text-xs!" title="Whose vision to show (fog of war)" value={fog === null ? 'all' : String(fog)} onChange={(e) => setFog(e.target.value === 'all' ? null : (Number(e.target.value) as 0 | 1))}>
        <option value="all">{big ? 'Spectator' : 'Spectator (full vision)'}</option><option value="0">{teams[0].short} vision</option><option value="1">{teams[1].short} vision</option>
      </select>
    </div>
  );
  const cameraBar = (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      <div className="flex gap-1">
        <button className={`btn ${btnSm}`} title="Zoom out (−)" onClick={() => cam.zoomBy(1 / ZOOM_STEP, size)}>−</button>
        <button className={`btn ${btnSm}`} title="Zoom in (+)" onClick={() => cam.zoomBy(ZOOM_STEP, size)}>+</button>
        <button className={`btn ${btnSm}`} title="Show the whole map (0 or double-click the map)" onClick={() => cam.fit()}>Fit</button>
      </div>
      <button className={`btn ${btnSm} ${camMode === 'fight' ? 'btn-gold' : ''}`} title="Fight cam: zooms in on fights, objective contests and dives, then back out (Z)" onClick={toggleFight}>🎥 Fight cam</button>
      <button className={`btn ${btnSm} ${camMode === 'follow' ? 'btn-gold' : ''}`} disabled={camMode !== 'follow' && selected === null}
        title={selected === null && camMode !== 'follow' ? 'Select a player (click them on the map or in the list) to follow them' : 'Follow the selected player (C)'} onClick={toggleFollow}>◎ Follow</button>
      {!fs && <button className={`btn ${btnSm}`} title="Fullscreen (Shift+F)" onClick={toggleFullscreen}>⛶ Full screen</button>}
      {fs
        ? <button className={`btn btn-gold ${btnSm}`} title="Leave fullscreen (Shift+F or Esc)" onClick={toggleFullscreen}>✕ Exit full screen</button>
        : <button className={`btn ${btnSm} ${big ? 'btn-gold' : ''}`} title={big ? 'Back to the normal layout (F or Esc)' : 'Theater mode: a much bigger map (F)'} onClick={toggleTheater}>{big ? '✕ Exit theater' : '⤢ Theater'}</button>}
    </div>
  );
  const hints = (
    <div className="text-[11px] text-dim flex flex-wrap gap-x-3 gap-y-1 justify-center">
      <span>Scroll / pinch to zoom · drag to pan · double-click to reset</span>
      <span><span className="kbd">Z</span> fight cam · <span className="kbd">C</span> follow · <span className="kbd">H</span> scoreboard · <span className="kbd">F</span> theater · <span className="kbd">⇧F</span> fullscreen · <span className="kbd">+</span> <span className="kbd">−</span> <span className="kbd">0</span> zoom · <span className="kbd">Space</span> pause</span>
    </div>
  );
  const goldPanel = (
    <div className="panel p-3">
      <div className="text-[11px] uppercase text-muted font-bold mb-1">Gold lead</div>
      <Sparkline data={[0, ...sim.goldDiff, goldLead]} width={big ? Math.max(140, Math.min(240, Math.floor((streamW - size) / 2) - 40)) : Math.max(180, Math.min(420, Math.floor((streamW - GAP) / 2.25) - 28))} height={big ? 44 : 56} zero color={goldLead >= 0 ? '#60a5fa' : '#f87171'} />
      <div className="text-[11px] mt-1"><span className="text-blue-400">{teams[0].short}: {tm[0].plan.label}</span></div>
      <div className="text-[11px]"><span className="text-red-400">{teams[1].short}: {tm[1].plan.label}</span></div>
    </div>
  );
  const shoutPanel = (
    <div className="panel p-3">
      <div className="text-[11px] uppercase text-muted font-bold mb-1.5">Shouts to your team {shout && <span className="text-gold2 normal-case">· called “{shout}”</span>}</div>
      <div className="flex flex-wrap gap-1.5">
        {[['aggressive', 'Play aggressive'], ['safe', 'Play safe'], ['objectives', 'Focus objectives'], ['group', 'Group up'], ['split', 'Split push'], ['vision', 'Vision control']].map(([id, label]) => (
          <button key={id} className={`btn text-xs ${big ? 'px-2! py-1! text-xs!' : ''}`} disabled={sim.winner !== null} onClick={() => applyShout(id)}>{label}</button>
        ))}
      </div>
      <div className="text-[11px] text-dim mt-2">Aggression now {Math.round(myTeam.aggression)} · {myTeam.input.tactics.playstyle} · {myTeam.input.tactics.objectivePriority}</div>
    </div>
  );

  // One tree for both layouts so the canvas, live chat and decision log keep their state when toggling:
  // [stream: scoreboard · (blue cards | map | red cards) · controls · play-by-play] [Twitch-style chat column]
  const chatOpen = stack || !chatCollapsed;
  const cols = stack ? 'minmax(0,1fr)' : `minmax(0,1fr) ${chatOpen ? CHAT_W : CHAT_RAIL}`;
  const flank = `minmax(${SIDE_MIN}px, ${SIDE_MAX}px) auto minmax(${SIDE_MIN}px, ${SIDE_MAX}px)`;
  return (
    <div ref={rootRef} className={big ? 'fixed inset-0 z-40 bg-bg overflow-y-auto overflow-x-hidden' : ''}>
      <div className={big ? 'h-dvh flex flex-col' : ''}>
        {big ? (
          <div className="shrink-0 flex items-center gap-x-4 gap-y-1.5 flex-wrap px-3 py-1.5 border-b border-line bg-panel">
            {!hud && <div className="flex items-center gap-3">
              <ScoreSide team={teams[0]} side={0} sim={sim} compact />
              <div className="text-center leading-tight">
                <div className="font-display text-2xl font-bold">{tm[0].kills} <span className="text-dim">–</span> {tm[1].kills}</div>
                <div className="text-[11px] text-muted"><span className="font-display text-sm text-text">{mmss(sim.t)}</span> · <span className={goldLead >= 0 ? 'text-blue-400' : 'text-red-400'}>{goldLead >= 0 ? '◀' : ''} {(Math.abs(goldLead) / 1000).toFixed(1)}k {goldLead < 0 ? '▶' : ''}</span></div>
              </div>
              <ScoreSide team={teams[1]} side={1} sim={sim} compact right />
            </div>}
            <div className="flex-1" />
            {playback}
            {cameraBar}
          </div>
        ) : null}
        <div className={big ? 'flex-1 min-h-0 grid gap-2 p-2' : 'grid gap-2'} style={{ gridTemplateColumns: cols, gridTemplateRows: big ? 'minmax(0,1fr)' : undefined }}>
          <div ref={streamRef} className={big ? 'min-h-0 min-w-0 flex flex-col' : 'min-w-0 self-start space-y-2'}>
            {!big && !hud && (
              <div className="panel px-4 py-2 flex items-center gap-4">
                <ScoreSide team={teams[0]} side={0} sim={sim} />
                <div className="text-center min-w-[160px]">
                  <div className="font-display text-3xl font-bold">{tm[0].kills} <span className="text-dim">–</span> {tm[1].kills}</div>
                  <div className="font-display text-lg text-muted">{mmss(sim.t)}</div>
                  <div className={`text-xs font-bold ${goldLead >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{goldLead >= 0 ? '◀' : ''} {(Math.abs(goldLead) / 1000).toFixed(1)}k gold {goldLead < 0 ? '▶' : ''}</div>
                </div>
                <ScoreSide team={teams[1]} side={1} sim={sim} right />
              </div>
            )}
            <div ref={rowRef} className={`grid justify-center ${big ? 'flex-1 min-h-0' : ''}`} style={{ gridTemplateColumns: flank, gridTemplateRows: big ? 'minmax(0,1fr)' : undefined, columnGap: GAP }}>
              <div className={big ? 'min-h-0 min-w-0 flex flex-col gap-2 overflow-y-auto' : 'min-w-0'}>
                <TeamColumn sim={sim} side={0} selected={selected} onSelect={setSelected} compact={big || !roomy} />
                {big && <PlayByPlay sim={sim} events={events} fill />}
              </div>
              <div className={big ? 'min-h-0 flex flex-col items-center justify-center' : 'flex flex-col items-center'}>
                {mapBox}
                <CasterDesk sim={sim} teams={teams} userSide={userSide} width={size} compact={big} />
              </div>
              <div className={big ? 'min-h-0 min-w-0 flex flex-col gap-2 overflow-y-auto' : 'min-w-0'}>
                <TeamColumn sim={sim} side={1} selected={selected} onSelect={setSelected} compact={big || !roomy} />
                {big && goldPanel}
                {big && shoutPanel}
              </div>
            </div>
            {!big && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">{playback}{cameraBar}</div>
                {hints}
              </div>
            )}
            {!big && (
              <div className="grid gap-2" style={{ gridTemplateColumns: streamW >= 640 ? 'minmax(0,1.25fr) minmax(0,1fr)' : 'minmax(0,1fr)' }}>
                <PlayByPlay sim={sim} events={events} />
                <div className="space-y-2 min-w-0">{goldPanel}{shoutPanel}</div>
              </div>
            )}
          </div>
          <div ref={chatCellRef} className="min-h-0 min-w-0">
            <div className={big ? 'h-full' : 'sticky top-2'} style={big ? undefined : { height: stack ? 460 : chatH }}>
              <LiveChat sim={sim} teams={teams} userSide={userSide} collapsed={!chatOpen} onToggle={stack ? undefined : toggleChat} />
            </div>
          </div>
        </div>
      </div>
      <div className={big ? 'max-w-[1500px] mx-auto px-3 pt-1 pb-4 space-y-2' : 'mt-2 space-y-2'}>
        {big ? hints : null}
        <DebugLog sim={sim} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  );
}

/** Mode / zoom pill over the map, written straight to the DOM from the animation loop (no React render). */
function paintIndicator(el: HTMLDivElement | null, cam: Camera) {
  if (!el) return;
  const st = cam.status;
  const show = st.text !== '';
  if ((el.style.display === 'flex') !== show) el.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const text = el.querySelector<HTMLElement>('[data-text]'), dot = el.querySelector<HTMLElement>('[data-dot]');
  if (text && text.textContent !== st.text) text.textContent = st.text;
  const col = st.kind === 'fight-live' ? '#ef4444' : st.kind === 'fight-idle' ? '#64748b' : st.kind === 'follow' ? '#fde047' : '#94a3b8';
  if (dot && dot.dataset.c !== col) { dot.dataset.c = col; dot.style.background = col; }
}

function PlayByPlay({ sim, events, fill }: { sim: MatchSim; events: GameEvent[]; fill?: boolean }) {
  return (
    <div className={`panel p-3 overflow-hidden ${fill ? 'flex-1 min-h-[120px]' : ''}`}>
      <div className="text-[11px] uppercase text-muted font-bold mb-1.5">Play-by-play</div>
      <div className={`space-y-1 text-xs overflow-hidden ${fill ? '' : 'max-h-40'}`}>
        {events.map((e, i) => (
          <div key={`${e.t}-${i}`} className="flex gap-2 items-center fadein">
            <span className="text-dim w-10 shrink-0 font-display">{mmss(e.t)}</span>
            {e.killer !== undefined && <ChampIcon id={sim.champs[e.killer].champ.id} size={18} />}
            {e.victim !== undefined && <><span className="text-dim">⚔</span><ChampIcon id={sim.champs[e.victim].champ.id} size={18} /></>}
            <span style={{ color: e.side === undefined ? '#cbd5e1' : TEAM_COLORS[e.side] }} className={e.important ? 'font-semibold' : ''}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreSide({ team, side, sim, right, compact }: { team: Team; side: 0 | 1; sim: MatchSim; right?: boolean; compact?: boolean }) {
  const tm = sim.teams[side];
  const stats: ReactNode = (
    <div className={`flex items-center gap-3 text-xs text-muted ${right ? 'flex-row-reverse' : ''}`}>
      <span>🗼 {tm.towers}</span>
      <span className="flex gap-0.5">{tm.dragons.map((d, i) => <span key={i} className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DRAGON_COLOR[d] }} title={d} />)}</span>
      {tm.soul && <span className="text-gold2">Soul</span>}
      {!compact && <span>Baron {tm.barons}</span>}
      {!compact && tm.grubs > 0 && <span>Grubs {tm.grubs}</span>}
      {tm.baronUntil > sim.t && <span className="text-purple-400 font-bold">BARON {Math.ceil(tm.baronUntil - sim.t)}s</span>}
      {tm.elderUntil > sim.t && <span className="text-fuchsia-400 font-bold">ELDER</span>}
    </div>
  );
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
        <TeamLogo team={team} size={28} />
        <div className="leading-tight">
          <div className="font-display text-base font-bold" style={{ color: TEAM_COLORS[side] }}>{team.short}</div>
          {stats}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex-1 flex items-center gap-3 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <TeamLogo team={team} size={44} />
      <div>
        <div className="font-display text-xl font-bold" style={{ color: TEAM_COLORS[side] }}>{team.name}</div>
        {stats}
      </div>
    </div>
  );
}

function TeamColumn({ sim, side, selected, onSelect, compact }: { sim: MatchSim; side: 0 | 1; selected: number | null; onSelect: (i: number) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {sim.champs.filter((c) => c.side === side).map((c) => {
        const items = displayItems(c.items); // finished items, the starter, and components worth 600g+
        const icon = compact ? 30 : 38, item = compact ? 16 : 20;
        return (
          <button key={c.idx} onClick={() => onSelect(c.idx)} className={`w-full panel-flat text-left ${compact ? 'p-1.5' : 'p-2'} ${selected === c.idx ? 'border-gold' : ''}`} style={{ borderLeft: `3px solid ${TEAM_COLORS[side]}` }}>
            <div className="flex items-center gap-2">
              <div className="relative">
                <ChampIcon id={c.champ.id} size={icon} grey={c.dead} />
                <span className="absolute -bottom-1 -right-1 bg-[#0b1220] text-[10px] font-bold rounded px-1 border border-line">{c.level}</span>
                {c.dead && <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-white">{Math.ceil(c.respawnAt - sim.t)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`flex justify-between items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
                  <span className="font-semibold truncate flex-1">{c.input.name}</span>
                  <FlashBadge ready={c.flashReadyAt <= sim.t} left={c.flashReadyAt - sim.t} />
                  <span className="font-display">{c.kills}/{c.deaths}/{c.assists}</span>
                </div>
                <div className={`flex justify-between text-muted ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{!compact && <span>{gd().championById[c.champ.id]?.name}</span>}<span>{c.cs} cs · {(c.goldEarned / 1000).toFixed(1)}k</span></div>
                <div className="h-1 bg-[#0a1120] rounded mt-1"><div className="h-full rounded" style={{ width: `${c.dead ? 0 : (c.hp / c.stats.maxHp) * 100}%`, background: side === 0 ? '#22c55e' : '#ef4444' }} /></div>
              </div>
            </div>
            <div className={`flex gap-0.5 ${compact ? 'mt-1' : 'mt-1.5'}`}>{Array.from({ length: 6 }).map((_, i) => items[i] ? <ItemIcon key={i} id={items[i]} size={item} /> : <div key={i} className="rounded bg-[#0a1120] border border-line" style={{ width: item, height: item }} />)}</div>
            {selected === c.idx && (
              <div className="text-[10px] text-muted mt-1">
                Task: {c.task.kind}{c.task.lane ? ` (${c.task.lane})` : ''}{c.waveReason && c.task.kind === 'lane' ? ` · ${c.waveReason}` : ''} · AD {Math.round(c.stats.ad)} AP {Math.round(c.stats.ap)} · Armor {Math.round(c.stats.armor)} MR {Math.round(c.stats.mr)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FlashBadge({ ready, left }: { ready: boolean; left: number }) {
  return (
    <span title={ready ? 'Flash ready' : `Flash in ${Math.ceil(left)}s`}
      className={`text-[9px] font-bold rounded px-1 leading-4 shrink-0 ${ready ? 'bg-yellow-300 text-black' : 'bg-[#1e293b] text-dim'}`}>
      {ready ? 'F' : `F ${Math.ceil(left)}`}
    </span>
  );
}
