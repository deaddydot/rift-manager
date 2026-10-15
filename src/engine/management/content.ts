// Creator content: fictional content creators (analysts, critics, hype channels, tier-list makers, meme pages,
// ex-pros, news channels, coaches) post videos about the user's club — reactions to series, stat breakdowns,
// criticism and praise, hype videos before big matches, role tier lists, power rankings, takes on signings,
// reactions to the club's own uploads, scrim-leak rumours, drama recaps. Bigger clubs draw more and bigger channels.
// A video is stored as a few scenes (narration + what's on screen) so the Content page can play it back, with a
// comment section. Coverage moves things a little: hype and fan mood follow the tone, any publicity brings a few
// casual fans, players called out lose morale (egos and low composure feel it most) and praise lifts them.
// Daily from endDay (game.ts) via contentDaily (orgContent.ts).
import type { ContentState, Creator, CreatorVideo, FanPersona, FanReply, GameState, Player, Role, Team, VideoScene, ClubChannel } from '../types';
import { ROLES } from '../types';
import { RNG, clamp, hashString } from '../../util/rng';
import { addDays, standings } from '../season/formats';
import { overall } from '../setup';
import { addInbox } from './news';
import { fill, fanMood, lineupStrength, baseCtx, emit, type Ctx } from './fans';
import { USERNAMES } from './fanTemplates';
import { boostFans } from './fanbase';
import { ord } from './fixtureinfo';
import { personaOf } from './persona';
import { CREATOR_SEED, VIDEO_TITLES, THUMB_TEXT, INTRO, OUTRO, SEGMENT, PLAYER_VERDICT, TIER_VERDICT, VIDEO_COMMENTS, type Tone, type VideoKind, type CreatorStyle } from './contentTemplates';
import { registerOrgTemplates } from './scrims';

export const MAX_VIDEOS = 60;
const REGION_SUBS: Record<string, number> = { INTL: 900_000, KR: 320_000, CN: 420_000, EMEA: 260_000, NA: 220_000, BR: 160_000, APAC: 120_000 };
const STYLE_SUBS: Record<CreatorStyle, number> = { analyst: 0.7, critic: 1.2, hype: 0.8, ranker: 1.1, meme: 1.3, expro: 1.1, news: 1, coach: 0.55 };
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#84cc16', '#06b6d4'];
export const STYLE_LABEL: Record<CreatorStyle, string> = { analyst: 'Analyst', critic: 'Hot takes', hype: 'Hype', ranker: 'Rankings', meme: 'Memes', expro: 'Ex-pro', news: 'News', coach: 'Coaching' };
export const KIND_LABEL: Record<VideoKind, string> = {
  reaction: 'Reaction', analysis: 'Analysis', criticism: 'Criticism', praise: 'Praise', hype: 'Hype video', tierlist: 'Tier list', powerrank: 'Power rankings',
  roster: 'Roster news', meme: 'Memes', orgreact: 'Reacting to you', scrimleak: 'Scrim leaks', drama: 'Drama', coaching: 'Breakdown',
};

// ------------------------------------------------------------------ state
/** Small channels that follow one lower league (its clubs get most of their coverage there). */
function leagueChannels(state: GameState): Creator[] {
  const out: Creator[] = [];
  for (const l of Object.values(state.leagues)) {
    if (l.tier === 1) continue;
    const r = new RNG(hashString('league-ch:' + l.id));
    const kinds: [string, CreatorStyle, string][] = [
      [`${l.name} Daily`, 'news', `Every result, rumour and roster move in the ${l.name}.`],
      [r.pick([`${l.name} Talk`, `The ${l.name} Show`, `${l.name} Uncut`]), r.pick(['analyst', 'critic', 'hype', 'ranker'] as CreatorStyle[]), `The ${l.name}, taken seriously.`],
    ];
    if (l.tier === 2) kinds.push([r.pick([`${l.name} Memes`, `${l.name} After Dark`]), r.pick(['meme', 'expro'] as CreatorStyle[]), `Lower-league chaos, lovingly clipped.`]);
    kinds.forEach(([channel, style, tagline], k) => {
      const subs = Math.round((l.tier === 2 ? 30_000 : 6_000) * Math.exp(r.normal(0, 0.6)) / 100) * 100;
      out.push({ id: `crl_${l.id}_${k}`, name: channel.replace(/[^A-Za-z0-9]/g, ''), channel, style, region: l.region, subs: Math.max(1500, subs), tagline, color: PALETTE[hashString(channel) % PALETTE.length], league: l.id });
    });
  }
  return out;
}
function makeCreators(state: GameState): Creator[] {
  return [...seedCreators(), ...leagueChannels(state)];
}
function seedCreators(): Creator[] {
  return CREATOR_SEED.map((c, i) => {
    const r = new RNG(hashString('creator:' + c.name));
    const subs = clamp(Math.round((REGION_SUBS[c.region] ?? 150_000) * (STYLE_SUBS[c.style] ?? 1) * Math.exp(r.normal(0, 0.85)) / 100) * 100, 3_000, 6_000_000);
    return { id: `cr_${i}_${hashString(c.name).toString(36).slice(0, 4)}`, name: c.name, channel: c.channel, style: c.style, region: c.region, subs, tagline: c.tagline, color: PALETTE[hashString(c.channel) % PALETTE.length] };
  });
}
function newChannel(state: GameState): ClubChannel {
  const team = state.teams[state.userTeamId];
  const subs = Math.round((team?.fans ?? 10_000) * 0.3 * (0.6 + (team?.facilities.contentStudio ?? 0) * 0.1));
  // an existing club already has some presence: momentum / community start from the studio's routine output
  const base = (team?.facilities.contentStudio ?? 0) * 8;
  return { subs, momentum: base, community: base, views: 0, crew: [], queue: [], uploads: [], appear: {}, shoots: {} };
}
/** The content state (created on first use: the creator pool and the club channel). */
export function contentState(state: GameState): ContentState {
  if (!state.content) state.content = { creators: makeCreators(state), videos: [], channel: newChannel(state), events: [], flags: {} };
  const c = state.content;
  if (!c.creators.length) c.creators = makeCreators(state);
  return c;
}
export const creatorById = (state: GameState, id: string) => state.content?.creators.find((c) => c.id === id);

// ------------------------------------------------------------------ helpers
const ROLE_WORD: Record<Role, string> = { top: 'top laner', jungle: 'jungler', mid: 'mid laner', adc: 'bot laner', support: 'support' };
const toneKey = (t: number): Tone => (t > 0 ? 'pos' : t < 0 ? 'neg' : 'neu');
const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const starters = (state: GameState, team: Team): Player[] => ROLES.map((r) => (team.lineup[r] ? state.players[team.lineup[r]!] : undefined)).filter((p): p is Player => !!p && p.teamId === team.id);

/** A player's season line for captions ({kda}, {wr}, {csm}); empty before he has played. */
function playerLine(p: Player): Ctx {
  const s = p.season;
  if (!s || s.games < 1) return { player: p.handle, role: ROLE_WORD[p.role] };
  return {
    player: p.handle, role: ROLE_WORD[p.role], kda: ((s.kills + s.assists) / Math.max(1, s.deaths)).toFixed(1),
    wr: `${Math.round((s.wins / s.games) * 100)}%`, csm: s.minutes > 0 ? (s.cs / s.minutes).toFixed(1) : undefined, games: s.games,
  };
}
function playerStats(p: Player): VideoScene['stats'] {
  const l = playerLine(p);
  const out: NonNullable<VideoScene['stats']> = [{ label: 'Rating', v: String(overall(p.attributes, p.role)) }];
  if (l.kda) out.push({ label: 'KDA', v: String(l.kda), good: Number(l.kda) >= 3.5 });
  if (l.wr) out.push({ label: 'Win rate', v: String(l.wr), good: parseInt(String(l.wr)) >= 55 });
  if (l.csm && p.role !== 'support' && p.role !== 'jungle') out.push({ label: 'CS/min', v: String(l.csm), good: Number(l.csm) >= 8.5 });
  return out;
}

/** The club's season so far (series and games) from its recorded fixtures. */
export function teamSeason(state: GameState, team: Team) {
  const fx = Object.values(state.fixtures).filter((f) => f.result && (f.teamA === team.id || f.teamB === team.id) && state.competitions[f.competitionId]?.season === state.season).sort((a, b) => a.date.localeCompare(b.date));
  let w = 0, l = 0, gw = 0, gl = 0, kills = 0, deaths = 0, mins = 0, drag = 0, n = 0, streak = 0;
  for (const f of fx) {
    const won = f.result!.winner === team.id;
    if (won) w++; else l++;
    streak = won ? Math.max(1, streak + 1) : Math.min(-1, streak - 1);
    for (const g of f.result!.games) {
      const side = g.blue === team.id ? 0 : 1;
      if (g.winner === team.id) gw++; else gl++;
      kills += g.kills[side]; deaths += g.kills[1 - side]; mins += g.duration / 60; drag += g.dragons[side]; n++;
    }
  }
  const last = fx.slice(-10);
  const recentWr = last.length ? last.filter((f) => f.result!.winner === team.id).length / last.length : 0.5;
  return { w, l, gw, gl, n, kpg: n ? kills / n : 0, dpg: n ? deaths / n : 0, len: n ? mins / n : 0, drag: n ? drag / n : 0, streak, recentWr, played: fx.length };
}

/** League table position this season (active league split, else the last finished one); null before any games. */
export function leaguePosition(state: GameState, team: Team): { rank: number; n: number } | null {
  const comps = Object.values(state.competitions).filter((c) => c.kind === 'league' && c.leagueId === team.leagueId && c.season === state.season && c.teams.includes(team.id) && c.status !== 'upcoming')
    .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || b.startDate.localeCompare(a.startDate));
  const c = comps[0];
  const stage = c?.stages[0];
  if (!stage) return null;
  const rows = standings(stage, state.fixtures);
  if (!rows.some((r) => r.w + r.l > 0)) return null;
  const i = rows.findIndex((r) => r.teamId === team.id);
  return i < 0 ? null : { rank: i + 1, n: rows.length };
}

/** A creator's lean towards a club (-0.4 … 0.4 plus the style: critics sour, hype channels sweet). */
function biasFor(c: Creator, teamId: string) {
  const base = ((hashString(c.id + ':' + teamId) % 1000) / 1000 - 0.5) * 0.8;
  return base + (c.style === 'critic' ? -0.35 : c.style === 'hype' ? 0.35 : c.style === 'meme' ? -0.1 : 0);
}

function nextBigMatch(state: GameState, team: Team) {
  const until = addDays(state.date, 10);
  return Object.values(state.fixtures).filter((f) => !f.result && (f.teamA === team.id || f.teamB === team.id) && f.date >= state.date && f.date <= until)
    .filter((f) => { const c = state.competitions[f.competitionId]; return !!c && (c.tier === 0 || c.kind === 'playoffs' || (f.label ?? '').includes('Final')); })
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

// ------------------------------------------------------------------ who covers the club
const STYLE_KINDS: Record<CreatorStyle, Partial<Record<VideoKind, number>>> = {
  analyst: { analysis: 3, reaction: 1.5, coaching: 1, powerrank: 0.8, tierlist: 0.6, praise: 0.6, criticism: 0.6, roster: 0.8 },
  critic: { criticism: 3, reaction: 1.5, drama: 1.2, roster: 1, powerrank: 0.6, tierlist: 0.8, orgreact: 0.6, scrimleak: 0.5 },
  hype: { hype: 3, praise: 2, reaction: 1.2, roster: 0.8, orgreact: 0.5 },
  ranker: { tierlist: 3, powerrank: 2.5, reaction: 0.6, analysis: 0.5 },
  meme: { meme: 3, reaction: 1, orgreact: 1.4, drama: 0.6 },
  expro: { reaction: 1.5, coaching: 1.2, criticism: 1, praise: 1, tierlist: 0.8, roster: 1, scrimleak: 1 },
  news: { roster: 2.5, drama: 1.5, scrimleak: 1.5, reaction: 1, powerrank: 0.5 },
  coach: { coaching: 3, analysis: 1.5, tierlist: 0.5 },
};

/** Creators who'd cover this club, weighted: same region, plus global channels for big clubs; big channels skip small clubs. */
function coverage(state: GameState, team: Team): { c: Creator; w: number }[] {
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const clubSize = Math.log10(Math.max(1000, team.fans));
  return contentState(state).creators.filter((c) => (c.league ? c.league === team.leagueId : c.region === team.region || c.region === 'INTL')).map((c) => {
    const gap = Math.log10(c.subs) - clubSize - 0.3;
    const w = Math.exp(-Math.max(0, gap) * 1.6) * (c.league ? 3 : c.region === 'INTL' ? (tier === 1 ? 0.6 : 0.12) : 1);
    return { c, w };
  });
}
function pickCreator(rng: RNG, cands: { c: Creator; w: number }[], kind: VideoKind): Creator | null {
  const pool = cands.map((x) => ({ c: x.c, w: x.w * (STYLE_KINDS[x.c.style as CreatorStyle]?.[kind] ?? 0) })).filter((x) => x.w > 0.001);
  return pool.length ? rng.weighted(pool, (x) => x.w).c : null;
}

// ------------------------------------------------------------------ making a video
export interface VideoSeed { kind: VideoKind; tone?: number; data?: Record<string, string | number> }

const line = (rng: RNG, lines: readonly string[] | undefined, ctx: Ctx, fallback = ''): string => {
  if (!lines?.length) return fallback;
  for (let i = 0; i < 8; i++) { const t = fill(rng.pick(lines), ctx); if (t) return t; }
  return fallback;
};
const DURATION: Record<VideoKind, [number, number]> = {
  reaction: [10, 22], analysis: [14, 28], criticism: [9, 20], praise: [8, 16], hype: [3, 6], tierlist: [18, 35], powerrank: [15, 30],
  roster: [7, 14], meme: [6, 12], orgreact: [12, 25], scrimleak: [6, 12], drama: [10, 20], coaching: [12, 24],
};
const KIND_VIEWS: Partial<Record<VideoKind, number>> = { drama: 1.4, tierlist: 1.3, powerrank: 1.15, meme: 1.2, criticism: 1.15, hype: 0.85, coaching: 0.7, analysis: 0.85 };

/** Build one creator video about the user's club (or null if nothing sensible could be said). */
export function makeVideo(state: GameState, rng: RNG, creator: Creator, seed: VideoSeed): CreatorVideo | null {
  const team = state.teams[state.userTeamId];
  if (!team) return null;
  const kind = seed.kind;
  const style = creator.style as CreatorStyle;
  const bias = biasFor(creator, team.id);
  const season = teamSeason(state, team);
  const pos = leaguePosition(state, team);
  const five = starters(state, team);
  if (five.length < 3) return null;
  const ctx: Ctx = { ...baseCtx(state, team), creator: creator.name, channel: creator.channel, season: state.season, wins: season.w, losses: season.l };
  if (pos) { ctx.rank = ord(pos.rank); ctx.n = pos.n; }
  if (season.streak >= 2) ctx.streak = season.streak; else if (season.streak <= -2) ctx.streak = -season.streak;
  for (const [k, v] of Object.entries(seed.data ?? {})) ctx[k] = v;
  // the tone: forced by the kind, or the situation read through the creator's lean
  const lean = (x: number) => (x + bias > 0.45 ? 1 : x + bias < -0.45 ? -1 : 0);
  let tone = seed.tone ?? (kind === 'criticism' || kind === 'drama' ? -1 : kind === 'praise' || kind === 'hype' ? 1 : kind === 'tierlist' ? 0
    : kind === 'analysis' || kind === 'coaching' || kind === 'meme' ? lean((season.recentWr - 0.5) * 2.2)
    : kind === 'powerrank' ? lean(pos ? (0.5 - (pos.rank - 1) / Math.max(1, pos.n - 1)) * 2 : 0) : 0);
  if (seed.tone !== undefined && kind !== 'criticism' && kind !== 'praise') tone = lean(seed.tone * 0.8);
  const scenes: VideoScene[] = [];
  const playerIds: string[] = [];
  const pmark = (p: Player, t: number, cap?: string) => {
    const pc = { ...ctx, ...playerLine(p) };
    scenes.push({ k: 'player', pid: p.id, tone: t, cap: cap ?? line(rng, PLAYER_VERDICT[toneKey(t)], pc, `${p.handle}.`), stats: playerStats(p) });
    if (!playerIds.includes(p.id)) playerIds.push(p.id);
  };
  // the player at the centre of it: the best performer for good news, the weakest for bad
  const graded = five.map((p) => ({ p, g: overall(p.attributes, p.role) + (Number(playerLine(p).kda ?? 3) - 3) * 2 + p.form + rng.normal(0, 4) })).sort((a, b) => b.g - a.g);
  const focus = seed.data?.pid && state.players[String(seed.data.pid)] ? state.players[String(seed.data.pid)] : tone < 0 ? graded[graded.length - 1].p : graded[0].p;
  Object.assign(ctx, playerLine(focus));
  const other = graded.find((x) => x.p !== focus)?.p;
  if (other) ctx.player2 = other.handle;
  const seg = (t = tone) => line(rng, SEGMENT[kind]?.[toneKey(t)] ?? SEGMENT[kind]?.neu, ctx);
  const teamStats = (): VideoScene['stats'] => {
    const out: NonNullable<VideoScene['stats']> = [{ label: 'Series', v: `${season.w}-${season.l}`, good: season.w >= season.l }];
    if (season.n) out.push({ label: 'Game win rate', v: `${Math.round((season.gw / season.n) * 100)}%`, good: season.gw >= season.gl });
    if (season.n) out.push({ label: 'Kills / deaths per game', v: `${season.kpg.toFixed(1)} / ${season.dpg.toFixed(1)}`, good: season.kpg >= season.dpg });
    if (season.n) out.push({ label: 'Avg game time', v: `${Math.floor(season.len)}:${String(Math.round((season.len % 1) * 60)).padStart(2, '0')}` });
    if (pos) out.push({ label: 'League position', v: `${ord(pos.rank)} of ${pos.n}`, good: pos.rank <= Math.ceil(pos.n / 2) });
    return out;
  };

  switch (kind) {
    case 'reaction': {
      const sa = Number(seed.data?.sa ?? 0), sb = Number(seed.data?.sb ?? 0);
      scenes.push({ k: 'score', cap: seg(), score: { a: team.id, b: String(seed.data?.opp ?? ''), sa, sb } });
      pmark(focus, tone);
      scenes.push({ k: 'quote', cap: seg(), big: String(ctx.score ?? `${sa}-${sb}`) });
      break;
    }
    case 'analysis': case 'coaching': {
      scenes.push({ k: 'stat', cap: seg(), stats: teamStats() });
      pmark(focus, tone);
      if (other && rng.chance(0.6)) pmark(other, kind === 'coaching' ? 1 : tone >= 0 ? 1 : 0);
      scenes.push({ k: 'quote', cap: seg() });
      break;
    }
    case 'criticism': {
      scenes.push({ k: 'quote', cap: seg(), big: line(rng, THUMB_TEXT.criticism?.neg, ctx, 'PROBLEM?') });
      pmark(focus, -1);
      scenes.push({ k: 'stat', cap: seg(), stats: teamStats() });
      if (other && rng.chance(0.5)) pmark(other, rng.chance(0.5) ? -1 : 0);
      break;
    }
    case 'praise': {
      pmark(focus, 1);
      scenes.push({ k: 'stat', cap: seg(), stats: teamStats() });
      if (other) pmark(other, 1);
      break;
    }
    case 'hype': {
      const recent = Object.values(state.fixtures).filter((f) => f.result?.winner === team.id && state.competitions[f.competitionId]?.season === state.season).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (recent) { const mine = recent.teamA === team.id; scenes.push({ k: 'score', cap: seg(), score: { a: team.id, b: (mine ? recent.teamB : recent.teamA) ?? '', sa: mine ? recent.result!.scoreA : recent.result!.scoreB, sb: mine ? recent.result!.scoreB : recent.result!.scoreA } }); }
      for (const p of graded.slice(0, 2).map((x) => x.p)) pmark(p, 1);
      scenes.push({ k: 'quote', cap: seg(), big: line(rng, THUMB_TEXT.hype?.pos, ctx, 'LET’S GO') });
      break;
    }
    case 'tierlist': {
      const t = tierList(state, rng, team, creator, focus.role);
      ctx.role = ROLE_WORD[focus.role];
      scenes.push({ k: 'tier', cap: seg(0), tiers: t.rows });
      for (const p of five.filter((q) => q.role === focus.role)) {
        const mine = t.place.get(p.id) ?? 'B';
        scenes.push({ k: 'player', pid: p.id, tone: mine === 'S' || mine === 'A' ? 1 : mine === 'B' ? 0 : -1, cap: line(rng, TIER_VERDICT[mine as keyof typeof TIER_VERDICT], { ...ctx, ...playerLine(p), tier: mine }, `${p.handle}: ${mine} tier.`), stats: playerStats(p), big: mine });
        if (!playerIds.includes(p.id)) playerIds.push(p.id);
        ctx.tier = mine;
      }
      break;
    }
    case 'powerrank': {
      const order = powerRanking(state, rng, team, bias);
      const at = order.indexOf(team.id) + 1;
      ctx.rank = ord(at); ctx.n = order.length;
      tone = lean((0.5 - (at - 1) / Math.max(1, order.length - 1)) * 2);
      scenes.push({ k: 'rank', cap: seg(), teams: order });
      pmark(focus, tone);
      break;
    }
    case 'roster': {
      const p = seed.data?.pid ? state.players[String(seed.data.pid)] : undefined;
      if (!p) return null;
      Object.assign(ctx, playerLine(p));
      scenes.push({ k: 'quote', cap: seg(), big: line(rng, THUMB_TEXT.roster?.[toneKey(tone)], ctx, 'BREAKING') });
      scenes.push({ k: 'player', pid: p.id, tone, cap: line(rng, PLAYER_VERDICT[toneKey(tone)], { ...ctx, ...playerLine(p) }, p.handle), stats: playerStats(p) });
      playerIds.push(p.id);
      scenes.push({ k: 'quote', cap: seg() });
      break;
    }
    case 'orgreact': {
      if (!ctx.upload) return null;
      scenes.push({ k: 'upload', cap: seg(), big: String(ctx.upload) });
      if (seed.data?.pid && state.players[String(seed.data.pid)]) pmark(state.players[String(seed.data.pid)], tone);
      scenes.push({ k: 'quote', cap: seg() });
      break;
    }
    case 'scrimleak': {
      const opp = state.teams[String(seed.data?.opp ?? '')];
      if (!opp) return null;
      ctx.oppShort = opp.short; ctx.opp = opp.name;
      scenes.push({ k: 'quote', cap: seg(), big: line(rng, THUMB_TEXT.scrimleak?.[toneKey(tone)], ctx, 'LEAKED') });
      scenes.push({ k: 'score', cap: seg(), score: { a: team.id, b: opp.id, sa: Number(seed.data?.w ?? 0), sb: Number(seed.data?.l ?? 0) } });
      break;
    }
    case 'drama': case 'meme': default: {
      scenes.push({ k: 'quote', cap: seg(), big: line(rng, THUMB_TEXT[kind]?.[toneKey(tone)], ctx, '') || undefined });
      pmark(focus, tone);
      scenes.push({ k: 'quote', cap: seg() });
      break;
    }
  }
  const title = line(rng, VIDEO_TITLES[kind]?.[toneKey(tone)] ?? VIDEO_TITLES[kind]?.neu, ctx, `${team.short}: ${KIND_LABEL[kind]}`);
  const thumb = line(rng, THUMB_TEXT[kind]?.[toneKey(tone)] ?? THUMB_TEXT[kind]?.neu, ctx, team.short.toUpperCase());
  const body = scenes.filter((s) => s.cap);
  if (!body.length) return null;
  const all: VideoScene[] = [
    { k: 'title', cap: title, big: thumb },
    { k: 'intro', cap: line(rng, INTRO[style], ctx, `${creator.name} here.`) },
    ...body,
    { k: 'outro', cap: line(rng, OUTRO[style], ctx, 'See you in the next one.') },
  ];
  // audience: the creator's subscribers, how much they care about this club, the kind of video
  const interest = clamp(Math.pow(team.fans / creator.subs, 0.25), 0.3, 1.5);
  const views = Math.max(50, Math.round(creator.subs * 0.08 * Math.exp(rng.normal(0, 0.6)) * interest * (KIND_VIEWS[kind] ?? 1) * (0.8 + team.hype / 250)));
  const [d0, d1] = DURATION[kind];
  return {
    id: `vid_${state.seq++}`, creatorId: creator.id, date: state.date, teamId: team.id, kind, tone, title, thumb,
    mins: rng.int(d0, d1), views, likes: Math.round(views * (0.028 + rng.next() * 0.035) * (tone < 0 ? 0.8 : 1)),
    playerIds, scenes: all, comments: comments(state, rng, team, tone, ctx, views),
  };
}

/** A role tier list of the league (creator's view: rating, form, a lean for or against the club, noise). */
function tierList(state: GameState, rng: RNG, team: Team, creator: Creator, role: Role) {
  const bias = biasFor(creator, team.id);
  const cands: { p: Player; v: number }[] = [];
  for (const t of Object.values(state.teams)) {
    if (t.leagueId !== team.leagueId) continue;
    const id = t.lineup[role];
    const p = id ? state.players[id] : undefined;
    if (!p || p.teamId !== t.id) continue;
    const kda = Number(playerLine(p).kda ?? 3);
    cands.push({ p, v: overall(p.attributes, role) + clamp(kda - 3, -2, 3) * 2 + p.form * 0.6 + (t.id === team.id ? bias * 6 : 0) + rng.normal(0, 3) });
  }
  cands.sort((a, b) => b.v - a.v);
  const n = cands.length;
  const cuts = [Math.max(1, Math.round(n * 0.15)), Math.max(1, Math.round(n * 0.25)), Math.max(1, Math.round(n * 0.3)), Math.max(1, Math.round(n * 0.2))];
  const rows: { tier: string; pids: string[] }[] = [];
  const place = new Map<string, string>();
  let i = 0;
  ['S', 'A', 'B', 'C', 'D'].forEach((tier, k) => {
    const take = k < 4 ? cuts[k] : n - i;
    const pids = cands.slice(i, i + take).map((x) => x.p.id);
    i += take;
    for (const id of pids) place.set(id, tier);
    rows.push({ tier, pids });
  });
  return { rows, place };
}

/** League power ranking as a creator sees it. */
function powerRanking(state: GameState, rng: RNG, team: Team, bias: number): string[] {
  const teams = Object.values(state.teams).filter((t) => t.leagueId === team.leagueId);
  const v = new Map(teams.map((t) => {
    const s = teamSeason(state, t);
    return [t.id, lineupStrength(state, t) + (s.recentWr - 0.5) * 12 + (t.id === team.id ? bias * 5 : 0) + rng.normal(0, 2)];
  }));
  return teams.map((t) => t.id).sort((a, b) => v.get(b)! - v.get(a)!);
}

function username(rng: RNG, persona: FanPersona, ctx: Ctx): string {
  const pats = USERNAMES[persona];
  const alnum = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '') || 'Team';
  return rng.pick(pats).replace('{short}', alnum(ctx.short)).replace('{opp}', alnum(ctx.oppShort ?? ctx.rivalShort ?? 'Rival')).replace('{player}', alnum(ctx.player ?? ctx.fav ?? ctx.short)).replace('{n}', String(rng.int(2, 98)));
}
const COMMENT_W: Record<Tone, Partial<Record<FanPersona, number>>> = {
  pos: { diehard: 3, wholesome: 2, casual: 1.5, memer: 1.5, analyst: 1, rival: 1, intl: 0.8, doomer: 0.5, toxic: 0.3, insider: 0.4 },
  neg: { doomer: 2, toxic: 1.2, rival: 2, analyst: 1.5, diehard: 2, memer: 1.5, casual: 1, wholesome: 0.8, intl: 0.6, insider: 0.5 },
  neu: { analyst: 2, diehard: 2, casual: 1.5, memer: 1.5, rival: 1, wholesome: 1, intl: 0.8, doomer: 0.6, toxic: 0.4, insider: 0.6 },
};
/** Comments under a video (shared with the club's own uploads, orgContent.ts). */
export function comments(state: GameState, rng: RNG, team: Team, tone: number, ctx: Ctx, views: number, pool = VIDEO_COMMENTS[toneKey(tone)], n = rng.int(4, 7)): FanReply[] {
  void state; void team;
  const out: FanReply[] = [];
  const w = COMMENT_W[toneKey(tone)];
  const personas = (Object.keys(pool) as FanPersona[]).filter((p) => pool[p]?.length);
  if (!personas.length) return out;
  const used = new Set<string>();
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const persona = rng.weighted(personas, (p) => w[p] ?? 0.5);
    const tpl = rng.pick(pool[persona]!);
    if (used.has(tpl)) continue;
    const text = fill(tpl, ctx);
    if (!text) continue;
    used.add(tpl);
    out.push({ user: username(rng, persona, ctx), persona, text, likes: Math.round(Math.exp(rng.normal(0, 1)) * Math.sqrt(views) * 0.15) });
  }
  return out.sort((a, b) => b.likes - a.likes);
}

// ------------------------------------------------------------------ effects
/** Sensitivity of a player to public criticism (egos and low composure feel it; a psychologist helps — not modelled here). */
const sensitivity = (p: Player) => (1 - p.hidden.composure / 130) * (0.6 + p.hidden.ego / 120);

function applyVideo(state: GameState, rng: RNG, team: Team, v: CreatorVideo) {
  const impact = clamp(v.views / (team.fans * 0.3 + 20_000), 0.02, 1.5);
  team.hype = clamp(team.hype + v.tone * impact * 1.0, 0, 100);
  const fm = fanMood(state, team.id);
  fm.mood = clamp(fm.mood + v.tone * impact * 1.5, -100, 100);
  boostFans(team, 0.0015 * impact * (v.tone >= 0 ? 1 : 0.4)); // any publicity brings a few curious viewers
  const moved = new Map<string, number>();
  for (const s of v.scenes) {
    if (!s.pid || s.tone === undefined) continue;
    const p = state.players[s.pid];
    if (!p || p.teamId !== team.id) continue;
    let d = s.tone > 0 ? 0.8 * impact * (0.5 + p.hidden.ego / 100) : s.tone < 0 ? -1.2 * impact * sensitivity(p) : 0;
    if (v.kind === 'tierlist' && s.big) d = ({ S: 1.5, A: 0.6, B: 0, C: -0.6 - p.hidden.ego / 150, D: -1.2 - p.hidden.ego / 80 } as Record<string, number>)[s.big] * impact;
    const sofar = moved.get(p.id) ?? 0;
    d = clamp(sofar + d, -2.5, 2) - sofar;
    moved.set(p.id, sofar + d);
    p.morale = clamp(p.morale + d, 5, 100);
    p.reputation = clamp(p.reputation + 0.15 * impact * s.tone, 1, 100);
  }
  // fans talk about it
  if (impact > 0.3 && v.tone !== 0) {
    registerOrgTemplates();
    const c = creatorById(state, v.creatorId);
    const pl = v.playerIds?.[0] ? state.players[v.playerIds[0]]?.handle : undefined;
    const ctx = { ...baseCtx(state, team), creator: c?.name, channel: c?.channel, player: pl };
    for (let i = 0, n = impact > 0.8 ? 2 : 1; i < n; i++) emit(state, rng, team, v.tone < 0 ? 'creator_hit_piece' : 'creator_praise', ctx, { playerId: v.playerIds?.[0], replyChance: 0.35 });
  }
  // the media team flags the big ones
  const cs = contentState(state);
  if ((impact >= 0.6 || (v.tone < 0 && impact >= 0.35 && v.playerIds?.length)) && (cs.flags.alert ?? '') < addDays(state.date, -5)) {
    cs.flags.alert = state.date;
    const c = creatorById(state, v.creatorId);
    addInbox(state, { from: 'Media team', kind: 'media', subject: `${c?.channel ?? 'A creator'}: “${v.title}” (${fmtN(v.views)} views)`, body: `${c?.name ?? 'A creator'} (${fmtN(c?.subs ?? 0)} subscribers) posted a ${KIND_LABEL[v.kind as VideoKind].toLowerCase()} video about us. ${v.tone < 0 ? 'It is not kind — the players have seen it.' : v.tone > 0 ? 'The fans are loving it.' : 'Worth a watch.'}\n\nWatch it on the Content page.` });
  }
}

// ------------------------------------------------------------------ daily
/** How many videos a week the club draws on average: tier, audience and buzz. */
export function weeklyCoverage(state: GameState, team: Team): number {
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const base = tier === 1 ? 3 : tier === 2 ? 1.1 : 0.45;
  const bench = tier === 1 ? 1_000_000 : tier === 2 ? 120_000 : 15_000;
  return clamp(base * (0.6 + team.hype / 125) * Math.pow(Math.max(1000, team.fans) / bench, 0.3), 0.15, 7);
}

function publish(state: GameState, rng: RNG, team: Team, seed: VideoSeed, cands: { c: Creator; w: number }[]): CreatorVideo | null {
  const c = pickCreator(rng, cands, seed.kind);
  if (!c) return null;
  const v = makeVideo(state, rng, c, seed);
  if (!v) return null;
  const cs = contentState(state);
  cs.videos.unshift(v);
  if (cs.videos.length > MAX_VIDEOS) cs.videos.length = MAX_VIDEOS;
  applyVideo(state, rng, team, v);
  return v;
}

/** Daily: react to yesterday's series, roster moves and other events; plus the regular flow of videos. */
export function creatorsDaily(state: GameState, prev: string) {
  const team = state.teams[state.userTeamId];
  if (!team) return;
  const cs = contentState(state);
  const rng = new RNG(hashString(state.date + ':creators') ^ state.seq);
  const cands = coverage(state, team);
  const tier = state.leagues[team.leagueId]?.tier ?? 3;
  const reach = tier === 1 ? 1 : tier === 2 ? 0.55 : 0.3;
  let made = 0;
  const go = (seed: VideoSeed, p: number) => { if (made < 3 && rng.chance(p) && publish(state, rng, team, seed, cands)) made++; };
  // yesterday's series
  for (const f of Object.values(state.fixtures)) {
    if (!f.result || f.date !== prev || (f.teamA !== team.id && f.teamB !== team.id)) continue;
    const comp = state.competitions[f.competitionId];
    const big = !!comp && (comp.tier === 0 || comp.kind === 'playoffs' || (f.label ?? '').includes('Final'));
    const won = f.result.winner === team.id;
    const mine = f.teamA === team.id;
    const oppId = (mine ? f.teamB : f.teamA)!;
    const sa = mine ? f.result.scoreA : f.result.scoreB, sb = mine ? f.result.scoreB : f.result.scoreA;
    const opp = state.teams[oppId];
    const upset = opp ? (won ? lineupStrength(state, opp) - lineupStrength(state, team) : lineupStrength(state, team) - lineupStrength(state, opp)) > 5 : false;
    const data = { opp: oppId, oppShort: opp?.short ?? '', score: `${sa}-${sb}`, sa, sb, event: comp?.name.replace(/\s\d{4}$/, '') ?? '' };
    go({ kind: 'reaction', tone: won ? 1 : -1, data }, (0.2 + (big ? 0.45 : 0) + (upset ? 0.25 : 0)) * (0.5 + reach * 0.5) + 0.05);
    if (!won && (big || upset)) go({ kind: 'criticism', data }, 0.35 * reach + 0.1);
    if (won && big) go({ kind: 'praise', data }, 0.3 * reach + 0.1);
  }
  // roster moves
  const now = team.roster.slice();
  if (cs.roster) {
    for (const id of now) if (!cs.roster.includes(id)) go({ kind: 'roster', tone: rosterTone(state, team, id, true), data: { pid: id } }, 0.25 + 0.35 * reach);
    for (const id of cs.roster) if (!now.includes(id) && state.players[id] && !state.players[id].retired) go({ kind: 'roster', tone: rosterTone(state, team, id, false), data: { pid: id } }, 0.2 + 0.3 * reach);
  }
  cs.roster = now;
  // events from other systems (club uploads, scrim leaks, controversies…)
  const evs = cs.events.splice(0, cs.events.length);
  for (const e of evs) {
    if (e.kind === 'upload') go({ kind: 'orgreact', tone: Number(e.data.tone ?? 0), data: e.data }, Number(e.data.p ?? 0.15));
    else if (e.kind === 'scrimleak') go({ kind: 'scrimleak', tone: Number(e.data.w) >= 3 ? 1 : -1, data: e.data }, 0.35);
    else if (e.kind === 'drama') go({ kind: 'drama', data: e.data }, Number(e.data.p ?? 0.5));
  }
  // the regular flow: Poisson-ish around the weekly coverage
  const perDay = weeklyCoverage(state, team) / 7;
  const s = teamSeason(state, team);
  const big = nextBigMatch(state, team);
  for (let i = 0; i < 2; i++) {
    if (!rng.chance(perDay / 2)) continue;
    const kinds: [VideoKind, number][] = [
      ['analysis', 1.2], ['tierlist', 1.1], ['powerrank', 0.9], ['meme', 0.7], ['coaching', 0.6],
      ['criticism', 0.4 + (s.streak <= -2 ? 1.2 : 0) + (s.recentWr < 0.4 ? 0.8 : 0)],
      ['praise', 0.4 + (s.streak >= 3 ? 1.2 : 0) + (s.recentWr > 0.65 ? 0.6 : 0)],
      ['hype', big ? 2.2 : 0.1],
    ];
    const [kind] = rng.weighted(kinds, (k) => k[1]);
    const data: Record<string, string | number> = {};
    if (kind === 'hype' && big) { const c = state.competitions[big.competitionId]; data.event = c?.name.replace(/\s\d{4}$/, '') ?? ''; const o = state.teams[(big.teamA === team.id ? big.teamB : big.teamA) ?? '']; if (o) { data.opp = o.id; data.oppShort = o.short; } }
    go({ kind, data }, 1);
  }
}

/** A signing: good if he's better than the starter at his role; a departure: bad if he was a starter / fan favourite. */
function rosterTone(state: GameState, team: Team, id: string, arrived: boolean): number {
  const p = state.players[id];
  if (!p) return 0;
  const ovr = overall(p.attributes, p.role);
  if (arrived) {
    const cur = team.lineup[p.role] && team.lineup[p.role] !== id ? state.players[team.lineup[p.role]!] : undefined;
    const vs = cur ? overall(cur.attributes, cur.role) : ovr - 5;
    return clamp((ovr - vs) / 8 + (personaOf(p).charisma - 50) / 200, -1, 1);
  }
  return p.reputation > 60 || p.traits.includes('fan_favorite') ? -1 : -0.3;
}
