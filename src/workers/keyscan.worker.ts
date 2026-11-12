/// <reference lib="webworker" />
/**
 * Worker da IA de key (OpenKeyScan, MIT — https://github.com/rekordcloud/openkeyscan-analyzer).
 * CQT em JS (igual ao librosa usado no treino) + rede KeyNet em ONNX (onnxruntime-web).
 */
import * as ort from "onnxruntime-web/wasm";
import { logCqt, modelInput, classToCamelot, softmax } from "../lib/keyscan/cqt";

ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;

let session: Promise<ort.InferenceSession> | null = null;
const getSession = () => (session ??= ort.InferenceSession.create("/models/openkeyscan3.fp16.onnx", { executionProviders: ["wasm"] }));

self.onmessage = async (e: MessageEvent<{ id: number; samples: Float32Array }>) => {
  const { id, samples } = e.data;
  try {
    const s = await getSession();
    const inp = modelInput(logCqt(samples));
    const out = await s.run({ spec: new ort.Tensor("float32", inp.data, [1, 1, 105, inp.frames]) });
    const probs = softmax(out.logits.data as Float32Array);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    (self as unknown as Worker).postMessage({ id, ok: true, key: classToCamelot(best), conf: probs[best] });
  } catch (err) {
    session = null;
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
