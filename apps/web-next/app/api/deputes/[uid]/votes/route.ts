import { NextResponse, type NextRequest } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le 1er appel télécharge/indexe l'open data Assemblée (cold start) : marge de temps.
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { uid: string } }) {
  const uid = decodeURIComponent(params.uid);
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 50) : 8;
  try {
    return NextResponse.json(await getRegistry().getVotes(uid, limit));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isUpstream = typeof e === "object" && e !== null && "url" in e;
    return NextResponse.json(
      { error: isUpstream ? "Échec de la source externe" : "Erreur interne", detail: message },
      { status: isUpstream ? 502 : 500 },
    );
  }
}
