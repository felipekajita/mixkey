import type { SourceDef } from "./index";
import { fetchJson } from "./http";
import { cleanTitle } from "../match";

// Google Custom Search JSON API (busca de imagens) — último recurso para capas.
export const googleImages: SourceDef = {
  id: "google", label: "Google Imagens", kind: "api", provides: ["cover"], coverOnly: true,
  enabled: () => !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
  async lookup(q) {
    const term = `${q.artist} ${cleanTitle(q.title)} cover art`;
    const r = await fetchJson<{ items?: { link: string; image?: { width: number; height: number; contextLink: string } }[] }>(
      `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_CSE_KEY}&cx=${process.env.GOOGLE_CSE_CX}&searchType=image&num=5&imgSize=large&q=${encodeURIComponent(term)}`,
    );
    // capas são quadradas: prefere imagens ~1:1
    const it = (r.items || []).find((i) => i.image && Math.abs(i.image.width / i.image.height - 1) < 0.08) ?? r.items?.[0];
    if (!it) return null;
    return { coverUrl: it.link, url: it.image?.contextLink, matchScore: 0.75 };
  },
};
