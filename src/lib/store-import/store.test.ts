import { describe, it, expect } from "vitest";
import { extractStoreTracks } from "./extract";
import { parseStorePayload } from "./parse";
import { makeBookmarklet } from "./bookmarklet";
import { parseKey } from "../camelot";

// formatos vistos nas páginas do Beatport: busca (track_name/key_name…) e catálogo (name/key{name}…)
const NEXT = {
  props: { pageProps: { dehydratedState: { queries: [
    { state: { data: { data: [
      { track_id: 9382891, track_name: "Cola", mix_name: "Original Mix", artists: [{ artist_name: "CAMELPHAT" }, { artist_name: "Elderbrook" }], bpm: 122, key_name: "Bb Major", genre: [{ genre_name: "House" }], label: { label_name: "Defected" }, isrc: "GBCPZ1711554", length: 415651, release: { release_image_uri: "https://geo-media.beatport.com/image_size/1400x1400/x.jpg", release_name: "Cola" } },
    ] } } },
    { state: { data: { results: [
      { id: 111, slug: "step-into-the-madness", name: "Step Into The Madness", mix_name: "Into The Madness 2026 Anthem", artists: [{ name: "Da Tweekaz" }], bpm: 150, key: { name: "F# Minor" }, genre: { name: "Hard Dance / Hardstyle" }, length_ms: 240000, release: { name: "Step Into The Madness", label: { name: "Dirty Workz" }, image: { uri: "https://geo-media.beatport.com/image_size/500x500/y.jpg" } } },
    ] } } },
  ] } } },
};
const fakeDoc = (json: unknown) => ({ getElementById: (id: string) => (id === "__NEXT_DATA__" ? { textContent: JSON.stringify(json) } : null), title: "Cola | Beatport" }) as unknown as Document;

describe("importação do Beatport", () => {
  it("extrai faixas nos dois formatos", () => {
    const r = extractStoreTracks(fakeDoc(NEXT), "https://www.beatport.com/search?q=cola");
    expect(r.store).toBe("Beatport");
    expect(r.tracks).toHaveLength(2);
    expect(r.tracks[0]).toMatchObject({ title: "Cola", mix: "Original Mix", artists: "CAMELPHAT, Elderbrook", bpm: 122, key: "Bb Major", genre: "House", label: "Defected", isrc: "GBCPZ1711554", durationSec: 416 });
    expect(r.tracks[1]).toMatchObject({ title: "Step Into The Madness", bpm: 150, key: "F# Minor", genre: "Hard Dance / Hardstyle", label: "Dirty Workz", url: "https://www.beatport.com/track/step-into-the-madness/111" });
    expect(r.tracks[1].coverUrl).toContain("1400x1400");
    expect(parseKey(r.tracks[0].key)).toBe("6B");
    expect(parseKey(r.tracks[1].key)).toBe("11A");
  });
  it("payload via URL (base64) e via texto colado", () => {
    const payload = { mixkey: "store", v: 1, store: "Beatport", tracks: [{ title: "Ção", artists: "X" }] };
    const b64 = encodeURIComponent(Buffer.from(JSON.stringify(payload), "utf8").toString("base64"));
    expect(parseStorePayload(b64)?.tracks[0].title).toBe("Ção");
    expect(parseStorePayload(JSON.stringify(payload))?.store).toBe("Beatport");
    expect(parseStorePayload("lixo")).toBeNull();
  });
  it("o favorito é JavaScript válido e autocontido", () => {
    const code = decodeURIComponent(makeBookmarklet("https://mixkey.vercel.app").slice("javascript:".length));
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("https://mixkey.vercel.app");
  });
});

describe("favorito: filtra pelo tipo de página", () => {
  const mk = (id: number, rel = 1, extra = {}) => ({ id, slug: `t-${id}`, name: `Faixa ${id}`, mix_name: "Original Mix", artists: [{ name: "Artista" }], bpm: 120 + (id % 10), key: { name: "A Minor" }, release: { id: rel, name: `R${rel}`, label: { name: "Selo" } }, ...extra });
  const related = Array.from({ length: 150 }, (_, i) => mk(1000 + i, 50 + (i % 7)));
  it("página de faixa → só a faixa do link (mesmo com 150 relacionadas)", () => {
    const json = { props: { pageProps: { track: mk(19195696, 77), related, more: { results: related.slice(0, 20) } } } };
    const r = extractStoreTracks(fakeDoc({}), "https://www.beatport.com/track/bring-it-on/19195696", JSON.stringify(json));
    expect(r.pageType).toBe("track");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]).toMatchObject({ id: "19195696", title: "Faixa 19195696" });
  });
  it("usa os dados ATUAIS (texto buscado) em vez do __NEXT_DATA__ velho do documento", () => {
    const stale = { props: { pageProps: { results: related } } }; // ficou da busca
    const fresh = { props: { pageProps: { track: mk(19195696, 77) } } };
    const r = extractStoreTracks(fakeDoc(stale), "https://www.beatport.com/track/bring-it-on/19195696", JSON.stringify(fresh));
    expect(r.tracks.map((t) => t.id)).toEqual(["19195696"]);
  });
  it("página de faixa sem a faixa nos dados → vazio (o favorito avisa para recarregar)", () => {
    const r = extractStoreTracks(fakeDoc({ props: { results: related } }), "https://www.beatport.com/track/x/123");
    expect(r.tracks).toHaveLength(0);
  });
  it("release → só as faixas do release", () => {
    const json = { props: { pageProps: { release: { id: 7310994 }, tracks: [mk(1, 7310994), mk(2, 7310994), mk(3, 7310994)], related } } };
    const r = extractStoreTracks(fakeDoc({}), "https://www.beatport.com/release/step-into-the-madness/7310994", JSON.stringify(json));
    expect(r.pageType).toBe("release");
    expect(r.tracks.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });
  it("chart/playlist → só a lista principal, sem recomendados", () => {
    const main = Array.from({ length: 30 }, (_, i) => mk(i + 1, i + 1));
    const json = { props: { pageProps: { chart: { tracks: { results: main } }, recommended: related.slice(0, 8) } } };
    const r = extractStoreTracks(fakeDoc({}), "https://www.beatport.com/chart/meu-chart/123", JSON.stringify(json));
    expect(r.pageType).toBe("list");
    expect(r.tracks).toHaveLength(30);
  });
});
