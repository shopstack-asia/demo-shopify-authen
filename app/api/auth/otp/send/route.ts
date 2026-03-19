import { NextResponse } from "next/server";
import { randomInt, createHash } from "crypto";
import { Resend } from "resend";
import { getSession } from "@/lib/session";
import { getCustomerByEmailFromAdmin } from "@/lib/shopify-admin";

export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  // Simple pragmatic validation; Shopify lookup will be the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function requireEnv(name: string): Promise<string> {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export async function POST(req: Request) {
  let stage: "admin_lookup" | "resend_send" = "admin_lookup";
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    }

    // TODO: add rate limit per email + IP to prevent abuse.

    const session = await getSession();

    const customer = await getCustomerByEmailFromAdmin(email);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Email is not in the system" },
        { status: 400 }
      );
    }

    // Generate 6-digit numeric OTP.
    const otp = randomInt(100000, 999999).toString();
    const otpHashed = sha256Hex(otp);
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP in iron-session only (never return OTP to client).
    session.isLoggedIn = false;
    session.accessToken = "";
    session.refreshToken = "";
    session.idToken = "";
    session.customerId = "";

    session.email = email.toLowerCase();
    session.otpEmail = email.toLowerCase();
    session.otpCode = otpHashed;
    session.otpExpiry = otpExpiry;

    await session.save();

    const resendApiKey = await requireEnv("RESEND_API_KEY");
    const resendFromEmail = await requireEnv("RESEND_FROM_EMAIL");
    // Note: With from = onboarding@resend.dev, Resend only delivers to the email you signed up with.
    // To send OTP to any customer, verify your own domain in Resend and set RESEND_FROM_EMAIL to e.g. noreply@yourdomain.com.

    const resend = new Resend(resendApiKey);

    stage = "resend_send";
    await resend.emails.send({
      from: resendFromEmail,
      to: email,
      subject: "OTP code for login",
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
          <h2>Your OTP code</h2>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #000;">${otp}</p>
          <p>This code will expire in <strong>10 minutes</strong></p>
          <p style="color: #666; font-size: 12px;">If you didn’t request this, please ignore.</p>
        </div>
      `,
    });

    // Return OTP so you can see it on screen.
    const debugOtp = otp;
    return NextResponse.json({ success: true, debugOtp });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send OTP.";
    return NextResponse.json(
      { success: false, error: `${stage}: ${message}` },
      { status: 500 }
    );
  }
}

