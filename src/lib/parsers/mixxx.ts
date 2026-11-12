"use client";
/**
 * Leitura da biblioteca do Mixxx (mixxxdb.sqlite) no navegador, com sql.js (SQLite em WASM).
 * Traz título, artista, duração, BPM, key (análise do próprio Mixxx), gênero e o caminho do
 * arquivo — além das playlists e crates, para importar só uma parte.
 * Esquema: https://github.com/mixxxdj/mixxx/blob/main/res/schema.xml
 */
import type { ParsedTrack } from "./text";
import { pcToCamelot, parseKey } from "../camelot";
import { normalizeBpm } from "../bpm";

/** ChromaticKey do Mixxx (src/proto/keys.proto): 1–12 maiores (C…B), 13–24 menores (Cm…Bm) */
const MAJ_PC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export function mixxxKeyIdToCamelot(id?: number | null): string | undefined {
  if (!id || id < 1 || id > 24) return undefined;
  return id <= 12 ? pcToCamelot(MAJ_PC[id - 1], false) : pcToCamelot(id - 13, true);
}

export interface MixxxGroup { kind: "playlist" | "crate"; name: string; trackIdx: number[] }
export interface MixxxLibrary { tracks: ParsedTrack[]; groups: MixxxGroup[] }

export async function readMixxxDb(buf: ArrayBuffer): Promise<MixxxLibrary> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: () => "/sqljs/sql-wasm-browser.wasm" });
  const db = new SQL.Database(new Uint8Array(buf));
  try {
    const cols = new Set((db.exec("PRAGMA table_info(library)")[0]?.values ?? []).map((r) => String(r[1])));
    if (!cols.has("title")) throw new Error("Este arquivo não parece ser uma biblioteca do Mixxx (mixxxdb.sqlite).");
    const sel = [
      "l.id", "l.title", "l.artist", "l.duration", "l.bpm", "l.genre",
      cols.has("key") ? "l.key" : "NULL", cols.has("key_id") ? "l.key_id" : "NULL", "tl.location", "tl.filename",
    ].join(", ");
    const res = db.exec(`SELECT ${sel} FROM library l LEFT JOIN track_locations tl ON tl.id = l.location WHERE COALESCE(l.mixxx_deleted, 0) = 0 ORDER BY l.id`);
    const rows = res[0]?.values ?? [];
    const idToIdx = new Map<number, number>();
    const tracks: ParsedTrack[] = rows.map((r, i) => {
      const [id, title, artist, duration, bpm, genre, keyText, keyId, location, filename] = r as [number, string, string, number, number, string, string, number, string, string];
      idToIdx.set(id, i);
      const file = filename || (location ? String(location).split(/[\\/]/).pop() : undefined);
      return {
        title: title || (file ? String(file).replace(/\.[^.]+$/, "") : "Sem título"),
        artist: artist || "",
        durationSec: duration ? Math.round(duration) : undefined,
        bpm: normalizeBpm(bpm),
        key: mixxxKeyIdToCamelot(keyId) ?? parseKey(keyText),
        genre: genre || undefined,
        fileName: file || undefined,
        filePath: location || undefined,
        sourceLabel: "Mixxx",
      };
    });
    const groups: MixxxGroup[] = [];
    const q = (sql: string) => db.exec(sql)[0]?.values ?? [];
    try {
      for (const [pid, name] of q("SELECT id, name FROM Playlists WHERE COALESCE(hidden, 0) = 0 ORDER BY position, name")) {
        const ids = q(`SELECT track_id FROM PlaylistTracks WHERE playlist_id = ${Number(pid)} ORDER BY position`).map((r) => idToIdx.get(Number(r[0]))).filter((x): x is number => x != null);
        if (ids.length) groups.push({ kind: "playlist", name: String(name), trackIdx: ids });
      }
    } catch { /* bibliotecas antigas */ }
    try {
      for (const [cid, name] of q("SELECT id, name FROM crates ORDER BY name")) {
        const ids = q(`SELECT track_id FROM crate_tracks WHERE crate_id = ${Number(cid)}`).map((r) => idToIdx.get(Number(r[0]))).filter((x): x is number => x != null);
        if (ids.length) groups.push({ kind: "crate", name: String(name), trackIdx: ids });
      }
    } catch { /* sem crates */ }
    return { tracks, groups };
  } finally {
    db.close();
  }
}
