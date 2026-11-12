import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSongbpmResults, parseSongbpmKey } from "./songbpm";

const fx = (f: string) => readFileSync(path.join(__dirname, "__fixtures__", f), "utf8");

describe("SongBPM", () => {
  it("lê os resultados da busca", () => {
    const r = parseSongbpmResults(fx("songbpm-search.html"));
    expect(r.length).toBeGreaterThan(3);
    expect(r[0]).toMatchObject({ title: "Cola", artist: "CAMELPHAT", bpm: 122, durationSec: 224, href: "/@camelphat/cola-tex3a" });
    expect(r.find((x) => x.title === "Cola - Club Mix")?.durationSec).toBe(416);
  });
  it("lê key com modo na página da faixa", () => {
    expect(parseSongbpmKey(fx("songbpm-track.html"))).toBe("2B"); // F♯ maior
  });
});
