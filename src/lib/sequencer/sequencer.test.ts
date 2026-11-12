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

import { setAdjustments, rescoreSequence } from "./index";
describe("ajustes sugeridos no set", () => {
  it("sugere retirar a faixa que não combina com nenhuma", () => {
    const set = [mk("a", "8A", 124, 5), mk("b", "9A", 124, 6), mk("c", "9B", 125, 6), mk("d", "10A", 125, 7), mk("x", "3B", 124, 6), mk("y", "8A", 140, 6)];
    const map = new Map(set.map((t) => [t.id, t]));
    const seq = rescoreSequence({ id: "s", name: "S", trackIds: set.map((t) => t.id), transitions: [], score: 0, targets: [], totalSec: 0, stats: { perfect: 0, ok: 0, risky: 0, clash: 0 } }, map, 0.06);
    const adj = setAdjustments(seq, map, 0.06);
    const ids = adj.filter((a) => a.kind === "remove").map((a) => a.trackId);
    expect(ids).toContain("x"); // key sem par
    expect(ids).toContain("y"); // BPM muito fora
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b");
  });
});

describe("conflitos: soluções sugeridas", () => {
  it("oferece mover, ponte e retirada para um conflito entre faixas que combinam com outras", () => {
    // A(8B)–B(8B) bem; C(10A)–D(10A) bem; B→C é conflito (8B→10A)
    const set = [mk("a", "8B", 158, 7), mk("b", "8B", 160, 7), mk("c", "10A", 155, 8), mk("d", "10A", 155, 8), mk("e", "9A", 156, 8)];
    const lib = [...set, mk("ponte", "9A", 157, 7)];
    const map = new Map(lib.map((t) => [t.id, t]));
    const seq = rescoreSequence({ id: "s", name: "S", trackIds: set.map((t) => t.id), transitions: [], score: 0, targets: [], totalSec: 0, stats: { perfect: 0, ok: 0, risky: 0, clash: 0 } }, map, 0.06);
    const conf = setAdjustments(seq, map, 0.06, lib).filter((x) => x.kind === "conflict");
    expect(conf).toHaveLength(1);
    const fix = conf[0].conflict!;
    expect([fix.fromId, fix.toId]).toEqual(["b", "c"]);
    expect(fix.move?.gain).toBeGreaterThan(0);          // mover "e" (9A) para entre b e c resolve
    expect(fix.bridges).toContain("ponte");
    expect(fix.removals).toHaveLength(2);
  });
});
