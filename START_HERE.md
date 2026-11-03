# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Immediately next: Sprint S6 only (requires owner approval)

**Checkpoint:** S0 through S5 and the pre-S4 deployment-hardening checkpoint are complete. The public production app is live at `https://recoveryloop-ai.vercel.app`. A real PayPal sandbox `$250.00` capture remains independently verified and unchanged. S4 remains the sole financial authority. The S5 Z.ai GLM 5.3 investigator uses eight scoped read-only tools, strict output validation, stored-evidence citation checks, prompt-injection redaction and a durable rules-only fallback. F02 has a validated two-citation narrative; no model or public route can execute provider writes. Never send keys in chat or commit `.env.local`.

**Coding-agent S6 assignment (only after owner approval):** Implement authenticated proposal approval, exact S4-derived refund reservation, stable idempotency, PayPal sandbox partial-refund execution, provider GET read-back, UNKNOWN reconciliation and the minimum durable certificate. Preserve the verified capture and all S5 evidence/AI boundaries. Do not begin S7 behavior.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## Next Codex prompt

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, docs/MASTER_TECHNICAL_BLUEPRINT.md (especially S6 and sections 5, 6, 8, 9, 12, 17 and 18), and all completed sprint reports. Execute Sprint S6 ONLY after explicit owner approval. Bind authenticated approval to an immutable evidence/policy snapshot, reserve the exact deterministic amount under lock, execute only PayPal sandbox with stable idempotency, verify by provider GET and fail closed on unknown outcomes. Do not begin S7 without owner approval.
