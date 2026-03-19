import { NextResponse } from "next/server";
import { getJwks } from "@/lib/oidc/jwks";

export const runtime = "nodejs";

export async function GET() {
  const jwks = await getJwks();
  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
