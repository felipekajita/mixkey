/**
 * CQT (constant-Q transform) idêntico, na prática, ao `librosa.cqt` usado no treino do
 * OpenKeyScan: sr 44,1 kHz, hop 8820, 105 bins, 24 bins/oitava, fmin 65 Hz, janela de Hann,
 * filtros com norma L1 e resposta escalada por √(tamanho do filtro) (scale=True).
 * Verificado contra o librosa: correlação ≥ 0,9999 (ver cqt.test.ts).
 */
export const CQT = { sr: 44100, hop: 8820, bins: 105, bpo: 24, fmin: 65 } as const;

interface Kernel { n: number; half: number; re: Float32Array; im: Float32Array; scale: number }
let kernels: Kernel[] | null = null;

function buildKernels(): Kernel[] {
  const r = 2 ** (1 / CQT.bpo);
  const alpha = (r * r - 1) / (r * r + 1);
  const Q = 1 / alpha;
  const out: Kernel[] = [];
  for (let k = 0; k < CQT.bins; k++) {
    const f = CQT.fmin * 2 ** (k / CQT.bpo);
    const L = (Q * CQT.sr) / f;
    const n = Math.floor(L);
    const half = Math.floor(n / 2);
    const re = new Float32Array(n), im = new Float32Array(n);
    let l1 = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      const ph = (2 * Math.PI * f * (i - half)) / CQT.sr;
      re[i] = w * Math.cos(ph);
      im[i] = -w * Math.sin(ph); // conjugado
      l1 += w;
    }
    for (let i = 0; i < n; i++) { re[i] /= l1; im[i] /= l1; }
    out.push({ n, half, re, im, scale: Math.sqrt(L) });
  }
  return out;
}

/** Espectrograma log1p(|CQT|) — formato [bins][frames] achatado (bins × frames) */
export function logCqt(y: Float32Array): { data: Float32Array; frames: number } {
  kernels ??= buildKernels();
  const frames = 1 + Math.floor(y.length / CQT.hop);
  const data = new Float32Array(CQT.bins * frames);
  for (let k = 0; k < CQT.bins; k++) {
    const { n, half, re, im, scale } = kernels[k];
    for (let t = 0; t < frames; t++) {
      const start = t * CQT.hop - half;
      let sr = 0, si = 0;
      const i0 = Math.max(0, -start), i1 = Math.min(n, y.length - start);
      for (let i = i0; i < i1; i++) {
        const v = y[start + i];
        sr += v * re[i];
        si += v * im[i];
      }
      data[k * frames + t] = Math.log1p(Math.sqrt(sr * sr + si * si) * scale);
    }
  }
  return { data, frames };
}

/** Entrada do modelo: remove as 2 últimas colunas (como o OpenKeyScan) → [1,1,105,T] */
export function modelInput(spec: { data: Float32Array; frames: number }): { data: Float32Array; frames: number } {
  const T = Math.max(1, spec.frames - 2);
  const out = new Float32Array(CQT.bins * T);
  for (let k = 0; k < CQT.bins; k++) out.set(spec.data.subarray(k * spec.frames, k * spec.frames + T), k * T);
  return { data: out, frames: T };
}

/** Índice de classe do OpenKeyScan → Camelot (0–11 = 1A–12A, 12–23 = 1B–12B) */
export const classToCamelot = (i: number) => `${(i % 12) + 1}${i < 12 ? "A" : "B"}`;

export function softmax(x: ArrayLike<number>): number[] {
  const m = Math.max(...Array.from(x));
  const e = Array.from(x, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
