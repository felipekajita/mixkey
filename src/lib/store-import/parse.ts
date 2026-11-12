import type { StoreTrack, StorePageType } from "./extract";

export interface StorePayload { mixkey: "store"; v: number; store: string; page?: string; url?: string; pageType?: StorePageType; pageId?: string; tracks: StoreTrack[] }

export function isStorePayload(x: unknown): x is StorePayload {
  return !!x && typeof x === "object" && (x as any).mixkey === "store" && Array.isArray((x as any).tracks);
}

/** Lê o que veio do favorito: via URL (#mk-store=base64) ou texto colado (JSON) */
export function parseStorePayload(raw: string): StorePayload | null {
  const s = raw.trim();
  try {
    if (s.startsWith("{")) { const j = JSON.parse(s); return isStorePayload(j) ? j : null; }
    const json = decodeURIComponent(escape(atob(decodeURIComponent(s))));
    const j = JSON.parse(json);
    return isStorePayload(j) ? j : null;
  } catch {
    return null;
  }
}
