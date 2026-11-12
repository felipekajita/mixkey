import { NextResponse } from "next/server";
import { lookupAll } from "@/lib/sources";
import type { LookupQuery, SourceReading } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const cache = new Map<string, { at: number; data: SourceReading[] }>();
const TTL = 1000 * 60 * 10; // curto: URLs de prévia da Deezer expiram

export async function POST(req: Request) {
  const body = (await req.json()) as LookupQuery & { lite?: boolean };
  if (!body?.title) return NextResponse.json({ error: "title obrigatório" }, { status: 400 });
  const q: LookupQuery = { title: String(body.title).slice(0, 200), artist: String(body.artist || "").slice(0, 200), version: body.version, durationSec: body.durationSec, isrc: body.isrc };
  const ck = JSON.stringify([q.title.toLowerCase(), q.artist.toLowerCase(), q.isrc, !!body.lite]);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ readings: hit.data, cached: true });
  const readings = await lookupAll(q, { lite: body.lite });
  if (cache.size > 2000) cache.clear();
  cache.set(ck, { at: Date.now(), data: readings });
  return NextResponse.json({ readings });
}
