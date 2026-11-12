"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { exportBackup, readBackup, applyBackup, type Backup } from "@/lib/backup";
import { cacheSize, clearCache } from "@/lib/lookupCache";
import { Button, Modal } from "./ui";

export default function BackupModal({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nTracks = useStore((s) => s.tracks.length);
  const nSaved = useStore((s) => s.saved.length);
  const [cached, setCached] = useState<number | null>(null);
  useEffect(() => { if (open) cacheSize().then(setCached); }, [open]);

  async function onFile(f: File) {
    setError(null);
    try {
      const b = await readBackup(f);
      if (!nTracks && !nSaved) { applyBackup(b, "replace"); done(b); }
      else setPending(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function done(b: Backup) {
    notify(`Backup restaurado: ${b.tracks.length} faixas, ${(b.saved?.length ?? 0)} set(s) salvo(s)`);
    setPending(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={() => { setPending(null); setError(null); onClose(); }} title="Backup e cache">
      <p className="text-sm text-muted mb-4">
        A biblioteca e os sets ficam salvos só neste navegador. Baixe um backup para guardar ou levar para outro computador/navegador.
        Arquivos de áudio não entram no backup (só os dados analisados: key, BPM, energia, capas).
      </p>
      <div className="space-y-4">
        <div>
          <Button variant="primary" disabled={!nTracks && !nSaved} onClick={() => { const r = exportBackup(); notify(`Backup baixado: ${r.tracks} faixas`); }}>
            <Download size={16} /> Baixar backup (.json)
          </Button>
          <div className="text-xs text-muted mt-1">{nTracks} faixas · {nSaved} set(s) salvo(s)</div>
        </div>
        <div className="border-t border-line pt-4">
          <Button onClick={() => fileRef.current?.click()}><Upload size={16} /> Restaurar backup</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
          {pending && (
            <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
              <div className="mb-2">Backup de {new Date(pending.exportedAt).toLocaleString("pt-BR")} com <b>{pending.tracks.length}</b> faixas e <b>{pending.saved?.length ?? 0}</b> set(s) salvo(s). O que fazer com o que já está aqui?</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => { applyBackup(pending, "merge"); done(pending); }}>Juntar (sem duplicar)</Button>
                <Button size="sm" variant="danger" onClick={() => { if (confirm("Substituir toda a biblioteca e os sets atuais pelo backup?")) { applyBackup(pending, "replace"); done(pending); } }}>Substituir tudo</Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-line pt-4">
          <div className="text-sm font-medium">Cache de buscas</div>
          <p className="text-xs text-muted mt-0.5 mb-2">
            Os dados já buscados nas plataformas (e a análise das prévias) ficam guardados neste navegador por 30 dias,
            para que faixas repetidas, playlists reimportadas e backups restaurados não sejam buscados de novo.
            “Buscar novamente”, nos detalhes da faixa, ignora o cache.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums">{cached ?? "…"} faixa(s) em cache</span>
            <Button size="sm" variant="danger" disabled={!cached} onClick={async () => { await clearCache(); setCached(0); notify("Cache de buscas limpo"); }}>
              <Trash2 size={14} /> Limpar cache
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
