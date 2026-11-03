# RecoveryLoop AI — Architecture and Codex Sprint Kit v1.0

**Status:** Sprint S6 complete: the verified `$250.00` PayPal sandbox capture has exactly one operator-approved `$100.00` partial refund, independently GET-verified and stored with its allocation, audit trail and redacted certificate. S7 is next but has not started. Updated 3 November 2026, Asia/Karachi.

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

The S2 checkout sequence is deliberately split: create local order and PayPal sandbox order, buyer approval, explicit server capture, independent capture GET/read-back, then durable receipt. Capture and order IDs are distinct. S6 refund execution is separately operator-gated and requires an immutable proposal hash, exact confirmation phrase, database reservation, stable request ID and refund GET read-back.

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
npm run db:verify:s2
npm run s3:ingest:f02
npm run db:verify:s3
npm run s4:reconcile
npm run db:verify:s4
npm run db:verify:s5
npm run s6:prepare
npm run db:verify:s6
```

`s6:execute` is the authenticated real-sandbox proof command. It is idempotent after completion and will not issue a second refund; run it only against the prepared demo capture. `UNKNOWN` actions remain reserved and require the reconcile route with a known provider refund ID.

`db:down:s1` is intentionally guarded and drops only S1 tables when `ALLOW_S1_DOWN=true` is explicitly supplied. All public tables have RLS enabled, and direct table privileges are revoked from Supabase `anon` and `authenticated`; authenticated application handlers access the database server-side after authorization.

Run local verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`test:e2e` runs against the production build. With local operator credentials it verifies real Supabase sign-in and the existing provider-verified receipt; secret-dependent tests skip in public CI, where the anonymous and security-header suite still runs.

No credentials, production payment calls, or commercial merchant records are contained in this repository. S1 fixtures are visibly synthetic and use deterministic local identifiers; S2 documentation contains only redacted PayPal sandbox evidence.
