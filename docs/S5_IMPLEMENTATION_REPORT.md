# Sprint S5 Implementation Report

**Status:** COMPLETE — exit gate passes

**Completed:** 3 November 2026 (Asia/Karachi)

**Scope boundary:** S5 only. No proposal approval, refund reservation, PayPal refund, claim submission, public anonymous AI quota or S6 behavior was added.

## Delivered

- Added a provider-neutral investigator interface and Z.ai OpenAI-compatible adapter pinned to the approved `glm-5.3` model and allowlisted standard API base URL.
- Added exactly eight scoped read-only tools: order, capture, refunds, shipments, policy, deterministic obligation, case evidence and pure counterfactual simulation.
- Added prompt version `investigator-v1`, strict Zod output validation, evidence UUID allowlisting, two-citation minimum, deterministic-rule consistency checks and rejection of model-authored payout amounts.
- Added prompt-injection redaction for untrusted evidence text and field allowlisting that excludes raw provider identifiers, private customer fields and credentials.
- Added a bounded eight-call tool budget, redacted hash-only tool log, token metadata, hashed provider response references and append-only audit records.
- Added durable `VALIDATED` versus `FALLBACK` investigation records. Provider failure, malformed JSON, bad schema, unsupported citations, stale evidence, forbidden tools or rule contradictions fail to the deterministic report.
- Added operator-gated `POST /api/cases/:id/investigate`; anonymous requests fail before any model traffic. The model has no payment adapter or financial write tool.
- Added `/app/cases/RG-2048` with a validated case narrative, deterministic-authority card and expandable provenance drawer. AI prose never supplies the executable amount.
- Added migration `0006` for `investigations`, including FK/composite indexes, validation checks, RLS and revoked `anon`/`authenticated` grants.

## Real provider and database evidence

| Check | Observed result |
|---|---|
| Z.ai model | `glm-5.3`; real server-side structured-output call succeeded |
| F02 result | `VALIDATED`; two findings; two distinct stored evidence citations |
| Tool calls | Four bounded bootstrap reads; zero forbidden/write tools |
| AI unavailable proof | Durable `FALLBACK` with `AI_UNAVAILABLE` and rules-only narrative |
| Payment ledger | Capture/refund ledger hash unchanged before and after both investigations |
| Investigation storage | RLS enabled; zero `anon`/`authenticated` grants; two required indexes |
| Audit | Investigation events appended with hashes, model, prompt version and validation status |

No PayPal, EasyPost or other provider write was made by S5. Raw Z.ai response IDs and tool payloads are not exposed; only hashes and sanitized metadata are stored.

## Adversarial and safety coverage

- Malicious instructions embedded in tracking/evidence text are replaced with an explicit untrusted-instruction marker.
- Fabricated or altered evidence IDs reject the model output with `UNSUPPORTED_CITATION`.
- Output schema is strict; an added `amount_minor` field is rejected, and payout amounts in prose are rejected.
- A stale evidence hash discards the model result and persists a fresh rules fallback.
- Contradictory evidence is labeled as a contradiction and never asserted as proven fraud.
- A requested `refund_payment` tool is rejected at the code boundary; no payment adapter is reachable from the investigator.
- A model recommendation cannot override a blocked S4 deterministic result.

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS — 20 files, 86 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| `npm run build` | PASS — case page and investigator route included |
| `npm run test:e2e` | PASS — 14 desktop/mobile/operator tests |
| `npm run db:verify:s1` through `db:verify:s5` | PASS — all prior contracts preserved |
| `npm run smoke:all` | PASS — PayPal, EasyPost, Z.ai and Supabase |

The Supabase management connector remains scoped to the former project owner and cannot call advisors for this transferred project. Direct application-role checks verify the new table's RLS, grants, indexes and non-superuser access. Current Supabase guidance on exposed-schema RLS and revoked public-role grants is applied.

## Failing-check disclosure

- The first real GLM result was rejected with `UNSUPPORTED_CITATION`; the ledger stayed unchanged and the rules fallback was stored. The prompt now requires exact evidence UUID copying, and one bounded correction turn receives the allowlist. The subsequent real run passed with two stored citations.
- The first local browser run expected the older authorization code `AUTH_REQUIRED`; the server correctly returned the established `AUTHENTICATION_REQUIRED` contract. The test expectation was corrected without changing authorization behavior.

## Gate

S5 is complete. S6 has not started and requires explicit owner approval.
