# S10 — Unified case investigation MVP report

Status: implementation complete; final verification and independent PR reviews in progress. Not merged or deployed. Owner's 9 November instruction limits this task to implementation and excludes Vercel deployment interaction. One branch: `feat/s10-case-workspace`; one PR to follow. This report will be updated with final results.

## Scope and files

ADR-022 and public contract v1.1 authorize bounded **nonfinancial** case work while preserving S0–S9 history and all deterministic-money/operator boundaries. The committed sprint brief is `S10_UNIFIED_MVP_SPRINT.md` (initial commit `84da23e`); ADR/contract checkpoint is `485db04`.

New `src/server/modules/casework/` contracts, scenario context, validator/work product, model loop, cached workspace projection and task gateway own S10. Migration `0009_casework.sql` adds `casework_evidence`, `casework_runs`, `casework_tasks`, RLS and revoked public grants, plus the expanded synthetic scenario allowlist. Drizzle schema is aligned. New public GET `/api/demo/casework` reads an allowlisted case/session projection; protected `/api/cases/:id/casework` runs/scopes/authenticates case work, records tasks, retrieves durable tasks and audits overrides. No model write tool exists.

`case-workspace.tsx`, `case-workspace.css` and the case page consolidate the affected item, timeline, financial buckets, cited decision, draft work, inline challenge and separate certificate link. `operator-casework.tsx` exposes protected internal work only after server authentication. Command links to the reference case. Order-detail links route anonymous visitors to the public case or order list; provider receipts remain protected. Recovery Map accepts a validated case parameter. Demo Lab now reads server projections instead of recalculating money in the browser. Accepted v1 investigation remains accessible.

New S10 unit/E2E/DB tests and preparation/audit/read-only proof scripts accompany README, demo script, submission copy, checklist, operations and external-source review updates. S2's exact table list and S3's rollback recreation proof are extended for the additive tables, retaining their original security and financial assertions. The existing read-only context batches independent queries without changing its data contract.

## Actual provider calls and stored work

All credentials were loaded server-side from ignored `.env.local`; no values were printed. Dependencies installed from the lockfile: 417 packages, audit zero vulnerabilities.

- Z.ai readiness: actual `glm-5.3` function call and structured JSON check PASS; 230 input / 39 output tokens. Model response identifiers redacted.
- Local payload audit PASS: fixture capture, synthetic/test/merchant-attested facts; no forbidden contact/raw-provider fields, configured secrets or email pattern. No external call during audit. Automatic approval initially rejected evidence export; the local audit plus explicit handoff authorization supported the accepted retry.
- Eight actual GLM case runs validated and persisted: baseline `READY_FOR_POLICY_REVIEW`; completed-refund `NO_ACTION`; contradiction `REQUEST_EVIDENCE`; pending/UNKNOWN `MONITOR_PAYMENT`; damaged condition `REQUEST_EVIDENCE`; delivered/not received `REQUEST_EVIDENCE`; synthetic dispute `REQUEST_EVIDENCE`; fictional identity lead `ROUTE_TO_OPERATOR`. Every run gathered all seven required record categories using model-selected scoped read-only tools and cited stored evidence. These are stored runs, never described as fresh public inference.
- One initial contradiction attempt returned explicit rules-only `AI_INCOMPLETE_INVESTIGATION` because prior loop did not complete refund reads. No model decision/task was accepted. The corrected loop keeps gathering mode until required tools complete; subsequent contradiction run validated. Current-run preparation skips existing validated work to avoid repeated inference.
- PayPal sandbox OAuth HTTP 200 and dispute-list GET HTTP 200, zero items. No actual dispute record/deadline exists; inquiry remains synthetic.
- Original capture diagnostic GET HTTP 200: masked `4YP4…992X`, raw `PARTIALLY_REFUNDED`, USD 250.00. Existing adapter conservatively maps this post-refund status to `UNKNOWN`; the initial verifier's COMPLETED assertion failed and provider checks stopped. Owner explicitly authorized read-only diagnosis. Corrected diagnostic reports raw and adapter status without changing financial code.
- Existing refund GET HTTP 200: masked `9C80…9625`, `COMPLETED`, USD 100.00. EasyPost test tracker GET returns `RETURN_TO_SENDER`, `PROVIDER_TEST`. No PayPal capture, refund or dispute write occurred. The inherited S3 verifier also exercised EasyPost test tracker create/read inside its rollback recreation proof; its local changes rolled back.
- Free risk-data suitability failed purpose/rights/privacy/match-quality gates; no real-person data ingested. Fictional synthetic entity lead only. See `S10_DATA_SOURCE_REVIEW.md`.

RG-2048 uses synthetic payment fixtures plus EasyPost test evidence. RG-2052 is the separate historical actual PayPal sandbox capture/refund certificate. Public challenge results never imply a PayPal write.

## Verification evidence so far

| Literal command | Observed result |
|---|---|
| `npm test` baseline | PASS — 22 files, 99 tests |
| `npm run smoke:zai` | PASS — actual tools + strict JSON |
| `npm run db:verify:s7` baseline | PASS — two sessions, scoped reset, unchanged ledger |
| `npm run build` | FAIL in restricted environment — Google Fonts fetch; elevated Turbopack also cannot bind CSS-worker port |
| `npm run build -- --webpack` | PASS — local production build; final matrix uses one fixed build |
| `npm run test:e2e -- --grep 'S5 case narrative\|workspace fixtures'` baseline | PASS — 4 desktop/mobile tests after installing Chromium; first attempt failed because browser binary was absent |
| `npm run db:migrate` | PASS — one additive migration applied |
| `npx tsx scripts/s10/prepare-casework.ts` | PASS — seven synthetic stored evidence records; provider writes zero |
| `npx tsx scripts/s10/audit-model-payload.ts` | PASS — no secrets/contact/forbidden payload fields |
| `npx tsx scripts/s10/run-casework.ts BASELINE` | PASS — actual validated model-directed run stored |
| `npx tsx scripts/s10/run-casework.ts CHALLENGES` | Initial FAIL closed on incomplete investigation; corrected run PASS for all missing variants; current runs skipped |
| `npx tsx scripts/s10/read-provider-proof.ts` | Initial FAIL on adapter's conservative post-refund state; authorized raw diagnostic and corrected verifier PASS for capture/refund/test tracker, zero writes |
| `npm run lint` | PASS — zero errors/warnings after cleanup |
| `npm run typecheck` | PASS |
| `npm test` latest | PASS — 23 files, 107 tests |
| `npx tsx scripts/db/verify-s10.ts` | PASS — three RLS tables, zero public grants, current stored citations, second-merchant denial, stale run denial, idempotent task, audited override, revision conflict denial, unchanged canonical ledger, zero provider calls |

Earlier browser failures disclosed: missing Origin in API tests (correctly denied); navigation assertions too short for DB-backed route; a real mobile hero artwork overlay intercepted the entry link and was fixed with pointer-events disabled; a new test expected the wrong certificate heading. No security assertion was weakened. Original S2/S3 verifiers initially failed because the additive table inventory/FK dependents were not included; original assertions are preserved in the extended checks. Final commands, screenshot paths, exact E2E/DB totals, PR/CI and review findings will be recorded below.

## Invariants and limits

Model outputs contain only strict issue/outcome/proof/citation enums; unknown fields and money authority reject. Evidence hash includes current order/payment/shipment/policy/evidence projection, and stale input cannot create a task. Scope, citation, uncertainty, transition, prompt-injection and forbidden-tool cases are covered. Internal task mutation requires server-verified identity, database merchant mapping, case lock, idempotent run reservation and audited revision-checked override. No task writes a financial table or sends a message. Anonymous endpoints do not run models or create tasks.

Public changes stay in signed, expiring judge sessions. Completed refunds, pending reservations, proposed amounts and hypothetical recoveries remain separate. Source labels distinguish actual sandbox proof, test shipment data, merchant attestations, synthetic fixtures/overlays and model interpretation. Unavailable/currently stale AI yields labeled rules-only work. Production live-money/customer/privacy/security/operations gates remain unpassed, described in `S10_OPERATIONS.md`.

## RESUME

Implementation is on the single S10 branch. No merge/deployment is authorized after the owner's latest instruction. Finish final fixed-build browser matrix and DB regression loop, inspect desktop/mobile screenshots, commit/push the one PR, then release fresh-context product and security reviewers against its full diff and local journey. Address findings, run focused checks and update this report. Never repeat a PayPal write to resume. Owner retains video publication, registration/eligibility confirmation, Devpost submission and hosting release.
