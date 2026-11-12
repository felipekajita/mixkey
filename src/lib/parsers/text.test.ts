import { describe, it, expect } from "vitest";
import { parseText, parseFreeLine, splitArtistTitle } from "./text";

describe("parseFreeLine", () => {
  it("artista - título com key/bpm/duração", () => {
    const t = parseFreeLine("1. Lane 8 - Brightest Lights (Extended Mix) 8A 122 BPM 6:45")!;
    expect(t.artist).toBe("Lane 8");
    expect(t.title).toBe("Brightest Lights (Extended Mix)");
    expect(t.key).toBe("8A");
    expect(t.bpm).toBe(122);
    expect(t.durationSec).toBe(405);
  });
  it("key musical no fim", () => {
    const t = parseFreeLine("Fred again.. - Delilah (pull me out of this) F#m 140")!;
    expect(t.key).toBe("11A");
    expect(t.bpm).toBe(140);
    expect(t.artist).toBe("Fred again..");
  });
  it("título by artista", () => {
    expect(splitArtistTitle("Cola by CamelPhat")).toEqual({ title: "Cola", artist: "CamelPhat" });
  });
  it("colchetes", () => {
    const t = parseFreeLine("Anyma - Eternity [5A | 123]")!;
    expect(t.key).toBe("5A");
    expect(t.title).toBe("Eternity");
  });
  it("pipes", () => {
    const t = parseFreeLine("Eric Prydz - Opus | 10A | 126 | 9:03")!;
    expect(t).toMatchObject({ title: "Opus", artist: "Eric Prydz", key: "10A", bpm: 126, durationSec: 543 });
  });
  it("apenas nome", () => {
    const t = parseFreeLine("Strobe")!;
    expect(t.title).toBe("Strobe");
    expect(t.artist).toBe("");
  });
});

describe("parseText tabela", () => {
  it("tabulado com cabeçalho (copiado do Excel/Rekordbox)", () => {
    const txt = "#\tTrack Title\tArtist\tBPM\tKey\tTime\n1\tCola\tCamelPhat\t122.00\tGm\t7:12\n2\tOpus\tEric Prydz\t126.00\t10A\t9:03";
    const r = parseText(txt);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: "Cola", artist: "CamelPhat", bpm: 122, key: "6A", durationSec: 432 });
    expect(r[1].key).toBe("10A");
  });
  it("sem cabeçalho com ponto-e-vírgula", () => {
    const r = parseText("Eric Prydz;Opus;126;10A\nCamelPhat;Cola;122;6A");
    expect(r[0]).toMatchObject({ artist: "Eric Prydz", title: "Opus", bpm: 126, key: "10A" });
  });
  it("cabeçalho em português", () => {
    const r = parseText("Nome;Artista;Tom;BPM;Duração\nCola;CamelPhat;Sol menor;122;7:12");
    expect(r[0]).toMatchObject({ title: "Cola", artist: "CamelPhat", key: "6A", bpm: 122 });
  });
  it("m3u", () => {
    const r = parseText("#EXTM3U\n#EXTINF:432,CamelPhat - Cola\nC:\\Music\\CamelPhat - Cola.mp3");
    expect(r[0]).toMatchObject({ title: "Cola", artist: "CamelPhat", durationSec: 432, fileName: "CamelPhat - Cola.mp3" });
  });
});
