# S9 — Product review and next-agent handoff

**Status:** Planning sprint authorized by the owner's 8–9 November 2026 request. S0–S8 acceptance remains in force. This turn is handoff-only; the next agent implements the product work. The owner's target is a production-ready MVP by 12 November, but S9 cannot claim that outcome. This sprint produces a reviewable handoff and proposed follow-on sprint plan; it does not authorize payment writes, provider integration or product code changes in this turn.

## Objective

Give the next agent a grounded, executable brief for improving RecoveryLoop AI's merchant exception workflow before the PayPal AI Hackathon submission deadline. Preserve the existing public demo and protected financial boundary while selecting the smallest credible improvement that makes the product story clear and AI investigation useful.

## Inputs to inspect

1. `AGENTS.md`, `START_HERE.md`, `docs/DECISIONS.md`, `docs/MASTER_TECHNICAL_BLUEPRINT.md`, `docs/JUDGE_DEMO_CONTRACT.md`, `docs/SPRINT_EXECUTION.md`.
2. S0–S8 implementation reports, `docs/DEMO_SCRIPT.md`, `docs/DEVPOST_SUBMISSION.md`, `docs/SUBMISSION_CHECKLIST.md`.
3. Current source, fixtures, AI contracts, demo state, tests, and the public deployment.
4. Official [hackathon page](https://paypalaihackathon.devpost.com/) and [rules](https://paypalaihackathon.devpost.com/rules); verify dates and requirements at execution time.

## Deliverables

- A detailed prompt in `handoff-prompts/NEXT_AGENT.md` with current state, product hypotheses, prioritized use cases, sprint boundaries, acceptance criteria, provider gates, resumption steps, review method, and release sequence.
- A short evidence ledger distinguishing repository observations, external rules, hypotheses, and owner decisions.
- A fresh-context product review of the handoff with findings incorporated or explicitly recorded.
- A documentation-only branch and PR, merged after checks and review. The owner explicitly authorized the merge.

## Required product decisions for the next agent

- Test whether an item-centered case workspace improves the operator's ability to answer: What happened? What is owed? What is missing? What is safe next? What actually happened? Keep other navigation reachable if the single-screen hypothesis wins.
- Compare multiple exception scenarios on merchant value, evidence availability, PayPal relevance, AI contribution, implementation effort, and demo clarity. Include returned-to-sender, item-not-as-described or damage, non-receipt versus delivery proof, duplicate/pending refund, and a PayPal dispute. Add others only when supported by evidence.
- Treat external fraud watchlists and entity resolution as a research hypothesis. The owner authorized a suitable free source if one can be verified; otherwise use labeled synthetic examples and explain the concept in the presentation. Require verified source availability, licensing, legal/privacy review, match quality, correction path, and an explicit prohibition on inferring guilt from a name or shared address.
- Target the owner's production-ready MVP goal by 12 November, while keeping the approved sandbox-only boundary. State which production gates are proven and which remain blocked, especially live payment and real-customer operation.

## Acceptance and stop conditions

- S9 is complete when the handoff is specific enough for a new agent to create the next implementation sprint document before editing code, and a reviewer with fresh context has challenged its product scope.
- The handoff must protect S0–S8 security and accounting invariants, label synthetic/provider evidence accurately, and make the public demo and submission deadline first-order gates.
- Do not spend the submission window implementing broad fraud analytics, merchant onboarding, live PayPal, automated dispute outcomes, or unlicensed third-party data.
- Stop at the first failed external-provider readiness gate for any proposed new integration. Record exact blockers and continue only independent, in-scope work.

## Checkpoint and resumption

Record branch, commit, PR, review result, commands and outputs, external calls (or none), security/financial invariants checked, blockers, and the next authorized step. If interrupted, resume from the latest committed file and PR state; do not repeat provider writes or silently reopen approved ADRs.
