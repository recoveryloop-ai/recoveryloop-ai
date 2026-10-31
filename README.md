# RecoveryLoop AI — Architecture and Codex Sprint Kit v1.0

**Status:** Sprint S0 provider-readiness repository. Product implementation has not started. Prepared 31 October 2026 and initialized 1 November 2026, Asia/Karachi.

**Product:** AI merchant financial incident resolution with a Financial Obligation Graph, counterfactual resolution simulation, merchant-approved PayPal sandbox refund, verified receipt and isolated public evidence challenge.

**Owner-approved configuration:** RecoveryLoop AI brand; electronics merchant; USD-only; OpenAI API; PayPal sandbox and EasyPost test accounts will be provisioned; Supabase/Vercel/OpenAI available; public working Vercel judge demo with protected operator actions.

## Read first
- `START_HERE.md` / `AGENTS.md` — execution and safety
- `docs/MASTER_TECHNICAL_BLUEPRINT.md` — all detailed architecture, UI, workflows, data schemas, API, tests and sprint instructions
- `docs/DECISIONS.md` — locked decisions
- `docs/JUDGE_DEMO_CONTRACT.md` — interactions and access isolation
- `docs/OPENAI_AGENT_CONTRACT.md` — AI tools, schema, evaluation
- `docs/PROVIDER_SETUP.md` — account and sandbox readiness
- `docs/SPRINT_EXECUTION.md` — 70-hour gate-led schedule
- `fixtures/scenarios.json` and `diagrams/` — initial test data and visual architecture

A judge can navigate and test synthetic changes without an account. Provider-write actions are only allowed to authenticated operators, never to anonymous judges.

## S0 local setup

Requires Node.js 22+.

```bash
npm install
npm run env:init
```

Open `.env.local` locally and add the available provider values. Never paste keys into chat or commit that file. Current Supabase projects should use a publishable key in browser code and a secret key on the server; legacy `anon` and `service_role` keys are not required by this scaffold.

Run each provider check independently:

```bash
npm run smoke:easypost
npm run smoke:openai
npm run smoke:supabase
npm run smoke:paypal
```

`smoke:paypal` is intentionally blocked until legitimate PayPal sandbox credentials are present. It refuses live PayPal whenever `DEMO_MODE=true` and creates only an unapproved, uncaptured USD 1.00 sandbox order after OAuth succeeds.

Run local verification:

```bash
npm run typecheck
npm test
```

No credentials, production payment calls, completed PayPal calls, or commercial merchant records are contained in this repository.
