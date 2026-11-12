/**
 * Scrapers "best-effort". Esses sites não têm API pública e muitos usam proteção
 * Cloudflare — quando bloqueados, a fonte aparece como indisponível e a faixa
 * segue com as demais fontes. Os extratores são genéricos (procuram objetos com
 * título + bpm/key no JSON embutido) para resistir a mudanças de layout.
 */
import * as cheerio from "cheerio";
import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchText, deepFind } from "./http";
import { parseKey } from "../camelot";
import { cleanTitle } from "../match";
import { parseDuration } from "../bpm";

const TITLE_F = ["title", "name", "track_name", "trackName", "n", "song_title"];
const ARTIST_F = ["artist", "artists", "artist_name", "artistName", "as", "a"];
const BPM_F = ["bpm", "tempo", "BPM", "b"];
const KEY_F = ["camelot", "key_name", "key", "keyName", "musical_key", "key_of", "k", "ky"];
const IMG_F = ["image", "img", "cover", "artwork", "release_image_uri", "album_art", "thumbnail", "ia"];

const first = (o: Record<string, any>, f: string[]) => { for (const k of f) if (o[k] != null && o[k] !== "") return o[k]; return undefined; };
const asText = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (typeof v === "object") return asText(first(v, ["name", "artist_name", "title", "text"]));
  return String(v);
};
const asImg = (v: any): string | undefined => {
  if (!v) return undefined;
  if (typeof v === "string") return /^https?:/.test(v) ? v : undefined;
  if (Array.isArray(v)) return asImg(v[v.length - 1]);
  return asImg(first(v, ["uri", "url", "dynamic_uri", "src"]));
};

export interface Extracted { title: string; artist: string; bpm?: number; key?: string; coverUrl?: string; durationSec?: number; url?: string }

/** Extrai faixas de qualquer JSON embutido */
export function extractTracks(json: unknown): Extracted[] {
  const objs = deepFind(json, (o) => {
    const t = first(o, TITLE_F);
    return typeof t === "string" && (first(o, BPM_F) != null || first(o, KEY_F) != null);
  });
  return objs.map((o) => {
    let title = asText(first(o, TITLE_F));
    const mix = o.mix_name || o.mixName;
    if (mix && !title.includes(mix)) title = `${title} (${mix})`;
    const bpmRaw = first(o, BPM_F);
    const bpm = typeof bpmRaw === "number" ? bpmRaw : parseFloat(String(bpmRaw ?? ""));
    const keyRaw = first(o, KEY_F);
    const key = parseKey(typeof keyRaw === "object" ? asText(keyRaw) || keyRaw?.camelot_number + (keyRaw?.camelot_letter || "") : String(keyRaw ?? "").replace(/\s*(major|minor)$/i, (m) => (/minor/i.test(m) ? "m" : "")));
    return {
      title, artist: asText(first(o, ARTIST_F)),
      bpm: bpm > 40 && bpm < 250 ? bpm : undefined, key,
      coverUrl: asImg(first(o, IMG_F)) ?? asImg(o.release?.image) ?? asImg(o.release?.release_image_uri),
      durationSec: parseDuration(o.length ?? o.duration) ?? (o.length_ms ? o.length_ms / 1000 : undefined),
    };
  }).filter((t) => t.title);
}

function embeddedJson(html: string): unknown[] {
  const $ = cheerio.load(html);
  const out: unknown[] = [];
  $('script#__NEXT_DATA__, script[type="application/json"], script[type="application/ld+json"]').each((_, el) => {
    try { out.push(JSON.parse($(el).text())); } catch { /* ignore */ }
  });
  return out;
}

function fromHtml(html: string): Extracted[] {
  return embeddedJson(html).flatMap(extractTracks);
}

function makeScraper(id: string, label: string, provides: SourceDef["provides"], search: (term: string) => Promise<Extracted[]>, pageUrl: (term: string) => string): SourceDef {
  return {
    id, label, kind: "scrape", provides, enabled: () => process.env.DISABLE_SCRAPING !== "1",
    async lookup(q) {
      const term = `${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim();
      const items = await search(term);
      const best = pickBest(q, items, (t) => t);
      if (!best) return null;
      const t = best.item;
      return { matchScore: best.score, matchedTitle: t.title, matchedArtist: t.artist, bpm: t.bpm, key: t.key, coverUrl: t.coverUrl, durationSec: t.durationSec, url: t.url || pageUrl(term) };
    },
  };
}

export const tunebat = makeScraper("tunebat", "Tunebat", ["key", "bpm", "cover"], async (term) => {
  try {
    const j = JSON.parse(await fetchText(`https://api.tunebat.com/api/tracks/search?term=${encodeURIComponent(term)}`));
    const r = extractTracks(j);
    if (r.length) return r;
  } catch (e) { if ((e as Error).message.includes("Cloudflare")) throw e; }
  return fromHtml(await fetchText(`https://tunebat.com/Search?q=${encodeURIComponent(term)}`));
}, (t) => `https://tunebat.com/Search?q=${encodeURIComponent(t)}`);

export const beatport = makeScraper("beatport", "Beatport", ["key", "bpm", "cover"], async (term) => {
  return fromHtml(await fetchText(`https://www.beatport.com/search/tracks?q=${encodeURIComponent(term)}`));
}, (t) => `https://www.beatport.com/search?q=${encodeURIComponent(t)}`);

/** YouTube Music: dados embutidos em initialData.push({... data: '\x7b...'}) */
export const youtubeMusic: SourceDef = {
  id: "ytmusic", label: "YouTube Music", kind: "scrape", provides: ["cover"], coverOnly: true,
  enabled: () => process.env.DISABLE_SCRAPING !== "1",
  async lookup(q) {
    const term = `${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim();
    const html = await fetchText(`https://music.youtube.com/search?q=${encodeURIComponent(term)}`, { headers: { Cookie: "CONSENT=YES+1" } });
    const items: (Extracted & { videoId?: string })[] = [];
    for (const m of html.matchAll(/data: '((?:[^'\\]|\\.)*)'/g)) {
      let json: unknown;
      try {
        const decoded = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_s, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/").replace(/\\\\u([0-9a-fA-F]{4})/g, "\\u$1");
        json = JSON.parse(decoded);
      } catch { continue; }
      const rows = deepFind(json, (o) => !!o.flexColumns && !!o.thumbnail);
      const cards = deepFind(json, (o) => !!o.title?.runs && !!o.thumbnail && !!o.subtitle?.runs);
      for (const r of rows) {
        const col = (i: number) => (r.flexColumns[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x: any) => x.text);
        const sub: string[] = col(1);
        if (!/^(Song|Música|Video|Vídeo)$/i.test(sub[0] || "")) continue;
        const thumbs = deepFind(r.thumbnail, (o) => Array.isArray(o.thumbnails))[0]?.thumbnails || [];
        const parts = sub.join("").split(" • ");
        items.push({ title: col(0).join(""), artist: parts[1] || "", durationSec: parseDuration(parts[parts.length - 1]), coverUrl: thumbs.at(-1)?.url });
      }
      for (const c of cards) {
        const sub = c.subtitle.runs.map((x: any) => x.text).join("").split(" • ");
        const thumbs = deepFind(c.thumbnail, (o) => Array.isArray(o.thumbnails))[0]?.thumbnails || [];
        items.push({ title: c.title.runs.map((x: any) => x.text).join(""), artist: sub[1] || "", coverUrl: thumbs.at(-1)?.url });
      }
    }
    const best = pickBest(q, items.filter((i) => i.coverUrl), (t) => t);
    if (!best) return null;
    // aumenta a resolução da miniatura (lh3: =w60-h60 / ytimg: hqdefault)
    const cover = best.item.coverUrl!.replace(/=w\d+-h\d+/, "=w1000-h1000");
    return { matchScore: best.score, matchedTitle: best.item.title, matchedArtist: best.item.artist, coverUrl: cover, url: `https://music.youtube.com/search?q=${encodeURIComponent(term)}` };
  },
};
