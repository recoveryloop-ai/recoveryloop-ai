# RecoveryLoop AI — Codex Project Instructions v1.0

1. Read `START_HERE.md`, `docs/DECISIONS.md`, `docs/MASTER_TECHNICAL_BLUEPRINT.md`, `docs/JUDGE_DEMO_CONTRACT.md` and the active sprint in `docs/SPRINT_EXECUTION.md` before code changes.
2. The owner has approved brand RecoveryLoop AI, electronics storefront, USD one merchant, OpenAI API, a **navigable public Vercel demo**, and protected operator controls. Do not re-ask settled product questions.
3. Implement only the authorized sprint. No scope expansion or invented integrations. Stop at the first failed external-provider readiness gate.
4. Never call PayPal live endpoints. Always use `PAYPAL_ENV=sandbox` and explicit server guard against live mode in `DEMO_MODE`.
5. Public judge sessions may alter only per-session **synthetic evidence overlays**, rerun read-only investigation and pure simulation. Public judges can **never** create real sandbox payments or execute refunds through public endpoints.
6. Operator financial actions require server-verified authentication, role/merchant scoping, explicit approval, transaction lock, idempotent reservation and PayPal result read-back; UNKNOWN outcomes remain reserved until reconciled.
7. OpenAI tool inventory is exclusively read-only; the model never determines executable amounts, calls refund endpoints or makes entitlement policy.
8. All money is in integer cents, USD only. Separate completed cash from pending reservations and hypothetical carrier claims. Never double-count refunds and dispute exposure.
9. Label each displayed source as real PayPal sandbox, EasyPost test shipment, or synthetic fixture. AI citations refer to actual stored evidence IDs. No fabricated external API responses or performance metrics.
10. Do not commit `.env.local`, service-role keys, OpenAI key, PayPal/EasyPost secrets, passwords, cookies, logs with PII, or provider tokens.
11. Add contract/unit/integration/Playwright tests for the sprint, run lint/typecheck/tests/build as applicable, and produce exact pass/fail evidence. Test anonymous public access and forbidden money API paths.
12. Preserve existing accepted sprints, repository history and contracts. Release must be publicly navigable on Vercel in an incognito browser with no team login.

## Required sprint report
- Sprint ID, scope and files changed
- Commands run and precise PASS/FAIL outputs
- Actual provider calls, redacted response proof, and missing permissions
- Security/financial invariants checked
- Screenshots/recordings when UI is modified
- Known blockers, feature cuts and next recommendation
