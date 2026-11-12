# S10 independent local reviews

Date: 9 November 2026. Owner clarification: the owner will create the single PR; the agent must perform independent reviews and final checks locally. This supersedes the earlier requirement to wait for the PR URL. Neither reviewer modified files, called providers, changed the database, built/deployed or merged anything.

## Product review

Fresh-context reviewer examined the full implementation diff, sprint/public contract, acceptance tests and desktop/mobile journey screenshots. Verdict: **no release-blocking finding**. The case workspace reduces context switching by keeping item/state, evidence, separate money buckets, nonfinancial decision, deterministic policy, work product, synthetic challenge/reset and separate certificate on one route. Stored AI versus rules-only, drafts versus submissions and synthetic versus PayPal sandbox proof remain explicit. Mobile reflows cleanly but remains text dense.

P3: “Buyer claim” could imply a stored buyer statement for the baseline. Addressed: baseline now says no buyer statement is stored and uses “Case context”; variants use “Synthetic case account.” No customer validation is claimed. Review limitation: screenshots preceded the final copy refinement; final smoke verifies the changed labels.

## Security/technical review

Fresh-context reviewer inspected the full diff, public/operator routes, evidence context, validator, task gateway, migrations and tests. Verdict: **no release-blocking security defect**. The reviewer found no anonymous inference/task/financial-write path or merchant-scope bypass. Strict schemas reject money authority, unsupported citations, stale hashes and forbidden transitions. Identity/role/merchant checks, task idempotency, evidence revalidation and revision-checked audited override remain enforced. A stale stored run cannot become financial authority; cache/task revalidation rejects stale work.

The canonical audit hash fix covers the complete persisted run details including run ID, and task/override events use the same helper. Eight append-only stored-run attestations preserve historical preparation audit records. No old audit row or financial record was changed to hide a failure.

P3: internal task creation should reject a retired prompt version, matching the public current-version reader. Addressed: the gateway now requires `caseworkPromptVersion`; the verifier asserts retired-version denial. Public validated-AI lookup also requires the approved GLM model, preventing a deliberately synthetic DB-verifier record from appearing as model proof.

The technical reviewer independently reported 7 focused unit files / 44 tests passing and `git diff --check` passing. Root's final full test/build/DB/browser evidence is in `S10_IMPLEMENTATION_REPORT.md`.

## Release disposition

Both review findings are addressed locally. The agent does not merge or deploy. The owner creates the single PR from `feat/s10-case-workspace`; CI and hosting-owner production acceptance are external follow-up gates. Live-money and real-customer production gates remain outside this sandbox release contract.
