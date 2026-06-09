import { NextResponse } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { uid: string } }) {
  const uid = decodeURIComponent(params.uid);
  try {
    const depute = await getRegistry().getDepute(uid);
    if (!depute) {
      return NextResponse.json({ error: "Personnalité introuvable" }, { status: 404 });
    }
    return NextResponse.json(depute);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isUpstream = typeof e === "object" && e !== null && "url" in e;
    return NextResponse.json(
      { error: isUpstream ? "Échec de la source externe" : "Erreur interne", detail: message },
      { status: isUpstream ? 502 : 500 },
    );
  }
}
