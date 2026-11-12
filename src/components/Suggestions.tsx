"use client";
import { useMemo, useState } from "react";
import { Sparkles, Plus, Play, Pause, Loader2, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button, Card, cn } from "./ui";
import { Cover, KeyBadge, ScorePill } from "./bits";
import { usePreview } from "./usePreview";
import { analyzePreview } from "@/lib/audio";
import { transitionInfo } from "@/lib/sequencer";
import { addParsedTracks, dedupeKey } from "@/lib/pipeline";
import type { Track } from "@/lib/types";
import { genreProfile, genreScore, genreLabel, classifyGenre } from "@/lib/genre";

interface Sug { title: string; artist: string; coverUrl?: string; previewUrl?: string; url?: string; durationSec?: number; reason: string; genres?: string[]; key?: string; bpm?: number; analyzing?: boolean; fit?: { score: number; with: string } }

export default function Suggestions({ notify }: { notify: (m: string) => void }) {
  const tracks = useStore((s) => s.tracks);
  const [items, setItems] = useState<Sug[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [onlyFit, setOnlyFit] = useState(false);
  const [sameGenre, setSameGenre] = useState(true);
  const profile = useMemo(() => genreProfile(tracks), [tracks]);
  // tags mais frequentes da biblioteca (para buscar destaques do gênero no Last.fm)
  const topTags = useMemo(() => {
    const c = new Map<string, number>();
    tracks.forEach((t) => t.genres?.forEach((g) => { const k = g.toLowerCase(); const cl = classifyGenre(k); if (cl && cl.family !== "electronic") c.set(k, (c.get(k) ?? 0) + 1); }));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  }, [tracks]);
  const { playing, toggle } = usePreview();

  const topArtists = useMemo(() => {
    const c = new Map<string, number>();
    tracks.forEach((t) => t.artist && t.artist.split(/,|&| feat\.? | x /i).map((a) => a.trim()).filter(Boolean).forEach((a) => c.set(a, (c.get(a) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
  }, [tracks]);

  async function load() {
    setLoading(true);
    try {
      const sample = tracks.filter((t) => t.artist).slice(0, 4).map((t) => `${t.artist} - ${t.title}`);
      const r = await fetch(`/api/similar?artists=${encodeURIComponent(topArtists.join("|"))}&tracks=${encodeURIComponent(sample.join("|"))}&genres=${encodeURIComponent(topTags.join("|"))}`);
      const { suggestions } = (await r.json()) as { suggestions: Sug[] };
      const have = new Set(tracks.map(dedupeKey));
      const fresh = suggestions.filter((s) => !have.has(dedupeKey(s)));
      setItems(fresh);
      analyzeAll(fresh);
    } catch {
      notify("Não foi possível buscar sugestões agora.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeAll(list: Sug[]) {
    const lib = useStore.getState().tracks.filter((t) => t.key || t.bpm);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.previewUrl) continue;
      setItems((cur) => cur.map((x) => (x === s ? { ...x, analyzing: true } : x)));
      try {
        const a = await analyzePreview(s.previewUrl);
        const fake = { key: a.key, bpm: a.bpm } as Track;
        let best = { score: 0, with: "" };
        for (const t of lib) {
          const sc = Math.max(transitionInfo(t, fake, 0.06).score, transitionInfo(fake, t, 0.06).score);
          if (sc > best.score) best = { score: sc, with: `${t.title} – ${t.artist}` };
        }
        setItems((cur) => cur.map((x) => (x.title === s.title && x.artist === s.artist ? { ...x, key: a.key, bpm: a.bpm, analyzing: false, fit: lib.length ? best : undefined } : x)));
      } catch {
        setItems((cur) => cur.map((x) => (x.title === s.title && x.artist === s.artist ? { ...x, analyzing: false } : x)));
      }
    }
  }

  function add(s: Sug) {
    addParsedTracks([{ title: s.title, artist: s.artist, key: s.key, bpm: s.bpm, durationSec: s.durationSec, genre: s.genres?.[0] }], "suggestion");
    setAdded((a) => new Set(a).add(dedupeKey(s)));
    notify(`“${s.title}” adicionada à biblioteca`);
  }

  if (!tracks.length) return null;
  // nota final = key/BPM (55%) + gênero (45%); gênero desconhecido pesa um pouco contra
  const scored = items.map((s) => {
    const g = genreScore(profile, s.genres);
    const harm = s.fit?.score;
    const total = harm == null ? (g == null ? -1 : g * 45) : g == null ? harm * 0.75 : harm * 0.55 + g * 45;
    return { s, g, total };
  });
  const shown = scored
    .filter(({ g }) => !sameGenre || g == null || g >= 0.35)
    .filter(({ s, g }) => !onlyFit || ((s.fit?.score ?? 0) >= 75 && (g == null || g >= 0.5)))
    .sort((a, b) => b.total - a.total);
  const hidden = items.length - scored.filter(({ g }) => !sameGenre || g == null || g >= 0.35).length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg flex items-center gap-2"><Sparkles size={18} className="text-accent" /> Sugestões para o set</h2>
          <p className="text-sm text-muted">Faixas dos mesmos artistas, de artistas parecidos{topArtists.length ? ` (${topArtists.slice(0, 3).join(", ")}…)` : ""} e destaques dos seus gêneros, ordenadas por <b>key/BPM + gênero</b>.</p>
          <p className="text-xs text-muted mt-0.5">
            {profile.total ? <>Gêneros da sua biblioteca: {profile.top.slice(0, 4).map((g) => <span key={g} className="inline-block rounded-full border border-line px-1.5 mr-1">{g}</span>)}</> : "Ainda sem gênero identificado na biblioteca (o gênero vem do Last.fm, Apple Music, Beatport ou das tags)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <label className="text-sm flex items-center gap-2 text-muted" title="Esconde sugestões de gêneros sem relação com a sua biblioteca"><input type="checkbox" checked={sameGenre} onChange={(e) => setSameGenre(e.target.checked)} /> Mesmo gênero</label>
              <label className="text-sm flex items-center gap-2 text-muted"><input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} /> Só compatíveis</label>
            </>
          )}
          <Button onClick={load} disabled={loading || !topArtists.length}>{loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {items.length ? "Atualizar" : "Buscar sugestões"}</Button>
        </div>
      </div>

      {sameGenre && hidden > 0 && <p className="text-xs text-muted mt-3">{hidden} sugestão(ões) de outros gêneros escondida(s). Desmarque “Mesmo gênero” para ver todas.</p>}
      {shown.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[28rem] overflow-auto scroll-thin pr-1">
          {shown.map(({ s, g }) => {
            const done = added.has(dedupeKey(s));
            const gl = genreLabel(s.genres)[0];
            return (
              <div key={`${s.artist}-${s.title}`} className="flex items-center gap-3 rounded-xl border border-line p-2 group">
                <div className="relative">
                  <Cover src={s.coverUrl} size={52} />
                  {s.previewUrl && (
                    <button onClick={() => toggle(s.previewUrl!, { title: s.title, artist: s.artist, coverUrl: s.coverUrl })} className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 text-white">
                      {playing === s.previewUrl ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-xs text-muted truncate">{s.artist}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {s.analyzing ? <span className="text-xs text-accent flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> analisando</span> : (
                      <>
                        {s.key && <KeyBadge k={s.key} size="sm" />}
                        {s.bpm && <span className="text-xs tabular-nums">{s.bpm} BPM</span>}
                        {s.fit && <span title={`Melhor encaixe: ${s.fit.with}`}><ScorePill score={s.fit.score} /></span>}
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {gl && <span title={`Gênero: ${(s.genres ?? []).join(", ")} · combina ${g == null ? "?" : Math.round(g * 100) + "%"} com a biblioteca`} className={cn("mr-1 rounded px-1 border", g == null ? "border-line" : g >= 0.6 ? "border-emerald-500/40 text-emerald-400" : g >= 0.35 ? "border-amber-500/40 text-amber-400" : "border-red-500/40 text-red-400")}>{gl}</span>}
                    {s.reason}
                  </div>
                </div>
                <button disabled={done} onClick={() => add(s)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", done ? "text-emerald-400" : "bg-panel2 hover:bg-accent hover:text-white")} aria-label="Adicionar">
                  {done ? <Check size={16} /> : <Plus size={16} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
