/**
 * Dispute guard integration tests against a real, migrated PostgreSQL database.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... npm run test:integration
 * Skipped when TEST_DATABASE_URL is not set (public CI has no database), so `npm test`
 * stays hermetic. Every test seeds its own merchant/order/case with random IDs.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PaymentProvider, PaymentRefund, RefundPaymentCaptureInput } from "../../src/server/adapters/payments/payment-provider";
import { createDatabase } from "../../src/server/db/client";
import { AppError } from "../../src/server/http/app-error";
import { recordVerifiedPayPalEvent } from "../../src/server/modules/disputes/paypal-event-ingestion-service";
import { readCaseObligation } from "../../src/server/modules/obligations/obligation-graph-service";
import { RefundActionService } from "../../src/server/modules/refunds/refund-action-service";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const run = describe.skipIf(!databaseUrl);

type Seeded = { caseRef: string; orderId: string; captureId: string; authSubject: string; obligationId: string };

class RecordingProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  readonly implementation = "sandbox" as const;
  readonly refundCalls: RefundPaymentCaptureInput[] = [];
  private readonly refunds = new Map<string, PaymentRefund>();
  constructor(private readonly capturedMinor = 25_000) {}
  createOrder(): never { throw new Error("NOT_USED"); }
  getOrder(): never { throw new Error("NOT_USED"); }
  captureOrder(): never { throw new Error("NOT_USED"); }
  async getCapture(providerCaptureId: string) {
    return { providerCaptureId, providerOrderId: "ORDER", amountMinor: this.capturedMinor, currency: "USD" as const,
      status: "COMPLETED" as const, sourceTier: "PROVIDER_VERIFIED" as const, synthetic: false, verifiedAt: new Date().toISOString() };
  }
  async refundCapture(input: RefundPaymentCaptureInput): Promise<PaymentRefund> {
    this.refundCalls.push(input);
    const refund: PaymentRefund = { providerRefundId: `REF-${input.requestId}`, providerCaptureId: input.providerCaptureId,
      amountMinor: input.amountMinor, currency: "USD", status: "COMPLETED", sourceTier: "PROVIDER_VERIFIED", synthetic: false,
      verifiedAt: new Date().toISOString() };
    this.refunds.set(refund.providerRefundId, refund);
    return refund;
  }
  async getRefund(providerRefundId: string) { return this.refunds.get(providerRefundId) ?? null; }
  async verifyWebhook() { return true; }
}

function disputeEvent(input: {
  eventId?: string; disputeId: string; captureId: string; status?: string; outcome?: string; updatedAt?: string;
  eventType?: string;
}) {
  const eventId = input.eventId ?? `WH-${randomUUID()}`;
  return {
    eventId,
    eventType: input.eventType ?? "CUSTOMER.DISPUTE.CREATED",
    payloadHash: "a".repeat(64),
    event: {
      id: eventId,
      event_type: input.eventType ?? "CUSTOMER.DISPUTE.CREATED",
      resource: {
        dispute_id: input.disputeId,
        status: input.status ?? "OPEN",
        reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
        update_time: input.updatedAt ?? "2026-11-08T10:00:00.000Z",
        dispute_amount: { currency_code: "USD", value: "100.00" },
        ...(input.outcome ? { dispute_outcome: { outcome_code: input.outcome } } : {}),
        disputed_transactions: [{ seller_transaction_id: input.captureId }],
      },
    },
  };
}

run("dispute guard (PostgreSQL)", () => {
  const { client } = createDatabase(databaseUrl);

  async function seedCase(): Promise<Seeded> {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const merchantId = randomUUID();
    const policyId = randomUUID();
    const orderId = randomUUID();
    const itemA = randomUUID();
    const itemB = randomUUID();
    const captureRowId = randomUUID();
    const caseId = randomUUID();
    const obligationId = randomUUID();
    const authSubject = randomUUID();
    const captureId = `CAP-${suffix}`;
    const caseRef = `IT-${suffix}`;
    await client.begin(async (sql) => {
      await sql`insert into merchants (id, name, currency, demo_mode) values (${merchantId}, ${`IT ${suffix}`}, 'USD', true)`;
      await sql`insert into policy_versions (id, merchant_id, version, json_rules, effective_at)
        values (${policyId}, ${merchantId}, 'v1', '{}'::jsonb, now())`;
      await sql`insert into users (id, merchant_id, auth_subject, email, role)
        values (${randomUUID()}, ${merchantId}, ${authSubject}, ${`op-${suffix}@example.invalid`}, 'operator')`;
      await sql`insert into orders (id, merchant_id, external_ref, fixture_key, currency, total_minor, status, policy_version_id)
        values (${orderId}, ${merchantId}, ${`ORD-${suffix}`}, null, 'USD', 25000, 'PARTIALLY_RETURNED', ${policyId})`;
      await sql`insert into order_items (id, order_id, sku, name, quantity, unit_minor, fulfillment_status) values
        (${itemA}, ${orderId}, 'A', 'Atlas Studio Headphones', 1, 15000, 'DELIVERED'),
        (${itemB}, ${orderId}, 'B', 'Orbit Mechanical Keyboard', 1, 10000, 'RETURNED_TO_SENDER')`;
      await sql`insert into captures (id, order_id, provider, provider_capture_id, status, captured_minor, currency, verified_at)
        values (${captureRowId}, ${orderId}, 'PAYPAL', ${captureId}, 'COMPLETED', 25000, 'USD', now())`;
      await sql`insert into cases (id, order_id, external_ref, kind, status, severity)
        values (${caseId}, ${orderId}, ${caseRef}, 'DELIVERY_FAILURE', 'OPEN', 'MEDIUM')`;
      await sql`insert into obligations (id, order_id, item_id, case_id, kind, reason_key, currency, entitled_minor, status, policy_version_id)
        values (${obligationId}, ${orderId}, ${itemB}, ${caseId}, 'CUSTOMER_REFUND', 'order-item:returned_to_sender', 'USD', 10000, 'OPEN', ${policyId})`;
      await sql`insert into evidence (case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
        values (${caseId}, 'EASYPOST', 'PROVIDER_TEST', ${`EV-${suffix}`}, ${"b".repeat(64)}, now(), false, '{"event":"RETURNED_TO_SENDER"}'::jsonb)`;
    });
    return { caseRef, orderId, captureId, authSubject, obligationId };
  }

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === code);
  }

  beforeAll(async () => {
    const [table] = await client<{ exists: boolean }[]>`select to_regclass('public.payment_disputes') is not null as exists`;
    if (!table?.exists) throw new Error("TEST_DATABASE_NOT_MIGRATED: run npm run db:migrate against TEST_DATABASE_URL");
  });
  afterAll(async () => { await client.end(); });

  it("allows a refund proposal when no dispute exists (baseline)", async () => {
    const seeded = await seedCase();
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    const proposal = await service.createProposal(seeded.authSubject, seeded.caseRef);
    expect(proposal.amountMinor).toBe(10_000);
  });

  it("blocks new proposals once an open dispute is ingested, and records it once", async () => {
    const seeded = await seedCase();
    const event = disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId });
    const first = await recordVerifiedPayPalEvent(databaseUrl, event);
    expect(first.duplicate).toBe(false);
    expect(first.disputes).toEqual([expect.objectContaining({ guardState: "OPEN", outcome: "INSERTED", matchedOrder: true })]);
    const replay = await recordVerifiedPayPalEvent(databaseUrl, event);
    expect(replay).toEqual({ duplicate: true, disputes: [] });

    const [count] = await client<{ n: number }[]>`select count(*)::int as n from payment_disputes where provider_capture_id = ${seeded.captureId}`;
    expect(count?.n).toBe(1);
    const [audit] = await client<{ n: number }[]>`select count(*)::int as n from audit_events
      where event_type = 'PAYPAL_DISPUTE_OBSERVED' and details->>'eventId' = ${event.eventId}`;
    expect(audit?.n).toBe(1);

    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    await expectCode(service.createProposal(seeded.authSubject, seeded.caseRef), "DISPUTE_OPEN");
    const view = await readCaseObligation(databaseUrl, seeded.caseRef);
    expect(view.reasonCodes).toContain("DISPUTE_OPEN");
    expect(view.proposedRefundMinor).toBe(0);
  });

  it("blocks approval of a proposal created before the dispute arrived", async () => {
    const seeded = await seedCase();
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    const proposal = await service.createProposal(seeded.authSubject, seeded.caseRef);
    await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId }));
    await expectCode(service.approveProposal(seeded.authSubject, proposal.proposalId, {
      snapshotHash: proposal.snapshotHash, confirmation: proposal.confirmation,
    }), "DISPUTE_OPEN");
    const [row] = await client<{ status: string }[]>`select status from proposals where id = ${proposal.proposalId}`;
    expect(row?.status).toBe("BLOCKED");
  });

  it("blocks execution of an approved reservation before any PayPal call and releases it", async () => {
    const seeded = await seedCase();
    const provider = new RecordingProvider();
    const service = new RefundActionService({ databaseUrl, paymentProvider: provider });
    const proposal = await service.createProposal(seeded.authSubject, seeded.caseRef);
    const approval = await service.approveProposal(seeded.authSubject, proposal.proposalId, {
      snapshotHash: proposal.snapshotHash, confirmation: proposal.confirmation,
    });
    await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId }));
    await expectCode(service.executeAction(seeded.authSubject, approval.actionId), "DISPUTE_OPEN");
    expect(provider.refundCalls).toHaveLength(0);
    const [action] = await client<{ state: string; failure_code: string | null }[]>`select state, failure_code from actions where id = ${approval.actionId}`;
    expect(action).toEqual({ state: "BLOCKED", failure_code: "DISPUTE_OPEN" });
  });

  it("ignores an out-of-order older event and re-allows refunds after a no-payout resolution", async () => {
    const seeded = await seedCase();
    const disputeId = `D-${randomUUID()}`;
    await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId, captureId: seeded.captureId, updatedAt: "2026-11-08T10:00:00.000Z" }));
    const resolved = await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({
      disputeId, captureId: seeded.captureId, status: "RESOLVED", outcome: "RESOLVED_SELLER_FAVOUR",
      updatedAt: "2026-11-09T10:00:00.000Z", eventType: "CUSTOMER.DISPUTE.RESOLVED",
    }));
    expect(resolved.disputes[0]).toMatchObject({ outcome: "UPDATED", guardState: "CLOSED_NO_PAYOUT" });
    const late = await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({
      disputeId, captureId: seeded.captureId, status: "WAITING_FOR_SELLER_RESPONSE", updatedAt: "2026-11-08T12:00:00.000Z",
      eventType: "CUSTOMER.DISPUTE.UPDATED",
    }));
    expect(late.disputes[0]).toMatchObject({ outcome: "STALE_IGNORED" });
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    await expect(service.createProposal(seeded.authSubject, seeded.caseRef)).resolves.toMatchObject({ amountMinor: 10_000 });
  });

  it("never refunds after a dispute paid the buyer", async () => {
    const seeded = await seedCase();
    await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({
      disputeId: `D-${randomUUID()}`, captureId: seeded.captureId, status: "RESOLVED", outcome: "RESOLVED_BUYER_FAVOUR",
      eventType: "CUSTOMER.DISPUTE.RESOLVED",
    }));
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    await expectCode(service.createProposal(seeded.authSubject, seeded.caseRef), "DISPUTE_PAID_TO_BUYER");
  });

  it("holds a dispute that arrives before its capture and guards as soon as the capture exists", async () => {
    const seeded = await seedCase();
    const lateCapture = `CAP-LATE-${randomUUID().slice(0, 8)}`;
    const early = await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: lateCapture }));
    expect(early.disputes[0]).toMatchObject({ matchedOrder: false, outcome: "INSERTED" });
    await client`update captures set provider_capture_id = ${lateCapture} where order_id = ${seeded.orderId}`;
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    await expectCode(service.createProposal(seeded.authSubject, seeded.caseRef), "DISPUTE_OPEN");
  });

  it("rejects an unparseable dispute without recording the inbox claim, so PayPal retries", async () => {
    const eventId = `WH-${randomUUID()}`;
    await expectCode(recordVerifiedPayPalEvent(databaseUrl, {
      eventId, eventType: "CUSTOMER.DISPUTE.CREATED", payloadHash: "c".repeat(64),
      event: { id: eventId, event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "D-BAD" } },
    }), "PAYPAL_DISPUTE_EVENT_INVALID");
    const [inbox] = await client<{ n: number }[]>`select count(*)::int as n from webhook_inbox where event_id = ${eventId}`;
    expect(inbox?.n).toBe(0);
  });

  it("records non-dispute events as processed without touching disputes", async () => {
    const eventId = `WH-${randomUUID()}`;
    const result = await recordVerifiedPayPalEvent(databaseUrl, {
      eventId, eventType: "PAYMENT.CAPTURE.COMPLETED", payloadHash: "d".repeat(64), event: { id: eventId, event_type: "PAYMENT.CAPTURE.COMPLETED" },
    });
    expect(result).toEqual({ duplicate: false, disputes: [] });
    const [inbox] = await client<{ processed: boolean }[]>`select processed_at is not null as processed from webhook_inbox where event_id = ${eventId}`;
    expect(inbox?.processed).toBe(true);
  });

  it("database trigger blocks a reservation even if application checks are bypassed", async () => {
    const seeded = await seedCase();
    const service = new RefundActionService({ databaseUrl, paymentProvider: new RecordingProvider() });
    const proposal = await service.createProposal(seeded.authSubject, seeded.caseRef);
    await recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId }));
    const [user] = await client<{ id: string }[]>`select id from users where auth_subject = ${seeded.authSubject}`;
    await expect(client`insert into actions (id, proposal_id, obligation_id, approved_by, approved_at, request_id, state)
      values (${randomUUID()}, ${proposal.proposalId}, ${seeded.obligationId}, ${user!.id}, now(), ${randomUUID()}, 'RESERVED')`)
      .rejects.toThrow("DISPUTE_GUARD_BLOCKED");
  });

  it("processes concurrent deliveries of the same event exactly once", async () => {
    const seeded = await seedCase();
    const event = disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId });
    const results = await Promise.all(Array.from({ length: 6 }, () => recordVerifiedPayPalEvent(databaseUrl, event)));
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    const [audit] = await client<{ n: number }[]>`select count(*)::int as n from audit_events
      where event_type = 'PAYPAL_DISPUTE_OBSERVED' and details->>'eventId' = ${event.eventId}`;
    expect(audit?.n).toBe(1);
  });

  it("never sends a refund to PayPal when a dispute races the approval", async () => {
    for (let round = 0; round < 25; round += 1) {
      const seeded = await seedCase();
      const provider = new RecordingProvider();
      const service = new RefundActionService({ databaseUrl, paymentProvider: provider });
      const proposal = await service.createProposal(seeded.authSubject, seeded.caseRef);
      const [approval] = await Promise.allSettled([
        service.approveProposal(seeded.authSubject, proposal.proposalId, { snapshotHash: proposal.snapshotHash, confirmation: proposal.confirmation }),
        recordVerifiedPayPalEvent(databaseUrl, disputeEvent({ disputeId: `D-${randomUUID()}`, captureId: seeded.captureId })),
      ]);
      if (approval.status === "fulfilled") {
        await expectCode(service.executeAction(seeded.authSubject, approval.value.actionId), "DISPUTE_OPEN");
      } else {
        expect(approval.reason).toSatisfy((error: unknown) => error instanceof AppError && error.code === "DISPUTE_OPEN");
      }
      expect(provider.refundCalls).toHaveLength(0);
    }
  });
});
