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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown; otp?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ success: false, error: "OTP ต้องเป็นตัวเลข 6 หลัก" }, { status: 401 });
    }

    const session = await getSession();

    const otpEmail = session.otpEmail;
    const otpCode = session.otpCode;
    const otpExpiry = session.otpExpiry;

    // Validate OTP present in session.
    if (!otpEmail || !otpCode || typeof otpExpiry !== "number") {
      return NextResponse.json(
        { success: false, error: "OTP ไม่ถูกต้องหรือหมดอายุ" },
        { status: 401 }
      );
    }

    const normalizedEmail = email.toLowerCase();
    if (normalizedEmail !== otpEmail.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: "OTP ไม่ถูกต้องหรือหมดอายุ" },
        { status: 401 }
      );
    }

    // Expiry check (always before hash compare).
    if (Date.now() >= otpExpiry) {
      session.otpEmail = undefined;
      session.otpCode = undefined;
      session.otpExpiry = undefined;
      await session.save();

      return NextResponse.json(
        { success: false, error: "OTP หมดอายุแล้ว" },
        { status: 401 }
      );
    }

    const otpHashed = sha256Hex(otp);
    const isValid = constantTimeCompareHex(otpCode, otpHashed);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "OTP ไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    const customer = await getCustomerByEmailFromAdmin(email);
    if (!customer) {
      // OTP was for an email that existed at send time; treat missing customer as failure.
      return NextResponse.json(
        { success: false, error: "ไม่พบบัญชีผู้ใช้ในระบบ" },
        { status: 401 }
      );
    }

    // Verify success: update session. Remove OTP fields immediately.
    session.isLoggedIn = true;
    session.customerId = customer.id;
    session.email = normalizedEmail;

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

    return NextResponse.json({
      success: true,
      // After custom OTP verify, start Shopify OAuth login to obtain accessToken.
      redirectUrl: "/api/auth/login?returnTo=/profile",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify OTP.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

