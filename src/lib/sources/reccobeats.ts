import type { SourceDef } from "./index";
import { pickBest } from "./pick";
import { fetchJson } from "./http";
import { spotifyEnabled, spotifyFind } from "./spotify";
import { deezerSearch } from "./deezer";
import { pcToCamelot } from "../camelot";
import { cleanTitle } from "../match";

// ReccoBeats (gratuita, sem chave): audio features (key, modo, tempo, energia).
// Aceita como id o ID do Spotify ou o ISRC, e tem busca por texto — não depende da chave do Spotify.
// https://reccobeats.com/docs
interface RbFeatures { id: string; key: number; mode: number; tempo: number; energy: number; danceability: number; loudness: number; valence: number; href: string; isrc?: string }
interface RbTrack { id: string; trackTitle: string; artists: { name: string }[]; durationMs?: number; isrc?: string; href?: string }

const RB = "https://api.reccobeats.com/v1";

async function features(id: string): Promise<RbFeatures | null> {
  const r = await fetchJson<{ content: RbFeatures[] }>(`${RB}/audio-features?ids=${encodeURIComponent(id)}`);
  return r.content?.[0] ?? null;
}

async function trackInfo(id: string): Promise<RbTrack | null> {
  try {
    const r = await fetchJson<{ content: RbTrack[] }>(`${RB}/track?ids=${encodeURIComponent(id)}`);
    return r.content?.[0] ?? null;
  } catch { return null; }
}

export const reccobeats: SourceDef = {
  id: "reccobeats", label: "ReccoBeats", kind: "api", provides: ["key", "bpm"], enabled: () => true,
  async lookup(q) {
    // candidatos de identificação, do mais preciso ao menos preciso
    let found: { id: string; via: string; score: number; title?: string; artist?: string } | null = null;
    const tryId = async (id: string | undefined, via: string, score: number) => {
      if (found || !id) return;
      const f = await features(id).catch(() => null);
      if (f) found = { id, via, score };
    };
    await tryId(q.spotifyId, "ID do Spotify", 1);
    await tryId(q.isrc, "ISRC", 1);
    let f: RbFeatures | null = null;
    if (!found) {
      // ISRC pelo Deezer (busca por nome)
      const dz = await deezerSearch(`${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim(), 8).catch(() => []);
      const best = pickBest(q, dz, (t) => ({ title: t.title, artist: t.artist.name, durationSec: t.duration }));
      if (best && best.score >= 0.78) {
        const full = await fetchJson<{ isrc?: string }>(`https://api.deezer.com/track/${best.item.id}`).catch(() => null);
        await tryId(full?.isrc, "ISRC (Deezer)", best.score);
      }
    }
    if (!found) {
      // busca por texto da própria ReccoBeats
      const s = await fetchJson<{ content: RbTrack[] }>(`${RB}/track/search?searchText=${encodeURIComponent(`${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim())}`).catch(() => ({ content: [] as RbTrack[] }));
      const best = pickBest(q, s.content ?? [], (t) => ({ title: t.trackTitle, artist: t.artists.map((a) => a.name).join(", "), durationSec: t.durationMs ? t.durationMs / 1000 : undefined }));
      if (best && best.score >= 0.78) {
        await tryId(best.item.id, "busca ReccoBeats", best.score);
        if (found) Object.assign(found, { title: best.item.trackTitle, artist: best.item.artists.map((a) => a.name).join(", ") });
      }
    }
    if (!found && spotifyEnabled()) {
      const sp = await spotifyFind(q).catch(() => null);
      if (sp) {
        await tryId(sp.item.id, "busca Spotify", sp.score);
        if (found) Object.assign(found, { title: sp.item.name, artist: sp.item.artists.map((a) => a.name).join(", ") });
      }
    }
    if (!found) return null;
    const hit = found as { id: string; via: string; score: number; title?: string; artist?: string };
    f = await features(hit.id);
    if (!f) return null;
    if (!hit.title) {
      const info = await trackInfo(hit.id);
      if (info) { hit.title = info.trackTitle; hit.artist = info.artists.map((a) => a.name).join(", "); }
    }
    return {
      matchScore: hit.score, matchedTitle: hit.title, matchedArtist: hit.artist,
      key: f.key >= 0 ? pcToCamelot(f.key, f.mode === 0) : undefined,
      bpm: f.tempo > 0 ? Math.round(f.tempo) : undefined,
      energy: Math.round((1 + (f.energy * 0.7 + f.danceability * 0.3) * 9) * 10) / 10,
      isrc: f.isrc,
      url: f.href,
      note: `identificada por ${hit.via}`,
    };
  },
};
