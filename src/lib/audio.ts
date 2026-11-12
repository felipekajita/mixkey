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

export interface AnalysisResult { key?: string; keyStrength?: number; bpm?: number; bpmConf?: number; danceability?: number; loudness?: number; durationSec?: number }

const SR = 44100;

/** Decodifica e reamostra para 44.1 kHz mono, pegando um trecho representativo */
async function decodeSegment(buf: ArrayBuffer, maxSec: number): Promise<{ samples: Float32Array; duration: number }> {
  const ctx = new OfflineAudioContext(1, SR, SR);
  const audio = await ctx.decodeAudioData(buf);
  const duration = audio.duration;
  const total = audio.length;
  const segLen = Math.min(total, Math.round(maxSec * audio.sampleRate));
  // trecho a partir de ~30% da faixa (evita intro/outro só de percussão)
  const start = total > segLen ? Math.min(Math.round(total * 0.3), total - segLen) : 0;
  const out = new Float32Array(segLen);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < segLen; i++) out[i] += d[start + i] / audio.numberOfChannels;
  }
  return { samples: out, duration };
}

function rmsDb(x: Float32Array) {
  let s = 0;
  for (let i = 0; i < x.length; i += 4) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length / 4) + 1e-12);
}

export async function analyzeAudio(buf: ArrayBuffer, maxSec = 90): Promise<AnalysisResult> {
  const { samples, duration } = await decodeSegment(buf, maxSec);
  const loudness = rmsDb(samples);
  const id = ++seq;
  const res: any = await new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, samples, sampleRate: SR }, [samples.buffer]);
  });
  if (!res.ok) throw new Error(res.error || "Falha na análise");
  let key: string | undefined;
  if (res.key) {
    const pc = NOTE_NAMES_SHARP.indexOf(res.key.replace("Bb", "A#").replace("Eb", "D#").replace("Ab", "G#").replace("Db", "C#").replace("Gb", "F#"));
    if (pc >= 0) key = pcToCamelot(pc, res.scale === "minor");
  }
  return {
    key, keyStrength: res.strength, bpm: normalizeBpm(res.bpm), bpmConf: res.bpmConf,
    danceability: res.danceability, loudness, durationSec: duration,
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
  return analyzeAudio(await r.arrayBuffer(), 30);
}
