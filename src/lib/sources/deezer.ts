import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchJson } from "./http";
import { cleanTitle } from "../match";

interface DzTrack { id: number; title: string; title_version?: string; duration: number; isrc?: string; preview?: string; link: string; bpm?: number; gain?: number; artist: { name: string; id: number }; album: { cover_xl?: string; cover_big?: string; title: string }; contributors?: { name: string }[] }

export async function deezerSearch(q: string, limit = 10): Promise<DzTrack[]> {
  const r = await fetchJson<{ data: DzTrack[] }>(`https://api.deezer.com/search?limit=${limit}&q=${encodeURIComponent(q)}`);
  return r.data || [];
}

export const deezer: SourceDef = {
  id: "deezer", label: "Deezer", kind: "api", provides: ["bpm", "cover", "meta"], enabled: () => true,
  async lookup(q) {
    let items: DzTrack[] = [];
    if (q.isrc) {
      try {
        const t = await fetchJson<DzTrack & { error?: unknown }>(`https://api.deezer.com/track/isrc:${q.isrc}`);
        if (!t.error) items = [t];
      } catch { /* segue */ }
    }
    if (!items.length && q.artist) items = await deezerSearch(`artist:"${q.artist.split(/,|&| feat/i)[0].trim()}" track:"${cleanTitle(q.title)}"`);
    if (!items.length) items = await deezerSearch(`${q.artist} ${cleanTitle(q.title)}`.trim());
    const best = pickBest(q, items, (t) => ({ title: t.title_version && !t.title.includes(t.title_version) ? `${t.title} ${t.title_version}` : t.title, artist: t.artist.name, durationSec: t.duration }));
    if (!best) return null;
    // detalhes (BPM, contribuidores)
    let full: DzTrack = best.item;
    try { full = { ...best.item, ...(await fetchJson<DzTrack>(`https://api.deezer.com/track/${best.item.id}`)) }; } catch { /* ok */ }
    return {
      matchScore: best.score,
      matchedTitle: full.title_version && !full.title.includes(full.title_version) ? `${full.title} ${full.title_version}` : full.title,
      matchedArtist: (full.contributors?.map((c) => c.name).join(", ")) || full.artist.name,
      bpm: full.bpm && full.bpm > 40 ? full.bpm : undefined,
      coverUrl: full.album?.cover_xl || full.album?.cover_big,
      url: full.link,
      durationSec: full.duration,
      isrc: full.isrc,
      previewUrl: full.preview,
    };
  },
};
