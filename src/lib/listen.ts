"use client";
/**
 * "Ouvir e analisar": capta o áudio que o usuário está tocando — de uma aba do
 * navegador (YouTube, Spotify Web…) ou do microfone — para analisar key/BPM da
 * música inteira. Só funciona com a permissão do usuário; nada é gravado nem enviado:
 * as amostras ficam na memória até a análise (feita no navegador) e depois são descartadas.
 */
import { analyzeSamples, SAMPLE_RATE, type AnalysisResult } from "./audio";

export type ListenKind = "tab" | "mic";

export function supportsTabAudio(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return false;
  const ua = navigator.userAgent;
  // áudio de aba: Chrome/Edge/Opera no computador
  return /Chrome|Chromium|Edg\//.test(ua) && !/Mobile|Android|iPhone|iPad/.test(ua);
}

export function supportsMic(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export interface ListenSession {
  /** para de captar e devolve as amostras (mono, 44,1 kHz) */
  stop(): Float32Array;
  cancel(): void;
  readonly seconds: number;
}

const NO_PROCESSING = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export async function startListening(
  kind: ListenKind,
  opts: { maxSec: number; onLevel?: (rms: number) => void; onTick?: (sec: number) => void; onAutoStop?: () => void },
): Promise<ListenSession> {
  let stream: MediaStream;
  if (kind === "tab") {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // o Chrome exige vídeo para compartilhar aba; descartamos logo abaixo
      audio: NO_PROCESSING,
      // dicas do Chrome: preferir abas e não oferecer a própria aba do MixKey
      ...({ preferCurrentTab: false, selfBrowserSurface: "exclude", systemAudio: "include", surfaceSwitching: "include" } as object),
    } as DisplayMediaStreamOptions);
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("A aba foi compartilhada sem áudio. Tente de novo e marque “Compartilhar áudio da aba”.");
    }
  } else {
    stream = await navigator.mediaDevices.getUserMedia({ audio: NO_PROCESSING });
  }

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, src.channelCount > 1 ? 2 : 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0; // não devolve o som para as caixas (evita eco)
  const chunks: Float32Array[] = [];
  let total = 0;
  let stopped = false;
  let lastTick = -1;
  const maxSamples = opts.maxSec * SAMPLE_RATE;

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const n = e.inputBuffer.length;
    const ch = e.inputBuffer.numberOfChannels;
    const mono = new Float32Array(n);
    let sum = 0;
    for (let c = 0; c < ch; c++) {
      const d = e.inputBuffer.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
    }
    for (let i = 0; i < n; i++) sum += mono[i] * mono[i];
    chunks.push(mono);
    total += n;
    opts.onLevel?.(Math.sqrt(sum / n));
    const sec = Math.floor(total / SAMPLE_RATE);
    if (sec !== lastTick) { lastTick = sec; opts.onTick?.(sec); }
    if (total >= maxSamples) opts.onAutoStop?.();
  };
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  // se o usuário parar o compartilhamento pela barra do Chrome
  stream.getAudioTracks()[0].addEventListener("ended", () => opts.onAutoStop?.());

  const release = () => {
    stopped = true;
    try { proc.disconnect(); src.disconnect(); mute.disconnect(); } catch { /* ok */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  return {
    get seconds() { return total / SAMPLE_RATE; },
    cancel: release,
    stop() {
      release();
      const out = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    },
  };
}

/** Analisa o áudio captado em trechos de 30 s espalhados pelo que foi ouvido */
export async function analyzeListened(samples: Float32Array): Promise<AnalysisResult> {
  const sec = samples.length / SAMPLE_RATE;
  if (sec < 15) throw new Error("Ouvi menos de 15 segundos. Deixe tocar um pouco mais.");
  let sum = 0;
  for (let i = 0; i < samples.length; i += 8) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / (samples.length / 8));
  if (rms < 0.002) throw new Error("Não ouvi som. Confira se a música está tocando (e, na aba, se o áudio foi compartilhado).");
  const n = sec >= 100 ? 4 : sec >= 60 ? 3 : 2;
  const positions = Array.from({ length: n }, (_, i) => i / n);
  return analyzeSamples(samples, { segSec: 30, positions });
}
