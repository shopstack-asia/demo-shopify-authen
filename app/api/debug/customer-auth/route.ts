import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function redactToken(token: string): { prefix: string; length: number } {
  return {
    prefix: token.slice(0, 12),
    length: token.length,
  };
}

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: "not_authenticated",
      },
      { status: 401 }
    );
  }

  const shopId = process.env.SHOPIFY_SHOP_ID;
  if (!shopId) {
    return NextResponse.json(
      { success: false, error: "Missing SHOPIFY_SHOP_ID" },
      { status: 500 }
    );
  }

  const tokenMeta = redactToken(session.accessToken);
  const url = `https://shopify.com/${shopId}/account/customer/api/2026-01/graphql`;
  const query = `query DebugCustomer { customer { id } }`;

  async function tryAuthHeader(authHeader: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ query }),
    });

    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: text.slice(0, 400),
    };
  }

  const bearerResult = await tryAuthHeader(`Bearer ${session.accessToken}`);
  const directResult = await tryAuthHeader(session.accessToken);

  return NextResponse.json({
    success: true,
    data: {
      session: {
        isLoggedIn: session.isLoggedIn,
        tokenMeta,
      },
      bearer: bearerResult,
      direct: directResult,
    },
  });
}

