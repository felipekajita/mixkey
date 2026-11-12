// Copia os arquivos do essentia.js (WASM) para /public para uso no Web Worker.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
const src = "node_modules/essentia.js/dist/";
const dst = "public/essentia/";
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  for (const f of ["essentia-wasm.web.js", "essentia-wasm.web.wasm", "essentia.js-core.umd.js"]) copyFileSync(src + f, dst + f);
  console.log("essentia.js copiado para public/essentia");
}

// sql.js (SQLite em WASM) — leitura da biblioteca do Mixxx
if (existsSync("node_modules/sql.js/dist/sql-wasm-browser.wasm")) {
  mkdirSync("public/sqljs/", { recursive: true });
  copyFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm", "public/sqljs/sql-wasm-browser.wasm");
  console.log("sql.js copiado para public/sqljs");
}

// onnxruntime-web (IA OpenKeyScan) — arquivos WASM servidos em /ort/
if (existsSync("node_modules/onnxruntime-web/dist/")) {
  mkdirSync("public/ort/", { recursive: true });
  for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync("node_modules/onnxruntime-web/dist/" + f, "public/ort/" + f);
  console.log("onnxruntime-web copiado para public/ort");
}
