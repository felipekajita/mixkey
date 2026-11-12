import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/sources/http";
import { lastfmCall, lastfmEnabled } from "@/lib/sources/lastfm";
import { normalizeName, cleanTitle } from "@/lib/match";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface Suggestion { title: string; artist: string; coverUrl?: string; previewUrl?: string; url?: string; durationSec?: number; reason: string; genres?: string[]; albumId?: number }

interface DzT { title: string; duration: number; preview: string; link: string; artist: { name: string }; album: { id?: number; cover_xl?: string; cover_big?: string } }
const dz = (t: DzT, reason: string): Suggestion => ({ title: t.title, artist: t.artist.name, coverUrl: t.album?.cover_xl || t.album?.cover_big, previewUrl: t.preview, url: t.link, durationSec: t.duration, reason, albumId: t.album?.id });

// caches simples entre chamadas (instância quente)
const artistTags = new Map<string, string[]>();
const albumGenres = new Map<number, string[]>();

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]).catch(() => {}); }));
}

/**
 * GET /api/similar?artists=A|B&tracks=Artista - Título|…&genres=melodic house|tech house
 * Candidatas: mesmos artistas, artistas parecidos (Last.fm/Deezer), faixas similares (Last.fm)
 * e as mais ouvidas dos gêneros da biblioteca (Last.fm). Cada sugestão volta com seus gêneros.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const list = (k: string, n: number) => (sp.get(k) || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, n);
  const artists = list("artists", 6), tracks = list("tracks", 4), genres = list("genres", 3);
  const out: Suggestion[] = [];
  const jobs: Promise<void>[] = [];
  const lf = lastfmEnabled();

  for (const name of artists) {
    jobs.push((async () => {
      const s = await fetchJson<{ data: { id: number; name: string }[] }>(`https://api.deezer.com/search/artist?limit=1&q=${encodeURIComponent(name)}`);
      const a = s.data?.[0];
      if (!a) return;
      const top = await fetchJson<{ data: DzT[] }>(`https://api.deezer.com/artist/${a.id}/top?limit=6`);
      top.data?.forEach((t) => out.push(dz(t, `Mais de ${a.name}`)));
      // artistas parecidos: Last.fm (mais fiel ao gênero) ou Deezer
      let related: string[] = [];
      if (lf) {
        const r = await lastfmCall<{ similarartists?: { artist: { name: string }[] } }>({ method: "artist.getSimilar", artist: a.name, limit: "6" }).catch(() => null);
        related = r?.similarartists?.artist?.map((x) => x.name) ?? [];
      }
      if (!related.length) {
        const rel = await fetchJson<{ data: { id: number; name: string }[] }>(`https://api.deezer.com/artist/${a.id}/related?limit=5`);
        related = (rel.data || []).map((x) => x.name);
      }
      await Promise.all(related.slice(0, 5).map(async (rn) => {
        const rs = await fetchJson<{ data: { id: number; name: string }[] }>(`https://api.deezer.com/search/artist?limit=1&q=${encodeURIComponent(rn)}`).catch(() => null);
        const ra = rs?.data?.[0];
        if (!ra) return;
        const rt = await fetchJson<{ data: DzT[] }>(`https://api.deezer.com/artist/${ra.id}/top?limit=3`).catch(() => null);
        rt?.data?.forEach((t) => out.push(dz(t, `Parecido com ${a.name}`)));
      }));
    })().catch(() => {}));
  }

  if (lf) {
    for (const t of tracks) {
      const [artist, ...rest] = t.split(" - ");
      const title = rest.join(" - ");
      if (!title) continue;
      jobs.push((async () => {
        const r = await lastfmCall<{ similartracks?: { track: { name: string; artist: { name: string }; duration?: number }[] } }>({ method: "track.getSimilar", artist, track: cleanTitle(title), limit: "10" });
        r.similartracks?.track?.forEach((x) => out.push({ title: x.name, artist: x.artist.name, durationSec: x.duration || undefined, reason: `Similar a "${cleanTitle(title)}"` }));
      })().catch(() => {}));
    }
    // faixas mais ouvidas dos gêneros da biblioteca
    for (const g of genres) {
      jobs.push((async () => {
        const r = await lastfmCall<{ tracks?: { track: { name: string; artist: { name: string }; duration?: string }[] } }>({ method: "tag.getTopTracks", tag: g, limit: "12" });
        r.tracks?.track?.forEach((x) => out.push({ title: x.name, artist: x.artist.name, durationSec: x.duration ? +x.duration || undefined : undefined, reason: `Destaque em ${g}`, genres: [g] }));
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
  }).sort(() => Math.random() - 0.5).slice(0, 45);

  // sugestões vindas do Last.fm não têm prévia/capa: completa pelo Deezer (para analisar key/BPM)
  await pool(uniq.filter((x) => !x.previewUrl).slice(0, 20), 6, async (x) => {
    const r = await fetchJson<{ data: DzT[] }>(`https://api.deezer.com/search?limit=3&q=${encodeURIComponent(`artist:"${x.artist}" track:"${cleanTitle(x.title)}"`)}`);
    const hit = r.data?.find((t) => normalizeName(t.artist.name) === normalizeName(x.artist)) ?? r.data?.[0];
    if (hit) Object.assign(x, { previewUrl: hit.preview, coverUrl: x.coverUrl ?? hit.album?.cover_xl, url: x.url ?? hit.link, albumId: hit.album?.id });
  });

  // gêneros de cada sugestão: tags do artista (Last.fm) ou gênero do álbum (Deezer)
  if (lf) {
    const names = [...new Set(uniq.map((s) => s.artist.split(/,|&| feat/i)[0].trim()))].filter((n) => !artistTags.has(n.toLowerCase()));
    await pool(names.slice(0, 35), 6, async (n) => {
      const r = await lastfmCall<{ toptags?: { tag: { name: string; count: number }[] } }>({ method: "artist.getTopTags", artist: n });
      artistTags.set(n.toLowerCase(), (r.toptags?.tag ?? []).filter((t) => t.count >= 10).slice(0, 6).map((t) => t.name));
    });
  }
  const albums = [...new Set(uniq.filter((s) => s.albumId && !albumGenres.has(s.albumId)).map((s) => s.albumId!))];
  await pool(albums.slice(0, 35), 6, async (id) => {
    const r = await fetchJson<{ genres?: { data: { name: string }[] } }>(`https://api.deezer.com/album/${id}`);
    albumGenres.set(id, (r.genres?.data ?? []).map((g) => g.name));
  });
  for (const s of uniq) {
    const tags = new Set(s.genres ?? []);
    (artistTags.get(s.artist.split(/,|&| feat/i)[0].trim().toLowerCase()) ?? []).forEach((t) => tags.add(t));
    (s.albumId ? albumGenres.get(s.albumId) ?? [] : []).forEach((t) => tags.add(t));
    s.genres = [...tags];
    delete s.albumId;
  }
  return NextResponse.json({ suggestions: uniq });
}
