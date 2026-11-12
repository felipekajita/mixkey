import Papa from "papaparse";
import { parseText, rowsToTracks, type ParsedTrack } from "./text";

/** Lê arquivos de lista: .txt, .csv, .tsv, .m3u/.m3u8, .xlsx/.xls/.ods, .xml (Rekordbox), .json */
export async function parseListFile(file: File): Promise<ParsedTrack[]> {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const all: ParsedTrack[] = [];
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
      all.push(...rowsToTracks(rows));
    }
    return all;
  }
  const text = await file.text();
  if (name.endsWith(".csv")) {
    const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
    return rowsToTracks(res.data);
  }
  if (name.endsWith(".xml") && /DJ_PLAYLISTS/.test(text)) return parseRekordboxXml(text);
  if (name.endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : data.tracks;
      if (Array.isArray(arr)) {
        const keys = Object.keys(arr[0] ?? {});
        return rowsToTracks([keys, ...arr.map((o: Record<string, unknown>) => keys.map((k) => o[k]))]);
      }
    } catch { /* cai para texto */ }
  }
  return parseText(text);
}

function parseRekordboxXml(xml: string): ParsedTrack[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows: unknown[][] = [["Title", "Artist", "Key", "BPM", "Duration", "File"]];
  doc.querySelectorAll("COLLECTION > TRACK").forEach((t) => {
    rows.push([
      t.getAttribute("Name"), t.getAttribute("Artist"), t.getAttribute("Tonality"),
      t.getAttribute("AverageBpm"), t.getAttribute("TotalTime"),
      decodeURIComponent(t.getAttribute("Location") || ""),
    ]);
  });
  return rowsToTracks(rows);
}
