"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, FileSpreadsheet, ClipboardPaste, UploadCloud, FolderOpen, Link2, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button, Card, Tabs, cn } from "./ui";
import { AUDIO_EXT } from "@/lib/audio";
import { addAudioFiles, addParsedTracks, importStoreTracks, storeTitle } from "@/lib/pipeline";
import { makeBookmarklet } from "@/lib/store-import/bookmarklet";
import { parseStorePayload, type StorePayload } from "@/lib/store-import/parse";
import { useStore } from "@/lib/store";
import { matchScore } from "@/lib/match";
import { parseListFile, type ParsedInput } from "@/lib/parsers/files";
import type { MixxxGroup } from "@/lib/parsers/mixxx";
import { parseText, parseTextTable, mapRows, FIELD_LABELS, type ParsedTrack, type TableInfo, type Field } from "@/lib/parsers/text";
import { extractUrls, resolveLinks, resultsToParsed } from "@/lib/links/client";
import type { ResolveResult } from "@/lib/links/types";
import { Cover, KeyBadge } from "./bits";
import { formatDuration } from "@/lib/bpm";

type Mode = "audio" | "list" | "paste" | "links";
const LIST_EXT = /\.(txt|csv|tsv|xlsx|xlsm|xls|ods|m3u8?|xml|json|sqlite|sqlite3|db)$/i;

const EXAMPLE = `CamelPhat & Elderbrook - Cola
Lane 8 - Brightest Lights 8A 122
Eric Prydz - Opus | 10A | 126 | 9:03
Fred again.. - Delilah (pull me out of this)
Anyma - Eternity`;

const LINK_EXAMPLE = `https://open.spotify.com/track/...
https://www.deezer.com/br/playlist/...
https://music.apple.com/br/album/...
https://www.youtube.com/watch?v=...`;

const PLATFORM_CHIPS = ["Spotify", "Deezer", "Apple Music", "YouTube", "YouTube Music", "SoundCloud", "Beatport*", "Tidal*", "Bandcamp*", "Shazam*"];

interface Preview { tracks: ParsedTrack[]; table?: TableInfo; links?: ResolveResult[]; store?: StorePayload; groups?: MixxxGroup[]; group?: number; source?: string }

export default function AddTracks({ notify }: { notify: (m: string) => void }) {
  const [mode, setMode] = useState<Mode>("audio");
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [linkText, setLinkText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resolving, setResolving] = useState<{ done: number; total: number } | null>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLInputElement>(null);

  // dados enviados pelo botão "Enviar para o MixKey" (#mk-store=…)
  useEffect(() => {
    const read = () => {
      const m = /#mk-store=([^&]+)/.exec(location.hash);
      if (!m) return;
      const p = parseStorePayload(m[1]);
      history.replaceState(null, "", location.pathname + location.search);
      if (p) { setMode("links"); setPreview({ tracks: [], store: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else notify("Não consegui ler os dados enviados.");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [notify]);

  // faixas exibidas: se houver tabela, recalcula a partir do mapeamento escolhido
  const tracks = useMemo(() => {
    if (preview?.table) return mapRows(preview.table);
    const all = preview?.tracks ?? [];
    const g = preview?.groups && preview.group != null ? preview.groups[preview.group] : undefined;
    return g ? g.trackIdx.map((i) => all[i]) : all;
  }, [preview]);

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const audio = arr.filter((f) => AUDIO_EXT.test(f.name));
    const lists = arr.filter((f) => LIST_EXT.test(f.name));
    if (audio.length) notify(`${addAudioFiles(audio)} arquivo(s) de áudio adicionados — analisando…`);
    if (lists.length) {
      const parsed = await Promise.all(lists.map((f) => parseListFile(f).catch((e): ParsedInput => { notify((e as Error).message || "Não consegui ler o arquivo."); return { tracks: [] }; })));
      // um único arquivo em tabela → permite mapear colunas
      if (parsed.length === 1 && parsed[0].groups) setPreview({ tracks: parsed[0].tracks, groups: parsed[0].groups, source: parsed[0].source });
      else if (parsed.length === 1 && parsed[0].table) setPreview({ tracks: parsed[0].tracks, table: parsed[0].table });
      else {
        const all = parsed.flatMap((p) => p.tracks);
        all.length ? setPreview({ tracks: all }) : notify("Não encontrei faixas no arquivo.");
      }
    }
    if (!audio.length && !lists.length) notify("Formato não suportado.");
  }

  async function readLinks(source: string) {
    const urls = extractUrls(source);
    if (!urls.length) return notify("Nenhum link encontrado.");
    setResolving({ done: 0, total: urls.length });
    try {
      const results = await resolveLinks(urls, (done, total) => setResolving({ done, total }));
      const parsed = resultsToParsed(results);
      setPreview({ tracks: parsed, links: results });
      if (!parsed.length) notify("Não consegui ler faixas desses links.");
    } finally {
      setResolving(null);
    }
  }

  function readPaste() {
    const sp = parseStorePayload(text);
    if (sp) return setPreview({ tracks: [], store: sp });
    // texto colado só com links → trata como links
    const lines = text.split("\n").filter((l) => l.trim());
    const urls = extractUrls(text);
    if (urls.length && urls.length >= lines.length * 0.6) return readLinks(text);
    const table = parseTextTable(text);
    if (table) return setPreview({ tracks: mapRows(table), table });
    const p = parseText(text);
    p.length ? setPreview({ tracks: p }) : notify("Não reconheci faixas no texto.");
  }

  function confirmPreview() {
    if (preview?.store) {
      const r = importStoreTracks(preview.store);
      notify(`${preview.store.store}: ${r.merged} faixa(s) atualizada(s) na biblioteca${r.added ? `, ${r.added} nova(s)` : ""}`);
      setPreview(null);
      return;
    }
    if (!tracks.length) return;
    const r = addParsedTracks(tracks);
    notify(`${r.added} faixa(s) adicionadas${r.skipped ? ` · ${r.skipped} duplicada(s) ignorada(s)` : ""}`);
    setPreview(null);
    setText("");
    setLinkText("");
  }

  const setField = (i: number, f: Field) => preview?.table && setPreview({ ...preview, table: { ...preview.table, fields: preview.table.fields.map((x, j) => (j === i ? f : x)) } });
  const setHeader = (v: boolean) => preview?.table && setPreview({ ...preview, table: { ...preview.table, hasHeader: v } });

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const t = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!e.dataTransfer.files.length && t) return void readLinks(t);
    handleFiles(e.dataTransfer.files);
  };

  const linkErrors = preview?.links?.filter((r) => r.error || r.warning) ?? [];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-lg">Adicionar faixas</h2>
          <p className="text-sm text-muted">Arquivos de áudio são analisados no seu navegador — nada é enviado.</p>
        </div>
        <Tabs value={mode} onChange={setMode} className="self-start sm:self-auto max-w-full overflow-x-auto" items={[
          { id: "audio", label: <><FileAudio size={15} /> Áudio</> },
          { id: "list", label: <><FileSpreadsheet size={15} /> Lista</> },
          { id: "paste", label: <><ClipboardPaste size={15} /> Colar</> },
          { id: "links", label: <><Link2 size={15} /> Links</> },
        ]} />
      </div>

      {(mode === "audio" || mode === "list") && (
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
              <div className="text-sm text-muted mt-1">TXT, CSV, XLSX/XLS/ODS, M3U/M3U8, XML do Rekordbox, biblioteca do Mixxx (mixxxdb.sqlite), JSON</div>
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
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Cole aqui uma faixa por linha, células copiadas do Excel/Google Sheets/Rekordbox ou links de música.\n\nExemplo:\n${EXAMPLE}`}
            className="w-full h-48 rounded-2xl bg-panel2 border border-line p-4 text-sm font-mono outline-none focus:border-accent scroll-thin" />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" disabled={!text.trim() || !!resolving} onClick={readPaste}>
              {resolving ? <Loader2 size={15} className="animate-spin" /> : null} Ler lista
            </Button>
            <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Usar exemplo</Button>
          </div>
        </div>
      )}

      {mode === "links" && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={drop}>
          <textarea value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder={`Cole links de faixas, álbuns ou playlists (um por linha):\n\n${LINK_EXAMPLE}`}
            className="w-full h-40 rounded-2xl bg-panel2 border border-line p-4 text-sm font-mono outline-none focus:border-accent scroll-thin" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PLATFORM_CHIPS.map((p) => <span key={p} className="text-[11px] rounded-full border border-line px-2 py-0.5 text-muted">{p}</span>)}
          </div>
          <p className="text-xs text-muted mt-1.5">Faixas, álbuns e playlists de Spotify, Deezer, Apple Music, YouTube e YouTube Music; faixas do SoundCloud. * Leitura parcial (o site limita): confira o artista. Amazon Music não expõe os dados — cole o nome.</p>
          <StoreButton />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Button variant="primary" disabled={!linkText.trim() || !!resolving} onClick={() => readLinks(linkText)}>
              {resolving ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Ler links
            </Button>
            {resolving && <span className="text-sm text-muted">Lendo {resolving.done}/{resolving.total}…</span>}
          </div>
        </div>
      )}

      <input ref={audioRef} type="file" multiple accept="audio/*,.flac,.aiff,.aif,.m4a,.opus" className="hidden" onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={dirRef} type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={listRef} type="file" multiple accept=".txt,.csv,.tsv,.xlsx,.xlsm,.xls,.ods,.m3u,.m3u8,.xml,.json,.sqlite,.sqlite3,.db" className="hidden" onChange={(e) => { e.target.files && handleFiles(e.target.files); e.target.value = ""; }} />

      {preview?.store && <StorePreview p={preview.store} onCancel={() => setPreview(null)} onConfirm={confirmPreview} />}
      {preview && !preview.store && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-medium">{tracks.length} faixa(s) reconhecida(s) — confira antes de adicionar</div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button variant="primary" size="sm" disabled={!tracks.length} onClick={confirmPreview}>Adicionar e buscar dados</Button>
            </div>
          </div>

          {preview.groups && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{preview.source ?? "Biblioteca"}: importar</span>
              <select className="h-8 rounded-lg border border-line bg-panel2 px-2 text-sm" value={preview.group ?? -1} onChange={(e) => setPreview({ ...preview, group: +e.target.value < 0 ? undefined : +e.target.value })}>
                <option value={-1}>Biblioteca inteira ({preview.tracks.length})</option>
                {preview.groups.map((g, i) => <option key={i} value={i}>{g.kind === "playlist" ? "Playlist" : "Crate"}: {g.name} ({g.trackIdx.length})</option>)}
              </select>
              <span className="text-xs text-muted">BPM e key vêm da análise do Mixxx; os caminhos dos arquivos são mantidos para exportar.</span>
            </div>
          )}
          {preview.table && <ColumnMapper table={preview.table} onField={setField} onHeader={setHeader} />}

          {linkErrors.length > 0 && (
            <div className="mb-3 space-y-1">
              {linkErrors.map((r) => (
                <div key={r.url} className={cn("text-xs flex items-start gap-1.5", r.error ? "text-red-400" : "text-amber-400")}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span><b>{r.platform}</b>{r.name ? ` · ${r.name}` : ""}: {r.error ?? r.warning} <a href={r.url} target="_blank" rel="noreferrer" className="underline opacity-70 break-all">{r.url.length > 60 ? r.url.slice(0, 60) + "…" : r.url}</a></span>
                </div>
              ))}
            </div>
          )}
          {preview.links && preview.links.some((r) => r.kind === "album" || r.kind === "playlist") && (
            <div className="text-xs text-muted mb-2">
              {preview.links.filter((r) => r.name && r.tracks.length).map((r) => `${r.platform}: “${r.name}” (${r.tracks.length})`).join(" · ")}
            </div>
          )}

          <div className="max-h-72 overflow-auto scroll-thin text-sm">
            <table className="w-full">
              <thead className="text-xs text-muted text-left sticky top-0 bg-panel">
                <tr>{preview.links && <th className="py-1 pr-2 w-10" />}<th className="py-1 pr-2">Título</th><th className="pr-2">Artista</th><th className="pr-2">Key</th><th className="pr-2">BPM</th><th>Duração</th></tr>
              </thead>
              <tbody>
                {tracks.map((p, i) => (
                  <tr key={i} className="border-t border-line/60">
                    {preview.links && <td className="py-1 pr-2"><Cover src={p.coverUrl} size={28} className="rounded" /></td>}
                    <td className="py-1.5 pr-2">
                      {p.title}
                      {p.sourceLabel && <span className="ml-1.5 text-[10px] text-muted border border-line rounded px-1">{p.sourceLabel}</span>}
                      {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-block text-muted hover:text-accent align-middle"><ExternalLink size={11} /></a>}
                    </td>
                    <td className="pr-2 text-muted">{p.artist || <i className="opacity-60">?</i>}</td>
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

const FIELD_ORDER: Field[] = ["title", "artist", "trackartist", "key", "bpm", "duration", "energy", "genre", "file", "ignore"];

/** Escolha manual do significado de cada coluna da planilha */
function ColumnMapper({ table, onField, onHeader }: { table: TableInfo; onField: (i: number, f: Field) => void; onHeader: (v: boolean) => void }) {
  const sample = table.rows.slice(0, 4);
  const hasTitle = table.fields.some((f) => f === "title" || f === "trackartist");
  return (
    <div className="mb-4 rounded-xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium">Colunas da planilha <span className="text-muted font-normal">— ajuste se algo foi detectado errado</span></div>
        <label className="text-xs flex items-center gap-1.5 text-muted"><input type="checkbox" checked={table.hasHeader} onChange={(e) => onHeader(e.target.checked)} /> Primeira linha é cabeçalho</label>
      </div>
      {!hasTitle && <div className="text-xs text-amber-400 mb-2">Escolha qual coluna tem o título da faixa (ou “Artista - Título”).</div>}
      <div className="overflow-x-auto scroll-thin">
        <table className="text-xs">
          <thead>
            <tr>
              {table.fields.map((f, i) => (
                <th key={i} className="pr-2 pb-1.5 text-left font-normal">
                  <select value={f} onChange={(e) => onField(i, e.target.value as Field)}
                    className={cn("h-8 rounded-lg border px-2 text-xs bg-panel2 outline-none", f === "ignore" ? "border-line text-muted" : "border-accent/60 text-fg")}>
                    {FIELD_ORDER.map((x) => <option key={x} value={x}>{FIELD_LABELS[x]}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((r, ri) => (
              <tr key={ri} className={cn(ri === 0 && table.hasHeader && "text-muted italic")}>
                {table.fields.map((_, ci) => (
                  <td key={ci} className="pr-2 py-0.5 max-w-[12rem] truncate">{String(r[ci] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Botão para arrastar para a barra de favoritos */
function StoreButton() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // o React bloqueia "javascript:" em href; define direto no elemento
    ref.current?.setAttribute("href", makeBookmarklet(window.location.origin));
  }, []);
  return (
    <div className="mt-4 rounded-xl border border-line bg-panel p-3">
      <div className="text-sm font-medium">Dados oficiais do Beatport (1 clique)</div>
      <p className="text-xs text-muted mt-1">
        O Beatport bloqueia leitura automática, mas você pode trazer os dados da página que estiver vendo: BPM, key, gênero, selo, ISRC e capa.
        Faixas que já estão na biblioteca ganham esses dados como mais uma fonte na votação; as demais são adicionadas.
      </p>
      <ol className="text-xs text-muted list-decimal pl-4 mt-2 space-y-0.5">
        <li><b>Arraste</b> o botão abaixo para a barra de favoritos do navegador (no Chrome: Ctrl+Shift+B mostra a barra).</li>
        <li>Abra no Beatport uma página de faixa, release, chart, playlist ou busca.</li>
        <li>Clique no favorito <b>“→ MixKey”</b>: o MixKey abre com as faixas da página para você confirmar.</li>
      </ol>
      <a ref={ref} onClick={(e) => e.preventDefault()} draggable
        className="mt-3 inline-flex items-center gap-2 rounded-xl grad-bg text-white text-sm font-semibold px-4 h-9 cursor-grab active:cursor-grabbing select-none"
        title="Arraste para a barra de favoritos">
        → MixKey
      </a>
      <span className="text-[11px] text-muted ml-2">arraste, não clique</span>
    </div>
  );
}

function StorePreview({ p, onCancel, onConfirm }: { p: StorePayload; onCancel: () => void; onConfirm: () => void }) {
  const lib = useStore((s) => s.tracks);
  const inLib = (t: StorePayload["tracks"][number]) => lib.some((x) => (t.isrc && x.isrc === t.isrc) || matchScore(x, { title: storeTitle(t), artist: t.artists }) >= 0.85);
  const n = p.tracks.filter(inLib).length;
  return (
    <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="font-medium">{p.store}: {p.tracks.length} faixa(s) — {p.page?.replace(/\s*\|.*$/, "")}</div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>Importar dados</Button>
        </div>
      </div>
      <p className="text-xs text-muted mb-3">{n} já está(ão) na biblioteca e vão ganhar os dados do {p.store} como fonte oficial; {p.tracks.length - n} serão adicionadas.</p>
      <div className="max-h-72 overflow-auto scroll-thin text-sm">
        <table className="w-full">
          <thead className="text-xs text-muted text-left sticky top-0 bg-panel">
            <tr><th className="py-1 pr-2 w-10" /><th className="pr-2">Título</th><th className="pr-2">Artista</th><th className="pr-2">Key</th><th className="pr-2">BPM</th><th className="pr-2">Gênero</th><th>Selo</th></tr>
          </thead>
          <tbody>
            {p.tracks.map((t, i) => (
              <tr key={i} className="border-t border-line/60">
                <td className="py-1 pr-2"><Cover src={t.coverUrl} size={28} className="rounded" /></td>
                <td className="pr-2">{storeTitle(t)} {inLib(t) && <span className="text-[10px] text-emerald-400 border border-emerald-500/40 rounded px-1 ml-1">na biblioteca</span>}</td>
                <td className="pr-2 text-muted">{t.artists}</td>
                <td className="pr-2"><span className="text-xs">{t.key ?? "—"}</span></td>
                <td className="pr-2 tabular-nums">{t.bpm ?? "—"}</td>
                <td className="pr-2 text-xs text-muted">{t.genre ?? ""}</td>
                <td className="text-xs text-muted">{t.label ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
