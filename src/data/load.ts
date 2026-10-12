// Browser data loading (static JSON under /data).
import { setGameData, type GameData } from './gamedata';
import { setMeta } from '../engine/draft/draft';
import { POOL_CACHE } from '../engine/game';
import type { Database } from '../engine/setup';
import type { MatchHistoryEntry } from '../engine/types';

const base = import.meta.env.BASE_URL ?? './';
async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${base}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  return res.json() as Promise<T>;
}

let DB: Database | null = null;
let HISTORY: Record<string, MatchHistoryEntry[]> | null = null;
let META: { games: number; champions: Record<string, { picks: number; wins: number; bans: number; presence: number; byRole: Record<string, number> }> } | null = null;

export async function loadAll(progress: (p: number, label: string) => void): Promise<{ data: GameData; db: Database }> {
  progress(0.05, 'Loading champions');
  const [champions, items, navgrid] = await Promise.all([getJSON<never>('champions.json'), getJSON<never>('items.json'), getJSON<never>('navgrid.json')]);
  const data = setGameData({ champions, items, navgrid });
  POOL_CACHE.ids = data.champions.map((c) => c.id);
  progress(0.4, 'Loading leagues & rosters');
  const [leagues, teams, players, staff, meta] = await Promise.all([
    getJSON<Database['leagues']>('leagues.json'), getJSON<Database['teams']>('teams.json'), getJSON<Database['players']>('players.json'), getJSON<Database['staff']>('staff.json'), getJSON<typeof META>('meta.json'),
  ]);
  META = meta;
  setMeta(meta as never);
  // attach pro meta to champions
  for (const c of data.champions) {
    const m = meta?.champions[c.id];
    if (m) c.meta = { picks: m.picks, bans: m.bans, wins: m.wins, games: meta!.games, presence: m.presence, byRole: m.byRole as never };
  }
  DB = { leagues, teams, players, staff };
  progress(1, 'Ready');
  return { data, db: DB };
}

export const getDB = () => DB!;
export const getMeta = () => META;

/** Real 2026 match history (lazy). */
export async function realHistory(): Promise<Record<string, MatchHistoryEntry[]>> {
  if (!HISTORY) HISTORY = await getJSON('history.json');
  return HISTORY!;
}
