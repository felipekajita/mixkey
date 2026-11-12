"use client";
import type { ParsedTrack } from "../parsers/text";
import { splitVersion } from "../match";
import type { ResolveResult } from "./types";
export { extractUrls, platformOf, PLATFORMS } from "./types";

/** Resolve vários links (3 por vez), avisando o progresso */
export async function resolveLinks(urls: string[], onProgress?: (done: number, total: number) => void): Promise<ResolveResult[]> {
  const out: ResolveResult[] = new Array(urls.length);
  let i = 0, done = 0;
  async function worker() {
    while (i < urls.length) {
      const k = i++;
      try {
        const r = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urls[k] }) });
        out[k] = await r.json();
      } catch {
        out[k] = { url: urls[k], platform: "Link", kind: "unknown", tracks: [], error: "Falha de conexão" };
      }
      onProgress?.(++done, urls.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

export function resultsToParsed(results: ResolveResult[]): ParsedTrack[] {
  return results.flatMap((r) =>
    r.tracks.map((t) => ({
      title: t.title, artist: t.artist, version: splitVersion(t.title).version, durationSec: t.durationSec,
      coverUrl: t.coverUrl, isrc: t.isrc, previewUrl: t.previewUrl, sourceUrl: t.url ?? r.url, sourceLabel: r.platform,
    })),
  );
}
