# Sprint S4 Implementation Report

**Status:** COMPLETE — exit gate passes  
**Completed:** 3 November 2026 (Asia/Karachi)  
**Scope boundary:** S4 only. No Z.ai investigator, proposal approval, PayPal refund call, provider mutation or S5/S6 behavior was added.

## Delivered

- Added a pure, versioned-policy obligation engine using integer minor units only. It distinguishes entitled, realized, reserved, outstanding, capture-capacity, simulated and conditional values.
- Added golden snapshots for F01-F07, F11 and F14 with inputs, exact formulas, outputs, reason codes and evidence IDs.
- Added transactional semantic obligation persistence with stable `(order_id, item_id, reason_key)` deduplication and consistent lock ordering.
- Added explicit refund-to-obligation allocations with `COMPLETED` versus `RESERVED` states. Pending money is not reported as returned cash.
- Added a typed relational graph projection. Every persisted edge has a non-null evidence foreign key; provider and synthetic provenance remain explicit.
- Added `POST /api/cases/:id/simulate` with allowlisted options, deterministic numeric output, an input hash, uncertainty labels and an explicit `provider_write: false` response.
- Added migration `0005` for `obligation_allocations` and `graph_edges`, including foreign-key indexes, checks, RLS and revoked `anon`/`authenticated` grants.

## Acceptance evidence

| Fixture | Result |
|---|---|
| F01 | Delivered item: no obligation and no proposal. |
| F02 | Returned item B: `$100.00` obligation and `$100.00` simulated proposal. |
| F03 | Completed `$100.00` allocation: blocked with `REFUND_ALREADY_SETTLED`. |
| F04 | Pending `$100.00` allocation: blocked with `REFUND_RESERVED` and `UNKNOWN_PAYMENT_OUTCOME`. |
| F05 | Independent item C: `$30.00` remains eligible. |
| F06 | Incomplete capture: blocked with `CAPTURE_NOT_COMPLETED`. |
| F07 | Concurrent reconciliation is idempotent; one semantic obligation survives. |
| F11 | Contradictory evidence: blocked and labeled, never called fraud. |
| F14 | Amount beyond verified capture capacity: blocked before any provider API. |

Live database verification found 17 graph edges, zero missing evidence references, zero semantic duplicates, zero refund over-allocation, two new RLS tables and zero public-role grants. The payment ledger hash was identical before and after reconciliation. No provider write occurred.

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS — 18 files, 75 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — simulator route included |
| `npm run test:e2e` | PASS — 10 desktop/mobile/operator tests |
| `npm run db:verify:s1` | PASS — original fixtures and evidence contract preserved |
| `npm run db:verify:s2` | PASS — verified capture preserved; 18 RLS tables; zero public grants |
| `npm run db:verify:s3` | PASS — carrier ingestion and rollback proof preserved |
| `npm run db:verify:s4` | PASS — financial outcomes, concurrency, graph and ledger invariants |
| `npm run smoke:all` | PASS — PayPal, EasyPost, Z.ai and Supabase |

The Supabase management connector remains scoped to the former project owner and cannot call advisors for this transferred project. Direct application-role checks prove RLS, grants, indexes, foreign keys and non-superuser/non-bypass behavior. This pre-existing connector limitation does not block S4.

## Gate

S4 is complete. S5 has not started and requires explicit owner approval.
