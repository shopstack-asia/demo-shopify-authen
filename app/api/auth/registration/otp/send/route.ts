import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getSession } from "@/lib/session";
import { sendOtpEmail, sendOtpSms } from "@/lib/otp";

export const runtime = "nodejs";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  return trimmed.replace(/\D/g, "");
}

function isValidPhone(rawPhone: string): boolean {
  const normalized = normalizePhone(rawPhone);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{8,15}$/.test(digits);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { firstName?: unknown; lastName?: unknown; email?: unknown; phone?: unknown };
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    const session = await getSession();
    const reg = session.registration;
    if (!reg || reg.phase !== "collecting_additional_info") {
      return NextResponse.json({ success: false, error: "Registration step not initialized" }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return NextResponse.json({ success: false, error: "Missing name" }, { status: 400 });
    }

    // Which field do we need to verify next?
    // If initial OTP verified by email -> lock email and verify phone (additional)
    // If initial OTP verified by phone -> lock phone and verify email (additional)
    const nextAdditionalType = reg.verifiedType === "email" ? "phone" : "email";

    const otp = randomInt(100000, 999999).toString();
    const otpHashed = sha256Hex(otp);
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    session.isLoggedIn = false;
    session.customerId = "";
    session.accessToken = "";
    session.refreshToken = "";
    session.idToken = "";

    session.otpPurpose = "registration_additional";
    session.otpIdentifierType = nextAdditionalType;
    session.otpCode = otpHashed;
    session.otpExpiry = otpExpiry;

    if (nextAdditionalType === "phone") {
      if (!isValidPhone(phone)) {
        return NextResponse.json({ success: false, error: "Invalid phone number" }, { status: 400 });
      }
      const normalizedPhone = normalizePhone(phone);

      session.otpPhone = normalizedPhone;
      session.otpEmail = undefined;

      session.registration = {
        ...reg,
        phase: "waiting_additional_otp",
        firstName,
        lastName,
        additionalPhone: normalizedPhone,
      };

      await session.save();
      await sendOtpSms({ toPhoneE164: normalizedPhone, otp });
    } else {
      if (!isValidEmail(email)) {
        return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
      }
      const normalizedEmail = email.toLowerCase();

      session.otpEmail = normalizedEmail;
      session.otpPhone = undefined;

      session.registration = {
        ...reg,
        phase: "waiting_additional_otp",
        firstName,
        lastName,
        additionalEmail: normalizedEmail,
      };

      await session.save();
      await sendOtpEmail({ to: normalizedEmail, otp });
    }

    return NextResponse.json({ success: true, debugOtp: otp });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send OTP";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

