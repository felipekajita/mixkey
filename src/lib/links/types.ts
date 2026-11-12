export interface ResolvedTrack {
  title: string;
  artist: string;
  durationSec?: number;
  coverUrl?: string;
  isrc?: string;
  previewUrl?: string;
  url?: string;
}

export interface ResolveResult {
  url: string;
  platform: string;          // "Spotify", "Deezer", ...
  kind: "track" | "album" | "playlist" | "unknown";
  name?: string;             // nome do álbum/playlist
  tracks: ResolvedTrack[];
  warning?: string;
  error?: string;
}

/** Plataformas reconhecidas (para a UI e para validar links) */
export const PLATFORMS: { label: string; re: RegExp; note?: string }[] = [
  { label: "Spotify", re: /(^|\.)spotify\.(com|link)$|spotify\.app\.link$/ },
  { label: "Deezer", re: /(^|\.)deezer\.(com|page\.link)$|^link\.deezer\.com$/ },
  { label: "Apple Music", re: /^(music|itunes|geo\.music)\.apple\.com$/ },
  { label: "YouTube Music", re: /^music\.youtube\.com$/ },
  { label: "YouTube", re: /(^|\.)youtube\.com$|^youtu\.be$/ },
  { label: "SoundCloud", re: /(^|\.)soundcloud\.com$|^on\.soundcloud\.com$/ },
  { label: "Beatport", re: /(^|\.)beatport\.com$/, note: "o Beatport bloqueia leitura automática; o artista pode vir vazio" },
  { label: "Tidal", re: /(^|\.)tidal\.com$/ },
  { label: "Amazon Music", re: /^music\.amazon\.|(^|\.)amazon\.[a-z.]+$/ },
  { label: "Bandcamp", re: /(^|\.)bandcamp\.com$/ },
  { label: "Yandex Music", re: /^music\.yandex\./ },
  { label: "Shazam", re: /(^|\.)shazam\.com$/ },
  { label: "Last.fm", re: /(^|\.)last\.fm$/ },
  { label: "Audiomack", re: /(^|\.)audiomack\.com$/ },
  { label: "Traxsource", re: /(^|\.)traxsource\.com$/ },
  { label: "Juno Download", re: /(^|\.)junodownload\.com$/ },
  { label: "Discogs", re: /(^|\.)discogs\.com$/ },
  { label: "Mixcloud", re: /(^|\.)mixcloud\.com$/ },
];

export function platformOf(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return PLATFORMS.find((p) => p.re.test(h))?.label ?? h.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/** Extrai URLs de um texto livre */
export function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"')\]]+|spotify:(track|album|playlist):[A-Za-z0-9]+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;]+$/, "")))];
}
