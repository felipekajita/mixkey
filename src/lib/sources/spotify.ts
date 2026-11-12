import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchJson } from "./http";
import { cleanTitle } from "../match";
import type { LookupQuery } from "../types";

let token: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const id = process.env.SPOTIFY_CLIENT_ID!, secret = process.env.SPOTIFY_CLIENT_SECRET!;
  const r = await fetchJson<{ access_token: string; expires_in: number }>("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
    body: "grant_type=client_credentials",
  });
  token = { value: r.access_token, exp: Date.now() + r.expires_in * 1000 };
  return token.value;
}

export async function spotifyApi<T = any>(path: string): Promise<T> {
  return fetchJson<T>(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
}

interface SpTrack { id: string; name: string; duration_ms: number; external_ids?: { isrc?: string }; external_urls: { spotify: string }; preview_url?: string; artists: { name: string }[]; album: { images: { url: string; width: number }[] } }

export const spotifyEnabled = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

const cache = new Map<string, Promise<{ item: SpTrack; score: number } | null>>();

/** Busca (com cache por requisição) — reutilizada pela ReccoBeats */
export function spotifyFind(q: LookupQuery) {
  const k = JSON.stringify([q.artist, q.title, q.isrc]);
  if (!cache.has(k)) {
    cache.set(k, spotifyFindRaw(q));
    setTimeout(() => cache.delete(k), 60_000);
  }
  return cache.get(k)!;
}

async function spotifyFindRaw(q: LookupQuery) {
    let items: SpTrack[] = [];
    if (q.isrc) items = (await spotifyApi<{ tracks: { items: SpTrack[] } }>(`search?type=track&limit=5&q=${encodeURIComponent(`isrc:${q.isrc}`)}`)).tracks.items;
    if (!items.length) {
      const qq = `track:${cleanTitle(q.title)}${q.artist ? ` artist:${q.artist.split(/,|&| feat/i)[0].trim()}` : ""}`;
      items = (await spotifyApi<{ tracks: { items: SpTrack[] } }>(`search?type=track&limit=10&q=${encodeURIComponent(qq)}`)).tracks.items;
    }
    return pickBest(q, items, (t) => ({ title: t.name, artist: t.artists.map((a) => a.name).join(", "), durationSec: t.duration_ms / 1000 }));
}

export const spotify: SourceDef = {
  id: "spotify", label: "Spotify", kind: "api", provides: ["cover", "meta"], enabled: spotifyEnabled,
  async lookup(q) {
    const best = await spotifyFind(q);
    if (!best) return null;
    const t = best.item;
    return {
      matchScore: best.score, matchedTitle: t.name, matchedArtist: t.artists.map((a) => a.name).join(", "),
      coverUrl: t.album.images.sort((a, b) => b.width - a.width)[0]?.url,
      url: t.external_urls.spotify, previewUrl: t.preview_url || undefined,
      durationSec: Math.round(t.duration_ms / 1000), isrc: t.external_ids?.isrc,
    };
  },
};
