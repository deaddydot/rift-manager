// A chat "language pack": every table and line the chat brain (chatBrain.ts) speaks with, plus the platform it
// pretends to be. The English pack is the Twitch-style chat (chatLines / chatMemes / chatScenes / chatPicks and the
// lore tables); the Vietnamese one (chatVi.ts) is a YouTube live chat for the Hoàng Luân caster desk.
import { CHAT, CHAT_USERS } from './chatLines';
import {
  PERSONA_NAMES, PERSONA_IDLE, PERSONA_REACT, COPYPASTAS, MEMES, SMASH, DIFF_LINES, FARM, FOOD, PAUSE, WAVES, EMOTE_MOOD, ITEMS, CITIES, LEAGUES,
  type Persona, type Moment,
} from './chatMemes';
import {
  ARGUE, HOT_TAKES, ROASTS, HOT_DEFEND, BACKSEAT_REPLIES, BACKSEAT_BACK, QA, TIMEZONE_REPLIES, FIRST_TIME, WELCOME, PASTA_REACT, PREDICT,
  GG_CALLS, EZ_CALLS, THROW_CALLS, STEAL_CALLS, BARON_START, NEXUS_LINES, CALLOUTS, BOTS, MOD_NAMES, NIGHTBOT_REMINDERS, COMMANDS, MOD_LINES,
  TIMEOUT_BAIT, AFTER_TIMEOUT, BACK_FROM_TIMEOUT, RAIDERS, RAID_CHAT, RAID_WELCOME, SUB_MSGS, BITS_MSGS, GIFT_THANKS, POLL, GM_REPLIES, POSTGAME,
  REGION_REPLIES, DRAFT_TAKES,
} from './chatScenes';
import { PICK_CHAT } from './chatPicks';
import { LORE_CHAT } from '../../engine/management/loreTemplates';
import { LEG_CHAT } from '../../engine/management/legacyTemplates';

export type Mood = keyof typeof EMOTE_MOOD;
export type WaveDef = (typeof WAVES)[string];

/** Lines and notice texts the brain builds inline. */
export interface PackText {
  pileOn: string[];                 // piling on a called-out chatter
  toldYou: string[];                // the doomer who called the throw
  lateJoin: string[];               // replies to "what did I miss"
  chatVs: string;                   // "chat vs @{user} 1v{n}"
  pastaMod: string[];               // a mod stopping a copypasta wave
  subWelcome: string;               // welcome to a new subscriber / member ({user})
  bitsReply: string;                // reply to a big cheer / Super Chat ({user})
  giftOne: string;                  // thanks from a gift recipient ({user})
  gmInChat: string;
  when: (mmss: string) => string;   // "at 12:30"
  obj: (kind: 'baron' | 'elder' | 'dragon') => string;
  pollTitle: (bestOf: number, gameNo: number) => string;
  pollStart: (title: string) => [string, string];
  pollLocked: (title: string) => string;
  pollResult: (winner: string) => string;
  pollResultText: (won: number, lost: number, pool: string) => string;
  subRenew: (name: string, months: number) => string;
  subNew: (name: string, prime: boolean) => string;
  bits: (name: string, amount: number) => string;
  bitsText: (amount: number, msg: string) => string;
  bitsAmounts: number[];
  giftTo: (name: string, to: string) => string;
  giftN: (name: string, n: number) => string;
  giftNText: (total: number) => string;
  raid: (raider: string, n: number) => string;
  timeout: (name: string, secs: number) => string;
  /** YouTube: moderation shows up as a Nightbot warning in chat instead of a timeout notice. */
  warn?: (name: string, reason: string) => string;
  lore: (t1: string) => string;
  startSystem?: string;             // a system line at the start (YouTube: subscribers-only mode)
}

export interface ChatPack {
  lang: 'en' | 'vi';
  platform: 'twitch' | 'youtube';
  LINES: Record<string, string[]>;
  USERS: string[];
  PERSONA_NAMES: Record<Persona, string[]>;
  PERSONA_IDLE: Record<Persona, string[]>;
  PERSONA_REACT: Partial<Record<Persona, Partial<Record<Moment, string[]>>>>;
  COPYPASTAS: string[]; MEMES: string[]; SMASH: string[]; DIFF_LINES: string[]; FARM: string[]; FOOD: string[]; PAUSE: string[];
  WAVES: Record<string, WaveDef>;
  EMOTE_MOOD: Record<Mood, string[]>;
  ITEMS: string[]; CITIES: string[]; LEAGUES: string[];
  ARGUE: typeof ARGUE; HOT_TAKES: typeof HOT_TAKES; ROASTS: string[]; HOT_DEFEND: string[]; BACKSEAT_REPLIES: string[]; BACKSEAT_BACK: string[];
  QA: typeof QA; TIMEZONE_REPLIES: string[]; FIRST_TIME: string[]; WELCOME: string[]; PASTA_REACT: string[]; PREDICT: typeof PREDICT;
  GG_CALLS: string[]; EZ_CALLS: string[]; THROW_CALLS: string[]; STEAL_CALLS: string[]; BARON_START: string[]; NEXUS_LINES: typeof NEXUS_LINES;
  CALLOUTS: Record<string, string[]>; BOTS: typeof BOTS; MOD_NAMES: string[]; NIGHTBOT_REMINDERS: string[]; COMMANDS: Record<string, string[]>;
  MOD_LINES: string[]; TIMEOUT_BAIT: typeof TIMEOUT_BAIT; AFTER_TIMEOUT: string[]; BACK_FROM_TIMEOUT: string[];
  RAIDERS: string[]; RAID_CHAT: string[]; RAID_WELCOME: string[]; SUB_MSGS: string[]; BITS_MSGS: string[]; GIFT_THANKS: string[];
  POLL: typeof POLL; GM_REPLIES: typeof GM_REPLIES; POSTGAME: string[]; REGION_REPLIES: string[]; DRAFT_TAKES: string[];
  /** Lines the channel's own (verified) account posts now and then (YouTube). */
  CHANNEL_LINES?: string[];
  T: PackText;
  /** What chat lines leave a claim the chat remembers (a gg call, an "ez", a steal call). */
  sniff: { gg: RegExp; ez: RegExp; steal: RegExp };
  /** Pace: released lines per second (base + excitement / excite; wave = during an emote / gg flood), ambient factor. */
  pace: { base: number; excite: number; wave: number; ambient: number; notices: [number, number] };
  /** Multipliers on the ambient chatter mix (phase, persona, meme, emote, smash, diff, farm, food, lead, pasta). */
  mix?: Partial<Record<string, number>>;
  /** How often emote / wave messages repeat their token ("KEKW KEKW KEKW"): 1 = Twitch, lower = mostly one token. */
  repeat: number;
  raids: boolean;
  combo: boolean;
}

export const EN_PACK: ChatPack = {
  lang: 'en', platform: 'twitch',
  LINES: { ...CHAT, ...LORE_CHAT, ...LEG_CHAT, ...PICK_CHAT },
  USERS: CHAT_USERS,
  PERSONA_NAMES, PERSONA_IDLE, PERSONA_REACT, COPYPASTAS, MEMES, SMASH, DIFF_LINES, FARM, FOOD, PAUSE, WAVES, EMOTE_MOOD, ITEMS, CITIES, LEAGUES,
  ARGUE, HOT_TAKES, ROASTS, HOT_DEFEND, BACKSEAT_REPLIES, BACKSEAT_BACK, QA, TIMEZONE_REPLIES, FIRST_TIME, WELCOME, PASTA_REACT, PREDICT,
  GG_CALLS, EZ_CALLS, THROW_CALLS, STEAL_CALLS, BARON_START, NEXUS_LINES, CALLOUTS, BOTS, MOD_NAMES, NIGHTBOT_REMINDERS, COMMANDS, MOD_LINES,
  TIMEOUT_BAIT, AFTER_TIMEOUT, BACK_FROM_TIMEOUT, RAIDERS, RAID_CHAT, RAID_WELCOME, SUB_MSGS, BITS_MSGS, GIFT_THANKS, POLL, GM_REPLIES, POSTGAME,
  REGION_REPLIES, DRAFT_TAKES,
  T: {
    pileOn: ['@{user} KEKW', '@{user} LMAO', 'chat remembers @{user}', '@{user} ICANT', 'clip @{user}’s message', '@{user} the internet never forgets'],
    toldYou: ['told you all', 'i hate being right', 'Aware i warned you'],
    lateJoin: ['@{user} first time watching? KEKW', '@{user} welcome to league', '@{user} it’s always like this'],
    chatVs: 'chat vs @{user} 1v{n}',
    pastaMod: ['chat, enough copypasta for a minute KEKW', 'ok that’s enough pasta', 'pasta limit reached Stare'],
    subWelcome: 'welcome to the club @{user} peepoClap',
    bitsReply: '@{user} W bits',
    giftOne: 'thanks for the sub @{user}!',
    gmInChat: 'GM IN CHAT Pog',
    when: (t) => `at ${t}`,
    obj: (k) => (k === 'baron' ? 'Baron' : k === 'elder' ? 'Elder' : 'drake'),
    pollTitle: (bo, n) => (bo > 1 ? `Who wins game ${n}?` : 'Who wins?'),
    pollStart: (title) => [`Prediction started: ${title}`, 'Locks at 10:00 game time. Good luck!'],
    pollLocked: (title) => `Prediction locked: ${title}`,
    pollResult: (w) => `Prediction result: ${w} won!`,
    pollResultText: (won, lost, pool) => `${won.toLocaleString('en-US')} users won ${pool} channel points · ${lost.toLocaleString('en-US')} users lost it all`,
    subRenew: (name, m) => `${name} subscribed at Tier 1. They’ve subscribed for ${m} months!`,
    subNew: (name, prime) => `${name} subscribed ${prime ? 'with Prime' : 'at Tier 1'}.`,
    bits: (name, n) => `${name} cheered ${n.toLocaleString('en-US')} bits`,
    bitsText: (n, msg) => `Cheer${n} ${msg}`,
    bitsAmounts: [100, 100, 200, 500, 1000, 1000, 2500, 5000, 10000],
    giftTo: (name, to) => `${name} gifted a Tier 1 sub to ${to}!`,
    giftN: (name, n) => `${name} is gifting ${n} Tier 1 Subs to the community!`,
    giftNText: (total) => `They’ve gifted a total of ${total} in the channel!`,
    raid: (raider, n) => `${raider} is raiding with a party of ${n.toLocaleString('en-US')}.`,
    timeout: (name, secs) => `${name} has been timed out for ${secs} seconds.`,
    lore: (t1) => `${t1} vs LPL: the curse is in play`,
  },
  sniff: { gg: /\b(gg( go next)?|ff ?(15)?|it.?s over|uninstall)\b/i, ez: /\b(ez|easy|free win)\b/i, steal: /\bsteal|stolen\b/i },
  pace: { base: 5, excite: 20, wave: 15, ambient: 1, notices: [16, 42] },
  raids: true,
  combo: true,
  repeat: 1,
};
