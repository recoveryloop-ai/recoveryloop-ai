import { createHash, randomUUID } from "node:crypto";
import { createDatabase } from "../../src/server/db/client";
import { loadCaseworkContext } from "../../src/server/modules/casework/scenarios";
import { rulesCasework, validateCasework } from "../../src/server/modules/casework/decision";
import { assertCaseMerchant, createInternalTask, overrideInternalTask } from "../../src/server/modules/casework/task-gateway";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");
const { client } = createDatabase(databaseUrl);
const fixtureRunId = randomUUID();
const otherMerchantId=randomUUID(),otherPrincipalId=randomUUID(),otherUserId=randomUUID();
let fixtureTaskId: string | null = null;
let fixtureCaseId: string | null = null;

async function ledgerFingerprint(): Promise<string> {
  const [row] = await client<{ proof: string }[]>`select jsonb_build_object(
    'captures', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id,status,captured_minor,provider_capture_id,verified_at from captures) t),
    'refunds', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id,status,amount_minor,provider_refund_id,verified_at from refunds) t),
    'allocations', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id,obligation_id,refund_id,amount_minor,state from obligation_allocations) t),
    'actions', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id,state,request_id,provider_resource_id,verified_at from actions) t),
    'certificates', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id,action_id,certificate_hash from certificates) t)
  )::text as proof`;
  return createHash("sha256").update(String(row?.proof ?? "")).digest("hex");
}

try {
  const before = await ledgerFingerprint();
  const tables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in ('casework_evidence','casework_runs','casework_tasks') order by tablename`;
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count from information_schema.role_table_grants where table_schema='public' and table_name in ('casework_evidence','casework_runs','casework_tasks') and grantee in ('anon','authenticated')`;
  if (tables.length !== 3 || tables.some(table => !table.rowsecurity) || grants?.count !== 0) throw new Error("S10_RLS_OR_GRANTS_FAILED");

  const stored = await client<{ id: string; external_ref: string; scenario: string; evidence_hash: string; output_json: unknown }[]>`select r.id,cs.external_ref,r.scenario,r.evidence_hash,r.output_json from casework_runs r join cases cs on cs.id=r.case_id order by r.created_at,r.id`;
  for (const run of stored) {
    const context = await loadCaseworkContext(databaseUrl, run.external_ref, run.scenario as Parameters<typeof loadCaseworkContext>[2]);
    const checked = validateCasework(run.output_json, context);
    if (context.evidenceHash !== run.evidence_hash || !checked.output) throw new Error(`S10_STORED_RUN_INVALID:${run.id}:${checked.code}`);
  }

  const context = await loadCaseworkContext(databaseUrl, "RG-2048");
  const output = { ...rulesCasework(context), outcome: "REQUEST_EVIDENCE" as const };
  const checked = validateCasework(output, context);
  if (!checked.output) throw new Error(`S10_FIXTURE_RUN_INVALID:${checked.code}`);
  const [actor] = await client<{ id: string; auth_subject: string; merchant_id: string }[]>`select id,auth_subject,merchant_id from users where role in ('operator','admin') and merchant_id=(select o.merchant_id from cases cs join orders o on o.id=cs.order_id where cs.external_ref='RG-2048') order by id limit 1`;
  if (!actor) throw new Error("S10_OPERATOR_FIXTURE_MISSING");
  fixtureCaseId = context.case.id;
  await client`insert into merchants(id,name) values(${otherMerchantId},'S10 temporary isolation fixture')`;
  await client`insert into users(id,merchant_id,auth_subject,email,role) values(${otherUserId},${otherMerchantId},${otherPrincipalId},'s10-fixture@example.invalid','operator')`;
  let merchantDenied = false;
  try { await assertCaseMerchant(databaseUrl, "RG-2048", otherPrincipalId); }
  catch (error) { merchantDenied = error instanceof Error && error.message.includes("CASE_MERCHANT_SCOPE_DENIED"); }
  if (!merchantDenied) throw new Error("S10_MERCHANT_SCOPE_NOT_ENFORCED");
  const model = "s10-db-verifier";
  const responseHash = createHash("sha256").update("s10-db-verifier-no-provider-call").digest("hex");
  await client`insert into casework_runs(id,case_id,scenario,evidence_hash,model,prompt_version,output_json,tool_log,provider_response_hash,prompt_tokens,completion_tokens) values(${fixtureRunId},${context.case.id},'BASELINE',${context.evidenceHash},${model},'s10-verifier-only',${JSON.stringify(output)}::jsonb,'[]'::jsonb,${responseHash},0,0)`;
  const staleHash = "f".repeat(64);
  await client`update casework_runs set evidence_hash=${staleHash} where id=${fixtureRunId}`;
  let staleRunDenied = false;
  try { await createInternalTask(databaseUrl, "RG-2048", actor.auth_subject, fixtureRunId); }
  catch { staleRunDenied = true; }
  await client`update casework_runs set evidence_hash=${context.evidenceHash} where id=${fixtureRunId}`;
  if (!staleRunDenied) throw new Error("S10_STALE_RUN_NOT_REJECTED");
  const first = await createInternalTask(databaseUrl, "RG-2048", actor.auth_subject, fixtureRunId);
  if (first) fixtureTaskId = first.id;
  const second = await createInternalTask(databaseUrl, "RG-2048", actor.auth_subject, fixtureRunId);
  if (!first || !second || first.id !== second.id || first.outcome !== output.outcome) throw new Error("S10_TASK_IDEMPOTENCY_FAILED");
  const taskId = first.id;
  fixtureTaskId = taskId;
  const overridden = await overrideInternalTask(databaseUrl, "RG-2048", actor.auth_subject, taskId, first.revision, "OPERATOR_REVIEW_REQUIRED");
  if (overridden.state !== "OVERRIDDEN" || overridden.revision !== first.revision + 1) throw new Error("S10_OVERRIDE_FAILED");
  let conflictingRevisionDenied = false;
  try { await overrideInternalTask(databaseUrl, "RG-2048", actor.auth_subject, taskId, first.revision, "OPERATOR_REVIEW_REQUIRED"); }
  catch { conflictingRevisionDenied = true; }
  if (!conflictingRevisionDenied) throw new Error("S10_OVERRIDE_REVISION_NOT_ENFORCED");
  const audits = await client<{ created: number; overridden: number }[]>`select count(*) filter(where event_type='CASEWORK_TASK_CREATED')::int as created,count(*) filter(where event_type='CASEWORK_TASK_OVERRIDDEN')::int as overridden from audit_events where case_id=${fixtureCaseId} and details->>'taskId'=${fixtureTaskId}`;
  if (audits[0]?.created !== 1 || audits[0]?.overridden !== 1) throw new Error("S10_TASK_AUDIT_FAILED");

  const after = await ledgerFingerprint();
  if (before !== after) throw new Error("S10_CANONICAL_LEDGER_MUTATED");
  console.log(JSON.stringify({ status: "PASS", operation: "verify-s10", rlsTables: tables.length, anonAuthenticatedGrants: grants?.count ?? -1, storedRunsValidated: stored.length, merchantDenied, staleRunDenied, taskIdempotent: true, auditedOverride: true, conflictingRevisionDenied, canonicalLedgerStable: true, providerCalls: 0, financialWrites: 0 }));
} finally {
  if (fixtureTaskId) await client`delete from casework_tasks where id=${fixtureTaskId}`;
  if (fixtureTaskId) await client`delete from audit_events where case_id=${fixtureCaseId} and details->>'taskId'=${fixtureTaskId}`;
  await client`delete from casework_runs where id=${fixtureRunId}`;
  await client`delete from users where id=${otherUserId}`;
  await client`delete from merchants where id=${otherMerchantId}`;
  await client.end();
}
