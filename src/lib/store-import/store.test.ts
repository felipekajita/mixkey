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
