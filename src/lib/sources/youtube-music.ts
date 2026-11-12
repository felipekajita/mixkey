/**
 * YouTube Music (sem API pública): lê os dados embutidos na página de busca para
 * obter capas. Se a página mudar ou bloquear, a fonte é ignorada e a faixa segue
 * com as demais.
 */
import type { SourceDef } from "./index";
import { pickBest } from "./index";
import { fetchText, deepFind } from "./http";
import { cleanTitle } from "../match";
import { parseDuration } from "../bpm";

interface Item { title: string; artist: string; coverUrl?: string; durationSec?: number }

/** YouTube Music: dados embutidos em initialData.push({... data: '\x7b...'}) */
export const youtubeMusic: SourceDef = {
  id: "ytmusic", label: "YouTube Music", kind: "scrape", provides: ["cover"], coverOnly: true,
  enabled: () => process.env.DISABLE_SCRAPING !== "1",
  async lookup(q) {
    const term = `${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim();
    const html = await fetchText(`https://music.youtube.com/search?q=${encodeURIComponent(term)}`, { headers: { Cookie: "CONSENT=YES+1" } });
    const items: Item[] = [];
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
