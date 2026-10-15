// The club's own channel: the user runs the club's presence online — vlogs, funny videos, game shows, talk shows,
// player spotlights, hype trailers, photoshoots, pro tips, creator collabs, Q&A livestreams. Each production costs
// money and the players' time (fatigue, a little practice) and turns out as good as the people on camera: the
// players' personal profile (looks, humor, charisma, smarts, media savvy, online presence, style, comms — persona.ts)
// and traits, the hired host / MC and editor, the content studio and the budget. Uploads earn views, subscribers,
// a little ad money and casual fans; regular, good uploads build the channel's momentum (reach: casual fans, content
// revenue, sponsor appeal) and community (die-hard loyalty), and fans bond with the players they see (fanbase.ts via
// contentFx.ts). Neglect it and both fade. Daily from endDay (game.ts): contentDaily.
import type { ClubChannel, ContentCrew, ContentProduction, ContentUpload, GameState, Player, Team } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addDays, weekday } from '../season/formats';
import { overall } from '../setup';
import { addInbox } from './news';
import { addLedger } from './finance';
import { emit, baseCtx, fanMood, fill, type Ctx } from './fans';
import { addFans } from './fanbase';
import { personaOf } from './persona';
import { NAMES } from './staffMarket';
import { contentState, comments, creatorsDaily, creatorById } from './content';
import { contentEvent } from './contentFx';
import { registerOrgTemplates } from './scrims';
import { ORG_TITLES, ORG_HIGHLIGHTS, ORG_COMMENTS, type OrgFormat } from './contentTemplates';

type Stat = 'looks' | 'humor' | 'charisma' | 'smarts' | 'media' | 'online' | 'style' | 'comms';
export const STAT_LABEL: Record<Stat, string> = { looks: 'Looks', humor: 'Humor', charisma: 'Charisma', smarts: 'Smarts', media: 'Media', online: 'Online', style: 'Style', comms: 'Comms' };

export interface FormatDef {
  label: string; icon: string; desc: string;
  min: number; max: number;
  w: Partial<Record<Stat, number>>;   // what makes a player good on camera for it
  host: number;                       // weight of the host / MC (0 = no host needed)
  prod: number;                       // weight of production value (studio, editor, budget)
  cost: number;                       // × the tier's base production cost
  days: number;                       // shoot → upload
  fatigue: number;                    // per participant
  reach: number; diehard: number; viral: number; risk: number;
  hype?: number; merch?: number; bond?: number; rep?: number; skill?: boolean; collab?: boolean;
  traits?: Record<string, number>;    // trait → bonus (or malus) on camera for this format
}
const CAMERA = { camera_shy: -12, content_machine: 5 };
export const FORMATS: Record<OrgFormat, FormatDef> = {
  vlog: { label: 'Vlog', icon: '🎥', desc: 'Behind the scenes: the team house, travel, match days. Builds die-hard loyalty.', min: 1, max: 5, w: { humor: 0.3, charisma: 0.3, online: 0.2, looks: 0.2 }, host: 0, prod: 0.3, cost: 1, days: 3, fatigue: 2, reach: 0.9, diehard: 1.6, viral: 0.6, risk: 0.15, bond: 1.2, traits: { ...CAMERA, class_clown: 4, heartthrob: 4 } },
  funny: { label: 'Funny video', icon: '😂', desc: 'Challenges, sketches, pranks. Swingy: it flops or goes viral.', min: 1, max: 5, w: { humor: 0.55, online: 0.25, charisma: 0.2 }, host: 0.1, prod: 0.25, cost: 1, days: 3, fatigue: 2, reach: 1.25, diehard: 0.8, viral: 2.2, risk: 0.3, traits: { ...CAMERA, meme_lord: 8, class_clown: 8 } },
  gameshow: { label: 'Game show', icon: '🎲', desc: 'Quiz nights, “guess the champion”, blind picks. A good host makes it.', min: 2, max: 5, w: { humor: 0.35, smarts: 0.25, charisma: 0.25, online: 0.15 }, host: 0.35, prod: 0.3, cost: 1.8, days: 4, fatigue: 2, reach: 1.1, diehard: 1.1, viral: 1.3, risk: 0.15, traits: { ...CAMERA, class_clown: 5, meme_lord: 4 } },
  talkshow: { label: 'Talk show', icon: '🎙', desc: 'Long-form chat with your host. Grows the guests’ reputation — loose lips cause controversies.', min: 1, max: 3, w: { charisma: 0.35, media: 0.3, smarts: 0.2, humor: 0.15 }, host: 0.4, prod: 0.25, cost: 1.4, days: 3, fatigue: 1, reach: 0.9, diehard: 1.3, viral: 0.8, risk: 0.65, rep: 1, traits: { ...CAMERA, media_darling: 6, trash_talker: 3 } },
  spotlight: { label: 'Player spotlight', icon: '⭐', desc: 'A mini documentary about one player. Fans bond with them.', min: 1, max: 1, w: { charisma: 0.35, looks: 0.25, media: 0.2, style: 0.2 }, host: 0.1, prod: 0.35, cost: 2, days: 5, fatigue: 2, reach: 1, diehard: 1.5, viral: 0.7, risk: 0.1, bond: 3, rep: 1.2, traits: { ...CAMERA, heartthrob: 6, media_darling: 4 } },
  hype: { label: 'Hype trailer', icon: '🔥', desc: 'A cinematic matchday trailer: big hype before a big match. Production and editing matter most.', min: 1, max: 5, w: { looks: 0.35, style: 0.35, charisma: 0.3 }, host: 0, prod: 0.55, cost: 2.5, days: 4, fatigue: 1, reach: 1.1, diehard: 0.9, viral: 1, risk: 0.03, hype: 2, traits: { ...CAMERA, fashion_icon: 5, showman: 6 } },
  photoshoot: { label: 'Photoshoot / kit reveal', icon: '📸', desc: 'New jerseys and portraits: sells merch for a few weeks.', min: 1, max: 5, w: { looks: 0.5, style: 0.5 }, host: 0, prod: 0.45, cost: 2, days: 3, fatigue: 1, reach: 0.8, diehard: 0.8, viral: 0.6, risk: 0.03, merch: 1, traits: { ...CAMERA, fashion_icon: 10, heartthrob: 6 } },
  tips: { label: 'Pro tips', icon: '🧠', desc: 'Your players teach the game. Analyst fans love it; their skill counts.', min: 1, max: 2, w: { smarts: 0.4, comms: 0.35, media: 0.25 }, host: 0, prod: 0.25, cost: 0.8, days: 3, fatigue: 1, reach: 0.8, diehard: 1, viral: 0.5, risk: 0.08, skill: true, rep: 0.6, traits: { ...CAMERA } },
  collab: { label: 'Creator collab', icon: '🤝', desc: 'Team up with a content creator: their audience meets your players. Costs a fee.', min: 1, max: 3, w: { charisma: 0.4, humor: 0.4, online: 0.2 }, host: 0, prod: 0.25, cost: 1, days: 3, fatigue: 2, reach: 1.6, diehard: 0.7, viral: 1.2, risk: 0.3, collab: true, traits: { ...CAMERA, meme_lord: 5, content_machine: 7 } },
  qna: { label: 'Q&A livestream', icon: '💬', desc: 'Live with the fans: cheap, quick, loved by die-hards, small reach.', min: 1, max: 5, w: { charisma: 0.4, humor: 0.3, online: 0.3 }, host: 0.2, prod: 0.15, cost: 0.4, days: 1, fatigue: 1, reach: 0.6, diehard: 1.6, viral: 0.4, risk: 0.35, bond: 1.5, traits: { ...CAMERA, content_machine: 6 } },
};
export const FORMAT_IDS = Object.keys(FORMATS) as OrgFormat[];
/** Production budget: half the money for a rough cut, double for a polished one. */
export const BUDGETS = [{ label: 'Low', mult: 0.5, q: -7 }, { label: 'Standard', mult: 1, q: 0 }, { label: 'High', mult: 2, q: 7 }];
const COST_BASE: Record<number, number> = { 1: 3000, 2: 600, 3: 120 };
const CPM: Record<number, number> = { 1: 4, 2: 2.5, 3: 1.5 };
const CREW_SALARY: Record<number, number> = { 1: 9000, 2: 1800, 3: 450 };

const tierOf = (state: GameState, team: Team) => state.leagues[team.leagueId]?.tier ?? 3;
export const channelOf = (state: GameState) => contentState(state).channel;
export const hostOf = (ch: ClubChannel) => ch.crew.find((c) => c.role === 'host');
export const editorOf = (ch: ClubChannel) => ch.crew.find((c) => c.role === 'editor');
/** Productions at once: 1 + one per two content-studio levels. */
export const capacity = (team: Team) => 1 + Math.floor(team.facilities.contentStudio / 2);

// ------------------------------------------------------------------ quality
/** How good a player is on camera for a format (1..99-ish) and why. */
export function onCamera(p: Player, f: OrgFormat): { v: number; notes: string[] } {
  const def = FORMATS[f], s = personaOf(p);
  let v = 0, tw = 0;
  for (const [k, w] of Object.entries(def.w) as [Stat, number][]) { v += (s[k] ?? 50) * w; tw += w; }
  v /= tw || 1;
  const notes: string[] = [];
  for (const [t, b] of Object.entries(def.traits ?? {})) if (p.traits.includes(t)) { v += b; notes.push(`${t.replace(/_/g, ' ')} ${b > 0 ? '+' : ''}${b}`); }
  if (def.skill) { const d = (overall(p.attributes, p.role) - 60) * 0.3; v += d; if (Math.abs(d) >= 2) notes.push(`skill ${d > 0 ? '+' : ''}${Math.round(d)}`); }
  if (p.fatigue > 70) { v -= 5; notes.push('tired −5'); }
  if (p.morale < 30) { v -= 4; notes.push('unhappy −4'); }
  return { v: clamp(v, 1, 99), notes };
}
export const hostScore = (h: ContentCrew) => h.charisma * 0.4 + h.humor * 0.3 + h.looks * 0.2 + h.smarts * 0.1;

export interface Estimate { quality: number; cast: number; host: number | null; prod: number; novelty: number; cost: number; days: number; fee: number; notes: string[] }
/** Expected quality (before luck) of a production, its cost and when it would go up. */
export function estimate(state: GameState, f: OrgFormat, pids: string[], useHost: boolean, budget: number, collabId?: string): Estimate {
  const team = state.teams[state.userTeamId];
  const ch = channelOf(state);
  const def = FORMATS[f];
  const ps = pids.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const notes: string[] = [];
  const scores = ps.map((p) => onCamera(p, f).v);
  const cast = scores.length ? 0.55 * Math.max(...scores) + 0.45 * (scores.reduce((a, b) => a + b, 0) / scores.length) + (ps.length > 1 ? (team.chemistry - 50) * 0.08 : 0) : 0;
  let host: number | null = null;
  const h = hostOf(ch);
  if (def.host > 0) {
    if (useHost && h) host = hostScore(h);
    else { host = Math.max(30, ...ps.map((p) => personaOf(p).charisma)) - 10; notes.push(h ? 'No host on this one: a player leads it (−10)' : 'No host hired: a player leads it (−10)'); }
  }
  const ed = editorOf(ch);
  const prod = clamp(25 + team.facilities.contentStudio * 9 + (ed ? ed.skill * 0.35 : 8) + BUDGETS[budget].q, 5, 99);
  const castPart = def.host > 0 && host !== null ? (1 - def.host) * cast + def.host * host : cast;
  // the same format again so soon: the audience has seen it
  const last = ch.uploads.find((u) => u.format === f)?.date ?? ch.queue.find((q) => q.format === f)?.started;
  const gap = last ? (new Date(state.date).getTime() - new Date(last).getTime()) / 864e5 : 99;
  const novelty = gap < 7 ? -8 : gap < 14 ? -4 : 0;
  if (novelty) notes.push(`Same format ${Math.round(gap)} days ago (${novelty})`);
  const quality = clamp((1 - def.prod) * castPart + def.prod * prod + novelty, 1, 99);
  const tier = tierOf(state, team);
  const cost = Math.round(COST_BASE[tier] * def.cost * BUDGETS[budget].mult);
  const c = collabId ? creatorById(state, collabId) : undefined;
  const fee = c ? Math.round(clamp(c.subs * 0.015, 300, 60_000) * (tier === 1 ? 1 : tier === 2 ? 0.6 : 0.35)) : 0;
  const days = Math.max(1, def.days - (ed ? Math.floor(ed.skill / 40) : 0));
  return { quality: Math.round(quality), cast: Math.round(cast), host: host === null ? null : Math.round(host), prod: Math.round(prod), novelty, cost, days, fee, notes };
}
export const qualityLabel = (q: number) => (q >= 80 ? 'Outstanding' : q >= 68 ? 'Great' : q >= 56 ? 'Good' : q >= 44 ? 'Decent' : q >= 32 ? 'Weak' : 'Poor');
export const qualityColor = (q: number) => (q >= 68 ? '#22c55e' : q >= 56 ? '#84cc16' : q >= 44 ? '#c8aa6e' : q >= 32 ? '#f97316' : '#ef4444');

// ------------------------------------------------------------------ producing
export function produce(state: GameState, f: OrgFormat, pids: string[], useHost: boolean, budget: number, collabId?: string): { ok: boolean; message: string } {
  const team = state.teams[state.userTeamId];
  const ch = channelOf(state);
  const def = FORMATS[f];
  if (!def) return { ok: false, message: 'Unknown format.' };
  const ps = pids.map((id) => state.players[id]).filter((p): p is Player => !!p && p.teamId === team.id);
  if (ps.length < def.min || ps.length > def.max) return { ok: false, message: def.min === def.max ? `${def.label}: pick exactly ${def.min} player.` : `${def.label}: pick ${def.min}–${def.max} players.` };
  if (ch.queue.length >= capacity(team)) return { ok: false, message: `The studio is busy (${capacity(team)} production${capacity(team) > 1 ? 's' : ''} at a time — upgrade the Content Studio for more).` };
  const away = ps.find((p) => (state.people?.players[p.id]?.away?.until ?? '') >= state.date);
  if (away) return { ok: false, message: `${away.handle} is away.` };
  if (def.collab && !collabId) return { ok: false, message: 'Pick a creator to collab with.' };
  const est = estimate(state, f, pids, useHost, budget, collabId);
  const total = est.cost + est.fee;
  if (team.balance < total) return { ok: false, message: 'Not enough money for this production.' };
  addLedger(state, team, 'Content production', -est.cost, def.label);
  if (est.fee) addLedger(state, team, 'Content production', -est.fee, `Collab fee: ${creatorById(state, collabId!)?.channel ?? 'creator'}`);
  const rng = new RNG(hashString(state.date + f + pids.join()) ^ state.seq);
  const ctx = titleCtx(state, team, ps, collabId);
  const title = pickFilled(rng, ORG_TITLES[f], ctx) || `${team.short} ${def.label}`;
  for (const p of ps) {
    p.fatigue = clamp(p.fatigue + def.fatigue * (p.traits.includes('content_machine') ? 0.6 : 1), 0, 100);
    (ch.shoots[p.id] ??= []).push(state.date);
    ch.shoots[p.id] = ch.shoots[p.id].filter((d) => d > addDays(state.date, -14));
  }
  const prodn: ContentProduction = { id: `prod_${state.seq++}`, format: f, title, players: ps.map((p) => p.id), host: useHost && !!hostOf(ch) && def.host > 0, budget, cost: total, started: state.date, ready: addDays(state.date, est.days), q: est.quality, collab: collabId };
  ch.queue.push(prodn);
  const when = new Date(prodn.ready + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return { ok: true, message: `Filming “${title}” — it goes up on ${when}.` };
}

function titleCtx(state: GameState, team: Team, ps: Player[], collabId?: string): Ctx {
  const ctx: Ctx = { ...baseCtx(state, team), season: state.season };
  if (ps[0]) ctx.player = ps[0].handle;
  if (ps[1]) ctx.player2 = ps[1].handle;
  if (ps.length) ctx.players = ps.length === 1 ? ps[0].handle : `${ps.slice(0, -1).map((p) => p.handle).join(', ')} and ${ps[ps.length - 1].handle}`;
  const h = hostOf(contentState(state).channel);
  if (h) ctx.host = h.name;
  const c = collabId ? creatorById(state, collabId) : undefined;
  if (c) { ctx.creator = c.name; ctx.channel = c.channel; }
  const next = Object.values(state.fixtures).filter((f) => !f.result && (f.teamA === team.id || f.teamB === team.id) && f.date >= state.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const o = state.teams[(next.teamA === team.id ? next.teamB : next.teamA) ?? ''];
    if (o) { ctx.opp = o.name; ctx.oppShort = o.short; }
    const comp = state.competitions[next.competitionId];
    if (comp) ctx.event = comp.name.replace(/\s\d{4}$/, '');
  }
  return ctx;
}
const pickFilled = (rng: RNG, lines: readonly string[] | undefined, ctx: Ctx) => {
  if (!lines?.length) return '';
  for (let i = 0; i < 10; i++) { const t = fill(rng.pick(lines), ctx); if (t) return t; }
  return '';
};

// ------------------------------------------------------------------ release
function release(state: GameState, rng: RNG, team: Team, ch: ClubChannel, pr: ContentProduction) {
  const f = pr.format as OrgFormat;
  const def = FORMATS[f];
  const ps = pr.players.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const quality = clamp(pr.q + rng.normal(0, 7 * Math.sqrt(def.viral)), 1, 99);
  // a big match coming up makes a hype trailer land
  const big = def.hype ? Object.values(state.fixtures).some((x) => !x.result && (x.teamA === team.id || x.teamB === team.id) && x.date >= state.date && x.date <= addDays(state.date, 7) && (() => { const c = state.competitions[x.competitionId]; return !!c && (c.tier === 0 || c.kind === 'playoffs' || (x.label ?? '').includes('Final')); })()) : false;
  // controversy: loose lips on camera (low media savvy, Foot-in-Mouth, Trash Talker, Rage Typer)
  let controversy: Player | undefined;
  for (const p of ps) {
    const s = personaOf(p);
    const risk = def.risk * (0.04 + Math.max(0, 45 - s.media) / 250 + (p.traits.includes('foot_in_mouth') ? 0.12 : 0) + (p.traits.includes('trash_talker') ? 0.06 : 0) + (p.traits.includes('rage_typer') ? 0.05 : 0) - (p.traits.includes('media_darling') ? 0.03 : 0));
    if (rng.chance(Math.max(0, risk))) { controversy = p; break; }
  }
  const h = pr.host ? hostOf(ch) : undefined;
  const c = pr.collab ? creatorById(state, pr.collab) : undefined;
  // subscribers, the club's fans, the host's and a collab partner's followings, plus what the platforms show strangers
  const audience = ch.subs * 0.07 + team.fans * 0.012 + (h ? h.fame * 0.08 : 0) + (c ? c.subs * 0.12 : 0) + 600;
  const star = 1 + Math.min(0.6, ps.reduce((s, p) => s + Math.max(0, p.reputation - 55) / 150 + (p.streamer ? 0.05 : 0), 0));
  const viralP = clamp(0.01 + Math.max(0, quality - 62) * 0.006 * def.viral, 0, 0.35);
  const viral = rng.chance(viralP);
  const flop = !viral && quality < 34;
  let views = audience * Math.pow(quality / 55, 1.6) * (0.6 + ch.momentum / 125) * (0.75 + team.hype / 200) * def.reach * star * Math.exp(rng.normal(0, 0.25));
  if (viral) views *= 2.5 + rng.next() * 3;
  if (controversy) views *= 1.4;
  if (big) views *= 1.3;
  views = Math.max(30, Math.round(views));
  const likes = Math.round(views * (0.02 + quality / 2000) * (controversy ? 0.6 : 1));
  // a channel can't outgrow its club forever: conversion slows as subscribers approach the fan base
  const subs = Math.round(views * (0.004 + quality / 8000) * (viral ? 1.5 : 1) * (flop ? 0.3 : 1) * Math.max(0.1, 1 - ch.subs / (team.fans * 0.8 + 5000)));
  const fans = Math.round(Math.min(views * 0.004 * (quality / 60) * def.reach, team.fans * 0.015));
  const tier = tierOf(state, team);
  const revenue = Math.round(views / 1000 * CPM[tier]);
  ch.subs += subs;
  ch.views += views;
  ch.momentum = clamp(ch.momentum + quality / 10 - 2 + (viral ? 10 : 0) - (flop ? 2 : 0), 0, 100);
  ch.community = clamp(ch.community + def.diehard * quality / 50 + (controversy ? -3 : 0), 0, 100);
  addFans(team, fans);
  if (revenue) addLedger(state, team, 'Club channel', revenue, pr.title);
  // buzz: results drive hype; content nudges it (a hype trailer before a big match more)
  team.hype = clamp(team.hype + clamp((quality - 55) / 40, -0.6, 0.8) * (def.hype && big ? def.hype : 1) + (viral ? 1.5 : 0), 0, 100);
  const fm = fanMood(state, team.id);
  fm.mood = clamp(fm.mood + (quality - 50) / 30 + (viral ? 2 : 0) - (controversy ? 3 : 0), -100, 100);
  if (def.merch) ch.merch = { until: addDays(state.date, 21), boost: clamp(quality / 400, 0.02, 0.25) };
  // the people on camera
  for (const p of ps) {
    const s = personaOf(p);
    ch.appear[p.id] = (ch.appear[p.id] ?? 0) + (def.bond ?? 1) * (quality / 60);
    p.reputation = clamp(p.reputation + 0.15 * (def.rep ?? 0.5) * (quality / 55) + (viral ? 0.5 : 0), 1, 100);
    let mood = 0.5 + (s.online - 50) / 60 + (p.traits.includes('content_machine') ? 1.5 : 0) + (p.traits.includes('camera_shy') ? -2.5 : 0) + (viral ? 1 : 0) + (flop ? -0.5 : 0);
    if (p === controversy) mood -= 3;
    p.morale = clamp(p.morale + mood, 5, 100);
    if (p.streamer && p.persona) p.persona.followers = Math.round((p.persona.followers ?? 0) + subs * 0.3);
  }
  // what happened in it, and what people said
  const bucket = quality >= 64 ? 'great' : quality >= 42 ? 'ok' : 'bad';
  const ctx = titleCtx(state, team, ps, pr.collab);
  const highlight = pickFilled(rng, ORG_HIGHLIGHTS[f]?.[bucket], ctx) || '';
  const cpool = ORG_COMMENTS[controversy ? 'controversy' : viral ? 'viral' : bucket];
  const up: ContentUpload = {
    id: `up_${state.seq++}`, format: f, title: pr.title, date: state.date, players: pr.players, host: h?.name, collab: pr.collab,
    quality: Math.round(quality), views, likes, subs, fans, revenue, highlight,
    comments: comments(state, rng, team, controversy ? -1 : quality >= 56 ? 1 : quality < 40 ? -1 : 0, ctx, views, cpool),
    viral: viral || undefined, flop: flop || undefined, controversy: controversy?.id,
  };
  ch.uploads.unshift(up);
  if (ch.uploads.length > 40) ch.uploads.length = 40;
  registerOrgTemplates();
  const scen = controversy ? 'org_controversy' : viral ? 'org_viral' : flop ? 'org_flop' : quality >= 56 ? 'org_good' : null;
  if (scen) {
    const pc = { ...ctx, upload: pr.title, player: controversy?.handle ?? ctx.player };
    for (let i = 0, n = viral || controversy ? rng.int(2, 3) : 1; i < n; i++) emit(state, rng, team, scen, pc, { playerId: controversy?.id ?? ps[0]?.id, replyChance: 0.35 });
  }
  // creators notice the big ones
  contentEvent(state, 'upload', { upload: pr.title, tone: controversy ? -1 : quality >= 64 ? 1 : quality < 40 ? -1 : 0, p: viral ? 0.65 : controversy ? 0.6 : quality >= 70 ? 0.25 : flop ? 0.2 : 0.08, ...(ps[0] ? { pid: ps[0].id } : {}) });
  if (controversy) contentEvent(state, 'drama', { pid: controversy.id, p: 0.5 });
  if (controversy || viral) {
    addInbox(state, { from: 'Media team', kind: 'media', subject: controversy ? `Controversy: ${controversy.handle} on “${pr.title}”` : `Viral: “${pr.title}” (${fmtN(views)} views)`, body: controversy ? `${controversy.handle} said something on camera that the internet didn't take well. Fans are upset and the clips are everywhere — expect a creator or two to cover it.` : `Our ${def.label.toLowerCase()} blew up: ${fmtN(views)} views, +${fmtN(subs)} subscribers, about +${fmtN(fans)} fans. The channel's momentum is way up.` });
  }
}
const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

// ------------------------------------------------------------------ crew
const CREW_COUNTRY: Record<string, string[]> = { KR: ['KR'], CN: ['CN', 'TW'], EMEA: ['DE', 'FR', 'ES', 'UK', 'PL', 'SE', 'DK'], NA: ['US', 'CA'], BR: ['BR'], APAC: ['VN', 'JP', 'TW', 'PH'] };
/** This month's available hosts and editors (deterministic per club and month). */
export function crewPool(state: GameState): ContentCrew[] {
  const ch = channelOf(state);
  const month = state.date.slice(0, 7);
  if (ch.pool?.month === month) return ch.pool.list;
  const team = state.teams[state.userTeamId];
  const tier = tierOf(state, team);
  const rng = new RNG(hashString(`${team.id}:crew:${month}`));
  const codes = CREW_COUNTRY[team.region] ?? ['US'];
  const list: ContentCrew[] = [];
  for (let i = 0; i < 9; i++) {
    const role = i < 5 ? 'host' : 'editor';
    const code = rng.pick(codes);
    const ns = (NAMES as Record<string, { country: string; order: string; first: string[]; last: string[] }>)[code] ?? NAMES.US;
    const first = rng.pick(ns.first), last = rng.pick(ns.last);
    const name = ns.order === 'family-first' ? `${last} ${first}` : `${first} ${last}`;
    const n = (m: number, sd: number) => clamp(Math.round(rng.normal(m, sd)), 15, 98);
    const grade = rng.next(); // a couple of stars, mostly solid, a few cheap rookies
    const lift = grade > 0.82 ? 18 : grade > 0.4 ? 6 : -6;
    const crew: ContentCrew = {
      id: `crew_${month}_${i}_${hashString(name).toString(36).slice(0, 3)}`, name, country: ns.country, role,
      charisma: n(58 + lift, 12), humor: n(55 + lift, 14), looks: n(58 + lift * 0.6, 13), smarts: n(55, 14), skill: n(55 + lift, 12),
      fame: Math.round(Math.exp(rng.normal(Math.log(tier === 1 ? 40_000 : tier === 2 ? 8_000 : 2_000) + lift / 12, 0.9))), salary: 0,
    };
    const q = role === 'host' ? hostScore(crew) : crew.skill;
    crew.salary = Math.round(CREW_SALARY[tier] * Math.pow(q / 60, 2.2) * (1 + Math.log10(Math.max(1, crew.fame)) / 20) / 50) * 50;
    list.push(crew);
  }
  ch.pool = { month, list };
  return list;
}
export function hireCrew(state: GameState, id: string): { ok: boolean; message: string } {
  const ch = channelOf(state);
  const c = crewPool(state).find((x) => x.id === id);
  if (!c) return { ok: false, message: 'No longer available.' };
  const cur = ch.crew.find((x) => x.role === c.role);
  if (cur) return { ok: false, message: `You already have a ${c.role === 'host' ? 'host' : 'editor'} — let ${cur.name} go first.` };
  ch.crew.push({ ...c, hired: state.date });
  ch.pool!.list = ch.pool!.list.filter((x) => x.id !== id);
  const team = state.teams[state.userTeamId];
  addLedger(state, team, 'Content crew', -Math.round(c.salary / 2), `Signing: ${c.name}`);
  return { ok: true, message: `${c.name} joins as ${c.role === 'host' ? 'host / MC' : 'video editor'} (${Math.round(c.salary).toLocaleString()} a month).` };
}
export function fireCrew(state: GameState, id: string): { ok: boolean; message: string } {
  const ch = channelOf(state);
  const c = ch.crew.find((x) => x.id === id);
  if (!c) return { ok: false, message: 'Not on the crew.' };
  ch.crew = ch.crew.filter((x) => x.id !== id);
  addLedger(state, state.teams[state.userTeamId], 'Content crew', -c.salary, `Severance: ${c.name}`);
  return { ok: true, message: `${c.name} has left the club (one month's pay as severance).` };
}

// ------------------------------------------------------------------ daily
/** Daily (endDay): creator videos, then the club channel — releases, decay, salaries, the odd nudge from fans. */
export function contentDaily(state: GameState, prev: string) {
  const team = state.teams[state.userTeamId];
  if (!team) return;
  const cs = contentState(state);
  creatorsDaily(state, prev);
  const ch = cs.channel;
  const rng = new RNG(hashString(state.date + ':channel') ^ state.seq);
  for (const pr of ch.queue.filter((q) => q.ready <= state.date)) release(state, rng, team, ch, pr);
  ch.queue = ch.queue.filter((q) => q.ready > state.date);
  // the platforms forget a quiet channel; fans drift away more slowly
  ch.momentum = Math.max(0, ch.momentum * 0.975);
  ch.community = Math.max(0, ch.community * 0.99);
  if (weekday(state.date) === 1) {
    for (const k of Object.keys(ch.appear)) { ch.appear[k] *= 0.95; if (ch.appear[k] < 0.05 || state.players[k]?.teamId !== team.id) delete ch.appear[k]; }
    // a quiet channel gets noticed
    const last = ch.uploads[0]?.date ?? '';
    if (team.facilities.contentStudio >= 1 && last < addDays(state.date, -21) && (cs.flags.drought ?? '') < addDays(state.date, -28) && rng.chance(0.5)) {
      cs.flags.drought = state.date;
      registerOrgTemplates();
      for (let i = 0; i < 2; i++) emit(state, rng, team, 'org_drought', baseCtx(state, team), { replyChance: 0.3 });
    }
  }
  if (state.date.slice(8) === '01') for (const c of ch.crew) addLedger(state, team, 'Content crew', -c.salary, c.name);
}
