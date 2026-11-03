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
- Durable receipt: PASS — local order status `PAID`, PayPal order and capture status `COMPLETED`, `verified_at` present, and PayPal order/capture IDs distinct.
- Duplicate attempt: PASS — two protected replays returned HTTP 303 to the same receipt; the database still contains exactly one PayPal capture row and no second provider mutation was issued.

## Automated checks

- Unit/contract tests: 35 passing across 10 files.
- Tests cover OAuth caching, exact itemized payload, PayPal 2xx/4xx/5xx, completed/pending/denied capture parsing, invalid webhook verification, invalid signature headers, and local double-capture state guards.
- Regression coverage verifies PostgreSQL timestamp strings are normalized when returning an existing completed receipt. The defect was observed only after the successful real capture; it caused the first duplicate replay to return HTTP 500, was fixed without another provider capture, and subsequent replay checks passed.
- Anonymous direct POST to create or capture returns `401` before provider traffic.
- Unconfigured webhook endpoint returns `503` and performs no mutation.
- Typecheck, lint, production build, database verification and dependency audit: PASS; `npm audit --audit-level=high` found 0 vulnerabilities.
- Supabase: all 13 application tables have RLS; `paypal_orders` and `webhook_inbox` grant zero CRUD privileges to `anon` and `authenticated`.

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

## S0–S2 remediation gate — 3 November 2026

The owner authorized a complete S0–S2 review and repair before S3. No S3 functionality and no new PayPal capture were added.

### Repairs completed

- Capture now fails closed before provider mutation unless the independently read PayPal order matches the locked local order ID, exact integer-cent total, USD currency and `PROVIDER_VERIFIED` source tier.
- The authenticated receipt now normalizes PostgreSQL string timestamps, displays the persisted captured amount, and returns 404 for malformed UUIDs instead of surfacing a database 500.
- A Next.js 16 proxy refreshes Supabase sessions and forwards the authentication library's private/no-store headers when cookies rotate.
- Evidence rows now include mandatory provider and synthetic flag fields, and source tiers match the blueprint vocabulary. The live F02 order/case contract is aligned to `RG-2048` and policy `v1`.
- Sign-out uses the validated public origin behind proxies, clears only the current browser session, and returns structured origin failures with correlation IDs. Baseline CSP, frame, MIME-sniffing, referrer, permissions and HSTS headers are configured.
- Playwright covers production rendering, responsive desktop/mobile behavior, headers, untrusted sign-out denial, real operator login, the existing provider-verified receipt, and malformed receipt identifiers.
- A live-safe S2 database verifier proves receipt invariants, webhook uniqueness inside a forced rollback, all 13 application tables with RLS, zero `anon`/`authenticated` table grants, and a non-superuser/non-bypass application role.

### Final verification

| Command | Result |
|---|---|
| `npm run db:verify:s1` | PASS — 5 exact fixtures; F02 order and case `RG-2048`; 4 provenance-complete evidence rows |
| `npm run db:verify:s2` | PASS — one matching capture; webhook dedup rollback; 13 RLS tables; 0 public-role grants |
| `npm run smoke:all` | PASS — PayPal create/read only, EasyPost test, Z.ai GLM 5.3, Supabase Postgres 17.11 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 44 tests across 13 files |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS — 8 tests across desktop and mobile Chromium |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

The only deferred provider item remains `PAYPAL_WEBHOOK_ID`: the endpoint is intentionally fail-closed until a public HTTPS callback exists. Periodic/manual provider read-back remains the S2 reconciliation path. This does not block S3.
