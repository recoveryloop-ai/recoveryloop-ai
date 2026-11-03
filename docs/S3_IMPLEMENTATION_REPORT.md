# Sprint S3 — Carrier Evidence Ingestion Report

**Status:** COMPLETE — exit gate PASS

**Completed:** 3 November 2026 (Asia/Karachi)

**Scope boundary:** S3 only. No obligation calculation, graph projection, simulation, AI investigation, refund proposal or provider payment mutation was added.

## Implemented

- Typed EasyPost test-only adapter with production-key rejection, timeout/error classification, create plus independent GET read-back, Zod response validation and stable event identifiers.
- Normalized carrier statuses and timestamps for the documented EasyPost lifecycle, including `DELIVERED`, `RETURN_TO_SENDER`, `FAILURE` and unknown states.
- Durable `shipments`, `shipment_items` and `shipment_events` tables with provenance, raw payload hashes, raw event snapshots, observed/recorded timestamps, replay constraints, indexes, RLS and revoked `anon`/`authenticated` grants.
- Explicit trust separation: EasyPost test responses are `PROVIDER_TEST`; the F02 order-item mapping is `SYNTHETIC` and visibly labeled.
- Deterministic rules R01–R04 covering returned-to-sender, partial fulfillment, synthetic address contradiction and incomplete payment reconciliation.
- Transactional F02 ingestion that maps Item B, stores eight historical provider test events, adopts/updates case `RG-2048`, writes one provider evidence record and one audit event, and never changes payment tables.
- Replay-safe ingestion: the second full create/read/ingest pass inserted zero events and reused the shipment, case, evidence and audit identities.

## Real provider evidence

- EasyPost `POST /v2/trackers`: HTTP 200, mode `test`, carrier USPS, redacted tracker `trk_…2d4f`.
- EasyPost `GET /v2/trackers/:id`: matching tracker and tracking code, normalized status `RETURN_TO_SENDER`.
- Eight historical tracking details persisted as `PROVIDER_TEST`; each has a stable provider event ID, raw payload hash, observed timestamp and recorded timestamp.
- Rules fired for F02: R01 `ITEM_RETURNED_TO_SENDER` and R02 `PARTIAL_FULFILLMENT`.
- Existing S1 case was safely adopted on the live run. A rollback-only integration proof removed it inside a transaction, ran the same service, observed `caseAction=CREATED`, and restored the original state.

EasyPost documents that tracker updates contain historical `tracking_details`, test/production mode, carrier status and location-dependent timestamps. Webhooks can deliver the same events and should use HTTPS plus HMAC validation. This sprint uses provider polling because no public callback or `EASYPOST_WEBHOOK_SECRET` is configured: [Tracker API](https://docs.easypost.com/docs/trackers), [Webhook API](https://docs.easypost.com/docs/webhooks).

## Verification

| Command | Result |
|---|---|
| `npm run smoke:easypost` | PASS — real test tracker HTTP 200 and `return_to_sender` |
| `npm run s3:ingest:f02` | PASS — first pass stored 8 events; replay stored 0; payment hash unchanged |
| `npm run db:verify:s3` | PASS — F02/R01 case, provenance, mapping, dedup, audit, RLS and rollback creation proof |
| `npm run db:verify:s2` | PASS — one verified PayPal capture, amount/status unchanged, all application tables protected |
| `npm run db:verify:s1` | PASS — five fixture orders and exact totals preserved |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 56 tests across 15 files |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS — desktop/mobile provenance label screenshots generated locally |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

## Security and blockers

- No PayPal endpoint was called by S3, and payment/capture/refund table hashes were identical before and after ingestion.
- Provider messages are stored as untrusted evidence data and never interpreted as instructions.
- Unknown and out-of-order carrier events cannot regress the latest shipment state; semantic event IDs and database constraints prevent duplicate transitions.
- The Supabase management advisor connector still returns a project-permission error after the earlier project transfer. Direct Postgres verification confirms RLS, zero public-role grants, constraints and a non-superuser/non-bypass application role.
- Signed EasyPost webhooks are deferred until a public HTTPS callback and webhook secret exist. Polling plus read-back satisfies S3 and this does not block S4.
- No S3 blocker remains. S4 is next and has not started.
