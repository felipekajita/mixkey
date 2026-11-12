"use client";
import { useEffect, useState } from "react";

/** Player único das prévias de 30 s (biblioteca, sugestões) com volume global persistido */
export interface PreviewMeta { title?: string; artist?: string; coverUrl?: string }
interface State { url: string | null; meta: PreviewMeta; playing: boolean; volume: number; muted: boolean; time: number; duration: number; visible: boolean }

const VOL_KEY = "mk-preview-volume";
const MUTE_KEY = "mk-preview-muted";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ok */ } };

let audio: HTMLAudioElement | null = null;
let state: State = { url: null, meta: {}, playing: false, volume: 0.8, muted: false, time: 0, duration: 30, visible: false };
let loaded = false;
const listeners = new Set<(s: State) => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };

function ensure() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    const v = parseFloat(read(VOL_KEY) ?? "");
    state = { ...state, volume: isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8, muted: read(MUTE_KEY) === "1" };
  }
  if (!audio && typeof window !== "undefined") {
    audio = new Audio();
    audio.preload = "auto";
    audio.onended = () => set({ playing: false, time: 0 });
    audio.onpause = () => set({ playing: false });
    audio.onplay = () => set({ playing: true });
    audio.ontimeupdate = () => set({ time: audio!.currentTime, duration: isFinite(audio!.duration) ? audio!.duration : 30 });
  }
  if (audio) { audio.volume = state.volume; audio.muted = state.muted; }
  return audio;
}

export const previewControls = {
  toggle(url: string, meta: PreviewMeta = {}) {
    const a = ensure();
    if (!a) return;
    if (state.url === url) {
      if (a.paused) a.play().catch(() => set({ playing: false })); else a.pause();
      return;
    }
    a.src = url;
    set({ url, meta, time: 0, visible: true });
    a.play().catch(() => set({ playing: false }));
  },
  setVolume(v: number) {
    const vol = Math.min(1, Math.max(0, v));
    write(VOL_KEY, String(vol));
    set({ volume: vol, muted: vol === 0 ? state.muted : false });
    write(MUTE_KEY, state.muted ? "1" : "0");
    ensure();
  },
  toggleMute() {
    set({ muted: !state.muted });
    write(MUTE_KEY, state.muted ? "1" : "0");
    ensure();
  },
  seek(sec: number) { const a = ensure(); if (a) a.currentTime = sec; },
  close() { audio?.pause(); set({ visible: false, playing: false, url: null }); },
};

export function usePreviewState() {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    ensure();
    setS(state);
    listeners.add(setS);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

/** Compatível com o uso anterior: `playing` = URL tocando agora */
export function usePreview() {
  const s = usePreviewState();
  return { playing: s.playing ? s.url : null, toggle: previewControls.toggle };
}
