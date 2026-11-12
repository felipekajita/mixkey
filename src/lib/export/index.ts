import type { Track } from "../types";
import type { SequenceResult } from "../sequencer";
import { camelotToMusical } from "../camelot";
import { formatDuration } from "../bpm";

export function toM3U8(seq: SequenceResult, tracks: Track[], baseFolder = ""): string {
  const sep = baseFolder.includes("\\") ? "\\" : "/";
  const base = baseFolder ? baseFolder.replace(/[\\/]+$/, "") + sep : "";
  const lines = ["#EXTM3U", `#PLAYLIST:${seq.name}`];
  tracks.forEach((t, i) => {
    lines.push(`#EXTINF:${Math.round(t.durationSec ?? -1)},${t.artist ? `${t.artist} - ` : ""}${t.title}`);
    lines.push(`# MixKey ${i + 1}: ${t.key ?? "?"} · ${t.bpm ?? "?"} BPM · energia ${t.energy ?? "?"}`);
    lines.push(base + (t.fileName || `${t.artist ? `${t.artist} - ` : ""}${t.title}.mp3`));
  });
  return lines.join("\n") + "\n";
}

export function toText(seq: SequenceResult, tracks: Track[]): string {
  return [
    `${seq.name} — ${tracks.length} faixas · ${formatDuration(seq.totalSec)} · nota ${seq.score}/100`,
    "",
    ...tracks.map((t, i) => {
      const tr = i > 0 ? `   ↳ ${seq.transitions[i - 1]?.key.label} · BPM ${seq.transitions[i - 1]?.bpm.label}\n` : "";
      return `${tr}${String(i + 1).padStart(2, "0")}. ${t.artist ? `${t.artist} - ` : ""}${t.title}  [${t.key ?? "?"} ${camelotToMusical(t.key)} | ${t.bpm ?? "?"} BPM | E${t.energy ?? "?"}]`;
    }),
  ].join("\n");
}

export function toCSV(seq: SequenceResult, tracks: Track[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["#", "Artista", "Título", "Camelot", "Tom", "BPM", "Energia", "Duração", "Transição", "Ajuste BPM", "Dica"]];
  tracks.forEach((t, i) => {
    const tr = i > 0 ? seq.transitions[i - 1] : undefined;
    rows.push([String(i + 1), t.artist, t.title, t.key ?? "", camelotToMusical(t.key), String(t.bpm ?? ""), String(t.energy ?? ""), formatDuration(t.durationSec), tr?.key.label ?? "", tr?.bpm.label ?? "", tr?.tip ?? ""]);
  });
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\n");
}

export function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
