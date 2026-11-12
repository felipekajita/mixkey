"use client";
import { useEffect } from "react";
import { Play, Pause, Volume2, Volume1, VolumeX, X } from "lucide-react";
import { usePreviewState, previewControls } from "./usePreview";
import { Cover } from "./bits";

const fmt = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}`;

/** Mini-player das prévias: aparece enquanto uma prévia toca, com regulador de volume */
export default function PreviewBar() {
  const s = usePreviewState();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement;
      const typing = el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || (el?.tagName === "INPUT" && el.type !== "range");
      if (!s.visible || typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "m") previewControls.toggleMute();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [s.visible]);

  if (!s.visible || !s.url) return null;
  const vol = s.muted ? 0 : s.volume;
  const Icon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[min(640px,calc(100%-1.5rem))] rounded-2xl border border-line bg-panel/95 backdrop-blur shadow-2xl px-3 py-2 flex items-center gap-3" role="region" aria-label="Prévia tocando">
      <Cover src={s.meta.coverUrl} size={40} />
      <button onClick={() => s.url && previewControls.toggle(s.url, s.meta)} className="w-9 h-9 rounded-full grad-bg text-white flex items-center justify-center shrink-0" aria-label={s.playing ? "Pausar" : "Tocar"}>
        {s.playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{s.meta.title ?? "Prévia"}{s.meta.artist ? <span className="text-muted font-normal"> – {s.meta.artist}</span> : null}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted tabular-nums">
          {fmt(s.time)}
          <input type="range" min={0} max={s.duration || 30} step={0.1} value={s.time} onChange={(e) => previewControls.seek(+e.target.value)} className="flex-1 h-1" aria-label="Posição" />
          {fmt(s.duration || 30)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={previewControls.toggleMute} className="text-muted hover:text-fg" aria-label={s.muted ? "Ativar som" : "Mudo"} title="Mudo (M)"><Icon size={18} /></button>
        <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => previewControls.setVolume(+e.target.value)} className="w-20 sm:w-28" aria-label="Volume das prévias" title={`Volume ${Math.round(vol * 100)}%`} />
        <span className="hidden sm:inline text-[11px] text-muted w-8 tabular-nums">{Math.round(vol * 100)}%</span>
      </div>
      <button onClick={previewControls.close} className="text-muted hover:text-fg shrink-0" aria-label="Fechar"><X size={16} /></button>
    </div>
  );
}
