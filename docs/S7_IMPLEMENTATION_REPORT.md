# Sprint S7 Implementation Report

**Status:** COMPLETE — exit gate passes

**Completed:** 4 November 2026 (Asia/Karachi)

**Scope boundary:** S7 only. No S8 release submission, carrier claim, live payment, new provider refund or fresh public AI-spend behavior was added.

## Delivered

- Added the public six-tab workspace: Command, Cases, Orders, Recovery Map, Action Center and Demo Lab, plus redacted Settings.
- Added signed random judge cookies (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS), database storage of token hashes only, 45-minute TTLs and an atomic 120-request cap.
- Added allowlisted, bounded overlays for `ALREADY_REFUNDED` and `CONTRADICTORY_DELIVERY`; payloads cannot accept amounts, URLs, provider IDs or arbitrary evidence.
- Added isolated before/after projection and a machine-readable money/reason diff. Synthetic state is visibly labeled and cannot authorize money movement.
- Added safe reset that deletes only the current session overlay. Expired sessions are ignored and opportunistically removed with cascading overlays.
- Added a public investigator boundary that reuses the stored validated baseline or returns an explicit rules-only overlay fallback. It makes no fresh public Z.ai call and exposes no write tool.
- Added a public read-only Action Center with server-verified operator state; all proposal, approval, execute and reconcile routes retain their S6 authorization controls.
- Added a responsive print-ready certificate view backed by the durable S6 certificate, with redacted provider IDs and explicit PayPal Sandbox/provenance labeling.
- Added migration `0008` for `judge_sessions` and `demo_overlays`, with RLS, revoked public grants, allowlist/hash constraints, indexed expiration/session paths and cascading session cleanup.

## Security and data-integrity evidence

- Two independent browser contexts receive different sessions; an overlay in one is absent from the other.
- Overlay state survives refresh for its own session; reset restores baseline and does not affect another session.
- The S7 database verifier fingerprints captures, refunds, allocations, actions and certificates before and after overlay/reset and proves the canonical fingerprint is unchanged.
- Anonymous users still receive denial on proposal, approval, execute and reconcile routes before any provider adapter call.
- All 24 public tables have RLS, `anon` and `authenticated` have zero direct table grants, and both new tables have the required indexes.
- No PayPal POST, EasyPost write or fresh Z.ai call was made during S7.

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS — 22 files, 99 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — all S7 pages and API routes included |
| `npm run db:verify:s1` through `db:verify:s7` | PASS — all prior contracts preserved |
| `npm run test:e2e` | PASS — 24 desktop/mobile/operator tests |
| S7 session verifier | PASS — two isolated sessions, scoped reset, stable canonical ledger |

## QA disclosure

- Initial browser QA found that the negative proposal delta for the “Already refunded” scenario was passed to the non-negative money constructor, causing the UI error boundary after selection. The diff now formats signed amounts from the absolute integer value; the regression is covered by desktop and mobile E2E tests.
- Supabase management-advisor access remains unavailable on the transferred project. Direct SQL verification covers RLS, grants, constraints, indexes, application-role boundaries and data isolation.

## Gate

S7 is complete. S8 has not started and requires explicit owner approval.
