/**
 * Correção de BPM em meio/dobro tempo.
 * Detectores (inclusive o da prévia de 30 s) às vezes leem metade ou o dobro do
 * tempo real (ex.: 85 em vez de 171). Aqui:
 *  1. leituras de fontes diferentes que diferem por ×2/÷2 contam como a MESMA leitura;
 *  2. a "oitava" final é escolhida pelos votos das fontes e pelo gênero da faixa.
 */
export interface BpmVote { b: number; w: number }

/** Faixas típicas de BPM por gênero (a ordem importa: mais específico primeiro) */
const GENRE_RANGES: [RegExp, number, number][] = [
  [/drum\s*(and|&|n)\s*bass|\bdnb\b|jungle|neurofunk|liquid funk/, 160, 180],
  [/dubstep|riddim|brostep/, 135, 155],
  [/hardstyle|hardcore|gabber/, 145, 180],
  [/psytrance|psy-trance|goa/, 135, 150],
  [/\btrance\b|uplifting/, 128, 145],
  [/techno|hard techno|industrial/, 122, 150],
  [/trap(?! soul)|future bass/, 130, 160],
  [/footwork|juke/, 155, 165],
  [/house|tech house|deep house|progressive|melodic|afro house|edm|electro|disco|dance|club|garage|bass house|big room|future house/, 110, 132],
  [/reggaeton|dembow|moombahton/, 88, 110],
  [/funk carioca|baile funk|brazilian funk/, 125, 135],
  [/hip[\s-]?hop|\brap\b|boom bap|r&b|rnb/, 75, 115],
  [/downtempo|chill|lo-?fi|trip hop|ambient/, 70, 110],
];

export function genreRange(genres: string[] = []): [number, number] | null {
  const g = genres.join(" | ").toLowerCase();
  for (const [re, lo, hi] of GENRE_RANGES) if (re.test(g)) return [lo, hi];
  return null;
}

const OCT = [1, 2, 0.5];
const near = (a: number, b: number, tol = 0.025) => Math.abs(a - b) / b <= tol;
const round = (x: number) => (Math.abs(x - Math.round(x)) < 0.15 ? Math.round(x) : Math.round(x * 10) / 10);

export interface BpmResult { bpm: number; groupWeight: number; totalWeight: number; note?: string }

export function resolveBpm(votes: BpmVote[], genres: string[] = []): BpmResult | null {
  const vs = votes.filter((v) => v.b > 30 && v.b < 300);
  if (!vs.length) return null;
  const total = vs.reduce((a, v) => a + v.w, 0);

  // 1) agrupa por "mesmo tempo" considerando ×1, ×2 e ÷2
  let best: { center: number; members: { v: BpmVote; m: number }[]; w: number } | null = null;
  for (const c of vs) {
    const members = vs.map((v) => ({ v, m: OCT.find((m) => near(v.b * m, c.b)) })).filter((x): x is { v: BpmVote; m: number } => x.m != null);
    const w = members.reduce((a, x) => a + x.v.w, 0);
    if (!best || w > best.w) best = { center: c.b, members, w };
  }
  const g = best!;
  const avg = g.members.reduce((a, x) => a + x.v.b * x.m * x.v.w, 0) / g.w; // tudo na oitava do centro

  // 2) escolhe a oitava: votos das fontes + gênero
  const range = genreRange(genres);
  const cands = OCT.map((m) => avg * m).filter((b) => b >= 60 && b <= 200);
  let pick = avg, pickScore = -Infinity;
  for (const b of cands) {
    const votesHere = g.members.filter((x) => near(x.v.b, b, 0.03)).reduce((a, x) => a + x.v.w, 0);
    let score = votesHere;
    if (range) {
      if (b >= range[0] && b <= range[1]) score += 3;
      else score -= Math.min(Math.abs(b - range[0]), Math.abs(b - range[1])) / 20;
    } else if (b < 70 || b > 185) score -= 1; // sem gênero: evita extremos
    if (score > pickScore) { pick = b; pickScore = score; }
  }
  const final = round(pick);
  const sourceVals = new Set(g.members.map((x) => Math.round(x.v.b)));
  const corrected = ![...sourceVals].some((v) => near(v, final, 0.03));
  const mixed = new Set(g.members.map((x) => x.m)).size > 1;
  const note = corrected
    ? `BPM ajustado para ${final} (lido como ${[...sourceVals].join("/")}${range ? `; faixa típica do gênero ${range[0]}–${range[1]}` : ""})`
    : mixed ? "Fontes divergiram em meio/dobro tempo; escolhido o valor mais votado" : undefined;
  return { bpm: final, groupWeight: g.w, totalWeight: total, note };
}
