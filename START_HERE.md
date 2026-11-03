# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Immediately next: Sprint S3 only

**Checkpoint:** S0, S1 and S2 are complete. A real PayPal sandbox `$250.00` capture was independently read back and persisted on 3 November 2026; duplicate capture replay returned the same single receipt. EasyPost test, Z.ai and Supabase readiness remain verified. Never send keys in chat or commit `.env.local`.

**Coding-agent S3 assignment:** Implement carrier evidence ingestion and deterministic case rules only. Ingest EasyPost test events behind the carrier adapter, normalize timestamps/status/provenance, make replay idempotent, and prove that the returned-to-sender F02 scenario creates the correct case without altering the PayPal ledger. Do not begin S4 behavior.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## Next Codex prompt

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, docs/MASTER_TECHNICAL_BLUEPRINT.md (especially S3 and sections 6, 9, 12, 17 and 18), docs/PROVIDER_SETUP.md, and all completed sprint reports. Execute Sprint S3 ONLY. Preserve the verified S2 PayPal ledger. Implement typed EasyPost test ingestion, normalized carrier events with explicit provenance, idempotent replay, and deterministic returned-to-sender case creation for F02. Run all required checks and report exact provider evidence, security invariants and blockers. Do not begin S4 without owner approval.
