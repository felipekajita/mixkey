import type { Camelot } from "./types";

export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_DISPLAY = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_DISPLAY = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFEGE_PC: Record<string, number> = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };

export function pcToCamelot(pc: number, minor: boolean): Camelot {
  const majorPc = minor ? (pc + 3) % 12 : pc;
  const num = ((majorPc * 7) % 12 + 7) % 12 + 1;
  return `${num}${minor ? "A" : "B"}`;
}

export function camelotToPc(c: Camelot): { pc: number; minor: boolean } | null {
  const p = splitCamelot(c);
  if (!p) return null;
  // inverso de num = (pc*7 + 7) % 12 + 1  => pc*7 ≡ num-8 (mod 12) ; 7 é inverso de si mesmo mod 12
  const majorPc = (((p.num - 8) * 7) % 12 + 12) % 12;
  const minor = p.letter === "A";
  return { pc: minor ? (majorPc + 9) % 12 : majorPc, minor };
}

export function splitCamelot(c: Camelot | undefined | null): { num: number; letter: "A" | "B" } | null {
  if (!c) return null;
  const m = /^(\d{1,2})([AB])$/.exec(c);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] as "A" | "B" };
}

/** Nome musical tradicional (ex: "8A" -> "Am") */
export function camelotToMusical(c: Camelot | undefined): string {
  const r = c ? camelotToPc(c) : null;
  if (!r) return "";
  return r.minor ? MINOR_DISPLAY[r.pc] : MAJOR_DISPLAY[r.pc];
}

/** Notação Open Key (Traktor): 8B (C) -> 1d ; 8A (Am) -> 1m */
export function camelotToOpenKey(c: Camelot | undefined): string {
  const p = splitCamelot(c);
  if (!p) return "";
  const n = ((p.num - 8 + 12) % 12) + 1;
  return `${n}${p.letter === "A" ? "m" : "d"}`;
}

/**
 * Converte qualquer notação de tom para Camelot.
 * Aceita: "8A", "08a", "1m"/"1d" (Open Key), "Am", "A minor", "A min", "Abm", "G#m", "A♭ Minor",
 * "C major", "Cmaj", "C", "Lá menor", "Dó# maior", "Si bemol menor"...
 */
export function parseKey(input: string | undefined | null): Camelot | undefined {
  if (!input) return undefined;
  let s = String(input).trim();
  if (!s) return undefined;

  // Camelot
  let m = /^0?(\d{1,2})\s*([AaBb])$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return `${n}${m[2].toUpperCase()}`;
  }
  // Open Key
  m = /^0?(\d{1,2})\s*([mMdD])$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) {
      const num = ((n - 1 + 7) % 12) + 1;
      return `${num}${m[2].toLowerCase() === "m" ? "A" : "B"}`;
    }
  }

  s = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, " ")
    .trim();

  let lower = s.toLowerCase();
  // Solfejo (pt/es/it/fr)
  const sol = /^(do|re|mi|fa|sol|la|si)\b\s*(sustenido|bemol|#|b(?![a-z]))?\s*(.*)$/i.exec(lower);
  let pc: number | undefined;
  let rest = "";
  if (sol) {
    pc = SOLFEGE_PC[sol[1]];
    if (sol[2] === "#" || sol[2] === "sustenido") pc += 1;
    if (sol[2] === "b" || sol[2] === "bemol") pc -= 1;
    rest = sol[3];
  } else {
    const n = /^([A-Ga-g])\s*(#|b|sharp|flat)?\s*(.*)$/.exec(s);
    if (!n) return undefined;
    pc = LETTER_PC[n[1].toUpperCase()];
    const acc = n[2]?.toLowerCase();
    if (acc === "#" || acc === "sharp") pc += 1;
    if (acc === "b" || acc === "flat") pc -= 1;
    rest = n[3];
  }
  pc = ((pc % 12) + 12) % 12;
  lower = rest.toLowerCase().trim();
  let minor = false;
  if (/^(m|min|minor|menor|moll|mineur|-)\b/.test(lower) || lower === "m") minor = true;
  else if (lower === "" || /^(maj|major|maior|dur|majeur|m(?=aj))/i.test(lower)) minor = false;
  else if (/^m/.test(rest)) minor = true; // "Am7" etc.
  else return undefined;
  return pcToCamelot(pc, minor);
}

export type TransitionKind = "same" | "adjacent" | "relative" | "boost" | "diagonal" | "semitone" | "drop" | "clash" | "unknown";

export interface KeyRelation {
  kind: TransitionKind;
  cost: number;   // 0 perfeito ... 10 conflito
  label: string;
  icon: string;
}

/** Relação harmônica de a -> b (direcional) */
export function keyRelation(a?: Camelot, b?: Camelot): KeyRelation {
  const A = splitCamelot(a);
  const B = splitCamelot(b);
  if (!A || !B) return { kind: "unknown", cost: 3, label: "Tom desconhecido", icon: "?" };
  const d = (B.num - A.num + 12) % 12; // passos no sentido horário
  if (d === 0 && A.letter === B.letter) return { kind: "same", cost: 0, label: "Mesmo tom", icon: "=" };
  if (d === 0) return { kind: "relative", cost: 1, label: A.letter === "A" ? "Relativa maior" : "Relativa menor", icon: "↕" };
  if (A.letter === B.letter && d === 1) return { kind: "adjacent", cost: 1, label: "+1 (sobe energia)", icon: "↗" };
  if (A.letter === B.letter && d === 11) return { kind: "adjacent", cost: 1, label: "−1 (baixa energia)", icon: "↘" };
  if (A.letter === B.letter && d === 2) return { kind: "boost", cost: 2.5, label: "+2 Energy boost", icon: "⚡" };
  if (A.letter === "A" && B.letter === "B" && d === 1) return { kind: "diagonal", cost: 2, label: "Diagonal (menor→maior)", icon: "↗" };
  if (A.letter === "B" && B.letter === "A" && d === 11) return { kind: "diagonal", cost: 2, label: "Diagonal (maior→menor)", icon: "↘" };
  if (A.letter === B.letter && d === 7) return { kind: "semitone", cost: 3.5, label: "+1 semitom (modulação)", icon: "⤴" };
  if (A.letter === B.letter && d === 10) return { kind: "drop", cost: 4, label: "−2 (queda de energia)", icon: "⤵" };
  return { kind: "clash", cost: 10, label: "Conflito harmônico", icon: "⚠" };
}

/** Cores no padrão da roda Camelot (Mixed In Key / Rekordbox) */
export const CAMELOT_COLORS: Record<number, string> = {
  1: "#3df5c8", 2: "#5cf28a", 3: "#9bf05a", 4: "#e6e85a", 5: "#ffbe5c", 6: "#ff8f6b",
  7: "#ff6f91", 8: "#f26bd0", 9: "#c47bff", 10: "#8f8cff", 11: "#5cb8ff", 12: "#3de0f5",
};

export function camelotColor(c?: Camelot): string {
  const p = splitCamelot(c);
  return p ? CAMELOT_COLORS[p.num] : "#6b7280";
}

export const ALL_CAMELOT: Camelot[] = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();
