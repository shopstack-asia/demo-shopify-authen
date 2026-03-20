import { NextResponse } from "next/server";
import { randomInt, createHash } from "crypto";
import { getSession } from "@/lib/session";
import { getCustomerByEmailFromAdmin, getCustomerByPhoneFromAdmin } from "@/lib/shopify-admin";
import { sendOtpEmail, sendOtpSms } from "@/lib/otp";

export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  // Simple pragmatic validation; Shopify lookup will be the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  // Keep leading '+' (if present), strip everything else to digits.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  return trimmed.replace(/\D/g, "");
}

function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{8,15}$/.test(digits);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  let stage: "admin_lookup" | "resend_send" | "sms_send" = "admin_lookup";
  try {
    const body = (await req.json()) as { identifier?: unknown; email?: unknown; phone?: unknown };
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const emailFromBody = typeof body.email === "string" ? body.email.trim() : "";
    const phoneFromBody = typeof body.phone === "string" ? body.phone.trim() : "";

    const candidate = emailFromBody || identifier || phoneFromBody;
    if (!candidate) {
      return NextResponse.json({ success: false, error: "Invalid email or phone" }, { status: 400 });
    }

    const inputIsEmail = Boolean(emailFromBody) || isValidEmail(candidate);
    const email = inputIsEmail ? candidate : "";
    const phone = !inputIsEmail ? candidate : "";
    const normalizedPhone = phone ? normalizePhone(phone) : "";

    if (inputIsEmail) {
      if (!isValidEmail(email)) {
        return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
      }
    } else {
      if (!normalizedPhone || !isValidPhone(phone)) {
        return NextResponse.json({ success: false, error: "Invalid email or phone" }, { status: 400 });
      }
    }

    // TODO: add rate limit per email + IP to prevent abuse.

    const session = await getSession();

    const customer = inputIsEmail
      ? await getCustomerByEmailFromAdmin(email)
      : await getCustomerByPhoneFromAdmin(normalizedPhone);
    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: inputIsEmail ? "Email is not in the system" : "Phone number is not in the system",
        },
        { status: 400 }
      );
    }

    const destinationEmail = inputIsEmail ? email.toLowerCase() : (customer.email ?? "").toLowerCase();
    if (!destinationEmail) {
      return NextResponse.json(
        { success: false, error: "Phone number has no email associated in the system" },
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

    session.email = destinationEmail;
    session.otpEmail = destinationEmail;
    session.otpCode = otpHashed;
    session.otpExpiry = otpExpiry;

    await session.save();

    if (inputIsEmail) {
      // Email-based OTP (current implementation).
      stage = "resend_send";
      await sendOtpEmail({ to: destinationEmail, otp });
    } else {
      // Phone-based OTP: call SMS sender (stub for now),
      // but do NOT send OTP via email.
      stage = "sms_send";
      await sendOtpSms({ toPhoneE164: normalizedPhone, otp });
    }

    // Return OTP so you can see it on screen.
    const debugOtp = otp;
    return NextResponse.json({ success: true, debugOtp, destinationEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send OTP.";
    return NextResponse.json(
      { success: false, error: `${stage}: ${message}` },
      { status: 500 }
    );
  }
}

