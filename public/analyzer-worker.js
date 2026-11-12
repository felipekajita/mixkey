/* Web Worker de análise (classic worker). Essentia.js — AGPL-3.0 — https://mtg.github.io/essentia.js/ */
// O build "web" do essentia.js espera `document`; shim mínimo para rodar no worker.
self.document = self.document || { currentScript: { src: self.location.origin + "/essentia/essentia-wasm.web.js" }, title: "" };
self.importScripts("/essentia/essentia-wasm.web.js", "/essentia/essentia.js-core.umd.js");

let essentiaPromise = null;
function getEssentia() {
  if (!essentiaPromise) {
    essentiaPromise = EssentiaWASM({ locateFile: (p) => "/essentia/" + p }).then((wasm) => new Essentia(wasm));
  }
  return essentiaPromise;
}

self.onmessage = async (e) => {
  const { id, samples, sampleRate } = e.data;
  try {
    const essentia = await getEssentia();
    const vec = essentia.arrayToVector(samples);
    let key, scale, strength, bpm, bpmConf, dance;
    try {
      const k = essentia.KeyExtractor(vec, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "edma", sampleRate, 0.0001, 440, "cosine", "hann");
      key = k.key; scale = k.scale; strength = k.strength;
    } catch (err) { /* sem key */ }
    try {
      const r = essentia.RhythmExtractor2013(vec, 208, "multifeature", 40);
      bpm = r.bpm; bpmConf = r.confidence;
      try { r.ticks && r.ticks.delete && r.ticks.delete(); r.estimates && r.estimates.delete && r.estimates.delete(); r.bpmIntervals && r.bpmIntervals.delete && r.bpmIntervals.delete(); } catch (_) {}
    } catch (err) { /* sem bpm */ }
    try {
      const d = essentia.Danceability(vec, 8800, 310, sampleRate, 1.1);
      dance = d.danceability;
      try { d.dfa && d.dfa.delete && d.dfa.delete(); } catch (_) {}
    } catch (err) { /* opcional */ }
    try { vec.delete(); } catch (_) {}
    self.postMessage({ id, ok: true, key, scale, strength, bpm, bpmConf, danceability: dance });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
