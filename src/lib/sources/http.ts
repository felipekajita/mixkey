export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class BlockedError extends Error {}

export async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 7000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8", ...(init.headers || {}) },
      cache: "no-store",
    });
    const text = await res.text();
    if (/<title>Just a moment\.\.\.<\/title>|cf-chl|challenge-platform/i.test(text.slice(0, 4000)))
      throw new BlockedError("Bloqueado pela Cloudflare");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Tempo esgotado");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const t = await fetchText(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } });
  return JSON.parse(t) as T;
}

/** Percorre um JSON e devolve objetos que satisfazem o predicado */
export function deepFind(obj: unknown, pred: (o: Record<string, any>) => boolean, out: Record<string, any>[] = [], depth = 0): Record<string, any>[] {
  if (!obj || typeof obj !== "object" || depth > 25 || out.length > 200) return out;
  if (Array.isArray(obj)) {
    for (const x of obj) deepFind(x, pred, out, depth + 1);
    return out;
  }
  const o = obj as Record<string, any>;
  try { if (pred(o)) out.push(o); } catch { /* ignore */ }
  for (const k of Object.keys(o)) deepFind(o[k], pred, out, depth + 1);
  return out;
}
