import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import RegistrationClient from "./RegistrationClient";

export default async function RegisterPage() {
  const session = await getSession();
  const reg = session.registration;

  if (!reg || reg.phase !== "collecting_additional_info") {
    redirect(`/api/internal/login?returnTo=/register&error=${encodeURIComponent("registration_not_initialized")}`);
  }

  return (
    <RegistrationClient
      verifiedType={reg.verifiedType}
      lockedEmail={reg.lockedEmail ?? ""}
      lockedPhone={reg.lockedPhone ?? ""}
      returnTo={reg.returnTo}
    />
  );
}

