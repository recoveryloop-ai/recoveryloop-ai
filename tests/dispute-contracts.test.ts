import { describe, expect, it } from "vitest";

import {
  aggregateOrderDisputeState,
  classifyDispute,
  isHandledDisputeEvent,
  parseDisputeEvent,
} from "../src/server/modules/disputes/contracts";

function disputeEvent(resource: Record<string, unknown>, eventType = "CUSTOMER.DISPUTE.CREATED") {
  return {
    id: "WH-EVENT-1",
    event_type: eventType,
    resource: {
      dispute_id: "PP-D-1001",
      status: "OPEN",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      dispute_life_cycle_stage: "INQUIRY",
      create_time: "2026-11-08T10:00:00.000Z",
      update_time: "2026-11-08T10:00:00.000Z",
      dispute_amount: { currency_code: "USD", value: "100.00" },
      disputed_transactions: [{ seller_transaction_id: "CAPTURE-123" }],
      ...resource,
    },
  };
}

describe("dispute classification fails closed", () => {
  it.each(["OPEN", "WAITING_FOR_BUYER_RESPONSE", "WAITING_FOR_SELLER_RESPONSE", "UNDER_REVIEW", "OTHER", "SOMETHING_NEW"])(
    "treats status %s as OPEN",
    (status) => expect(classifyDispute(status, null)).toBe("OPEN"),
  );

  it.each(["RESOLVED_SELLER_FAVOUR", "CANCELED_BY_BUYER", "DENIED", "NONE"])(
    "releases the guard only when a resolved dispute paid nothing (%s)",
    (outcome) => expect(classifyDispute("RESOLVED", outcome)).toBe("CLOSED_NO_PAYOUT"),
  );

  it.each(["RESOLVED_BUYER_FAVOUR", "RESOLVED_WITH_PAYOUT", "ACCEPTED"])(
    "keeps refunds blocked after the buyer was paid (%s)",
    (outcome) => expect(classifyDispute("RESOLVED", outcome)).toBe("BUYER_PAID"),
  );

  it("treats a resolved dispute with a missing or unknown outcome as buyer-paid", () => {
    expect(classifyDispute("RESOLVED", null)).toBe("BUYER_PAID");
    expect(classifyDispute("RESOLVED", "A_FUTURE_OUTCOME")).toBe("BUYER_PAID");
  });

  it("aggregates an order by highest severity", () => {
    expect(aggregateOrderDisputeState([])).toBe("NONE");
    expect(aggregateOrderDisputeState(["CLOSED_NO_PAYOUT"])).toBe("NONE");
    expect(aggregateOrderDisputeState(["CLOSED_NO_PAYOUT", "OPEN"])).toBe("OPEN");
    expect(aggregateOrderDisputeState(["OPEN", "BUYER_PAID", "CLOSED_NO_PAYOUT"])).toBe("BUYER_PAID");
  });
});

describe("dispute webhook parsing", () => {
  it("handles only dispute lifecycle events", () => {
    expect(isHandledDisputeEvent("CUSTOMER.DISPUTE.CREATED")).toBe(true);
    expect(isHandledDisputeEvent("CUSTOMER.DISPUTE.UPDATED")).toBe(true);
    expect(isHandledDisputeEvent("CUSTOMER.DISPUTE.RESOLVED")).toBe(true);
    expect(isHandledDisputeEvent("PAYMENT.CAPTURE.COMPLETED")).toBe(false);
  });

  it("parses an open dispute into an observation per capture, in integer cents", () => {
    const [observation, ...rest] = parseDisputeEvent(disputeEvent({}));
    expect(rest).toHaveLength(0);
    expect(observation).toMatchObject({
      providerDisputeId: "PP-D-1001",
      providerCaptureId: "CAPTURE-123",
      guardState: "OPEN",
      amountMinor: 10_000,
      currency: "USD",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      providerUpdatedAt: "2026-11-08T10:00:00.000Z",
    });
  });

  it("de-duplicates repeated captures and keeps every distinct one", () => {
    const observations = parseDisputeEvent(disputeEvent({
      disputed_transactions: [{ seller_transaction_id: "CAP-A" }, { seller_transaction_id: "CAP-B" }, { seller_transaction_id: "CAP-A" }],
    }));
    expect(observations.map((item) => item.providerCaptureId)).toEqual(["CAP-A", "CAP-B"]);
  });

  it("keeps a malformed or non-USD amount as unknown instead of guessing", () => {
    expect(parseDisputeEvent(disputeEvent({ dispute_amount: { currency_code: "EUR", value: "100.00" } }))[0]?.amountMinor).toBeNull();
    expect(parseDisputeEvent(disputeEvent({ dispute_amount: { currency_code: "USD", value: "1e2" } }))[0]?.amountMinor).toBeNull();
  });

  it("classifies a resolved event from its outcome", () => {
    const [observation] = parseDisputeEvent(disputeEvent({
      status: "RESOLVED",
      dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" },
    }, "CUSTOMER.DISPUTE.RESOLVED"));
    expect(observation?.guardState).toBe("CLOSED_NO_PAYOUT");
  });

  it("rejects a dispute it cannot link to a capture", () => {
    expect(() => parseDisputeEvent(disputeEvent({ disputed_transactions: [{}] }))).toThrow("PAYPAL_DISPUTE_TRANSACTION_MISSING");
    expect(() => parseDisputeEvent(disputeEvent({ disputed_transactions: [] }))).toThrow("PAYPAL_DISPUTE_EVENT_INVALID");
  });

  it("rejects malformed identifiers, statuses and timestamps", () => {
    expect(() => parseDisputeEvent(disputeEvent({ dispute_id: "PP-D-1'; drop table" }))).toThrow("PAYPAL_DISPUTE_EVENT_INVALID");
    expect(() => parseDisputeEvent(disputeEvent({ status: "open" }))).toThrow("PAYPAL_DISPUTE_EVENT_INVALID");
    expect(() => parseDisputeEvent(disputeEvent({ update_time: "yesterday" }))).toThrow("PAYPAL_DISPUTE_EVENT_INVALID");
    expect(() => parseDisputeEvent({ id: "x", event_type: "CUSTOMER.DISPUTE.CREATED" })).toThrow("PAYPAL_DISPUTE_EVENT_INVALID");
  });
});
