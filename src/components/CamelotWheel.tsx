"use client";
import { CAMELOT_COLORS, camelotToMusical, splitCamelot } from "@/lib/camelot";
import type { Transition } from "@/lib/sequencer";

interface Step { key?: string; title?: string }

/** Roda Camelot com o caminho do set: pontos numerados, setas, início/fim e a sequência de keys abaixo */
export default function CamelotWheel({ path, steps, transitions, size = 340 }: { path: (string | undefined)[]; steps?: Step[]; transitions?: Transition[]; size?: number }) {
  const c = size / 2;
  const rOut = c - 6, rMid = c * 0.68, rIn = c * 0.38;
  const ang = (n: number) => ((n - 1) * 30 - 90) * (Math.PI / 180);
  const basePos = (k: string, jitter = 0) => {
    const p = splitCamelot(k)!;
    const r = (p.letter === "B" ? (rOut + rMid) / 2 : (rMid + rIn) / 2);
    // várias faixas na mesma key: espalha ao longo do arco para os números não se sobreporem
    const a = ang(p.num) + jitter;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  const arc = (r1: number, r2: number, n: number) => {
    const a0 = ang(n) - Math.PI / 12, a1 = ang(n) + Math.PI / 12;
    const p = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r2, a1)} A${r2},${r2} 0 0 0 ${p(r2, a0)} Z`;
  };
  const used = new Set(path.filter(Boolean) as string[]);
  // posição de cada passo (com deslocamento quando a key se repete)
  const counts = new Map<string, number>(), seen = new Map<string, number>();
  path.forEach((k) => k && counts.set(k, (counts.get(k) ?? 0) + 1));
  const pts = path.map((k, i) => {
    if (!splitCamelot(k)) return null;
    const n = counts.get(k!)!, j = seen.get(k!) ?? 0;
    seen.set(k!, j + 1);
    const spread = n > 1 ? ((j - (n - 1) / 2) * 0.17) : 0;
    const [x, y] = basePos(k!, spread);
    return { x, y, i, key: k! };
  }).filter((p): p is { x: number; y: number; i: number; key: string } => !!p);
  const last = pts.length - 1;
  const r0 = size / 30;

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[380px] mx-auto" role="img" aria-label="Caminho do set na roda Camelot">
        <defs>
          <marker id="mk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--fg))" />
          </marker>
        </defs>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <g key={n}>
            {(["B", "A"] as const).map((L) => {
              const k = `${n}${L}`;
              const [tx, ty] = basePos(k);
              return (
                <g key={L}>
                  <path d={L === "B" ? arc(rOut, rMid, n) : arc(rMid, rIn, n)} fill={CAMELOT_COLORS[n]} opacity={used.has(k) ? 0.55 : 0.12} stroke="rgb(var(--panel))" strokeWidth={2} />
                  {!used.has(k) && (
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={size / 30} fontWeight={600} fill="rgb(var(--muted))">
                      <title>{`${k} · ${camelotToMusical(k)}`}</title>{k}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
        <circle cx={c} cy={c} r={rIn - 4} fill="rgb(var(--panel2))" opacity={0.85} />
        <text x={c} y={c - 6} textAnchor="middle" fontSize={size / 22} fontWeight={700} fill="rgb(var(--fg))">Camelot</text>
        <text x={c} y={c + 12} textAnchor="middle" fontSize={size / 32} fill="rgb(var(--muted))">{pts.length} passos</text>
        {/* setas entre pontos consecutivos (encurtadas para não cobrir os círculos) */}
        {pts.slice(1).map((p, idx) => {
          const a = pts[idx];
          const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
          if (d < 1) return null;
          const ux = dx / d, uy = dy / d;
          const clash = transitions?.[a.i]?.key.kind === "clash";
          return <line key={idx} x1={a.x + ux * (r0 + 1)} y1={a.y + uy * (r0 + 1)} x2={p.x - ux * (r0 + 3)} y2={p.y - uy * (r0 + 3)} stroke={clash ? "#ef4444" : "rgb(var(--fg))"} strokeOpacity={0.8} strokeWidth={1.8} markerEnd="url(#mk-arrow)" />;
        })}
        {pts.map((p) => {
          const isStart = p.i === pts[0].i, isEnd = p.i === pts[last].i;
          return (
            <g key={p.i}>
              <circle cx={p.x} cy={p.y} r={r0} fill={isStart ? "#22c55e" : isEnd ? "#ef4444" : "rgb(var(--panel))"} stroke={CAMELOT_COLORS[splitCamelot(p.key)!.num]} strokeWidth={2.5}>
                <title>{`${p.i + 1}. ${steps?.[p.i]?.title ?? ""} — ${p.key} (${camelotToMusical(p.key)})`}</title>
              </circle>
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={size / 32} fontWeight={700} fill={isStart || isEnd ? "#fff" : "rgb(var(--fg))"} pointerEvents="none">{p.i + 1}</text>
            </g>
          );
        })}
        {pts.length > 0 && (() => {
          const s0 = pts[0], e = pts[last];
          const lbl = (p: typeof s0, text: string, color: string) => {
            const dx = p.x - c, dy = p.y - c, d = Math.hypot(dx, dy) || 1;
            const lx = p.x + (dx / d) * (r0 + 13), ly = p.y + (dy / d) * (r0 + 13);
            return <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={size / 28} fontWeight={800} fill={color} stroke="rgb(var(--panel))" strokeWidth={3} paintOrder="stroke">{text}</text>;
          };
          return <>{lbl(s0, "Início", "#22c55e")}{last > 0 && lbl(e, "Fim", "#ef4444")}</>;
        })()}
      </svg>

      {/* sequência resumida das keys */}
      {pts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs max-h-40 overflow-auto scroll-thin" aria-label="Sequência de keys">
          {path.map((k, i) => {
            const tr = i > 0 ? transitions?.[i - 1] : undefined;
            const col = k && splitCamelot(k) ? CAMELOT_COLORS[splitCamelot(k)!.num] : undefined;
            return (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <span className={tr?.key.kind === "clash" ? "text-red-400 font-bold" : "text-muted"} title={tr?.key.label}>{tr?.key.icon && tr.key.icon !== "=" ? tr.key.icon : "→"}</span>}
                <span className="inline-flex items-center rounded-md border px-1.5 h-6 font-semibold tabular-nums" title={steps?.[i]?.title}
                  style={{ borderColor: col ? `${col}88` : undefined, background: col ? `${col}22` : undefined, color: col }}>
                  <span className="text-[10px] opacity-70 mr-1">{i + 1}</span>{k ?? "?"}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
