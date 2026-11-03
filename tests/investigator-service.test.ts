import { describe, expect, it } from "vitest";

import type {
  AiTurnRequest,
  AiTurnResponse,
  InvestigatorOutput,
  InvestigatorProvider,
} from "../src/server/modules/investigation/contracts";
import {
  buildRulesFallback,
  InvestigatorService,
  validateInvestigatorOutput,
} from "../src/server/modules/investigation/investigator-service";
import { createInvestigationContext, investigationIds } from "./helpers/investigation-context";

const validOutput: InvestigatorOutput = {
  case_id: investigationIds.case,
  summary: "One item was returned to sender and an open policy obligation exists.",
  findings: [{
    type: "ITEM_RETURNED_TO_SENDER",
    evidence_ids: [investigationIds.evidenceA, investigationIds.evidenceB],
    certainty: "supported",
  }],
  missing_evidence: ["carrier_reimbursement_terms"],
  proposed_action_type: "REFUND_OBLIGATION",
  reason_codes: ["ITEM_RETURNED_TO_SENDER"],
  merchant_questions: [],
  caveat: "Carrier reimbursement is not verified.",
};

class FakeProvider implements InvestigatorProvider {
  readonly model = "glm-5.3";
  requests: AiTurnRequest[] = [];

  constructor(private readonly response: AiTurnResponse | Error) {}

  async generate(request: AiTurnRequest): Promise<AiTurnResponse> {
    this.requests.push(request);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

function serviceWith(provider: InvestigatorProvider, contexts = [createInvestigationContext()]) {
  let loadIndex = 0;
  return new InvestigatorService({
    databaseUrl: "postgresql://not-used",
    provider,
    contextLoader: async () => contexts[Math.min(loadIndex++, contexts.length - 1)]!,
    persistInvestigation: async () => "90000000-0000-4000-8000-000000000001",
  });
}

function response(output: unknown): AiTurnResponse {
  return {
    content: JSON.stringify(output),
    toolCalls: [],
    responseId: "zai-response-test",
    promptTokens: 120,
    completionTokens: 80,
  };
}

describe("AI investigator", () => {
  it("accepts strict grounded output citing two stored evidence records", async () => {
    const provider = new FakeProvider(response(validOutput));
    const result = await serviceWith(provider).investigate("RG-2048");
    expect(result).toMatchObject({
      status: "VALIDATED",
      validationCode: "VALIDATED",
      source: "ZAI_VALIDATED",
      deterministic: { decision: "ALLOWED", proposedRefundMinor: 10_000 },
    });
    expect(provider.requests[0]?.tools).toHaveLength(8);
    expect(provider.requests[0]?.messages[0]).toMatchObject({ role: "system" });
  });

  it("rejects a fabricated evidence citation and returns a durable rules fallback", async () => {
    const fabricated = structuredClone(validOutput);
    fabricated.findings[0]!.evidence_ids = [
      investigationIds.evidenceA,
      "80000000-0000-4000-8000-000000009999",
    ];
    const result = await serviceWith(new FakeProvider(response(fabricated))).investigate("RG-2048");
    expect(result.status).toBe("FALLBACK");
    expect(result.validationCode).toBe("UNSUPPORTED_CITATION");
    expect(result.source).toBe("RULES_ONLY_FALLBACK");
  });

  it("rejects model-authored payout amounts even when the schema is otherwise valid", () => {
    const withAmount = { ...validOutput, summary: "Issue a $100.00 refund for the returned item." };
    expect(validateInvestigatorOutput(JSON.stringify(withAmount), createInvestigationContext())).toEqual({
      code: "AI_AMOUNT_REJECTED",
    });
    expect(validateInvestigatorOutput(JSON.stringify({ ...validOutput, amount_minor: 10_000 }), createInvestigationContext())).toEqual({
      code: "AI_SCHEMA_INVALID",
    });
  });

  it("falls back when Z.ai is unavailable", async () => {
    const result = await serviceWith(new FakeProvider(new Error("connection refused"))).investigate("RG-2048");
    expect(result).toMatchObject({ status: "FALLBACK", validationCode: "AI_UNAVAILABLE" });
    expect(result.output.proposed_action_type).toBe("REFUND_OBLIGATION");
  });

  it("rejects a stale evidence snapshot after model completion", async () => {
    const original = createInvestigationContext();
    const changed = { ...createInvestigationContext(), evidenceHash: "b".repeat(64) };
    const result = await serviceWith(new FakeProvider(response(validOutput)), [original, changed]).investigate("RG-2048");
    expect(result).toMatchObject({ status: "FALLBACK", validationCode: "STALE_CASE_INPUT", evidenceHash: "b".repeat(64) });
  });

  it("rejects a model attempt to call a payment-write tool without invoking any payment adapter", async () => {
    const provider = new FakeProvider({
      content: null,
      toolCalls: [{ id: "write-attempt", name: "refund_payment", argumentsJson: "{}" }],
      responseId: "zai-write-attempt",
      promptTokens: 10,
      completionTokens: 10,
    });
    const result = await serviceWith(provider).investigate("RG-2048");
    expect(result).toMatchObject({ status: "FALLBACK", validationCode: "AI_TOOL_FORBIDDEN" });
  });

  it("labels contradictory evidence without alleging fraud", () => {
    const context = createInvestigationContext();
    const contradictory = {
      ...context,
      obligation: {
        ...context.obligation,
        decision: "BLOCKED" as const,
        reasonCodes: ["EVIDENCE_CONTRADICTS_ADDRESS"] as const,
        proposedRefundMinor: 0,
      },
    };
    const fallback = buildRulesFallback(contradictory);
    expect(fallback.findings[0]?.type).toBe("EVIDENCE_CONTRADICTION");
    expect(`${fallback.summary} ${fallback.caveat}`).not.toMatch(/carrier fraud (is|was|confirmed|proven)/i);
  });
});
