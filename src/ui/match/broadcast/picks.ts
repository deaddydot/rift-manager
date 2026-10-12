// What's notable about each pick of a game (after the draft): off-meta, off-role, troll/cheese, signature and legacy
// picks, one-tricks on their main, low comfort or a first time this season, counter picks and risky blinds,
// patch buffs/nerfs, a champion that lost last time, and Fearless pools running dry. Pure function of the save, the
// draft order (when known) and the picks; read by the stream chat (chatPicks.ts) and the caster desk.
import type { GameState, Role, Player } from '../../../engine/types';
import type { DraftState } from '../../../engine/draft/draft';
import { gd, matchupEdge } from '../../../data/gamedata';

// ------------------------------------------------------------------ comfort scale (0..200)
export type ComfortTier = 'unfamiliar' | 'learning' | 'comfortable' | 'mastered' | 'signature';
/** Upper bounds of each tier on the 0..200 comfort scale (~100 = solid soloQ, 120-150 pro, 160+ signature). */
export const COMFORT_BOUNDS: [ComfortTier, number][] = [['unfamiliar', 60], ['learning', 100], ['comfortable', 130], ['mastered', 165], ['signature', Infinity]];
export function comfortTier(v: number | undefined): ComfortTier {
  const x = v ?? 0;
  for (const [t, max] of COMFORT_BOUNDS) if (x < max) return t;
  return 'signature';
}
export const COMFORT_LABEL: Record<ComfortTier, string> = { unfamiliar: 'barely played it', learning: 'still learning it', comfortable: 'comfortable on it', mastered: 'mastered it', signature: 'signature pick' };

// ------------------------------------------------------------------ curated lists
/** Picks pro viewers instantly read as cheese / troll in these roles ('any' = any role). */
const TROLL: Record<string, Role[] | 'any'> = {
  Teemo: 'any', Singed: 'any', Shaco: 'any', MasterYi: 'any', Garen: 'any', Tryndamere: 'any', Heimerdinger: 'any',
  Yuumi: ['top', 'jungle', 'mid', 'adc'], Pyke: ['top', 'jungle', 'mid', 'adc'], Soraka: ['top', 'jungle', 'mid', 'adc'], Sona: ['top', 'jungle', 'mid'],
  Taric: ['top', 'jungle', 'mid', 'adc'], Zilean: ['top', 'jungle', 'adc'], Nunu: ['top', 'mid', 'adc', 'support'], TahmKench: ['jungle', 'mid', 'adc'],
  Nasus: ['jungle', 'mid', 'adc', 'support'], Sion: ['jungle', 'adc'], Twitch: ['top', 'jungle', 'mid', 'support'], Karthus: ['top', 'mid', 'adc', 'support'],
  Malphite: ['jungle', 'adc'], Janna: ['top', 'jungle', 'mid', 'adc'], Ivern: ['top', 'mid', 'adc', 'support'], Rammus: ['top', 'mid', 'adc', 'support'],
  Kayle: ['jungle', 'adc', 'support'], Veigar: ['adc', 'support', 'top'], Brand: ['jungle', 'adc', 'top'], Udyr: ['mid', 'adc', 'support'],
};
/** High-risk, flashy champions: chat loves them when they pop off and roasts them when they feed. */
export const FLASHY = new Set(['Draven', 'Yasuo', 'Yone', 'Riven', 'Katarina', 'Akali', 'Zed', 'Samira', 'Irelia', 'Qiyana', 'Fiora', 'LeeSin', 'Nidalee', 'Kalista', 'Vayne', 'Lucian', 'Talon', 'Ekko', 'Fizz', 'Leblanc', 'Sylas', 'Kaisa', 'Aphelios', 'Nilah']);
/** Player–champion pairings with history ("Faker on Ryze"). Matched on the player's handle. */
const LEGACY: Record<string, string[]> = {
  Faker: ['Ryze', 'Leblanc', 'Azir', 'Zed', 'Ahri', 'Galio', 'Orianna', 'Syndra', 'Corki', 'TwistedFate', 'Sylas'],
  Keria: ['Bard', 'Thresh', 'Rakan', 'Renata'], Caps: ['Leblanc', 'Sylas'], Canyon: ['Nidalee', 'Graves'], Chovy: ['Yone', 'Azir'], ShowMaker: ['Syndra'],
};

// ------------------------------------------------------------------ notes
export type PickKind =
  | 'troll' | 'offrole' | 'offmeta' | 'signature' | 'legacy' | 'onetrick' | 'first' | 'lowcomfort' | 'counter' | 'countered'
  | 'blindmeta' | 'riskyblind' | 'lostlast' | 'revenge' | 'buffed' | 'nerfed' | 'flashy' | 'fearless' | 'hotrecord' | 'coldrecord';
export interface PickNote {
  kind: PickKind;
  side: 0 | 1;
  idx: number;            // sim champion idx (-1 for team-level notes like Fearless)
  role: Role;
  player: string;
  champ: string;          // display name
  champId: string;
  weight: number;         // how interesting (0..1.2)
  ctx: Record<string, string | number | undefined>;
}
export interface PickReport { notes: PickNote[]; byIdx: Map<number, PickNote[]>; comfort: Map<number, number>; tier: Map<number, ComfortTier> }

export interface PickChamp { idx: number; side: 0 | 1; role: Role; playerId: string; name: string; championId: string; mastery?: number }
export interface PickInput {
  champs: PickChamp[];
  teams: [{ id: string; short: string }, { id: string; short: string }];
  state?: GameState | null;
  draft?: DraftState | null;
  patchPower?: Record<string, number>;
  locked?: number;        // Fearless: champions already used in the series
  gameNo?: number;
  bestOf?: number;
}

const ROLE_WORD: Record<Role, string> = { top: 'top', jungle: 'jungle', mid: 'mid', adc: 'bot', support: 'support' };
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Comfort (0..200) of a player on a champion: the save first, the game's own estimate otherwise. */
function comfortOf(p: Player | undefined, c: PickChamp): number {
  const v = p?.champions?.[c.championId];
  if (typeof v === 'number') return v;
  return c.mastery ?? 70;
}

export function analyzePicks(inp: PickInput): PickReport {
  const notes: PickNote[] = [];
  const comfort = new Map<number, number>(), tier = new Map<number, ComfortTier>();
  const data = gd();
  const order = new Map<string, number>(); // champion id -> pick order in the draft
  if (inp.draft) inp.draft.actions.forEach((a, i) => { if (a.type === 'pick' && a.champion) order.set(a.champion, i); });
  const add = (c: PickChamp, kind: PickKind, weight: number, ctx: PickNote['ctx'] = {}) => {
    const ch = data.championById[c.championId];
    const opp = inp.champs.find((x) => x.side !== c.side && x.role === c.role);
    notes.push({
      kind, side: c.side, idx: c.idx, role: c.role, player: c.name, champ: ch?.name ?? c.championId, champId: c.championId, weight,
      ctx: { player: c.name, champ: ch?.name ?? c.championId, role: ROLE_WORD[c.role], team: inp.teams[c.side].short, oteam: inp.teams[1 - c.side].short, opp: opp?.name, oppchamp: opp ? data.championById[opp.championId]?.name : undefined, ...ctx },
    });
  };
  for (const c of inp.champs) {
    const ch = data.championById[c.championId];
    if (!ch) continue;
    const p = inp.state?.players[c.playerId];
    const v = comfortOf(p, c);
    const t = comfortTier(v);
    comfort.set(c.idx, v); tier.set(c.idx, t);
    const meta = ch.meta;
    const games = meta?.games || 10000;
    const roleRate = meta ? (meta.byRole?.[c.role] ?? 0) / games : ch.positions.includes(c.role) ? 0.01 : 0;
    const roleShare = meta && meta.picks ? (meta.byRole?.[c.role] ?? 0) / meta.picks : ch.positions.includes(c.role) ? 0.6 : 0;
    const presence = meta?.presence ?? 0.05;
    const troll = TROLL[c.championId];
    const isTroll = troll === 'any' || (Array.isArray(troll) && troll.includes(c.role));
    const offRole = !ch.positions.includes(c.role) && roleShare < 0.05;
    const seasonGames = p?.season?.games ?? 0;
    const onChamp = p?.season?.champions?.[c.championId];
    const ctxBase = { comfort: Math.round(v), tier: COMFORT_LABEL[t], presence: pct(presence), prate: roleRate < 0.001 ? 'almost never' : `${(roleRate * 100).toFixed(1)}% of games` };
    if (isTroll) add(c, 'troll', 1.05, ctxBase);
    else if (offRole) add(c, 'offrole', 0.9, { ...ctxBase, mainrole: ROLE_WORD[ch.positions[0] ?? c.role] });
    else if (roleRate < 0.002 && presence < 0.06) add(c, 'offmeta', roleRate < 0.0005 ? 0.75 : 0.55, ctxBase);
    // comfort: legacy pairings, signature mastery, one-tricks, first time / low comfort
    const legacy = !!p && (LEGACY[p.handle]?.includes(c.championId) || (v >= 192 && p.reputation >= 97 && p.career.reduce((a, x) => a + x.titles.length, 0) >= 3));
    if (legacy && v >= 140) add(c, 'legacy', 1.0, ctxBase);
    else if (t === 'signature') add(c, 'signature', 0.55 + Math.min(0.3, (v - 165) / 120), ctxBase);
    if (p) {
      const pool = Object.entries(p.champions).sort((a, b) => b[1] - a[1]);
      const top = pool[0], second = pool[1];
      const seasonShare = onChamp && seasonGames >= 6 ? onChamp.games / seasonGames : 0;
      if ((top && top[0] === c.championId && (!second || top[1] - second[1] >= 28)) || seasonShare >= 0.5) add(c, 'onetrick', 0.7, { ...ctxBase, share: seasonShare ? pct(seasonShare) : undefined, sgames: onChamp?.games });
      if (seasonGames >= 4 && !onChamp?.games && !isTroll) add(c, 'first', t === 'unfamiliar' || t === 'learning' ? 0.6 : 0.42, { ...ctxBase, sgames: seasonGames });
      if ((t === 'unfamiliar' || t === 'learning') && !isTroll) add(c, 'lowcomfort', t === 'unfamiliar' ? 0.8 : 0.55, ctxBase);
      // the last time they played it
      const last = p.history.find((h) => h.champion === c.championId);
      if (last && !last.win) {
        const vsSame = last.vs === inp.teams[1 - c.side].id;
        add(c, vsSame ? 'revenge' : 'lostlast', vsSame ? 0.6 : 0.4, { ...ctxBase, lastkda: `${last.k}/${last.d}/${last.a}`, lastvs: inp.state?.teams[last.vs]?.short ?? last.vs });
      }
      if (onChamp && onChamp.games >= 3) {
        const wr = onChamp.wins / onChamp.games;
        if (wr >= 0.75 || wr <= 0.25) add(c, wr >= 0.75 ? 'hotrecord' : 'coldrecord', 0.36, { ...ctxBase, rec: `${onChamp.wins}-${onChamp.games - onChamp.wins}`, sgames: onChamp.games });
      }
    }
    // lane matchup & draft order
    const opp = inp.champs.find((x) => x.side !== c.side && x.role === c.role);
    if (opp) {
      const edge = matchupEdge(c.championId, opp.championId, c.role);
      const mine = order.get(c.championId), theirs = order.get(opp.championId);
      if (edge >= 0.04 && mine !== undefined && theirs !== undefined && mine > theirs) {
        add(c, 'counter', 0.6 + edge, { ...ctxBase, edge: pct(0.5 + edge / 2) });
        add(opp as PickChamp, 'countered', 0.35, { edge: pct(0.5 + edge / 2), by: c.name, bychamp: ch.name });
      }
      if (mine !== undefined && theirs !== undefined && mine < theirs && mine <= 10) {
        if (presence >= 0.4 && ch.profile.blind >= 6) add(c, 'blindmeta', 0.38, ctxBase);
        else if (ch.profile.blind <= 3 && edge <= 0) add(c, 'riskyblind', 0.45, ctxBase);
      }
    }
    const pw = inp.patchPower?.[c.championId] ?? 0;
    if (pw >= 0.05) add(c, 'buffed', 0.32, { ...ctxBase, patch: inp.state?.patch });
    else if (pw <= -0.05) add(c, 'nerfed', 0.42, { ...ctxBase, patch: inp.state?.patch });
    if (FLASHY.has(c.championId) && !isTroll) add(c, 'flashy', 0.22, ctxBase);
  }
  if ((inp.locked ?? 0) >= 20 && (inp.gameNo ?? 1) >= 3) {
    for (const side of [0, 1] as const) {
      const c = inp.champs.find((x) => x.side === side);
      if (c) notes.push({ kind: 'fearless', side, idx: -1, role: c.role, player: '', champ: '', champId: '', weight: 0.5 + Math.min(0.4, ((inp.locked ?? 0) - 20) / 50), ctx: { team: inp.teams[side].short, oteam: inp.teams[1 - side].short, locked: inp.locked, gameno: inp.gameNo } });
    }
  }
  notes.sort((a, b) => b.weight - a.weight);
  const byIdx = new Map<number, PickNote[]>();
  for (const n of notes) { const l = byIdx.get(n.idx) ?? []; l.push(n); byIdx.set(n.idx, l); }
  return { notes, byIdx, comfort, tier };
}

/** The most interesting notes, at most one per player and `max` in total (troll/legacy always make it). */
export function headlineNotes(r: PickReport, max = 5): PickNote[] {
  const out: PickNote[] = [], seen = new Set<number>();
  for (const n of r.notes) {
    if (out.length >= max) break;
    if (n.idx >= 0 && seen.has(n.idx)) continue;
    if (n.weight < 0.3) continue;
    out.push(n);
    if (n.idx >= 0) seen.add(n.idx);
  }
  return out;
}
/** Pick kinds that make a champion "weird" for mid-game reactions ("the Teemo pick is working??"). */
export const WEIRD: Set<PickKind> = new Set(['troll', 'offrole', 'offmeta', 'lowcomfort', 'first', 'riskyblind']);
