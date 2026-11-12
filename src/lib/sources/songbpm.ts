import type { SourceDef } from "./index";
import { pickBest } from "./pick";
import { BROWSER_UA, fetchText } from "./http";
import { parseKey } from "../camelot";
import { parseDuration } from "../bpm";
import { cleanTitle } from "../match";

/**
 * SongBPM (songbpm.com): busca pública por nome; a página da faixa traz key com modo
 * (maior/menor), BPM e duração. Os dados vêm da análise do Spotify (mesma base da
 * ReccoBeats), então servem para confirmar e para cobrir faixas que a ReccoBeats não acha.
 * Respeita o robots.txt (só /apple-music é proibido); 1 busca + 1 página por faixa.
 */
const BASE = "https://songbpm.com";

interface SbItem { href: string; title: string; artist: string; key?: string; bpm?: number; durationSec?: number }

const strip = (h: string) => h.replace(/<[^>]*>/g, "\n").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

export function parseSongbpmResults(html: string): SbItem[] {
  const out: SbItem[] = [];
  for (const m of html.matchAll(/<a[^>]+href="(\/@[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const lines = strip(m[2]).split("\n").map((l) => l.trim()).filter(Boolean);
    const ki = lines.indexOf("Key");
    if (ki < 2) continue; // links sem dados (artistas, rodapé)
    const val = (label: string) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] : undefined; };
    out.push({
      href: m[1], artist: lines[ki - 2], title: lines[ki - 1], key: val("Key"),
      bpm: val("BPM") ? Math.round(parseFloat(val("BPM")!)) : undefined, durationSec: parseDuration(val("Duration")),
    });
  }
  return out;
}

/** "…with a F♯/G♭ key and a major mode…" → Camelot */
export function parseSongbpmKey(html: string): string | undefined {
  const t = strip(html).replace(/\s+/g, " ");
  const m = /with an? ([A-G][♯♭#b]?)(?:\/[A-G][♯♭#b]?)? key and an? (major|minor) mode/i.exec(t);
  return m ? parseKey(`${m[1]} ${m[2]}`) : undefined;
}

export const songbpm: SourceDef = {
  id: "songbpm", label: "SongBPM", kind: "scrape", provides: ["key", "bpm"],
  enabled: () => process.env.DISABLE_SCRAPING !== "1",
  async lookup(q) {
    const query = `${q.artist.split(/,|&| feat/i)[0]} ${cleanTitle(q.title)}`.trim();
    // a busca é um POST que redireciona para a página de resultados
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${BASE}/searches`, {
      method: "POST", redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }).toString(),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseSongbpmResults(await res.text());
    const best = pickBest(q, items, (i) => ({ title: i.title, artist: i.artist, durationSec: i.durationSec }));
    if (!best) return null;
    const page = await fetchText(BASE + best.item.href, { timeoutMs: 12000 });
    return {
      matchScore: best.score, matchedTitle: best.item.title, matchedArtist: best.item.artist,
      key: parseSongbpmKey(page), bpm: best.item.bpm, durationSec: best.item.durationSec,
      url: BASE + best.item.href, note: "dados da análise do Spotify",
    };
  },
};
