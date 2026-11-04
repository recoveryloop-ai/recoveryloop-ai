# RecoveryLoop AI — Devpost Submission Draft

## Project name

RecoveryLoop AI

## Tagline

Explain with AI. Decide with policy. Execute with proof.

## Inspiration

Ecommerce exceptions are financial incidents, not isolated support tickets. A payment may be captured, one item delivered, another returned to sender, and a prior refund pending in a different system. Operators must reconstruct the customer obligation manually, which creates slow resolutions and duplicate-refund risk.

## What it does

RecoveryLoop builds a Financial Obligation Graph across orders, items, PayPal Sandbox captures/refunds, EasyPost test events, merchant policy and evidence. A deterministic engine calculates the customer obligation in integer USD cents. Z.ai GLM 5.3 then produces a cited, read-only investigation narrative. An authenticated operator can approve a hash-bound proposal; the backend reserves it transactionally, uses a stable PayPal request ID and independently reads the refund back before issuing a redacted certificate.

The public judge experience is intentionally safe. Visitors can navigate six real application tabs and change allowlisted synthetic evidence in an isolated session. Selecting “Already refunded” changes the proposed additional remedy from `$100.00` to `$0.00` with `REFUND_ALREADY_SETTLED`, but cannot call PayPal or mutate the canonical ledger.

## How we built it

- Next.js 16, React 19 and TypeScript on Vercel.
- Supabase PostgreSQL and Auth with Drizzle migrations, RLS on all 24 public tables and server-only database access.
- PayPal Orders/Payments v2 Sandbox adapter with explicit approval, stable idempotency, partial refund and independent GET verification.
- EasyPost test tracker ingestion with normalized, provenance-labeled carrier events.
- Z.ai GLM 5.3 through an OpenAI-compatible provider adapter, eight read-only tools, strict JSON validation and a deterministic rules fallback.
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
