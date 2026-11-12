"use client";
import { useEffect, useState } from "react";

let audio: HTMLAudioElement | null = null;
const listeners = new Set<(u: string | null) => void>();
let current: string | null = null;
const emit = () => listeners.forEach((l) => l(current));

export function usePreview() {
  const [playing, setPlaying] = useState<string | null>(current);
  useEffect(() => {
    listeners.add(setPlaying);
    return () => { listeners.delete(setPlaying); };
  }, []);
  const toggle = (url: string) => {
    if (!audio) {
      audio = new Audio();
      audio.onended = () => { current = null; emit(); };
    }
    if (current === url) { audio.pause(); current = null; }
    else { audio.src = url; audio.volume = 0.8; audio.play().catch(() => { current = null; emit(); }); current = url; }
    emit();
  };
  return { playing, toggle };
}
