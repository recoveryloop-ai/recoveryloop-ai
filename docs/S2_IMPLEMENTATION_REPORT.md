# Sprint S2 — PayPal Sandbox Order & Capture Report

**Status:** BLOCKED — real sandbox order created, but sandbox buyer credentials / Developer Dashboard access are unavailable  
**Started:** 1 November 2026 (Asia/Karachi)  
**Scope boundary:** S2 only. No refund, carrier ingestion, claim, obligation simulation, or AI investigator mutation was added.

## Implemented

- Real PayPal sandbox adapter with OAuth client-credentials token caching, exact integer-cent serialization, stable `PayPal-Request-Id`, typed response validation, redacted errors, and sandbox-only base URL.
- Protected local/order create route, explicit capture route, independent capture read-back, durable ledger persistence, and a provider-verified receipt page.
- Supabase password login for the allowlisted operator plus bearer-token support for server-side smoke automation. Every payment mutation repeats verified user, allowlisted email, `app_metadata.role`, merchant scope, and same-origin checks.
- Drizzle migration for `paypal_orders`, idempotent checkout request IDs, stable capture request IDs, and deduplicated `webhook_inbox` records.
- PayPal webhook signature verification adapter and fail-closed public endpoint. The endpoint remains unavailable until a registered sandbox webhook ID is supplied.
- Double-capture guard: completed captures return the one persisted receipt; `CAPTURING`, `PENDING`, and `UNKNOWN` states cannot issue another provider capture.
- Responsive operator login, protected checkout, post-approval capture confirmation, and masked provider receipt screens.

## Current real provider evidence

- Protected operator sign-in: PASS.
- Local `$250.00` order and immutable item snapshots: PASS.
- PayPal sandbox order create through protected route: HTTP 303 to sandbox approval.
- PayPal order persisted with real provider ID and `CREATED` status: PASS.
- State handoff file: Git-ignored and mode `0600`.
- Buyer approval: BLOCKED. The project owner does not have access to the PayPal Developer Dashboard or a sandbox personal/buyer login.
- Capture POST, independent capture GET, DB receipt, and duplicate live attempt: NOT YET RUN.

## Automated checks to date

- Unit/contract tests: 33 passing across 9 files.
- Tests cover OAuth caching, exact itemized payload, PayPal 2xx/4xx/5xx, completed/pending/denied capture parsing, invalid webhook verification, invalid signature headers, and local double-capture state guards.
- Anonymous direct POST to create or capture returns `401` before provider traffic.
- Unconfigured webhook endpoint returns `503` and performs no mutation.
- Production build: PASS.
- Supabase: 14 public tables have RLS; `paypal_orders` and `webhook_inbox` grant zero CRUD privileges to `anon` and `authenticated`.

## Blocking S2 exit gate

PayPal requires buyer approval before an Orders v2 payment can be captured. The app client ID and secret authenticate the merchant API integration; they are not sandbox buyer credentials and cannot approve checkout.

The real order created for this check remains uncaptured, with no settled payment. PayPal documents that an order normally remains in `CREATED` state for only three hours, so a fresh order may be created after access is restored.

To unblock S2, the PayPal developer-app owner must provide one of the following without placing credentials in Git or chat:

1. A sandbox **personal/buyer** account login, stored only in local secret storage; or
2. Developer Dashboard access that permits viewing or creating an account under **Testing Tools > Sandbox Accounts**.

After access is restored, create and approve a fresh order and run the protected capture route twice. The first attempt must return and persist one independently verified `COMPLETED` capture. The second must return the same local receipt without a second capture row or provider mutation. S2 is not complete until that evidence exists. Live PayPal accounts and mock capture evidence are not acceptable substitutes.
