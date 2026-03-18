# Shopify Custom Login + My Profile

Next.js app that replaces Shopify’s default login page and provides a custom **My Profile** page. Authentication uses the Shopify Storefront API, encrypted sessions via `iron-session`, and optional Multipass auto-login back to Shopify.

---

## Architecture (summary)

| Concern | Choice | Reason |
|--------|--------|--------|
| **Shopify Auth** | Storefront API (`customerAccessTokenCreate`) | Works on all Shopify plans; no Enterprise required. |
| **Profile / Orders** | Storefront API GraphQL | Customer-scoped queries using the access token. |
| **Session** | `iron-session` (encrypted HTTP-only cookie) | Secure, server-side, tamper-proof, no DB. |
| **Shopify auto-login** | Multipass (optional) or redirect with token | Logs user into the Shopify storefront after custom login when Multipass is configured. |
| **Framework** | Next.js App Router (v14+) | Server Components for data, Route Handlers for API. |

---

## Prerequisites

- **Node.js 18+**
- **Shopify store** (any plan)
- **Storefront API access token** (public token from Shopify Admin)

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env.local` from the project’s `.env.local` template (or copy from the example below) and fill in your values. See [Environment variables](#environment-variables) for details.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to `/login` or `/profile` depending on session.

---

## Shopify Storefront Access Token

1. In **Shopify Admin**: **Settings → Apps and sales channels → Develop apps** (or **Develop apps for your store**).
2. Create an app (or use an existing one) and enable **Storefront API**.
3. Under **API credentials**, configure **Storefront API scopes** (e.g. `unauthenticated_read_customer_tags`, `unauthenticated_write_customers`, `unauthenticated_read_customer_tags`; for login you need customer access).
4. Install the app and reveal the **Storefront API access token** (starts with `shpat_` or similar).
5. Put this token in `.env.local` as `SHOPIFY_STOREFRONT_ACCESS_TOKEN`.

Docs: [Shopify Storefront API – Request a Storefront API access token](https://shopify.dev/docs/custom-storefronts/storefront-api/getting-started#step-2-request-a-storefront-api-access-token).

---

## Multipass (optional)

**Multipass is only available on Shopify Plus and Enterprise plans.** If your store is on Basic or Advanced, leave `SHOPIFY_MULTIPASS_SECRET` empty; after login, users are redirected to `/profile` instead of the Shopify storefront.

To enable Multipass:

1. In Shopify Admin: **Settings → Checkout → Customer accounts** (or **Customer accounts** in Plus).
2. Find **Multipass** and generate/copy the **Multipass secret**.
3. Set `SHOPIFY_MULTIPASS_SECRET` in `.env.local`.

When set, successful login will redirect to your Shopify store’s Multipass URL so the customer is logged in there as well.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_DOMAIN` | Yes | Store domain (e.g. `mystore.myshopify.com`). |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Yes | Storefront API access token from Shopify Admin. |
| `SESSION_SECRET` | Yes | At least 32 characters. Generate with: `openssl rand -hex 32`. |
| `SHOPIFY_MULTIPASS_SECRET` | No | Multipass secret (Plus/Enterprise only). Leave blank otherwise. |

The store URL for redirects and the “Forgot password” link is derived from `SHOPIFY_STORE_DOMAIN` as `https://<SHOPIFY_STORE_DOMAIN>`.

All of these are read **server-side only**; none are exposed to the client.

---

## Redirecting Shopify theme login to this app

To send users from your Shopify store’s default login to this Next.js app:

1. **Theme:** In the theme that powers your storefront, find where **“Log in”** or **Account** links point (e.g. `{{ routes.account_login_url }}` or `/account/login`).
2. **Change the URL** to your Next.js app’s login URL, e.g.  
   `https://your-next-app.com/login?returnTo=/profile`  
   (or the same on your deployed domain).
3. Optionally, add a **redirect back to Shopify** after login by using `returnTo` with your store URL when you call the login API (or rely on Multipass if you use it).

If you use a **custom storefront** (e.g. headless), point the “Log in” / “Account” actions to this app’s `/login` and `/profile` routes instead of Shopify’s `/account/login`.

---

## Project structure

```
/app
  /login
    page.tsx          ← Login page (server wrapper)
    LoginForm.tsx     ← Client login form
  /profile
    page.tsx          ← My Profile (server)
    LogoutButton.tsx  ← Client logout
  /api
    /auth/login/route.ts   ← POST: authenticate, set session
    /auth/logout/route.ts  ← POST: destroy session
    /profile/route.ts      ← GET: customer data (session required)
/lib
  session.ts   ← iron-session config and helpers
  shopify.ts    ← Storefront API client
  multipass.ts ← Multipass token generator (optional)
middleware.ts  ← Protects /profile
```

---

## Quality checklist

- [x] Env variables are server-side only; `customerAccessToken` is only in an HTTP-only cookie.
- [x] Middleware blocks unauthenticated access to `/profile`.
- [x] Shopify errors are mapped to human-readable messages where possible.
- [x] Forms use HTML validation (`required`, `type="email"`).
- [x] TypeScript strict; no `any` in core logic.
- [x] API responses use a consistent `{ success, data?, error? }` shape.
- [x] Login form has a loading state to avoid double submit.
- [x] Logout destroys the session and redirects to `/login`.

---

## Scripts

- `npm run dev` – Start dev server.
- `npm run build` – Build for production.
- `npm run start` – Start production server.
- `npm run lint` – Run lint.
