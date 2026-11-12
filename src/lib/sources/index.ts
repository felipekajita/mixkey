import type { LookupQuery, SourceReading } from "../types";
import { deezer } from "./deezer";
import { itunes } from "./itunes";
import { musicbrainz } from "./musicbrainz";
import { spotify } from "./spotify";
import { lastfm } from "./lastfm";
import { reccobeats } from "./reccobeats";
import { youtubeMusic } from "./youtube-music";

export interface SourceDef {
  id: string;
  label: string;
  kind: "api" | "scrape";
  provides: ("key" | "bpm" | "cover" | "meta")[];
  enabled: () => boolean;
  lookup: (q: LookupQuery) => Promise<Omit<SourceReading, "source" | "label"> | null>;
  coverOnly?: boolean;
}

export { pickBest } from "./pick";

export const SOURCES: SourceDef[] = [deezer, spotify, reccobeats, itunes, musicbrainz, lastfm, youtubeMusic];

export async function lookupAll(q: LookupQuery, opts: { lite?: boolean; only?: string[] } = {}): Promise<SourceReading[]> {
  const list = SOURCES.filter((s) => s.enabled())
    .filter((s) => !opts.only || opts.only.includes(s.id))
    .filter((s) => !opts.lite || s.provides.includes("key") || s.provides.includes("bpm") || s.id === "deezer");
  const res = await Promise.allSettled(list.map((s) => s.lookup(q)));
  return res.map((r, i): SourceReading => {
    const s = list[i];
    if (r.status === "fulfilled") return r.value ? { source: s.id, label: s.label, ...r.value } : { source: s.id, label: s.label, error: "Não encontrado" };
    return { source: s.id, label: s.label, error: (r.reason as Error)?.message || "Erro" };
  });
}
