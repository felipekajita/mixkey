import { describe, it, expect } from "vitest";
import { extractUrls, platformOf } from "./types";
import { splitTitleArtist, cleanSiteTitle, metaTags, jsonLd } from "./meta";

describe("links", () => {
  it("extrai URLs e plataformas", () => {
    const u = extractUrls("ouve isso https://open.spotify.com/track/abc?si=1, e https://youtu.be/xyz.\nspotify:track:123");
    expect(u).toEqual(["https://open.spotify.com/track/abc?si=1", "https://youtu.be/xyz", "spotify:track:123"]);
    expect(platformOf("https://music.youtube.com/watch?v=1")).toBe("YouTube Music");
    expect(platformOf("https://www.youtube.com/watch?v=1")).toBe("YouTube");
    expect(platformOf("https://www.deezer.com/br/track/1")).toBe("Deezer");
    expect(platformOf("https://link.deezer.com/s/abc")).toBe("Deezer");
    expect(platformOf("https://music.apple.com/br/album/x/1")).toBe("Apple Music");
    expect(platformOf("https://www.beatport.com/track/x/1")).toBe("Beatport");
    expect(platformOf("https://music.amazon.com.br/albums/B0")).toBe("Amazon Music");
  });
  it("limpa títulos de vídeo e separa artista", () => {
    expect(splitTitleArtist("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)")).toEqual({ artist: "Rick Astley", title: "Never Gonna Give You Up" });
    expect(splitTitleArtist("Flickermood by Forss")).toEqual({ title: "Flickermood", artist: "Forss" });
    expect(splitTitleArtist("Cola, by CamelPhat")).toEqual({ title: "Cola", artist: "CamelPhat" });
    expect(splitTitleArtist("Cola - song and lyrics by CamelPhat, Elderbrook | Spotify")).toEqual({ title: "Cola", artist: "CamelPhat, Elderbrook" });
    expect(cleanSiteTitle("Opus [Official Audio]")).toBe("Opus");
    expect(splitTitleArtist("Sonnentanz", "Klangkarussell")).toEqual({ title: "Sonnentanz", artist: "Klangkarussell" });
  });
  it("lê meta tags e JSON-LD", () => {
    const html = `<title>X</title><meta property="og:title" content="Cola &amp; More"><script type="application/ld+json">{"@type":"MusicRecording","name":"Cola","byArtist":{"name":"CamelPhat"}}</script>`;
    expect(metaTags(html)["og:title"]).toBe("Cola & More");
    expect(jsonLd(html)[0].byArtist.name).toBe("CamelPhat");
  });
});
