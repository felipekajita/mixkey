import type { Track } from "../types";
import type { SequenceResult } from "../sequencer";
import { camelotToMusical } from "../camelot";
import { formatDuration } from "../bpm";

/** Formato de saída: "Título - Artista" */
export const trackLabel = (t: Pick<Track, "title" | "artist">) => `${t.title}${t.artist ? ` - ${t.artist}` : ""}`;

/** Nome de arquivo presumido quando a faixa veio de lista/link: "Título - Artista.mp3" */
const guessFile = (t: Track) => t.fileName || `${trackLabel(t)}.mp3`.replace(/[\\/:*?"<>|]/g, "_");

/** Caminho final: o caminho completo conhecido (Mixxx) ou pasta informada + nome do arquivo */
const trackPath = (t: Track, baseFolder: string) => t.filePath || joinPath(baseFolder, guessFile(t));

function joinPath(baseFolder: string, file: string) {
  const sep = baseFolder.includes("\\") ? "\\" : "/";
  return baseFolder ? baseFolder.replace(/[\\/]+$/, "") + sep + file : file;
}

export function toM3U8(seq: SequenceResult, tracks: Track[], baseFolder = ""): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${seq.name}`];
  tracks.forEach((t, i) => {
    lines.push(`#EXTINF:${Math.round(t.durationSec ?? -1)},${trackLabel(t)}`);
    lines.push(`# MixKey ${i + 1}: ${t.key ?? "?"} · ${t.bpm ?? "?"} BPM · energia ${t.energy ?? "?"}`);
    lines.push(trackPath(t, baseFolder));
  });
  return lines.join("\n") + "\n";
}

export function toText(seq: SequenceResult, tracks: Track[]): string {
  return [
    `${seq.name} — ${tracks.length} faixas · ${formatDuration(seq.totalSec)} · nota ${seq.score}/100`,
    "",
    ...tracks.map((t, i) => {
      const tr = i > 0 ? `   ↳ ${seq.transitions[i - 1]?.key.label} · BPM ${seq.transitions[i - 1]?.bpm.label}\n` : "";
      return `${tr}${String(i + 1).padStart(2, "0")}. ${trackLabel(t)}  [${t.key ?? "?"} ${camelotToMusical(t.key)} | ${t.bpm ?? "?"} BPM | E${t.energy ?? "?"}]`;
    }),
  ].join("\n");
}

export function toCSV(seq: SequenceResult, tracks: Track[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["#", "Título", "Artista", "Camelot", "Tom", "BPM", "Energia", "Duração", "Transição", "Ajuste BPM", "Dica"]];
  tracks.forEach((t, i) => {
    const tr = i > 0 ? seq.transitions[i - 1] : undefined;
    rows.push([String(i + 1), t.title, t.artist, t.key ?? "", camelotToMusical(t.key), String(t.bpm ?? ""), String(t.energy ?? ""), formatDuration(t.durationSec), tr?.key.label ?? "", tr?.bpm.label ?? "", tr?.tip ?? ""]);
  });
  return "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\n");
}

// ---------------- Rekordbox XML ----------------
const xmlEsc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Caminho local → URI do Rekordbox (file://localhost/D:/Pasta/arquivo.mp3) */
export function toRekordboxLocation(path: string): string {
  const p = path.replace(/\\/g, "/");
  const segs = p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s)));
  const joined = segs.join("/");
  return `file://localhost${joined.startsWith("/") ? "" : "/"}${joined}`;
}

const KIND: Record<string, string> = { mp3: "MP3 File", wav: "WAV File", aif: "AIFF File", aiff: "AIFF File", flac: "FLAC File", m4a: "M4A File", aac: "AAC File", ogg: "OGG File", alac: "ALAC File" };

/**
 * XML do Rekordbox: cria a playlist com as faixas na ordem do set, já com BPM,
 * tom e um comentário com a posição e a dica de transição.
 */
export function toRekordboxXml(seq: SequenceResult, tracks: Track[], baseFolder = ""): string {
  const items = tracks.map((t, i) => {
    const tr = seq.transitions[i]; // transição desta faixa para a próxima
    const file = guessFile(t);
    const ext = file.split(".").pop()!.toLowerCase();
    const comment = `MixKey ${i + 1}/${tracks.length} · ${t.key ?? "?"}${tr ? ` · próxima: ${tr.key.label}, BPM ${tr.bpm.label}` : " · última do set"}`;
    const attrs: Record<string, string | number | undefined> = {
      TrackID: i + 1,
      Name: t.title,
      Artist: t.artist,
      Genre: t.genres?.[0],
      Kind: KIND[ext] ?? "MP3 File",
      TotalTime: t.durationSec ? Math.round(t.durationSec) : undefined,
      AverageBpm: t.bpm ? t.bpm.toFixed(2) : undefined,
      Tonality: camelotToMusical(t.key) || undefined,
      Comments: comment,
      Rating: 0,
      Location: toRekordboxLocation(trackPath(t, baseFolder)),
    };
    const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}="${xmlEsc(v)}"`).join(" ");
    return `    <TRACK ${a} />`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="MixKey" Version="1.0" Company="MixKey"/>',
    `  <COLLECTION Entries="${tracks.length}">`,
    ...items,
    "  </COLLECTION>",
    "  <PLAYLISTS>",
    '    <NODE Type="0" Name="ROOT" Count="1">',
    `      <NODE Name="${xmlEsc(seq.name)}" Type="1" KeyType="0" Entries="${tracks.length}">`,
    ...tracks.map((_, i) => `        <TRACK Key="${i + 1}" />`),
    "      </NODE>",
    "    </NODE>",
    "  </PLAYLISTS>",
    "</DJ_PLAYLISTS>",
    "",
  ].join("\n");
}

export function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
