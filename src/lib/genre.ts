/**
 * Gêneros: normaliza tags (Last.fm, Apple Music, Deezer, Beatport, Mixxx…) em famílias e
 * subgêneros, monta o "perfil de gênero" da biblioteca e dá uma nota (0–1) de quanto uma
 * faixa sugerida combina com ele.
 */
export interface GenreTag { family: string; sub: string; electronic: boolean }

// [família, subgênero, regex] — mais específico primeiro
const RULES: [string, string, RegExp][] = [
  // nomes genéricos de plataformas (Deezer/Apple) = eletrônica em geral
  ["electronic", "electronic / dance", /^(electro|electronic|electronica|dance|edm|club)$/],
  ["house", "melodic house & techno", /melodic (house|techno)|afterlife|organic house/],
  ["house", "deep house", /deep[ -]?house|lo-?fi house/],
  ["house", "tech house", /tech[ -]?house|minimal (house|tech)/],
  ["house", "progressive house", /progressive( house)?$|progressive house/],
  ["house", "afro house", /afro[ -]?(house|tech)|amapiano/],
  ["house", "bass house", /bass house|g-?house|future house/],
  ["house", "nu disco / disco", /nu[ -]?disco|disco|indie dance|funky house|french house/],
  ["house", "house", /house/],
  ["techno", "melodic techno", /melodic techno/],
  ["techno", "hard techno", /hard techno|industrial techno|schranz/],
  ["techno", "techno", /techno|minimal|electro(?!nic|-pop|pop)/],
  ["trance", "psytrance", /psy|goa/],
  ["trance", "trance", /trance/],
  ["dnb", "drum & bass", /drum ?(and|&|n) ?bass|\bdnb\b|jungle|liquid/],
  ["bass", "dubstep / bass", /dubstep|riddim|bass music|ukg|uk garage|garage|breakbeat|breaks/],
  ["hard", "hardstyle / hardcore", /hardstyle|hardcore|hard dance|gabber|rawstyle/],
  ["edm", "big room / edm", /big room|edm|electro house|festival|mainstage/],
  ["edm", "future bass / melodic dubstep", /future bass|melodic dubstep/],
  ["downtempo", "downtempo / chill", /downtempo|chill|ambient|lo-?fi|trip[ -]?hop|lounge|chillout/],
  ["electronic", "electronic / dance", /electronic|electronica|dance|electro|club|idm|synth/],
  ["latin", "reggaeton / latin", /reggaeton|latin|dembow|bachata|salsa|cumbia|moombah/],
  ["funkbr", "funk brasileiro", /funk carioca|baile funk|brazilian funk|funk br|funk mandelão|\bfunk\b.*brasil/],
  ["hiphop", "hip hop / rap", /hip[ -]?hop|\brap\b|trap|drill|grime/],
  ["rnb", "r&b / soul", /r&b|rnb|soul|neo soul/],
  ["pop", "pop", /\bpop\b|k-pop|dance pop|synthpop|electropop/],
  ["rock", "rock / indie", /rock|indie|alternative|punk|metal|grunge/],
  ["brasil", "mpb / sertanejo / pagode", /mpb|sertanejo|pagode|samba|forr|axé|brasil|brazil/],
  ["jazz", "jazz / funk", /jazz|funk|blues|bossa/],
];
const ELECTRONIC = new Set(["house", "techno", "trance", "dnb", "bass", "hard", "edm", "electronic", "downtempo"]);

export function classifyGenre(tag: string): GenreTag | null {
  const t = tag.toLowerCase().trim();
  if (!t || /seen live|favorite|favourite|^\d+s$|female|male|vocalist|british|american|german|french|dutch|swedish|brazilian$/.test(t)) return null;
  for (const [family, sub, re] of RULES) if (re.test(t)) return { family, sub, electronic: ELECTRONIC.has(family) };
  return null;
}

export function classifyAll(tags: string[] = []): GenreTag[] {
  const out: GenreTag[] = [];
  for (const g of tags) { const c = classifyGenre(g); if (c && !out.some((o) => o.sub === c.sub)) out.push(c); }
  return out;
}

export interface GenreProfile { families: Map<string, number>; subs: Map<string, number>; total: number; top: string[] }

/** Perfil da biblioteca: quanto de cada família/subgênero aparece */
export function genreProfile(tracks: { genres?: string[] }[]): GenreProfile {
  const families = new Map<string, number>(), subs = new Map<string, number>();
  let total = 0;
  for (const t of tracks) {
    const cs = classifyAll(t.genres);
    if (!cs.length) continue;
    total++;
    // cada faixa conta 1, dividido entre seus gêneros
    const famSet = [...new Set(cs.map((c) => c.family))];
    famSet.forEach((f) => families.set(f, (families.get(f) ?? 0) + 1 / famSet.length));
    cs.forEach((c) => subs.set(c.sub, (subs.get(c.sub) ?? 0) + 1 / cs.length));
  }
  const top = [...subs.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return { families, subs, total, top };
}

/** Semelhança entre dois gêneros: mesmo subgênero 1; mesma família 0,75; ambos eletrônicos 0,35 */
function pairSim(a: GenreTag, b: GenreTag): number {
  if (a.sub === b.sub) return 1;
  if (a.family === b.family) return 0.75;
  if ((a.family === "electronic" && b.electronic) || (b.family === "electronic" && a.electronic)) return 0.55;
  if (a.electronic && b.electronic) return 0.35;
  return 0;
}

/**
 * Nota de gênero (0–1) de uma faixa em relação ao perfil da biblioteca.
 * `null` quando não dá para saber (sem perfil ou sem gênero na sugestão).
 */
export function genreScore(profile: GenreProfile, tags: string[] = []): number | null {
  if (!profile.total) return null;
  const cs = classifyAll(tags);
  if (!cs.length) return null;
  let score = 0;
  const famTotal = [...profile.families.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [sub, w] of profile.subs) {
    const family = RULES.find((r) => r[1] === sub)?.[0] ?? "electronic";
    const lib: GenreTag = { family, sub, electronic: ELECTRONIC.has(family) };
    const best = Math.max(...cs.map((c) => pairSim(lib, c)));
    score += best * (w / famTotal);
  }
  // normaliza para a faixa do gênero mais forte da biblioteca valer ~1
  const maxW = Math.max(...profile.subs.values()) / famTotal;
  const strongest = cs.some((c) => c.sub === profile.top[0]) ? 1 : 0;
  return Math.max(0, Math.min(1, Math.max(score / Math.max(maxW, 0.0001) * 0.6, strongest, ...cs.map((c) => (profile.families.get(c.family) ?? 0) / famTotal >= 0.3 ? 0.8 : 0))));
}

export const genreLabel = (tags: string[] = []) => classifyAll(tags).map((c) => c.sub);
