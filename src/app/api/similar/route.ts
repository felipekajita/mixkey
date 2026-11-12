import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/sources/http";
import { lastfmCall, lastfmEnabled } from "@/lib/sources/lastfm";
import { normalizeName, cleanTitle } from "@/lib/match";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface Suggestion { title: string; artist: string; coverUrl?: string; previewUrl?: string; url?: string; durationSec?: number; reason: string }

interface DzT { title: string; duration: number; preview: string; link: string; artist: { name: string }; album: { cover_xl?: string; cover_big?: string } }
const dz = (t: DzT, reason: string): Suggestion => ({ title: t.title, artist: t.artist.name, coverUrl: t.album?.cover_xl || t.album?.cover_big, previewUrl: t.preview, url: t.link, durationSec: t.duration, reason });

/** GET /api/similar?artists=A|B|C&tracks=Artista - Título|... */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const artists = (sp.get("artists") || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const tracks = (sp.get("tracks") || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const out: Suggestion[] = [];
  const jobs: Promise<void>[] = [];

  for (const name of artists) {
    jobs.push((async () => {
      const s = await fetchJson<{ data: { id: number; name: string }[] }>(`https://api.deezer.com/search/artist?limit=1&q=${encodeURIComponent(name)}`);
      const a = s.data?.[0];
      if (!a) return;
      const top = await fetchJson<{ data: DzT[] }>(`https://api.deezer.com/artist/${a.id}/top?limit=6`);
      top.data?.forEach((t) => out.push(dz(t, `Mais de ${a.name}`)));
      const rel = await fetchJson<{ data: { id: number; name: string }[] }>(`https://api.deezer.com/artist/${a.id}/related?limit=5`);
      await Promise.all((rel.data || []).map(async (r) => {
        const rt = await fetchJson<{ data: DzT[] }>(`https://api.deezer.com/artist/${r.id}/top?limit=3`);
        rt.data?.forEach((t) => out.push(dz(t, `Parecido com ${a.name}`)));
      }));
    })().catch(() => {}));
  }

  if (lastfmEnabled()) {
    for (const t of tracks) {
      const [artist, ...rest] = t.split(" - ");
      const title = rest.join(" - ");
      if (!title) continue;
      jobs.push((async () => {
        const r = await lastfmCall<{ similartracks?: { track: { name: string; artist: { name: string }; duration?: number }[] } }>({ method: "track.getSimilar", artist, track: cleanTitle(title), limit: "10" });
        r.similartracks?.track?.forEach((x) => out.push({ title: x.name, artist: x.artist.name, durationSec: x.duration || undefined, reason: `Similar a "${cleanTitle(title)}"` }));
      })().catch(() => {}));
    }
  }
  await Promise.all(jobs);

  const seen = new Set<string>();
  const uniq = out.filter((s) => {
    const k = normalizeName(`${s.artist} ${cleanTitle(s.title)}`);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // intercala motivos para variedade
  uniq.sort(() => Math.random() - 0.5);
  return NextResponse.json({ suggestions: uniq.slice(0, 40) });
}
