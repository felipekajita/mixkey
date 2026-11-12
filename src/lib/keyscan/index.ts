"use client";
/** Detecção de key por IA (OpenKeyScan) num worker — falha em silêncio se o navegador não suportar */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: { ok: boolean; key?: string; conf?: number; error?: string }) => void>();
const SR = 44100;
const MAX_SEC = 240;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../../workers/keyscan.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); if (cb) { pending.delete(e.data.id); cb(e.data); } };
    worker.onerror = () => { pending.forEach((cb) => cb({ ok: false, error: "worker" })); pending.clear(); worker = null; };
  }
  return worker;
}

export async function detectKeyML(samples: Float32Array): Promise<{ key: string; conf: number } | null> {
  try {
    // até 4 min (do meio da faixa) para manter rápido
    let y = samples;
    if (y.length > MAX_SEC * SR) { const st = Math.floor((y.length - MAX_SEC * SR) / 2); y = y.slice(st, st + MAX_SEC * SR); }
    else y = y.slice();
    const id = ++seq;
    const r = await new Promise<{ ok: boolean; key?: string; conf?: number }>((resolve) => {
      pending.set(id, resolve);
      getWorker().postMessage({ id, samples: y }, [y.buffer]);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false }); } }, 60000);
    });
    return r.ok && r.key ? { key: r.key, conf: r.conf ?? 0 } : null;
  } catch {
    return null;
  }
}
