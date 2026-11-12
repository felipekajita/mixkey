import type { Track } from "./types";

const SOFT = /(deep|chill|ambient|downtempo|lounge|lo-?fi|organic|melodic house|acoustic|balearic|jazz|soul|bossa|mpb|indie)/i;
const HARD = /(techno|hard|peak|trance|big room|drum and bass|dnb|dubstep|bass house|psy|funk carioca|electro house|hardstyle|rave)/i;

/** Estimativa de energia 1–10 a partir dos dados disponíveis */
export function estimateEnergy(t: Pick<Track, "bpm" | "genres" | "loudness" | "danceability">): number {
  let e = 5;
  if (t.bpm) {
    const b = t.bpm;
    e = b < 95 ? 2.5 : b < 110 ? 3.5 : b < 118 ? 4.5 : b < 123 ? 5.2 : b < 127 ? 6 : b < 131 ? 6.8 : b < 138 ? 7.5 : 8.3;
  }
  const g = (t.genres || []).join(" ");
  if (SOFT.test(g)) e -= 1.3;
  if (HARD.test(g)) e += 1;
  if (t.loudness != null) {
    // loudness integrada aprox. -20 (baixo) .. -5 LUFS (alto)
    const l = Math.max(0, Math.min(1, (t.loudness + 20) / 15));
    e = e * 0.6 + (2 + l * 8) * 0.4;
  }
  if (t.danceability != null) {
    const d = Math.max(0, Math.min(1, t.danceability / 3));
    e = e * 0.8 + (2 + d * 8) * 0.2;
  }
  return Math.round(Math.max(1, Math.min(10, e)) * 10) / 10;
}
