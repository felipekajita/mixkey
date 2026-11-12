const VERSION_RE = /\s*[\(\[]([^\)\]]*(mix|edit|remix|version|dub|rework|bootleg|vip|remaster(ed)?|extended|original|radio|club|instrumental|acoustic|live|flip|refix)[^\)\]]*)[\)\]]/gi;

export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeName(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(/\b(feat\.?|ft\.?|featuring|vs\.?|x|&|and|e)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai a versão "(Extended Mix)" do título */
export function splitVersion(title: string): { base: string; version?: string } {
  let version: string | undefined;
  const base = title.replace(VERSION_RE, (_m, v) => {
    version = version ? `${version}, ${v}` : v;
    return "";
  }).replace(/\s+-\s+(extended|original|radio|club)\s+(mix|edit)$/i, (m) => {
    version = m.replace(/^\s+-\s+/, "");
    return "";
  }).trim();
  return { base, version };
}

/** Remove "feat. X" do título e retorna os artistas extras */
export function cleanTitle(title: string): string {
  return splitVersion(title).base.replace(/\s*[\(\[]?\s*(feat\.?|ft\.?|featuring)\s+[^\)\]]*[\)\]]?/gi, "").trim();
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

function tokenSet(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / Math.min(A.size, B.size) * 0.7 + inter / Math.max(A.size, B.size) * 0.3;
}

export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  return Math.max(jaroWinkler(na, nb) * 0.9, tokenSet(na, nb));
}

/** Score de correspondência de uma faixa encontrada vs. a buscada (0..1) */
export function matchScore(
  want: { title: string; artist: string; version?: string },
  got: { title: string; artist: string },
): number {
  const wt = splitVersion(want.title);
  const gt = splitVersion(got.title);
  const t = similarity(cleanTitle(wt.base), cleanTitle(gt.base));
  const a = want.artist ? Math.max(similarity(want.artist, got.artist), artistOverlap(want.artist, got.artist)) : 0.8;
  let score = t * 0.6 + a * 0.4;
  const wv = (want.version || wt.version || "").toLowerCase();
  const gv = (gt.version || "").toLowerCase();
  if (/remix|rework|bootleg|dub|vip|flip/.test(gv) && !/remix|rework|bootleg|dub|vip|flip/.test(wv)) score -= 0.15;
  else if (/remix|rework|bootleg|dub|vip|flip/.test(wv) && !similarityOk(wv, gv)) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

function similarityOk(a: string, b: string) {
  return similarity(a, b) > 0.7;
}

function artistOverlap(a: string, b: string): number {
  const split = (s: string) => normalizeName(s.replace(/,|;|\//g, " & ")).split(" ").filter((x) => x.length > 1);
  const A = new Set(split(a));
  const B = split(b);
  if (!A.size || !B.length) return 0;
  return B.some((t) => A.has(t)) ? 0.85 : 0;
}

export const MATCH_THRESHOLD = 0.78;
