import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getSession } from "@/lib/session";
import {
  createCustomerInAdmin,
  getCustomerByEmailFromAdmin,
  getCustomerByPhoneFromAdmin,
  updateCustomerInAdmin,
} from "@/lib/shopify-admin";

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
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return "/profile";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/profile";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { otp?: unknown; returnTo?: unknown; email?: unknown };
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const returnTo = sanitizeReturnTo(body.returnTo);

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, error: "OTP must be a 6-digit number" },
        { status: 401 }
      );
    }

    const session = await getSession();
    const otpPurpose = session.otpPurpose ?? "login";
    const otpIdentifierType = session.otpIdentifierType;

    const otpEmail = session.otpEmail;
    const otpPhone = session.otpPhone;
    const otpCode = session.otpCode;
    const otpExpiry = session.otpExpiry;

    const otpIdentifier =
      otpIdentifierType === "email" ? otpEmail : otpIdentifierType === "phone" ? otpPhone : undefined;

    // Validate OTP present in session.
    if (!otpIdentifierType || !otpIdentifier || !otpCode || typeof otpExpiry !== "number") {
      return NextResponse.json({ success: false, error: "Invalid or expired OTP" }, { status: 401 });
    }

    // Expiry check (always before hash compare).
    if (Date.now() >= otpExpiry) {
      session.otpEmail = undefined;
      session.otpPhone = undefined;
      session.otpCode = undefined;
      session.otpExpiry = undefined;
      session.otpPurpose = undefined;
      session.otpIdentifierType = undefined;
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

    if (otpPurpose === "login") {
      // Login OTP path: if customer exists -> login; else -> registration.
      const otpEmailLower = otpIdentifierType === "email" ? otpEmail!.toLowerCase() : "";
      const otpPhoneValue = otpIdentifierType === "phone" ? otpPhone! : "";

      const customer =
        otpIdentifierType === "email"
          ? await getCustomerByEmailFromAdmin(otpEmailLower)
          : await getCustomerByPhoneFromAdmin(otpPhoneValue);

      if (customer) {
        session.isLoggedIn = true;
        session.customerId = customer.id;
        session.email = customer.email ? customer.email.toLowerCase() : otpEmailLower;

        session.accessToken = "";
        session.refreshToken = "";
        session.idToken = "";
        session.nonce = "";
        session.state = "";
        session.codeVerifier = "";

        session.registration = undefined;

        session.otpEmail = undefined;
        session.otpPhone = undefined;
        session.otpPurpose = undefined;
        session.otpIdentifierType = undefined;
        session.otpCode = undefined;
        session.otpExpiry = undefined;

        await session.save();
        return NextResponse.json({ success: true, redirectUrl: returnTo });
      }

      // Customer not found -> go to registration step.
      session.isLoggedIn = false;
      session.customerId = "";
      session.email = "";

      session.registration = {
        phase: "collecting_additional_info",
        returnTo,
        verifiedType: otpIdentifierType,
        lockedEmail: otpIdentifierType === "email" ? otpEmailLower : undefined,
        lockedPhone: otpIdentifierType === "phone" ? otpPhoneValue : undefined,
      };

      session.otpEmail = undefined;
      session.otpPhone = undefined;
      session.otpPurpose = undefined;
      session.otpIdentifierType = undefined;
      session.otpCode = undefined;
      session.otpExpiry = undefined;

      await session.save();
      return NextResponse.json({ success: true, redirectUrl: "/register" });
    }

    if (otpPurpose === "registration_additional") {
      const reg = session.registration;
      if (!reg || reg.phase !== "waiting_additional_otp") {
        return NextResponse.json({ success: false, error: "Registration context missing" }, { status: 400 });
      }

      const expectedAdditionalType = reg.verifiedType === "email" ? "phone" : "email";
      if (otpIdentifierType !== expectedAdditionalType) {
        return NextResponse.json(
          { success: false, error: "OTP type does not match registration step" },
          { status: 400 }
        );
      }

      const firstName = (reg.firstName ?? "").trim();
      const lastName = (reg.lastName ?? "").trim();
      const emailForCreate = reg.verifiedType === "email" ? reg.lockedEmail ?? "" : reg.additionalEmail ?? "";
      const phoneForCreate = reg.verifiedType === "phone" ? reg.lockedPhone ?? "" : reg.additionalPhone ?? "";

      if (!firstName || !lastName || !emailForCreate || !phoneForCreate) {
        return NextResponse.json({ success: false, error: "Missing registration fields" }, { status: 400 });
      }

      const redirectUrl = reg.returnTo || returnTo;

      // Requirement:
      // - After OTP passes, look up Shopify customer by the *additional* contact the user provided.
      // - If found => update it
      // - If not found => create a new one
      const additionalLookupValue =
        expectedAdditionalType === "email" ? emailForCreate.toLowerCase() : phoneForCreate;

      const existing =
        expectedAdditionalType === "email"
          ? await getCustomerByEmailFromAdmin(additionalLookupValue)
          : await getCustomerByPhoneFromAdmin(additionalLookupValue);

      const customerInput = {
        firstName,
        lastName,
        email: emailForCreate.toLowerCase(),
        phone: phoneForCreate,
      };

      const createdOrUpdated = existing
        ? await updateCustomerInAdmin(existing.id, customerInput)
        : await createCustomerInAdmin(customerInput);

      // Verify success: update session and login.
      session.isLoggedIn = true;
      session.customerId = createdOrUpdated.id;
      session.email = createdOrUpdated.email ? createdOrUpdated.email.toLowerCase() : emailForCreate.toLowerCase();

      session.accessToken = "";
      session.refreshToken = "";
      session.idToken = "";
      session.nonce = "";
      session.state = "";
      session.codeVerifier = "";

      session.registration = undefined;

      session.otpEmail = undefined;
      session.otpPhone = undefined;
      session.otpPurpose = undefined;
      session.otpIdentifierType = undefined;
      session.otpCode = undefined;
      session.otpExpiry = undefined;

      await session.save();

      return NextResponse.json({ success: true, redirectUrl });
    }

    return NextResponse.json({ success: false, error: "Invalid OTP purpose" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify OTP.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

