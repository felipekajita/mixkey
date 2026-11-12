"use client";
import { Disc3 } from "lucide-react";
import { useState } from "react";
import { camelotColor, camelotToMusical } from "@/lib/camelot";
import type { Confidence } from "@/lib/types";
import { cn } from "./ui";

export function Cover({ src, size = 48, className, alt = "" }: { src?: string; size?: number; className?: string; alt?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err)
    return (
      <div style={{ width: size, height: size }} className={cn("rounded-lg bg-panel2 border border-line flex items-center justify-center text-muted shrink-0", className)}>
        <Disc3 size={size * 0.45} />
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setErr(true)} style={{ width: size, height: size }} className={cn("rounded-lg object-cover shrink-0 bg-panel2", className)} />;
}

export function KeyBadge({ k, size = "md", showMusical }: { k?: string; size?: "sm" | "md" | "lg"; showMusical?: boolean }) {
  const c = camelotColor(k);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        style={{ background: k ? `${c}22` : undefined, color: k ? c : undefined, borderColor: k ? `${c}66` : undefined }}
        className={cn("inline-flex items-center justify-center rounded-md border font-bold tabular-nums",
          size === "sm" && "h-6 min-w-[2.2rem] text-xs px-1",
          size === "md" && "h-7 min-w-[2.6rem] text-sm px-1.5",
          size === "lg" && "h-10 min-w-[3.4rem] text-lg px-2",
          !k && "border-line text-muted")}>
        {k ?? "—"}
      </span>
      {showMusical && k && <span className="text-xs text-muted">{camelotToMusical(k)}</span>}
    </span>
  );
}

export function ConfDot({ c, title }: { c: Confidence; title?: string }) {
  const color = c === "high" ? "bg-emerald-400" : c === "medium" ? "bg-amber-400" : c === "low" ? "bg-red-400" : "bg-line";
  const txt = c === "high" ? "Confiança alta (fontes concordam)" : c === "medium" ? "Confiança média" : c === "low" ? "Confiança baixa — confira" : "Sem dados";
  return <span title={title ?? txt} className={cn("inline-block w-2 h-2 rounded-full", color)} />;
}

export function EnergyBar({ v }: { v?: number }) {
  const n = v ?? 0;
  return (
    <div className="flex items-center gap-1.5" title={`Energia ${v ?? "?"}/10`}>
      <div className="w-12 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full grad-bg" style={{ width: `${n * 10}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{v != null ? v.toFixed(1) : "—"}</span>
    </div>
  );
}

export function ScorePill({ score }: { score: number }) {
  const cls = score >= 90 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : score >= 70 ? "bg-sky-500/15 text-sky-400 border-sky-500/30" : score >= 40 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-red-500/15 text-red-400 border-red-500/30";
  return <span className={cn("inline-flex items-center rounded-full border px-2 h-6 text-xs font-semibold tabular-nums", cls)}>{score}</span>;
}
