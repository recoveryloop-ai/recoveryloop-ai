# Sprint S6 Implementation Report

**Status:** COMPLETE — exit gate passes

**Completed:** 3 November 2026 (Asia/Karachi)

**Scope boundary:** S6 only. No anonymous judge overlays, Demo Lab reset, six-tab UX polish, public AI quota, carrier claim submission or S7 behavior was added.

## Delivered

- Added immutable, hash-bound refund proposals derived only from the S4 deterministic obligation engine. No request body can supply an amount.
- Added exact operator confirmation (`REFUND $100.00 IN SANDBOX`), server-verified Supabase authorization, merchant scoping and trusted-origin enforcement.
- Added short PostgreSQL lock transactions, a partial unique active-obligation reservation, unique stable PayPal request IDs and one action per proposal.
- Added PayPal sandbox partial-refund POST support with `PayPal-Request-Id`, exact integer-cent serialization and independent refund GET read-back.
- Added fail-closed `PENDING`, `UNKNOWN`, `FAILED`, `BLOCKED` and `VERIFIED_CLOSED` behavior. An unknown action cannot issue another POST and keeps its original reservation/request ID.
- Added reconciliation using a stored PayPal refund ID. Only GET-confirmed `COMPLETED` creates a completed allocation and closes the obligation.
- Added durable certificates with evidence/policy hashes, provenance tiers, approval, capture/refund facts and zero resulting obligation balance. Public projection masks provider IDs.
- Added operator-only proposal, approval, execute and reconcile routes plus a read-only certificate route. Anonymous requests fail before provider traffic.
- Added migration `0007` for `proposals`, `actions`, `certificates` and action-linked audit records, with RLS, revoked public grants, FK indexes and financial constraints.

## Real PayPal sandbox evidence

| Check | Observed result |
|---|---|
| Original capture | `$250.00`, `COMPLETED`, provider-verified |
| Approved refund | `$100.00`, one stable request ID |
| Provider result | PayPal refund ID returned, then independently retrieved by GET |
| Final action | `VERIFIED_CLOSED` |
| Durable ledger | One action, one refund, one completed allocation, one certificate |
| Remaining capture capacity | `$150.00` |
| Duplicate attempt | Second `$100.00` proposal rejected with `REFUND_ALREADY_SETTLED` before network |

Provider IDs are redacted in logs and public certificate output. No live PayPal endpoint was used.

## Security and concurrency evidence

- Two concurrent approvals of the same proposal resolve to one action and one request ID.
- A partial unique index permits only one active reservation per semantic obligation.
- A stale evidence snapshot is persisted as blocked and never creates an action.
- Double execution produces at most one provider write; other requests see executing/completed state and cannot POST again.
- `UNKNOWN` is an active reservation state and retains the same request ID; no new request ID is generated.
- Anonymous proposal, approval, execute and reconcile calls return `401` before any provider adapter is reached.
- All 22 public tables have RLS; `anon` and `authenticated` have zero direct table grants; the application role is not superuser and cannot bypass RLS.

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS — 21 files, 96 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — S6 routes included |
| `npm run db:verify:s1` through `db:verify:s6` | PASS — prior contracts preserved |
| `npm run s6:execute` | PASS — idempotent GET-verified closed action and duplicate block |
| `npm run test:e2e` | PASS — 18 desktop/mobile/operator tests, including redacted certificate and anonymous S6 route denial |
| Production `npm run test:e2e` | PASS — all 18 tests against `https://recoveryloop-ai.vercel.app` |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| `npm run smoke:all` | PASS — PayPal, EasyPost, Z.ai and Supabase |
| GitHub Actions CI | PASS — run `41691077690` for commit `8d968dd` |

The Supabase management connector still lacks advisor permission on the transferred project. Direct database verification confirms RLS, grants, constraints, indexes, application-role privilege boundaries and transactional concurrency behavior.

## Production release

- Vercel deployment `dpl_GwK4uqcQziiEBWULKXv9VPrSAHvM` reached `READY` and is aliased to `https://recoveryloop-ai.vercel.app`.
- The production browser suite verified the redacted PayPal certificate, S4/S5 regressions, operator sign-in/receipt and anonymous denial on all S6 write routes on desktop and mobile.
- The post-deploy Vercel error scan returned zero error-level records in the available Hobby-plan retention window.

## Failing-check disclosure

- The first case-preparation run assumed fixture SKU `B`; the captured order correctly used catalog SKU `RL-B100`. The transaction rolled back before any provider traffic. Preparation now binds by the immutable `$100.00`, quantity-one line snapshot.
- The first real refund POST returned a provider refund ID, but local persistence rejected a JavaScript `Date` interpolation. The action stayed `EXECUTING`, the provider ID and original request ID remained stored, and no second POST was attempted. Reconciliation used PayPal refund GET only, confirmed `COMPLETED`, then persisted the allocation and certificate. The timestamp insert now uses PostgreSQL `now()` and the regression suite passes.

## Gate

S6 is complete. S7 has not started and requires explicit owner approval.
