import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/oidc/jwt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  try {
    const claims = await verifyAccessToken(token);
    return NextResponse.json(
      {
        sub: claims.sub,
        email: claims.email,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } }
    );
  }
}
