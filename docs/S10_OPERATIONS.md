# S10 sandbox MVP operations

## Ownership and release boundary

The repository owner is the demo maintainer and first support contact through the repository issue tracker. Hosting belongs to another person. On 9 November 2026 the owner instructed this implementation agent to focus on implementation and **not interact with the Vercel deployment**. This PR therefore does not deploy, promote, roll back or merge into an automatically deployed branch. Hosting changes and production verification require the hosting owner's workflow. Keep judge access free through 15 December 2026; no uptime promise or monitoring history is invented.

## Reproduce

Use Node 22 or later, `npm ci`, server-only `.env.local` per `.env.example`, and `PAYPAL_ENV=sandbox` with `DEMO_MODE=true`. Run `npm run db:migrate`, then `npx tsx scripts/s10/prepare-casework.ts`. The latter inserts labeled synthetic challenge evidence only. Existing S0–S8 seeded fixtures and provider certificate are prerequisites; never rerun the S6 money-write script to reproduce S10.

`npx tsx scripts/s10/audit-model-payload.ts` checks allowed payload fields and configured-secret/contact exclusion without exporting evidence. `npx tsx scripts/s10/run-casework.ts` generates only missing current validated runs using the approved Z.ai adapter; it skips existing current runs and stops on a rejected result. Public requests never trigger this script or provider inference. Never claim test-provider mocks are actual runs.

`npm run build -- --webpack` is the verified build path when the execution environment prevents Turbopack's CSS worker from binding a port. The default build command remains unchanged. Start the built app with `npm run start`. Stop the server before rebuilding so the browser cannot load mixed build artifacts.

## Monitoring and degraded operation

- Check local/owner-managed production health and anonymous navigation after each release. Monitor HTTP 5xx, DB connection failures, rejected casework validations and task-override conflicts through hosting logs and `audit_events`. Do not log credentials, PII, tool payloads or raw provider identifiers.
- `CASEWORK_RUN_RECORDED` and `CASEWORK_RUN_REJECTED` audit records distinguish validated model output from rejected attempts. Stored run provenance includes model, prompt version, evidence hash, hashed response reference, token counts and model-selected read-only tools. Historical S10 preparation runs before run-audit support remain in `casework_runs` with that provenance.
- No current validated run: render `RULES_ONLY`, explicit no model attribution, deterministic policy and safe draft work. Reject stale output for internal task creation. No task is created after a failed investigation.
- Unavailable DB: surface a route error; do not fabricate a provider response or a successful task. Public sessions expire in 45 minutes. Synthetic changes can be reset without touching canonical evidence/payments.
- A failed evidence challenge retains the prior projection and exposes retry. An operator can reopen the case to retrieve stored tasks and override an open internal task. Revision checks reject stale overrides; the original run and audit remain.

## Financial recovery

Do not repeat a PayPal write to resume work. UNKNOWN/PENDING actions remain reserved under S6. Reconciliation uses the existing provider resource ID and GET only; missing provider identifiers or authorization are blockers for the operator. S10 adds no public financial action. Compare canonical captures/refunds/allocations/actions/certificates before and after public interaction with `npm run db:verify:s7` and `npx tsx scripts/db/verify-s10.ts`.

On 9 November, read-only diagnosis observed capture `PARTIALLY_REFUNDED` at USD 250.00 and a `COMPLETED` USD 100.00 refund. The accepted adapter conservatively maps the capture's post-refund status to `UNKNOWN`; this does not erase the historical completed capture or authorize another payment. The diagnostic script reports both raw and adapter status explicitly. No payment state or financial code was changed to force a success label.

## Rollback and live-merchant gates

Hosting owner may restore the accepted application revision. Additive S10 tables preserve existing ledger data; retain task and audit history. Do not run destructive down migrations against a used financial ledger. Migration 0009 changes the allowlisted synthetic scenarios and adds three RLS-protected tables; older app code should not be used to modify newer scenario values until those overlays expire/reset.

Live-money operation is not approved. Unpassed gates include real-customer consent, verified tenant isolation beyond the one-merchant demo, retention/deletion administration, merchant policy administration, independent security review, production provider agreements, risk-data privacy/legal review, monitoring/alert delivery, backup restoration rehearsal, incident/support coverage and hosting-owner release acceptance. Registration/eligibility, YouTube publication and Devpost submission remain owner-controlled and unverified until URLs/confirmation are supplied.
