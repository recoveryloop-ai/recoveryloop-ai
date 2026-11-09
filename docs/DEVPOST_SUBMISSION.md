# RecoveryLoop AI — Devpost Submission Draft

**S10 release note:** This copy describes the reviewed S10 implementation. Do not submit it as deployed functionality until the hosting owner releases the PR and verifies the public journey. The implementation agent was instructed not to interact with deployment.

## Project name

RecoveryLoop AI

## Tagline

Explain with AI. Decide with policy. Execute with proof.

## Inspiration

Ecommerce exceptions are financial incidents, not isolated support tickets. A payment may be captured, one item delivered, another returned to sender, and a prior refund pending in a different system. Operators must reconstruct the customer obligation manually, which creates slow resolutions and duplicate-refund risk.

## What it does

RecoveryLoop builds a Financial Obligation Graph across orders, items, PayPal Sandbox captures/refunds, EasyPost test events, merchant policy and evidence. A deterministic engine calculates the customer obligation in integer USD cents. Z.ai GLM 5.3 chooses scoped read-only tools, gathers evidence and selects a server-validated nonfinancial case step. It prepares a cited brief, targeted evidence checklist, draft request and evidence bundle. An authenticated merchant operator can automatically record an internal task from the validated decision and override it with an audit trail. Policy remains the sole authority for financial entitlement and amounts. An authenticated operator can approve a hash-bound proposal; the backend reserves it transactionally, uses a stable PayPal request ID and independently reads the refund back before issuing a redacted certificate.

The public judge experience is intentionally safe. Visitors can use an item-centered case workspace while keeping the six accepted application routes. They inspect item state, source-labeled timeline, financial buckets, stored model provenance, cited findings, drafts and the separate sandbox certificate. Allowlisted synthetic challenges cover prior refunds, pending/UNKNOWN payment, damaged-item uncertainty and delivered-but-not-received conflicts in an isolated session. Public interaction uses current stored validated model runs or explicit rules-only output; it makes no fresh model call and never creates a merchant task. Selecting “Already refunded” changes the proposed additional remedy from `$100.00` to `$0.00` with `REFUND_ALREADY_SETTLED`, but cannot call PayPal or mutate the canonical ledger.

## How we built it

- Next.js 16, React 19 and TypeScript on Vercel.
- Supabase PostgreSQL and Auth with Drizzle migrations, RLS on the accepted tables plus three additive casework tables and server-only database access.
- PayPal Orders/Payments v2 Sandbox adapter with explicit approval, stable idempotency, partial refund and independent GET verification.
- EasyPost test tracker ingestion with normalized, provenance-labeled carrier events.
- Z.ai GLM 5.3 through an OpenAI-compatible provider adapter, eight read-only tools, strict JSON/citation/evidence-hash validation, bounded nonfinancial decisions and an explicit rules-only fallback.
- Vitest contract/unit tests, SQL invariant verifiers and Playwright desktop/mobile/operator coverage.

## PayPal integration

The verified demo ledger contains one `$250.00` PayPal Sandbox capture and exactly one operator-approved `$100.00` partial refund. Completion is recorded only after PayPal GET/read-back confirms the refund. A second proposal for the satisfied obligation is blocked before network traffic. Unknown outcomes remain reserved and reuse the same request ID; they never create a blind retry.

## AI safety and grounding

The model can read only scoped case facts. Every finding must cite stored evidence IDs. Output containing invented citations, executable money amounts or a recommendation that contradicts deterministic policy is rejected. If Z.ai is unavailable or the response fails validation, RecoveryLoop persists and displays an explicit rules-only fallback.

## Challenges

The hardest problem was separating three truths that UI often conflates: completed customer cash, pending reservations and hypothetical carrier recovery. We also had to make an interactive anonymous demo without exposing provider writes. Signed expiring sessions, allowlisted overlays and a canonical-ledger fingerprint test keep the judge experience isolated.

## Accomplishments

- One real PayPal Sandbox partial refund, independently verified and durably certified.
- Duplicate, stale approval, competing approval and unknown-outcome paths fail closed.
- 99 unit/contract tests plus 24 desktop/mobile/operator E2E tests.
- Two anonymous sessions can challenge different evidence without leaking state.
- Public reset leaves captures, refunds, allocations, actions and certificates byte-stable under the release verifier.

## What we learned

AI is most useful here as a constrained investigator, not a financial authority. The strongest system combines model-generated explanation with deterministic amounts, database-enforced uniqueness, human approval and provider read-back.

## What's next

Add merchant connectors, richer policy authoring and human-reviewed carrier evidence packs. Automated carrier-claim submission, production PayPal access and live merchant data are deliberately outside this hackathon release.

## Links

- Live app: https://recoveryloop-ai.vercel.app
- Source: https://github.com/recoveryloop-ai/recoveryloop-ai
- Video: **OWNER TO ADD AFTER YOUTUBE PUBLICATION**

## Required submission settings

- License: MIT
- Video visibility: Public or Unlisted as permitted by the hackathon, accessible without login
- Repository visibility: Public
- Technologies: PayPal Sandbox, Z.ai GLM 5.3, Next.js, TypeScript, Supabase, PostgreSQL, EasyPost test mode, Vercel, Vitest, Playwright


## S10 honesty and release gates

The baseline investigation is RG-2048; actual historical refund proof belongs to RG-2052. The dispute API's read-only sandbox list returned zero items, so the inquiry scenario is synthetic. A fictional identity-review fixture illustrates an unconfirmed lead; no real-person risk data or fraud accusation is used. Free-source suitability, privacy and match-quality gates did not pass for a real integration. Draft work is not sent or submitted. No live-money or real-customer production service is claimed.

Before owner submission: release and verify the S10 PR through the hosting owner's process, confirm registration/eligibility, publish the actual demonstration publicly on YouTube, add the YouTube and Devpost URLs to the checklist and keep judge access available through 15 December 2026. Local self-runs are engineering checks, not customer validation or evidence of business impact.
