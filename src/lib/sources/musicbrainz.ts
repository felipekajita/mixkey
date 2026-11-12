import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchJson } from "./http";
import { cleanTitle } from "../match";

interface MbRec { id: string; title: string; length?: number; "artist-credit"?: { name: string; joinphrase?: string }[]; releases?: { id: string; status?: string }[]; isrcs?: string[]; tags?: { name: string }[] }

const esc = (s: string) => s.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");

export const musicbrainz: SourceDef = {
  id: "musicbrainz", label: "MusicBrainz", kind: "api", provides: ["cover", "meta"], enabled: () => true,
  async lookup(q) {
    const query = `recording:"${esc(cleanTitle(q.title))}"${q.artist ? ` AND artist:"${esc(q.artist.split(/,|&| feat/i)[0].trim())}"` : ""}`;
    const r = await fetchJson<{ recordings: MbRec[] }>(
      `https://musicbrainz.org/ws/2/recording?fmt=json&limit=8&query=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "MixKey/0.1 (harmonic set builder)" } },
    );
    const artistOf = (x: MbRec) => (x["artist-credit"] || []).map((a) => a.name + (a.joinphrase || "")).join("");
    const best = pickBest(q, r.recordings || [], (x) => ({ title: x.title, artist: artistOf(x), durationSec: x.length ? x.length / 1000 : undefined }));
    if (!best) return null;
    const rec = best.item;
    const rel = rec.releases?.find((x) => x.status === "Official") ?? rec.releases?.[0];
    return {
      matchScore: best.score, matchedTitle: rec.title, matchedArtist: artistOf(rec),
      coverUrl: rel ? `https://coverartarchive.org/release/${rel.id}/front-500` : undefined,
      url: `https://musicbrainz.org/recording/${rec.id}`,
      durationSec: rec.length ? Math.round(rec.length / 1000) : undefined,
      isrc: rec.isrcs?.[0],
      genres: rec.tags?.map((t) => t.name),
    };
  },
};
