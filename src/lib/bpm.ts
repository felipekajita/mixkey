/** Normaliza BPM para a faixa 70–180 (corrige leituras em meio/dobro tempo) */
export function normalizeBpm(bpm?: number | null): number | undefined {
  if (!bpm || !isFinite(bpm) || bpm <= 0) return undefined;
  let b = bpm;
  while (b < 70) b *= 2;
  while (b > 180) b /= 2;
  // BPM com decimal é raríssimo em música produzida: arredonda para o inteiro mais próximo
  return Math.round(b);
}

export interface BpmRelation {
  pct: number;         // diferença percentual absoluta (0.03 = 3%)
  signedPct: number;   // + acelera, - desacelera
  mode: "direct" | "half" | "double";
  cost: number;
  label: string;
}

/** Diferença de BPM a -> b considerando meio/dobro tempo */
export function bpmRelation(a?: number, b?: number, maxPitch = 0.06): BpmRelation {
  if (!a || !b) return { pct: 0, signedPct: 0, mode: "direct", cost: 2, label: "BPM desconhecido" };
  const cands: { t: number; mode: BpmRelation["mode"] }[] = [
    { t: a, mode: "direct" },
    { t: a * 2, mode: "double" },
    { t: a / 2, mode: "half" },
  ];
  let best = { pct: Infinity, signed: 0, mode: "direct" as BpmRelation["mode"] };
  for (const c of cands) {
    const signed = (b - c.t) / c.t;
    if (Math.abs(signed) < best.pct) best = { pct: Math.abs(signed), signed, mode: c.mode };
  }
  // penalidade extra para meio/dobro (funciona, mas exige técnica)
  const modePenalty = best.mode === "direct" ? 0 : 1.5;
  let cost: number;
  if (best.pct <= 0.02) cost = 0;
  else if (best.pct <= 0.04) cost = 0.8;
  else if (best.pct <= maxPitch) cost = 2;
  else if (best.pct <= maxPitch + 0.03) cost = 5;
  else cost = 10;
  const pctTxt = `${best.signed >= 0 ? "+" : ""}${(best.signed * 100).toFixed(1)}%`;
  const label =
    best.mode === "direct" ? pctTxt : `${best.mode === "double" ? "½×" : "2×"} ${pctTxt}`;
  return { pct: best.pct, signedPct: best.signed, mode: best.mode, cost: cost + modePenalty, label };
}

export function formatDuration(sec?: number): string {
  if (!sec || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "6:45", "1:02:03", "405" (segundos), "6.45" -> segundos */
export function parseDuration(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v > 0 && v < 4 * 3600 ? (v < 1 ? v * 86400 : v) : undefined; // Excel guarda tempo como fração do dia
  const s = String(v).trim();
  let m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = /^(\d{1,3})[:.'](\d{2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  if (/^\d{2,5}$/.test(s)) return +s;
  return undefined;
}
