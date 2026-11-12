import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchJson } from "./http";
import { parseKey } from "../camelot";
import { cleanTitle } from "../match";

// Docs: https://getsongbpm.com/api  (exige link de crédito para getsongbpm.com no site)
interface GsSong { id: string; title: string; uri?: string; tempo?: string; key_of?: string; open_key?: string; danceability?: number; artist?: { name: string; genres?: string[] }; album?: { img?: string } }

export const getsongbpm: SourceDef = {
  id: "getsongbpm", label: "GetSongBPM / GetSongKey", kind: "api", provides: ["key", "bpm"],
  enabled: () => !!process.env.GETSONGBPM_API_KEY,
  async lookup(q) {
    const key = process.env.GETSONGBPM_API_KEY!;
    const lookup = `song:${cleanTitle(q.title)}${q.artist ? ` artist:${q.artist.split(/,|&| feat/i)[0].trim()}` : ""}`;
    const r = await fetchJson<{ search: GsSong[] | { error: string } }>(
      `https://api.getsong.co/search/?api_key=${key}&type=both&limit=10&lookup=${encodeURIComponent(lookup)}`,
    );
    const items = Array.isArray(r.search) ? r.search : [];
    const best = pickBest(q, items, (s) => ({ title: s.title, artist: s.artist?.name || "" }));
    if (!best) return null;
    let s = best.item;
    if (!s.tempo && !s.key_of) {
      try { s = { ...s, ...(await fetchJson<{ song: GsSong }>(`https://api.getsong.co/song/?api_key=${key}&id=${s.id}`)).song }; } catch { /* ok */ }
    }
    return {
      matchScore: best.score, matchedTitle: s.title, matchedArtist: s.artist?.name,
      bpm: s.tempo ? parseFloat(s.tempo) : undefined,
      key: parseKey(s.open_key) ?? parseKey(s.key_of),
      url: s.uri, coverUrl: s.album?.img || undefined, genres: s.artist?.genres,
    };
  },
};
