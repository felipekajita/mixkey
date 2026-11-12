"use client";
import { pcToCamelot, parseKey, NOTE_NAMES_SHARP } from "./camelot";
import { normalizeBpm } from "./bpm";

export const AUDIO_EXT = /\.(mp3|wav|flac|aiff?|m4a|aac|ogg|oga|opus|wma|alac|mp4|webm)$/i;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: any) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker("/analyzer-worker.js");
    worker.onmessage = (e) => {
      const cb = pending.get(e.data.id);
      if (cb) { pending.delete(e.data.id); cb(e.data); }
    };
  }
  return worker;
}

export interface AnalysisResult { key?: string; keyStrength?: number; bpm?: number; bpmConf?: number; danceability?: number; loudness?: number; durationSec?: number; segments?: number; keyAgree?: number }

const SR = 44100;

/** Decodifica e reamostra para 44.1 kHz mono */
async function decodeMono(buf: ArrayBuffer): Promise<{ data: Float32Array; duration: number }> {
  const ctx = new OfflineAudioContext(1, SR, SR);
  const audio = await ctx.decodeAudioData(buf);
  const out = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < audio.length; i++) out[i] += d[i] / audio.numberOfChannels;
  }
  return { data: out, duration: audio.duration };
}

function rmsDb(x: Float32Array) {
  let s = 0;
  for (let i = 0; i < x.length; i += 4) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length / 4) + 1e-12);
}

async function runWorker(samples: Float32Array): Promise<any> {
  const id = ++seq;
  const res: any = await new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, samples, sampleRate: SR }, [samples.buffer]);
  });
  if (!res.ok) throw new Error(res.error || "Falha na análise");
  return res;
}

function toCamelot(key?: string, scale?: string): string | undefined {
  if (!key) return undefined;
  const pc = NOTE_NAMES_SHARP.indexOf(key.replace("Bb", "A#").replace("Eb", "D#").replace("Ab", "G#").replace("Db", "C#").replace("Gb", "F#"));
  return pc >= 0 ? pcToCamelot(pc, scale === "minor") : undefined;
}

/**
 * Analisa o áudio.
 * - Prévias (≤ 40 s): o trecho inteiro.
 * - Faixas completas: 3 trechos de 60 s (≈15%, 45% e 75% da música) e votação
 *   — key pela soma da "força" de cada trecho, BPM pela mediana (meio/dobro unificados).
 */
export async function analyzeAudio(buf: ArrayBuffer): Promise<AnalysisResult> {
  const { data, duration } = await decodeMono(buf);
  const segLen = Math.min(data.length, 60 * SR);
  const starts = duration <= 40 ? [0] : [0.15, 0.45, 0.75].map((f) => Math.max(0, Math.min(data.length - segLen, Math.round(data.length * f))));
  const results: any[] = [];
  let loud = 0;
  for (const st of starts) {
    const seg = data.slice(st, st + segLen);
    loud += rmsDb(seg) / starts.length;
    results.push(await runWorker(seg));
  }
  // key: votação ponderada pela força
  const kv = new Map<string, number>();
  for (const r of results) {
    const k = toCamelot(r.key, r.scale);
    if (k) kv.set(k, (kv.get(k) ?? 0) + (r.strength ?? 0.5));
  }
  const key = [...kv.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const keyAgree = key ? results.filter((r) => toCamelot(r.key, r.scale) === key).length : 0;
  // BPM: normaliza para a oitava do primeiro e tira a mediana
  const bpms = results.map((r) => normalizeBpm(r.bpm)).filter((b): b is number => !!b);
  const ref = bpms[0];
  const aligned = bpms.map((b) => [b, b * 2, b / 2].sort((x, y) => Math.abs(x - ref) - Math.abs(y - ref))[0]).sort((a, b) => a - b);
  const bpm = aligned.length ? normalizeBpm(aligned[Math.floor(aligned.length / 2)]) : undefined;
  const dance = results.map((r) => r.danceability).filter((d) => d != null);
  return {
    key, bpm, keyStrength: results[0]?.strength, bpmConf: results[0]?.bpmConf,
    danceability: dance.length ? dance.reduce((a: number, b: number) => a + b, 0) / dance.length : undefined,
    loudness: loud, durationSec: duration, segments: results.length, keyAgree,
  };
}

export interface TagInfo { title?: string; artist?: string; key?: string; bpm?: number; durationSec?: number; coverDataUrl?: string; genres?: string[]; isrc?: string }

export async function readTags(file: File): Promise<TagInfo> {
  const { parseBlob } = await import("music-metadata");
  const mm = await parseBlob(file, { duration: false, skipCovers: false });
  const c = mm.common;
  let coverDataUrl: string | undefined;
  const pic = c.picture?.[0];
  if (pic) coverDataUrl = await shrinkImage(new Blob([new Uint8Array(pic.data)], { type: pic.format }), 400).catch(() => undefined);
  return {
    title: c.title, artist: c.artist || c.artists?.join(", "),
    key: parseKey(c.key), bpm: normalizeBpm(c.bpm),
    durationSec: mm.format.duration, coverDataUrl,
    genres: c.genre, isrc: c.isrc?.[0],
  };
}

/** Reduz a capa embutida para um data URL pequeno (persistível) */
async function shrinkImage(blob: Blob, size: number): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Baixa a prévia de 30 s (Deezer tem CORS liberado) e analisa */
export async function analyzePreview(url: string): Promise<AnalysisResult> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Prévia indisponível (${r.status})`);
  return analyzeAudio(await r.arrayBuffer());
}
