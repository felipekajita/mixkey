import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchJson } from "./http";
import { cleanTitle } from "../match";

interface ItTrack { trackName: string; artistName: string; trackTimeMillis?: number; artworkUrl100?: string; trackViewUrl?: string; previewUrl?: string; primaryGenreName?: string }

export async function itunesSearch(term: string, limit = 10): Promise<ItTrack[]> {
  const r = await fetchJson<{ results: ItTrack[] }>(`https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(term)}`);
  return r.results || [];
}

export const itunes: SourceDef = {
  id: "itunes", label: "Apple Music", kind: "api", provides: ["cover", "meta"], enabled: () => true,
  async lookup(q) {
    const items = await itunesSearch(`${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim());
    const best = pickBest(q, items, (t) => ({ title: t.trackName, artist: t.artistName, durationSec: t.trackTimeMillis ? t.trackTimeMillis / 1000 : undefined }));
    if (!best) return null;
    const t = best.item;
    return {
      matchScore: best.score, matchedTitle: t.trackName, matchedArtist: t.artistName,
      coverUrl: t.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/1200x1200bb."),
      url: t.trackViewUrl, previewUrl: t.previewUrl,
      durationSec: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : undefined,
      genres: t.primaryGenreName ? [t.primaryGenreName] : undefined,
    };
  },
};
