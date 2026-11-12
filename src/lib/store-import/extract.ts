/**
 * Extração de faixas de páginas de lojas (Beatport) — roda DENTRO da página que o usuário
 * abriu no próprio navegador (via botão nos favoritos). Precisa ser autocontida: o código
 * desta função é convertido em texto para montar o favorito.
 *
 * Filtra pelo tipo de página: numa faixa, só ela; num release, só as faixas dele; em charts,
 * playlists, artistas e selos, só a lista principal (sem "recomendados"); na busca, todas.
 */
export interface StoreTrack {
  title: string; mix?: string; artists: string; remixers?: string;
  bpm?: number; key?: string; genre?: string; label?: string; isrc?: string;
  durationSec?: number; coverUrl?: string; url?: string; release?: string;
  id?: string; releaseId?: string;
}
export type StorePageType = "track" | "release" | "search" | "list";

export function extractStoreTracks(
  doc: Document, href: string, nextDataText?: string | null,
): { store: string; page: string; pageType: StorePageType; pageId?: string; tracks: StoreTrack[] } {
  const path = new URL(href).pathname;
  const mTrack = /\/track\/[^/]+\/(\d+)/.exec(path);
  const mRelease = /\/release\/[^/]+\/(\d+)/.exec(path);
  const pageType: StorePageType = mTrack ? "track" : mRelease ? "release" : /\/search/.test(path) ? "search" : "list";
  const pageId = mTrack?.[1] ?? mRelease?.[1];

  const nm = (x: any): string => (x == null ? "" : typeof x === "string" ? x : x.name ?? x.artist_name ?? x.genre_name ?? x.label_name ?? "");
  const names = (a: any): string => (Array.isArray(a) ? a.map(nm).filter(Boolean).join(", ") : nm(a));
  const img = (r: any): string | undefined => {
    const u = r?.image?.uri ?? r?.image?.dynamic_uri ?? r?.release_image_uri ?? r?.release_image_dynamic_uri;
    return typeof u === "string" ? u.replace("{w}x{h}", "1400x1400").replace(/\/image_size\/\d+x\d+\//, "/image_size/1400x1400/") : undefined;
  };
  const isTrack = (o: any) => o && typeof o === "object" && !Array.isArray(o) && "bpm" in o && (o.name || o.track_name) && (o.artists || o.key || o.key_name);
  const conv = (o: any): StoreTrack => {
    const len = o.length_ms ?? (typeof o.length === "number" ? o.length : undefined);
    const keyName = typeof o.key === "string" ? o.key : o.key?.name ?? o.key_name;
    const rel = o.release ?? {};
    const id = o.id ?? o.track_id;
    return {
      title: o.name ?? o.track_name, mix: o.mix_name, artists: names(o.artists), remixers: names(o.remixers) || undefined,
      bpm: typeof o.bpm === "number" ? Math.round(o.bpm) : parseFloat(o.bpm) || undefined,
      key: keyName || undefined,
      genre: nm(Array.isArray(o.genre) ? o.genre[0] : o.genre) || undefined,
      label: nm(rel.label) || nm(o.label) || undefined,
      isrc: o.isrc || undefined,
      durationSec: len ? Math.round(len / 1000) : undefined,
      coverUrl: img(rel) ?? img(o),
      url: o.slug && id ? `https://www.beatport.com/track/${o.slug}/${id}` : undefined,
      release: nm(rel) || o.release_name || undefined,
      id: id != null ? String(id) : undefined,
      releaseId: rel.id != null ? String(rel.id) : o.release_id != null ? String(o.release_id) : undefined,
    };
  };

  // percorre o JSON guardando em qual lista (array) cada faixa apareceu
  const groups: any[][] = [];
  const loose: any[] = [];
  const walk = (o: any, d: number) => {
    if (!o || typeof o !== "object" || d > 30) return;
    if (Array.isArray(o)) {
      const tr = o.filter(isTrack);
      if (tr.length) groups.push(tr);
      for (const x of o) if (!isTrack(x)) walk(x, d + 1); else walk(x, d + 1);
      return;
    }
    if (isTrack(o)) loose.push(o);
    for (const k in o) walk(o[k], d + 1);
  };
  let data: any = null;
  try { data = JSON.parse(nextDataText || doc.getElementById("__NEXT_DATA__")?.textContent || "null"); } catch { data = null; }
  if (data) walk(data, 0);

  const all = [...loose];
  let chosen: any[];
  if (pageType === "track") chosen = all.filter((o) => String(o.id ?? o.track_id) === pageId).slice(0, 1);
  else if (pageType === "release") chosen = all.filter((o) => String(o.release?.id ?? o.release_id) === pageId);
  else if (pageType === "list") chosen = groups.sort((a, b) => b.length - a.length)[0] ?? [];
  else chosen = all;

  const seen: Record<string, boolean> = {};
  const tracks = chosen.map(conv).filter((t) => {
    const k = t.id ?? t.title + t.artists;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  return { store: /beatport\.com/.test(href) ? "Beatport" : new URL(href).hostname, page: doc.title, pageType, pageId, tracks };
}
