import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { logCqt, CQT, classToCamelot } from "./cqt";

const fx = (f: string) => path.join(__dirname, "__fixtures__", f);
const f32 = (f: string) => { const b = readFileSync(fx(f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };

describe("CQT igual ao librosa (OpenKeyScan)", () => {
  it("bate com librosa.cqt nos 12 s de 'Cola'", () => {
    const y = f32("cola12s.f32");
    const ref = f32("cola12s.spec.f32"); // [105 × frames] (C-order) já em log1p
    const meta = JSON.parse(readFileSync(fx("cola12s.json"), "utf8"));
    const mine = logCqt(y);
    expect(mine.frames).toBe(meta.frames);
    let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, maxd = 0, sumd = 0;
    const n = ref.length;
    for (let i = 0; i < n; i++) {
      const a = ref[i], b = mine.data[i];
      sa += a; sb += b; sab += a * b; saa += a * a; sbb += b * b; maxd = Math.max(maxd, Math.abs(a - b)); sumd += Math.abs(a - b);
    }
    const corr = (n * sab - sa * sb) / Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
    expect(corr).toBeGreaterThan(0.999);
    expect(maxd).toBeLessThan(0.1);        // bordas: o librosa reamostra por oitava
    expect(sumd / n).toBeLessThan(0.01);   // diferença média desprezível
    expect(CQT.bins * mine.frames).toBe(n);
  });
  it("classe → Camelot", () => {
    expect(classToCamelot(2)).toBe("3A");
    expect(classToCamelot(19)).toBe("8B");
  });
});
