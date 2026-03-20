# Shopify Custom Login + My Profile

Next.js app that replaces Shopify’s default login page and provides a custom **My Profile** page. Authentication uses Shopify **Customer Account API** with **OAuth 2.0 + PKCE** (OTP via email), encrypted sessions via `iron-session`, and redirects back to your app after login.

---

## Architecture (summary)

| Concern | Choice | Reason |
|--------|--------|--------|
| **Shopify Auth** | Customer Account API OAuth + PKCE | Passwordless OTP flow via Shopify’s Customer Accounts system. |
| **Profile / Orders** | Customer Account API GraphQL | Customer-scoped queries using the OAuth access token. |
| **Session** | `iron-session` (encrypted HTTP-only cookie) | Secure, server-side, tamper-proof, no DB. |
| **Shopify auto-login** | OAuth callback redirect | Shopify handles OTP; we store tokens in an HTTP-only session cookie. |
| **Framework** | Next.js App Router (v14+) | Server Components for data, Route Handlers for API. |

---

## Prerequisites

- **Node.js 18+**
- **Shopify store** (any plan)
- **Customer Account API OAuth settings** (Shopify config) to obtain client id/secret

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables
Create `.env` from `.env.example` and fill in your values. See [Environment variables](#environment-variables) for details.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to `/login` or `/profile` depending on session.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_DOMAIN` | Yes | Shopify store domain (e.g. `mystore.myshopify.com`) — used for discovery. |
| `SHOPIFY_SHOP_ID` | Yes | Numeric shop id (Settings → Customer accounts → URL). |
| `SHOPIFY_CLIENT_ID` | Yes | Client ID from Customer Account API settings. |
| `SHOPIFY_CLIENT_SECRET` | Yes | Client secret for the OAuth token exchange. |
| `NEXT_PUBLIC_APP_URL` | Yes | Your app URL (used for `redirect_uri`). |
| `SESSION_SECRET` | Yes | At least 32 characters. Generate with: `openssl rand -hex 32`. |

All of these are read **server-side only**; none are exposed to the client.

---

## Redirecting Shopify theme login to this app

To send users from your Shopify store’s default login to this Next.js app:

1. **Theme:** In the theme that powers your storefront, find where **“Log in”** or **Account** links point (e.g. `{{ routes.account_login_url }}` or `/account/login`).
2. **Change the URL** to your Next.js app’s login URL, e.g.  
   `https://your-next-app.com/login?returnTo=/profile`  
   (or the same on your deployed domain).
3. Optionally, add a **redirect back to Shopify** after login by using `returnTo` with your store URL when you call the login API.

If you use a **custom storefront** (e.g. headless), point the “Log in” / “Account” actions to this app’s `/login` and `/profile` routes instead of Shopify’s `/account/login`.

---

## Project structure

```
/app
  /login
    page.tsx          ← Login page (server wrapper)
    LoginClient.tsx  ← Client login button + query param handling
  /profile
    page.tsx          ← My Profile (server)
    LogoutButton.tsx  ← Logout form (POST)
  /api
    /auth/login/route.ts   ← GET: start OAuth (PKCE + state/nonce) + redirect to Shopify
    /auth/callback/route.ts← GET: token exchange, verify state, set session, redirect back
    /auth/logout/route.ts  ← POST: destroy session + redirect to Shopify end_session_endpoint
    /profile/route.ts      ← GET: customer data (session required)
/lib
  session.ts   ← iron-session config and helpers
  shopify-auth.ts     ← PKCE + OAuth helpers
  shopify-customer.ts ← Customer Account API GraphQL client
middleware.ts  ← Protects /profile
```

---

## Quality checklist

- [x] OAuth tokens (`accessToken`, `refreshToken`, `idToken`) are stored server-side in an HTTP-only cookie.
- [x] Middleware blocks unauthenticated access to `/profile`.
- [x] Callback verifies `state` (and checks `nonce` when present).
- [x] PKCE `codeVerifier` is cleared after successful token exchange.
- [x] TypeScript strict; no `any` in core logic.
- [x] Logout destroys the session and redirects to Shopify `end_session_endpoint`.

---

## Scripts

- `npm run dev` – Start dev server.
- `npm run build` – Build for production.
- `npm run start` – Start production server.
- `npm run lint` – Run lint.
