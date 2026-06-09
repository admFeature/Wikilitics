import { NextResponse, type NextRequest } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La 1re recherche précharge l'annuaire CIVIX (plusieurs requêtes) : on laisse du temps.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q === "") {
    return NextResponse.json({ error: "Paramètre q requis" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getRegistry().search(q));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Réponse d'erreur lisible (jamais opaque) : message + détail amont. */
function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  // Les UpstreamError du client HTTP exposent url/status : on remonte en 502.
  const isUpstream = typeof e === "object" && e !== null && "url" in e;
  return NextResponse.json(
    { error: isUpstream ? "Échec de la source externe" : "Erreur interne", detail: message },
    { status: isUpstream ? 502 : 500 },
  );
}
