"use client";
import { CAMELOT_COLORS, camelotToMusical, splitCamelot } from "@/lib/camelot";

/** Roda Camelot com o caminho do set desenhado */
export default function CamelotWheel({ path, highlight, size = 320 }: { path: (string | undefined)[]; highlight?: number; size?: number }) {
  const c = size / 2;
  const rOut = c - 4, rMid = c * 0.68, rIn = c * 0.38;
  const ang = (n: number) => ((n - 1) * 30 - 90) * (Math.PI / 180);
  const pos = (k: string) => {
    const p = splitCamelot(k)!;
    const r = p.letter === "B" ? (rOut + rMid) / 2 : (rMid + rIn) / 2;
    return [c + r * Math.cos(ang(p.num)), c + r * Math.sin(ang(p.num))];
  };
  const arc = (r1: number, r2: number, n: number) => {
    const a0 = ang(n) - Math.PI / 12, a1 = ang(n) + Math.PI / 12;
    const p = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r2, a1)} A${r2},${r2} 0 0 0 ${p(r2, a0)} Z`;
  };
  const counts = new Map<string, number>();
  path.forEach((k) => k && counts.set(k, (counts.get(k) ?? 0) + 1));
  const pts = path.filter((k): k is string => !!splitCamelot(k)).map(pos);
  const hk = highlight != null ? path[highlight] : undefined;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[360px] mx-auto">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
        <g key={n}>
          {(["B", "A"] as const).map((L) => {
            const k = `${n}${L}`;
            const used = counts.has(k);
            return (
              <g key={L}>
                <path d={L === "B" ? arc(rOut, rMid, n) : arc(rMid, rIn, n)} fill={CAMELOT_COLORS[n]} opacity={used ? (hk === k ? 1 : 0.85) : 0.16} stroke="rgb(var(--panel))" strokeWidth={2} />
                <text x={pos(k)[0]} y={pos(k)[1]} textAnchor="middle" dominantBaseline="central" fontSize={size / 26} fontWeight={700} fill={used ? "#0b0b12" : "rgb(var(--muted))"}>
                  <title>{`${k} · ${camelotToMusical(k)}`}</title>
                  {k}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {pts.length > 1 && (
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="rgb(var(--fg))" strokeOpacity={0.75} strokeWidth={2} strokeLinejoin="round" strokeDasharray="4 3" />
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 || i === pts.length - 1 ? 5 : 2.5} fill={i === 0 ? "#22c55e" : i === pts.length - 1 ? "#ef4444" : "rgb(var(--fg))"} />
      ))}
      <circle cx={c} cy={c} r={rIn - 4} fill="rgb(var(--panel2))" />
      <text x={c} y={c - 6} textAnchor="middle" fontSize={size / 22} fontWeight={700} fill="rgb(var(--fg))">Camelot</text>
      <text x={c} y={c + 12} textAnchor="middle" fontSize={size / 32} fill="rgb(var(--muted))">● início ● fim</text>
    </svg>
  );
}
