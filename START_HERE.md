# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Immediately next: Sprint S7 only (requires owner approval)

**Checkpoint:** S0 through S6 and the pre-S4 deployment-hardening checkpoint are complete. The public production app is live at `https://recoveryloop-ai.vercel.app`. The verified `$250.00` PayPal sandbox capture now has exactly one operator-approved `$100.00` partial refund, independently read back as `COMPLETED`; the durable action is `VERIFIED_CLOSED`, the obligation balance is zero and `$150.00` capture capacity remains. Stale and competing approvals, anonymous money routes, duplicate retries and unknown outcomes fail closed. S4 remains the sole financial authority and S5 remains explanatory only. Never send keys in chat or commit `.env.local`.

**Coding-agent S7 assignment (only after owner approval):** Implement the signed-off six-tab public judge experience, isolated synthetic evidence overlays, safe demo reset, action-center operator UX and polished redacted certificate rendering. Preserve the verified S6 payment ledger and keep all public provider writes forbidden. Do not begin S8 behavior.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## Next Codex prompt

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, docs/MASTER_TECHNICAL_BLUEPRINT.md (especially S7 and sections 4, 7, 9, 10, 12 and 17), and all completed sprint reports. Execute Sprint S7 ONLY after explicit owner approval. Build isolated judge overlays and a safe reset without mutating canonical provider records, add protected operator action UX over the existing S6 routes, and render the redacted durable certificate. Do not begin S8 without owner approval.
