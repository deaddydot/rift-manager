// Plug-in point for the live match chat (LiveChat.tsx / chatBrain.ts): lets other code (e.g. the in-browser AI
// chat in ./aiChat/) read what chat has been saying and post lines "as a viewer". Module-level and framework-free:
// the chat brain drains the inbox on its own timer and paces external lines with the same rate caps as its own.
//
//   getChatSnapshot(n)        → the last n released lines (oldest first): { user, text, persona?, t, kind }
//   getChatMeta()             → { live, hype, viewers, gameTime, wave } for prompt building
//   pushChatLine(line | [..]) → queue lines as if viewers typed them: { user?, text, persona? }
//   setTemplateShare(0..1)    → scale the built-in template chatter down (1 = full, 0 = only events/waves/notices)
//   onChatLine(cb)            → subscribe to every released line; returns an unsubscribe function
//
// Personas understood by `persona` (anything else is treated as a crowd viewer): superfan, rival, analyst, doomer,
// memer, copypasta, casual, backseat, spammer, wholesome, timezone, regionwar, lurker.

export interface FeedLine {
  user: string;
  text: string;
  persona?: string;
  /** game time in seconds when the line appeared */
  t: number;
  kind: 'msg' | 'notice';
}
export interface ExternalLine { user?: string; text: string; persona?: string }
export interface ChatMeta { live: boolean; hype: number; viewers: number; gameTime: number; wave: string | null }

const RECENT_MAX = 60;
const INBOX_MAX = 40;
const recent: FeedLine[] = [];
let inbox: ExternalLine[] = [];
let templateShare = 1;
let meta: ChatMeta = { live: false, hype: 0, viewers: 0, gameTime: 0, wave: null };
const subs = new Set<(l: FeedLine) => void>();

/** The last `n` chat lines (oldest first). */
export function getChatSnapshot(n = 20): FeedLine[] {
  return recent.slice(-Math.max(0, n)).map((l) => ({ ...l }));
}

/** Live status of the chat (is a match chat mounted, crowd hype 0..100, viewer count, current emote wave). */
export function getChatMeta(): ChatMeta { return { ...meta }; }

/** Queue line(s) as if a viewer typed them; the chat assigns colours/badges and paces them out. */
export function pushChatLine(line: ExternalLine | ExternalLine[]): void {
  for (const l of Array.isArray(line) ? line : [line]) {
    const text = String(l?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) continue;
    inbox.push({ user: l.user ? String(l.user).replace(/[^\w.-]/g, '').slice(0, 25) || undefined : undefined, text, persona: l.persona });
  }
  if (inbox.length > INBOX_MAX) inbox.splice(0, inbox.length - INBOX_MAX);
}

/** 0..1: how much of the built-in template chatter to keep (ambient lines, scenes, event reactions). */
export function setTemplateShare(x: number): void { templateShare = Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 1; }
export function getTemplateShare(): number { return templateShare; }

/** Subscribe to every line as it is shown. */
export function onChatLine(cb: (l: FeedLine) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

// ---- internal: used by chatBrain.ts
export function _drainExternal(): ExternalLine[] {
  if (!inbox.length) return inbox;
  const out = inbox;
  inbox = [];
  return out;
}
export function _recordLine(l: FeedLine): void {
  recent.push(l);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
  for (const cb of subs) { try { cb(l); } catch { /* a bad subscriber must not break the chat */ } }
}
export function _setMeta(m: ChatMeta): void { meta = m; }
export function _resetFeed(): void { recent.length = 0; inbox = []; meta = { live: false, hype: 0, viewers: 0, gameTime: 0, wave: null }; }
