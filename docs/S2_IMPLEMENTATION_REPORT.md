# Sprint S2 — PayPal Sandbox Order & Capture Report

**Status:** COMPLETE — exit gate PASS

**Started:** 1 November 2026 (Asia/Karachi)

**Completed:** 3 November 2026 (Asia/Karachi)

**Scope boundary:** S2 only. No refund, carrier ingestion, claim, obligation simulation, or AI investigator mutation was added.

## Implemented

- Real PayPal sandbox adapter with OAuth client-credentials token caching, exact integer-cent serialization, stable `PayPal-Request-Id`, typed response validation, redacted errors, and sandbox-only base URL.
- Protected local/order create route, explicit capture route, independent capture read-back, durable ledger persistence, and a provider-verified receipt page.
- Supabase password login for the allowlisted operator plus bearer-token support for server-side smoke automation. Every payment mutation repeats verified user, allowlisted email, `app_metadata.role`, merchant scope, and same-origin checks.
- Drizzle migration for `paypal_orders`, idempotent checkout request IDs, stable capture request IDs, and deduplicated `webhook_inbox` records.
- PayPal webhook signature verification adapter and fail-closed public endpoint. The endpoint remains unavailable until a registered sandbox webhook ID is supplied.
- Double-capture guard: completed captures return the one persisted receipt; `CAPTURING`, `PENDING`, and `UNKNOWN` states cannot issue another provider capture.
- Responsive operator login, protected checkout, post-approval capture confirmation, and masked provider receipt screens.

## Real provider evidence

- Protected operator sign-in: PASS.
- Local `$250.00` order and immutable item snapshots: PASS.
- PayPal sandbox order create through protected route: HTTP 303 to sandbox approval; redacted order `8R36…743R`.
- PayPal order persisted with real provider ID and `CREATED` status: PASS.
- State handoff file: Git-ignored and mode `0600`.
- Buyer approval with a legitimate sandbox Personal account: PASS.
- Capture POST and independent capture GET/read-back: PASS; redacted capture `4YP4…992X`, status `COMPLETED`.
- Exact captured amount and currency: PASS — `25000` cents, `USD`.
- Durable receipt: PASS — order status `COMPLETED`, capture status `COMPLETED`, `verified_at` present, and PayPal order/capture IDs distinct.
- Duplicate attempt: PASS — two protected replays returned HTTP 303 to the same receipt; the database still contains exactly one PayPal capture row and no second provider mutation was issued.

## Automated checks

- Unit/contract tests: 35 passing across 10 files.
- Tests cover OAuth caching, exact itemized payload, PayPal 2xx/4xx/5xx, completed/pending/denied capture parsing, invalid webhook verification, invalid signature headers, and local double-capture state guards.
- Regression coverage verifies PostgreSQL timestamp strings are normalized when returning an existing completed receipt. The defect was observed only after the successful real capture; it caused the first duplicate replay to return HTTP 500, was fixed without another provider capture, and subsequent replay checks passed.
- Anonymous direct POST to create or capture returns `401` before provider traffic.
- Unconfigured webhook endpoint returns `503` and performs no mutation.
- Typecheck, lint, production build, database verification and dependency audit: PASS; `npm audit --audit-level=high` found 0 vulnerabilities.
- Supabase: 14 public tables have RLS; `paypal_orders` and `webhook_inbox` grant zero CRUD privileges to `anon` and `authenticated`.

| Command | Result |
|---|---|
| `npm run smoke:paypal:s2:create` | PASS — HTTP 303 and protected state file mode `0600` |
| `npm run smoke:paypal:s2:capture` | PASS — capture/read-back complete, both replay responses HTTP 303, one capture row |
| `npm run db:verify:s1` | PASS — five fixtures and exact totals preserved |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 35 tests across 10 files |
| `npm run build` | PASS |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

## Security and financial invariants verified

- Sandbox-only guard remained active (`DEMO_MODE=true`, `PAYPAL_ENV=sandbox`, provider `sandbox`).
- Operator authentication, allowlisted email, role, merchant scope and trusted Origin were checked at both mutation endpoints.
- The captured amount came from the immutable server-side cart and matched the independent provider read-back.
- Stable idempotency state and the local completed-capture guard prevented a second PayPal capture.
- Only redacted provider IDs are recorded in versioned documentation; credentials and the handoff state remain ignored.
- Refund execution remains unavailable until S6.

## Remaining items and next recommendation

- No S2 exit blocker remains. S3 carrier ingestion is next and must not alter the verified payment ledger.
- `PAYPAL_WEBHOOK_ID` remains unconfigured because no public callback URL exists yet. The webhook endpoint is intentionally fail-closed; register the sandbox webhook during the deployment sprint before relying on provider delivery.
- Rotate credentials previously pasted into chat before public deployment, and store replacements only in local/hosting secret storage.
- Do not begin S3 without explicit owner approval.
