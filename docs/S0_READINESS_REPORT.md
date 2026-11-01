# Sprint S0 — Provider and Environment Readiness

**Status:** S0 COMPLETE — exit gate PASS
**Date:** 1 November 2026 (Asia/Karachi)

## Scope

Sprint S0 only: repository/toolchain setup, local environment template, safe server-side provider smoke checks, Supabase/GitHub project readiness, and redacted evidence. No product UI, canonical schema, payment capture, or refund execution is in scope.

## Provider status

| Provider | Account available? | Tested capability | Actual status | Redacted proof | Blocker |
|---|---|---|---|---|---|
| PayPal | Yes, sandbox credentials | Real sandbox OAuth + create/read uncaptured order | PASS | OAuth HTTP 200; create HTTP 201; read-back HTTP 200; redacted order `6XR3…242M`; status `CREATED`; no capture/refund | None |
| PayPal mock | Local only | Provider-neutral create/read adapter | PASS (synthetic only) | 5 adapter/guard tests pass | Never counts as PayPal provider proof |
| EasyPost | Yes, test key | Create test tracker `EZ5000000005` | PASS | Initial HTTP 201, idempotent rerun HTTP 200; redacted `trk_…2d4f`; `mode=test`; `status=return_to_sender`; USPS | None |
| Z.ai | Yes, standard API key | GLM read-only function call + JSON-mode output | PASS | `glm-5.3`; tool call valid; Zod output valid; latest run 230 input / 34 output tokens; response IDs redacted | None observed |
| Supabase | Yes | Dedicated project, DB read/write, server secret, and confirmed operator Auth | PASS | `RecoveryLoop AI` active in `ap-southeast-1`; PostgreSQL 17.11; dedicated `recoveryloop_app` login; temporary write/read returned 1 row; operator password login HTTP 200; global logout HTTP 204; performance advisor clear | Free plan cannot enable leaked-password protection; one security advisory remains |
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
- Supabase uses a dedicated non-superuser database login; the project administrator password was neither changed nor stored.
- The operator Auth account is email-confirmed without SMTP, carries server-controlled `app_metadata.role=operator`, and its generated password remains only in `.env.local`.
- Supabase's leaked-password protection is a Pro-plan feature and remains disabled to avoid spending; the demo account uses a unique randomly generated 192-bit password.
- Mock PayPal IDs are prefixed `MOCK-PAYPAL-`, source tier is always `SYNTHETIC`, and the mock refuses non-integer money, non-demo mode and live PayPal mode.

## Commands and observed results

| Command | Result |
|---|---|
| `npm install` | PASS — lockfile resolved; final audit covers 140 packages with 0 vulnerabilities |
| `npm run env:init` | PASS — `.env.local` created with mode `600`; demo signing secret generated |
| `npm run lint` | PASS — ESLint reported no errors |
| `npm run typecheck` | PASS — TypeScript reported no errors |
| `npm test` | PASS — 3 files, 11 tests |
| `npm run smoke:all` | PASS — PayPal, EasyPost, Z.ai and Supabase all passed; PayPal order remained uncaptured |
| `npm run smoke:supabase` | PASS — PostgreSQL 17.11; migration privilege true; temporary write/read returned 1 row |
| Supabase operator Auth check | PASS — confirmed operator login HTTP 200 with `app_metadata.role=operator`; global logout HTTP 204; tokens redacted |
| `npm audit` | PASS — 0 vulnerabilities after pinning the patched `minimatch` release |
| tracked secret-pattern scan | PASS — no Z.ai, EasyPost, Supabase, PayPal, or GitHub secret patterns found |
| GitHub repository create/push | PASS — public `Faheel101/recoveryloop-ai`, branch `main` |
| GitHub Actions CI | PASS — clean install, lint, typecheck and 11 tests on `ubuntu-latest` |

## Actual external calls

- EasyPost `POST /v2/trackers`: HTTP 201; provider returned a test-mode return-to-sender tracker. This is provider test evidence, not real shipment proof.
- Z.ai `POST /chat/completions`: two calls. The first returned a valid `lookup_case` function call; the second returned JSON accepted by the exact Zod schema. No payment or unrestricted external tool was available to the model.
- Supabase: `Order Analytics` was paused by explicit owner request and verified `INACTIVE`. `RecoveryLoop AI` was created and verified `ACTIVE_HEALTHY`. A dedicated non-superuser database login connected through the IPv4 session pooler; a temporary table accepted one insert/read and dropped automatically. The confirmed demo operator was created through the server-side Auth admin endpoint, authenticated successfully, and its test session was globally logged out. `public` remains empty, no S1 application schema or migration was created, the performance advisor returned no findings, and the security advisor reports only the plan-gated leaked-password-protection warning.
- PayPal: real sandbox OAuth returned HTTP 200, order creation returned HTTP 201, and independent order read-back returned HTTP 200 with matching `CREATED` state. The redacted order ID is `6XR3…242M`; no buyer approval, capture or refund occurred. The mock remains synthetic and separate from this provider proof.

## Files changed in this checkpoint

- Provider-neutral mock PayPal contract, implementation, factory and tests under `src/server/adapters/payments/`.
- Z.ai smoke test and endpoint/model allowlist under `scripts/smoke/`.
- Z.ai and mock-provider environment template updates.
- ADR-015 and ADR-016 plus provider-contract documentation updates.
- Expanded unit/contract tests for mock payment safety and Z.ai configuration.
- Supabase environment placeholders and redacted S0 readiness evidence; all actual credentials and the generated operator password remain only in ignored `.env.local`.
- PayPal smoke now verifies create-order read-back as well as OAuth, while keeping the S0 probe uncaptured.

## Remaining readiness notes and next recommendation

1. S1 is now technically unblocked but has not started; wait for explicit owner approval before beginning it.
2. Rotate the PayPal, EasyPost and Z.ai credentials that were pasted into chat before any public deployment.
3. Optional after upgrading Supabase: enable leaked-password protection. It is unavailable on the current Free plan and was not enabled because the owner requested a zero-cost demo email/auth setup.

## Gate

S0 passed with observed PayPal sandbox OAuth, order creation and order read-back plus passing EasyPost, Z.ai and Supabase checks. S1 is authorized by the technical gate but must not begin until the owner explicitly approves it.
