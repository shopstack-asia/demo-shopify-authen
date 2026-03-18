import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getCustomerProfile } from "@/lib/shopify";
import type { ShopifyAddress, ShopifyOrder, ShopifyMetafield } from "@/lib/shopify";
import LogoutButton from "./LogoutButton";

function formatAddress(addr: ShopifyAddress): string {
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province,
    addr.zip,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

function FinancialStatusBadge({ status }: { status?: string }) {
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

function FulfillmentStatusBadge({ status }: { status?: string }) {
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

export default async function ProfilePage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.customerAccessToken) {
    redirect("/login?returnTo=/profile");
  }

  let customer;
  try {
    const profile = await getCustomerProfile(session.customerAccessToken);
    customer = profile.customer;
  } catch {
    redirect("/login?returnTo=/profile");
  }

  if (!customer) {
    redirect("/login?returnTo=/profile");
  }

  const nameInitials = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const initials = nameInitials || (customer.email[0]?.toUpperCase() ?? "?");

  const orders = customer.orders?.nodes ?? [];
  const addresses = customer.addresses?.nodes ?? [];
  const metafields = customer.metafields?.nodes ?? [];

  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Profile Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display text-xl font-semibold"
              aria-hidden
            >
              {initials}
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-white">
                {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Account"}
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">{customer.email}</p>
              {customer.phone && (
                <p className="text-slate-400 text-sm">{customer.phone}</p>
              )}
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

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            {/* Default Address */}
            {customer.defaultAddress && (
              <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:border-white/15 transition">
                <h2 className="font-display text-lg font-semibold text-white mb-3">
                  Default address
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {formatAddress(customer.defaultAddress)}
                </p>
                <button
                  type="button"
                  className="mt-3 text-sm text-amber-400/90 hover:text-amber-400"
                >
                  Change
                </button>
              </section>
            )}

            {/* All Addresses */}
            {addresses.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:border-white/15 transition">
                <h2 className="font-display text-lg font-semibold text-white mb-4">
                  Addresses
                </h2>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-slate-400">
                          {formatAddress(addr)}
                        </span>
                        {customer.defaultAddress?.id === addr.id && (
                          <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                            Default
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Order History */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:border-white/15 transition">
              <h2 className="font-display text-lg font-semibold text-white mb-4">
                Order history
              </h2>
              {orders.length === 0 ? (
                <p className="text-slate-400 text-sm">No orders yet.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((order: ShopifyOrder) => (
                    <div
                      key={order.id}
                      className="rounded-xl border border-white/5 bg-black/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-white">
                            #{order.orderNumber ?? order.id.split("/").pop()}
                          </span>
                          <FinancialStatusBadge status={order.financialStatus} />
                          <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                        </div>
                        <p className="text-slate-400 text-sm">
                          {order.processedAt
                            ? new Date(order.processedAt).toLocaleDateString()
                            : "—"}
                        </p>
                        {order.totalPrice && (
                          <p className="text-slate-300 text-sm mt-1">
                            {order.totalPrice.currencyCode}{" "}
                            {order.totalPrice.amount}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {order.lineItems?.nodes?.slice(0, 3).map((line, i) => (
                          <div
                            key={i}
                            className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 overflow-hidden"
                          >
                            {line.variant?.image?.url ? (
                              <img
                                src={line.variant.image.url}
                                alt={line.variant.image.altText ?? line.title}
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

          <div className="space-y-8">
            {/* Metafields */}
            {metafields.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:border-white/15 transition">
                <h2 className="font-display text-lg font-semibold text-white mb-4">
                  Custom fields
                </h2>
                <dl className="space-y-2">
                  {metafields.map((mf: ShopifyMetafield) => (
                    <div key={`${mf.namespace}.${mf.key}`}>
                      <dt className="text-slate-400 text-xs font-medium">
                        {mf.namespace}.{mf.key}
                      </dt>
                      <dd className="text-slate-200 text-sm mt-0.5">{mf.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
