/**
 * Shopify Storefront API client (GraphQL).
 * All calls are intended for server-side use only.
 * Uses API version 2024-10.
 *
 * Metafields: the GetCustomerProfile query uses an empty `identifiers` array by default.
 * To fetch specific metafields, add your namespace.key pairs to the query’s
 * `metafields(identifiers: [{ namespace: "…", key: "…" }, …])` array.
 */

const STOREFRONT_API_VERSION = "2024-10";

export interface ShopifyAddress {
  id: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  phone?: string;
}

export interface ShopifyOrder {
  id: string;
  orderNumber?: number;
  processedAt?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  totalPrice?: { amount: string; currencyCode: string };
  lineItems?: {
    nodes: Array<{
      title: string;
      quantity: number;
      variant?: { image?: { url: string; altText?: string } | null };
    }>;
  };
}

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
}

export interface CustomerProfileResponse {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    defaultAddress: ShopifyAddress | null;
    addresses: { nodes: ShopifyAddress[] };
    orders: { nodes: ShopifyOrder[] };
    metafields: { nodes: ShopifyMetafield[] };
  } | null;
}

export interface CustomerAccessTokenCreateResponse {
  customerAccessTokenCreate: {
    customerAccessToken: { accessToken: string; expiresAt: string } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

const storeDomain = process.env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";
const storefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? "";

/**
 * Base GraphQL fetcher for Shopify Storefront API.
 * Optionally pass customer access token for customer-scoped queries.
 */
async function shopifyFetch<T>(options: {
  query: string;
  variables?: Record<string, unknown>;
  customerAccessToken?: string;
}): Promise<T> {
  const url = `https://${storeDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": storefrontToken,
  };
  if (options.customerAccessToken) {
    headers["X-Shopify-Customer-Access-Token"] = options.customerAccessToken;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: options.query,
      variables: options.variables ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Shopify API returned no data");
  }
  return json.data as T;
}

const CUSTOMER_ACCESS_TOKEN_CREATE = `
mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
  customerAccessTokenCreate(input: $input) {
    customerAccessToken {
      accessToken
      expiresAt
    }
    userErrors {
      field
      message
    }
  }
}
`;

/**
 * Authenticate customer with email and password.
 * Returns access token and user errors (e.g. invalid credentials).
 */
export async function customerLogin(
  email: string,
  password: string
): Promise<{
  customerAccessToken: { accessToken: string; expiresAt: string } | null;
  userErrors: Array<{ field: string[]; message: string }>;
}> {
  const data = await shopifyFetch<CustomerAccessTokenCreateResponse>({
    query: CUSTOMER_ACCESS_TOKEN_CREATE,
    variables: { input: { email, password } },
  });
  const result = data.customerAccessTokenCreate;
  return {
    customerAccessToken: result.customerAccessToken ?? null,
    userErrors: result.userErrors ?? [],
  };
}

const GET_CUSTOMER_PROFILE = `
query GetCustomerProfile {
  customer {
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
      nodes {
        id
        address1
        address2
        city
        province
        country
        zip
      }
    }
    orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        id
        orderNumber
        processedAt
        financialStatus
        fulfillmentStatus
        totalPrice {
          amount
          currencyCode
        }
        lineItems(first: 5) {
          nodes {
            title
            quantity
            variant {
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
    metafields(identifiers: []) {
      nodes {
        namespace
        key
        value
      }
    }
  }
}
`;

/**
 * Fetch full customer profile using Storefront API.
 * Requires customer access token (X-Shopify-Customer-Access-Token header).
 * Metafields: identifiers array is empty by default; add your namespace.key pairs as needed.
 */
export async function getCustomerProfile(
  accessToken: string
): Promise<CustomerProfileResponse> {
  return shopifyFetch<CustomerProfileResponse>({
    query: GET_CUSTOMER_PROFILE,
    customerAccessToken: accessToken,
  });
}
