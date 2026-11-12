import { describe, it, expect } from "vitest";
import { buildSequences, DEFAULT_OPTIONS } from "./index";
import type { Track } from "../types";

const mk = (id: string, key: string, bpm: number, energy: number): Track => ({
  id, title: `T${id}`, artist: `A${id}`, key, bpm, energy, origin: "list", readings: [],
  keyConfidence: "high", bpmConfidence: "high", status: "done",
});

const lib: Track[] = [
  mk("1", "8A", 122, 3), mk("2", "9A", 123, 4), mk("3", "10A", 124, 5), mk("4", "10B", 125, 6),
  mk("5", "11B", 126, 7), mk("6", "12B", 127, 8), mk("7", "12A", 128, 9), mk("8", "1A", 128, 6),
  mk("9", "3B", 100, 2), mk("10", "8B", 122, 4),
];

describe("buildSequences", () => {
  it("gera N sets distintos com todas as faixas", () => {
    const r = buildSequences(lib, { ...DEFAULT_OPTIONS, count: 3 });
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r[0].trackIds).size).toBe(lib.length);
    expect(r[0].trackIds.join()).not.toBe(r[1].trackIds.join());
  });
  it("harmônico puro evita conflitos quando possível", () => {
    const sub = lib.filter((t) => t.id !== "9");
    const r = buildSequences(sub, { ...DEFAULT_OPTIONS, vibeId: "harmonic", count: 1 });
    expect(r[0].stats.clash).toBe(0);
  });
  it("buildup termina em alta energia", () => {
    const r = buildSequences(lib, { ...DEFAULT_OPTIONS, vibeId: "buildup", count: 1 });
    const last = lib.find((t) => t.id === r[0].trackIds.at(-1))!;
    const first = lib.find((t) => t.id === r[0].trackIds[0])!;
    expect(last.energy!).toBeGreaterThan(first.energy!);
  });
  it("respeita faixa inicial e final", () => {
    const r = buildSequences(lib, { ...DEFAULT_OPTIONS, count: 1, startTrackId: "5", endTrackId: "1" });
    expect(r[0].trackIds[0]).toBe("5");
    expect(r[0].trackIds.at(-1)).toBe("1");
  });
  it("limita por quantidade e sets distintos", () => {
    const r = buildSequences(lib, { ...DEFAULT_OPTIONS, count: 2, length: { mode: "count", value: 4 }, distinct: true });
    expect(r[0].trackIds).toHaveLength(4);
    expect(r[0].trackIds.some((id) => r[1].trackIds.includes(id))).toBe(false);
  });
});
