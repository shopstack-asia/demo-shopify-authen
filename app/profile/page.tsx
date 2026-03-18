import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getCustomerProfile } from "@/lib/shopify-customer";
import type { ShopifyCustomerAddress, ShopifyCustomerOrder } from "@/lib/shopify-customer";
import LogoutButton from "./LogoutButton";

function formatAddress(addr: ShopifyCustomerAddress): string {
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province,
    addr.zip,
    addr.country,
  ].filter((p) => typeof p === "string" && p.trim().length > 0);
  return parts.join(", ");
}

function FinancialStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const map: Record<string, string> = {
    PAID: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    PENDING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    REFUNDED: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  const cls = map[status] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function FulfillmentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const map: Record<string, string> = {
    FULFILLED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    UNFULFILLED: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    PARTIAL: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  const cls = map[status] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ProfileSkeleton() {
  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-6 md:grid-cols-[240px,1fr]">
        <aside className="hidden md:block rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="h-5 w-24 bg-white/10 rounded mb-4 animate-pulse" />
          <div className="space-y-3">
            <div className="h-10 bg-white/5 border border-white/10 rounded animate-pulse" />
            <div className="h-10 bg-white/5 border border-white/10 rounded animate-pulse" />
            <div className="h-10 bg-white/5 border border-white/10 rounded animate-pulse" />
          </div>
        </aside>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 animate-pulse" />
            <div className="flex-1">
              <div className="h-5 w-52 bg-white/10 rounded animate-pulse mb-2" />
              <div className="h-4 w-64 bg-white/10 rounded animate-pulse" />
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="h-48 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
            <div className="h-48 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
          </div>
          <div className="mt-6 h-64 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
        </section>
      </div>
    </main>
  );
}

async function ProfileContent() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.accessToken) {
    redirect("/login?returnTo=/profile");
  }

  let customer = null as null | {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: { emailAddress: string } | null;
    phoneNumber: { phoneNumber: string } | null;
    defaultAddress: ShopifyCustomerAddress | null;
    addresses: { nodes: ShopifyCustomerAddress[] } | null;
    orders: { nodes: ShopifyCustomerOrder[] } | null;
  };

  try {
    const profile = await getCustomerProfile(session.accessToken);
    customer = profile.customer;
  } catch {
    redirect("/login?returnTo=/profile");
  }

  if (!customer) redirect("/login?returnTo=/profile");

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  const initials =
    [customer.firstName, customer.lastName]
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  const email = customer.emailAddress?.emailAddress ?? "";
  const phone = customer.phoneNumber?.phoneNumber ?? null;
  const addresses = customer.addresses?.nodes ?? [];
  const orders = customer.orders?.nodes ?? [];

  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-6 md:grid-cols-[240px,1fr]">
        {/* Sidebar */}
        <aside className="hidden md:block rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-white font-display font-semibold mb-5">Account</div>
          <nav className="space-y-2">
            <a
              href="#profile"
              className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-200 hover:border-white/20"
            >
              Profile
            </a>
            <a
              href="#addresses"
              className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-200 hover:border-white/20"
            >
              Addresses
            </a>
            <a
              href="#orders"
              className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-200 hover:border-white/20"
            >
              Orders
            </a>
          </nav>
          <div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-400">
            Signed in via Shopify OTP
          </div>
        </aside>

        {/* Content */}
        <section id="profile" className="rounded-2xl border border-white/10 bg-white/5 p-6">
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display text-xl font-semibold"
                aria-hidden
              >
                {initials}
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold text-white">
                  {name || "Account"}
                </h1>
                <div className="text-slate-400 text-sm mt-0.5">{email}</div>
                {phone && <div className="text-slate-400 text-sm mt-0.5">{phone}</div>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
              >
                Edit Profile
              </button>
              <LogoutButton />
            </div>
          </header>

          {/* Cards */}
          <div className="mt-7 grid gap-6 lg:grid-cols-2">
            {/* Default address */}
            <section className="rounded-2xl border border-white/10 bg-black/20 p-5" id="addresses">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-display text-lg font-semibold text-white">Default address</h2>
                <button
                  type="button"
                  className="text-sm text-amber-400/90 hover:text-amber-400 transition"
                >
                  Change
                </button>
              </div>
              {customer.defaultAddress ? (
                <p className="text-slate-300 text-sm leading-relaxed">
                  {formatAddress(customer.defaultAddress)}
                  {customer.defaultAddress.phoneNumber ? (
                    <>
                      <br />
                      {customer.defaultAddress.phoneNumber}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-slate-400 text-sm">No default address.</p>
              )}

              <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="font-display text-base font-semibold text-white mb-3">All addresses</h3>
                {addresses.length === 0 ? (
                  <p className="text-slate-400 text-sm">No saved addresses.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-slate-300">{formatAddress(addr)}</div>
                          {customer.defaultAddress?.id === addr.id ? (
                            <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                              Default
                            </span>
                          ) : null}
                        </div>
                        {addr.phoneNumber ? (
                          <div className="text-slate-400 text-xs mt-1">{addr.phoneNumber}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Orders */}
            <section className="rounded-2xl border border-white/10 bg-black/20 p-5" id="orders">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold text-white">Order history</h2>
                <div className="text-slate-400 text-xs mt-1">Recent orders from Shopify</div>
              </div>
              {orders.length === 0 ? (
                <p className="text-slate-400 text-sm">No orders yet.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-xl border border-white/5 bg-black/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-white">
                            #{order.number ?? order.id.split("/").pop()}
                          </span>
                          <FinancialStatusBadge status={order.financialStatus} />
                          <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                        </div>
                        <p className="text-slate-400 text-sm">
                          {order.processedAt ? new Date(order.processedAt).toLocaleDateString() : "—"}
                        </p>
                        {order.totalPrice ? (
                          <p className="text-slate-300 text-sm mt-1">
                            {order.totalPrice.currencyCode} {order.totalPrice.amount}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {order.lineItems?.nodes?.slice(0, 3).map((line, i) => (
                          <div
                            key={`${line.title}-${i}`}
                            className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 overflow-hidden"
                          >
                            {line.image?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={line.image.url}
                                alt={line.image.altText ?? line.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                {line.quantity}×
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

