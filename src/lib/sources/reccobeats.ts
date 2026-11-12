import type { SourceDef } from "./index";
import { fetchJson } from "./http";
import { spotifyEnabled, spotifyFind } from "./spotify";
import { pcToCamelot } from "../camelot";

// ReccoBeats (gratuita, sem chave): audio features a partir do ID do Spotify.
// https://reccobeats.com/docs
interface RbFeatures { key: number; mode: number; tempo: number; energy: number; danceability: number; loudness: number; valence: number; href: string }

export const reccobeats: SourceDef = {
  id: "reccobeats", label: "ReccoBeats (via Spotify)", kind: "api", provides: ["key", "bpm"],
  enabled: spotifyEnabled,
  async lookup(q) {
    const sp = await spotifyFind(q);
    if (!sp) return null;
    const r = await fetchJson<{ content: RbFeatures[] }>(`https://api.reccobeats.com/v1/audio-features?ids=${sp.item.id}`);
    const f = r.content?.[0];
    if (!f) return null;
    return {
      matchScore: sp.score, matchedTitle: sp.item.name, matchedArtist: sp.item.artists.map((a) => a.name).join(", "),
      key: f.key >= 0 ? pcToCamelot(f.key, f.mode === 0) : undefined,
      bpm: f.tempo > 0 ? Math.round(f.tempo * 10) / 10 : undefined,
      energy: Math.round((1 + (f.energy * 0.7 + f.danceability * 0.3) * 9) * 10) / 10,
      url: f.href,
    };
  },
};
