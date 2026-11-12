import type { Confidence, SourceReading, Track } from "./types";
import { resolveBpm } from "./bpmOctave";
import { MATCH_THRESHOLD } from "./match";

const KEY_W: Record<string, number> = {
  list: 4, tags: 3, mixxx: 3, essentia: 3, okscan: 3, "essentia-listen-tab": 3, "essentia-listen-mic": 2, "okscan-listen-tab": 3, "okscan-listen-mic": 2, reccobeats: 2.5, songbpm: 1.5, "essentia-preview": 1.8, deezer: 1,
};
const COVER_ORDER = ["tags", "store-beatport", "link", "deezer", "spotify", "itunes", "ytmusic", "lastfm", "musicbrainz"];

// lojas (Beatport…): referência da indústria para DJs → peso alto
const weight = (source: string) => KEY_W[source] ?? (source.startsWith("store-") ? 3.5 : source.startsWith("essentia-preview") || source.startsWith("okscan-preview") ? 1.8 : 1.5);

export const usable = (r: SourceReading) => !r.error && (r.matchScore == null || r.matchScore >= MATCH_THRESHOLD);

export function computeConsensus(readings: SourceReading[], extraGenres: string[] = []): Partial<Track> {
  const ok = readings.filter(usable);
  const out: Partial<Track> = {};
  // as prévias usam o mesmo detector: juntas valem no máximo 3 (uma opinião forte, não três)
  // vale para cada família de detector (Essentia e IA) separadamente
  const capScale = (prefix: string) => { const n = ok.filter((r) => r.source.startsWith(prefix)).length; return n ? Math.min(1, 3 / (1.8 * n)) : 1; };
  const prevScale = capScale("essentia-preview"), mlPrevScale = capScale("okscan-preview");
  const extra = new Map(ok.map((r) => [r.source, r.weight ?? 1]));
  const w = (src: string) => weight(src) * (src.startsWith("essentia-preview") ? prevScale : src.startsWith("okscan-preview") ? mlPrevScale : 1) * (extra.get(src) ?? 1);

  // KEY
  const kv = new Map<string, number>();
  let kTotal = 0;
  for (const r of ok) if (r.key) { const wk = w(r.source); kv.set(r.key, (kv.get(r.key) ?? 0) + wk); kTotal += wk; }
  if (kv.size) {
    const [k, w] = [...kv.entries()].sort((a, b) => b[1] - a[1])[0];
    out.key = k;
    const share = w / kTotal;
    out.keyConfidence = conf(share, w);
  } else out.keyConfidence = "none";

  // gêneros (das fontes + da faixa) — usados também para corrigir meio/dobro tempo
  const genres = new Set<string>();
  ok.forEach((r) => r.genres?.forEach((g) => genres.add(g.toLowerCase())));
  extraGenres.forEach((g) => genres.add(g.toLowerCase()));

  // BPM: agrupa leituras iguais ou em meio/dobro tempo e escolhe a oitava certa
  const isAnalysis = (s: string) => s.startsWith("essentia");
  const nAnalyses = ok.filter((r) => r.bpm && isAnalysis(r.source)).length;
  const bs = ok.filter((r) => r.bpm).map((r) => ({
    b: r.bpm!, w: w(r.source),
    // as análises dividem um único "voto" de oitava (mesmo detector), com peso reduzido
    octaveW: isAnalysis(r.source) ? (weight(r.source) * 0.6) / nAnalyses : weight(r.source),
  }));
  const br = resolveBpm(bs, [...genres]);
  if (br) {
    out.bpm = br.bpm;
    out.bpmNote = br.note;
    out.bpmConfidence = conf(br.groupWeight / br.totalWeight, br.groupWeight);
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
      { label: "VocalRemover", url: "https://vocalremover.org/key-bpm-finder" },
      { label: "Ghost Production", url: "https://theghostproduction.com/bpm-and-key-finder/" },
      { label: "LANDR", url: "https://samples.landr.com/key-bpm-finder" },
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
    ],
  };
}
