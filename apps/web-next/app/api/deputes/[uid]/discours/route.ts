import { NextResponse, type NextRequest } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { uid: string } }) {
  const uid = decodeURIComponent(params.uid);
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? 6);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 20) : 6;
  try {
    return NextResponse.json(await getRegistry().getDiscours(uid, limit));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Erreur discours", detail: message }, { status: 500 });
  }
}
