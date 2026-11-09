# RecoveryLoop AI v1.0 — Sprint Execution Controller

**Total 70 hours.** Use the comprehensive acceptance tests and Codex prompts in `MASTER_TECHNICAL_BLUEPRINT.md` Section 12. These sprint durations are planning targets, not proof of completion. Section 17 defines public judge behavior and financial-action security; apply it to every sprint.

**Current checkpoint:** S0-S7 are complete. S8 technical implementation and verification are complete; the final YouTube publication and Devpost submission remain owner-controlled external actions.

| Sprint | Target hours | Non-negotiable exit gate |
|---|---:|---|
| S0: Access and feasibility | 4 | PayPal real sandbox OAuth/order call; EasyPost test tracker; Z.ai GLM and DB status reported with evidence. |
| S1: Foundation and fixtures | 8 | Drizzle migrations; one electronics demo merchant; cents tests; auth/roles and fixture seed. |
| S2: PayPal sandbox order/capture | 12 | Real sandbox order capture ID and provider read-back persisted; protected buyer/operator. |
| S3: Carrier evidence ingestion | 6 | EasyPost simulated events normalized; F02 creates correct case and provenance. |
| S4: Obligation graph and simulator | 9 | F02 allows $100 justified; F03/F04 block double/unknown; arithmetic and concurrency tested. |
| S5: Z.ai GLM investigator | 7 | Strict read-only tools; citations validated; unknown/AI-failed fallback explicit. |
| S6: Approval, refund, verification | 9 | Authenticated $100 sandbox partial refund verified; duplicate retry/UNKNOWN cases safe. |
| S7: Interactive judge demo and premium UX | 9 | Public Vercel-app-ready six tabs; per-session evidence challenge; no public provider writes; certificate. |
| S8: Release and submission | 6 | Public production URL open in incognito, API access test, tests, README, LICENSE, demo video <3 min, Devpost ready. |
| **Total** | **70** | |

## S0 owner/provider handoff
Owner will create PayPal developer sandbox. Owner has EasyPost test, Z.ai, Supabase and Vercel access. S0 is incomplete until required API calls are observed. Never paste keys into AI chat; use local `.env.local` and Vercel secret envs.

## Cross-sprint checkpoint
1. Sprint/approved scope
2. Files changed and decisions
3. Commands/tests and precise PASS/FAIL
4. Real external calls made (redacted) vs simulated fixtures
5. Authorization and financial invariants checked
6. UX screen screenshots (UI sprints)
7. Open blockers, next authorized sprint

## Scope cuts if time is short
Drop live disputes, third-party claim submission, AG Grid bonus integration, extra analytics and complex animations. Do not cut provider-refund read-back, anonymous/operator boundary, semantic duplicate protection, synthetic labels, verified AI evidence, public judge navigation, video or source docs.

## Judge journey smoke test
Fresh incognito visit -> Explore demo -> Cases -> Orders -> Recovery Map -> Action Center read-only -> Demo Lab simulate paid/refunded mismatch -> diff updates -> reset -> case remains provider-consistent. Direct unauthenticated POST to execute/refund returns 401/403. Operator can perform real PayPal sandbox flow only with explicit approval.

## S9 addendum — product handoff (9 November 2026)

S0–S8 remain the accepted release baseline. S9 is a documentation-only handoff sprint authorized by the owner. Its sprint brief is `handoff-prompts/S9_PRODUCT_HANDOFF_SPRINT.md`; the next-agent brief and evidence ledger are in the same folder. S9 did not change product behavior, execute provider calls, or claim production readiness. The existing sandbox-only and operator/public boundaries remain binding.

**Owner clarification for the next implementation:** Use one unified S10 sprint for the complete feature inventory in `handoff-prompts/NEXT_AGENT.md`, one feature branch and one reviewed PR. Write and commit the S10 sprint document before releasing implementation subagents. An independent fresh-context product reviewer must review the full PR; add a technical reviewer for money/security changes. This clarification supersedes the earlier S10–S12 multi-sprint and scheduling proposal without changing accepted S0–S9 history. Earlier scope-cut guidance above describes the completed release; the S10 feature inventory and safety gates govern the next implementation.

## S10 — Unified case investigation MVP (9 November 2026)

Authorized by `handoff-prompts/NEXT_AGENT.md`. The complete sprint brief, feature inventory, discovery/scorecard, acceptance gates, ownership, rollback and RESUME checkpoint are in `docs/S10_UNIFIED_MVP_SPRINT.md`. Use one branch and one reviewed PR. S0–S9 history and sandbox financial boundaries remain binding. Status: readiness and discovery in progress; no completion claim.
