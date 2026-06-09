import { NextResponse } from "next/server";
import { getRegistry } from "@app/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getRegistry().about());
}
