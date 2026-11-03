import { createHash } from "node:crypto";

import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import {
  investigatorOutputSchema,
  type AiMessage,
  type AiToolCall,
  type InvestigationResult,
  type InvestigationStatus,
  type InvestigatorOutput,
  type InvestigatorProvider,
} from "./contracts";
import { investigatorPromptVersion, investigatorSystemPrompt } from "./prompt-v1";
import {
  loadInvestigationContext,
  ReadOnlyInvestigationToolbox,
  readOnlyToolDefinitions,
  type InvestigationContext,
} from "./read-only-tools";

type ToolLogEntry = {
  toolName: string;
  argumentsHash: string;
  responseHash: string;
  initiatedBy: "ORCHESTRATOR" | "MODEL";
};

export type InvestigationDraft = {
  status: InvestigationStatus;
  validationCode: string;
  output: InvestigatorOutput;
  promptTokens: number;
  completionTokens: number;
  providerResponseHash: string | null;
  toolLog: readonly ToolLogEntry[];
};

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function containsMoneyAuthority(output: InvestigatorOutput): boolean {
  const text = [
    output.summary,
    output.caveat,
    ...output.merchant_questions,
  ].join(" ");
  return /\$\s*\d|\b\d+\.\d{2}\b|\b(?:USD|dollars?)\s*\d/i.test(text);
}

function uniqueCitations(output: InvestigatorOutput): string[] {
  return [...new Set(output.findings.flatMap((finding) => finding.evidence_ids))];
}

export function buildRulesFallback(context: InvestigationContext): InvestigatorOutput {
  const preferredEvidence = [...context.evidence].sort((left, right) => {
    const priority = (tier: string) => ({ PROVIDER_VERIFIED: 0, PROVIDER_TEST: 1, MERCHANT_ATTESTED: 2, SYNTHETIC: 3 }[tier] ?? 4);
    return priority(left.sourceTier) - priority(right.sourceTier) || left.id.localeCompare(right.id);
  });
  const evidenceIds = preferredEvidence.slice(0, Math.max(2, Math.min(preferredEvidence.length, 3))).map((item) => item.id);
  if (evidenceIds.length < 2) throw new AppError("INSUFFICIENT_CASE_EVIDENCE", 409);

  const reasons = context.obligation.reasonCodes;
  if (reasons.includes("REFUND_ALREADY_SETTLED")) {
    return {
      case_id: context.case.id,
      summary: "The customer obligation is already satisfied by a completed refund allocation.",
      findings: [{ type: "REFUND_ALREADY_SETTLED", evidence_ids: evidenceIds, certainty: "supported" }],
      missing_evidence: ["carrier_reimbursement_terms"],
      proposed_action_type: "NO_ACTION",
      reason_codes: ["REFUND_ALREADY_SETTLED"],
      merchant_questions: [],
      caveat: "Carrier reimbursement is not verified and is not counted as recovered cash.",
    };
  }
  if (reasons.includes("REFUND_RESERVED") || reasons.includes("UNKNOWN_PAYMENT_OUTCOME")) {
    return {
      case_id: context.case.id,
      summary: "A refund reservation exists, but the final payment outcome remains unresolved.",
      findings: [{ type: "REFUND_RESERVED", evidence_ids: evidenceIds, certainty: "supported" }],
      missing_evidence: ["final_payment_status", "carrier_reimbursement_terms"],
      proposed_action_type: "MONITOR_PAYMENT",
      reason_codes: ["REFUND_RESERVED", "UNKNOWN_PAYMENT_OUTCOME"],
      merchant_questions: ["Confirm the final provider refund status before any further action."],
      caveat: "Pending money is reserved but is not reported as completed customer compensation.",
    };
  }
  if (reasons.includes("EVIDENCE_CONTRADICTS_ADDRESS")) {
    return {
      case_id: context.case.id,
      summary: "Stored delivery evidence is contradictory and requires merchant review.",
      findings: [{ type: "EVIDENCE_CONTRADICTION", evidence_ids: evidenceIds, certainty: "supported" }],
      missing_evidence: ["confirmed_delivery_address_match", "carrier_reimbursement_terms"],
      proposed_action_type: "REQUEST_EVIDENCE",
      reason_codes: ["EVIDENCE_CONTRADICTS_ADDRESS"],
      merchant_questions: ["Confirm the destination match using an approved, non-public record."],
      caveat: "The contradiction does not establish carrier fraud or liability.",
    };
  }
  if (context.obligation.decision === "ALLOWED") {
    return {
      case_id: context.case.id,
      summary: "One undelivered item is linked to a completed capture and an open policy obligation.",
      findings: [
        { type: "ITEM_RETURNED_TO_SENDER", evidence_ids: evidenceIds, certainty: "supported" },
        { type: "PARTIAL_FULFILLMENT", evidence_ids: evidenceIds, certainty: "supported" },
      ],
      missing_evidence: ["carrier_reimbursement_terms"],
      proposed_action_type: "REFUND_OBLIGATION",
      reason_codes: ["ITEM_RETURNED_TO_SENDER", "PARTIAL_FULFILLMENT"],
      merchant_questions: [],
      caveat: "The deterministic policy engine controls any refund amount; carrier reimbursement is not verified.",
    };
  }
  return {
    case_id: context.case.id,
    summary: "The case requires additional evidence before a customer remedy can be considered.",
    findings: [{ type: "PAYMENT_RECONCILIATION_REQUIRED", evidence_ids: evidenceIds, certainty: "supported" }],
    missing_evidence: ["final_payment_status", "carrier_reimbursement_terms"],
    proposed_action_type: "REQUEST_EVIDENCE",
    reason_codes: ["INSUFFICIENT_EVIDENCE"],
    merchant_questions: ["Confirm the final payment state and the applicable evidence snapshot."],
    caveat: "No provider action is authorized by this investigation.",
  };
}

export function validateInvestigatorOutput(rawContent: string, context: InvestigationContext): { output?: InvestigatorOutput; code: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    return { code: "AI_JSON_INVALID" };
  }
  const parsed = investigatorOutputSchema.safeParse(parsedJson);
  if (!parsed.success) return { code: "AI_SCHEMA_INVALID" };
  const output = parsed.data;
  if (output.case_id !== context.case.id) return { code: "AI_CASE_SCOPE_VIOLATION" };
  if (containsMoneyAuthority(output)) return { code: "AI_AMOUNT_REJECTED" };
  const citations = uniqueCitations(output);
  const allowedEvidence = new Set(context.evidence.map((item) => item.id));
  if (citations.length < 2 || citations.some((id) => !allowedEvidence.has(id))) {
    return { code: "UNSUPPORTED_CITATION" };
  }
  if (output.proposed_action_type === "REFUND_OBLIGATION" && context.obligation.decision !== "ALLOWED") {
    return { code: "AI_CONTRADICTS_DETERMINISTIC_RULE" };
  }
  const returnedItems = context.order.items.filter((item) => item.fulfillmentStatus === "RETURNED_TO_SENDER").length;
  const deliveredItems = context.order.items.filter((item) => item.fulfillmentStatus === "DELIVERED").length;
  const reasons = new Set(context.obligation.reasonCodes);
  const inconsistentFinding = output.findings.some((finding) => {
    if (finding.type === "ITEM_RETURNED_TO_SENDER") return returnedItems === 0;
    if (finding.type === "PARTIAL_FULFILLMENT") return returnedItems === 0 || deliveredItems === 0;
    if (finding.type === "REFUND_ALREADY_SETTLED") return !reasons.has("REFUND_ALREADY_SETTLED");
    if (finding.type === "REFUND_RESERVED") return !reasons.has("REFUND_RESERVED");
    if (finding.type === "EVIDENCE_CONTRADICTION") return !reasons.has("EVIDENCE_CONTRADICTS_ADDRESS");
    if (finding.type === "PAYMENT_RECONCILIATION_REQUIRED") return !reasons.has("CAPTURE_NOT_COMPLETED") && !reasons.has("UNKNOWN_PAYMENT_OUTCOME");
    return finding.type === "DELIVERY_FAILURE" && context.case.kind !== "DELIVERY_FAILURE";
  });
  if (inconsistentFinding) return { code: "AI_CONTRADICTS_DETERMINISTIC_RULE" };
  return { output, code: "VALIDATED" };
}

function executeAndLog(
  toolbox: ReadOnlyInvestigationToolbox,
  calls: readonly AiToolCall[],
  initiatedBy: ToolLogEntry["initiatedBy"],
  log: ToolLogEntry[],
): AiMessage[] {
  const messages: AiMessage[] = [];
  for (const call of calls) {
    const response = toolbox.execute(call);
    const content = JSON.stringify(response);
    log.push({
      toolName: call.name,
      argumentsHash: hashJson(call.argumentsJson),
      responseHash: hashJson(response),
      initiatedBy,
    });
    messages.push({ role: "tool", content, toolCallId: call.id });
  }
  return messages;
}

export class InvestigatorService {
  constructor(private readonly options: {
    databaseUrl: string;
    provider: InvestigatorProvider;
    maxToolCalls?: number;
    contextLoader?: (databaseUrl: string, caseRef: string) => Promise<InvestigationContext>;
    persistInvestigation?: (context: InvestigationContext, draft: InvestigationDraft) => Promise<string>;
  }) {}

  async investigate(caseRef: string): Promise<InvestigationResult> {
    const contextLoader = this.options.contextLoader ?? loadInvestigationContext;
    let context = await contextLoader(this.options.databaseUrl, caseRef);
    const toolbox = new ReadOnlyInvestigationToolbox(context);
    const maxToolCalls = this.options.maxToolCalls ?? 8;
    const toolLog: ToolLogEntry[] = [];
    const bootstrapCalls = toolbox.bootstrapCalls();
    const messages: AiMessage[] = [
      { role: "system", content: investigatorSystemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Investigate this scoped case using only read-only tools, then return the strict JSON contract.",
          case_id: context.case.id,
          case_ref: context.case.externalRef,
          order_id: context.order.id,
          capture_ids: context.captures.map((capture) => capture.id),
          policy_version: context.policy.version,
          evidence_hash: context.evidenceHash,
        }),
      },
      { role: "assistant", content: null, toolCalls: bootstrapCalls },
      ...executeAndLog(toolbox, bootstrapCalls, "ORCHESTRATOR", toolLog),
      {
        role: "user",
        content: "Return the final JSON now. Use at least two stored evidence IDs. Do not include any payout amount.",
      },
    ];
    let toolCallCount = bootstrapCalls.length;
    let promptTokens = 0;
    let completionTokens = 0;
    const providerResponseIds: string[] = [];
    let rawContent: string | null = null;
    let validationCode = "AI_UNAVAILABLE";

    try {
      for (let turnIndex = 0; turnIndex < 3; turnIndex += 1) {
        const turn = await this.options.provider.generate({ messages, tools: readOnlyToolDefinitions, jsonMode: true });
        promptTokens += turn.promptTokens;
        completionTokens += turn.completionTokens;
        providerResponseIds.push(turn.responseId);
        if (turn.toolCalls.length === 0) {
          rawContent = turn.content;
          break;
        }
        if (toolCallCount + turn.toolCalls.length > maxToolCalls) {
          validationCode = "AI_TOOL_BUDGET_EXCEEDED";
          break;
        }
        toolCallCount += turn.toolCalls.length;
        messages.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });
        messages.push(...executeAndLog(toolbox, turn.toolCalls, "MODEL", toolLog));
        messages.push({ role: "user", content: "Return the strict final JSON now; do not call more tools unless essential." });
      }
      if (rawContent) {
        let validated = validateInvestigatorOutput(rawContent, context);
        validationCode = validated.code;
        if (!validated.output) {
          messages.push({ role: "assistant", content: rawContent, toolCalls: [] });
          messages.push({
            role: "user",
            content: JSON.stringify({
              correction_required: validated.code,
              allowed_evidence_ids: context.evidence.map((item) => item.id),
              instruction: "Return corrected strict JSON. Remove unsupported claims, invented citations, and all payout amounts. Do not call tools.",
            }),
          });
          const correction = await this.options.provider.generate({ messages, tools: readOnlyToolDefinitions, jsonMode: true });
          promptTokens += correction.promptTokens;
          completionTokens += correction.completionTokens;
          providerResponseIds.push(correction.responseId);
          if (correction.toolCalls.length === 0 && correction.content) {
            validated = validateInvestigatorOutput(correction.content, context);
            validationCode = validated.code;
          }
        }
        if (validated.output) {
          const freshContext = await contextLoader(this.options.databaseUrl, caseRef);
          if (freshContext.evidenceHash === context.evidenceHash) {
            return this.persist(context, {
              status: "VALIDATED",
              validationCode: "VALIDATED",
              output: validated.output,
              promptTokens,
              completionTokens,
              providerResponseHash: hashJson(providerResponseIds),
              toolLog,
            });
          }
          context = freshContext;
          validationCode = "STALE_CASE_INPUT";
        }
      } else if (validationCode === "AI_UNAVAILABLE") {
        validationCode = "AI_EMPTY_OUTPUT";
      }
    } catch (error) {
      validationCode = error instanceof AppError ? error.code : "AI_UNAVAILABLE";
    }

    return this.persist(context, {
      status: "FALLBACK",
      validationCode,
      output: buildRulesFallback(context),
      promptTokens,
      completionTokens,
      providerResponseHash: providerResponseIds.length > 0 ? hashJson(providerResponseIds) : null,
      toolLog,
    });
  }

  private async persist(context: InvestigationContext, draft: InvestigationDraft): Promise<InvestigationResult> {
    const inputHash = hashJson({
      caseId: context.case.id,
      evidenceHash: context.evidenceHash,
      promptVersion: investigatorPromptVersion,
      model: this.options.provider.model,
    });
    if (this.options.persistInvestigation) {
      const investigationId = await this.options.persistInvestigation(context, draft);
      return this.toResult(investigationId, context, draft);
    }
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      const investigationId = await client.begin(async (sql) => {
        const [record] = await sql<{ id: string }[]>`insert into investigations
          (case_id, model, prompt_version, evidence_hash, input_hash, status, validation_code,
            output_json, tool_log, provider_response_hash, prompt_tokens, completion_tokens)
          values (${context.case.id}, ${this.options.provider.model}, ${investigatorPromptVersion},
            ${context.evidenceHash}, ${inputHash}, ${draft.status}, ${draft.validationCode},
            ${JSON.stringify(draft.output)}::jsonb, ${JSON.stringify(draft.toolLog)}::jsonb,
            ${draft.providerResponseHash}, ${draft.promptTokens}, ${draft.completionTokens})
          returning id`;
        if (!record) throw new AppError("INVESTIGATION_PERSIST_FAILED", 500);
        const auditDetails = {
          investigationId: record.id,
          promptVersion: investigatorPromptVersion,
          model: this.options.provider.model,
          evidenceHash: context.evidenceHash,
          status: draft.status,
          validationCode: draft.validationCode,
          toolNames: draft.toolLog.map((entry) => entry.toolName),
        };
        await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
          select o.merchant_id, 'system:ai-investigator', ${context.case.id}, 'INVESTIGATION_RECORDED',
            ${hashJson(auditDetails)}, ${JSON.stringify(auditDetails)}::jsonb
          from orders o where o.id = ${context.order.id}`;
        return record.id;
      });
      return this.toResult(investigationId, context, draft);
    } finally {
      await client.end();
    }
  }

  private toResult(investigationId: string, context: InvestigationContext, draft: InvestigationDraft): InvestigationResult {
    return {
      investigationId,
      caseRef: context.case.externalRef,
      status: draft.status,
      validationCode: draft.validationCode,
      source: draft.status === "VALIDATED" ? "ZAI_VALIDATED" : "RULES_ONLY_FALLBACK",
      model: this.options.provider.model,
      promptVersion: investigatorPromptVersion,
      evidenceHash: context.evidenceHash,
      output: draft.output,
      deterministic: {
        decision: context.obligation.decision,
        reasonCodes: context.obligation.reasonCodes,
        proposedRefundMinor: context.obligation.proposedRefundMinor,
        currency: context.obligation.currency,
      },
      evidence: context.evidence.map((record) => ({
        id: record.id,
        provider: record.provider,
        sourceTier: record.sourceTier,
        observedAt: record.observedAt,
        facts: record.facts,
      })),
    };
  }
}

export async function readLatestInvestigation(databaseUrl: string, caseRef: string): Promise<InvestigationResult | null> {
  const context = await loadInvestigationContext(databaseUrl, caseRef);
  const { client } = createDatabase(databaseUrl);
  try {
    const [record] = await client<{
      id: string;
      model: string;
      prompt_version: string;
      evidence_hash: string;
      status: InvestigationStatus;
      validation_code: string;
      output_json: unknown;
    }[]>`select i.id, i.model, i.prompt_version, i.evidence_hash, i.status, i.validation_code, i.output_json
      from investigations i where i.case_id = ${context.case.id}
      order by i.created_at desc, i.id desc limit 1`;
    if (!record) return null;
    const output = investigatorOutputSchema.parse(record.output_json);
    return {
      investigationId: record.id,
      caseRef,
      status: record.status,
      validationCode: record.validation_code,
      source: record.status === "VALIDATED" ? "ZAI_VALIDATED" : "RULES_ONLY_FALLBACK",
      model: record.model,
      promptVersion: record.prompt_version,
      evidenceHash: record.evidence_hash,
      output,
      deterministic: {
        decision: context.obligation.decision,
        reasonCodes: context.obligation.reasonCodes,
        proposedRefundMinor: context.obligation.proposedRefundMinor,
        currency: context.obligation.currency,
      },
      evidence: context.evidence.map((item) => ({
        id: item.id,
        provider: item.provider,
        sourceTier: item.sourceTier,
        observedAt: item.observedAt,
        facts: item.facts,
      })),
    };
  } finally {
    await client.end();
  }
}
