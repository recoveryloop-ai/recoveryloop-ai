# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Immediately next: Sprint S4 only

**Checkpoint:** S0 through S3 are complete. A real PayPal sandbox `$250.00` capture remains independently verified and unchanged. EasyPost test tracker events for F02 are normalized with `PROVIDER_TEST` provenance, the synthetic item mapping is explicit, replay inserts no duplicates, and deterministic rules R01/R02 connect the returned item to case `RG-2048`. Never send keys in chat or commit `.env.local`.

**Coding-agent S4 assignment:** Implement the deterministic obligation graph and counterfactual simulator only. Preserve provider evidence and the verified payment ledger. Derive integer-cent obligations from policy plus stored facts, distinguish completed/pending/hypothetical amounts, block duplicate obligations, and prove F02/F03/F04 outcomes without AI or provider writes. Do not begin S5 behavior.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## Next Codex prompt

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, docs/MASTER_TECHNICAL_BLUEPRINT.md (especially S4 and sections 5, 7, 8, 9, 12, 17 and 18), and all completed sprint reports. Execute Sprint S4 ONLY. Preserve the verified S2 payment ledger and S3 carrier evidence. Implement deterministic integer-cent obligation derivation, typed graph projection and side-effect-free counterfactual simulation for F01-F07/F11/F14. Prove F02 permits the policy-derived `$100` proposal while F03/F04 block duplicate or reserved amounts. Do not begin S5 without owner approval.
