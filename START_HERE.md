# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Immediately next: Sprint S0 only

**Owner action:** Create legitimate PayPal Developer/Sandbox account. EasyPost test and Z.ai keys are available for S0 verification; Supabase and Vercel still need project readiness verification. Never send keys in chat or commit `.env.local`.

**Coding-agent S0 assignment:** Create repository skeleton, build safe server-only provider checks for PayPal OAuth and a permitted order API call, EasyPost test tracker and Z.ai GLM structured response/tool capability; verify Supabase DB connection. A mock PayPal adapter may support local development but never satisfies the real PayPal S0 gate. Report actual response status/IDs with secrets redacted. Do not fabricate a successful smoke test or proceed past S0 if PayPal is inaccessible.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## First Codex prompt

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, docs/MASTER_TECHNICAL_BLUEPRINT.md (especially sections 6, 9, 12, 17 and 18), and docs/PROVIDER_SETUP.md. Execute Sprint S0 ONLY. Do not start product UI or falsely claim external API proof. Create safe `.env.example`, provider smoke-test scripts and a redacted S0 report. Verify actual PayPal sandbox/OAuth, EasyPost test tracker, Z.ai GLM API and Supabase access where keys are provided. If the owner has not provisioned PayPal credentials, report the exact blocking input, not a fake PASS. Summarize changed files, commands, observed responses, tests and blockers.
