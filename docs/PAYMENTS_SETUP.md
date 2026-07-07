# Payments setup (Stripe Connect + PayPal) — platform owner

Creators just click **Connect** — no keys, no webhooks on their side. That works once **you (the platform owner)** wire the platform apps below. Until then, the manual fallback (paste a Stripe Payment Link + webhook secret, or a paypal.me link with "I've completed payment") still works.

All secrets live as **Supabase Edge Function secrets** (never in the repo). Set them with the Supabase CLI or Dashboard → Edge Functions → Secrets.

## 1. Edge functions (already deployed)
- `stripe-connect` — Stripe OAuth callback → stores the creator's connected account, flags the school.
- `stripe-checkout` — creates a Checkout Session **on the creator's connected account** (optional platform fee).
- `stripe-webhook` — verifies + writes the entitlement (prefers the platform signing secret).
- `paypal-create-order` — creates a PayPal order routed to the creator (payee email).
- `paypal-webhook` — verifies via PayPal, captures on approval, writes the entitlement.

## 2. Supabase secrets to set
```
supabase secrets set \
  APP_URL=https://senseito.app \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_FEE_BPS=0 \
  PAYPAL_ENV=live \
  PAYPAL_CLIENT_ID=xxx \
  PAYPAL_SECRET=xxx \
  PAYPAL_WEBHOOK_ID=xxx
```
- `APP_URL` — where creators return after Stripe Connect (your app origin).
- `STRIPE_FEE_BPS` — optional platform fee in basis points (e.g. `500` = 5%). `0` = no fee.

## 3. Stripe platform config
1. Enable **Connect** (Standard accounts) on your platform Stripe account.
2. Settings → Connect → **OAuth**: add redirect URI
   `https://raaffebeteodotpwyfgi.supabase.co/functions/v1/stripe-connect`
   and copy your **Connect client id** (`ca_…`).
3. Put that client id in the client: `src/Senseito.jsx` → `const STRIPE_CONNECT_CLIENT_ID = "ca_…";` (public, safe).
4. Developers → **Webhooks**: add endpoint
   `https://raaffebeteodotpwyfgi.supabase.co/functions/v1/stripe-webhook`
   for event **`checkout.session.completed`** (listen to **Connected accounts**). Copy its signing secret → `STRIPE_WEBHOOK_SECRET`.

## 4. PayPal platform config
1. Create a **live REST app** in the PayPal Developer dashboard → copy client id + secret → `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET`.
2. Add a **webhook** at
   `https://raaffebeteodotpwyfgi.supabase.co/functions/v1/paypal-webhook`
   subscribed to **`CHECKOUT.ORDER.APPROVED`** and **`PAYMENT.CAPTURE.COMPLETED`**. Copy the **Webhook ID** → `PAYPAL_WEBHOOK_ID`.
3. Flip the client flag: `src/Senseito.jsx` → `const PAYPAL_PLATFORM_ENABLED = true;`

> Note: PayPal payee-email routing works for standard business accounts. For a fully white-labelled marketplace (guaranteed routing + platform fees) upgrade to **PayPal Commerce Platform / Partner Referrals** onboarding later.

## 5. How it flows
- Creator opens **Pricing** → **Connect with Stripe** (one click) / enters PayPal email.
- Student hits the paywall → pays via hosted Stripe Checkout or PayPal order.
- The provider webhook verifies the payment and writes the `entitlements` row.
- The paywall is polling → the school **unlocks itself** (no "I've completed payment" tap needed).
