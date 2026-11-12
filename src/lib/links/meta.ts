import { fetchText } from "../sources/http";
import type { ResolvedTrack } from "./types";
import { parseDuration } from "../bpm";

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));

export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const k = /(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1];
    const v = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (k && v != null && !(k.toLowerCase() in out)) out[k.toLowerCase()] = decode(v);
  }
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  if (t) out["title"] = decode(t.trim());
  return out;
}

export function jsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      (Array.isArray(j) ? j : j["@graph"] ?? [j]).forEach((x: any) => out.push(x));
    } catch { /* ignora */ }
  }
  return out;
}

const isoDur = (d?: string) => {
  const m = d ? /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(d) : null;
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + Math.round(+(m[3] || 0)) : undefined;
};
const nameOf = (x: any): string => (!x ? "" : typeof x === "string" ? x : Array.isArray(x) ? x.map(nameOf).filter(Boolean).join(", ") : x.name ?? "");
const imgOf = (x: any): string | undefined => (!x ? undefined : typeof x === "string" ? x : Array.isArray(x) ? imgOf(x[0]) : x.url ?? x.contentUrl);

/** Remove sufixos de sites e marcações de vídeo do título */
export function cleanSiteTitle(s: string): string {
  return s
    .replace(/\s*[|–—-]\s*(Spotify|Deezer|Apple Music|YouTube( Music)?|SoundCloud|Beatport|TIDAL|Amazon( Music)?|Bandcamp|Shazam|Last\.fm|Audiomack|Traxsource|Juno Download|Mixcloud|Discogs)\s*$/i, "")
    .replace(/\s+on (Apple Music|Spotify|Amazon Music|TIDAL|Deezer|Audiomack)$/i, "")
    .replace(/^Listen to\s+/i, "")
    .replace(/\s*-\s*(song|single)( and lyrics)? by\s+/i, " by ")
    .replace(/\s*\((Official\s+)?(Music\s+)?(Video|Audio|Lyric(s)?( Video)?|Visuali[sz]er|Clip( Officiel)?|Videoclipe( Oficial)?|HD|4K( Remaster)?)[^)]*\)/gi, "")
    .replace(/\s*\[(Official\s+)?(Music\s+)?(Video|Audio|Lyric(s)?( Video)?|Visuali[sz]er|HD|4K)[^\]]*\]/gi, "")
    .replace(/\s+\(?(Official\s+)?(Music\s+)?Video\)?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Título by Artista", "Título, by Artista", "Artista - Título" */
export function splitTitleArtist(raw: string, fallbackArtist = ""): { title: string; artist: string } {
  const s = cleanSiteTitle(raw);
  let m = /^(.*?),?\s+by\s+(.+)$/i.exec(s);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(s);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: s, artist: fallbackArtist };
}

/** Lê qualquer página: JSON-LD (MusicRecording/MusicPlaylist/MusicAlbum) e meta tags */
export async function genericPage(url: string): Promise<{ name?: string; kind: "track" | "album" | "playlist" | "unknown"; tracks: ResolvedTrack[] }> {
  const html = await fetchText(url, { timeoutMs: 9000 });
  const ld = jsonLd(html);
  const list = ld.find((x) => /MusicPlaylist|MusicAlbum/.test(String(x["@type"])));
  if (list) {
    const items: any[] = Array.isArray(list.track) ? list.track : list.track?.itemListElement?.map((e: any) => e.item ?? e) ?? [];
    const tracks = items.map((t) => ({
      title: nameOf(t.name), artist: nameOf(t.byArtist) || nameOf(list.byArtist), durationSec: isoDur(t.duration), url: t.url,
      coverUrl: imgOf(t.image) ?? t.audio?.thumbnailUrl ?? imgOf(list.image),
    })).filter((t) => t.title);
    if (tracks.length) return { name: nameOf(list.name), kind: /Album/.test(String(list["@type"])) ? "album" : "playlist", tracks };
  }
  const rec = ld.find((x) => /MusicRecording/.test(String(x["@type"])));
  const meta = metaTags(html);
  const cover = meta["og:image"] ?? meta["twitter:image"];
  if (rec?.name) {
    return { kind: "track", tracks: [{ title: nameOf(rec.name), artist: nameOf(rec.byArtist), durationSec: isoDur(rec.duration), coverUrl: imgOf(rec.image) ?? cover, url }] };
  }
  const title = meta["og:title"] ?? meta["twitter:title"] ?? meta["title"];
  if (!title || /^(Not Found|Página não encontrada|404)/i.test(title)) throw new Error("Página sem dados da faixa");
  const desc = meta["og:description"] ?? meta["description"] ?? "";
  let at = splitTitleArtist(title, meta["music:musician_description"] ?? meta["twitter:audio:artist_name"] ?? "");
  if (!at.artist) {
    const d = /by\s+([^·•|.]+)/i.exec(desc)?.[1]?.trim();
    if (d) at = { ...at, artist: d };
  }
  const dur = parseDuration(/(\d{1,2}:\d{2})/.exec(desc)?.[1]) ?? (meta["music:duration"] ? +meta["music:duration"] : undefined);
  return { kind: "track", tracks: [{ ...at, durationSec: dur, coverUrl: cover, url }] };
}
