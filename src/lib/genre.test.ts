import { describe, it, expect } from "vitest";
import { classifyGenre, genreProfile, genreScore } from "./genre";

describe("gêneros", () => {
  it("classifica tags de várias fontes", () => {
    expect(classifyGenre("Melodic House & Techno")?.sub).toBe("melodic house & techno");
    expect(classifyGenre("Tech House")?.family).toBe("house");
    expect(classifyGenre("Techno/House")?.family).toBe("house");
    expect(classifyGenre("Hip-Hop/Rap")?.family).toBe("hiphop");
    expect(classifyGenre("R&B/Soul")?.family).toBe("rnb");
    expect(classifyGenre("Dance")?.family).toBe("electronic");
    expect(classifyGenre("seen live")).toBeNull();
    expect(classifyGenre("Electro")?.family).toBe("electronic"); // Deezer: eletrônica em geral
    expect(classifyGenre("electro house")?.family).toBe("house");
  });
  it("biblioteca de house: house combina, hip hop/pop não", () => {
    const lib = genreProfile([
      { genres: ["house", "melodic house"] }, { genres: ["tech house"] }, { genres: ["deep house", "electronic"] }, { genres: ["house"] },
    ]);
    const house = genreScore(lib, ["melodic house & techno"])!;
    const techno = genreScore(lib, ["techno"])!;
    const hiphop = genreScore(lib, ["hip-hop", "rap"])!;
    const pop = genreScore(lib, ["pop"])!;
    expect(house).toBeGreaterThan(0.7);
    expect(techno).toBeGreaterThan(hiphop);
    expect(hiphop).toBeLessThan(0.2);
    expect(pop).toBeLessThan(0.2);
    expect(genreScore(lib, [])).toBeNull();
  });
});

describe("biblioteca genérica (só 'Dance/Electronic', sem Last.fm)", () => {
  const lib = genreProfile([{ genres: ["Dance"] }, { genres: ["Electronic"] }, { genres: ["Dance", "House"] }]);
  it("aceita eletrônica e esconde pop/R&B/sertanejo puros", () => {
    expect(genreScore(lib, ["Electro", "Dance"])!).toBeGreaterThan(0.5);
    expect(genreScore(lib, ["Techno/House"])!).toBeGreaterThan(0.35);
    expect(genreScore(lib, ["Pop"])!).toBeLessThan(0.35);
    expect(genreScore(lib, ["R&B"])!).toBeLessThan(0.35);
    expect(genreScore(lib, ["Sertanejo"])!).toBeLessThan(0.35);
  });
});
