"use client";
import { useRef, useState } from "react";
import { FileAudio, FileSpreadsheet, ClipboardPaste, UploadCloud, FolderOpen } from "lucide-react";
import { Button, Card, Tabs, cn } from "./ui";
import { AUDIO_EXT } from "@/lib/audio";
import { addAudioFiles, addParsedTracks } from "@/lib/pipeline";
import { parseListFile } from "@/lib/parsers/files";
import { parseText, type ParsedTrack } from "@/lib/parsers/text";
import { KeyBadge } from "./bits";
import { formatDuration } from "@/lib/bpm";

type Mode = "audio" | "list" | "paste";
const LIST_EXT = /\.(txt|csv|tsv|xlsx|xlsm|xls|ods|m3u8?|xml|json)$/i;

const EXAMPLE = `CamelPhat & Elderbrook - Cola
Lane 8 - Brightest Lights 8A 122
Eric Prydz - Opus | 10A | 126 | 9:03
Fred again.. - Delilah (pull me out of this)
Anyma - Eternity`;

export default function AddTracks({ notify }: { notify: (m: string) => void }) {
  const [mode, setMode] = useState<Mode>("audio");
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedTrack[] | null>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const audio = arr.filter((f) => AUDIO_EXT.test(f.name));
    const lists = arr.filter((f) => LIST_EXT.test(f.name));
    if (audio.length) notify(`${addAudioFiles(audio)} arquivo(s) de áudio adicionados — analisando…`);
    if (lists.length) {
      const parsed = (await Promise.all(lists.map((f) => parseListFile(f).catch(() => [])))).flat();
      if (parsed.length) setPreview(parsed);
      else notify("Não encontrei faixas no arquivo.");
    }
    if (!audio.length && !lists.length) notify("Formato não suportado.");
  }

  function confirmPreview() {
    if (!preview) return;
    const r = addParsedTracks(preview);
    notify(`${r.added} faixa(s) adicionadas${r.skipped ? ` · ${r.skipped} duplicada(s) ignorada(s)` : ""}`);
    setPreview(null);
    setText("");
  }

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-lg">Adicionar faixas</h2>
          <p className="text-sm text-muted">Arquivos de áudio são analisados no seu navegador — nada é enviado.</p>
        </div>
        <Tabs value={mode} onChange={setMode} items={[
          { id: "audio", label: <><FileAudio size={15} /> Áudio</> },
          { id: "list", label: <><FileSpreadsheet size={15} /> Lista</> },
          { id: "paste", label: <><ClipboardPaste size={15} /> Colar</> },
        ]} />
      </div>

      {mode !== "paste" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={drop}
          onClick={() => (mode === "audio" ? audioRef : listRef).current?.click()}
          className={cn("cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition", drag ? "border-accent bg-accent/10" : "border-line hover:border-accent/60 hover:bg-panel2/50")}
        >
          <UploadCloud className="mx-auto mb-3 text-accent" size={40} />
          {mode === "audio" ? (
            <>
              <div className="font-medium">Arraste músicas ou clique para escolher</div>
              <div className="text-sm text-muted mt-1">MP3, WAV, FLAC, AIFF, M4A, AAC, OGG, OPUS…</div>
            </>
          ) : (
            <>
              <div className="font-medium">Arraste uma lista ou planilha</div>
              <div className="text-sm text-muted mt-1">TXT, CSV, XLSX/XLS/ODS, M3U/M3U8, XML do Rekordbox, JSON</div>
            </>
          )}
          {mode === "audio" && (
            <Button size="sm" className="mt-4" onClick={(e) => { e.stopPropagation(); dirRef.current?.click(); }}>
              <FolderOpen size={15} /> Escolher pasta inteira
            </Button>
          )}
        </div>
      )}

      {mode === "paste" && (
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Cole aqui uma faixa por linha, ou células copiadas do Excel/Google Sheets/Rekordbox.\n\nExemplo:\n${EXAMPLE}`}
            className="w-full h-48 rounded-2xl bg-panel2 border border-line p-4 text-sm font-mono outline-none focus:border-accent scroll-thin" />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" disabled={!text.trim()} onClick={() => { const p = parseText(text); p.length ? setPreview(p) : notify("Não reconheci faixas no texto."); }}>
              Ler lista
            </Button>
            <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Usar exemplo</Button>
          </div>
        </div>
      )}

      <input ref={audioRef} type="file" multiple accept="audio/*,.flac,.aiff,.aif,.m4a,.opus" className="hidden" onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={dirRef} type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={listRef} type="file" multiple accept=".txt,.csv,.tsv,.xlsx,.xlsm,.xls,.ods,.m3u,.m3u8,.xml,.json" className="hidden" onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />

      {preview && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-medium">{preview.length} faixa(s) reconhecida(s) — confira antes de adicionar</div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={confirmPreview}>Adicionar e buscar dados</Button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto scroll-thin text-sm">
            <table className="w-full">
              <thead className="text-xs text-muted text-left sticky top-0 bg-panel">
                <tr><th className="py-1 pr-2">Artista</th><th className="pr-2">Título</th><th className="pr-2">Key</th><th className="pr-2">BPM</th><th>Duração</th></tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-1.5 pr-2 text-muted">{p.artist || <i className="opacity-60">?</i>}</td>
                    <td className="pr-2">{p.title}</td>
                    <td className="pr-2"><KeyBadge k={p.key} size="sm" /></td>
                    <td className="pr-2 tabular-nums">{p.bpm ?? "—"}</td>
                    <td className="tabular-nums text-muted">{formatDuration(p.durationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-2">Faltou key/BPM? O MixKey busca nas plataformas e analisa a prévia de 30 s de cada faixa.</p>
        </div>
      )}
    </Card>
  );
}
