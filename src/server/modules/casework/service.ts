import { hashAuditDetails } from "./audit-hash";
import { AppError } from "../../http/app-error";
import { createDatabase } from "../../db/client";
import { caseworkOutputSchema, type CaseworkContext, type CaseworkRun, type CaseWorkspace, type CaseworkScenario, type ToolLogEntry } from "./contracts";
import { buildWorkProduct, rulesCasework, validateCasework } from "./decision";
import { caseworkPromptVersion } from "./investigator";
import { loadCaseworkContext } from "./scenarios";
export async function readCaseworkRun(databaseUrl: string, context: CaseworkContext): Promise<CaseworkRun> {
  const { client } = createDatabase(databaseUrl);
  try {
    const [row] = await client<{
      id: string;
      model: string;
      prompt_version: string;
      output_json: unknown;
      tool_log: ToolLogEntry[];
      created_at: Date | string;
    }[]> `select id,model,prompt_version,output_json,tool_log,created_at from casework_runs where case_id=${context.case.id} and scenario=${context.scenario} and evidence_hash=${context.evidenceHash} and prompt_version=${caseworkPromptVersion} and model='glm-5.3' order by created_at desc,id desc limit 1`;
    if (row) {
      const checked = validateCasework(row.output_json, context);
      if (checked.output)
        return { id: row.id, mode: "STORED_VALIDATED", model: row.model, promptVersion: row.prompt_version, validationCode: "VALIDATED", createdAt: new Date(row.created_at).toISOString(), evidenceHash: context.evidenceHash, output: checked.output, toolLog: row.tool_log };
    }
  }
  finally {
    await client.end();
  }
  return { id: null, mode: "RULES_ONLY", model: null, promptVersion: caseworkPromptVersion, validationCode: "NO_CURRENT_VALIDATED_RUN", createdAt: null, evidenceHash: context.evidenceHash, output: rulesCasework(context), toolLog: [] };
}
export function projectWorkspace(context: CaseworkContext, run: CaseworkRun): CaseWorkspace {
  const item = context.order.items.find(item => item.fulfillmentStatus !== "DELIVERED") ?? context.order.items.at(-1)!;
  const source = context.scenario === "BASELINE" ? "CANONICAL_LEDGER" : "SYNTHETIC_SESSION_OVERLAY";
  const claims: Record<CaseworkScenario, string> = { BASELINE: `No buyer statement is stored. Item ${item.sku} fulfillment is ${item.fulfillmentStatus.replaceAll("_", " ")}; reconcile the stored remedy records.`, ALREADY_REFUNDED: "A second remedy is requested for an item already refunded (synthetic).", CONTRADICTORY_DELIVERY: "Destination confirmation conflicts with shipment evidence (synthetic).", PENDING_REFUND: "Refund requested; final payment outcome UNKNOWN (synthetic).", DAMAGED_ITEM: "Buyer reports damaged or not-as-described item; condition unverified (synthetic).", NOT_RECEIVED: "Buyer says not received while tracking says delivered (synthetic).", DISPUTE_INQUIRY: "Dispute inquiry requests evidence; no actual provider dispute verified (synthetic).", ENTITY_REVIEW: "Fictional identity lead with a shared name and different identifiers (synthetic)." };
  const capturedMinor = context.captures.filter(c => c.status === "COMPLETED").reduce((n, c) => n + c.capturedMinor, 0);
  return { caseRef: context.case.externalRef, scenario: context.scenario, source, providerWrite: false, aiCallMade: false, item: { name: item.name, sku: item.sku, state: item.fulfillmentStatus, source: context.scenario === "BASELINE" ? "SYNTHETIC ITEM MAPPING" : "SYNTHETIC SESSION OVERLAY" }, buyerClaim: claims[context.scenario], orderRef: context.order.externalRef, money: { capturedMinor, completedRefundMinor: context.obligation.realizedRefundMinor, pendingReservationMinor: context.obligation.pendingReservationMinor, obligationMinor: context.obligation.entitledMinor, proposedRemedyMinor: context.obligation.proposedRefundMinor, hypotheticalRecoveryMinor: 0, currency: "USD", source: context.scenario === "BASELINE" ? context.captures.some(c => c.provider === "PAYPAL") ? "PAYPAL SANDBOX / canonical ledger" : "SYNTHETIC FIXTURE / canonical ledger" : "SYNTHETIC SESSION OVERLAY / not provider cash" }, policy: { version: context.policy.version, decision: context.obligation.decision, reasons: context.obligation.reasonCodes }, timeline: [...context.shipments.flatMap(s => s.events.map(e => ({ id: e.id, label: e.eventType, source: `${s.provider} / ${e.sourceTier}`, observedAt: e.observedAt }))), ...context.evidence.map(e => ({ id: e.id, label: typeof e.facts.message === "string" ? e.facts.message : typeof e.facts.status === "string" ? e.facts.status : "Stored case evidence", source: `${e.provider} / ${e.sourceTier}`, observedAt: e.observedAt }))].sort((a, b) => a.observedAt.localeCompare(b.observedAt)), evidence: context.evidence.map(e => ({ id: e.id, provider: e.provider, sourceTier: e.sourceTier, observedAt: e.observedAt, facts: e.facts })), run, workProduct: buildWorkProduct(run.output, context), certificate: { caseRef: "RG-2052", href: "/app/cases/RG-2052/certificate", label: "Separate verified PayPal sandbox result · RG-2052" } };
}
export async function readCaseWorkspace(databaseUrl: string, caseRef: string, scenario: CaseworkScenario = "BASELINE"): Promise<CaseWorkspace> {
  if (!["RG-2048", "RG-2049", "RG-2050", "RG-2051", "RG-2052"].includes(caseRef)) throw new AppError("PUBLIC_DEMO_CASE_NOT_FOUND", 404);
  const context = await loadCaseworkContext(databaseUrl, caseRef, scenario);
  const run = await readCaseworkRun(databaseUrl, context);
  return projectWorkspace(context, run);
}
export async function persistCaseworkRun(databaseUrl: string, context: CaseworkContext, run: CaseworkRun & {
  providerResponseHash: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<string | null> {
  const { client } = createDatabase(databaseUrl);
  try {
    return await client.begin(async (sql) => {
      const details = { scenario: context.scenario, mode: run.mode, validationCode: run.validationCode, model: run.model, evidenceHash: run.evidenceHash, toolNames: run.toolLog.map(entry => entry.toolName), providerResponseHash: run.providerResponseHash, providerWrite: false };
      const current = await loadCaseworkContext(databaseUrl, context.case.externalRef, context.scenario);
      const valid = run.mode === "FRESH_VALIDATED" && current.evidenceHash === context.evidenceHash && Boolean(validateCasework(run.output, current).output);
      let runId: string | null = null;
      if (valid) {
        caseworkOutputSchema.parse(run.output);
        const [row] = await sql<{
          id: string;
        }[]> `insert into casework_runs(case_id,scenario,evidence_hash,model,prompt_version,output_json,tool_log,provider_response_hash,prompt_tokens,completion_tokens) values(${context.case.id},${context.scenario},${context.evidenceHash},${run.model!},${run.promptVersion},${JSON.stringify(run.output)}::jsonb,${JSON.stringify(run.toolLog)}::jsonb,${run.providerResponseHash},${run.promptTokens},${run.completionTokens}) returning id`;
        runId = row?.id ?? null;
      }
      const auditDetails = { ...details, runId };
      await sql `insert into audit_events(merchant_id,actor,case_id,event_type,details_hash,details) select o.merchant_id,'system:casework',cs.id,${valid ? "CASEWORK_RUN_RECORDED" : "CASEWORK_RUN_REJECTED"},${hashAuditDetails(auditDetails)},${JSON.stringify(auditDetails)}::jsonb from cases cs join orders o on o.id=cs.order_id where cs.id=${context.case.id}`;
      return runId;
    });
  }
  finally {
    await client.end();
  }
}
