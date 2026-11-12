// Uso: NODE_USE_ENV_PROXY=1 npx tsx scripts/probe-sources.ts "Artista" "Título"
import { lookupAll } from "../src/lib/sources";
const [artist = "CamelPhat & Elderbrook", title = "Cola"] = process.argv.slice(2);
lookupAll({ artist, title }).then((r) => {
  for (const x of r) console.log(x.label.padEnd(24), x.error ? `✗ ${x.error}` : `✓ ${(x.matchScore ?? 0).toFixed(2)} ${x.matchedArtist} - ${x.matchedTitle} | key ${x.key ?? "-"} bpm ${x.bpm ?? "-"} | cover ${x.coverUrl ? "sim" : "não"}`);
});
