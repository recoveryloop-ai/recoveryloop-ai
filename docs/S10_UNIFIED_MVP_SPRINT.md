# S10 — Unified case investigation MVP

Status: IMPLEMENTED AND LOCALLY VERIFIED; independent local reviews complete; owner PR/release pending. Branch: `feat/s10-case-workspace`. One implementation PR; no separate feature sprints. Date: 9 November 2026.

## Outcome and stop condition

A visitor opens an item-centered case, sees what happened, which evidence AI gathered, its bounded nonfinancial decision, deterministic policy, missing proof and next step, then reaches the separate verified sandbox certificate. A synthetic change produces a server-derived, isolated projection. An authenticated merchant operator can record an audited internal task and override it. Stop implementation when the feature inventory and acceptance gates below pass; do not claim completion while release gates remain open.

## Discovery brief

Merchant job story: When an item exception arrives, help me reconcile the buyer account, fulfillment and prior remedy, identify missing proof, prepare my follow-up and verify the eventual outcome without reconstructing several screens.

Current journey from code: landing → Command → Cases → investigation; separate hardcoded Recovery Map → Demo Lab → Actions → certificate. Anonymous order detail redirects to login. Public investigation uses stored AI or rules; overlay math is duplicated in the client. These are observed code facts; usability impact remains a hypothesis until walkthrough.

Alternative A: item-centered workspace with item state, timeline, financial buckets, investigation and work product, inline synthetic challenge, certificate link. Alternative B: concise case summary with expandable evidence and action details. A keeps the task context and before/after facts visible; B is shorter but hides uncertainty and provenance behind repeated expansion. Select A, using expandable raw citations within it. Preserve existing tabs and routes. Operate mode; preserve the existing visual identity. Inspect desktop/mobile before UI edits, then run one batched QA pass and one confirmation pass.

Self-run acceptance (not customer validation): start `/`, open RG-2048, identify Item B and state, distinguish AI decision from policy amount, challenge prior refund and conflict, distinguish synthetic result from completed PayPal cash, reach RG-2052 certificate. Record clicks, wrong turns and misunderstandings. No novice tester is currently available.

## Feature inventory

1. Item-centered case workspace: affected item, source timeline, capture/completed refund/pending reservation/obligation/proposed remedy, uncertainty, AI decision, next step and verified outcome. Preserve secondary navigation; repair anonymous order context and case selection.
2. Model-directed read-only investigation: existing eight scoped tools, bounded turns/calls, logged tool selection, exact citations and current evidence hash. Show provenance and whether stored AI or rules-only.
3. Versioned bounded nonfinancial decisions: REQUEST_EVIDENCE, ROUTE_TO_OPERATOR, MONITOR_PAYMENT, NO_ACTION, READY_FOR_POLICY_REVIEW. Server validates scope, evidence, transition and uncertainty. No AI money authority or write tools.
4. Cited case brief, targeted checklist, draft evidence request, claim/dispute preparation bundle. Authenticated merchant-scoped internal tasks, audit and override. Public runs never persist merchant tasks or canonical changes.
5. Returned-to-sender, completed refund, pending/UNKNOWN, damaged/not-as-described and delivered-but-not-received. Synthetic dispute/entity-resolution concepts only unless provider/data gates pass. Different evidence questions and nonfinancial decisions.
6. Inspectable stored GLM provenance and sandbox certificate in the same journey. Explicit RG-2048 baseline versus RG-2052 refund proof. No fresh public inference unless budget/isolation proven; use stored validated runs or labeled rules-only results.
7. Full local/DB/desktop/mobile gates, anonymous denial and session/ledger isolation, source labels, error handling, monitoring/recovery/support notes, updated demo/submission materials, independent PR reviews, one merge and separate production verification.

## Scenario selection scorecard

Scores 1–5; higher pain/PayPal/AI/evidence/safety/clarity is better; higher complexity is harder. All new public challenges are synthetic, never provider proof.

| Scenario | Trigger/item/buyer claim | Payment/evidence/policy | Autonomous work and safe next step | Pain/PayPal/AI/evidence/safety/complexity/clarity |
|---|---|---|---|---|
| Return to sender | Item B not received, partial fulfillment | Captured; EasyPost test event, synthetic item mapping; policy v1 | Gather order/shipment/prior remedies; prepare policy review | 5/5/4/5/5/2/5 |
| Already refunded | Same item/remedy requested twice | Completed allocation versus new claim | Reconcile prior remedy, NO_ACTION, expose certificate | 5/5/3/5/5/2/5 |
| Pending/UNKNOWN | Refund outcome unresolved | Reservation is not completed cash | MONITOR_PAYMENT; operator read-back checklist | 5/5/4/5/5/3/5 |
| Damaged/not as described | Item B arrived damaged, condition unproven | Capture unchanged; synthetic buyer attestation; no automatic entitlement | REQUEST_EVIDENCE; item photos/condition checklist and draft | 5/4/5/4/5/3/5 |
| Delivered but not received | Buyer denies receipt; tracking says delivered | Conflicting synthetic tracking/attestation; policy requires review | ROUTE_TO_OPERATOR; delivery proof bundle, no accusation | 5/4/5/4/5/3/5 |
| Dispute inquiry | Inquiry requests evidence | Read-only PayPal gate required; otherwise synthetic | Prepare bundle only; no dispute submission | 4/5/4/2/5/4/4 |
| Entity-resolution lead | Similar fictional identities | Synthetic fixture only until rights/quality/privacy gates pass | Human identity check; never fraud finding or remedy denial | 2/2/3/2/3/4/2 |

## Scope and ownership

In: inventory above under existing sandbox contract. Out: live money/customers, new public financial writes, external messages, submitted claims/disputes, paid data, multi-tenant onboarding, owner video publication or Devpost submission.

Root owns contracts/ADR, AI/backend, migration/internal task gateway, scenario projections, provider checks, integration and release. A delegated UI worker may own the case workspace component/page and its CSS only, adapting to the backend projection contract; it must not revert others' changes. A delegated test/docs worker may own explicitly assigned S10 tests/docs only. Simple/repetitive delegated tasks use gpt-6-luna medium. Independent fresh-context product and technical reviews happen after the full implementation is in the one PR.

## Readiness gates

Credentials are loaded server-side from ignored `.env.local`; presence is not readiness. Never print values. Verify database access, Z.ai tools/JSON, PayPal sandbox OAuth and existing capture/refund GET only; EasyPost test GET only where needed. No new PayPal writes. Stop an integration at its first failed readiness gate and record exact missing permission. Disputes require an observed authorized sandbox response. Free risk data requires verified supplier/rights/purpose/jurisdiction/privacy/corrections/match quality/relevance before ingestion; otherwise synthetic fixture. Vercel visibility/deploy permissions must pass before release. First connector lookup returned deployment 404 and no matching projects; do not claim current deployed version verified.

Official rules reread on 9 November: https://paypalaihackathon.devpost.com/rules . Deadline November 12 noon PST; judging ends December 15 at 08:00 Pacific. Public licensed code, functional demo, central PayPal and AI, authorized third-party data, public YouTube under three minutes. Owner registration/eligibility and YouTube/Devpost URLs remain unverified/open.

## Acceptance and verification

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, focused S10 and existing desktop/mobile Playwright, DB verifiers and ledger fingerprints. Test stale evidence, fabricated citations, conflicting facts, prompt injection, forbidden tools/transitions, confidence/uncertainty, merchant isolation and override. Test anonymous money endpoints and task mutation denial before providers, separate judge sessions, refresh/reset and unchanged canonical ledger. Record literal commands, exit status, counts, provider calls versus fixtures, screenshots, and skips. Inspect full PR with fresh product reviewer plus security reviewer; resolve findings before merge. Verify CI/main and incognito production separately. No fabricated metrics.

## Rollback and operational gates

Rollback app to prior accepted deployment/commit; preserve ledger and investigations. New internal task data is additive and RLS-protected; do not delete financial data or replay writes. Migration rollback only after inspecting task/audit retention and quiescing task routes. AI/provider failure returns labeled rules-only work; UNKNOWN payments stay reserved. Monitoring and recovery runbook must name owner support responsibility and manual GET reconciliation; production customer/data/privacy/legal/tenant administration gates remain outside this sandbox release.

## RESUME

S10 brief committed as `84da23e`; ADR/contract as `485db04`; implementation as `90e06c7`; final reviewed code/hardening as `8ce3c07` on this same branch. Eight real validated GLM scenario runs and their append-only audit attestations are stored. No PayPal write occurred. Original sandbox capture raw status PARTIALLY_REFUNDED USD250 and existing refund COMPLETED USD100 were observed by GET; EasyPost test GET confirms RTS. One incomplete model attempt failed closed before correction.

Local lint/typecheck, 108 unit tests, webpack production build, 30 full-matrix plus 4 final focused desktop/mobile tests pass. S1–S7 DB checks pass; S10 checks prove 8 stored runs, RLS, merchant isolation, retired-prompt/stale-input denial, idempotent audited task override and unchanged financial ledger. Both independent fresh-context reviews report no blocker; both P3 findings are addressed. Reports/screenshots are linked in `S10_IMPLEMENTATION_REPORT.md` and `S10_REVIEW_REPORT.md`.

Owner clarification supersedes earlier sequencing: the owner will create the single PR; independent reviews and checks happen locally. Connector PR creation returned 403. Owner also prohibits Vercel deployment interaction. Do not deploy, promote or merge into automatically deployed main. Next safe step: owner opens PR from `feat/s10-case-workspace`, checks CI and coordinates hosting-owner release. Registration/eligibility and public YouTube/Devpost URLs remain open. Never repeat a PayPal write.
