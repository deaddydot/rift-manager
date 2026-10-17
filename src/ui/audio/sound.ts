// Sound for the game (Web Audio; one context, created on the first user gesture as browsers require).
//   • Champ select: the League client's draft sounds, bundled in public/audio/cs (from CommunityDragon).
//   • Champion voice lines (pick / ban) and signature sounds: streamed on demand from CommunityDragon and cached.
//   • Match sounds — pings, kill and objective stingers, towers, the end — are synthesised here (original sounds;
//     the game's own in-match audio isn't available), and an ultimate plays the caster's signature sound.
// Volumes per category, mute and the master level are stored per browser (localStorage, like the caster desk).
import { create } from 'zustand';
import { gd } from '../../data/gamedata';

export type SoundCat = 'ui' | 'voice' | 'match';
interface SoundPrefs {
  on: boolean; master: number; ui: number; voice: number; match: number;
  set: (p: Partial<Omit<SoundPrefs, 'set'>>) => void;
}
const KEY = 'rm.sound';
const read = (): Partial<SoundPrefs> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };
export const useSoundPrefs = create<SoundPrefs>((set, get) => ({
  on: true, master: 0.6, ui: 0.8, voice: 0.9, match: 0.75, ...read(),
  set: (p) => {
    set(p);
    const { on, master, ui, voice, match } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ on, master, ui, voice, match })); } catch { /* storage blocked */ }
    applyGains();
  },
}));

// ------------------------------------------------------------------ the context
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const catGain: Partial<Record<SoundCat, GainNode>> = {};
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    for (const c of ['ui', 'voice', 'match'] as SoundCat[]) { const g = ctx.createGain(); g.connect(masterGain); catGain[c] = g; }
    applyGains();
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}
function applyGains() {
  const p = useSoundPrefs.getState();
  if (!ctx || !masterGain) return;
  masterGain.gain.setTargetAtTime(p.on ? p.master : 0, ctx.currentTime, 0.02);
  for (const c of ['ui', 'voice', 'match'] as SoundCat[]) catGain[c]?.gain.setTargetAtTime(p[c], ctx.currentTime, 0.02);
}
/** Browsers only allow audio after a user gesture: unlock on the first click / key anywhere. */
if (typeof window !== 'undefined') {
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
const enabled = () => useSoundPrefs.getState().on && !!ac() && ctx!.state === 'running';

// ------------------------------------------------------------------ samples
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => new Promise<AudioBuffer | null>((res) => {
      const c = ac();
      if (!c) return res(null);
      c.decodeAudioData(b, res, () => res(null)); // codec not supported (older Safari + Ogg): stay silent
    })).catch(() => null);
    buffers.set(url, p);
  }
  return p;
}
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const CS = (name: string) => `${BASE}audio/cs/${name}.ogg`;
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';
const champKey = (id: string) => gd().championById[id]?.key;
export const champVoiceUrl = (id: string, kind: 'pick' | 'ban') => { const k = champKey(id); return k ? `${CDRAGON}/${kind === 'pick' ? 'champion-choose-vo' : 'champion-ban-vo'}/${k}.ogg` : null; };
export const champSfxUrl = (id: string) => { const k = champKey(id); return k ? `${CDRAGON}/champion-sfx-audios/${k}.ogg` : null; };

interface PlayOpts { cat?: SoundCat; vol?: number; pan?: number; rate?: number; exclusive?: string; delay?: number; maxDur?: number }
const exclusive = new Map<string, { src: AudioBufferSourceNode; g: GainNode }>();
async function playUrl(url: string | null, o: PlayOpts = {}) {
  if (!url || !enabled()) return;
  const buf = await load(url);
  const c = ac();
  if (!buf || !c || !enabled()) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  if (o.rate) src.playbackRate.value = o.rate;
  const g = c.createGain();
  g.gain.value = o.vol ?? 1;
  let node: AudioNode = g;
  if (o.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
  src.connect(g);
  node.connect(catGain[o.cat ?? 'ui']!);
  // one at a time on a channel (champion voices): the previous one fades out quickly
  if (o.exclusive) {
    const prev = exclusive.get(o.exclusive);
    if (prev) { prev.g.gain.setTargetAtTime(0, c.currentTime, 0.06); try { prev.src.stop(c.currentTime + 0.3); } catch { /* already stopped */ } }
    exclusive.set(o.exclusive, { src, g });
  }
  const t0 = c.currentTime + (o.delay ?? 0);
  src.start(t0);
  // long samples (signature sounds as an ultimate) fade out after maxDur seconds
  if (o.maxDur && buf.duration > o.maxDur) { g.gain.setTargetAtTime(0, t0 + o.maxDur - 0.25, 0.12); src.stop(t0 + o.maxDur + 0.6); }
}
/** Warm the cache (e.g. the ten champions of a game). */
export function preload(urls: (string | null)[]) { if (!ac()) return; for (const u of urls) if (u) void load(u); }

// ------------------------------------------------------------------ champ select
export type DraftSound = 'banIntro' | 'pickIntro' | 'yourBan' | 'yourPick' | 'banUs' | 'banThem' | 'pickLeft' | 'pickRight' | 'firstLeft' | 'firstRight' | 'lockIn' | 'banClick' | 'tick' | 'tickSmall' | 'gridClick' | 'gridHover';
const DRAFT_FILES: Record<DraftSound, string> = {
  banIntro: 'sfx-cs-draft-ban-ring-intro', pickIntro: 'sfx-cs-draft-pick-intro', yourBan: 'sfx-cs-draft-notif-yourban', yourPick: 'sfx-cs-draft-notif-yourpick',
  banUs: 'sfx-cs-draft-ban-your-team', banThem: 'sfx-cs-draft-ban-enemy-team', pickLeft: 'sfx-cs-draft-left-pick-single', pickRight: 'sfx-cs-draft-right-pick-single',
  firstLeft: 'sfx-cs-draft-left-first-pick', firstRight: 'sfx-cs-draft-right-first-pick', lockIn: 'sfx-cs-lockin-button-click', banClick: 'sfx-cs-draft-ban-button-click',
  tick: 'sfx-cs-timer-tick', tickSmall: 'sfx-cs-timer-tick-small', gridClick: 'sfx-uikit-grid-click', gridHover: 'sfx-uikit-grid-hover',
};
export function draftSound(s: DraftSound, vol = 1) { void playUrl(CS(DRAFT_FILES[s]), { cat: 'ui', vol }); }
/** A champion's pick or ban voice line (one voice at a time). */
export function champVoice(id: string, kind: 'pick' | 'ban', delay = 0.15) { void playUrl(champVoiceUrl(id, kind), { cat: 'voice', vol: 0.9, exclusive: 'champVoice', delay }); }
/** A champion's signature sound (lock-in flourish, or an ultimate in a match). */
export function champSignature(id: string, o: { vol?: number; pan?: number; delay?: number; cat?: SoundCat; maxDur?: number } = {}) { void playUrl(champSfxUrl(id), { cat: o.cat ?? 'voice', vol: o.vol ?? 0.55, pan: o.pan, delay: o.delay, maxDur: o.maxDur }); }
export function preloadDraft() { preload(Object.values(DRAFT_FILES).map(CS)); }

// ------------------------------------------------------------------ synthesis (match sounds)
type Wave = OscillatorType;
function tone(freq: number, dur: number, o: { type?: Wave; vol?: number; at?: number; slide?: number; pan?: number; attack?: number } = {}) {
  const c = ac();
  if (!c || !enabled()) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol ?? 0.3), t0 + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  let node: AudioNode = g;
  if (o.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
  node.connect(catGain.match!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, o: { vol?: number; at?: number; freq?: number; q?: number; sweep?: number; type?: BiquadFilterType; pan?: number } = {}) {
  const c = ac();
  if (!c || !enabled()) return;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq ?? 800, t0);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.freq ?? 800) * o.sweep), t0 + dur);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g);
  let node: AudioNode = g;
  if (o.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
  node.connect(catGain.match!);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

export type PingKind = 'danger' | 'missing' | 'onmyway' | 'assist' | 'retreat' | 'push' | 'objective' | 'vision';
/** A map ping (each kind has its own little motif, like the real ones but original). */
export function ping(kind: PingKind, pan = 0, vol = 1) {
  const v = 0.22 * vol;
  switch (kind) {
    case 'danger': tone(988, 0.12, { type: 'triangle', vol: v, pan }); tone(740, 0.22, { type: 'triangle', vol: v, at: 0.1, pan }); tone(160, 0.25, { vol: v * 0.8, at: 0.02, pan }); break;
    case 'missing': tone(660, 0.12, { type: 'square', vol: v * 0.45, pan }); tone(880, 0.2, { type: 'square', vol: v * 0.45, at: 0.13, pan, slide: 1.06 }); break;
    case 'onmyway': [523, 659, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: v * 0.9, at: i * 0.07, pan })); break;
    case 'assist': tone(587, 0.1, { type: 'sawtooth', vol: v * 0.35, pan }); tone(587, 0.14, { type: 'sawtooth', vol: v * 0.35, at: 0.12, pan }); break;
    case 'retreat': tone(784, 0.14, { type: 'triangle', vol: v, pan, slide: 0.6 }); tone(392, 0.2, { type: 'triangle', vol: v * 0.8, at: 0.12, pan, slide: 0.8 }); break;
    case 'push': case 'objective': [698, 880, 1047].forEach((f, i) => tone(f, 0.1, { type: 'sine', vol: v, at: i * 0.05, pan })); break;
    case 'vision': tone(1319, 0.09, { type: 'sine', vol: v * 0.8, pan }); tone(1760, 0.12, { type: 'sine', vol: v * 0.6, at: 0.06, pan }); break;
  }
}

export type Sting = 'killUs' | 'killThem' | 'firstBlood' | 'shutdown' | 'multi' | 'ace' | 'aceThem' | 'dragon' | 'baron' | 'elder' | 'herald' | 'steal' | 'tower' | 'towerLost' | 'inhib' | 'nexus' | 'victory' | 'defeat' | 'ult';
/** Kill / objective / structure stingers. `n` = multi-kill size, `good` = good for the user's team. */
export function sting(kind: Sting, o: { pan?: number; vol?: number; n?: number } = {}) {
  const pan = o.pan ?? 0, v = o.vol ?? 1;
  switch (kind) {
    case 'killUs': tone(1047, 0.09, { type: 'triangle', vol: 0.18 * v, pan }); tone(1568, 0.22, { type: 'sine', vol: 0.14 * v, at: 0.05, pan }); break;
    case 'killThem': tone(220, 0.22, { type: 'sawtooth', vol: 0.09 * v, pan, slide: 0.7 }); noise(0.18, { vol: 0.08 * v, freq: 500, pan }); break;
    case 'firstBlood': [392, 523, 659, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.16 * v, at: i * 0.06, pan })); noise(0.4, { vol: 0.08 * v, freq: 1800, sweep: 0.3 }); break;
    case 'shutdown': [1319, 1568, 2093].forEach((f, i) => tone(f, 0.12, { type: 'sine', vol: 0.12 * v, at: i * 0.05, pan })); break;
    case 'multi': { const n = Math.max(2, Math.min(5, o.n ?? 2)); for (let i = 0; i < n; i++) tone(523 * Math.pow(1.26, i), 0.16, { type: 'triangle', vol: 0.15 * v, at: i * 0.07, pan }); if (n === 5) { tone(1047, 0.8, { type: 'sawtooth', vol: 0.06 * v, at: 0.35 }); noise(0.9, { vol: 0.1 * v, freq: 3000, sweep: 0.2, at: 0.3 }); } break; }
    case 'ace': [523, 659, 784, 1047].forEach((f) => tone(f, 0.9, { type: 'triangle', vol: 0.09 * v, attack: 0.03 })); noise(0.6, { vol: 0.07 * v, freq: 2500, sweep: 0.25 }); break;
    case 'aceThem': [220, 262, 330].forEach((f) => tone(f, 0.9, { type: 'sawtooth', vol: 0.05 * v, attack: 0.05, slide: 0.85 })); break;
    case 'dragon': noise(1.1, { vol: 0.22 * v, freq: 900, sweep: 0.25, q: 3, type: 'bandpass', pan }); tone(110, 0.9, { type: 'sawtooth', vol: 0.08 * v, slide: 0.7, pan }); break;
    case 'elder': noise(1.4, { vol: 0.24 * v, freq: 1200, sweep: 0.2, q: 4, type: 'bandpass', pan }); tone(82, 1.2, { type: 'sawtooth', vol: 0.1 * v, slide: 0.6, pan }); tone(660, 1, { type: 'sine', vol: 0.05 * v, at: 0.2 }); break;
    case 'baron': noise(1.5, { vol: 0.25 * v, freq: 420, sweep: 0.3, q: 2, pan }); tone(55, 1.4, { type: 'sawtooth', vol: 0.12 * v, slide: 0.8, pan }); tone(73, 1.2, { type: 'square', vol: 0.04 * v, at: 0.1, slide: 0.8 }); break;
    case 'herald': tone(196, 0.6, { type: 'square', vol: 0.06 * v, slide: 1.2, pan }); noise(0.5, { vol: 0.1 * v, freq: 700, pan }); break;
    case 'steal': [1568, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.1, { type: 'square', vol: 0.06 * v, at: i * 0.06, pan })); noise(0.5, { vol: 0.12 * v, freq: 2500, sweep: 0.3 }); break;
    case 'tower': case 'towerLost': noise(0.7, { vol: 0.24 * v, freq: kind === 'tower' ? 600 : 380, sweep: 0.3, pan }); tone(kind === 'tower' ? 98 : 73, 0.5, { vol: 0.16 * v, slide: 0.6, pan }); if (kind === 'tower') tone(880, 0.15, { type: 'triangle', vol: 0.06 * v, at: 0.35, pan }); break;
    case 'inhib': noise(0.9, { vol: 0.26 * v, freq: 500, sweep: 0.25, pan }); tone(65, 0.7, { vol: 0.18 * v, slide: 0.6, pan }); break;
    case 'nexus': noise(2.2, { vol: 0.32 * v, freq: 900, sweep: 0.08 }); tone(49, 2, { vol: 0.25 * v, slide: 0.5 }); tone(98, 1.5, { type: 'sawtooth', vol: 0.06 * v, slide: 0.5 }); break;
    case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 1.2 - i * 0.1, { type: 'triangle', vol: 0.1 * v, at: i * 0.12, attack: 0.02 })); break;
    case 'defeat': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.08 * v, at: i * 0.22, attack: 0.03 })); break;
    case 'ult': noise(0.5, { vol: 0.12 * v, freq: 300, sweep: 6, q: 1.5, type: 'bandpass', pan }); tone(140, 0.4, { type: 'sawtooth', vol: 0.05 * v, slide: 2, pan }); break;
  }
}
