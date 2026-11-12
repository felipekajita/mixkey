import { fetchJson, fetchText, deepFind, BROWSER_UA } from "../sources/http";
import { spotifyApi, spotifyEnabled } from "../sources/spotify";
import { genericPage, splitTitleArtist, cleanSiteTitle } from "./meta";
import { platformOf, type ResolveResult, type ResolvedTrack } from "./types";

const MAX_TRACKS = 300;

/** Segue redirecionamentos de links curtos (link.deezer.com, spotify.link, on.soundcloud.com…) */
async function expand(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": BROWSER_UA } });
    clearTimeout(t);
    const html = r.headers.get("content-type")?.includes("html") ? await r.text() : "";
    // alguns encurtadores redirecionam via meta/JS
    const meta = /<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>]+)/i.exec(html)?.[1] ?? /window\.location(?:\.href)?\s*=\s*["']([^"']+)/.exec(html)?.[1];
    return meta ? new URL(meta, r.url).toString() : r.url || url;
  } catch {
    return url;
  }
}

// ---------------- Spotify ----------------
async function spotify(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  let m = /spotify:(track|album|playlist):([A-Za-z0-9]+)/.exec(url) ?? /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url);
  if (!m && /spotify\.(link|app\.link)/.test(url)) {
    url = await expand(url);
    m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url);
  }
  if (!m) throw new Error("Link do Spotify não reconhecido (use faixa, álbum ou playlist)");
  const [, type, id] = m;
  const html = await fetchText(`https://open.spotify.com/embed/${type}/${id}`, { timeoutMs: 9000 });
  const nd = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  const e = nd ? JSON.parse(nd)?.props?.pageProps?.state?.data?.entity : null;
  if (!e) throw new Error("Spotify não retornou dados");
  const imgs: { url: string; maxWidth?: number }[] = e.visualIdentity?.image ?? e.coverArt?.sources ?? [];
  const cover = [...imgs].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url;
  const link = (tid?: string) => (tid ? `https://open.spotify.com/track/${tid}` : undefined);
  if (type === "track") {
    return { kind: "track", tracks: [{ title: e.name ?? e.title, artist: (e.artists ?? []).map((a: any) => a.name).join(", "), durationSec: e.duration ? Math.round(e.duration / 1000) : undefined, coverUrl: cover, previewUrl: e.audioPreview?.url, url: link(id) }] };
  }
  let tracks: ResolvedTrack[] = (e.trackList ?? []).map((t: any) => ({
    title: t.title, artist: t.subtitle ?? "", durationSec: t.duration ? Math.round(t.duration / 1000) : undefined,
    coverUrl: type === "album" ? cover : undefined, previewUrl: t.audioPreview?.url, url: link(t.uri?.split(":").pop()),
  }));
  let warning: string | undefined;
  // a página de embed mostra até ~50–100 faixas; com a chave da API, busca a playlist inteira
  if (type === "playlist" && tracks.length >= 50 && spotifyEnabled()) {
    try {
      const all: ResolvedTrack[] = [];
      for (let off = 0; off < MAX_TRACKS; off += 100) {
        const p = await spotifyApi<{ items: { track: any }[]; next: string | null }>(`playlists/${id}/tracks?limit=100&offset=${off}&fields=next,items(track(id,name,duration_ms,external_ids,preview_url,artists(name),album(images)))`);
        p.items.forEach(({ track: t }) => t && all.push({ title: t.name, artist: t.artists.map((a: any) => a.name).join(", "), durationSec: Math.round(t.duration_ms / 1000), isrc: t.external_ids?.isrc, coverUrl: t.album?.images?.[0]?.url, previewUrl: t.preview_url ?? undefined, url: link(t.id) }));
        if (!p.next) break;
      }
      if (all.length > tracks.length) tracks = all;
    } catch { /* playlists editoriais podem ser restritas à API */ }
  }
  if (type === "playlist" && tracks.length >= 50 && tracks.length < MAX_TRACKS) warning = "Playlists grandes podem vir parciais (o Spotify limita a leitura).";
  return { kind: type as "album" | "playlist", name: e.name ?? e.title, tracks, warning };
}

// ---------------- Deezer ----------------
interface DzT { id: number; title: string; duration: number; isrc?: string; preview?: string; link?: string; artist: { name: string }; album?: { cover_xl?: string; cover_big?: string } }
const dzTrack = (t: DzT, cover?: string): ResolvedTrack => ({ title: t.title, artist: t.artist?.name ?? "", durationSec: t.duration, isrc: t.isrc, previewUrl: t.preview, coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? cover, url: t.link ?? `https://www.deezer.com/track/${t.id}` });

async function deezer(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  if (/link\.deezer\.com|deezer\.page\.link/.test(url)) url = await expand(url);
  const m = /deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/.exec(url);
  if (!m) throw new Error("Link do Deezer não reconhecido (use faixa, álbum ou playlist)");
  const [, type, id] = m;
  if (type === "track") {
    const t = await fetchJson<DzT & { error?: unknown }>(`https://api.deezer.com/track/${id}`);
    if (t.error) throw new Error("Faixa não encontrada no Deezer");
    return { kind: "track", tracks: [dzTrack(t)] };
  }
  const info = await fetchJson<{ title: string; cover_xl?: string; error?: unknown }>(`https://api.deezer.com/${type}/${id}`);
  if (info.error) throw new Error("Não encontrado no Deezer (a playlist é pública?)");
  const tracks: ResolvedTrack[] = [];
  let next: string | null = `https://api.deezer.com/${type}/${id}/tracks?limit=100`;
  while (next && tracks.length < MAX_TRACKS) {
    const p: { data: DzT[]; next?: string } = await fetchJson(next);
    p.data.forEach((t) => tracks.push(dzTrack(t, info.cover_xl)));
    next = p.next ?? null;
  }
  return { kind: type as "album" | "playlist", name: info.title, tracks };
}

// ---------------- Apple Music ----------------
interface ItT { wrapperType: string; kind?: string; trackName: string; artistName: string; trackTimeMillis?: number; artworkUrl100?: string; previewUrl?: string; trackViewUrl?: string; collectionName?: string }
const itTrack = (t: ItT): ResolvedTrack => ({ title: t.trackName, artist: t.artistName, durationSec: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : undefined, coverUrl: t.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/1200x1200bb."), previewUrl: t.previewUrl, url: t.trackViewUrl });

async function apple(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  const u = new URL(url);
  const cc = /^\/([a-z]{2})\//.exec(u.pathname)?.[1] ?? "us";
  const trackId = u.searchParams.get("i") ?? /\/song\/(?:[^/]+\/)?(\d+)/.exec(u.pathname)?.[1];
  if (trackId) {
    const r = await fetchJson<{ results: ItT[] }>(`https://itunes.apple.com/lookup?country=${cc}&id=${trackId}`);
    if (!r.results[0]) throw new Error("Faixa não encontrada no Apple Music");
    return { kind: "track", tracks: [itTrack(r.results[0])] };
  }
  const album = /\/album\/(?:[^/]+\/)?(\d+)/.exec(u.pathname)?.[1];
  if (album) {
    const r = await fetchJson<{ results: ItT[] }>(`https://itunes.apple.com/lookup?country=${cc}&id=${album}&entity=song&limit=200`);
    const songs = r.results.filter((x) => x.wrapperType === "track");
    return { kind: "album", name: r.results.find((x) => x.wrapperType === "collection")?.collectionName, tracks: songs.map(itTrack) };
  }
  if (/\/playlist\//.test(u.pathname)) {
    // a página traz a lista (JSON-LD) sem os artistas → completa pela API do iTunes
    const page = await genericPage(url);
    const ids = page.tracks.map((t) => /\/song\/(?:[^/]+\/)?(\d+)/.exec(t.url ?? "")?.[1]).filter(Boolean) as string[];
    const found = new Map<string, ItT>();
    for (let i = 0; i < ids.length; i += 150) {
      const r = await fetchJson<{ results: (ItT & { trackId: number })[] }>(`https://itunes.apple.com/lookup?country=${cc}&id=${ids.slice(i, i + 150).join(",")}`);
      r.results.forEach((x) => found.set(String(x.trackId), x));
    }
    const tracks = page.tracks.map((t, i) => (found.get(ids[i]) ? itTrack(found.get(ids[i])!) : t));
    return { kind: "playlist", name: page.name, tracks };
  }
  return genericPage(url);
}

// ---------------- YouTube / YouTube Music ----------------
async function youtube(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  const u = new URL(url);
  const id = u.searchParams.get("v") ?? (/youtu\.be$/.test(u.hostname) ? u.pathname.slice(1) : /\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname)?.[2]);
  if (!id) {
    const list = u.searchParams.get("list");
    if (list) return youtubePlaylist(list);
    throw new Error("Link do YouTube sem vídeo");
  }
  const o = await fetchJson<{ title: string; author_name: string; thumbnail_url?: string }>(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
  );
  const channel = o.author_name.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  const at = splitTitleArtist(cleanVideoTitle(o.title), channel);
  // canais de selo ("Spinnin' Records", "Anjunadeep") quase sempre usam "Artista - Título"
  return {
    kind: "track",
    tracks: [{ ...at, coverUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://music.youtube.com/watch?v=${id}` }],
    warning: /\s-\s/.test(cleanSiteTitle(o.title)) ? undefined : `Artista deduzido do canal "${o.author_name}" — confira`,
  };
}

/** Playlists do YouTube / YouTube Music (inclusive álbuns "OLAK5uy_…"): lê os dados embutidos na página */
async function youtubePlaylist(listId: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  if (/^(RD|UL)/.test(listId)) throw new Error("Mixes automáticos do YouTube não podem ser lidos — use uma playlist normal");
  const html = await fetchText(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=en`, { timeoutMs: 10000, headers: { Cookie: "CONSENT=YES+1; SOCS=CAI" } });
  const raw = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(html)?.[1];
  if (!raw) throw new Error("Playlist do YouTube não encontrada (é pública?)");
  const data = JSON.parse(raw);
  const tracks: ResolvedTrack[] = [];
  const text = (x: any): string => x?.content ?? x?.simpleText ?? (x?.runs ?? []).map((r: any) => r.text).join("") ?? "";

  // formato novo (lockupViewModel)
  for (const l of deepFind(data, (o) => o.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && !!o.contentId && !!o.metadata)) {
    const md = l.metadata?.lockupMetadataViewModel;
    const rows: any[] = md?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
    const channel = (rows[0]?.metadataParts ?? []).map((p: any) => text(p.text)).join(" ").replace(/\s+and\s+/g, " & ").trim();
    const dur = /"text":"(\d{1,2}:\d{2}(?::\d{2})?)"/.exec(JSON.stringify(l.contentImage ?? {}))?.[1];
    tracks.push(ytTrack(l.contentId, text(md?.title), channel, dur));
  }
  // formato antigo (playlistVideoRenderer)
  if (!tracks.length) {
    for (const r of deepFind(data, (o) => !!o.videoId && !!o.title && !!o.shortBylineText && "lengthSeconds" in o)) {
      tracks.push({ ...ytTrack(r.videoId, text(r.title), text(r.shortBylineText)), durationSec: +r.lengthSeconds || undefined });
    }
  }
  if (!tracks.length) throw new Error("Não encontrei vídeos nesta playlist (é pública?)");
  const header = deepFind(data, (o) => !!o.pageHeaderViewModel)[0]?.pageHeaderViewModel;
  const name = text(header?.title?.dynamicTextViewModel?.text) || /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1];
  const more = deepFind(data, (o) => !!o.continuationCommand).length > 0;
  return {
    kind: "playlist", name, tracks: tracks.slice(0, MAX_TRACKS),
    warning: more ? `Mostrando as primeiras ${tracks.length} faixas da playlist (o YouTube carrega o resto aos poucos).` : undefined,
  };
}

/** Títulos de vídeo: corta "| créditos…" e marcações como "OFFICIAL MUSIC VIDEO" fora de parênteses */
export function cleanVideoTitle(t: string): string {
  return t.split(/\s+[|｜]\s+/)[0]
    .replace(/\b(official\s+(music\s+)?video|official\s+audio|official\s+visuali[sz]er|lyric\s+video|music\s+video|video\s+oficial|clipe\s+oficial)\b/gi, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ").replace(/[\s\-–|]+$/, "").trim();
}

function ytTrack(id: string, title: string, channel: string, dur?: string): ResolvedTrack {
  const ch = channel.replace(/\s*&\s*\d+\s+more$/i, "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  const at = splitTitleArtist(cleanVideoTitle(title), ch);
  const parts = dur?.split(":").map(Number);
  const durationSec = parts ? parts.reduce((a, n) => a * 60 + n, 0) : undefined;
  return { ...at, durationSec, coverUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://music.youtube.com/watch?v=${id}` };
}

// ---------------- SoundCloud ----------------
async function soundcloud(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  if (/on\.soundcloud\.com/.test(url)) url = await expand(url);
  const o = await fetchJson<{ title: string; author_name: string; thumbnail_url?: string }>(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  const isSet = /\/sets\//.test(url);
  // oEmbed: "Título by Artista"
  let at = splitTitleArtist(o.title, o.author_name);
  if (/\s[-–]\s/.test(at.title) && at.artist === o.author_name) at = splitTitleArtist(at.title, o.author_name);
  if (isSet) return { kind: "playlist", name: at.title, tracks: [], warning: "Playlists (sets) do SoundCloud: só é possível ler o nome — cole os links das faixas" };
  return { kind: "track", tracks: [{ ...at, coverUrl: o.thumbnail_url?.replace(/-t\d+x\d+/, "-t500x500"), url }] };
}

// ---------------- Beatport ----------------
async function beatport(url: string): Promise<Omit<ResolveResult, "url" | "platform">> {
  try {
    return await genericPage(url);
  } catch {
    const m = /beatport\.com\/track\/([^/]+)\/(\d+)/.exec(url);
    if (!m) throw new Error("O Beatport bloqueia leitura automática; cole o link de faixa ou digite o nome");
    const title = decodeURIComponent(m[1]).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { kind: "track", tracks: [{ title, artist: "", url }], warning: "O Beatport bloqueia leitura automática: título lido da URL. Para BPM, key, artista e selo oficiais, abra o link e use o favorito “→ MixKey” (instruções logo acima)" };
  }
}

// ---------------- roteamento ----------------
export async function resolveLink(raw: string): Promise<ResolveResult> {
  const url = raw.trim();
  const platform = platformOf(url.startsWith("spotify:") ? "https://open.spotify.com" : url);
  try {
    let r: Omit<ResolveResult, "url" | "platform">;
    if (url.startsWith("spotify:") || /spotify\.(com|link)|spotify\.app\.link/.test(url)) r = await spotify(url);
    else if (/deezer\.(com|page\.link)/.test(url)) r = await deezer(url);
    else if (/(music|itunes|geo\.music)\.apple\.com/.test(url)) r = await apple(url);
    else if (/youtube\.com|youtu\.be/.test(url)) r = await youtube(url);
    else if (/soundcloud\.com/.test(url)) r = await soundcloud(url);
    else if (/beatport\.com/.test(url)) r = await beatport(url);
    else r = await genericPage(url);
    r.tracks = r.tracks.filter((t) => t.title).slice(0, MAX_TRACKS);
    if (!r.tracks.length && !r.warning) throw new Error("Nenhuma faixa encontrada neste link");
    return { url, platform, ...r };
  } catch (e) {
    const msg = (e as Error).message || "Erro";
    const blocked = /Cloudflare|HTTP 403/.test(msg);
    const hint = /amazon/i.test(platform) ? " O Amazon Music não expõe os dados da faixa na página — cole o nome." : "";
    return { url, platform, kind: "unknown", tracks: [], error: blocked ? `${platform} bloqueou a leitura automática.${hint}` : `${msg.replace(/\.?$/, ".")}${hint}` };
  }
}
