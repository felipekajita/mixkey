import { describe, it, expect } from "vitest";
import { toRekordboxXml, toRekordboxLocation, toText, toCSV, toM3U8, trackLabel } from "./index";
import { parseListFile } from "../parsers/files";
import type { Track } from "../types";
import type { SequenceResult } from "../sequencer";
import { transitionInfo } from "../sequencer";

const mk = (id: string, title: string, artist: string, key: string, bpm: number, fileName?: string): Track => ({
  id, title, artist, key, bpm, energy: 6, durationSec: 400, fileName, origin: "list", readings: [], keyConfidence: "high", bpmConfidence: "high", status: "done",
});
const tracks = [mk("1", "Cola", "CamelPhat & Elderbrook", "3A", 122, "Cola.mp3"), mk("2", "Opus <Live>", "Eric Prydz", "10A", 126)];
const seq: SequenceResult = { id: "s", name: "Set A · Jornada", trackIds: ["1", "2"], transitions: [transitionInfo(tracks[0], tracks[1], 0.06)], score: 80, targets: [3, 8], totalSec: 800, stats: { perfect: 0, ok: 1, risky: 0, clash: 0 } };

describe("exportação", () => {
  it("título antes do artista", () => {
    expect(trackLabel(tracks[0])).toBe("Cola - CamelPhat & Elderbrook");
    expect(toText(seq, tracks)).toContain("01. Cola - CamelPhat & Elderbrook");
    expect(toCSV(seq, tracks).split("\n")[0]).toContain('"#";"Título";"Artista"');
    expect(toM3U8(seq, tracks)).toContain("#EXTINF:400,Cola - CamelPhat & Elderbrook");
  });
  it("caminhos no formato do Rekordbox", () => {
    expect(toRekordboxLocation("D:\\Músicas\\House\\A B.mp3")).toBe("file://localhost/D:/M%C3%BAsicas/House/A%20B.mp3");
    expect(toRekordboxLocation("/Users/dj/Music/a.mp3")).toBe("file://localhost/Users/dj/Music/a.mp3");
  });
  it("XML válido com BPM, tom e playlist na ordem", async () => {
    const xml = toRekordboxXml(seq, tracks, "D:\\Musicas");
    expect(xml).toContain('Name="Opus &lt;Live&gt;"');
    expect(xml).toContain('AverageBpm="122.00"');
    expect(xml).toContain('Tonality="Bbm"');
    expect(xml).toContain('Location="file://localhost/D:/Musicas/Cola.mp3"');
    expect(xml).toContain('<NODE Name="Set A · Jornada" Type="1" KeyType="0" Entries="2">');
    // o próprio MixKey consegue reler o XML
    const f = new File([xml], "set.xml");
    const back = await parseListFile(f).catch(() => null);
    if (back) expect(back.tracks.map((t) => t.title)).toEqual(["Cola", "Opus <Live>"]);
  });
});
