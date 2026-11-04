# START HERE — RecoveryLoop AI v1.0

**Approved product:** RecoveryLoop AI / ResolutionGraph engine, one USD electronics/accessories merchant, Z.ai GLM API, PayPal sandbox and EasyPost test mode, a **public interactive Vercel demo**, protected operator refund actions.

Read in this order:
1. `AGENTS.md` — safety and coding requirements.
2. `docs/DECISIONS.md` — signed-off owner choices.
3. `docs/MASTER_TECHNICAL_BLUEPRINT.md` — comprehensive architecture, workflows, API and database design, screens and sprints; Sections 17–18 govern the live judge demo.
4. `docs/JUDGE_DEMO_CONTRACT.md`, `docs/OPENAI_AGENT_CONTRACT.md`, `docs/PROVIDER_SETUP.md` — implementation specifics.
5. `docs/SPRINT_EXECUTION.md` — checkpoint schedule and code-agent instructions.

## Current release checkpoint: S8 technical gates

**Checkpoint:** S0 through S7 are complete. S8 technical implementation and local release gates are complete: the public release documentation, MIT license, automated release verifier, recording support and submission copy are present. The public production app is `https://recoveryloop-ai.vercel.app`. The verified `$250.00` PayPal sandbox capture still has exactly one `$100.00` refund and `$150.00` remaining capacity. Never send keys in chat or commit `.env.local`.

**Remaining owner-controlled release gates:** record and publish the final YouTube demo from `docs/DEMO_SCRIPT.md`, then review and submit `docs/DEVPOST_SUBMISSION.md`. Do not declare the external submission complete until both public URLs are recorded in `docs/SUBMISSION_CHECKLIST.md`.

## What judges can do

Open public production Vercel URL without login -> navigate six tabs -> run isolated synthetic evidence challenges and money simulation -> inspect redacted verified PayPal sandbox receipt. Only an authenticated operator can create/capture/refund through PayPal. Public judge interactions do not mutate the canonical payment ledger.

## Deadline

Official close as documented in blueprint: 13 November 2026 at 01:00 PKT; internal submission target 12 November 2026 at 18:00 PKT. 70-hour ceiling. Public repository, license, working app and YouTube video under three minutes are release criteria.

## Next owner prompt

> Use `docs/DEMO_SCRIPT.md` to publish the final YouTube video, add its URL to `docs/SUBMISSION_CHECKLIST.md`, review the prepared Devpost copy, submit it, and add the public Devpost URL. Preserve the verified release and do not add post-MVP scope.
