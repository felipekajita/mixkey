"use client";
/**
 * Cache das buscas nas plataformas, guardado no navegador (IndexedDB).
 * Evita consultar Deezer/Spotify/Apple Music/etc. de novo para faixas já buscadas
 * (faixas repetidas, playlists reimportadas, backups restaurados).
 */
import { createStore, get, set, del, clear, keys } from "idb-keyval";
import type { SourceReading } from "./types";
import { normalizeName } from "./match";

const TTL = 1000 * 60 * 60 * 24 * 30; // 30 dias
let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore("mixkey-cache", "lookups"));

export interface PreviewAnalysis { platform: string; key?: string; bpm?: number; danceability?: number; mlKey?: string; mlConf?: number }

export interface CachedLookup {
  at: number;
  readings: SourceReading[];
  previews?: PreviewAnalysis[];
}

// "v2": versão do formato (v1 não tinha ReccoBeats sem chave nem várias prévias)
export const cacheKey = (t: { title: string; artist: string; isrc?: string }) =>
  `v3|${normalizeName(t.artist)}|${normalizeName(t.title)}`;

/** Links assinados (ex.: prévias do Deezer com "hdnea=") expiram em minutos — não vale guardar */
const expiring = (u?: string) => !!u && /hdnea=|[?&](exp|expires|Expires|token)=/.test(u);
// erros passageiros não devem ficar guardados por 30 dias
const transient = (r: SourceReading) => !!r.error && r.error !== "Não encontrado";

export async function getCached(t: { title: string; artist: string }): Promise<CachedLookup | null> {
  try {
    const c = await get<CachedLookup>(cacheKey(t), db());
    if (!c) return null;
    if (Date.now() - c.at > TTL) { await del(cacheKey(t), db()); return null; }
    return c;
  } catch {
    return null;
  }
}

export async function putCached(t: { title: string; artist: string }, patch: Partial<Omit<CachedLookup, "at">>) {
  try {
    const prev = (await get<CachedLookup>(cacheKey(t), db())) ?? { at: Date.now(), readings: [] };
    const readings = (patch.readings ?? prev.readings)
      .filter((r) => !transient(r))
      .map((r) => (expiring(r.previewUrl) ? { ...r, previewUrl: undefined } : r));
    await set(cacheKey(t), { ...prev, ...patch, readings, at: patch.readings ? Date.now() : prev.at }, db());
  } catch { /* navegador sem IndexedDB (ex.: aba anônima restrita) */ }
}

export async function cacheSize(): Promise<number> {
  try { return (await keys(db())).length; } catch { return 0; }
}

export async function clearCache() {
  try { await clear(db()); } catch { /* ignore */ }
}
