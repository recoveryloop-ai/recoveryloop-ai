import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { DisputeEventError, isHandledDisputeEvent, parseDisputeEvent, type DisputeGuardState, type DisputeObservation } from "./contracts";

export type VerifiedPayPalEvent = {
  readonly eventId: string;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly event: unknown;
};

export type DisputeApplyOutcome = "INSERTED" | "UPDATED" | "STALE_IGNORED";

export type IngestionResult = {
  readonly duplicate: boolean;
  readonly disputes: readonly {
    readonly providerDisputeId: string;
    readonly providerCaptureId: string;
    readonly guardState: DisputeGuardState;
    readonly outcome: DisputeApplyOutcome;
    readonly matchedOrder: boolean;
  }[];
};

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function lockCaptureOwner(
  sql: TransactionSql,
  providerCaptureId: string,
): Promise<{ orderId: string; merchantId: string; caseId: string | null } | null> {
  const [link] = await sql<{ order_id: string }[]>`select c.order_id from captures c
    where c.provider = 'PAYPAL' and c.provider_capture_id = ${providerCaptureId}
    order by c.id limit 1`;
  if (!link) return null;
  const cases = await sql<{ id: string }[]>`select id from cases where order_id = ${link.order_id}
    order by opened_at, id for update`;
  const [order] = await sql<{ id: string; merchant_id: string }[]>`select id, merchant_id from orders
    where id = ${link.order_id} for update`;
  if (!order) return null;
  return { orderId: order.id, merchantId: order.merchant_id, caseId: cases[0]?.id ?? null };
}

async function applyDisputeObservation(
  sql: TransactionSql,
  eventId: string,
  observation: DisputeObservation,
): Promise<IngestionResult["disputes"][number]> {
  // Lock the rows the refund path locks, in the same order (cases, then order), so ingestion
  // and refund decisions are strictly serialised without deadlocking. See LOCK ORDER in
  // dispute-repository.ts. A capture we have not recorded yet has nothing to lock.
  const owner = await lockCaptureOwner(sql, observation.providerCaptureId);

  const [row] = await sql<{ inserted: boolean }[]>`insert into payment_disputes
      (provider, provider_dispute_id, provider_capture_id, provider_status, outcome_code, reason, lifecycle_stage,
        guard_state, amount_minor, currency, provider_created_at, provider_updated_at, last_event_id)
    values ('PAYPAL', ${observation.providerDisputeId}, ${observation.providerCaptureId}, ${observation.providerStatus},
      ${observation.outcomeCode}, ${observation.reason}, ${observation.lifecycleStage}, ${observation.guardState},
      ${observation.amountMinor}, ${observation.currency}, ${observation.providerCreatedAt}, ${observation.providerUpdatedAt}, ${eventId})
    on conflict (provider, provider_dispute_id, provider_capture_id) do update set
      provider_status = excluded.provider_status,
      outcome_code = excluded.outcome_code,
      reason = coalesce(excluded.reason, payment_disputes.reason),
      lifecycle_stage = coalesce(excluded.lifecycle_stage, payment_disputes.lifecycle_stage),
      guard_state = excluded.guard_state,
      amount_minor = coalesce(excluded.amount_minor, payment_disputes.amount_minor),
      currency = coalesce(excluded.currency, payment_disputes.currency),
      provider_created_at = coalesce(payment_disputes.provider_created_at, excluded.provider_created_at),
      provider_updated_at = excluded.provider_updated_at,
      last_event_id = excluded.last_event_id,
      updated_at = now()
    -- Webhooks can arrive out of order: never let an older snapshot overwrite a newer one.
    where payment_disputes.provider_updated_at <= excluded.provider_updated_at
    returning (xmax = 0) as inserted`;
  const outcome: DisputeApplyOutcome = !row ? "STALE_IGNORED" : row.inserted ? "INSERTED" : "UPDATED";

  if (owner && outcome !== "STALE_IGNORED") {
    const details = {
      eventId,
      providerDisputeId: observation.providerDisputeId,
      guardState: observation.guardState,
      providerStatus: observation.providerStatus,
      outcomeCode: observation.outcomeCode,
      sourceTier: "PROVIDER_VERIFIED",
    };
    await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
      values (${owner.merchantId}, 'webhook:paypal', ${owner.caseId}, 'PAYPAL_DISPUTE_OBSERVED',
        ${hashJson(details)}, ${JSON.stringify(details)}::jsonb)`;
  }

  return Object.freeze({
    providerDisputeId: observation.providerDisputeId,
    providerCaptureId: observation.providerCaptureId,
    guardState: observation.guardState,
    outcome,
    matchedOrder: Boolean(owner),
  });
}

/**
 * Records a signature-verified PayPal webhook and applies it, in one transaction.
 *
 * - Exactly-once: the inbox row is claimed with an upsert that locks it; a redelivery
 *   (or a concurrent duplicate) sees `processed_at` already set and does nothing.
 * - All-or-nothing: if applying fails, the inbox claim rolls back too, the route returns
 *   an error and PayPal retries. A dispute is never half-recorded.
 * - Events other than disputes are recorded and marked processed, as before.
 */
export async function recordVerifiedPayPalEvent(
  databaseUrl: string,
  input: VerifiedPayPalEvent,
): Promise<IngestionResult> {
  const observations = isHandledDisputeEvent(input.eventType) ? parseOrReject(input.event) : [];
  const { client } = createDatabase(databaseUrl);
  try {
    return await client.begin(async (sql) => {
      const [claim] = await sql<{ id: string; processed_at: Date | string | null }[]>`insert into webhook_inbox
          (provider, event_id, verified, payload_hash)
        values ('PAYPAL', ${input.eventId}, true, ${input.payloadHash})
        on conflict (provider, event_id) do update set verified = true
        returning id, processed_at`;
      if (!claim) throw new AppError("WEBHOOK_INBOX_CLAIM_FAILED", 500, true);
      if (claim.processed_at) return { duplicate: true, disputes: [] };

      const disputes = [];
      for (const observation of observations) {
        disputes.push(await applyDisputeObservation(sql, input.eventId, observation));
      }
      await sql`update webhook_inbox set processed_at = now() where id = ${claim.id}`;
      return { duplicate: false, disputes };
    });
  } finally {
    await client.end();
  }
}

function parseOrReject(event: unknown): DisputeObservation[] {
  try {
    return parseDisputeEvent(event);
  } catch (error) {
    if (error instanceof DisputeEventError) throw new AppError(error.code, 422);
    throw error;
  }
}
