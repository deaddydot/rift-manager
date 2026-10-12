// AI chat controller: a small language model (see ./models.ts, run in ./worker.ts) writes part of the live
// match chat. It reads what chat has been saying plus what just happened in the game, continues the chat log
// as a few viewers, filters the output, and hands the lines to the chat (chatFeed.ts) — which paces and
// styles them like any viewer's. The template chat keeps running underneath (less of it while the model is
// up), so the chat never goes quiet while the model loads, thinks, or isn't available.
import { create } from 'zustand';
import { AI_CHAT_MODELS, DEFAULT_AI_MODEL, aiModel } from './models';
import { getChatSnapshot, getChatMeta, pushChatLine, setTemplateShare, type FeedLine } from '../chatFeed';
import { useSession } from '../session';
import { useStore } from '../../../store/game';
import type { GameEvent } from '../../../engine/sim/simtypes';

type Status = 'off' | 'loading' | 'ready' | 'error' | 'unsupported';
interface AiChatState {
  enabled: boolean;
  model: string;
  status: Status;
  progress: number; // download 0..1
  device: 'webgpu' | 'wasm' | null;
  error: string | null;
  made: number;     // lines the model has written this session
  rejected: number; // lines the filter threw away
  recent: string[]; // the last few accepted lines (shown in Settings)
  setEnabled: (v: boolean) => void;
  setModel: (id: string) => void;
}

const PREF = 'rm.aiChat';
function readPref(): { enabled: boolean; model: string } {
  try { const p = JSON.parse(localStorage.getItem(PREF) ?? '{}'); return { enabled: !!p.enabled, model: AI_CHAT_MODELS.some((m) => m.id === p.model) ? p.model : DEFAULT_AI_MODEL }; }
  catch { return { enabled: false, model: DEFAULT_AI_MODEL }; }
}
function writePref(p: { enabled: boolean; model: string }) { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* preference only */ } }

export const useAiChat = create<AiChatState>((set, get) => ({
  ...readPref(),
  status: 'off', progress: 0, device: null, error: null, made: 0, rejected: 0, recent: [],
  setEnabled: (v) => {
    set({ enabled: v });
    writePref({ enabled: v, model: get().model });
    if (v) void load(); else unload();
  },
  setModel: (id) => {
    set({ model: id });
    writePref({ enabled: get().enabled, model: id });
    if (get().enabled) { unload(); void load(); }
  },
}));

// ------------------------------------------------------------------ worker
let worker: Worker | null = null;
let busy = false;
let reqId = 0;
let triedWasm = false;
const pending = new Map<number, (lines: { user: string; text: string }[]) => void>();

async function pickDevice(): Promise<{ device: 'webgpu' | 'wasm'; dtype: 'q4f16' | 'q4' | 'int8' }> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    if (adapter && !triedWasm) return { device: 'webgpu', dtype: adapter.features.has('shader-f16') ? 'q4f16' : 'q4' };
  } catch { /* no WebGPU */ }
  return { device: 'wasm', dtype: 'int8' };
}

async function load() {
  const st = useAiChat.getState();
  if (!st.enabled || st.status === 'loading' || st.status === 'ready') return;
  if (typeof Worker === 'undefined') { useAiChat.setState({ status: 'unsupported', error: 'This browser cannot run background workers.' }); return; }
  const { device, dtype } = await pickDevice();
  useAiChat.setState({ status: 'loading', progress: 0, device, error: null });
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === 'progress') useAiChat.setState({ progress: m.total ? m.loaded / m.total : 0 });
    else if (m.type === 'ready') { useAiChat.setState({ status: 'ready', progress: 1, device: m.device }); }
    else if (m.type === 'error') {
      // WebGPU can fail on some drivers: fall back to the CPU once before giving up
      if (useAiChat.getState().status === 'loading' && device === 'webgpu' && !triedWasm) { triedWasm = true; unload(); void load(); return; }
      useAiChat.setState({ status: 'error', error: m.error });
      busy = false;
    } else if (m.type === 'result') { pending.get(m.id)?.(m.lines); pending.delete(m.id); }
  };
  worker.postMessage({ type: 'load', repo: aiModel(st.model).repo, dtype, device });
}

function unload() {
  worker?.terminate();
  worker = null; busy = false; pending.clear();
  useAiChat.setState({ status: 'off', progress: 0, device: null });
  setTemplateShare(1);
}

function generate(prompt: string, speakers: string[]): Promise<{ user: string; text: string }[]> {
  return new Promise((resolve) => {
    if (!worker) { resolve([]); return; }
    const id = ++reqId;
    pending.set(id, resolve);
    worker.postMessage({ type: 'gen', id, prompt, speakers, maxNewTokens: 18 });
  });
}

// ------------------------------------------------------------------ prompt
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const EVENT_TYPES = new Set(['kill', 'firstBlood', 'tower', 'inhib', 'nexus', 'dragon', 'elder', 'baron', 'herald', 'grubs', 'steal', 'ace', 'multikill', 'shutdown', 'soul', 'teamfight']);
const NEW_VIEWERS: [string, string][] = [
  ['kekw_enjoyer', 'memer'], ['couch_coach', 'backseat'], ['GoldDiffAt15', 'analyst'], ['ItsOver77', 'doomer'], ['WeekendWatcher', 'casual'],
  ['lurker_since_s3', 'lurker'], ['EUnightowl', 'timezone'], ['PositivePing', 'wholesome'], ['ResidentSleeper_fan', 'memer'], ['wardscore_9', 'analyst'],
];

function buildPrompt(): { prompt: string; speakers: { user: string; persona?: string }[] } | null {
  const s = useSession.getState().s, sim = s?.sim;
  const state = useStore.getState().state;
  if (!s || !sim || !state) return null;
  const [A, B] = sim.teams.map((t) => t.input);
  const f = state.fixtures[s.fixtureId];
  const comp = f ? state.competitions[f.competitionId] : undefined;
  const winsA = s.series.games.filter((g) => g.winner === A.teamId).length, winsB = s.series.games.filter((g) => g.winner === B.teamId).length;
  const header = `Twitch chat — ${comp?.name ?? 'League of Legends'}${f?.label ? ` ${f.label}` : ''}, ${A.name} vs ${B.name}, game ${s.gameNo}${f && f.bestOf > 1 ? ` (series ${winsA}-${winsB})` : ''}. `
    + `Score ${sim.teams[0].kills}-${sim.teams[1].kills}. Chat is fast, short, and full of emotes (KEKW, Pog, monkaS, Copium, LUL, Sadge, EZ, OMEGALUL, 5Head). Viewers cheer, meme, argue and backseat.`;
  // the chat so far and the game events, in time order
  const chat: { t: number; line: string }[] = getChatSnapshot(18).filter((l: FeedLine) => l.kind === 'msg').map((l) => ({ t: l.t, line: `${l.user}: ${l.text}` }));
  const since = chat.length ? chat[0].t - 1 : sim.t - 60;
  const events = (sim.events as GameEvent[]).filter((e) => e.t >= since && EVENT_TYPES.has(e.type)).slice(-8).map((e) => ({ t: e.t, line: `>>> ${mmss(e.t)} ${e.text}` }));
  const log = [...chat, ...events].sort((a, b) => a.t - b.t).slice(-22).map((x) => x.line);
  if (!log.length) return null;
  // who talks next: mostly people already in chat (keeps their voice), sometimes someone new
  const recentUsers = new Map<string, string | undefined>();
  for (const l of getChatSnapshot(30)) if (l.kind === 'msg') recentUsers.set(l.user, l.persona);
  const pool = [...recentUsers.entries()];
  const speakers: { user: string; persona?: string }[] = [];
  for (let i = 0; i < 2; i++) {
    if (pool.length && Math.random() < 0.65) { const [u, p] = pool[Math.floor(Math.random() * pool.length)]; if (!speakers.some((x) => x.user === u)) speakers.push({ user: u, persona: p }); }
    else { const [u, p] = NEW_VIEWERS[Math.floor(Math.random() * NEW_VIEWERS.length)]; if (!speakers.some((x) => x.user === u)) speakers.push({ user: u, persona: p }); }
  }
  return { prompt: `${header}\n${log.join('\n')}`, speakers };
}

// ------------------------------------------------------------------ filter
// Small models drift: keep short, chat-shaped lines and drop anything off-tone or broken.
const BLOCK = /\b(fuck|shit|bitch|cunt|retard|fag|nigg|kys|kill yourself|rape|nazi|hitler|porn|sex)\w*/i;
export function cleanLine(raw: string): string | null {
  let t = raw.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\w.-]{2,25}:\s*/, ''); // the model started another "user:" line
  if (t.length > 80) { const cut = t.slice(0, 80).search(/[.!?](?!.*[.!?])/); if (cut < 15) return null; t = t.slice(0, cut + 1); }
  if (t.length < 2) return null;
  if (/https?:|www\.|\.com\b|#\w|<\/?\w|[[\]{}]|>>>|\\n|assistant|user:/i.test(t)) return null;
  // swearing stays out even when the model censors it itself ("f**k", "sh!t", "b1tch")
  const norm = t.replace(/[*#@$_.-]/g, '').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e');
  if (BLOCK.test(t) || BLOCK.test(norm) || /\bf\W{1,3}k|\bs\W{1,2}t\b|\*{2,}/i.test(t)) return null;
  const words = t.split(' ');
  if (words.length > 14) return null;
  if (words.some((w) => w.length > 16 && !/^[A-Z]+$/.test(w))) return null; // garbled tokens
  if (/(.)\1{7,}/.test(t) && !/[A-Z]{3,}/.test(t)) return null; // keyboard mash without hype
  return t;
}

// ------------------------------------------------------------------ loop
let lastTick = 0;
async function tick() {
  const st = useAiChat.getState();
  const meta = getChatMeta();
  if (!st.enabled) return;
  if (!meta.live) { if (st.status === 'ready') setTemplateShare(1); return; }
  if (st.status === 'off') { void load(); return; }
  if (st.status !== 'ready' || busy || (typeof document !== 'undefined' && document.hidden)) return;
  setTemplateShare(0.6); // the model takes over part of the chatter
  const now = Date.now();
  if (now - lastTick < 2200) return;
  lastTick = now;
  const p = buildPrompt();
  if (!p) return;
  busy = true;
  const lines = await generate(p.prompt, p.speakers.map((s) => s.user));
  busy = false;
  const out = [];
  for (const l of lines) {
    const text = cleanLine(l.text);
    if (text) out.push({ user: l.user, text, persona: p.speakers.find((s) => s.user === l.user)?.persona });
  }
  const s = useAiChat.getState();
  if (out.length) pushChatLine(out);
  useAiChat.setState({ made: s.made + out.length, rejected: s.rejected + lines.length - out.length, recent: [...s.recent, ...out.map((l) => `${l.user}: ${l.text}`)].slice(-8) });
}
if (typeof window !== 'undefined') setInterval(() => { void tick(); }, 700);
