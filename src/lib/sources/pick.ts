import type { LookupQuery } from "../types";
import { matchScore } from "../match";

/** Escolhe o melhor candidato pelo nome */
export function pickBest<T>(want: LookupQuery, items: T[], get: (x: T) => { title: string; artist: string; durationSec?: number }) {
  let best: { item: T; score: number } | null = null;
  for (const it of items) {
    const g = get(it);
    let s = matchScore(want, g);
    if (want.durationSec && g.durationSec) {
      const d = Math.abs(want.durationSec - g.durationSec);
      if (d <= 4) s += 0.05;
      else if (d > 60) s -= 0.05; // provavelmente outra versão (radio x extended)
    }
    if (!best || s > best.score) best = { item: it, score: Math.min(1, s) };
  }
  return best;
}

