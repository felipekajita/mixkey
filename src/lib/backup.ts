"use client";
import { useStore, type SavedSet } from "./store";
import type { Track } from "./types";
import type { SequenceResult, SequenceOptions } from "./sequencer";
import { dedupeKey, resumePending } from "./pipeline";
import { download } from "./export";

export interface Backup {
  app: "mixkey";
  version: 1;
  exportedAt: string;
  tracks: Track[];
  sequences: SequenceResult[];
  saved: SavedSet[];
  options: SequenceOptions;
}

export function exportBackup() {
  const s = useStore.getState();
  const data: Backup = {
    app: "mixkey", version: 1, exportedAt: new Date().toISOString(),
    // estados transitórios voltam a "pendente" para continuar no outro navegador
    tracks: s.tracks.map((t) => (t.status === "done" || t.status === "error" ? t : { ...t, status: "pending" as const })),
    sequences: s.sequences, saved: s.saved, options: s.options,
  };
  const d = new Date().toISOString().slice(0, 10);
  download(`mixkey-backup-${d}.json`, JSON.stringify(data), "application/json");
  return { tracks: data.tracks.length, sets: data.saved.length + data.sequences.length };
}

export async function readBackup(file: File): Promise<Backup> {
  let data: Backup;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Arquivo inválido (não é JSON).");
  }
  if (data?.app !== "mixkey" || !Array.isArray(data.tracks)) throw new Error("Este arquivo não é um backup do MixKey.");
  return data;
}

/** Aplica um backup: "replace" troca tudo; "merge" junta sem duplicar */
export function applyBackup(data: Backup, mode: "replace" | "merge") {
  const st = useStore.getState();
  if (mode === "replace") {
    useStore.setState({ tracks: data.tracks, sequences: data.sequences ?? [], saved: data.saved ?? [], options: { ...st.options, ...data.options }, activeSeq: 0 });
  } else {
    const ids = new Set(st.tracks.map((t) => t.id));
    const keys = new Set(st.tracks.map(dedupeKey));
    const newTracks = data.tracks.filter((t) => !ids.has(t.id) && !keys.has(dedupeKey(t)));
    // sets do backup podem apontar para faixas que já existiam com outro id → mapeia por nome
    const byKey = new Map(st.tracks.map((t) => [dedupeKey(t), t.id]));
    const remap = new Map(data.tracks.map((t) => [t.id, ids.has(t.id) ? t.id : byKey.get(dedupeKey(t)) ?? t.id]));
    const fix = (q: SequenceResult): SequenceResult => ({ ...q, trackIds: q.trackIds.map((id) => remap.get(id) ?? id) });
    const savedIds = new Set(st.saved.map((x) => x.id));
    useStore.setState({
      tracks: [...st.tracks, ...newTracks],
      saved: [...st.saved, ...(data.saved ?? []).filter((x) => !savedIds.has(x.id)).map((x) => ({ ...x, seq: fix(x.seq) }))],
      sequences: st.sequences.length ? st.sequences : (data.sequences ?? []).map(fix),
    });
  }
  resumePending();
}
