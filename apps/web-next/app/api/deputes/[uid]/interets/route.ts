import { NextResponse } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { uid: string } }) {
  const uid = decodeURIComponent(params.uid);
  try {
    const decl = await getRegistry().getInterets(uid);
    return NextResponse.json(decl);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Erreur déclaration d'intérêts", detail: message }, { status: 500 });
  }
}
