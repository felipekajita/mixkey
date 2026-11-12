"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun, Library, Wand2, ListOrdered, Database, ChevronRight, HardDriveDownload } from "lucide-react";
import { useStore } from "@/lib/store";
import { resumePending } from "@/lib/pipeline";
import AddTracks from "./AddTracks";
import TrackTable from "./TrackTable";
import Suggestions from "./Suggestions";
import Builder from "./Builder";
import Results from "./Results";
import { Button, Modal, Toast, cn } from "./ui";
import BackupModal from "./BackupModal";

interface SrcStatus { id: string; label: string; kind: string; provides: string[]; enabled: boolean }

export default function App() {
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const tracks = useStore((s) => s.tracks);
  const sequences = useStore((s) => s.sequences);
  const [hydrated, setHydrated] = useState(false);
  const [dark, setDark] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [srcOpen, setSrcOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [sources, setSources] = useState<SrcStatus[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const done = () => { setHydrated(true); resumePending(); };
    if (useStore.persist.hasHydrated()) done();
    else return useStore.persist.onFinishHydration(done);
  }, []);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((d) => setSources(d.sources)).catch(() => {});
  }, []);

  function toggleTheme() {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("mk-theme", d ? "dark" : "light"); } catch {}
  }

  const steps = [
    { label: "Biblioteca", icon: Library, badge: tracks.length || undefined },
    { label: "Montar set", icon: Wand2 },
    { label: "Sequências", icon: ListOrdered, badge: sequences.length || undefined },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl grad-bg flex items-center justify-center text-white font-black text-sm">MK</div>
            <div className="leading-tight">
              <div className="font-bold text-lg">Mix<span className="grad-text">Key</span></div>
              <div className="text-[11px] text-muted hidden sm:block">Sets harmônicos para Rekordbox</div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1 mx-auto">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <button onClick={() => setStep(i as 0 | 1 | 2)} className={cn("flex items-center gap-2 h-9 px-3 rounded-xl text-sm font-medium transition", step === i ? "bg-panel2 text-fg" : "text-muted hover:text-fg")}>
                  <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs", step === i ? "grad-bg text-white" : "bg-panel2 border border-line")}>{i + 1}</span>
                  {s.label}
                  {s.badge && <span className="text-xs rounded-full bg-accent/15 text-accent px-1.5">{s.badge}</span>}
                </button>
                {i < 2 && <ChevronRight size={16} className="text-line" />}
              </div>
            ))}
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setBackupOpen(true)} title="Backup do projeto"><HardDriveDownload size={16} /><span className="hidden sm:inline">Backup</span></Button>
            <Button variant="ghost" size="sm" onClick={() => setSrcOpen(true)} title="Fontes de dados"><Database size={16} /><span className="hidden sm:inline">Fontes</span></Button>
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Alternar tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</Button>
          </div>
        </div>
        {/* navegação mobile */}
        <div className="md:hidden grid grid-cols-3 border-t border-line">
          {steps.map((s, i) => (
            <button key={s.label} onClick={() => setStep(i as 0 | 1 | 2)} className={cn("h-11 flex items-center justify-center gap-1.5 text-xs font-medium", step === i ? "text-accent border-b-2 border-accent" : "text-muted")}>
              <s.icon size={15} /> {s.label}{s.badge ? ` (${s.badge})` : ""}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {!hydrated ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}</div>
        ) : step === 0 ? (
          <div className="space-y-4">
            {!tracks.length && (
              <div className="text-center py-6 sm:py-10">
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Monte sets que <span className="grad-text">fluem</span>.</h1>
                <p className="text-muted mt-3 max-w-2xl mx-auto">Envie músicas ou uma lista. O MixKey identifica <b>key (Camelot)</b> e <b>BPM</b>, cruza com Deezer, Spotify, Apple Music, YouTube Music e outras plataformas, busca as capas e sugere a melhor ordem para mixar, conforme a vibe que você quer.</p>
              </div>
            )}
            <AddTracks notify={notify} />
            <TrackTable />
            <Suggestions notify={notify} />
            {tracks.length >= 2 && (
              <div className="flex justify-end">
                <Button variant="primary" size="lg" onClick={() => setStep(1)}>Montar set <ChevronRight size={18} /></Button>
              </div>
            )}
          </div>
        ) : step === 1 ? (
          <Builder notify={notify} />
        ) : (
          <Results notify={notify} />
        )}
      </main>

      <footer className="border-t border-line text-xs text-muted">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span>MixKey · análise de áudio local com <a className="underline" href="https://mtg.github.io/essentia.js/" target="_blank" rel="noreferrer">Essentia.js</a> (AGPL-3.0) e IA <a className="underline" href="https://github.com/rekordcloud/openkeyscan-analyzer" target="_blank" rel="noreferrer">OpenKeyScan</a> (MIT) · <a className="underline" href={process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com"} target="_blank" rel="noreferrer">código-fonte</a></span>
          <span>Dados de BPM/key: ReccoBeats, SongBPM, Deezer, MusicBrainz</span>
        </div>
      </footer>

      <Modal open={srcOpen} onClose={() => setSrcOpen(false)} title="Fontes de dados">
        <p className="text-sm text-muted mb-3">Cada faixa é buscada em todas as fontes ativas. Os resultados só são usados quando o nome encontrado confere com o seu (título + artista), e key/BPM são decididos por votação.</p>
        <div className="divide-y divide-line/70 text-sm">
          <div className="flex items-center justify-between py-2"><span>Análise do áudio (Essentia, no navegador)</span><span className="text-emerald-400">ativa</span></div>
          <div className="flex items-center justify-between py-2"><span>Tags do arquivo (TKEY/TBPM/capa)</span><span className="text-emerald-400">ativa</span></div>
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 gap-2">
              <span>{s.label} <span className="text-xs text-muted">· {s.kind === "scrape" ? "site" : "API"} · {s.provides.join(", ")}</span></span>
              <span className={s.enabled ? "text-emerald-400" : "text-muted"}>{s.enabled ? "ativa" : "sem chave"}</span>
            </div>
          ))}
        </div>
      </Modal>
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} notify={notify} />
      <Toast msg={toast} />
    </div>
  );
}
