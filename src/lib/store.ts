"use client";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Track } from "./types";
import { DEFAULT_OPTIONS, type SequenceOptions, type SequenceResult } from "./sequencer";

const idbStorage: StateStorage = {
  getItem: async (n) => (await idbGet(n)) ?? null,
  setItem: async (n, v) => { await idbSet(n, v); },
  removeItem: async (n) => { await idbDel(n); },
};

export interface SavedSet { id: string; name: string; savedAt: number; seq: SequenceResult; tracks: Track[] }

interface State {
  tracks: Track[];
  sequences: SequenceResult[];
  activeSeq: number;
  options: SequenceOptions;
  saved: SavedSet[];
  step: 0 | 1 | 2;
  addTracks: (t: Track[]) => void;
  updateTrack: (id: string, patch: Partial<Track> | ((t: Track) => Partial<Track>)) => void;
  removeTrack: (id: string) => void;
  clearTracks: () => void;
  setSequences: (s: SequenceResult[]) => void;
  updateSequence: (i: number, s: SequenceResult) => void;
  setActiveSeq: (i: number) => void;
  setOptions: (o: Partial<SequenceOptions>) => void;
  setStep: (s: 0 | 1 | 2) => void;
  saveSet: (s: SavedSet) => void;
  deleteSaved: (id: string) => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      tracks: [],
      sequences: [],
      activeSeq: 0,
      options: DEFAULT_OPTIONS,
      saved: [],
      step: 0,
      addTracks: (t) => set((s) => ({ tracks: [...s.tracks, ...t] })),
      updateTrack: (id, patch) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)) })),
      removeTrack: (id) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
      clearTracks: () => set({ tracks: [], sequences: [] }),
      setSequences: (sequences) => set({ sequences, activeSeq: 0 }),
      updateSequence: (i, seq) => set((s) => ({ sequences: s.sequences.map((x, j) => (j === i ? seq : x)) })),
      setActiveSeq: (activeSeq) => set({ activeSeq }),
      setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
      setStep: (step) => set({ step }),
      saveSet: (x) => set((s) => ({ saved: [x, ...s.saved.filter((y) => y.id !== x.id)] })),
      deleteSaved: (id) => set((s) => ({ saved: s.saved.filter((y) => y.id !== id) })),
    }),
    {
      name: "mixkey-v1",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        // estados transitórios voltam a "pendente" ao recarregar
        tracks: s.tracks.map((t) => (t.status === "analyzing" || t.status === "looking-up" ? { ...t, status: "pending" as const } : t)),
        sequences: s.sequences, activeSeq: s.activeSeq, options: s.options, saved: s.saved, step: s.step,
      }),
    },
  ),
);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
