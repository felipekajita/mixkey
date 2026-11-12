import { describe, it, expect, vi, afterEach } from "vitest";
import { computeConsensus } from "./consensus";
import { reccobeats } from "./sources/reccobeats";

describe("consenso com várias prévias", () => {
  it("duas prévias concordando vencem uma fonte isolada e sobem a confiança", () => {
    const c = computeConsensus([
      { source: "reccobeats", label: "R", key: "2B", bpm: 122 },
      { source: "essentia-preview-deezer", label: "D", key: "3A", bpm: 122 },
      { source: "essentia-preview-apple", label: "A", key: "3A", bpm: 121.8 },
    ]);
    expect(c.key).toBe("3A");
    expect(c.bpm).toBe(122);
    expect(c.bpmConfidence).toBe("high");
  });
  it("prévias em meio tempo não vencem BPM de catálogo (Blinding Lights)", () => {
    const c = computeConsensus([
      { source: "deezer", label: "Deezer", bpm: 170.84 },
      { source: "reccobeats", label: "R", key: "3B", bpm: 171 },
      { source: "essentia-preview-deezer", label: "D", key: "4A", bpm: 85.4 },
      { source: "essentia-preview-apple", label: "A", key: "4A", bpm: 85.8 },
    ], ["r&b/soul", "pop"]);
    expect(c.bpm).toBe(171);
    expect(c.bpmConfidence).toBe("high");
  });
  it("gênero ainda corrige quando só há análises de áudio", () => {
    const c = computeConsensus([{ source: "essentia-preview-deezer", label: "D", bpm: 87 }], ["drum and bass"]);
    expect(c.bpm).toBe(174);
  });
  it("sem fontes de catálogo, as prévias decidem normalmente", () => {
    const c = computeConsensus([
      { source: "essentia-preview-deezer", label: "D", bpm: 124 },
      { source: "essentia-preview-apple", label: "A", bpm: 124.2 },
    ]);
    expect(c.bpm).toBe(124);
  });
  it("uma prévia sozinha fica com confiança baixa/média", () => {
    const c = computeConsensus([{ source: "essentia-preview-deezer", label: "D", key: "3A", bpm: 122 }]);
    expect(c.keyConfidence).not.toBe("high");
  });
});

describe("ReccoBeats sem chave do Spotify", () => {
  afterEach(() => vi.unstubAllGlobals());
  const feat = { id: "x", key: 1, mode: 1, tempo: 171.0, energy: 0.73, danceability: 0.5, loudness: -6, valence: 0.3, href: "https://open.spotify.com/track/0Vj", isrc: "USUG11904206" };
  function mockFetch(handler: (url: string) => unknown) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = handler(String(url));
      return new Response(JSON.stringify(body ?? { content: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
  }
  it("usa o ID do Spotify do link", async () => {
    mockFetch((u) => (u.includes("audio-features?ids=0VjIjW4") ? { content: [feat] } : u.includes("/track?ids=") ? { content: [{ id: "x", trackTitle: "Blinding Lights", artists: [{ name: "The Weeknd" }] }] } : null));
    const r = await reccobeats.lookup({ title: "Blinding Lights", artist: "The Weeknd", spotifyId: "0VjIjW4" });
    expect(r).toMatchObject({ bpm: 171, key: "3B", matchScore: 1, note: "identificada por ID do Spotify" });
  });
  it("usa o ISRC", async () => {
    mockFetch((u) => (u.includes("audio-features?ids=USUG11904206") ? { content: [feat] } : null));
    const r = await reccobeats.lookup({ title: "Blinding Lights", artist: "The Weeknd", isrc: "USUG11904206" });
    expect(r?.note).toBe("identificada por ISRC");
  });
  it("sem ID: busca por texto e confere o nome", async () => {
    mockFetch((u) =>
      u.includes("/track/search") ? { content: [{ id: "rb1", trackTitle: "Blinding Lights", artists: [{ name: "The Weeknd" }], durationMs: 200040 }] }
      : u.includes("audio-features?ids=rb1") ? { content: [feat] }
      : u.includes("api.deezer.com/search") ? { data: [] } : null);
    const r = await reccobeats.lookup({ title: "Blinding Lights", artist: "The Weeknd" });
    expect(r?.note).toBe("identificada por busca ReccoBeats");
    expect(r?.matchedTitle).toBe("Blinding Lights");
  });
});
