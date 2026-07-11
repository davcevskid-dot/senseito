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
- Creator connects **Stripe once per account** (⚙ Account settings → Payments, or the Pricing panel). The OAuth `state` is `u:<userId>` → `profiles.stripe_account_id`. Legacy per-school connections (`payment_config.stripe_account_id`) still work; `stripe-checkout` resolves per-school config first, then the school owner's profile.
- Student hits the paywall → picks a **plan** → pays via hosted Stripe Checkout.
- The webhook verifies the payment and writes the `entitlements` row (with `plan_id`).
- The paywall is polling → the school **unlocks itself** with that plan's gates.

## 6. Plans, gates, free version (all in `school.data.pricing`, enforced client-side)
- `pricing.plans[]` — multiple payment options per school: `{ id, label, price, interval: once|month|6month|year, trialDays: 0|1|7|14|30, note, gates }`. `6month` bills as a Stripe subscription with `interval_count=6`.
- `gates` — `null` = everything; else `{ mentor:false?, sections:[allowed ids]?, lessonsLimit:N?, msgsPerDay:N? }`. Stored on the plan; the client reads `entitlements.plan_id` → applies the gates in `PublicSchool`/`SchoolPage`.
- `pricing.free` — `{ enabled, gates }`: a free tier anyone can use, with an "Unlock everything" upsell that opens the plans modal.

## 7. PayPal — deliberately MANUAL (platform PayPal stays off)
- The student pays the creator's paypal.me/email **directly**, then taps "I've paid — notify the creator" → a row in `paypal_claims`.
- The creator sees pending claims at the top of the Pricing panel → **Confirm & send key** mints a single-use coupon **issued_to** that student (`coupons.issued_to`, `duration_days` sized to the plan — 31 for monthly, 186 for 6-month, 366 for yearly).
- The key shows in the student's profile (**School Keys**) automatically; they redeem it on the paywall. `redeem_coupon()` writes `entitlements.expires_at` from `duration_days`, so monthly access lapses and is renewed with a fresh key.
- No email is sent yet (no email provider is wired) — claims are in-app only. To add email, wire a Resend/Postmark key into a small edge function.

## 8. Coupons v2
Creator-set: max uses, **code expiry** (days), and **access duration** (days the student's entitlement lasts). Keys issued from a claim are just coupons with `issued_to` set.
