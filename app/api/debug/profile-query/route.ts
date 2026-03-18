import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCustomerProfile } from "@/lib/shopify-customer";

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.accessToken) {
    return NextResponse.json(
      { success: false, error: "not_authenticated" },
      { status: 401 }
    );
  }

  try {
    const profile = await getCustomerProfile(session.accessToken);
    return NextResponse.json({
      success: true,
      data: {
        customerPresent: Boolean(profile.customer),
        customerId: profile.customer?.id ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    // Avoid leaking full token; just report the error.
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

