import { parseKey } from "../camelot";
import { normalizeBpm, parseDuration } from "../bpm";
import { splitVersion } from "../match";

export interface ParsedTrack {
  title: string;
  artist: string;
  version?: string;
  durationSec?: number;
  key?: string;
  bpm?: number;
  energy?: number;
  fileName?: string;
  genre?: string;
}

type Field = "title" | "artist" | "key" | "bpm" | "duration" | "energy" | "file" | "genre" | "trackartist" | "ignore";

const HEADER_PATTERNS: [Field, RegExp][] = [
  ["trackartist", /^(artist\s*-\s*title|artista\s*-\s*t[ií]tulo|track\s*name|faixa\s*completa)$/i],
  ["artist", /(artist|artista|int[eé]rprete|autor|produtor|dj)/i],
  ["title", /(title|t[ií]tulo|track|faixa|m[uú]sica|nome|name|song|can[cç][aã]o)/i],
  ["key", /^(key|tom|tonalidade|camelot|initial\s*key|chave|escala)$/i],
  ["bpm", /^(bpm|tempo|batidas)$/i],
  ["duration", /(dura[cç][aã]o|duration|time|length|tempo\s*total|tamanho)/i],
  ["energy", /(energy|energia)/i],
  ["file", /(file|arquivo|location|path|caminho)/i],
  ["genre", /(genre|g[eê]nero|estilo)/i],
];

function headerField(cell: string): Field | null {
  const c = cell.trim();
  if (!c) return null;
  for (const [f, re] of HEADER_PATTERNS) if (re.test(c)) return f;
  return null;
}

const isBpm = (s: string) => /^\d{2,3}([.,]\d{1,2})?(\s*bpm)?$/i.test(s.trim()) && +s.replace(/[^\d.,]/g, "").replace(",", ".") >= 55 && +s.replace(/[^\d.,]/g, "").replace(",", ".") <= 220;
const isDuration = (s: string) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.trim());
const isKey = (s: string) => s.trim().length <= 12 && !!parseKey(s.trim());
const toBpm = (s: string) => normalizeBpm(parseFloat(String(s).replace(/[^\d.,]/g, "").replace(",", ".")));

/** "Artista - Título", "Título by Artista", "Artista – Título" */
export function splitArtistTitle(s: string): { artist: string; title: string } {
  const str = s.trim().replace(/\.(mp3|wav|flac|aiff?|m4a|aac|ogg|opus|wma|alac)$/i, "").replace(/_/g, " ");
  const dash = str.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { artist: dash[0].trim(), title: dash.slice(1).join(" - ").trim() };
  const by = /^(.*)\s+by\s+(.*)$/i.exec(str);
  if (by) return { title: by[1].trim(), artist: by[2].trim() };
  const tight = str.split(/\s*-\s*/);
  if (tight.length === 2 && tight[0] && tight[1]) return { artist: tight[0].trim(), title: tight[1].trim() };
  return { artist: "", title: str };
}

function finalize(p: Partial<ParsedTrack> & { title: string; artist: string }): ParsedTrack | null {
  const title = p.title.replace(/^["']|["']$/g, "").trim();
  if (!title) return null;
  const { base, version } = splitVersion(title);
  return {
    ...p,
    title,
    artist: p.artist.replace(/^["']|["']$/g, "").trim(),
    version: p.version ?? version ?? (base !== title ? undefined : undefined),
  };
}

/** Linha livre: "1. Artista - Título (Extended Mix) 8A 124 BPM 6:30" */
export function parseFreeLine(line: string): ParsedTrack | null {
  let s = line.trim();
  if (!s || /^#/.test(s) && !/^#\s*\d/.test(s)) return null;
  s = s.replace(/^\s*(#?\d{1,3}[.)\-:]?\s+|[•\-*]\s+)/, ""); // numeração / marcadores
  const out: Partial<ParsedTrack> = {};

  // tokens no fim entre colchetes/parênteses tipo "[8A | 124]"
  s = s.replace(/[\[(]\s*((?:\d{1,2}[AB]|\d{2,3}(?:[.,]\d+)?(?:\s*bpm)?|\d{1,2}:\d{2})[\s|,/;]*)+[\])]/gi, (m) => {
    m.replace(/[\[\]()]/g, "").split(/[\s|,/;]+/).forEach((t) => consume(t));
    return " ";
  });

  function consume(t: string): boolean {
    if (!t) return false;
    if (!out.key && /^0?\d{1,2}[AB]$/i.test(t)) { out.key = parseKey(t); return true; }
    if (!out.durationSec && isDuration(t)) { out.durationSec = parseDuration(t); return true; }
    if (!out.bpm && isBpm(t)) { out.bpm = toBpm(t); return true; }
    return false;
  }

  // "124 BPM", "124bpm"
  s = s.replace(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*bpm\b/i, (_m, n) => { out.bpm = toBpm(n); return " "; });
  // Camelot isolado
  s = s.replace(/(^|[\s|,;])0?(\d{1,2}[AB])(?=$|[\s|,;])/g, (m, pre, k) => {
    if (out.key) return m;
    const pk = parseKey(k);
    if (!pk) return m;
    out.key = pk;
    return pre;
  });
  // "Key: Am" / "Tom: Lá menor"
  s = s.replace(/\b(key|tom)\s*[:=]\s*([A-Ga-g][#b♯♭]?\s*(?:m(?:in(?:or)?)?|maj(?:or)?|minor|major)?)/i, (m, _k, v) => {
    const pk = parseKey(v);
    if (pk && !out.key) { out.key = pk; return " "; }
    return m;
  });
  // duração
  s = s.replace(/(^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=$|\s)/, (_m, pre, d) => { out.durationSec = parseDuration(d); return pre; });

  s = s.replace(/\s*[|;]\s*/g, " ").trim();
  // tokens soltos restantes no final: tom musical ou BPM simples ("... Am 124")
  let parts = s.trim().split(/\s+/);
  for (let i = 0; i < 3 && parts.length > 2; i++) {
    const last = parts[parts.length - 1].replace(/[|,;]$/, "");
    if (!out.bpm && /^\d{2,3}([.,]\d{1,2})?$/.test(last) && isBpm(last)) { out.bpm = toBpm(last); parts.pop(); continue; }
    if (!out.key && /^[A-G][#b♯♭]?(m|min|maj)?$/.test(last) && parseKey(last)) { out.key = parseKey(last); parts.pop(); continue; }
    break;
  }
  s = parts.join(" ").replace(/[\s|,;]+$/, "").replace(/^[\s|,;]+/, "");
  const at = splitArtistTitle(s);
  return finalize({ ...out, ...at });
}

function detectDelimiter(lines: string[]): string | null {
  const sample = lines.slice(0, 20);
  for (const d of ["\t", ";", "|", ","]) {
    const counts = sample.map((l) => l.split(d).length - 1);
    const withD = counts.filter((c) => c > 0).length;
    if (withD >= Math.max(1, sample.length * 0.7)) {
      // vírgula só conta se for consistente (evita "Artista, Outro - Título")
      if (d === ",") {
        const c0 = counts[0];
        if (!counts.every((c) => c === c0) || c0 < 2) continue;
      }
      return d;
    }
  }
  return null;
}

/** Converte linhas de tabela (planilha/CSV/texto tabulado) em faixas */
export function rowsToTracks(rows: unknown[][]): ParsedTrack[] {
  const clean = rows
    .map((r) => r.map((c) => (c == null ? "" : typeof c === "number" ? c : String(c).trim())))
    .filter((r) => r.some((c) => c !== ""));
  if (!clean.length) return [];

  let fields: (Field | null)[] | null = null;
  const header = clean[0].map((c) => headerField(String(c)));
  const hasHeader = header.filter(Boolean).length >= 1 && clean[0].every((c) => typeof c !== "number");
  if (hasHeader) fields = header;
  const body = hasHeader ? clean.slice(1) : clean;

  if (!fields) {
    // inferir por conteúdo
    const ncol = Math.max(...body.map((r) => r.length));
    fields = [];
    const textCols: number[] = [];
    for (let c = 0; c < ncol; c++) {
      const vals = body.map((r) => r[c]).filter((v) => v !== "" && v != null).map(String);
      if (!vals.length) { fields.push("ignore"); continue; }
      const frac = (fn: (s: string) => boolean) => vals.filter(fn).length / vals.length;
      if (frac((v) => /^\d{1,4}$/.test(v)) > 0.9 && vals.every((v, i) => i === 0 || +v >= +vals[i - 1])) fields.push("ignore"); // numeração
      else if (frac(isKey) > 0.8 && frac((v) => v.length <= 10) > 0.9) fields.push("key");
      else if (frac(isDuration) > 0.8) fields.push("duration");
      else if (frac(isBpm) > 0.8) fields.push("bpm");
      else { fields.push(null); textCols.push(c); }
    }
    if (textCols.length === 1) fields[textCols[0]] = "trackartist";
    else if (textCols.length >= 2) { fields[textCols[0]] = "artist"; fields[textCols[1]] = "title"; }
  }

  const out: ParsedTrack[] = [];
  for (const r of body) {
    let title = "", artist = "", key: string | undefined, bpm: number | undefined, dur: number | undefined, energy: number | undefined, fileName: string | undefined, genre: string | undefined;
    r.forEach((v, i) => {
      const f = fields![i];
      const s = String(v ?? "").trim();
      if (!s) return;
      switch (f) {
        case "title": title = title || s; break;
        case "artist": artist = artist || s; break;
        case "trackartist": { const at = splitArtistTitle(s); title = at.title; artist = artist || at.artist; break; }
        case "key": key = parseKey(s); break;
        case "bpm": bpm = toBpm(s); break;
        case "duration": dur = parseDuration(v); break;
        case "energy": { const e = parseFloat(s); if (e >= 1 && e <= 10) energy = e; break; }
        case "file": fileName = s.split(/[\\/]/).pop(); break;
        case "genre": genre = s; break;
      }
    });
    if (!title && fileName) { const at = splitArtistTitle(fileName); title = at.title; artist = artist || at.artist; }
    if (title && !artist && / - /.test(title)) { const at = splitArtistTitle(title); title = at.title; artist = at.artist; }
    const t = finalize({ title, artist, key, bpm, durationSec: dur, energy, fileName, genre });
    if (t) out.push(t);
  }
  return out;
}

/** Texto colado: detecta se é tabela (tab/;/|) ou lista livre */
export function parseText(text: string): ParsedTrack[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return [];
  // M3U / M3U8
  if (/^#EXTM3U/.test(lines[0])) return parseM3U(lines);
  const d = detectDelimiter(lines);
  if (d) return rowsToTracks(lines.map((l) => l.split(d)));
  return lines.map(parseFreeLine).filter((t): t is ParsedTrack => !!t);
}

function parseM3U(lines: string[]): ParsedTrack[] {
  const out: ParsedTrack[] = [];
  let pending: { dur?: number; name?: string } = {};
  for (const l of lines) {
    const m = /^#EXTINF:(-?\d+)[^,]*,(.*)$/.exec(l);
    if (m) { pending = { dur: +m[1] > 0 ? +m[1] : undefined, name: m[2] }; continue; }
    if (l.startsWith("#")) continue;
    const fileName = l.split(/[\\/]/).pop()!;
    const at = splitArtistTitle(pending.name || fileName);
    const t = finalize({ ...at, durationSec: pending.dur, fileName });
    if (t) out.push(t);
    pending = {};
  }
  return out;
}
