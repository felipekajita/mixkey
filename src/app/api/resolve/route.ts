import { NextResponse } from "next/server";
import { resolveLink } from "@/lib/links/resolve";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/resolve { url } → faixas de um link (Spotify, Deezer, Apple Music, YouTube, SoundCloud, Beatport…) */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !/^(https?:\/\/|spotify:)/.test(url)) return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  return NextResponse.json(await resolveLink(url.slice(0, 2000)));
}
