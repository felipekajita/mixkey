import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";

export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({
    sources: SOURCES.map((s) => ({ id: s.id, label: s.label, kind: s.kind, provides: s.provides, enabled: s.enabled() })),
  });
}
