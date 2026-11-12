import type { Confidence, SourceReading, Track } from "./types";
import { normalizeBpm } from "./bpm";
import { MATCH_THRESHOLD } from "./match";

const KEY_W: Record<string, number> = {
  list: 4, tags: 3, essentia: 3, reccobeats: 2.5, beatport: 2.5, getsongbpm: 2, tunebat: 2, getsongkey: 2, "essentia-preview": 1.8, deezer: 1,
};
const COVER_ORDER = ["tags", "deezer", "spotify", "itunes", "beatport", "tunebat", "ytmusic", "lastfm", "getsongbpm", "musicbrainz", "google"];

export const usable = (r: SourceReading) => !r.error && (r.matchScore == null || r.matchScore >= MATCH_THRESHOLD);

export function computeConsensus(readings: SourceReading[]): Partial<Track> {
  const ok = readings.filter(usable);
  const out: Partial<Track> = {};

  // KEY
  const kv = new Map<string, number>();
  let kTotal = 0;
  for (const r of ok) if (r.key) { const w = KEY_W[r.source] ?? 1.5; kv.set(r.key, (kv.get(r.key) ?? 0) + w); kTotal += w; }
  if (kv.size) {
    const [k, w] = [...kv.entries()].sort((a, b) => b[1] - a[1])[0];
    out.key = k;
    const share = w / kTotal;
    out.keyConfidence = conf(share, w);
  } else out.keyConfidence = "none";

  // BPM (agrupamento ±2%)
  const bs = ok.filter((r) => r.bpm).map((r) => ({ b: normalizeBpm(r.bpm)!, w: KEY_W[r.source] ?? 1.5 }));
  if (bs.length) {
    let best = { sum: 0, wsum: 0, total: 0 };
    const total = bs.reduce((a, x) => a + x.w, 0);
    for (const c of bs) {
      const group = bs.filter((x) => Math.abs(x.b - c.b) / c.b <= 0.02);
      const wsum = group.reduce((a, x) => a + x.w, 0);
      if (wsum > best.wsum) best = { sum: group.reduce((a, x) => a + x.b * x.w, 0), wsum, total };
    }
    const avg = best.sum / best.wsum;
    out.bpm = Math.abs(avg - Math.round(avg)) < 0.15 ? Math.round(avg) : Math.round(avg * 10) / 10;
    out.bpmConfidence = conf(best.wsum / total, best.wsum);
  } else out.bpmConfidence = "none";

  // capa
  for (const s of COVER_ORDER) {
    const r = ok.find((x) => x.source === s && x.coverUrl);
    if (r) { out.coverUrl = r.coverUrl; break; }
  }
  const pick = <K extends keyof SourceReading>(k: K) => ok.find((r) => r[k])?.[k];
  out.durationSec = pick("durationSec") as number | undefined;
  out.isrc = pick("isrc") as string | undefined;
  out.previewUrl = (ok.find((r) => r.source === "deezer" && r.previewUrl) ?? ok.find((r) => r.previewUrl))?.previewUrl;
  const genres = new Set<string>();
  ok.forEach((r) => r.genres?.forEach((g) => genres.add(g.toLowerCase())));
  if (genres.size) out.genres = [...genres].slice(0, 8);
  const en = ok.find((r) => r.energy != null);
  if (en) out.energy = en.energy;
  return out;
}

function conf(share: number, weight: number): Confidence {
  if (share >= 0.7 && weight >= 3) return "high";
  if (share >= 0.5 && weight >= 1.8) return "medium";
  return "low";
}

const enc = encodeURIComponent;
/** Links de verificação manual em todos os sites/plataformas */
export function verifyLinks(t: { title: string; artist: string }) {
  const q = `${t.artist} ${t.title}`.trim();
  return {
    keybpm: [
      { label: "Tunebat", url: `https://tunebat.com/Search?q=${enc(q)}` },
      { label: "GetSongKey", url: `https://getsongkey.com/search?q=${enc(q)}` },
      { label: "Beatport", url: `https://www.beatport.com/search?q=${enc(q)}` },
      { label: "VocalRemover", url: "https://vocalremover.org/key-bpm-finder" },
      { label: "Ghost Production", url: "https://theghostproduction.com/bpm-and-key-finder/" },
      { label: "LANDR", url: "https://samples.landr.com/key-bpm-finder" },
      { label: "GetSongKey (arquivo)", url: "https://getsongkey.com/tools/key-finder" },
    ],
    streaming: [
      { label: "Spotify", url: `https://open.spotify.com/search/${enc(q)}` },
      { label: "Deezer", url: `https://www.deezer.com/search/${enc(q)}` },
      { label: "Tidal", url: `https://listen.tidal.com/search?q=${enc(q)}` },
      { label: "Apple Music", url: `https://music.apple.com/search?term=${enc(q)}` },
      { label: "Amazon Music", url: `https://music.amazon.com/search/${enc(q)}` },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${enc(q)}` },
      { label: "SoundCloud", url: `https://soundcloud.com/search?q=${enc(q)}` },
      { label: "Yandex Music", url: `https://music.yandex.com/search?text=${enc(q)}` },
      { label: "Google Imagens", url: `https://www.google.com/search?tbm=isch&q=${enc(q + " cover")}` },
    ],
  };
}
