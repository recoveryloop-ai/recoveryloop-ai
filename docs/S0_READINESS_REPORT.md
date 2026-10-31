# Sprint S0 — Provider and Environment Readiness

**Status:** S0 implemented; exit gate BLOCKED by PayPal only
**Date:** 1 November 2026 (Asia/Karachi)

## Scope

Sprint S0 only: repository/toolchain setup, local environment template, safe server-side provider smoke checks, Supabase/GitHub project readiness, and redacted evidence. No product UI, canonical schema, payment capture, or refund execution is in scope.

## Provider status

| Provider | Account available? | Tested capability | Actual status | Redacted proof | Blocker |
|---|---|---|---|---|---|
| PayPal | No credentials yet | Real sandbox OAuth + create uncaptured order | BLOCKED | No PayPal endpoint called | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` |
| PayPal mock | Local only | Provider-neutral create/read adapter | PASS (synthetic only) | 5 adapter/guard tests pass | Never counts as PayPal provider proof |
| EasyPost | Yes, test key | Create test tracker `EZ5000000005` | PASS | Initial HTTP 201, idempotent rerun HTTP 200; redacted `trk_…2d4f`; `mode=test`; `status=return_to_sender`; USPS | None |
| Z.ai | Yes, standard API key | GLM read-only function call + JSON-mode output | PASS | `glm-5.3`; tool call valid; Zod output valid; latest run 230 input / 34 output tokens; response IDs redacted | None observed |
| Supabase | Yes | Dedicated project + DB read/write readiness | PASS | `RecoveryLoop AI` active in `ap-southeast-1`; PostgreSQL 17.11; temporary write/read returned 1 row; migration privilege true; advisors clear | Local `DATABASE_URL` and server secret still need owner-side retrieval before app runtime |
| GitHub | Yes | Public repository creation/push | PASS | `Faheel101/recoveryloop-ai`, commit `a1714c1` | None |
| Vercel | Not tested in this checkpoint | Account/project deploy readiness | PENDING | Not called | No Next.js application exists before S1 |

## Security and financial invariants

- `.env.local` is ignored and created with owner-only filesystem permissions.
- No secret is written to `.env.example`, source, logs, chat, or provider evidence.
- `DEMO_MODE=true` rejects `PAYPAL_ENV=live` in code and tests.
- PayPal smoke creates no capture and no refund.
- EasyPost smoke requires the returned tracker to report `mode=test`.
- Z.ai smoke exposes only a synthetic read-only `lookup_case` function, allowlists the official standard API base URL and rejects unapproved models.
- Supabase smoke uses a temporary table that is dropped on commit; it does not create the S1 application schema.
- Mock PayPal IDs are prefixed `MOCK-PAYPAL-`, source tier is always `SYNTHETIC`, and the mock refuses non-integer money, non-demo mode and live PayPal mode.

## Commands and observed results

| Command | Result |
|---|---|
| `npm install` | PASS — lockfile resolved; final audit covers 140 packages with 0 vulnerabilities |
| `npm run env:init` | PASS — `.env.local` created with mode `600`; demo signing secret generated |
| `npm run lint` | PASS — ESLint reported no errors |
| `npm run typecheck` | PASS — TypeScript reported no errors |
| `npm test` | PASS — 3 files, 11 tests |
| `npm run smoke:all` | PARTIAL — EasyPost PASS; Z.ai PASS; PayPal BLOCKED; local Supabase script awaits `DATABASE_URL`; Supabase was independently verified through the connected management/SQL channel |
| `npm audit` | PASS — 0 vulnerabilities after pinning the patched `minimatch` release |
| tracked secret-pattern scan | PASS — no Z.ai, EasyPost, Supabase, PayPal, or GitHub secret patterns found |
| GitHub repository create/push | PASS — public `Faheel101/recoveryloop-ai`, branch `main` |
| GitHub Actions CI | PASS — clean install, lint, typecheck and 11 tests on `ubuntu-latest` |

## Actual external calls

- EasyPost `POST /v2/trackers`: HTTP 201; provider returned a test-mode return-to-sender tracker. This is provider test evidence, not real shipment proof.
- Z.ai `POST /chat/completions`: two calls. The first returned a valid `lookup_case` function call; the second returned JSON accepted by the exact Zod schema. No payment or unrestricted external tool was available to the model.
- Supabase: `Order Analytics` was paused by explicit owner request and verified `INACTIVE`. `RecoveryLoop AI` was created and verified `ACTIVE_HEALTHY`. A temporary table accepted one insert/read and dropped automatically; `public` remains empty, no application schema or migration was created, and security/performance advisors returned no findings.
- PayPal: no network call. The local mock is synthetic and cannot be represented as PayPal sandbox evidence.

## Files changed in this checkpoint

- Provider-neutral mock PayPal contract, implementation, factory and tests under `src/server/adapters/payments/`.
- Z.ai smoke test and endpoint/model allowlist under `scripts/smoke/`.
- Z.ai and mock-provider environment template updates.
- ADR-015 and ADR-016 plus provider-contract documentation updates.
- Expanded unit/contract tests for mock payment safety and Z.ai configuration.

## Blockers and next recommendation

1. Add legitimate PayPal sandbox credentials locally and rerun `npm run smoke:paypal`; until OAuth and the real sandbox order call pass, S0 remains failed and S1 is unauthorized.
2. Retrieve the RecoveryLoop database connection string and server secret directly into `.env.local` before S1 runtime work; do not send either through chat. The project URL and publishable key are already configured locally.
3. Rotate both credentials that were pasted into chat before any public deployment, even though EasyPost is test mode.

## Gate

S0 cannot pass, and S1 must not begin, until real PayPal sandbox OAuth plus a permitted sandbox order API call are observed. Missing credentials are a genuine blocker, not a simulated pass.
