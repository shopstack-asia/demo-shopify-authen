import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCustomerProfile } from "@/lib/shopify-customer";
import { getCustomerProfileFromAdmin } from "@/lib/shopify-admin";

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json({ success: false, error: "not_authenticated" }, { status: 401 });
  }

  try {
    const hasCustomerAccountAccessToken = Boolean(session.accessToken);
    const hasCustomerId = Boolean(session.customerId);

    if (hasCustomerAccountAccessToken) {
      const profile = await getCustomerProfile(session.accessToken);
      return NextResponse.json({
        success: true,
        method: "customer_account_api",
        data: {
          customerPresent: Boolean(profile.customer),
          customerId: profile.customer?.id ?? null,
        },
      });
    }

    if (hasCustomerId) {
      const profile = await getCustomerProfileFromAdmin(session.customerId);
      return NextResponse.json({
        success: true,
        method: "admin_api",
        data: {
          customerPresent: Boolean(profile.customer),
          customerId: profile.customer?.id ?? session.customerId,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "missing_credentials_in_session" },
      { status: 401 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

