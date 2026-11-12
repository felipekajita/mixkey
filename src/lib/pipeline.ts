"use client";
import type { SourceReading, Track } from "./types";
import { useStore, uid } from "./store";
import { computeConsensus } from "./consensus";
import { analyzeAudio, analyzePreview, readTags } from "./audio";
import { splitArtistTitle, type ParsedTrack } from "./parsers/text";
import { estimateEnergy } from "./energy";
import { normalizeName, cleanTitle, splitVersion } from "./match";
import { getCached, putCached, type PreviewAnalysis } from "./lookupCache";
import { rescoreSequence } from "./sequencer";
import type { StorePayload } from "./store-import/parse";
import type { StoreTrack } from "./store-import/extract";
import { parseKey } from "./camelot";
import { matchScore } from "./match";

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
    if ((p.key || p.bpm) && p.sourceLabel === "Mixxx") readings.push({ source: "mixxx", label: "Mixxx (sua análise)", key: p.key, bpm: p.bpm, durationSec: p.durationSec, genres: p.genre ? [p.genre] : undefined });
    else if (p.key || p.bpm) readings.push({ source: "list", label: "Sua lista", key: p.key, bpm: p.bpm, durationSec: p.durationSec });
    if (p.sourceUrl && p.sourceLabel !== "Mixxx") readings.push({ source: "link", label: `Link (${p.sourceLabel ?? "colado"})`, coverUrl: p.coverUrl, durationSec: p.durationSec, isrc: p.isrc, previewUrl: p.previewUrl, url: p.sourceUrl });
    tracks.push(blankTrack({
      title: p.title, artist: p.artist, version: p.version ?? splitVersion(p.title).version, durationSec: p.durationSec,
      key: p.key, bpm: p.bpm, energy: p.energy, manualEnergy: p.energy != null, fileName: p.fileName,
      genres: p.genre ? [p.genre] : undefined, origin, readings,
      coverUrl: p.coverUrl, isrc: p.isrc, previewUrl: p.previewUrl, filePath: p.filePath,
      keyConfidence: p.key ? "medium" : "none", bpmConfidence: p.bpm ? "medium" : "none",
    }));
  }
  st.addTracks(tracks);
  tracks.forEach((t) => enqueue(() => processTrack(t.id)));
  return { added: tracks.length, skipped: list.length - tracks.length };
}

/** "Buscar novamente": ignora o cache e descarta as edições manuais de key/BPM/energia */
export function reprocess(id: string) {
  useStore.getState().updateTrack(id, (t) => ({
    status: "pending", manualKey: false, manualBpm: false, manualEnergy: false,
    readings: t.readings.filter((r) => ["list", "tags", "essentia", "okscan", "link", "mixxx"].includes(r.source) || r.source.startsWith("store-") || r.source.startsWith("essentia-listen") || r.source.startsWith("okscan-listen")),
  }));
  enqueue(() => processTrack(id, true));
}

export function resumePending() {
  useStore.getState().tracks.filter((t) => t.status === "pending").forEach((t) => enqueue(() => processTrack(t.id)));
}

const get = (id: string) => useStore.getState().tracks.find((t) => t.id === id);
const upd = (id: string, p: Partial<Track>) => useStore.getState().updateTrack(id, p);

/** BPM típico da biblioteca (mediana das outras faixas com BPM de confiança alta) */
function libraryBpm(exceptId: string): number | undefined {
  const bs = useStore.getState().tracks.filter((t) => t.id !== exceptId && t.bpm && t.bpmConfidence === "high").map((t) => t.bpm!).sort((a, b) => a - b);
  return bs.length >= 5 ? bs[Math.floor(bs.length / 2)] : undefined;
}

/** Ao abrir o app: aplica as regras atuais a tudo que já estava salvo (faixas e sets) */
export function refreshAll() {
  recomputeAll();
  const st = useStore.getState();
  const map = new Map(st.tracks.map((t) => [t.id, t]));
  if (st.sequences.length) useStore.setState({ sequences: st.sequences.map((q) => rescoreSequence(q, map, st.options.maxPitch)) });
}

/** Recalcula key/BPM de toda a biblioteca com as regras atuais (sem buscar nada de novo) */
export function recomputeAll() {
  for (const t of useStore.getState().tracks) if (t.status === "done" && t.readings.length) applyConsensus(t.id);
}

function applyConsensus(id: string) {
  const t = get(id);
  if (!t) return;
  const c = computeConsensus(t.readings, t.genres, libraryBpm(id));
  const patch: Partial<Track> = {
    keyConfidence: c.keyConfidence, bpmConfidence: c.bpmConfidence,
    coverUrl: t.coverUrl?.startsWith("data:") ? t.coverUrl : c.coverUrl ?? t.coverUrl,
    previewUrl: c.previewUrl ?? t.previewUrl, isrc: t.isrc ?? c.isrc,
    durationSec: t.durationSec ?? c.durationSec, genres: c.genres ?? t.genres,
  };
  if (!t.manualKey) patch.key = c.key;
  if (!t.manualBpm) { patch.bpm = c.bpm; patch.bpmNote = c.bpmNote; }
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

async function processTrack(id: string, force = false) {
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
        const segNote = a.segments && a.segments > 1 ? `faixa inteira em ${a.segments} trechos; key igual em ${a.keyAgree}/${a.segments}` : undefined;
        addReadings(id, [{ source: "essentia", label: "Análise do áudio (MixKey)", key: a.key, bpm: a.bpm, note: segNote }, ...mlReading("okscan", "IA OpenKeyScan (arquivo)", a)]);
        upd(id, { loudness: a.loudness, danceability: a.danceability, durationSec: get(id)?.durationSec ?? a.durationSec });
      } catch (e) {
        addReadings(id, [{ source: "essentia", label: "Análise do áudio", error: `Formato não decodificável no navegador (${(e as Error).message})` }]);
      }
      applyConsensus(id);
    }

    // 2) fontes online (ou o cache do navegador, se a faixa já foi buscada)
    t = get(id)!;
    const cached = force ? null : await getCached(t);
    if (cached) {
      upd(id, { status: "looking-up", statusText: "Usando dados já buscados…" });
      addReadings(id, cached.readings);
      if (cached.previews?.length && !files.has(id)) {
        addReadings(id, cached.previews.flatMap(previewReading));
        upd(id, { danceability: cached.previews.find((p) => p.danceability != null)?.danceability });
      }
    } else {
      upd(id, { status: "looking-up", statusText: "Buscando nas plataformas…" });
      const r = await fetch("/api/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t.title, artist: t.artist, version: t.version, durationSec: t.durationSec, isrc: t.isrc, spotifyId: spotifyIdOf(t) }),
      });
      if (r.ok) {
        const { readings } = (await r.json()) as { readings: SourceReading[] };
        addReadings(id, readings);
        await putCached(t, { readings, previews: undefined });
      }
    }
    applyConsensus(id);

    // 3) sem arquivo e sem key/BPM com confiança alta → analisa prévias de 30 s de
    //    plataformas diferentes (trechos/codificações diferentes) e deixa o consenso votar
    t = get(id)!;
    const analyzed = new Set(t.readings.filter((r) => r.source.startsWith("essentia-preview-") && !r.error).map((r) => r.source));
    const needs = t.keyConfidence !== "high" || t.bpmConfidence !== "high";
    if (!files.has(id) && needs && analyzed.size < MAX_PREVIEWS) {
      const done: PreviewAnalysis[] = [];
      for (const p of previewCandidates(t).filter((p) => !analyzed.has(`essentia-preview-${p.platform}`)).slice(0, MAX_PREVIEWS - analyzed.size)) {
        upd(id, { statusText: `Analisando prévia (${PREVIEW_LABEL[p.platform]})…` });
        try {
          const a = await analyzePreview(p.url);
          const pa: PreviewAnalysis = { platform: p.platform, key: a.key, bpm: a.bpm, danceability: a.danceability, mlKey: a.mlKey, mlConf: a.mlConf };
          done.push(pa);
          addReadings(id, previewReading(pa));
          if (a.danceability != null) upd(id, { danceability: a.danceability });
        } catch (e) {
          addReadings(id, [{ source: `essentia-preview-${p.platform}`, label: `Prévia ${PREVIEW_LABEL[p.platform]} (30 s)`, error: (e as Error).message }]);
        }
        applyConsensus(id);
      }
      if (done.length) {
        const prev = (await getCached(t))?.previews ?? [];
        await putCached(t, { previews: [...prev.filter((x) => !done.some((d) => d.platform === x.platform)), ...done] });
      }
    }
    upd(id, { status: "done", statusText: undefined });
  } catch (e) {
    upd(id, { status: "error", statusText: (e as Error).message });
  }
}

// ---------- prévias ----------
const MAX_PREVIEWS = 3;
const PREVIEW_LABEL: Record<string, string> = { deezer: "Deezer", apple: "Apple Music", spotify: "Spotify", outra: "streaming" };

function previewPlatform(url: string): string {
  if (/dzcdn\.net|deezer/.test(url)) return "deezer";
  if (/scdn\.co|spotify/.test(url)) return "spotify";
  if (/apple\.com|mzstatic/.test(url)) return "apple";
  return "outra";
}

/** Prévias disponíveis, uma por plataforma (Deezer primeiro: costuma ser o melhor trecho) */
function previewCandidates(t: Track): { platform: string; url: string }[] {
  const urls = [t.previewUrl, ...t.readings.filter((r) => !r.error && r.previewUrl && (r.matchScore == null || r.matchScore >= 0.78)).map((r) => r.previewUrl!)].filter(Boolean) as string[];
  const by = new Map<string, string>();
  for (const u of urls) { const p = previewPlatform(u); if (!by.has(p)) by.set(p, u); }
  return ["deezer", "apple", "spotify", "outra"].filter((p) => by.has(p)).map((p) => ({ platform: p, url: by.get(p)! }));
}

function previewReading(p: PreviewAnalysis): SourceReading[] {
  const label = PREVIEW_LABEL[p.platform] ?? p.platform;
  return [
    { source: `essentia-preview-${p.platform}`, label: `Prévia ${label} (30 s)`, key: p.key, bpm: p.bpm },
    ...mlReading(`okscan-preview-${p.platform}`, `IA OpenKeyScan (prévia ${label})`, { mlKey: p.mlKey, mlConf: p.mlConf }),
  ];
}

/** Leitura da IA de key (OpenKeyScan), quando ela rodou */
function mlReading(source: string, label: string, a: { mlKey?: string; mlConf?: number }): SourceReading[] {
  if (!a.mlKey) return [];
  return [{ source, label, key: a.mlKey, note: `confiança ${Math.round((a.mlConf ?? 0) * 100)}%` }];
}

/** ID do Spotify, se a faixa veio de um link do Spotify (permite cruzar direto na ReccoBeats) */
function spotifyIdOf(t: Track): string | undefined {
  const u = t.readings.find((r) => r.source === "link")?.url ?? "";
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]+)/.exec(u)?.[1];
}

/** Título como as lojas mostram: "Cola (Original Mix)" — "Original Mix"/"Extended Mix" viram versão */
export function storeTitle(t: StoreTrack) {
  return t.mix && !/^original mix$/i.test(t.mix) ? `${t.title} (${t.mix})` : t.title;
}

function storeReading(store: string, t: StoreTrack): SourceReading {
  return {
    source: `store-${store.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, label: `${store} (loja)`,
    key: parseKey(t.key), bpm: t.bpm, coverUrl: t.coverUrl, isrc: t.isrc, durationSec: t.durationSec,
    genres: t.genre ? [t.genre] : undefined, url: t.url,
    matchedTitle: storeTitle(t), matchedArtist: t.artists,
    note: [t.label && `selo ${t.label}`, t.key && `key ${t.key}`].filter(Boolean).join(" · ") || undefined,
  };
}

/**
 * Importa faixas vindas de uma loja (botão "Enviar para o MixKey").
 * Faixas que já existem na biblioteca ganham a leitura da loja (mais um voto);
 * as demais são adicionadas como novas.
 */
export function importStoreTracks(p: StorePayload): { merged: number; added: number } {
  const st = useStore.getState();
  let merged = 0;
  const fresh: ParsedTrack[] = [];
  for (const t of p.tracks) {
    const want = { title: storeTitle(t), artist: t.artists };
    let best: { id: string; s: number } | null = null;
    for (const x of st.tracks) {
      let s = matchScore(x, want);
      if (t.isrc && x.isrc && t.isrc === x.isrc) s = 1;
      if (!best || s > best.s) best = { id: x.id, s };
    }
    if (best && best.s >= 0.85) {
      addReadings(best.id, [storeReading(p.store, t)]);
      applyConsensus(best.id);
      merged++;
    } else {
      fresh.push({ title: want.title, artist: t.artists, durationSec: t.durationSec, coverUrl: t.coverUrl, isrc: t.isrc, sourceUrl: t.url ?? p.url, sourceLabel: p.store, key: undefined, bpm: undefined, genre: t.genre });
    }
  }
  if (fresh.length) {
    const before = new Set(useStore.getState().tracks.map((x) => x.id));
    addParsedTracks(fresh);
    // a leitura da loja entra já na criação, antes da busca nas plataformas
    for (const x of useStore.getState().tracks.filter((x) => !before.has(x.id))) {
      const t = p.tracks.find((s) => storeTitle(s) === x.title && s.artists === x.artist);
      if (t) { addReadings(x.id, [storeReading(p.store, t)]); applyConsensus(x.id); }
    }
  }
  return { merged, added: fresh.length };
}

/** Resultado do "Ouvir e analisar" vira uma leitura da faixa */
export function addListenReading(
  id: string,
  a: { key?: string; bpm?: number; segments?: number; keyAgree?: number; durationSec?: number; danceability?: number; rate?: number; musicSec?: number; mlKey?: string; mlConf?: number },
  kind: "tab" | "mic",
) {
  const rate = a.rate ?? 1;
  const speed = rate !== 1 ? ` a ${String(rate).replace(".", ",")}×` : "";
  addReadings(id, [...mlReading(`okscan-listen-${kind}`, `IA OpenKeyScan (escuta ${kind === "tab" ? "aba" : "microfone"})`, a as { mlKey?: string; mlConf?: number }), {
    source: `essentia-listen-${kind}`,
    label: `Escuta ao vivo (${kind === "tab" ? "aba" : "microfone"})`,
    key: a.key, bpm: a.bpm,
    // acelerar gera pequenos artefatos: 1,5× pesa 10% menos; 2×, 20% menos
    weight: rate >= 2 ? 0.8 : rate >= 1.5 ? 0.9 : 1,
    note: `${Math.round(a.musicSec ?? a.durationSec ?? 0)} s de música${speed} em ${a.segments ?? 1} trecho(s); key igual em ${a.keyAgree ?? 0}/${a.segments ?? 1}`,
  }]);
  if (a.danceability != null) upd(id, { danceability: a.danceability });
  applyConsensus(id);
}

/** Volta campos editados à mão para o valor automático (consenso das fontes) */
export function resetManual(id: string, fields: ("key" | "bpm" | "energy")[]) {
  const patch: Partial<Track> = {};
  if (fields.includes("key")) patch.manualKey = false;
  if (fields.includes("bpm")) patch.manualBpm = false;
  if (fields.includes("energy")) patch.manualEnergy = false;
  upd(id, patch);
  applyConsensus(id);
}

export function hasLocalFile(id: string) {
  return files.has(id);
}
