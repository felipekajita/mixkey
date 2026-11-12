import { describe, it, expect } from "vitest";
import { resolveBpm, genreRange } from "./bpmOctave";

describe("resolveBpm (meio/dobro tempo)", () => {
  it("agrupa 171 e 85.5 como a mesma leitura e escolhe pelo peso", () => {
    const r = resolveBpm([{ b: 171, w: 2.5 }, { b: 85.5, w: 1.8 }])!;
    expect(r.bpm).toBe(171);
    expect(r.groupWeight).toBeCloseTo(4.3);
  });
  it("dubstep lido em 70 → 140", () => {
    expect(resolveBpm([{ b: 70, w: 1.8 }], ["dubstep"])!.bpm).toBe(140);
  });
  it("drum and bass lido em 87 → 174", () => {
    expect(resolveBpm([{ b: 87, w: 1.8 }], ["Drum and Bass", "electronic"])!.bpm).toBe(174);
  });
  it("techno lido em 68 → 136", () => {
    expect(resolveBpm([{ b: 68, w: 1.8 }], ["techno"])!.bpm).toBe(136);
  });
  it("house lido em 248 → 124", () => {
    expect(resolveBpm([{ b: 248, w: 1.8 }], ["deep house"])!.bpm).toBe(124);
  });
  it("hip hop em 180 → 90", () => {
    expect(resolveBpm([{ b: 180, w: 1.8 }], ["hip-hop"])!.bpm).toBe(90);
  });
  it("sem gênero mantém o valor lido", () => {
    expect(resolveBpm([{ b: 85.4, w: 1.8 }])!.bpm).toBe(85);
    expect(resolveBpm([{ b: 128, w: 3 }])!.bpm).toBe(128);
  });
  it("não mexe quando já está na faixa do gênero", () => {
    const r = resolveBpm([{ b: 124, w: 3 }], ["house"])!;
    expect(r.bpm).toBe(124);
    expect(r.note).toBeUndefined();
  });
  it("gêneros", () => {
    expect(genreRange(["tech house"])).toEqual([110, 132]);
    expect(genreRange(["pop"])).toBeNull();
  });
});
