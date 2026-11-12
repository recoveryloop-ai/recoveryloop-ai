import { createHash } from "node:crypto";

import { z } from "zod";

import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { readCaseObligation } from "../obligations/obligation-graph-service";
import { runCounterfactual, simulationOptions } from "../simulation/counterfactual-engine";
import type { AiToolCall, AiToolDefinition } from "./contracts";

export const readOnlyToolNames = [
  "get_order",
  "get_paypal_capture",
  "get_paypal_refunds",
  "get_shipments",
  "get_merchant_policy",
  "get_obligation_balance",
  "get_case_evidence",
  "run_counterfactual",
] as const;

export type ReadOnlyToolName = typeof readOnlyToolNames[number];

type SafeEvidence = {
  id: string;
  provider: string;
  sourceTier: string;
  observedAt: string;
  payloadHash: string;
  facts: Record<string, unknown>;
};

export interface InvestigationContext {
  case: {
    id: string;
    externalRef: string;
    kind: string;
    status: string;
    severity: string;
    sourceTier: string;
  };
  order: {
    id: string;
    externalRef: string;
    status: string;
    currency: string;
    totalMinor: number;
    policyVersion: string;
    items: readonly {
      id: string;
      sku: string;
      name: string;
      quantity: number;
      unitMinor: number;
      taxMinor: number;
      shippingMinor: number;
      fulfillmentStatus: string;
    }[];
  };
  captures: readonly {
    id: string;
    provider: string;
    status: string;
    capturedMinor: number;
    currency: string;
    verifiedAt: string | null;
  }[];
  refunds: readonly {
    id: string;
    captureId: string;
    status: string;
    amountMinor: number;
    currency: string;
    verifiedAt: string | null;
  }[];
  shipments: readonly {
    id: string;
    provider: string;
    status: string;
    statusDetail: string | null;
    sourceTier: string;
    synthetic: boolean;
    events: readonly {
      id: string;
      eventType: string;
      eventDetail: string | null;
      observedAt: string;
      sourceTier: string;
      synthetic: boolean;
    }[];
  }[];
  policy: { version: string; rules: unknown };
  evidence: readonly SafeEvidence[];
  evidenceHash: string;
  obligation: Awaited<ReturnType<typeof readCaseObligation>>;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const suspiciousInstruction = /ignore\s+(all\s+)?previous|system\s+prompt|developer\s+message|call\s+(the\s+)?refund|approve\s+(the\s+)?refund|execute\s+(a\s+)?payment|submit\s+(a\s+)?claim|https?:\/\//i;

export function sanitizeUntrustedText(value: string): string {
  const normalized = [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("").trim().slice(0, 240);
  return suspiciousInstruction.test(normalized) ? "[UNTRUSTED_INSTRUCTION_REDACTED]" : normalized;
}

export function sanitizeEvidenceFacts(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const facts: Record<string, unknown> = {};
  for (const key of ["status", "statusDetail", "event", "fixture", "source", "mode", "currency", "version"] as const) {
    const value = record[key];
    if (typeof value === "string") facts[key] = sanitizeUntrustedText(value);
  }
  for (const key of ["amountMinor", "itemCount"] as const) {
    if (typeof record[key] === "number" && Number.isSafeInteger(record[key])) facts[key] = record[key];
  }
  if (Array.isArray(record.findings)) {
    facts.findings = record.findings.filter((item): item is string => typeof item === "string")
      .slice(0, 8).map(sanitizeUntrustedText);
  }
  if (typeof record.message === "string") facts.message = sanitizeUntrustedText(record.message);
  return facts;
}

export async function loadInvestigationContext(databaseUrl: string, caseRef: string): Promise<InvestigationContext> {
  const { client } = createDatabase(databaseUrl);
  try {
    const [root] = await client<{
      case_id: string;
      external_ref: string;
      kind: string;
      case_status: string;
      severity: string;
      source_tier: string;
      order_id: string;
      order_ref: string;
      order_status: string;
      currency: string;
      total_minor: number;
      policy_version: string;
      policy_rules: unknown;
    }[]>`select cs.id as case_id, cs.external_ref, cs.kind, cs.status as case_status, cs.severity,
        cs.source_tier, o.id as order_id, o.external_ref as order_ref, o.status as order_status,
        o.currency, o.total_minor, pv.version as policy_version, pv.json_rules as policy_rules
      from cases cs join orders o on o.id = cs.order_id
      join policy_versions pv on pv.id = o.policy_version_id
      where cs.external_ref = ${caseRef}`;
    if (!root) throw new AppError("CASE_NOT_FOUND", 404);

    const itemsPromise = client<{
      id: string;
      sku: string;
      name: string;
      quantity: number;
      unit_minor: number;
      tax_minor: number;
      shipping_allocation_minor: number;
      fulfillment_status: string;
    }[]>`select id, sku, name, quantity, unit_minor, tax_minor, shipping_allocation_minor, fulfillment_status
      from order_items where order_id = ${root.order_id} order by sku`;
    const capturesPromise = client<{
      id: string;
      provider: string;
      status: string;
      captured_minor: number;
      currency: string;
      verified_at: Date | string | null;
    }[]>`select id, provider, status, captured_minor, currency, verified_at
      from captures where order_id = ${root.order_id} order by id`;
    const refundsPromise = client<{
      id: string;
      capture_id: string;
      status: string;
      amount_minor: number;
      currency: string;
      verified_at: Date | string | null;
    }[]>`select r.id, r.capture_id, r.status, r.amount_minor, r.currency, r.verified_at
      from refunds r join captures c on c.id = r.capture_id
      where c.order_id = ${root.order_id} order by r.id`;
    const shipmentRowsPromise = client<{
      shipment_id: string;
      provider: string;
      shipment_status: string;
      status_detail: string | null;
      shipment_source_tier: string;
      shipment_synthetic: boolean;
      event_id: string | null;
      event_type: string | null;
      event_detail: string | null;
      observed_at: Date | string | null;
      event_source_tier: string | null;
      event_synthetic: boolean | null;
    }[]>`select s.id as shipment_id, s.provider, s.status as shipment_status, s.status_detail,
        s.source_tier as shipment_source_tier, s.synthetic_flag as shipment_synthetic,
        se.id as event_id, se.event_type, se.event_detail, se.observed_at,
        se.source_tier as event_source_tier, se.synthetic_flag as event_synthetic
      from shipments s left join shipment_events se on se.shipment_id = s.id
      where s.order_id = ${root.order_id} order by s.id, se.observed_at`;
    const evidenceRowsPromise = client<{
      id: string;
      provider: string;
      source_tier: string;
      observed_at: Date | string;
      payload_hash: string;
      redacted_json: unknown;
    }[]>`select id, provider, source_tier, observed_at, payload_hash, redacted_json
      from evidence where case_id = ${root.case_id} order by id`;
    const [items, captures, refunds, shipmentRows, evidenceRows, obligation] = await Promise.all([
      itemsPromise, capturesPromise, refundsPromise, shipmentRowsPromise, evidenceRowsPromise,
      readCaseObligation(databaseUrl, caseRef),
    ]);
    if (evidenceRows.length === 0) throw new AppError("CASE_EVIDENCE_NOT_FOUND", 409);

    const shipmentMap = new Map<string, InvestigationContext["shipments"][number] & { events: Array<InvestigationContext["shipments"][number]["events"][number]> }>();
    for (const row of shipmentRows) {
      let shipment = shipmentMap.get(row.shipment_id);
      if (!shipment) {
        shipment = {
          id: row.shipment_id,
          provider: row.provider,
          status: row.shipment_status,
          statusDetail: row.status_detail,
          sourceTier: row.shipment_source_tier,
          synthetic: row.shipment_synthetic,
          events: [],
        };
        shipmentMap.set(row.shipment_id, shipment);
      }
      if (row.event_id && row.event_type && row.observed_at && row.event_source_tier && row.event_synthetic !== null) {
        shipment.events.push({
          id: row.event_id,
          eventType: row.event_type,
          eventDetail: row.event_detail,
          observedAt: iso(row.observed_at)!,
          sourceTier: row.event_source_tier,
          synthetic: row.event_synthetic,
        });
      }
    }

    const evidence = evidenceRows.map((row) => ({
      id: row.id,
      provider: row.provider,
      sourceTier: row.source_tier,
      observedAt: iso(row.observed_at)!,
      payloadHash: row.payload_hash,
      facts: sanitizeEvidenceFacts(row.redacted_json),
    }));

    return {
      case: {
        id: root.case_id,
        externalRef: root.external_ref,
        kind: root.kind,
        status: root.case_status,
        severity: root.severity,
        sourceTier: root.source_tier,
      },
      order: {
        id: root.order_id,
        externalRef: root.order_ref,
        status: root.order_status,
        currency: root.currency,
        totalMinor: root.total_minor,
        policyVersion: root.policy_version,
        items: items.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitMinor: item.unit_minor,
          taxMinor: item.tax_minor,
          shippingMinor: item.shipping_allocation_minor,
          fulfillmentStatus: item.fulfillment_status,
        })),
      },
      captures: captures.map((capture) => ({
        id: capture.id,
        provider: capture.provider,
        status: capture.status,
        capturedMinor: capture.captured_minor,
        currency: capture.currency,
        verifiedAt: iso(capture.verified_at),
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        captureId: refund.capture_id,
        status: refund.status,
        amountMinor: refund.amount_minor,
        currency: refund.currency,
        verifiedAt: iso(refund.verified_at),
      })),
      shipments: [...shipmentMap.values()],
      policy: { version: root.policy_version, rules: root.policy_rules },
      evidence,
      evidenceHash: hashJson(evidence.map((item) => `${item.id}:${item.payloadHash}`)),
      obligation,
    };
  } finally {
    await client.end();
  }
}

const toolSpecs = [
  ["get_order", "Read the scoped order and item snapshot.", "order_id"],
  ["get_paypal_capture", "Read one scoped capture state without provider credentials.", "capture_id"],
  ["get_paypal_refunds", "Read refunds associated with one scoped capture.", "capture_id"],
  ["get_shipments", "Read normalized shipment and event states for the scoped order.", "order_id"],
  ["get_merchant_policy", "Read the immutable merchant policy snapshot.", "version"],
  ["get_obligation_balance", "Read the deterministic obligation balance for the scoped order.", "order_id"],
  ["get_case_evidence", "Read redacted evidence records for the scoped case.", "case_id"],
  ["run_counterfactual", "Run a side-effect-free deterministic simulation for the scoped case.", "case_id"],
] as const;

export const readOnlyToolDefinitions: readonly AiToolDefinition[] = toolSpecs.map(([name, description, property]) => ({
  type: "function" as const,
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties: {
        [property]: { type: "string" },
        ...(name === "run_counterfactual" ? { option: { type: "string", enum: simulationOptions } } : {}),
      },
      required: name === "run_counterfactual" ? [property, "option"] : [property],
      additionalProperties: false,
    },
  },
}));

const uuidArgSchema = (key: string) => z.object({ [key]: z.uuid() }).strict();

export class ReadOnlyInvestigationToolbox {
  constructor(readonly context: InvestigationContext) {}

  bootstrapCalls(): readonly AiToolCall[] {
    return [
      { id: "bootstrap-evidence", name: "get_case_evidence", argumentsJson: JSON.stringify({ case_id: this.context.case.id }) },
      { id: "bootstrap-order", name: "get_order", argumentsJson: JSON.stringify({ order_id: this.context.order.id }) },
      { id: "bootstrap-obligation", name: "get_obligation_balance", argumentsJson: JSON.stringify({ order_id: this.context.order.id }) },
      { id: "bootstrap-shipments", name: "get_shipments", argumentsJson: JSON.stringify({ order_id: this.context.order.id }) },
    ];
  }

  execute(call: AiToolCall): unknown {
    if (!readOnlyToolNames.includes(call.name as ReadOnlyToolName)) throw new AppError("AI_TOOL_FORBIDDEN", 400);
    let args: unknown;
    try {
      args = JSON.parse(call.argumentsJson);
    } catch {
      throw new AppError("AI_TOOL_ARGUMENTS_INVALID", 400);
    }
    switch (call.name as ReadOnlyToolName) {
      case "get_order": {
        const parsed = uuidArgSchema("order_id").parse(args);
        if (parsed.order_id !== this.context.order.id) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return this.context.order;
      }
      case "get_paypal_capture": {
        const parsed = uuidArgSchema("capture_id").parse(args);
        const capture = this.context.captures.find((item) => item.id === parsed.capture_id);
        if (!capture) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return capture;
      }
      case "get_paypal_refunds": {
        const parsed = uuidArgSchema("capture_id").parse(args);
        if (!this.context.captures.some((item) => item.id === parsed.capture_id)) {
          throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        }
        return this.context.refunds.filter((item) => item.captureId === parsed.capture_id);
      }
      case "get_shipments": {
        const parsed = uuidArgSchema("order_id").parse(args);
        if (parsed.order_id !== this.context.order.id) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return this.context.shipments;
      }
      case "get_merchant_policy": {
        const parsed = z.object({ version: z.string().min(1).max(32) }).strict().parse(args);
        if (parsed.version !== this.context.policy.version) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return this.context.policy;
      }
      case "get_obligation_balance": {
        const parsed = uuidArgSchema("order_id").parse(args);
        if (parsed.order_id !== this.context.order.id) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return {
          decision: this.context.obligation.decision,
          reasonCodes: this.context.obligation.reasonCodes,
          entitledMinor: this.context.obligation.entitledMinor,
          realizedRefundMinor: this.context.obligation.realizedRefundMinor,
          pendingReservationMinor: this.context.obligation.pendingReservationMinor,
          outstandingMinor: this.context.obligation.outstandingMinor,
          proposedRefundMinor: this.context.obligation.proposedRefundMinor,
          currency: this.context.obligation.currency,
          policyVersion: this.context.obligation.policyVersion,
          evidenceIds: this.context.obligation.evidenceIds,
        };
      }
      case "get_case_evidence": {
        const parsed = uuidArgSchema("case_id").parse(args);
        if (parsed.case_id !== this.context.case.id) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return this.context.evidence.map((record) => ({
          id: record.id,
          provider: record.provider,
          sourceTier: record.sourceTier,
          observedAt: record.observedAt,
          facts: record.facts,
        }));
      }
      case "run_counterfactual": {
        const parsed = z.object({ case_id: z.uuid(), option: z.enum(simulationOptions) }).strict().parse(args);
        if (parsed.case_id !== this.context.case.id) throw new AppError("AI_TOOL_SCOPE_VIOLATION", 403);
        return runCounterfactual(this.context.obligation, parsed.option);
      }
    }
  }
}
