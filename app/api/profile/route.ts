import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCustomerProfile } from "@/lib/shopify-customer";
import { getCustomerProfileFromAdmin } from "@/lib/shopify-admin";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function GET() {
  const session = await getSession();

  const hasCustomerAccountAccessToken = Boolean(session.accessToken);
  const hasCustomerId = Boolean(session.customerId);

  if (!session.isLoggedIn || (!hasCustomerAccountAccessToken && !hasCustomerId)) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const profile = hasCustomerAccountAccessToken
      ? await getCustomerProfile(session.accessToken)
      : await getCustomerProfileFromAdmin(session.customerId);
    if (!profile.customer) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }
    return NextResponse.json<ApiResponse<typeof profile.customer>>({
      success: true,
      data: profile.customer,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profile.";
    return NextResponse.json<ApiResponse>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
