import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.customerId = "";
  session.customerAccessToken = "";
  session.email = "";
  session.isLoggedIn = false;
  session.destroy();

  const loginUrl = "/login?returnTo=/profile";
  return NextResponse.json(
    { success: true, data: { redirectUrl: loginUrl } },
    { status: 200 }
  );
}
