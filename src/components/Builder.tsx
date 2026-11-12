"use client";
import { useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { VIBES, ENDINGS, targetCurve, type VibePreset } from "@/lib/sequencer/presets";
import { buildSequences } from "@/lib/sequencer";
import { Button, Card, Field, Switch, inputCls, cn } from "./ui";

export function CurveSvg({ vibe, ending = "default", w = 120, h = 40, className }: { vibe: VibePreset; ending?: any; w?: number; h?: number; className?: string }) {
  const f = targetCurve(vibe, ending);
  const pts = Array.from({ length: 40 }, (_, i) => { const t = i / 39; return `${(t * w).toFixed(1)},${(h - 3 - f(t) * (h - 6)).toFixed(1)}`; });
  const id = `g-${vibe.id}-${ending}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className}>
      <defs>
        <linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="rgb(var(--accent))" /><stop offset="1" stopColor="rgb(var(--accent2))" /></linearGradient>
        <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--accent))" stopOpacity=".35" /><stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" /></linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#${id}-f)`} />
      <polyline points={pts.join(" ")} fill="none" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Builder({ notify }: { notify: (m: string) => void }) {
  const o = useStore((s) => s.options);
  const set = useStore((s) => s.setOptions);
  const tracks = useStore((s) => s.tracks);
  const setSequences = useStore((s) => s.setSequences);
  const setStep = useStore((s) => s.setStep);
  const [busy, setBusy] = useState(false);
  const vibe = VIBES.find((v) => v.id === o.vibeId) ?? VIBES[0];
  const ready = tracks.filter((t) => t.status === "done" || t.key || t.bpm);
  const missing = tracks.filter((t) => !t.key || !t.bpm).length;

  function generate() {
    if (tracks.length < 2) return notify("Adicione pelo menos 2 faixas.");
    setBusy(true);
    setTimeout(() => {
      try {
        const r = buildSequences(tracks, o);
        setSequences(r);
        setStep(2);
        notify(`${r.length} sequência(s) gerada(s)`);
      } finally {
        setBusy(false);
      }
    }, 30);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-lg">1. Escolha a vibe</h2>
        <p className="text-sm text-muted mb-4">A vibe define a curva de energia ao longo do set.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {VIBES.map((v) => (
            <button key={v.id} onClick={() => set({ vibeId: v.id })}
              className={cn("text-left rounded-2xl border p-4 transition", o.vibeId === v.id ? "border-accent bg-accent/10 glow" : "border-line hover:border-accent/50 bg-panel2/40")}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{v.emoji} {v.name}</div>
                <CurveSvg vibe={v} w={90} h={32} />
              </div>
              <p className="text-sm mt-2">{v.description}</p>
              <p className="text-xs text-muted mt-1.5">Ideal para: {v.situations}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-lg">2. Como o set termina?</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          {ENDINGS.map((e) => (
            <button key={e.id} onClick={() => set({ ending: e.id })}
              className={cn("rounded-xl border p-3 text-left transition", o.ending === e.id ? "border-accent bg-accent/10" : "border-line hover:border-accent/50")}>
              <CurveSvg vibe={vibe} ending={e.id} w={100} h={28} className="mb-1.5 w-full" />
              <div className="text-sm font-medium">{e.name}</div>
              <div className="text-xs text-muted">{e.description}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-lg mb-4">3. Ajustes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label={`Tolerância de pitch: ±${Math.round(o.maxPitch * 100)}%`} hint="Quanto você aceita acelerar/desacelerar uma faixa. 3–6% é o comum.">
            <input type="range" min={0.02} max={0.12} step={0.01} value={o.maxPitch} onChange={(e) => set({ maxPitch: +e.target.value })} className="w-full" />
          </Field>
          <Field label="Prioridade" hint="Mais à esquerda segue a curva de energia; à direita, prioriza transições harmônicas perfeitas.">
            <div className="flex items-center gap-3 text-xs text-muted">
              Energia<input type="range" min={0.3} max={2.5} step={0.1} value={o.harmonicWeight} onChange={(e) => set({ harmonicWeight: +e.target.value })} className="flex-1" />Harmonia
            </div>
          </Field>
          <Field label="Tamanho do set">
            <div className="flex gap-2">
              <select className={inputCls} value={o.length.mode} onChange={(e) => set({ length: { ...o.length, mode: e.target.value as any } })}>
                <option value="all">Usar todas as faixas</option>
                <option value="count">Nº de faixas</option>
                <option value="minutes">Duração (min)</option>
              </select>
              {o.length.mode !== "all" && (
                <input type="number" min={2} className={cn(inputCls, "w-28")} value={o.length.value} onChange={(e) => set({ length: { ...o.length, value: +e.target.value } })} />
              )}
            </div>
          </Field>
          <Field label="Quantas sequências gerar">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => set({ count: n })} className={cn("w-10 h-10 rounded-xl border font-semibold", o.count === n ? "border-accent bg-accent/15 text-accent" : "border-line")}>{n}</button>
              ))}
            </div>
          </Field>
          <Field label="Progressão de BPM">
            <select className={inputCls} value={o.bpmTrend} onChange={(e) => set({ bpmTrend: e.target.value as any })}>
              <option value="free">Livre</option>
              <option value="rising">Subindo ao longo do set</option>
              <option value="falling">Descendo ao longo do set</option>
              <option value="stable">O mais estável possível</option>
            </select>
          </Field>
          <Field label="Faixa de abertura / encerramento (opcional)">
            <div className="flex gap-2">
              <select className={inputCls} value={o.startTrackId ?? ""} onChange={(e) => set({ startTrackId: e.target.value || undefined })}>
                <option value="">Abertura: automática</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.artist ? ` – ${t.artist}` : ""}</option>)}
              </select>
              <select className={inputCls} value={o.endTrackId ?? ""} onChange={(e) => set({ endTrackId: e.target.value || undefined })}>
                <option value="">Final: automático</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.artist ? ` – ${t.artist}` : ""}</option>)}
              </select>
            </div>
          </Field>
          <div className="space-y-3 md:col-span-2">
            <Switch checked={o.avoidSameArtist} onChange={(v) => set({ avoidSameArtist: v })} label="Evitar o mesmo artista em sequência" />
            <Switch checked={o.distinct} onChange={(v) => set({ distinct: v })} label={<span>Sets independentes <span className="text-muted">— cada sequência usa faixas diferentes (ex.: dividir a biblioteca em Warm-up e Peak). Combine com “Tamanho do set”.</span></span>} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4">
        <div className="text-sm text-muted">
          {tracks.length} faixas na biblioteca · {ready.length} prontas
          {missing > 0 && <span className="text-amber-400"> · {missing} sem key ou BPM (entram com custo neutro)</span>}
        </div>
        <Button variant="primary" size="lg" onClick={generate} disabled={busy || tracks.length < 2}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />} Gerar sequências
        </Button>
      </div>
    </div>
  );
}
