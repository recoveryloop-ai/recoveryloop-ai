import { createHash } from "node:crypto";
import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { loadCaseworkContext } from "./scenarios";
import { validateCasework } from "./decision";
export async function assertCaseMerchant(databaseUrl: string, caseRef: string, principalId: string): Promise<string> {
  const { client } = createDatabase(databaseUrl);
  try {
    const [row] = await client<{
      merchant_id: string;
    }[]> `select o.merchant_id from cases cs join orders o on o.id=cs.order_id join users u on u.merchant_id=o.merchant_id where cs.external_ref=${caseRef} and u.auth_subject=${principalId} and u.role in ('operator','admin')`;
    if (!row)
      throw new AppError("CASE_MERCHANT_SCOPE_DENIED", 403);
    return row.merchant_id;
  }
  finally {
    await client.end();
  }
}
export async function createInternalTask(databaseUrl: string, caseRef: string, principalId: string, runId: string) {
  const merchantId = await assertCaseMerchant(databaseUrl, caseRef, principalId);
  const { client } = createDatabase(databaseUrl);
  try {
    return await client.begin(async (sql) => {
      // Serialize internal decisions and overrides for this case. No payment writes occur here.
      await sql `select id from cases where external_ref=${caseRef} for update`;
      const [run] = await sql<{
        case_id: string;
        scenario: string;
        output_json: unknown;
        evidence_hash: string;
      }[]> `select r.case_id,r.scenario,r.output_json,r.evidence_hash from casework_runs r join cases cs on cs.id=r.case_id join orders o on o.id=cs.order_id where r.id=${runId} and cs.external_ref=${caseRef} and o.merchant_id=${merchantId}`;
      if (!run || run.scenario !== "BASELINE")
        throw new AppError("CANONICAL_VALIDATED_RUN_REQUIRED", 409);
      const current = await loadCaseworkContext(databaseUrl, caseRef);
      const checked = validateCasework(run.output_json, current);
      if (!checked.output || current.evidenceHash !== run.evidence_hash)
        throw new AppError(checked.code === "VALIDATED" ? "STALE_CASE_INPUT" : checked.code, 409);
      const [task] = await sql<{
        id: string;
        state: string;
        outcome: string;
        revision: number;
      }[]> `insert into casework_tasks(run_id,case_id,merchant_id,outcome,state,created_by) values(${runId},${run.case_id},${merchantId},${checked.output.outcome},${checked.output.outcome === "NO_ACTION" ? "CLOSED" : "OPEN"},${principalId}) on conflict(run_id) do nothing returning id,state,outcome,revision`;
      if (!task) {
        const [existing] = await sql<{
          id: string;
          state: string;
          outcome: string;
          revision: number;
        }[]> `select id,state,outcome,revision from casework_tasks where run_id=${runId} and merchant_id=${merchantId}`;
        return existing;
      }
      const details = { taskId: task.id, runId, outcome: task.outcome, evidenceHash: current.evidenceHash, providerWrite: false };
      await sql `insert into audit_events(merchant_id,actor,case_id,event_type,details_hash,details) values(${merchantId},${`operator:${principalId}`},${run.case_id},'CASEWORK_TASK_CREATED',${createHash("sha256").update(JSON.stringify(details)).digest("hex")},${JSON.stringify(details)}::jsonb)`;
      return task;
    });
  }
  finally {
    await client.end();
  }
}
export async function overrideInternalTask(databaseUrl: string, caseRef: string, principalId: string, taskId: string, revision: number, reason: string) {
  const merchantId = await assertCaseMerchant(databaseUrl, caseRef, principalId);
  const { client } = createDatabase(databaseUrl);
  try {
    return await client.begin(async (sql) => {
      await sql `select id from cases where external_ref=${caseRef} for update`;
      const [task] = await sql<{
        id: string;
        case_id: string;
        revision: number;
        outcome: string;
        state: string;
      }[]> `update casework_tasks t set state='OVERRIDDEN',revision=revision+1,updated_at=now() from cases cs where t.id=${taskId} and t.case_id=cs.id and cs.external_ref=${caseRef} and t.merchant_id=${merchantId} and t.revision=${revision} and t.state='OPEN' returning t.id,t.case_id,t.revision,t.outcome,t.state`;
      if (!task)
        throw new AppError("TASK_OVERRIDE_CONFLICT", 409);
      // Store a reason code, not arbitrary operator prose or PII.
      const details = { taskId: task.id, revision: task.revision, reason, providerWrite: false };
      await sql `insert into audit_events(merchant_id,actor,case_id,event_type,details_hash,details) values(${merchantId},${`operator:${principalId}`},${task.case_id},'CASEWORK_TASK_OVERRIDDEN',${createHash("sha256").update(JSON.stringify(details)).digest("hex")},${JSON.stringify(details)}::jsonb)`;
      return task;
    });
  }
  finally {
    await client.end();
  }
}
export async function readInternalTasks(databaseUrl: string, caseRef: string, principalId: string) {
  const merchantId = await assertCaseMerchant(databaseUrl, caseRef, principalId);
  const { client } = createDatabase(databaseUrl);
  try {
    return await client<{
      id: string;
      state: string;
      outcome: string;
      revision: number;
    }[]> `select t.id,t.state,t.outcome,t.revision from casework_tasks t join cases cs on cs.id=t.case_id where cs.external_ref=${caseRef} and t.merchant_id=${merchantId} order by t.created_at desc,t.id desc limit 20`;
  }
  finally {
    await client.end();
  }
}
