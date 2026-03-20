import { createHash } from "crypto";
import { Resend } from "resend";

export type SendOtpSmsResult = { success: true } | { success: false; error: string };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function sendOtpEmail(params: { to: string; otp: string }): Promise<void> {
  const resendApiKey = await requireEnv("RESEND_API_KEY");
  const resendFromEmail = await requireEnv("RESEND_FROM_EMAIL");

  const resend = new Resend(resendApiKey);
  const { to, otp } = params;

  await resend.emails.send({
    from: resendFromEmail,
    to,
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
}

/**
 * SMS is intentionally NOT implemented yet.
 * Keep this function signature so we can wire a provider (e.g. Twilio) later.
 */
export async function sendOtpSms(_params: { toPhoneE164: string; otp: string }): Promise<SendOtpSmsResult> {
  // Stub: SMS provider integration isn't wired yet, but we treat it as "sent"
  // so the login flow doesn't fail while you build the real SMS delivery.
  return { success: true };
}

