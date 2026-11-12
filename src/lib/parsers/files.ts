import Papa from "papaparse";
import { parseText, parseTextTable, rowsToTracks, detectTable, mapRows, type ParsedTrack, type TableInfo } from "./text";

export interface ParsedInput { tracks: ParsedTrack[]; table?: TableInfo; groups?: import("./mixxx").MixxxGroup[]; source?: string }

/** Lê arquivos de lista: .txt, .csv, .tsv, .m3u/.m3u8, .xlsx/.xls/.ods, .xml (Rekordbox), .json */
export async function parseListFile(file: File): Promise<ParsedInput> {
  const name = file.name.toLowerCase();
  if (/\.(sqlite|sqlite3|db)$/.test(name)) {
    const { readMixxxDb } = await import("./mixxx");
    const lib = await readMixxxDb(await file.arrayBuffer());
    return { tracks: lib.tracks, groups: lib.groups, source: "Mixxx" };
  }
  const fromTable = (t: TableInfo | null): ParsedInput => (t ? { tracks: mapRows(t), table: t } : { tracks: [] });
  if (/\.(xlsx|xlsm|xls|ods|numbers)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const tables = wb.SheetNames
      .map((sn) => detectTable(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: "" })))
      .filter((t): t is TableInfo => !!t);
    if (tables.length === 1) return fromTable(tables[0]);
    return { tracks: tables.flatMap(mapRows) };
  }
  const text = await file.text();
  if (name.endsWith(".csv")) {
    const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
    return fromTable(detectTable(res.data));
  }
  if (name.endsWith(".xml") && /DJ_PLAYLISTS/.test(text)) return { tracks: parseRekordboxXml(text) };
  if (name.endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : data.tracks;
      if (Array.isArray(arr)) {
        const keys = Object.keys(arr[0] ?? {});
        return { tracks: rowsToTracks([keys, ...arr.map((o: Record<string, unknown>) => keys.map((k) => o[k]))]) };
      }
    } catch { /* cai para texto */ }
  }
  const table = parseTextTable(text);
  return table ? fromTable(table) : { tracks: parseText(text) };
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
