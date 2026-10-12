// Save games in IndexedDB, gzip-compressed (CompressionStream).
import { get, set, del, keys } from 'idb-keyval';
import { ensureMasteryScale } from '../engine/mastery';
import { ensureRatingScale } from '../engine/management/potential';
import { ensureFanbase } from '../engine/management/fanbase';
import type { GameState } from '../engine/types';

export interface SaveMeta { id: string; name: string; team: string; teamId: string; date: string; savedAt: number; size: number; custom?: boolean }

async function gzip(text: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([text]);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
async function gunzip(blob: Blob): Promise<string> {
  if (typeof DecompressionStream === 'undefined') return blob.text();
  try {
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    return blob.text();
  }
}

export async function saveGame(state: GameState): Promise<SaveMeta> {
  const text = JSON.stringify(state);
  const blob = await gzip(text);
  await set(`save:${state.id}`, blob);
  const meta: SaveMeta = { id: state.id, name: state.saveName, team: state.teams[state.userTeamId]?.name ?? '', teamId: state.userTeamId, date: state.date, savedAt: Date.now(), size: blob.size };
  await set(`meta:${state.id}`, meta);
  return meta;
}

export async function loadGame(id: string): Promise<GameState | null> {
  const blob = (await get(`save:${id}`)) as Blob | undefined;
  if (!blob) return null;
  const state = JSON.parse(await gunzip(blob)) as GameState;
  ensureMasteryScale(state); // saves from before the 0..200 champion comfort scale
  ensureRatingScale(state); // …and before the 0..200 rating / potential scale
  ensureFanbase(state); // …and before die-hard fans
  return state;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('meta:'));
  const metas = await Promise.all(ks.map((k) => get(k) as Promise<SaveMeta>));
  return metas.filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(id: string) {
  await del(`save:${id}`);
  await del(`meta:${id}`);
}

/** Export a save as a downloadable file. */
export async function exportSave(state: GameState) {
  const blob = await gzip(JSON.stringify(state));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.saveName.replace(/[^a-z0-9]+/gi, '_')}_${state.date}.lolsave`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importSave(file: File): Promise<GameState> {
  const text = await gunzip(file);
  const state = JSON.parse(text) as GameState;
  ensureMasteryScale(state);
  ensureRatingScale(state);
  ensureFanbase(state);
  return state;
}

// custom content library (players/teams created in the editor, reusable across saves)
export async function getCustomLibrary(): Promise<{ players: unknown[]; teams: unknown[] }> {
  return ((await get('custom-library')) as { players: unknown[]; teams: unknown[] }) ?? { players: [], teams: [] };
}
export async function setCustomLibrary(lib: { players: unknown[]; teams: unknown[] }) { await set('custom-library', lib); }
