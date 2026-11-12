import { describe, it, expect } from "vitest";
import { parseKey, keyRelation, camelotToMusical, camelotToOpenKey } from "./camelot";
import { bpmRelation, normalizeBpm } from "./bpm";
import { matchScore } from "./match";

describe("parseKey", () => {
  const cases: [string, string][] = [
    ["8A", "8A"], ["08a", "8A"], ["Am", "8A"], ["A minor", "8A"], ["C", "8B"], ["C major", "8B"],
    ["F#m", "11A"], ["Gbm", "11A"], ["Abm", "1A"], ["G#m", "1A"], ["B", "1B"], ["Db", "3B"],
    ["E", "12B"], ["C#m", "12A"], ["Lá menor", "8A"], ["Dó maior", "8B"], ["Si bemol menor", "3A"],
    ["1m", "8A"], ["1d", "8B"], ["A♭ Minor", "1A"], ["Fm", "4A"], ["Bb", "6B"], ["Dm", "7A"],
  ];
  for (const [i, o] of cases) it(`${i} -> ${o}`, () => expect(parseKey(i)).toBe(o));
  it("inválido", () => expect(parseKey("hello")).toBeUndefined());
  it("reverso", () => {
    expect(camelotToMusical("8A")).toBe("Am");
    expect(camelotToMusical("11A")).toBe("F#m");
    expect(camelotToMusical("6B")).toBe("Bb");
    expect(camelotToOpenKey("8B")).toBe("1d");
  });
});

describe("keyRelation", () => {
  it("regras", () => {
    expect(keyRelation("8A", "8A").kind).toBe("same");
    expect(keyRelation("8A", "9A").kind).toBe("adjacent");
    expect(keyRelation("12A", "1A").kind).toBe("adjacent");
    expect(keyRelation("8A", "8B").kind).toBe("relative");
    expect(keyRelation("8A", "10A").kind).toBe("boost");
    expect(keyRelation("8A", "9B").kind).toBe("diagonal");
    expect(keyRelation("8A", "3B").kind).toBe("clash");
    // as 4 diagonais (6 de 7 notas em comum): Save the World (8B) → Revolution (9A)
    expect(keyRelation("8B", "9A").kind).toBe("diagonal");
    expect(keyRelation("8A", "7B").kind).toBe("diagonal");
    expect(keyRelation("8B", "7A").kind).toBe("diagonal");
    expect(keyRelation("8B", "10A").kind).toBe("clash");
  });
});

describe("bpm", () => {
  it("normaliza", () => {
    expect(normalizeBpm(64)).toBe(128);
    expect(normalizeBpm(280)).toBe(140);
  });
  it("relação", () => {
    expect(bpmRelation(124, 126).pct).toBeCloseTo(0.0161, 3);
    expect(bpmRelation(70, 140).mode).toBe("double");
    expect(bpmRelation(120, 140).cost).toBeGreaterThan(5);
  });
});

describe("matchScore", () => {
  it("mesmo nome com variações", () => {
    expect(matchScore({ title: "Cola (Original Mix)", artist: "CamelPhat & Elderbrook" }, { title: "Cola", artist: "CamelPhat" })).toBeGreaterThan(0.8);
  });
  it("faixa diferente", () => {
    expect(matchScore({ title: "Cola", artist: "CamelPhat" }, { title: "Coca", artist: "Someone" })).toBeLessThan(0.7);
  });
  it("remix não pedido", () => {
    const a = matchScore({ title: "Opus", artist: "Eric Prydz" }, { title: "Opus", artist: "Eric Prydz" });
    const b = matchScore({ title: "Opus", artist: "Eric Prydz" }, { title: "Opus (Four Tet Remix)", artist: "Eric Prydz" });
    expect(a).toBeGreaterThan(b);
  });
});
