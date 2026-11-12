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

describe("loja oficial vs. prévias", () => {
  it("Beatport vence 3 prévias concordando entre si", () => {
    const c = computeConsensus([
      { source: "store-beatport", label: "Beatport", key: "10A", bpm: 126 },
      { source: "essentia-preview-deezer", label: "D", key: "11B", bpm: 126 },
      { source: "essentia-preview-apple", label: "A", key: "11B", bpm: 126 },
      { source: "essentia-preview-spotify", label: "S", key: "11B", bpm: 126 },
    ]);
    expect(c.key).toBe("10A");
    expect(c.bpm).toBe(126);
  });
  it("prévias + ReccoBeats concordando superam a loja", () => {
    const c = computeConsensus([
      { source: "store-beatport", label: "Beatport", key: "10A" },
      { source: "reccobeats", label: "R", key: "11B" },
      { source: "essentia-preview-deezer", label: "D", key: "11B" },
      { source: "essentia-preview-apple", label: "A", key: "11B" },
    ]);
    expect(c.key).toBe("11B");
  });
});

describe("escuta ao vivo", () => {
  it("escuta pela aba vence uma prévia isolada e entra no grupo de análise", () => {
    const c = computeConsensus([
      { source: "essentia-listen-tab", label: "Escuta", key: "8A", bpm: 124 },
      { source: "essentia-preview-deezer", label: "D", key: "9A", bpm: 124 },
    ]);
    expect(c.key).toBe("8A");
  });
  it("microfone pesa menos que a aba", () => {
    const c = computeConsensus([
      { source: "essentia-listen-mic", label: "Mic", key: "8A" },
      { source: "essentia-listen-tab", label: "Aba", key: "9A" },
    ]);
    expect(c.key).toBe("9A");
  });
});

import { bpmAtSpeed } from "./listen";
describe("escuta acelerada", () => {
  it("divide o BPM medido pela velocidade", () => {
    expect(bpmAtSpeed(186, 1.5)).toBe(124);
    expect(bpmAtSpeed(155, 1.25)).toBe(124);
    expect(bpmAtSpeed(180, 2)).toBe(90);
    expect(bpmAtSpeed(124, 1)).toBe(124);
  });
  it("escuta a 2× pesa menos que a 1×", () => {
    const c = computeConsensus([
      { source: "essentia-listen-tab", label: "Aba 2x", key: "8A", weight: 0.8 },
      { source: "essentia", label: "Arquivo", key: "9A" },
    ]);
    expect(c.key).toBe("9A");
  });
});

describe("meio tempo com contexto da biblioteca (backup do usuário)", () => {
  it("LIVE FOREVER: SongBPM 81 vs 3 prévias 161/162 num set de hardstyle → 161", () => {
    const r = [
      { source: "songbpm", label: "S", key: "4A", bpm: 81 },
      { source: "essentia-preview-deezer", label: "D", key: "4A", bpm: 161 },
      { source: "essentia-preview-apple", label: "A", key: "4A", bpm: 161 },
      { source: "essentia-preview-spotify", label: "Sp", key: "4A", bpm: 162 },
    ];
    expect(computeConsensus(r, ["dance"]).bpm).toBe(81); // sem contexto, mantém o catálogo
    const b = computeConsensus(r, ["dance"], 158).bpm!; // biblioteca ~158 BPM
    expect(b).toBeGreaterThanOrEqual(160);
    expect(b).toBeLessThanOrEqual(163);
  });
  it("contexto não atrapalha quando o catálogo forte concorda (Blinding Lights numa biblioteca de house)", () => {
    const c = computeConsensus([
      { source: "deezer", label: "Deezer", bpm: 171 },
      { source: "reccobeats", label: "R", bpm: 171 },
      { source: "essentia-preview-deezer", label: "D", bpm: 85 },
      { source: "essentia-preview-apple", label: "A", bpm: 86 },
    ], [], 124);
    expect(c.bpm).toBe(171);
  });
});

describe("Land Of Lunacy (empate 2×2 entre 80 e 162)", () => {
  it("num set de hardstyle (~158 BPM) fica em ~161", () => {
    const b = computeConsensus([
      { source: "songbpm", label: "S", bpm: 80 },
      { source: "essentia-preview-deezer", label: "D", bpm: 162 },
      { source: "essentia-preview-apple", label: "A", bpm: 162 },
      { source: "essentia-preview-spotify", label: "Sp", bpm: 80 },
    ], ["dance"], 158).bpm!;
    expect(b).toBeGreaterThanOrEqual(158);
  });
});
