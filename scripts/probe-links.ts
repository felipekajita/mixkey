// Uso: NODE_USE_ENV_PROXY=1 npx tsx scripts/probe-links.ts <url> [url...]
import { resolveLink } from "../src/lib/links/resolve";
(async () => {
  for (const u of process.argv.slice(2)) {
    const r = await resolveLink(u);
    console.log(`\n[${r.platform}] ${r.kind}${r.name ? ` "${r.name}"` : ""} — ${r.tracks.length} faixa(s)${r.error ? ` ✗ ${r.error}` : ""}${r.warning ? ` ⚠ ${r.warning}` : ""}`);
    r.tracks.slice(0, 3).forEach((t) => console.log(`   ${t.artist || "?"} — ${t.title} (${t.durationSec ?? "?"}s) cover:${t.coverUrl ? "sim" : "não"} preview:${t.previewUrl ? "sim" : "não"}${t.isrc ? " isrc" : ""}`));
  }
})();
