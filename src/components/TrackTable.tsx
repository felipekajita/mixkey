"use client";
import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Trash2, ExternalLink, AlertCircle, Search, Play, Pause } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Track } from "@/lib/types";
import { Button, Card, Modal, inputCls, fieldCls, cn } from "./ui";
import { Cover, KeyBadge, ConfDot, EnergyBar } from "./bits";
import { formatDuration, normalizeBpm } from "@/lib/bpm";
import { ALL_CAMELOT, camelotToMusical, camelotToOpenKey } from "@/lib/camelot";
import { reprocess } from "@/lib/pipeline";
import { usable, verifyLinks } from "@/lib/consensus";
import { usePreview } from "./usePreview";

type SortKey = "added" | "key" | "bpm" | "energy" | "artist";

export default function TrackTable() {
  const tracks = useStore((s) => s.tracks);
  const removeTrack = useStore((s) => s.removeTrack);
  const clear = useStore((s) => s.clearTracks);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("added");
  const [q, setQ] = useState("");
  const { playing, toggle } = usePreview();

  const busy = tracks.filter((t) => t.status !== "done" && t.status !== "error").length;
  const list = useMemo(() => {
    let l = tracks.filter((t) => !q || `${t.artist} ${t.title}`.toLowerCase().includes(q.toLowerCase()));
    const num = (k?: string) => (k ? parseInt(k) * 2 + (k.endsWith("B") ? 1 : 0) : 99);
    if (sort === "key") l = [...l].sort((a, b) => num(a.key) - num(b.key));
    if (sort === "bpm") l = [...l].sort((a, b) => (a.bpm ?? 999) - (b.bpm ?? 999));
    if (sort === "energy") l = [...l].sort((a, b) => (a.energy ?? 0) - (b.energy ?? 0));
    if (sort === "artist") l = [...l].sort((a, b) => a.artist.localeCompare(b.artist));
    return l;
  }, [tracks, sort, q]);

  if (!tracks.length) return null;
  const sel = tracks.find((t) => t.id === open);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 justify-between p-4 border-b border-line">
        <div>
          <h2 className="font-semibold text-lg">Biblioteca <span className="text-muted font-normal">· {tracks.length} faixas</span></h2>
          {busy > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted mt-0.5">
              <Loader2 size={14} className="animate-spin" /> Processando {busy}…
              <div className="w-32 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full grad-bg transition-all" style={{ width: `${((tracks.length - busy) / tracks.length) * 100}%` }} /></div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar" className={cn(fieldCls, "!h-8 pl-8 w-36")} />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={cn(fieldCls, "!h-8")}>
            <option value="added">Ordem de entrada</option>
            <option value="key">Key (Camelot)</option>
            <option value="bpm">BPM</option>
            <option value="energy">Energia</option>
            <option value="artist">Artista</option>
          </select>
          <Button size="sm" variant="danger" onClick={() => confirm("Remover todas as faixas?") && clear()}><Trash2 size={14} /> Limpar</Button>
        </div>
      </div>

      <div className="divide-y divide-line/70 max-h-[60vh] overflow-auto scroll-thin">
        {list.map((t, i) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel2/60 cursor-pointer group" onClick={() => setOpen(t.id)}>
            <span className="hidden sm:block w-6 text-xs text-muted tabular-nums text-right">{i + 1}</span>
            <div className="relative">
              <Cover src={t.coverUrl} size={44} />
              {t.previewUrl && (
                <button onClick={(e) => { e.stopPropagation(); toggle(t.previewUrl!); }} className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition text-white" aria-label="Ouvir prévia">
                  {playing === t.previewUrl ? <Pause size={18} /> : <Play size={18} />}
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{t.title}</div>
              <div className="text-sm text-muted truncate">{t.artist || <i>Artista desconhecido</i>}</div>
              {t.status !== "done" && (
                <div className={cn("text-xs flex items-center gap-1 mt-0.5", t.status === "error" ? "text-red-400" : "text-accent")}>
                  {t.status === "error" ? <AlertCircle size={12} /> : <Loader2 size={12} className="animate-spin" />}
                  {t.statusText || (t.status === "pending" ? "Na fila" : "Processando…")}
                </div>
              )}
            </div>
            <div className="hidden md:block w-14 text-sm text-muted tabular-nums">{formatDuration(t.durationSec)}</div>
            <div className="flex items-center gap-1.5 w-[4.5rem]"><KeyBadge k={t.key} size="sm" /><ConfDot c={t.keyConfidence} /></div>
            <div className="flex items-center gap-1.5 w-[4.5rem] text-sm tabular-nums">{t.bpm ?? "—"}<ConfDot c={t.bpmConfidence} /></div>
            <div className="hidden sm:block"><EnergyBar v={t.energy} /></div>
            <button className="text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition" onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }} aria-label="Remover"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {sel && <TrackDetails t={sel} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function TrackDetails({ t, onClose }: { t: Track; onClose: () => void }) {
  const update = useStore((s) => s.updateTrack);
  const links = verifyLinks(t);
  const [title, setTitle] = useState(t.title);
  const [artist, setArtist] = useState(t.artist);
  return (
    <Modal open onClose={onClose} title="Detalhes da faixa" wide>
      <div className="flex flex-col sm:flex-row gap-5">
        <Cover src={t.coverUrl} size={180} className="rounded-xl self-center sm:self-start" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
            <input className={inputCls} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artista" />
          </div>
          {(title !== t.title || artist !== t.artist) && (
            <Button size="sm" variant="primary" onClick={() => { update(t.id, { title, artist }); reprocess(t.id); }}>Salvar nome e buscar de novo</Button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">Key (Camelot)
              <select className={cn(inputCls, "mt-1")} value={t.key ?? ""} onChange={(e) => update(t.id, { key: e.target.value || undefined, manualKey: true, keyConfidence: "high" })}>
                <option value="">—</option>
                {ALL_CAMELOT.map((k) => <option key={k} value={k}>{k} · {camelotToMusical(k)}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">BPM
              <input type="number" step="0.1" className={cn(inputCls, "mt-1")} defaultValue={t.bpm} onBlur={(e) => { const b = normalizeBpm(parseFloat(e.target.value)); update(t.id, { bpm: b, manualBpm: true, bpmConfidence: b ? "high" : "none" }); }} />
            </label>
            <label className="text-xs text-muted">Energia (1–10)
              <input type="number" min={1} max={10} step="0.5" className={cn(inputCls, "mt-1")} defaultValue={t.energy} onBlur={(e) => update(t.id, { energy: Math.max(1, Math.min(10, parseFloat(e.target.value) || 5)), manualEnergy: true })} />
            </label>
          </div>
          <div className="text-xs text-muted">
            {t.key && <>Notação: {t.key} · {camelotToMusical(t.key)} · Open Key {camelotToOpenKey(t.key)} · </>}
            Duração {formatDuration(t.durationSec)}{t.genres?.length ? ` · ${t.genres.slice(0, 4).join(", ")}` : ""}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => reprocess(t.id)}><RefreshCw size={14} /> Buscar novamente</Button>
            {(t.manualKey || t.manualBpm || t.manualEnergy) && <Button size="sm" variant="ghost" onClick={() => { update(t.id, { manualKey: false, manualBpm: false, manualEnergy: false }); reprocess(t.id); }}>Desfazer edições manuais</Button>}
          </div>
        </div>
      </div>

      <h4 className="font-semibold mt-6 mb-2">Fontes consultadas (cruzamento)</h4>
      <div className="rounded-xl border border-line divide-y divide-line/70 text-sm">
        {t.readings.length === 0 && <div className="p-3 text-muted">Ainda sem dados.</div>}
        {t.readings.map((r) => {
          const ok = usable(r);
          return (
            <div key={r.source} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2", !ok && "opacity-60")}>
              <span className="w-44 font-medium">{r.label}</span>
              {r.error ? <span className="text-xs text-muted">{r.error}</span> : (
                <>
                  <KeyBadge k={r.key} size="sm" />
                  <span className="tabular-nums w-14">{r.bpm ? `${r.bpm} BPM` : "—"}</span>
                  {r.coverUrl && <Cover src={r.coverUrl} size={24} className="rounded" />}
                  {r.matchScore != null && (
                    <span className={cn("text-xs", ok ? "text-emerald-400" : "text-red-400")} title={`Encontrado: ${r.matchedArtist} - ${r.matchedTitle}`}>
                      {Math.round(r.matchScore * 100)}% {ok ? "compatível" : "nome diferente — ignorado"}
                    </span>
                  )}
                  {r.matchedTitle && <span className="text-xs text-muted truncate max-w-[16rem]">“{r.matchedArtist} – {r.matchedTitle}”</span>}
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto text-muted hover:text-accent"><ExternalLink size={14} /></a>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <h4 className="font-semibold mt-6 mb-2">Verificar manualmente</h4>
      <div className="flex flex-wrap gap-1.5">
        {[...links.keybpm, ...links.streaming].map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="text-xs rounded-full border border-line px-2.5 py-1 hover:border-accent hover:text-accent">{l.label}</a>
        ))}
      </div>
    </Modal>
  );
}
