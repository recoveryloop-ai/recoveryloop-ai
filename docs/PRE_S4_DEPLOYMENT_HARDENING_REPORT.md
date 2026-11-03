# Pre-S4 Deployment Hardening Report

**Status:** COMPLETE — production and provider-readiness checks pass  
**Completed:** 3 November 2026 (Asia/Karachi)  
**Scope boundary:** Deployment and S0-S3 hardening only. No S4 obligation, graph, or simulator behavior was implemented. Credential rotation was explicitly excluded by the owner; existing test API credentials were preserved.

## Delivered

- Created and configured the Vercel Hobby project `recoveryloop-ai` with production-only environment scoping.
- Deployed the public canonical HTTPS application at `https://recoveryloop-ai.vercel.app`; an anonymous request returns HTTP 200 without a Vercel/team login.
- Registered the production PayPal sandbox callback for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, and `PAYMENT.CAPTURE.REFUNDED`.
- Registered an active EasyPost test-mode webhook with a new signing secret. Existing PayPal, EasyPost API, Z.ai, Supabase, database, and operator credentials were not rotated.
- Added `POST /api/webhooks/easypost` with raw-body HMAC verification, legacy and timestamped-v2 signature support, timestamp/path replay protection, test-mode enforcement, and inbox deduplication.
- Added deployed-base-URL support to Playwright so the same browser contracts run against production without starting a local server.
- Made the Supabase pooler connection explicitly use encrypted TLS `require` semantics compatible with Vercel's runtime CA bundle.
- Added redacted-only production diagnostics for authorization and provider/database error codes; no credentials, emails, bodies, or tokens are logged.

## External configuration and observed evidence

| System | Observed result |
|---|---|
| Vercel production | `READY`; canonical URL HTTP 200; CSP, HSTS, frame, MIME and referrer headers present |
| PayPal sandbox webhook | Registration created; stored webhook ID configured server-side; three capture event subscriptions present |
| EasyPost test webhook | Registration created in `test` mode; active (`disabled_at=null`); signing secret configured server-side |
| Signed EasyPost probe | First delivery HTTP 200; replay HTTP 200; exactly one `verified=true` inbox row |
| Invalid callbacks | Unsigned EasyPost HTTP 401; unsigned PayPal HTTP 400; neither reaches ledger mutation |
| Anonymous money boundaries | health/create-order/capture each HTTP 401 before provider traffic |
| Supabase security advisor | 0 errors; 1 warning: leaked-password protection disabled; 17 informational suggestions |
| Supabase performance advisor | 0 errors; 0 warnings; 10 informational suggestions |
| Production runtime errors | No error/fatal records on the final deployment after the complete deployed test run |

The Supabase management connector remains authenticated to an older personal-project scope and cannot list the transferred RecoveryLoop project. The authenticated Supabase dashboard is fully accessible, both linters were rerun there, and database/Auth access from the application is healthy. This is a tooling-scope limitation, not an application blocker.

PayPal registration and fail-closed verification are configured, but a new real PayPal capture event was intentionally not created merely to force webhook delivery. The existing verified `$250.00` capture remains unchanged. Provider GET/read-back continues to be the repair path for a missed notification.

## Verification

| Check | Final result |
|---|---|
| `npm test` | PASS — 16 files, 59 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — both PayPal and EasyPost webhook routes included |
| `npm run test:e2e` (local) | PASS — 8 desktop/mobile tests |
| `PLAYWRIGHT_BASE_URL=https://recoveryloop-ai.vercel.app npm run test:e2e` | PASS — 8 deployed desktop/mobile/operator tests |
| `npm run db:verify:s1` | PASS — fixtures and exact totals preserved |
| `npm run db:verify:s2` | PASS — one verified capture; 16 RLS tables; 0 public-role grants |
| `npm run db:verify:s3` | PASS — eight provider events; replay-safe; payment ledger preserved |
| `npm run smoke:all` | PASS — PayPal, EasyPost, Z.ai GLM 5.3 and Supabase |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

## Security and financial invariants

- `.env.local` remains ignored, owner-readable only (`0600`), and contains the local secrets. No secret or unredacted provider ID is in Git.
- Vercel stores credentials as production Secret variables; client-safe URLs/publishable settings are Config variables.
- `PAYPAL_ENV=sandbox` and the demo-mode live guard remain enforced.
- No refund, additional capture, S4 obligation, or payment-ledger mutation was performed by this checkpoint.
- EasyPost webhook events are accepted only when signed and test-mode labeled; provider/event uniqueness prevents replay duplication.
- Public visitors cannot create or capture PayPal orders and cannot call the operator health endpoint.

## Non-blocking operational notes

1. Vercel's GitHub integration cannot currently see `recoveryloop-ai/recoveryloop-ai` (`repo_not_found`), so production releases are deployed from the authenticated Vercel CLI. GitHub remains current and CI remains independent.
2. Leaked-password protection is unavailable on the current no-paid-upgrade setup; this is the sole security-advisor warning.
3. The Supabase connector should be reauthorized to the organization that owns RecoveryLoop if connector-native advisor calls are desired; dashboard advisor access and application access already work.

## Failing-check disclosure

- The first Vercel release attempt inherited an incorrect `public` output directory from the empty project and failed before going live. The project was corrected to the Next.js framework with no custom output directory; subsequent production deployments were `READY`.
- The first signed deployed EasyPost probe exposed `SELF_SIGNED_CERT_IN_CHAIN` from the Supabase session pooler in Vercel's runtime. The database client now explicitly requests encrypted TLS without relying on that runtime CA bundle; signed delivery, replay deduplication, operator login, and receipt access then passed.
- The first deployed operator test found a nonmatching hosted allowlist value. The same approved operator email was rewritten in the production Secret variable; no credential or password changed, and the operator flow then passed on desktop and mobile.
- One final typecheck was started concurrently with `next build` and observed transient missing `.next/types` files while the build replaced generated output. The build passed, and the required sequential `typecheck -> lint -> audit` rerun passed.

## Gate

The pre-S4 deployment-hardening gate passes. S4 is the next sprint and has not started.
