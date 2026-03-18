import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { customerLogin, getCustomerProfile } from "@/lib/shopify";
import { getMultipassRedirectUrl } from "@/lib/multipass";

export interface LoginBody {
  email?: string;
  password?: string;
  returnTo?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function humanReadableError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("unable to find") || lower.includes("customer")) return "Invalid email or password.";
  if (lower.includes("password")) return "Invalid email or password.";
  if (lower.includes("throttl")) return "Too many attempts. Please try again later.";
  return message || "Something went wrong. Please try again.";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const returnTo = typeof body.returnTo === "string" ? body.returnTo : "/profile";

    if (!email || !password) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const result = await customerLogin(email, password);

    if (result.userErrors.length > 0) {
      const msg = result.userErrors[0]?.message ?? "Invalid credentials.";
      return NextResponse.json<ApiResponse>(
        { success: false, error: humanReadableError(msg) },
        { status: 400 }
      );
    }

    const token = result.customerAccessToken;
    if (!token?.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Could not create session." },
        { status: 400 }
      );
    }

    const profile = await getCustomerProfile(token.accessToken);
    const customer = profile.customer;
    if (!customer) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Could not load customer profile." },
        { status: 400 }
      );
    }

    const session = await getSession();
    session.customerId = customer.id;
    session.customerAccessToken = token.accessToken;
    session.email = customer.email;
    session.isLoggedIn = true;
    await session.save();

    let redirectUrl: string;
    if (process.env.SHOPIFY_MULTIPASS_SECRET) {
      try {
        redirectUrl = getMultipassRedirectUrl(customer.email, returnTo);
      } catch {
        redirectUrl = returnTo.startsWith("http") ? returnTo : `${request.nextUrl.origin}${returnTo}`;
      }
    } else {
      redirectUrl = returnTo.startsWith("http") ? returnTo : `${request.nextUrl.origin}${returnTo}`;
    }

    return NextResponse.json<ApiResponse<{ redirectUrl: string }>>({
      success: true,
      data: { redirectUrl },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed.";
    return NextResponse.json<ApiResponse>(
      { success: false, error: humanReadableError(message) },
      { status: 500 }
    );
  }
}
