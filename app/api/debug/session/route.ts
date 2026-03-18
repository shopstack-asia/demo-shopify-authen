import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const accessTokenPrefix = session.accessToken
    ? session.accessToken.slice(0, 10)
    : null;

  return NextResponse.json({
    success: true,
    data: {
      isLoggedIn: session.isLoggedIn,
      hasAccessToken: Boolean(session.accessToken),
      accessTokenPrefix,
      customerId: session.customerId ? String(session.customerId).slice(0, 30) : null,
    },
  });
}

