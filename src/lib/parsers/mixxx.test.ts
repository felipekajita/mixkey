import { describe, it, expect } from "vitest";
import { mixxxKeyIdToCamelot } from "./mixxx";

describe("Mixxx key_id → Camelot", () => {
  it("maiores 1–12 e menores 13–24 (src/proto/keys.proto)", () => {
    expect(mixxxKeyIdToCamelot(1)).toBe("8B");   // C
    expect(mixxxKeyIdToCamelot(7)).toBe("2B");   // F#
    expect(mixxxKeyIdToCamelot(11)).toBe("6B");  // Bb
    expect(mixxxKeyIdToCamelot(22)).toBe("8A");  // Am
    expect(mixxxKeyIdToCamelot(23)).toBe("3A");  // Bbm
    expect(mixxxKeyIdToCamelot(13)).toBe("5A");  // Cm
    expect(mixxxKeyIdToCamelot(0)).toBeUndefined();
  });
});
