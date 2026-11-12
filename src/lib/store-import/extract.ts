/**
 * Extração de faixas de páginas de lojas (Beatport) — roda DENTRO da página que o usuário
 * abriu no próprio navegador (via botão nos favoritos). Precisa ser autocontida: o código
 * desta função é convertido em texto para montar o favorito.
 */
export interface StoreTrack {
  title: string; mix?: string; artists: string; remixers?: string;
  bpm?: number; key?: string; genre?: string; label?: string; isrc?: string;
  durationSec?: number; coverUrl?: string; url?: string; release?: string;
}

export function extractStoreTracks(doc: Document, href: string): { store: string; page: string; tracks: StoreTrack[] } {
  const out: StoreTrack[] = [];
  const seen: Record<string, boolean> = {};
  const nm = (x: any): string => (x == null ? "" : typeof x === "string" ? x : x.name ?? x.artist_name ?? x.genre_name ?? x.label_name ?? "");
  const names = (a: any): string => (Array.isArray(a) ? a.map(nm).filter(Boolean).join(", ") : nm(a));
  const img = (r: any): string | undefined => {
    const u = r?.image?.uri ?? r?.image?.dynamic_uri ?? r?.release_image_uri ?? r?.release_image_dynamic_uri;
    return typeof u === "string" ? u.replace("{w}x{h}", "1400x1400").replace(/\/image_size\/\d+x\d+\//, "/image_size/1400x1400/") : undefined;
  };
  const add = (o: any) => {
    const title = o.name ?? o.track_name;
    if (!title || o.bpm == null) return;
    const id = String(o.id ?? o.track_id ?? title + names(o.artists));
    if (seen[id]) return;
    seen[id] = true;
    const len = o.length_ms ?? (typeof o.length === "number" ? o.length : undefined);
    const keyName = typeof o.key === "string" ? o.key : o.key?.name ?? o.key_name;
    const rel = o.release ?? {};
    out.push({
      title, mix: o.mix_name, artists: names(o.artists), remixers: names(o.remixers) || undefined,
      bpm: typeof o.bpm === "number" ? Math.round(o.bpm) : parseFloat(o.bpm) || undefined,
      key: keyName || undefined,
      genre: nm(Array.isArray(o.genre) ? o.genre[0] : o.genre) || undefined,
      label: nm(rel.label) || nm(o.label) || undefined,
      isrc: o.isrc || undefined,
      durationSec: len ? Math.round(len / 1000) : undefined,
      coverUrl: img(rel) ?? img(o),
      url: o.slug && (o.id ?? o.track_id) ? `https://www.beatport.com/track/${o.slug}/${o.id ?? o.track_id}` : undefined,
      release: nm(rel) || o.release_name || undefined,
    });
  };
  const walk = (o: any, d: number) => {
    if (!o || typeof o !== "object" || d > 30) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
    if ("bpm" in o && (o.name || o.track_name) && (o.artists || o.key || o.key_name)) add(o);
    for (const k in o) walk(o[k], d + 1);
  };
  const nd = doc.getElementById("__NEXT_DATA__");
  if (nd?.textContent) { try { walk(JSON.parse(nd.textContent), 0); } catch { /* ignora */ } }
  return { store: /beatport\.com/.test(href) ? "Beatport" : (new URL(href)).hostname, page: doc.title, tracks: out };
}
