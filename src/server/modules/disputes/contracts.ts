import { z } from "zod";

import { parsePayPalAmount } from "../../../shared/money";

/**
 * Dispute guard contract.
 *
 * A PayPal dispute moves money through a different path from the Refunds API. If a
 * refund is issued while a dispute on the same capture is open (or after the buyer has
 * already been paid through the dispute), the customer is paid twice. The guard state
 * below is the only signal the money path consumes; everything else is stored for audit.
 *
 * Classification fails closed: any status or outcome we do not recognise keeps refunds
 * blocked until a human or a later, recognised event says otherwise.
 */

export const disputeGuardStates = ["OPEN", "BUYER_PAID", "CLOSED_NO_PAYOUT"] as const;
export type DisputeGuardState = typeof disputeGuardStates[number];

/** Aggregate state for an order, consumed by the obligation engine. */
export type OrderDisputeState = "NONE" | "OPEN" | "BUYER_PAID";

export const handledDisputeEventTypes = [
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
] as const;
export type HandledDisputeEventType = typeof handledDisputeEventTypes[number];

/** Outcomes where the buyer was not paid through the dispute: refunds may proceed again. */
const outcomesWithoutBuyerPayout: ReadonlySet<string> = new Set([
  "RESOLVED_SELLER_FAVOUR",
  "CANCELED_BY_BUYER",
  "DENIED",
  "NONE",
]);

/** Outcomes where money reached the buyer through the dispute: never refund on top. */
const outcomesWithBuyerPayout: ReadonlySet<string> = new Set([
  "RESOLVED_BUYER_FAVOUR",
  "RESOLVED_WITH_PAYOUT",
  "ACCEPTED",
]);

export function isHandledDisputeEvent(eventType: string): eventType is HandledDisputeEventType {
  return (handledDisputeEventTypes as readonly string[]).includes(eventType);
}

/**
 * Maps PayPal's status/outcome to the guard state. Unknown or missing outcomes on a
 * RESOLVED dispute are treated as BUYER_PAID (fail closed); any non-RESOLVED status,
 * including OTHER and values PayPal may add later, is OPEN.
 */
export function classifyDispute(status: string, outcomeCode: string | null): DisputeGuardState {
  if (status !== "RESOLVED") return "OPEN";
  if (outcomeCode && outcomesWithoutBuyerPayout.has(outcomeCode)) return "CLOSED_NO_PAYOUT";
  if (outcomeCode && outcomesWithBuyerPayout.has(outcomeCode)) return "BUYER_PAID";
  return "BUYER_PAID";
}

/** Highest-severity state wins: BUYER_PAID > OPEN > NONE. */
export function aggregateOrderDisputeState(states: readonly DisputeGuardState[]): OrderDisputeState {
  if (states.includes("BUYER_PAID")) return "BUYER_PAID";
  if (states.includes("OPEN")) return "OPEN";
  return "NONE";
}

const providerToken = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const enumToken = z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/);

const disputeResourceSchema = z.object({
  dispute_id: providerToken,
  status: enumToken,
  reason: enumToken.optional(),
  dispute_life_cycle_stage: enumToken.optional(),
  create_time: z.iso.datetime({ offset: true }).optional(),
  update_time: z.iso.datetime({ offset: true }),
  dispute_amount: z.object({ currency_code: z.string().length(3), value: z.string() }).optional(),
  dispute_outcome: z.object({ outcome_code: enumToken.optional() }).passthrough().optional(),
  disputed_transactions: z.array(z.object({ seller_transaction_id: providerToken.optional() }).passthrough()).min(1),
}).passthrough();

const disputeEventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: disputeResourceSchema,
}).passthrough();

export type DisputeObservation = {
  readonly providerDisputeId: string;
  readonly providerCaptureId: string;
  readonly providerStatus: string;
  readonly outcomeCode: string | null;
  readonly reason: string | null;
  readonly lifecycleStage: string | null;
  readonly guardState: DisputeGuardState;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly providerCreatedAt: string | null;
  readonly providerUpdatedAt: string;
};

export class DisputeEventError extends Error {
  constructor(readonly code: "PAYPAL_DISPUTE_EVENT_INVALID" | "PAYPAL_DISPUTE_TRANSACTION_MISSING") {
    super(code);
    this.name = "DisputeEventError";
  }
}

/**
 * Parses a verified dispute webhook into one observation per disputed capture.
 * Throws rather than guessing: an unparseable dispute cannot be linked to a capture,
 * so the webhook must fail and be retried by PayPal (and surface in error monitoring).
 */
export function parseDisputeEvent(event: unknown): DisputeObservation[] {
  const parsed = disputeEventSchema.safeParse(event);
  if (!parsed.success) throw new DisputeEventError("PAYPAL_DISPUTE_EVENT_INVALID");
  const resource = parsed.data.resource;

  const captureIds = [...new Set(resource.disputed_transactions
    .map((transaction) => transaction.seller_transaction_id)
    .filter((value): value is string => typeof value === "string"))];
  if (captureIds.length === 0) throw new DisputeEventError("PAYPAL_DISPUTE_TRANSACTION_MISSING");

  let amountMinor: number | null = null;
  let currency: string | null = null;
  if (resource.dispute_amount) {
    currency = resource.dispute_amount.currency_code;
    try {
      amountMinor = parsePayPalAmount(resource.dispute_amount.value, currency).minor;
    } catch {
      // Non-USD or malformed amounts are kept as unknown; the guard does not depend on them.
      amountMinor = null;
    }
  }

  const outcomeCode = resource.dispute_outcome?.outcome_code ?? null;
  const guardState = classifyDispute(resource.status, outcomeCode);
  return captureIds.map((providerCaptureId) => Object.freeze({
    providerDisputeId: resource.dispute_id,
    providerCaptureId,
    providerStatus: resource.status,
    outcomeCode,
    reason: resource.reason ?? null,
    lifecycleStage: resource.dispute_life_cycle_stage ?? null,
    guardState,
    amountMinor,
    currency,
    providerCreatedAt: resource.create_time ?? null,
    providerUpdatedAt: resource.update_time,
  }));
}
