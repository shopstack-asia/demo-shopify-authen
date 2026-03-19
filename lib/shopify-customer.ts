/**
 * Shopify Customer Account API GraphQL client.
 */

// Use the "latest" schema to avoid mismatches between API versions.
// (Shopify Customer Account API is versioned and schema fields can change.)
const CUSTOMER_ACCOUNT_API_VERSION = "latest";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export interface ShopifyCustomerAddress {
  id: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phoneNumber?: string | null;
}

export interface ShopifyCustomerOrderLineItem {
  title: string;
  quantity: number;
  image?: {
    url?: string | null;
    altText?: string | null;
  } | null;
}

export interface ShopifyCustomerOrder {
  id: string;
  number?: number | null;
  processedAt?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  totalPrice?: { amount: string; currencyCode: string } | null;
  lineItems?: {
    nodes: ShopifyCustomerOrderLineItem[];
  } | null;
}

export interface ShopifyCustomerMetafield {
  namespace: string;
  key: string;
  value: string;
}

export interface ShopifyCustomerProfile {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: { emailAddress: string } | null;
    phoneNumber: { phoneNumber: string } | null;
    defaultAddress: ShopifyCustomerAddress | null;
    addresses: { nodes: ShopifyCustomerAddress[] } | null;
    orders: { nodes: ShopifyCustomerOrder[] } | null;
  } | null;
}

/**
 * Fetch customer profile using Customer Account API.
 * Requires an access token prefixed with `shcat_`.
 */
export async function getCustomerProfile(accessToken: string): Promise<ShopifyCustomerProfile> {
  const storeDomain = requireEnv("SHOPIFY_MYSHOPIFY_DOMAIN");
  // Customer Account API GraphQL endpoint (headless storefront format).
  const url = `https://${storeDomain}/api/${CUSTOMER_ACCOUNT_API_VERSION}/graphql.json`;

  const query = `
    query GetCustomerProfile {
      customer {
        id
        firstName
        lastName
        emailAddress {
          emailAddress
        }
        phoneNumber {
          phoneNumber
        }
        defaultAddress {
          id
          address1
          address2
          city
          province
          country
          zip
          phoneNumber
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
            phoneNumber
          }
        }
        orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
          nodes {
            id
            number
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // Customer Account API expects the access token in the Authorization header.
      // Some implementations require sending it directly without the "Bearer" prefix.
      Authorization: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Customer Account API error: ${res.status} ${res.statusText} ${text}`);
  }

  const json = (await res.json()) as {
    data?: ShopifyCustomerProfile;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Customer Account API returned no data.");
  }
  return json.data;
}

