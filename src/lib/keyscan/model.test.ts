import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";
import { logCqt, modelInput, classToCamelot, softmax } from "./cqt";

const fx = (f: string) => path.join(__dirname, "__fixtures__", f);

describe("OpenKeyScan no JS (CQT próprio + ONNX)", () => {
  it("dá a mesma key que o PyTorch/librosa", async () => {
    const b = readFileSync(fx("cola12s.f32"));
    const y = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const meta = JSON.parse(readFileSync(fx("cola12s.json"), "utf8"));
    ort.env.wasm.numThreads = 1;
    const model = readFileSync(path.join(__dirname, "../../../public/models/openkeyscan3.fp16.onnx"));
    const session = await ort.InferenceSession.create(new Uint8Array(model));
    const inp = modelInput(logCqt(y));
    const out = await session.run({ spec: new ort.Tensor("float32", inp.data, [1, 1, 105, inp.frames]) });
    const logits = out.logits.data as Float32Array;
    let best = 0;
    for (let i = 1; i < 24; i++) if (logits[i] > logits[best]) best = i;
    expect(best).toBe(meta.argmax);
    expect(classToCamelot(best)).toBe("3A");
    expect(softmax(logits)[best]).toBeGreaterThan(0.3);
  }, 60000);
});
