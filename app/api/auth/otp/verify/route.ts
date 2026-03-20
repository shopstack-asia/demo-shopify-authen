import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getSession } from "@/lib/session";
import { getCustomerByEmailFromAdmin } from "@/lib/shopify-admin";

export const runtime = "nodejs";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function constantTimeCompareHex(aHex: string, bHex: string): boolean {
  // Compare SHA256 hex strings in constant time.
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sanitizeReturnTo(input: unknown): string {
  const value = typeof input === "string" ? input : "";
  if (!value) return "/profile";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/profile";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown; otp?: unknown; returnTo?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const returnTo = sanitizeReturnTo(body.returnTo);

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, error: "OTP must be a 6-digit number" },
        { status: 401 }
      );
    }

    const session = await getSession();

    const otpEmail = session.otpEmail;
    const otpCode = session.otpCode;
    const otpExpiry = session.otpExpiry;

    // Validate OTP present in session.
    if (!otpEmail || !otpCode || typeof otpExpiry !== "number") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    const otpEmailLower = otpEmail.toLowerCase();
    if (email) {
      const normalizedProvidedEmail = email.toLowerCase();
      if (normalizedProvidedEmail !== otpEmailLower) {
        return NextResponse.json(
          { success: false, error: "Invalid or expired OTP" },
          { status: 401 }
        );
      }
    }

    // Expiry check (always before hash compare).
    if (Date.now() >= otpExpiry) {
      session.otpEmail = undefined;
      session.otpCode = undefined;
      session.otpExpiry = undefined;
      await session.save();

      return NextResponse.json(
        { success: false, error: "OTP has expired" },
        { status: 401 }
      );
    }

    const otpHashed = sha256Hex(otp);
    const isValid = constantTimeCompareHex(otpCode, otpHashed);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid OTP" },
        { status: 401 }
      );
    }

    const customer = await getCustomerByEmailFromAdmin(otpEmailLower);
    if (!customer) {
      // OTP was for an email that existed at send time; treat missing customer as failure.
      return NextResponse.json(
        { success: false, error: "Account not found in the system" },
        { status: 401 }
      );
    }

    // Verify success: update session. Remove OTP fields immediately.
    session.isLoggedIn = true;
    session.customerId = customer.id;
    session.email = otpEmailLower;

    session.accessToken = "";
    session.refreshToken = "";
    session.idToken = "";
    session.nonce = "";
    session.state = "";
    session.codeVerifier = "";

    session.otpEmail = undefined;
    session.otpCode = undefined;
    session.otpExpiry = undefined;

    await session.save();

    // Redirect to the original target directly and keep the existing session cookie so
    // user can open /profile via direct URL without re-auth flow.
    const redirectUrl = returnTo;

    return NextResponse.json({
      success: true,
      redirectUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify OTP.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

