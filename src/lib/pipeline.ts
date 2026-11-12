"use client";
import type { SourceReading, Track } from "./types";
import { useStore, uid } from "./store";
import { computeConsensus } from "./consensus";
import { analyzeAudio, analyzePreview, readTags } from "./audio";
import { splitArtistTitle, type ParsedTrack } from "./parsers/text";
import { estimateEnergy } from "./energy";
import { normalizeName, cleanTitle, splitVersion } from "./match";

// Arquivos locais ficam só em memória (não podem ser persistidos)
const files = new Map<string, File>();

const CONCURRENCY = 3;
let running = 0;
const queue: (() => Promise<void>)[] = [];

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}
function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => { running--; pump(); });
  }
}

export function dedupeKey(t: { title: string; artist: string }) {
  return normalizeName(`${t.artist} ${cleanTitle(t.title)}`);
}

function blankTrack(p: Partial<Track> & { title: string; artist: string; origin: Track["origin"] }): Track {
  return { id: uid(), readings: [], keyConfidence: "none", bpmConfidence: "none", status: "pending", ...p };
}

export function addAudioFiles(list: File[]) {
  const st = useStore.getState();
  const existing = new Set(st.tracks.map((t) => t.fileName));
  const tracks: Track[] = [];
  for (const f of list) {
    if (existing.has(f.name)) continue;
    const at = splitArtistTitle(f.name);
    const t = blankTrack({ title: at.title, artist: at.artist, fileName: f.name, origin: "audio", status: "analyzing", statusText: "Na fila" });
    files.set(t.id, f);
    tracks.push(t);
  }
  st.addTracks(tracks);
  tracks.forEach((t) => enqueue(() => processTrack(t.id)));
  return tracks.length;
}

export function addParsedTracks(list: ParsedTrack[], origin: Track["origin"] = "list") {
  const st = useStore.getState();
  const existing = new Set(st.tracks.map(dedupeKey));
  const tracks: Track[] = [];
  for (const p of list) {
    const k = dedupeKey(p);
    if (existing.has(k)) continue;
    existing.add(k);
    const readings: SourceReading[] = [];
    if (p.key || p.bpm) readings.push({ source: "list", label: "Sua lista", key: p.key, bpm: p.bpm, durationSec: p.durationSec });
    if (p.sourceUrl) readings.push({ source: "link", label: `Link (${p.sourceLabel ?? "colado"})`, coverUrl: p.coverUrl, durationSec: p.durationSec, isrc: p.isrc, previewUrl: p.previewUrl, url: p.sourceUrl });
    tracks.push(blankTrack({
      title: p.title, artist: p.artist, version: p.version ?? splitVersion(p.title).version, durationSec: p.durationSec,
      key: p.key, bpm: p.bpm, energy: p.energy, manualEnergy: p.energy != null, fileName: p.fileName,
      genres: p.genre ? [p.genre] : undefined, origin, readings,
      coverUrl: p.coverUrl, isrc: p.isrc, previewUrl: p.previewUrl,
      keyConfidence: p.key ? "medium" : "none", bpmConfidence: p.bpm ? "medium" : "none",
    }));
  }
  st.addTracks(tracks);
  tracks.forEach((t) => enqueue(() => processTrack(t.id)));
  return { added: tracks.length, skipped: list.length - tracks.length };
}

export function reprocess(id: string) {
  useStore.getState().updateTrack(id, (t) => ({ status: "pending", readings: t.readings.filter((r) => ["list", "tags", "essentia"].includes(r.source)) }));
  enqueue(() => processTrack(id));
}

export function resumePending() {
  useStore.getState().tracks.filter((t) => t.status === "pending").forEach((t) => enqueue(() => processTrack(t.id)));
}

const get = (id: string) => useStore.getState().tracks.find((t) => t.id === id);
const upd = (id: string, p: Partial<Track>) => useStore.getState().updateTrack(id, p);

function applyConsensus(id: string) {
  const t = get(id);
  if (!t) return;
  const c = computeConsensus(t.readings);
  const patch: Partial<Track> = {
    keyConfidence: c.keyConfidence, bpmConfidence: c.bpmConfidence,
    coverUrl: t.coverUrl?.startsWith("data:") ? t.coverUrl : c.coverUrl ?? t.coverUrl,
    previewUrl: c.previewUrl ?? t.previewUrl, isrc: t.isrc ?? c.isrc,
    durationSec: t.durationSec ?? c.durationSec, genres: c.genres ?? t.genres,
  };
  if (!t.manualKey) patch.key = c.key;
  if (!t.manualBpm) patch.bpm = c.bpm;
  if (!t.manualEnergy) {
    const merged = { ...t, ...patch };
    patch.energy = c.energy != null ? Math.round(((c.energy + estimateEnergy(merged)) / 2) * 10) / 10 : estimateEnergy(merged);
  }
  upd(id, patch);
}

function addReadings(id: string, rs: SourceReading[]) {
  const t = get(id);
  if (!t) return;
  const ids = new Set(rs.map((r) => r.source));
  upd(id, { readings: [...t.readings.filter((r) => !ids.has(r.source)), ...rs] });
}

async function processTrack(id: string) {
  let t = get(id);
  if (!t) return;
  try {
    // 1) arquivo de áudio: tags + análise local
    const file = files.get(id);
    if (file && !t.readings.some((r) => r.source === "essentia")) {
      upd(id, { status: "analyzing", statusText: "Lendo tags…" });
      const tags = await readTags(file).catch(() => ({} as Awaited<ReturnType<typeof readTags>>));
      const fromName = splitArtistTitle(file.name);
      const title = tags.title || fromName.title;
      const artist = tags.artist || fromName.artist;
      upd(id, {
        title, artist, version: splitVersion(title).version, durationSec: tags.durationSec ?? t.durationSec,
        coverUrl: tags.coverDataUrl ?? t.coverUrl, genres: tags.genres, isrc: tags.isrc,
      });
      if (tags.key || tags.bpm) addReadings(id, [{ source: "tags", label: "Tags do arquivo", key: tags.key, bpm: tags.bpm, coverUrl: tags.coverDataUrl }]);
      upd(id, { statusText: "Analisando áudio (key/BPM)…" });
      try {
        const a = await analyzeAudio(await file.arrayBuffer());
        addReadings(id, [{ source: "essentia", label: "Análise do áudio", key: a.key, bpm: a.bpm }]);
        upd(id, { loudness: a.loudness, danceability: a.danceability, durationSec: get(id)?.durationSec ?? a.durationSec });
      } catch (e) {
        addReadings(id, [{ source: "essentia", label: "Análise do áudio", error: `Formato não decodificável no navegador (${(e as Error).message})` }]);
      }
      applyConsensus(id);
    }

    // 2) fontes online
    t = get(id)!;
    upd(id, { status: "looking-up", statusText: "Buscando nas plataformas…" });
    const r = await fetch("/api/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t.title, artist: t.artist, version: t.version, durationSec: t.durationSec, isrc: t.isrc }),
    });
    if (r.ok) {
      const { readings } = (await r.json()) as { readings: SourceReading[] };
      addReadings(id, readings);
    }
    applyConsensus(id);

    // 3) sem arquivo e sem key/BPM confiável → analisa a prévia de 30 s
    t = get(id)!;
    const weak = (c: Track["keyConfidence"]) => c === "none" || c === "low";
    if (!files.has(id) && t.previewUrl && (weak(t.keyConfidence) || weak(t.bpmConfidence))) {
      upd(id, { statusText: "Analisando prévia de 30 s…" });
      try {
        const a = await analyzePreview(t.previewUrl);
        addReadings(id, [{ source: "essentia-preview", label: "Análise da prévia (30 s)", key: a.key, bpm: a.bpm }]);
        upd(id, { danceability: a.danceability });
      } catch (e) {
        addReadings(id, [{ source: "essentia-preview", label: "Análise da prévia (30 s)", error: (e as Error).message }]);
      }
      applyConsensus(id);
    }
    upd(id, { status: "done", statusText: undefined });
  } catch (e) {
    upd(id, { status: "error", statusText: (e as Error).message });
  }
}

export function hasLocalFile(id: string) {
  return files.has(id);
}
