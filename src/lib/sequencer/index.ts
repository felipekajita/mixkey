import { keyRelation, type KeyRelation } from "../camelot";
import { bpmRelation, type BpmRelation } from "../bpm";
import { normalizeName } from "../match";
import { estimateEnergy } from "../energy";
import type { Track } from "../types";
import { VIBES, targetCurve, type EndingId } from "./presets";

export interface SequenceOptions {
  vibeId: string;
  ending: EndingId;
  maxPitch: number;              // 0.06 = ±6%
  count: number;                 // nº de sequências alternativas
  length: { mode: "all" | "count" | "minutes"; value: number };
  distinct: boolean;             // sets sem faixas repetidas entre si
  harmonicWeight: number;        // 0..2
  bpmTrend: "free" | "rising" | "falling" | "stable";
  startTrackId?: string;
  endTrackId?: string;
  avoidSameArtist: boolean;
}

export const DEFAULT_OPTIONS: SequenceOptions = {
  vibeId: "journey", ending: "default", maxPitch: 0.06, count: 3,
  length: { mode: "all", value: 20 }, distinct: false, harmonicWeight: 1,
  bpmTrend: "free", avoidSameArtist: true,
};

export interface Transition {
  key: KeyRelation;
  bpm: BpmRelation;
  energyDelta: number;
  score: number;   // 0..100
  tip: string;
}

export interface SequenceResult {
  id: string;
  name: string;
  trackIds: string[];
  transitions: Transition[];
  score: number;          // média 0..100
  targets: number[];      // energia-alvo (1..10) por posição
  totalSec: number;
  stats: { perfect: number; ok: number; risky: number; clash: number };
}

interface Node { t: Track; energy: number; rel: number; artistKey: string; dur: number }

function prepare(tracks: Track[]): Node[] {
  const withE = tracks.map((t) => ({ t, energy: t.energy ?? estimateEnergy(t) }));
  // energia relativa (percentil) para a curva caber em qualquer biblioteca
  const sorted = [...withE].sort((a, b) => a.energy - b.energy);
  const n = sorted.length;
  return withE.map((x) => {
    const lo = sorted.findIndex((s) => s.energy >= x.energy);
    let hi = lo;
    while (hi + 1 < n && sorted[hi + 1].energy === x.energy) hi++;
    const pct = n > 1 ? ((lo + hi) / 2) / (n - 1) : 0.5;
    // mistura percentil com valor absoluto para não esticar demais bibliotecas homogêneas
    const rel = pct * 0.7 + ((x.energy - 1) / 9) * 0.3;
    return {
      t: x.t, energy: x.energy, rel,
      artistKey: normalizeName(x.t.artist.split(/,|&| feat| ft| x /i)[0] || ""),
      dur: x.t.durationSec ?? 330,
    };
  });
}

export function transitionInfo(a: Track, b: Track, maxPitch: number, ea?: number, eb?: number): Transition {
  const key = keyRelation(a.key, b.key);
  const bpm = bpmRelation(a.bpm, b.bpm, maxPitch);
  const energyDelta = (eb ?? b.energy ?? estimateEnergy(b)) - (ea ?? a.energy ?? estimateEnergy(a));
  const score = Math.round(Math.max(0, 100 - key.cost * 7 - bpm.cost * 5));
  const tips: string[] = [];
  if (key.kind === "boost") tips.push("Energy boost: entre no drop para levantar a pista");
  if (key.kind === "clash") tips.push("Tons em conflito: use transição curta, corte no grave, eco/reverb out ou um loop de percussão");
  if (key.kind === "semitone") tips.push("Modulação: troque rápido, numa virada de frase");
  if (key.kind === "drop") tips.push("Queda de tom: bom para respirar a pista; faça a troca num breakdown");
  if (bpm.mode !== "direct") tips.push(`Mixagem em ${bpm.mode === "double" ? "meio" : "dobro"} tempo`);
  else if (bpm.pct > 0.02 && bpm.pct <= maxPitch) tips.push(`Ajuste o pitch ${bpm.label}${bpm.pct > 0.04 ? " (considere Master Tempo/Key Lock)" : ""}`);
  else if (bpm.pct > maxPitch) tips.push(`Salto de BPM ${bpm.label}: use um break, um efeito de brake ou uma faixa ponte`);
  if (!tips.length) tips.push(key.kind === "same" ? "Transição perfeita: blend longo funciona" : "Transição harmônica tranquila");
  return { key, bpm, energyDelta, score, tip: tips.join(" · ") };
}

function edgeCost(a: Node, b: Node, o: SequenceOptions): number {
  const k = keyRelation(a.t.key, b.t.key).cost;
  const br = bpmRelation(a.t.bpm, b.t.bpm, o.maxPitch);
  let c = k * o.harmonicWeight * 1.2 + br.cost;
  if (o.bpmTrend !== "free" && a.t.bpm && b.t.bpm && br.mode === "direct") {
    const s = br.signedPct;
    if (o.bpmTrend === "rising" && s < -0.005) c += 2 + Math.abs(s) * 40;
    if (o.bpmTrend === "falling" && s > 0.005) c += 2 + Math.abs(s) * 40;
    if (o.bpmTrend === "stable") c += Math.abs(s) * 30;
  }
  if (o.avoidSameArtist && a.artistKey && a.artistKey === b.artistKey) c += 2.5;
  return c;
}

interface BeamState { seq: number[]; used: Set<number>; cost: number }

function beamSearch(
  nodes: Node[], N: number, target: (i: number) => number, o: SequenceOptions, eW: number,
  edgePenalty: Map<string, number>, startIdx?: number, endIdx?: number, width = 40,
): number[] {
  const M = nodes.length;
  const energyCost = (node: Node, pos: number) => Math.abs(node.rel - target(pos)) * 10 * eW;
  let beam: BeamState[] = [];
  const firsts = startIdx != null ? [startIdx] : nodes.map((_, i) => i).filter((i) => i !== endIdx);
  for (const i of firsts) beam.push({ seq: [i], used: new Set([i]), cost: energyCost(nodes[i], 0) * 1.5 });
  beam.sort((a, b) => a.cost - b.cost);
  beam = beam.slice(0, width);

  for (let pos = 1; pos < N; pos++) {
    const next: BeamState[] = [];
    const isLast = pos === N - 1;
    for (const st of beam) {
      const last = nodes[st.seq[st.seq.length - 1]];
      const cands: { j: number; c: number }[] = [];
      for (let j = 0; j < M; j++) {
        if (st.used.has(j)) continue;
        if (endIdx != null && (isLast ? j !== endIdx : j === endIdx)) continue;
        const ek = `${st.seq[st.seq.length - 1]}>${j}`;
        const c = edgeCost(last, nodes[j], o) + energyCost(nodes[j], pos) + (edgePenalty.get(ek) ?? 0);
        cands.push({ j, c });
      }
      cands.sort((a, b) => a.c - b.c);
      for (const { j, c } of cands.slice(0, 8)) {
        const used = new Set(st.used);
        used.add(j);
        next.push({ seq: [...st.seq, j], used, cost: st.cost + c });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => a.cost - b.cost);
    // diversidade: no máximo 3 estados terminando na mesma faixa
    const seen = new Map<number, number>();
    beam = [];
    for (const s of next) {
      const lastI = s.seq[s.seq.length - 1];
      const k = seen.get(lastI) ?? 0;
      if (k >= 3) continue;
      seen.set(lastI, k + 1);
      beam.push(s);
      if (beam.length >= width) break;
    }
  }
  return beam[0]?.seq ?? [];
}

function seqCost(seq: number[], nodes: Node[], target: (i: number) => number, o: SequenceOptions, eW: number, pen: Map<string, number>) {
  let c = 0;
  for (let i = 0; i < seq.length; i++) {
    c += Math.abs(nodes[seq[i]].rel - target(i)) * 10 * eW * (i === 0 ? 1.5 : 1);
    if (i > 0) c += edgeCost(nodes[seq[i - 1]], nodes[seq[i]], o) + (pen.get(`${seq[i - 1]}>${seq[i]}`) ?? 0);
  }
  return c;
}

/** Refinamento local: move uma faixa para outra posição / troca pares */
function refine(seq: number[], nodes: Node[], target: (i: number) => number, o: SequenceOptions, eW: number, pen: Map<string, number>, lockStart: boolean, lockEnd: boolean) {
  let best = [...seq];
  let bestC = seqCost(best, nodes, target, o, eW, pen);
  const lo = lockStart ? 1 : 0;
  const hi = lockEnd ? best.length - 1 : best.length;
  let improved = true;
  let iter = 0;
  while (improved && iter++ < 30) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let j = lo; j < hi; j++) {
        if (i === j) continue;
        const cand = [...best];
        const [x] = cand.splice(i, 1);
        cand.splice(j, 0, x);
        const c = seqCost(cand, nodes, target, o, eW, pen);
        if (c < bestC - 1e-6) { best = cand; bestC = c; improved = true; }
      }
    }
  }
  return best;
}

export function buildSequences(allTracks: Track[], o: SequenceOptions): SequenceResult[] {
  const vibe = VIBES.find((v) => v.id === o.vibeId) ?? VIBES[0];
  const eW = vibe.energyWeight ?? 1;
  const curve = targetCurve(vibe, o.ending);
  const results: SequenceResult[] = [];
  const pen = new Map<string, number>();
  let pool = allTracks.filter((t) => t.title);
  const letters = "ABCDEFGHIJ";

  for (let s = 0; s < o.count; s++) {
    if (pool.length < 2) break;
    const nodes = prepare(pool);
    let N = nodes.length;
    if (o.length.mode === "count") N = Math.min(N, Math.max(2, Math.round(o.length.value)));
    if (o.length.mode === "minutes") {
      const avg = nodes.reduce((a, n) => a + n.dur, 0) / nodes.length;
      // considera ~25% de sobreposição nas mixagens
      N = Math.min(N, Math.max(2, Math.round((o.length.value * 60) / (avg * 0.75))));
    }
    const target = (i: number) => curve(N > 1 ? i / (N - 1) : 0);
    const startIdx = o.startTrackId ? nodes.findIndex((n) => n.t.id === o.startTrackId) : -1;
    const endIdx = o.endTrackId ? nodes.findIndex((n) => n.t.id === o.endTrackId) : -1;
    const width = nodes.length > 150 ? 20 : nodes.length > 60 ? 30 : 50;
    let seq = beamSearch(nodes, N, target, o, eW, pen, startIdx >= 0 ? startIdx : undefined, endIdx >= 0 && endIdx !== startIdx ? endIdx : undefined, width);
    if (seq.length <= 60) seq = refine(seq, nodes, target, o, eW, pen, startIdx >= 0, endIdx >= 0);

    // penaliza arestas usadas para gerar alternativas diferentes
    for (let i = 1; i < seq.length; i++) {
      const k = `${seq[i - 1]}>${seq[i]}`;
      pen.set(k, (pen.get(k) ?? 0) + 4);
    }
    if (s === 0 && startIdx < 0) pen.set(`start:${seq[0]}`, 1);

    const ordered = seq.map((i) => nodes[i]);
    // curva exibida na escala de energia real da biblioteca
    const es = nodes.map((n) => n.energy);
    let eLo = Math.min(...es), eHi = Math.max(...es);
    if (eHi - eLo < 3) { const m = (eHi + eLo) / 2; eLo = Math.max(1, m - 1.5); eHi = Math.min(10, m + 1.5); }
    const transitions = ordered.slice(1).map((n, i) => transitionInfo(ordered[i].t, n.t, o.maxPitch, ordered[i].energy, n.energy));
    const stats = { perfect: 0, ok: 0, risky: 0, clash: 0 };
    transitions.forEach((t) => {
      if (t.score >= 90) stats.perfect++;
      else if (t.score >= 70) stats.ok++;
      else if (t.score >= 40) stats.risky++;
      else stats.clash++;
    });
    const result: SequenceResult = {
      id: `seq-${Date.now()}-${s}`,
      name: `Set ${letters[s]} · ${vibe.name}`,
      trackIds: ordered.map((n) => n.t.id),
      transitions,
      score: transitions.length ? Math.round(transitions.reduce((a, t) => a + t.score, 0) / transitions.length) : 100,
      targets: ordered.map((_, i) => Math.round((eLo + target(i) * (eHi - eLo)) * 10) / 10),
      totalSec: ordered.reduce((a, n) => a + n.dur, 0),
      stats,
    };
    // evita alternativas idênticas
    if (results.some((r) => r.trackIds.join() === result.trackIds.join())) continue;
    results.push(result);
    if (o.distinct) {
      const used = new Set(result.trackIds);
      pool = pool.filter((t) => !used.has(t.id) || t.id === o.startTrackId || t.id === o.endTrackId);
    }
  }
  return results;
}

/** Recalcula transições de uma ordem editada manualmente */
export function rescoreSequence(seq: SequenceResult, tracks: Map<string, Track>, maxPitch: number): SequenceResult {
  const ts = seq.trackIds.map((id) => tracks.get(id)).filter((t): t is Track => !!t);
  const transitions = ts.slice(1).map((t, i) => transitionInfo(ts[i], t, maxPitch));
  const stats = { perfect: 0, ok: 0, risky: 0, clash: 0 };
  transitions.forEach((t) => {
    if (t.score >= 90) stats.perfect++;
    else if (t.score >= 70) stats.ok++;
    else if (t.score >= 40) stats.risky++;
    else stats.clash++;
  });
  return {
    ...seq,
    trackIds: ts.map((t) => t.id),
    transitions,
    stats,
    score: transitions.length ? Math.round(transitions.reduce((a, t) => a + t.score, 0) / transitions.length) : 100,
    totalSec: ts.reduce((a, t) => a + (t.durationSec ?? 330), 0),
  };
}

/** Sugere faixas da biblioteca que fazem ponte entre a e b */
export function findBridges(a: Track, b: Track, library: Track[], maxPitch: number, exclude: Set<string>): Track[] {
  return library
    .filter((t) => !exclude.has(t.id) && t.id !== a.id && t.id !== b.id)
    .map((t) => ({ t, s: transitionInfo(a, t, maxPitch).score + transitionInfo(t, b, maxPitch).score }))
    .filter((x) => x.s >= 150)
    .sort((x, y) => y.s - x.s)
    .slice(0, 3)
    .map((x) => x.t);
}
