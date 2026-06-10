import { NextResponse, type NextRequest } from "next/server";
import { searchTextes, isLegifranceConfigured } from "@app/connectors-legifrance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json([]);
  if (!isLegifranceConfigured()) {
    return NextResponse.json(
      { error: "Légifrance non configuré", detail: "LEGIFRANCE_CLIENT_ID/SECRET absents." },
      { status: 503 },
    );
  }
  try {
    return NextResponse.json(await searchTextes(q, 6));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Échec de la recherche Légifrance", detail: message }, { status: 502 });
  }
}
