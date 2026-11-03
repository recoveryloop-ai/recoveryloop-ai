# RecoveryLoop AI — Architecture and Codex Sprint Kit v1.0

**Status:** Sprint S2 complete: the RecoveryLoop Supabase ledger contains one real, independently verified PayPal sandbox capture, and duplicate capture replay is guarded. Sprint S3 is next but has not started. Updated 3 November 2026, Asia/Karachi.

**Product:** AI merchant financial incident resolution with a Financial Obligation Graph, counterfactual resolution simulation, merchant-approved PayPal sandbox refund, verified receipt and isolated public evidence challenge.

**Owner-approved configuration:** RecoveryLoop AI brand; electronics merchant; USD-only; Z.ai GLM API; PayPal sandbox and EasyPost test mode; Supabase/Vercel available; public working Vercel judge demo with protected operator actions.

## Read first
- `START_HERE.md` / `AGENTS.md` — execution and safety
- `docs/MASTER_TECHNICAL_BLUEPRINT.md` — all detailed architecture, UI, workflows, data schemas, API, tests and sprint instructions
- `docs/DECISIONS.md` — locked decisions
- `docs/JUDGE_DEMO_CONTRACT.md` — interactions and access isolation
- `docs/OPENAI_AGENT_CONTRACT.md` — AI tools, schema, evaluation
- `docs/PROVIDER_SETUP.md` — account and sandbox readiness
- `docs/SPRINT_EXECUTION.md` — 70-hour gate-led schedule
- `docs/COLLABORATOR_ONBOARDING.md` — independent developer access and local setup
- `fixtures/scenarios.json` and `diagrams/` — initial test data and visual architecture

A judge can navigate and test synthetic changes without an account. Provider-write actions are only allowed to authenticated operators, never to anonymous judges.

## Local setup

Requires Node.js 22+.

```bash
npm install
npm run env:init
```

Open `.env.local` locally and add the available provider values. Never paste keys into chat or commit that file. Current Supabase projects should use a publishable key in browser code and a secret key on the server; legacy `anon` and `service_role` keys are not required by this scaffold.

Run the application:

```bash
npm run dev
```

The application routes include `/`, `/app`, `/store`, and `/login`. PayPal sandbox checkout is available only after server-verified operator authentication. The protected diagnostic and payment routes verify a Supabase session or bearer token, the allowlisted operator email, and `app_metadata.role`; anonymous requests receive `401`.

The S2 checkout sequence is deliberately split: create local order and PayPal sandbox order, buyer approval, explicit server capture, independent capture GET/read-back, then durable receipt. Capture and order IDs are distinct. Refund execution remains unavailable until S6.

Run each provider check independently when provider readiness must be re-verified:

```bash
npm run smoke:easypost
npm run smoke:zai
npm run smoke:supabase
npm run smoke:paypal
```

`smoke:paypal` refuses live PayPal whenever `DEMO_MODE=true` and creates only an unapproved, uncaptured USD 1.00 sandbox order after OAuth succeeds. The local mock adapter is always labeled `SYNTHETIC`; it cannot satisfy the real PayPal sandbox gate.

For the S2 manual capture proof, run the local app and then:

```bash
npm run smoke:paypal:s2:create
# Approve the printed URL with a PayPal sandbox personal/buyer account.
npm run smoke:paypal:s2:capture
```

The temporary checkout state is owner-readable only and Git-ignored. Both scripts authenticate as the Supabase demo operator and exercise the protected application routes; they never print credentials or access tokens.

Apply and seed the S1 database:

```bash
npm run db:migrate
npm run db:seed:s1
npm run db:verify:s1
```

`db:down:s1` is intentionally guarded and drops only S1 tables when `ALLOW_S1_DOWN=true` is explicitly supplied. All public tables have RLS enabled, and direct table privileges are revoked from Supabase `anon` and `authenticated`; authenticated application handlers access the database server-side after authorization.

Run local verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

No credentials, production payment calls, or commercial merchant records are contained in this repository. S1 fixtures are visibly synthetic and use deterministic local identifiers; S2 documentation contains only redacted PayPal sandbox evidence.
