import type {
  ShopifyCustomerAddress,
  ShopifyCustomerOrder,
  ShopifyCustomerProfile,
} from "@/lib/shopify-customer";
import type { ShopifyCustomerOrderLineItem } from "@/lib/shopify-customer";
import { getAdminAccessToken } from "./shopify-admin-token";

const ADMIN_API_VERSION = "2026-01";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

const ADMIN_API_ENDPOINT = (): string => {
  const storeDomain = requireEnv("SHOPIFY_MYSHOPIFY_DOMAIN");
  return `https://${storeDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
};

type GraphQLError = { message: string };
type GraphQLResponse<T> = { data?: T; errors?: GraphQLError[] };

export async function shopifyAdminFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = await getAdminAccessToken();

  const response = await fetch(ADMIN_API_ENDPOINT(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(
      `Shopify Admin GraphQL error (${response.status} ${response.statusText}): ${JSON.stringify(
        json.errors
      )}`
    );
  }
  if (!json.data) {
    throw new Error("Shopify Admin API returned no data.");
  }

  return json.data;
}

export type AdminCustomerLookup = {
  id: string;
  firstName?: string | null;
  email?: string | null;
  state?: string | null;
} | null;

export async function getCustomerByEmailFromAdmin(email: string): Promise<AdminCustomerLookup> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return null;

  // Shopify search syntax: exact email match requires email:"..."
  const searchQuery = `email:"${normalizedEmail.replace(/"/g, '\\"')}"`;

  const query = `
    query GetCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            firstName
            email
            state
          }
        }
      }
    }
  `;

  const data = await shopifyAdminFetch<{
    customers: {
      edges: Array<{
        node?: {
          id: string;
          firstName?: string | null;
          email?: string | null;
          state?: string | null;
        } | null;
      }>;
    };
  }>(query, { query: searchQuery });

  const edge = data.customers.edges[0];
  const node = edge?.node ?? null;
  return node
    ? {
        id: node.id,
        firstName: node.firstName ?? null,
        email: node.email ?? null,
        state: node.state ?? null,
      }
    : null;
}

function normalizePhoneForLookup(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  // Keep leading '+' (if present), strip everything else to digits.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  return trimmed.replace(/\D/g, "");
}

export async function getCustomerByPhoneFromAdmin(phone: string): Promise<AdminCustomerLookup> {
  const normalized = normalizePhoneForLookup(phone);
  if (!normalized) return null;

  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (!digits) return null;

  // Shopify's "phone" field matching can be tokenized; try a few common representations.
  const candidates = new Set<string>();
  candidates.add(digits);
  candidates.add(`+${digits}`);
  if (digits.length > 10) {
    candidates.add(digits.slice(-10));
    candidates.add(`+${digits.slice(-10)}`);
  }

  const query = `
    query GetCustomerByPhone($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            firstName
            email
            state
          }
        }
      }
    }
  `;

  for (const candidate of Array.from(candidates)) {
    const searchQuery = `phone:"${candidate.replace(/"/g, '\\"')}"`;
    const data = await shopifyAdminFetch<{
      customers: {
        edges: Array<{
          node?: {
            id: string;
            firstName?: string | null;
            email?: string | null;
            state?: string | null;
          } | null;
        }>;
      };
    }>(query, { query: searchQuery });

    const edge = data.customers.edges[0];
    const node = edge?.node ?? null;
    if (!node) continue;

    return {
      id: node.id,
      firstName: node.firstName ?? null,
      email: node.email ?? null,
      state: node.state ?? null,
    };
  }

  return null;
}

function toCustomerOrderLineItem(line: {
  title?: string | null;
  quantity?: number | null;
  image?: { url?: string | null; altText?: string | null } | null;
}): ShopifyCustomerOrderLineItem {
  return {
    title: line.title ?? "Item",
    quantity: typeof line.quantity === "number" ? line.quantity : 0,
    image: line.image
      ? {
          url: line.image.url ?? null,
          altText: line.image.altText ?? null,
        }
      : null,
  };
}

function toCustomerOrder(order: {
  id: string;
  name?: string | null;
  processedAt?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null;
  lineItems?: { nodes?: Array<unknown> | null } | null;
}): ShopifyCustomerOrder {
  // Admin "name" is typically something like "#1001" or "1001".
  const digits = (order.name ?? "").replace(/\D/g, "");
  const parsedNumber = digits ? Number.parseInt(digits, 10) : NaN;

  const total = order.totalPriceSet?.shopMoney;
  const totalPrice =
    total && typeof total.amount === "string" && typeof total.currencyCode === "string"
      ? { amount: total.amount, currencyCode: total.currencyCode }
      : null;

  const lineNodes = order.lineItems?.nodes ?? [];
  const mappedLines: ShopifyCustomerOrderLineItem[] = Array.isArray(lineNodes)
    ? (lineNodes as Array<{
        title?: string | null;
        quantity?: number | null;
        image?: { url?: string | null; altText?: string | null } | null;
      }>).map((l) => toCustomerOrderLineItem(l))
    : [];

  return {
    id: order.id,
    number: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null,
    processedAt: order.processedAt ?? null,
    totalPrice,
    lineItems: { nodes: mappedLines },
  };
}

function toCustomerAddress(address: {
  id: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
}): ShopifyCustomerAddress {
  return {
    id: address.id,
    address1: address.address1 ?? null,
    address2: address.address2 ?? null,
    city: address.city ?? null,
    province: address.province ?? null,
    country: address.country ?? null,
    zip: address.zip ?? null,
    phoneNumber: address.phone ?? null,
  };
}

export async function getCustomerProfileFromAdmin(customerId: string): Promise<ShopifyCustomerProfile> {
  // Admin API scopes might not allow `orders` for the configured token.
  // If that happens, we still want profile + addresses to work.
  const customerBasicsQuery = `
    query GetCustomerBasics($id: ID!) {
      customer(id: $id) {
        id
        firstName
        lastName
        email
        phone
        defaultAddress {
          id
          address1
          address2
          city
          province
          country
          zip
          phone
        }
        addresses(first: 5) {
          id
          address1
          address2
          city
          province
          country
          zip
          phone
        }
      }
    }
  `;

  const basicsData = await shopifyAdminFetch<{
    customer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      defaultAddress: {
        id: string;
        address1: string | null;
        address2: string | null;
        city: string | null;
        province: string | null;
        country: string | null;
        zip: string | null;
        phone: string | null;
      } | null;
      // Depending on the Admin GraphQL schema, this may be either a connection (with `nodes`)
      // or a list-like collection.
      addresses:
        | Array<{
            id: string;
            address1: string | null;
            address2: string | null;
            city: string | null;
            province: string | null;
            country: string | null;
            zip: string | null;
            phone: string | null;
          }>
        | {
            nodes: Array<{
              id: string;
              address1: string | null;
              address2: string | null;
              city: string | null;
              province: string | null;
              country: string | null;
              zip: string | null;
              phone: string | null;
            }>;
          }
        | null;
    } | null;
  }>(customerBasicsQuery, { id: customerId });

  const customer = basicsData.customer;
  if (!customer) {
    throw new Error("Customer not found in Admin API.");
  }

  const defaultAddress = customer.defaultAddress ? toCustomerAddress(customer.defaultAddress) : null;
  const addressList = Array.isArray(customer.addresses)
    ? customer.addresses
    : (customer.addresses as { nodes?: unknown } | null)?.nodes;
  const addresses = Array.isArray(addressList) ? addressList.map((a) => toCustomerAddress(a)) : [];

  // Fetch orders separately so "Access denied for orders field" doesn't break the whole profile.
  let orders: ShopifyCustomerOrder[] = [];
  try {
    const ordersQuery = `
      query GetCustomerOrders($id: ID!) {
        customer(id: $id) {
          orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
            nodes {
              id
              name
              processedAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              lineItems(first: 5) {
                nodes {
                  title
                  quantity
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    `;

    const ordersData = await shopifyAdminFetch<{
      customer: {
        orders: {
          nodes: Array<{
            id: string;
            name: string | null;
            processedAt: string | null;
            totalPriceSet: {
              shopMoney: { amount: string | null; currencyCode: string | null } | null;
            } | null;
            lineItems: {
              nodes: Array<{
                title: string | null;
                quantity: number | null;
                image: { url: string | null; altText: string | null } | null;
              }>;
            } | null;
          }>;
        } | null;
      } | null;
    }>(ordersQuery, { id: customerId });

    const orderNodes = ordersData.customer?.orders?.nodes ?? [];
    if (Array.isArray(orderNodes)) {
      orders = orderNodes.map((o) =>
        toCustomerOrder({
          id: o.id,
          name: o.name ?? null,
          processedAt: o.processedAt ?? null,
          totalPriceSet: o.totalPriceSet ?? null,
          lineItems: o.lineItems
            ? {
                nodes: o.lineItems.nodes ?? null,
              }
            : null,
        })
      );
    }
  } catch (err) {
    // If the configured token can't read orders, just omit order history.
    const message = err instanceof Error ? err.message : "";
    if (message.includes("ACCESS_DENIED") || message.toLowerCase().includes("access denied")) {
      orders = [];
    } else {
      // For unexpected errors, rethrow so you notice real issues.
      throw err;
    }
  }

  return {
    customer: {
      id: customer.id,
      firstName: customer.firstName ?? "",
      lastName: customer.lastName ?? "",
      emailAddress: customer.email ? { emailAddress: customer.email } : null,
      phoneNumber: customer.phone ? { phoneNumber: customer.phone } : null,
      defaultAddress,
      addresses: { nodes: addresses },
      orders: { nodes: orders },
    },
  };
}

export async function createCustomerInAdmin(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ id: string; email?: string | null }> {
  const mutation = `
    mutation CustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  type CustomerCreateResponse = {
    customerCreate?: {
      customer?: { id: string; email?: string | null } | null;
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    } | null;
  };

  const data = await shopifyAdminFetch<CustomerCreateResponse>(mutation, {
    input: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
    },
  });

  const errors = data.customerCreate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Shopify customerCreate failed: ${errors.map((e) => e.message).join("; ")}`);
  }

  const created = data.customerCreate?.customer;
  if (!created?.id) {
    throw new Error("Shopify customerCreate returned no customer");
  }

  return { id: created.id, email: created.email ?? null };
}

export async function updateCustomerInAdmin(
  customerId: string,
  input: { firstName: string; lastName: string; email: string; phone: string }
): Promise<{ id: string; email?: string | null }> {
  const mutation = `
    mutation CustomerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  type CustomerUpdateResponse = {
    customerUpdate?: {
      customer?: { id: string; email?: string | null } | null;
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    } | null;
  };

  const data = await shopifyAdminFetch<CustomerUpdateResponse>(mutation, {
    input: {
      id: customerId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
    },
  });

  const errors = data.customerUpdate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`Shopify customerUpdate failed: ${errors.map((e) => e.message).join("; ")}`);
  }

  const updated = data.customerUpdate?.customer;
  if (!updated?.id) {
    throw new Error("Shopify customerUpdate returned no customer");
  }

  return { id: updated.id, email: updated.email ?? null };
}

