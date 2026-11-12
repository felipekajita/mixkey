"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, MonitorSpeaker, Mic, Square, Loader2, ExternalLink } from "lucide-react";
import type { Track } from "@/lib/types";
import { startListening, analyzeListened, supportsTabAudio, supportsMic, type ListenKind, type ListenSession, type ListenResult } from "@/lib/listen";
import { addListenReading } from "@/lib/pipeline";
import { Button, Modal, cn } from "./ui";
import { KeyBadge } from "./bits";
import { camelotToMusical } from "@/lib/camelot";

type Phase = "setup" | "listening" | "analyzing" | "done" | "error";
const enc = encodeURIComponent;

export default function ListenModal({ t, open, onClose }: { t: Track; open: boolean; onClose: () => void }) {
  const tabOk = typeof window !== "undefined" && supportsTabAudio();
  const micOk = typeof window !== "undefined" && supportsMic();
  const [kind, setKind] = useState<ListenKind>(tabOk ? "tab" : "mic");
  const [maxSec, setMaxSec] = useState(90);
  const [phase, setPhase] = useState<Phase>("setup");
  const [sec, setSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<ListenResult | null>(null);
  const [rate, setRate] = useState(1);
  const session = useRef<ListenSession | null>(null);

  useEffect(() => () => session.current?.cancel(), []);
  useEffect(() => { if (!open) { session.current?.cancel(); session.current = null; setPhase("setup"); setErr(null); setRes(null); setSec(0); } }, [open]);

  async function begin() {
    setErr(null);
    try {
      session.current = await startListening(kind, {
        maxSec: Math.ceil(maxSec / rate), // tempo de música desejado ÷ velocidade
        onLevel: (r) => setLevel(r),
        onTick: (s) => setSec(s),
        onAutoStop: () => finish(),
      });
      setPhase("listening");
    } catch (e) {
      const m = (e as Error).message || "";
      setErr(
        /Permission|NotAllowed|denied/i.test(m) ? "Permissão negada ou compartilhamento cancelado. Clique em Começar de novo e permita o acesso."
        : /not supported|NotSupported/i.test(m) ? "Este navegador não permite captar o áudio de abas. Use o Chrome ou Edge no computador, ou escolha Microfone."
        : m,
      );
      setPhase("error");
    }
  }

  async function finish() {
    const s = session.current;
    if (!s) return;
    session.current = null;
    const samples = s.stop();
    setPhase("analyzing");
    try {
      const a = await analyzeListened(samples, rate);
      setRes(a);
      addListenReading(t.id, a, kind);
      setPhase("done");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
    }
  }

  const q = `${t.title} ${t.artist}`.trim();
  const musicSec = Math.round(sec * rate);
  const canStop = musicSec >= 20;
  const pct = Math.min(100, (musicSec / maxSec) * 100);
  const fmtRate = (r: number) => `${String(r).replace(".", ",")}×`;

  return (
    <Modal open={open} onClose={() => { session.current?.cancel(); onClose(); }} title={<span className="flex items-center gap-2"><Headphones size={18} /> Ouvir e analisar</span>}>
      <div className="text-sm">
        <div className="font-medium">{t.title}</div>
        <div className="text-muted mb-3">{t.artist}</div>

        {(phase === "setup" || phase === "error") && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button disabled={!tabOk} onClick={() => setKind("tab")} className={cn("rounded-xl border p-3 text-left disabled:opacity-40", kind === "tab" ? "border-accent bg-accent/10" : "border-line")}>
                <MonitorSpeaker size={18} className="mb-1" />
                <div className="font-medium">Aba do navegador</div>
                <div className="text-xs text-muted">{tabOk ? "Recomendado: som digital, sem ruído" : "Disponível no Chrome/Edge do computador"}</div>
              </button>
              <button disabled={!micOk} onClick={() => setKind("mic")} className={cn("rounded-xl border p-3 text-left disabled:opacity-40", kind === "mic" ? "border-accent bg-accent/10" : "border-line")}>
                <Mic size={18} className="mb-1" />
                <div className="font-medium">Microfone</div>
                <div className="text-xs text-muted">Música tocando em qualquer lugar (caixa de som, vinil…)</div>
              </button>
            </div>
            <ol className="text-xs text-muted list-decimal pl-4 space-y-1 mb-3">
              <li>
                Abra a música em outra aba e dê play:{" "}
                <a className="underline inline-flex items-center gap-0.5" target="_blank" rel="noreferrer" href={`https://music.youtube.com/search?q=${enc(q)}`}>YouTube Music <ExternalLink size={10} /></a>{" · "}
                <a className="underline inline-flex items-center gap-0.5" target="_blank" rel="noreferrer" href={`https://www.youtube.com/results?search_query=${enc(q)}`}>YouTube <ExternalLink size={10} /></a>{" · "}
                <a className="underline inline-flex items-center gap-0.5" target="_blank" rel="noreferrer" href={`https://open.spotify.com/search/${enc(q)}`}>Spotify <ExternalLink size={10} /></a>
              </li>
              {kind === "tab" ? (
                <li>Clique em <b>Começar</b>, escolha a <b>aba</b> da música e marque <b>“Compartilhar áudio da aba”</b>.</li>
              ) : (
                <li>Clique em <b>Começar</b> e permita o microfone. Deixe o celular/computador perto da caixa de som.</li>
              )}
              <li>Deixe tocar (de preferência a partir do início ou de uma parte com batida). O MixKey para sozinho no tempo escolhido.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
              <span className="text-muted">Velocidade em que a música está tocando</span>
              {[1, 1.25, 1.5, 2].map((r) => (
                <button key={r} onClick={() => setRate(r)} className={cn("rounded-lg border px-2.5 h-7", rate === r ? "border-accent text-accent bg-accent/10" : "border-line")}>{fmtRate(r)}</button>
              ))}
            </div>
            <p className="text-[11px] text-muted mb-3">
              Para ir mais rápido, acelere no player do YouTube (⚙ → Velocidade) — ele acelera <b>sem mudar o tom</b>, então a key continua certa e o BPM é corrigido aqui.
              Para house/techno (120–135 BPM), use até 1,5×; 2× só para faixas até ~100 BPM. {kind === "mic" && rate > 1 && "No microfone, prefira 1× ou 1,25×."}
            </p>
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-muted">Analisar</span>
              {[60, 90, 120].map((n) => (
                <button key={n} onClick={() => setMaxSec(n)} className={cn("rounded-lg border px-2.5 h-7", maxSec === n ? "border-accent text-accent bg-accent/10" : "border-line")}>{n} s</button>
              ))}
              <span className="text-muted">de música{rate > 1 && ` (≈ ${Math.ceil(maxSec / rate)} s de escuta)`}</span>
            </div>
            {err && <div className="text-red-400 text-xs mb-3">{err}</div>}
            <Button variant="primary" onClick={begin} disabled={!tabOk && !micOk}><Headphones size={16} /> Começar</Button>
            <p className="text-[11px] text-muted mt-3">O áudio não é gravado nem enviado: a análise é feita no seu navegador e as amostras são descartadas em seguida.</p>
          </>
        )}

        {phase === "listening" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-accent"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Ouvindo {kind === "tab" ? "a aba" : "o microfone"}… {rate > 1 ? `${sec}s de escuta ≈ ${musicSec}s de música a ${fmtRate(rate)}` : `${sec}s`} / {maxSec}s</div>
            <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full grad-bg transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="flex items-end gap-0.5 h-8" title="Nível do som">
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className={cn("flex-1 rounded-sm", i / 24 < Math.min(1, level * 6) ? "bg-accent" : "bg-line")} style={{ height: `${30 + (i % 4) * 15}%` }} />
              ))}
            </div>
            {level < 0.003 && sec > 3 && <div className="text-xs text-amber-400">Quase nenhum som chegando. A música está tocando{kind === "tab" ? " e o áudio da aba foi compartilhado" : ""}?</div>}
            <Button onClick={finish} disabled={!canStop}><Square size={14} /> {canStop ? "Parar e analisar" : `Parar (a partir de 20 s de música)`}</Button>
          </div>
        )}

        {phase === "analyzing" && <div className="flex items-center gap-2 text-accent py-4"><Loader2 size={16} className="animate-spin" /> Analisando {musicSec} s de música…</div>}

        {phase === "done" && res && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <KeyBadge k={res.key} size="lg" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{res.bpm ?? "—"} <span className="text-sm text-muted font-normal">BPM</span></div>
                <div className="text-xs text-muted">{camelotToMusical(res.key)} · {res.musicSec} s de música{res.rate !== 1 && ` a ${fmtRate(res.rate)}`} · {res.segments} trecho(s), key igual em {res.keyAgree}/{res.segments}</div>
              </div>
            </div>
            {res.warning && <p className="text-xs text-amber-400">⚠ {res.warning}</p>}
            <p className="text-xs text-muted">Adicionado à faixa como “Escuta ao vivo”. Ele entra na votação e aparece no Comparativo junto com as outras fontes.</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={onClose}>Concluir</Button>
              <Button variant="ghost" onClick={() => { setPhase("setup"); setRes(null); setSec(0); }}>Ouvir de novo</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
