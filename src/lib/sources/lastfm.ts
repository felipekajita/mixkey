import type { SourceDef } from "./index";
import { fetchJson } from "./http";
import { matchScore, cleanTitle } from "../match";

export const lastfmEnabled = () => !!process.env.LASTFM_API_KEY;

export async function lastfmCall<T = any>(params: Record<string, string>): Promise<T> {
  const p = new URLSearchParams({ ...params, api_key: process.env.LASTFM_API_KEY!, format: "json", autocorrect: "1" });
  return fetchJson<T>(`https://ws.audioscrobbler.com/2.0/?${p}`);
}

export const lastfm: SourceDef = {
  id: "lastfm", label: "Last.fm", kind: "api", provides: ["cover", "meta"], enabled: lastfmEnabled,
  async lookup(q) {
    if (!q.artist) return null;
    const r = await lastfmCall<{ track?: { name: string; url: string; duration?: string; artist: { name: string }; album?: { image?: { "#text": string; size: string }[] }; toptags?: { tag: { name: string }[] } } }>(
      { method: "track.getInfo", artist: q.artist.split(/,|&| feat/i)[0].trim(), track: cleanTitle(q.title) },
    );
    const t = r.track;
    if (!t) return null;
    const img = t.album?.image?.find((i) => i.size === "extralarge")?.["#text"];
    return {
      matchScore: matchScore(q, { title: t.name, artist: t.artist.name }),
      matchedTitle: t.name, matchedArtist: t.artist.name, url: t.url,
      coverUrl: img && !img.includes("2a96cbd8b46e442fc41c2b86b821562f") ? img.replace("/300x300/", "/600x600/") : undefined,
      genres: t.toptags?.tag?.map((x) => x.name).slice(0, 6),
      durationSec: t.duration && +t.duration > 0 ? Math.round(+t.duration / 1000) : undefined,
    };
  },
};
