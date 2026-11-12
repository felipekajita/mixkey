"use client";
import { useMemo, useState } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Download, Copy, MonitorPlay, Save, FileSpreadsheet, Lightbulb, Trash2, Wand2, ChevronLeft, ChevronRight, X, ListMusic, LayoutGrid } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Track } from "@/lib/types";
import { rescoreSequence, findBridges, buildSequences, setAdjustments, orderStats, type SequenceResult, type Transition } from "@/lib/sequencer";
import { formatDuration } from "@/lib/bpm";
import { camelotToMusical } from "@/lib/camelot";
import { toM3U8, toText, toCSV, toRekordboxXml, download } from "@/lib/export";
import { Button, Card, Modal, Tabs, inputCls, cn } from "./ui";
import { Cover, KeyBadge, EnergyBar, ScorePill } from "./bits";
import CamelotWheel from "./CamelotWheel";
import EnergyChart from "./EnergyChart";

export default function Results({ notify }: { notify: (m: string) => void }) {
  const { sequences, activeSeq, setActiveSeq, tracks, options, updateSequence, saveSet, saved, deleteSaved, setSequences, setStep } = useStore();
  const [view, setView] = useState<"timeline" | "grid">("timeline");
  const [booth, setBooth] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [undo, setUndo] = useState<{ seqId: string; ids: string[] } | null>(null);
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const seq = sequences[activeSeq];

  // reotimização do set inteiro priorizando harmonia (mantém a 1ª faixa); só oferece se reduzir conflitos
  const harmonicFix = useMemo(() => {
    if (!seq || seq.trackIds.length < 4) return null;
    const ts = seq.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
    const r = buildSequences(ts, { ...options, count: 1, harmonicWeight: Math.max(2.5, options.harmonicWeight), startTrackId: ts[0].id, endTrackId: undefined, length: { mode: "all", value: 0 }, distinct: false })[0];
    if (!r) return null;
    const before = orderStats(seq.trackIds, byId, options.maxPitch), after = orderStats(r.trackIds, byId, options.maxPitch);
    return after.conflicts + after.risky < before.conflicts + before.risky ? { ids: r.trackIds, before, after } : null;
  }, [seq, byId, options]);
  if (!seq) {
    return (
      <Card className="p-10 text-center">
        <p className="text-muted">Nenhuma sequência gerada ainda.</p>
        <Button className="mt-4" variant="primary" onClick={() => setStep(1)}><Wand2 size={16} /> Montar set</Button>
        {saved.length > 0 && <SavedList />}
      </Card>
    );
  }
  const list = seq.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);

  function reorder(ids: string[]) {
    updateSequence(activeSeq, rescoreSequence({ ...seq, trackIds: ids }, byId, options.maxPitch));
  }

  function reoptimizeFrom(i: number) {
    const fixed = seq.trackIds.slice(0, i + 1);
    const rest = seq.trackIds.slice(i + 1).map((id) => byId.get(id)!).filter(Boolean);
    const anchor = byId.get(seq.trackIds[i])!;
    const r = buildSequences([anchor, ...rest], { ...options, count: 1, startTrackId: anchor.id, endTrackId: undefined, length: { mode: "all", value: 0 }, distinct: false })[0];
    if (r) { reorder([...fixed, ...r.trackIds.slice(1)]); notify("Restante do set reotimizado"); }
  }

  function insertBridge(i: number, t: Track) {
    const ids = [...seq.trackIds];
    ids.splice(i + 1, 0, t.id);
    reorder(ids);
    notify(`“${t.title}” inserida como ponte`);
  }

  const inSet = new Set(seq.trackIds);
  const adjustments = setAdjustments(seq, byId, options.maxPitch, tracks);
  function applyOrder(ids: string[], msg: string) {
    setUndo({ seqId: seq.id, ids: seq.trackIds });
    reorder(ids);
    notify(msg);
  }
  function removeFromSet(ids: string[]) {
    const prev = seq.trackIds;
    setUndo({ seqId: seq.id, ids: prev });
    reorder(prev.filter((x) => !ids.includes(x)));
    notify(ids.length > 1 ? `${ids.length} faixas retiradas do set (continuam na biblioteca)` : "Faixa retirada do set (continua na biblioteca)");
  }

  return (
    <div className="space-y-4">
      {/* abas de sets */}
      <div className="flex flex-wrap gap-2">
        {sequences.map((s, i) => (
          <button key={s.id} onClick={() => setActiveSeq(i)} className={cn("rounded-2xl border px-4 py-2.5 text-left transition", i === activeSeq ? "border-accent bg-accent/10 glow" : "border-line bg-panel hover:border-accent/50")}>
            <div className="text-sm font-semibold flex items-center gap-2">{s.name.split(" · ")[0]} <ScorePill score={s.score} /></div>
            <div className="text-xs text-muted">{s.trackIds.length} faixas · {formatDuration(s.totalSec)}</div>
          </button>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <input className="bg-transparent text-xl font-semibold outline-none w-full" value={seq.name} onChange={(e) => updateSequence(activeSeq, { ...seq, name: e.target.value })} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted mt-1">
              <span>{list.length} faixas · {formatDuration(seq.totalSec)}</span>
              <span className="text-emerald-400">{seq.stats.perfect} perfeitas</span>
              <span className="text-sky-400">{seq.stats.ok} boas</span>
              <span className="text-amber-400">{seq.stats.risky} arriscadas</span>
              <span className="text-red-400">{seq.stats.clash} conflitos</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setBooth(true)}><MonitorPlay size={16} /> Modo cabine</Button>
            <Button onClick={() => setExportOpen(true)}><Download size={16} /> Exportar</Button>
            <Button onClick={() => { saveSet({ id: seq.id, name: seq.name, savedAt: Date.now(), seq, tracks: list }); notify("Set salvo neste navegador"); }}><Save size={16} /> Salvar</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4 min-w-0">
        {(adjustments.length > 0 || (undo && undo.seqId === seq.id)) && (
          <Card className="p-3 sm:p-4 border-amber-500/40">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold">Ajustes sugeridos</h3>
              <div className="flex gap-2">
                {undo && undo.seqId === seq.id && <Button size="sm" variant="ghost" onClick={() => { reorder(undo.ids); setUndo(null); notify("Remoção desfeita"); }}>↶ Desfazer remoção</Button>}
                {harmonicFix && (
                  <Button size="sm" variant="primary" onClick={() => applyOrder(harmonicFix.ids, "Set reotimizado priorizando harmonia")} title="Refaz a ordem mantendo a primeira faixa">
                    <Wand2 size={13} /> Reotimizar priorizando harmonia ({harmonicFix.before.conflicts + harmonicFix.before.risky} → {harmonicFix.after.conflicts + harmonicFix.after.risky} problemas)
                  </Button>
                )}
                {adjustments.filter((a) => a.kind === "remove").length > 1 && (
                  <Button size="sm" variant="danger" onClick={() => removeFromSet(adjustments.filter((a) => a.kind === "remove").map((a) => a.trackId))}>Retirar todas as sugeridas ({adjustments.filter((a) => a.kind === "remove").length})</Button>
                )}
              </div>
            </div>
            {adjustments.length === 0 && <p className="text-sm text-muted">Nenhum ajuste pendente.</p>}
            <div className="divide-y divide-line/70">
              {adjustments.map((a) => {
                const t = byId.get(a.trackId);
                if (!t) return null;
                if (a.kind === "conflict" && a.conflict) {
                  const f = a.conflict;
                  const from = byId.get(f.fromId), to = byId.get(f.toId);
                  const fromIdx = seq.trackIds.indexOf(f.fromId);
                  return (
                    <div key={`c-${f.fromId}-${f.toId}`} className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Cover src={from?.coverUrl} size={32} /><span className="text-muted">→</span><Cover src={to?.coverUrl} size={32} />
                        <div className="min-w-0 flex-1 text-xs text-red-400">⚠ Conflito: {a.reason}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 pl-0 sm:pl-[5.5rem]">
                        {f.move && <Button size="sm" variant="primary" onClick={() => applyOrder(f.move!.ids, "Faixa movida")}><Wand2 size={13} /> {f.move.label} <span className="opacity-80">(resolve {f.move.fixed})</span></Button>}
                        {f.bridges.slice(0, 2).map((bid) => { const b = byId.get(bid); return b ? <Button key={bid} size="sm" onClick={() => { setUndo({ seqId: seq.id, ids: seq.trackIds }); insertBridge(fromIdx, b); }}>+ Ponte: {b.title} ({b.key} · {b.bpm})</Button> : null; })}
                        {f.removals.map((r) => { const rt = byId.get(r.trackId); return rt ? <Button key={r.trackId} size="sm" variant="ghost" onClick={() => removeFromSet([r.trackId])}><X size={13} /> Retirar “{rt.title}” {r.gain > 0.05 ? <span className="text-emerald-400">(+{r.gain.toFixed(1)})</span> : null}</Button> : null; })}
                        {!f.move && !f.bridges.length && <span className="text-[11px] text-muted self-center">Nenhuma faixa sozinha resolve movendo de lugar e não há faixa ponte na biblioteca.{harmonicFix ? " Tente “Reotimizar priorizando harmonia”." : " Se mantiver, faça uma transição curta (corte/eco)."}</span>}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={a.trackId} className="flex items-center gap-3 py-2">
                    <Cover src={t.coverUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.title} <span className="text-muted font-normal">– {t.artist}</span></div>
                      <div className={cn("text-xs", a.kind === "remove" ? "text-amber-400" : "text-muted")}>{a.kind === "remove" ? "⚠ " : "↻ "}{a.reason}</div>
                    </div>
                    {a.kind === "remove"
                      ? <Button size="sm" onClick={() => removeFromSet([a.trackId])}><X size={14} /> Retirar do set</Button>
                      : <Button size="sm" onClick={() => reoptimizeFrom(0)}><Wand2 size={14} /> Reotimizar</Button>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <Card className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-semibold">Ordem de reprodução</h3>
            <Tabs value={view} onChange={setView} items={[{ id: "timeline", label: <><ListMusic size={14} /> Lista</> }, { id: "grid", label: <><LayoutGrid size={14} /> Capas</> }]} />
          </div>
          {view === "timeline" ? (
            <Timeline seq={seq} list={list} onReorder={reorder} onReopt={reoptimizeFrom} library={tracks} inSet={inSet} onBridge={insertBridge} maxPitch={options.maxPitch} onRemove={(id) => reorder(seq.trackIds.filter((x) => x !== id))} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {list.map((t, i) => (
                <div key={t.id} className="relative">
                  <Cover src={t.coverUrl} size={300} className="w-full h-auto aspect-square rounded-xl" />
                  <div className="absolute top-2 left-2 rounded-lg bg-black/70 text-white text-xs font-bold px-2 py-1">{i + 1}</div>
                  <div className="absolute top-2 right-2"><KeyBadge k={t.key} size="sm" /></div>
                  <div className="mt-1.5 text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted truncate">{t.artist} · {t.bpm ?? "?"} BPM</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Curva de energia</h3>
            <EnergyChart tracks={list} targets={seq.targets} />
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Caminho na roda Camelot</h3>
            <CamelotWheel path={list.map((t) => t.key)} steps={list.map((t) => ({ key: t.key, title: `${t.title} – ${t.artist}` }))} transitions={seq.transitions} />
          </Card>
          <Card className="p-4 text-sm space-y-1.5">
            <h3 className="font-semibold mb-1">Legenda das transições</h3>
            <div><b>=</b> mesmo tom · <b>↗/↘</b> ±1 na roda · <b>↕</b> relativa (A↔B)</div>
            <div><b>⚡</b> energy boost (+2) · <b>⤴</b> modulação +1 semitom</div>
            <div><b>⚠</b> conflito: use cortes rápidos ou efeitos</div>
          </Card>
        </div>
      </div>

      {saved.length > 0 && <SavedList />}

      {booth && <Booth list={list} seq={seq} onClose={() => setBooth(false)} />}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} seq={seq} list={list} notify={notify} />
    </div>
  );

  function SavedList() {
    return (
      <Card className="p-4 mt-4 text-left">
        <h3 className="font-semibold mb-2">Sets salvos</h3>
        <div className="divide-y divide-line/70">
          {saved.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2">
              <div className="flex -space-x-3">{s.tracks.slice(0, 4).map((t) => <Cover key={t.id} src={t.coverUrl} size={32} className="ring-2 ring-panel" />)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted">{s.tracks.length} faixas · {new Date(s.savedAt).toLocaleString("pt-BR")}</div>
              </div>
              <Button size="sm" onClick={() => {
                const st = useStore.getState();
                const have = new Set(st.tracks.map((t) => t.id));
                st.addTracks(s.tracks.filter((t) => !have.has(t.id)));
                setSequences([s.seq, ...sequences.filter((x) => x.id !== s.seq.id)]);
                setStep(2);
              }}>Abrir</Button>
              <button className="text-muted hover:text-red-400" onClick={() => deleteSaved(s.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </Card>
    );
  }
}

function TransitionChip({ tr }: { tr: Transition }) {
  const color = tr.score >= 90 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : tr.score >= 70 ? "text-sky-400 border-sky-500/30 bg-sky-500/10" : tr.score >= 40 ? "text-amber-400 border-amber-500/30 bg-amber-500/10" : "text-red-400 border-red-500/30 bg-red-500/10";
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border px-3 py-1 text-xs", color)} title={tr.tip}>
      <b className="text-sm leading-none">{tr.key.icon}</b> {tr.key.label}
      <span className="opacity-70">·</span> BPM {tr.bpm.label}
      {Math.abs(tr.energyDelta) >= 0.5 && <><span className="opacity-70">·</span> energia {tr.energyDelta > 0 ? "▲" : "▼"}{Math.abs(tr.energyDelta).toFixed(1)}</>}
    </div>
  );
}

function Timeline(p: { seq: SequenceResult; list: Track[]; onReorder: (ids: string[]) => void; onReopt: (i: number) => void; library: Track[]; inSet: Set<string>; onBridge: (i: number, t: Track) => void; maxPitch: number; onRemove: (id: string) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = p.list.map((t) => t.id);
    p.onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={p.list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div>
          {p.list.map((t, i) => {
            const tr = i > 0 ? p.seq.transitions[i - 1] : undefined;
            const bridges = tr && tr.score < 55 ? findBridges(p.list[i - 1], t, p.library, p.maxPitch, p.inSet) : [];
            return (
              <div key={t.id}>
                {tr && (
                  <div className="flex flex-col items-start gap-1 pl-10 sm:pl-14 py-1.5 relative">
                    <div className="absolute left-[1.6rem] sm:left-[2.35rem] top-0 bottom-0 w-px bg-line" />
                    <TransitionChip tr={tr} />
                    <div className="text-xs text-muted flex items-start gap-1"><Lightbulb size={12} className="mt-0.5 shrink-0" /> {tr.tip}</div>
                    {bridges.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted">Faixa ponte sugerida:</span>
                        {bridges.map((b) => (
                          <button key={b.id} onClick={() => p.onBridge(i - 1, b)} className="rounded-full border border-accent/40 text-accent px-2 py-0.5 hover:bg-accent/10">+ {b.title} ({b.key} · {b.bpm})</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Row t={t} i={i} onReopt={() => p.onReopt(i)} onRemove={() => p.onRemove(t.id)} last={i === p.list.length - 1} />
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Row({ t, i, onReopt, onRemove, last }: { t: Track; i: number; onReopt: () => void; onRemove: () => void; last: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 sm:gap-3 rounded-xl border border-line bg-panel2/50 p-2 group", isDragging && "relative z-10 shadow-2xl border-accent")}>
      <button {...attributes} {...listeners} className="text-muted cursor-grab active:cursor-grabbing touch-none" aria-label="Arrastar"><GripVertical size={18} /></button>
      <span className="w-6 text-center text-sm font-bold tabular-nums text-muted">{i + 1}</span>
      <Cover src={t.coverUrl} size={52} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{t.title}</div>
        <div className="text-sm text-muted truncate">{t.artist}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2"><KeyBadge k={t.key} size="sm" /><span className="text-sm tabular-nums w-12 text-right">{t.bpm ?? "—"}</span></div>
        <div className="hidden sm:block"><EnergyBar v={t.energy} /></div>
      </div>
      <div className="flex flex-col opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
        {!last && <button onClick={onReopt} title="Reotimizar o restante a partir desta faixa" className="text-muted hover:text-accent p-1"><Wand2 size={15} /></button>}
        <button onClick={onRemove} title="Tirar do set" className="text-muted hover:text-red-400 p-1"><X size={15} /></button>
      </div>
    </div>
  );
}

function Booth({ list, seq, onClose }: { list: Track[]; seq: SequenceResult; onClose: () => void }) {
  const [i, setI] = useState(0);
  const t = list[i], next = list[i + 1], tr = seq.transitions[i];
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col p-4 sm:p-8" onKeyDown={(e) => { if (e.key === "ArrowRight") setI(Math.min(list.length - 1, i + 1)); if (e.key === "ArrowLeft") setI(Math.max(0, i - 1)); if (e.key === "Escape") onClose(); }} tabIndex={0} ref={(el) => el?.focus()}>
      <div className="flex items-center justify-between">
        <div className="text-muted text-sm">{seq.name} · faixa {i + 1}/{list.length}</div>
        <Button variant="ghost" onClick={onClose}><X size={18} /> Sair</Button>
      </div>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-center py-6">
        <div className="flex flex-col items-center text-center">
          <div className="text-xs uppercase tracking-widest text-accent mb-3">Tocando agora</div>
          <Cover src={t.coverUrl} size={280} className="rounded-2xl shadow-2xl w-[55vw] h-[55vw] max-w-[280px] max-h-[280px]" />
          <div className="text-2xl sm:text-4xl font-bold mt-4">{t.title}</div>
          <div className="text-lg sm:text-xl text-muted">{t.artist}</div>
          <div className="flex items-center gap-4 mt-4"><KeyBadge k={t.key} size="lg" /><span className="text-3xl font-bold tabular-nums">{t.bpm ?? "—"}<span className="text-base text-muted"> BPM</span></span></div>
          <div className="text-muted mt-1">{camelotToMusical(t.key)} · energia {t.energy ?? "?"}</div>
        </div>
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
          {next ? (
            <>
              <div className="text-xs uppercase tracking-widest text-muted mb-3">Próxima</div>
              <div className="flex items-center gap-4">
                <Cover src={next.coverUrl} size={110} className="rounded-xl" />
                <div className="text-left">
                  <div className="text-xl sm:text-2xl font-semibold">{next.title}</div>
                  <div className="text-muted">{next.artist}</div>
                  <div className="flex items-center gap-3 mt-2"><KeyBadge k={next.key} size="md" /><span className="text-xl font-semibold tabular-nums">{next.bpm ?? "—"} BPM</span></div>
                </div>
              </div>
              {tr && (
                <div className="mt-6 space-y-2">
                  <TransitionChip tr={tr} />
                  <div className="text-base sm:text-lg max-w-md">{tr.tip}</div>
                </div>
              )}
            </>
          ) : <div className="text-2xl font-semibold text-muted">🎉 Última faixa do set</div>}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button size="lg" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}><ChevronLeft /> Anterior</Button>
        <Button size="lg" variant="primary" onClick={() => setI(Math.min(list.length - 1, i + 1))} disabled={i === list.length - 1}>Próxima <ChevronRight /></Button>
      </div>
      <div className="flex gap-1 mt-4">{list.map((x, j) => <button key={x.id} onClick={() => setI(j)} className={cn("h-1.5 flex-1 rounded-full", j < i ? "bg-accent/60" : j === i ? "grad-bg" : "bg-line")} />)}</div>
    </div>
  );
}

function ExportModal({ open, onClose, seq, list, notify }: { open: boolean; onClose: () => void; seq: SequenceResult; list: Track[]; notify: (m: string) => void }) {
  const [folder, setFolder] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("mk-folder") ?? "" : ""));
  const safe = seq.name.replace(/[^\w\s-]/g, "").trim() || "set";
  const missing = list.filter((t) => !t.fileName).length;
  return (
    <Modal open={open} onClose={onClose} title="Exportar set">
      <div className="space-y-4">
        <div>
          <div className="font-medium mb-1">Pasta das músicas no seu computador</div>
          <input className={inputCls} placeholder="ex.: D:\Musicas\House  ou  /Users/voce/Music" value={folder} onChange={(e) => { setFolder(e.target.value); try { localStorage.setItem("mk-folder", e.target.value); } catch {} }} />
          {missing > 0 && <p className="text-xs text-amber-400 mt-1">{missing} faixa(s) vieram de lista/link (sem arquivo); o arquivo presumido será “Título - Artista.mp3”. Se o nome for outro, use “Relocate” no Rekordbox.</p>}
        </div>
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
          <div className="font-medium">XML do Rekordbox <span className="text-xs text-accent">recomendado</span></div>
          <p className="text-sm text-muted mt-1 mb-2">Cria a playlist na ordem do set já com <b>BPM</b>, <b>tom</b> e um <b>comentário</b> em cada faixa (posição no set e dica da próxima transição).</p>
          <ol className="text-xs text-muted list-decimal pl-4 space-y-0.5 mb-3">
            <li>No Rekordbox: <b>Preferências → Avançado → Banco de dados → rekordbox xml</b> → escolha este arquivo.</li>
            <li>Ative a árvore “rekordbox xml” em <b>Preferências → Visualização → Layout</b>, se ela não aparecer.</li>
            <li>Na barra lateral, abra <b>rekordbox xml → Playlists</b>, clique com o botão direito no set → <b>Importar playlist</b>.</li>
          </ol>
          <Button variant="primary" onClick={() => { download(`${safe}.xml`, toRekordboxXml(seq, list, folder), "application/xml"); notify("XML do Rekordbox baixado"); }}><Download size={16} /> Baixar XML do Rekordbox</Button>
        </div>
        <div>
          <div className="font-medium">Playlist M3U8</div>
          <p className="text-sm text-muted mt-1 mb-2">Só a ordem das faixas. No Rekordbox: <b>Arquivo → Importar → Importar playlist</b> (ou arraste o .m3u8 para “Playlists”).</p>
          <Button onClick={() => { download(`${safe}.m3u8`, toM3U8(seq, list, folder), "audio/x-mpegurl"); notify("M3U8 baixado"); }}><Download size={16} /> Baixar .m3u8</Button>
        </div>
        <div className="border-t border-line pt-4 flex flex-wrap gap-2">
          <Button onClick={() => { navigator.clipboard.writeText(toText(seq, list)); notify("Setlist copiada"); }}><Copy size={16} /> Copiar setlist (texto)</Button>
          <Button onClick={() => download(`${safe}.csv`, toCSV(seq, list), "text/csv")}><FileSpreadsheet size={16} /> Planilha CSV</Button>
        </div>
      </div>
    </Modal>
  );
}
