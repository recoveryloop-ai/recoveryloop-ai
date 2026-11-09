# Dispute Guard Implementation Report

**Status:** IMPLEMENTED ON `feature/dispute-guard` — NOT MERGED TO `main`
**Branch base:** `ebfd23c` (S8 release, `main`)
**Date:** 7 November 2026
**Decision record:** ADR-022 (proposed)

## Problem

A PayPal dispute is a second money path. If the buyer opens an "item not received" dispute and the merchant also refunds through the Refunds API, the buyer can be paid twice: once by the refund and once when the dispute resolves in their favour. The S6 duplicate guard only knew about refunds RecoveryLoop made itself, so it could not prevent this.

## Rule

**One money path per order.** While a PayPal dispute on any of the order's captures is open, or after a dispute has paid the buyer, no refund can be proposed, approved or sent to PayPal. The obligation is settled through the dispute instead.

| Dispute state (PayPal) | Guard state | Refunds |
|---|---|---|
| Any status other than `RESOLVED` (including `OTHER` and unknown future values) | `OPEN` | Blocked: `DISPUTE_OPEN` |
| `RESOLVED` + `RESOLVED_BUYER_FAVOUR`, `RESOLVED_WITH_PAYOUT`, `ACCEPTED` | `BUYER_PAID` | Blocked permanently: `DISPUTE_PAID_TO_BUYER` |
| `RESOLVED` + missing or unknown outcome | `BUYER_PAID` | Blocked (fail closed) |
| `RESOLVED` + `RESOLVED_SELLER_FAVOUR`, `CANCELED_BY_BUYER`, `DENIED`, `NONE` | `CLOSED_NO_PAYOUT` | Allowed again |

## Design

- **Pure contract** (`src/server/modules/disputes/contracts.ts`): strict zod parsing of `CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED`, identifier allow-lists, integer-cent amounts, fail-closed classification. An unparseable dispute is rejected (HTTP 422) so PayPal retries; it is never guessed.
- **Transactional inbox** (`paypal-event-ingestion-service.ts`): the webhook route records and applies each signature-verified event in one transaction. The inbox row is claimed with a locking upsert, so redeliveries and concurrent duplicates are processed exactly once. If applying fails, the claim rolls back too.
- **Out-of-order safety:** a dispute row is only updated by an event whose `update_time` is the same or newer.
- **Disputes before captures:** disputes link to captures by PayPal capture ID, not a foreign key, so a dispute that arrives first is held and starts guarding as soon as the capture exists.
- **Single enforcement point:** `lockedFinancialContext` reads the dispute state under the order lock and passes it to the deterministic engine. Proposal, approval and the pre-PayPal execution claim all go through it, so one check covers every stage. Approval or execution blocked by a dispute reports `DISPUTE_OPEN` / `DISPUTE_PAID_TO_BUYER` (not a generic stale error), marks the proposal/action `BLOCKED` and releases the reservation without any provider call.
- **Lock order:** cases, then order, then obligations/captures, everywhere. Dispute ingestion follows the same order. An earlier version locked order-then-case and deadlocked under a concurrent approval; the integration race test caught it.
- **Database backstop:** trigger `actions_dispute_guard` (migration `0009`) refuses to insert a `RESERVED` action or move one to `EXECUTING` while a blocking dispute exists, even if a future code path skips the application check. The service maps it to `DISPUTE_OPEN`.
- **Audit:** every applied dispute event on a known order writes `PAYPAL_DISPUTE_OBSERVED` to `audit_events`.
- **Judge demo:** new allow-listed synthetic overlay `BUYER_DISPUTE` ("Buyer opened a dispute"). Proposed remedy $100.00 → $0.00 with `DISPUTE_OPEN`; avoided double payout $100.00. Session-scoped and provider-write-free, like the existing overlays. The Demo Lab now re-reads the server projection after each change instead of duplicating the projection logic in the browser.

## Files changed

| Area | Files |
|---|---|
| New module | `src/server/modules/disputes/contracts.ts`, `dispute-repository.ts`, `paypal-event-ingestion-service.ts` |
| Engine | `src/server/modules/obligations/obligation-engine.ts` (`disputeState` input, two reason codes) |
| Money path | `src/server/modules/refunds/refund-action-service.ts`, `src/server/modules/obligations/obligation-graph-service.ts` |
| Webhook | `src/app/api/webhooks/paypal/route.ts` |
| Database | `src/server/db/schema.ts`, `src/server/db/migrations/0009_dispute_guard.sql` (+ drizzle meta) |
| Demo | `judge-session-service.ts`, `demo-projection.ts`, `src/app/api/demo/investigate/route.ts`, `src/components/demo-lab.tsx`, `src/app/globals.css` |
| Tests | `tests/dispute-contracts.test.ts`, `tests/integration/dispute-guard.db.test.ts`, additions to `tests/obligation-engine.test.ts`, `tests/demo-session.test.ts`, `tests/e2e/s7-demo.spec.ts` |
| Scripts/docs | `package.json` (`test:integration`), `docs/DECISIONS.md` (ADR-022), this report |

## Verification (cloud workspace, PostgreSQL 16)

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` (no database) | PASS — 23 files, 125 tests; 12 integration tests skipped by design |
| `TEST_DATABASE_URL=… npm test` | PASS — 24 files, 137 tests |
| Integration race test (25 concurrent approval-vs-dispute rounds) | PASS on 5 consecutive runs; zero PayPal refund calls while a dispute existed |
| Migrations on a fresh database and on top of 0000–0008 | PASS; RLS enabled, zero `anon`/`authenticated` grants on `payment_disputes` |
| `next build --webpack` (Google Fonts mocked offline) | PASS |
| New Playwright dispute scenario, desktop + mobile, real Chrome | PASS |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

Not verifiable in the cloud workspace (no provider credentials or production seed): `db:verify:s1`–`s7`, `release:verify`, the S4/S5/S6 E2E specs that need the real Sandbox ledger, and a real PayPal Sandbox dispute. The Turbopack `npm run build` could not fetch Google Fonts offline. **Run these locally before go/no-go.**

## Integration tests (`npm run test:integration`)

1. Baseline: proposal allowed without a dispute.
2. Open dispute ingested once (replay is a duplicate), audited, and blocks new proposals.
3. Proposal created before the dispute cannot be approved; it is marked `BLOCKED`.
4. Reservation approved before the dispute cannot execute; no PayPal call; action released as `BLOCKED/DISPUTE_OPEN`.
5. Out-of-order older event is ignored; a seller-favour resolution re-allows refunds.
6. Buyer-favour resolution blocks refunds permanently.
7. Dispute arriving before its capture is held and guards once the capture exists.
8. Unparseable dispute is rejected and leaves no inbox claim (PayPal retries).
9. Non-dispute events are recorded and marked processed.
10. Database trigger blocks a reservation inserted directly, bypassing the service.
11. Six concurrent deliveries of one event are processed exactly once.
12. Approval racing dispute ingestion never results in a PayPal refund call.

## Before merging to `main` (owner go/no-go)

1. `npm ci && npm run lint && npm run typecheck && npm test && npm run build`
2. Point `TEST_DATABASE_URL` at a **disposable** migrated database (never production) and run `npm run test:integration`.
3. On a staging Supabase copy: `npm run db:migrate`, then `db:verify:s1`–`s7` and `npm run test:e2e`.
4. Register `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED` and `CUSTOMER.DISPUTE.RESOLVED` on the Sandbox webhook. Optionally open a dispute as the Sandbox buyer on a staging order and confirm `DISPUTE_OPEN`.
5. Deploy a Vercel preview, then run `PLAYWRIGHT_BASE_URL=<preview> npm run test:e2e` and `release:verify` against it.
6. Only then apply migration `0009` to production. It adds one table, one trigger and widens the demo overlay allow-list; it does not modify existing ledger rows.

## Rollback

Redeploy the `main` build. If migration `0009` was applied, it is safe to leave in place; to remove it:

```sql
DROP TRIGGER IF EXISTS "actions_dispute_guard" ON "actions";
DROP FUNCTION IF EXISTS public.enforce_refund_dispute_guard();
DELETE FROM demo_overlays WHERE scenario = 'BUYER_DISPUTE';
ALTER TABLE "demo_overlays" DROP CONSTRAINT "demo_overlays_scenario_allowlist";
ALTER TABLE "demo_overlays" ADD CONSTRAINT "demo_overlays_scenario_allowlist" CHECK ("scenario" in ('ALREADY_REFUNDED', 'CONTRADICTORY_DELIVERY'));
DROP TABLE IF EXISTS "payment_disputes";
```

## Known limits (deliberate MVP scope)

- Disputes are guarded per order (all PayPal captures of the order), not per item. This over-blocks rather than under-blocks.
- A refund already sent to PayPal before a dispute arrived is not reversed; the dispute is recorded and the operator answers it with the refund as evidence. Responding to disputes through the PayPal API is out of scope.
- The AI investigator's allowed reason codes are unchanged; dispute scenarios use the rules-only explanation.
