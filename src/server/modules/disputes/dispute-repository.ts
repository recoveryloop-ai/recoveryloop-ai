import type { TransactionSql } from "postgres";

import { aggregateOrderDisputeState, type DisputeGuardState, type OrderDisputeState } from "./contracts";

export type OrderDisputeSnapshot = {
  readonly state: OrderDisputeState;
  /** Provider dispute IDs that currently block refunds on the order (OPEN or BUYER_PAID). */
  readonly blockingDisputeIds: readonly string[];
};

/**
 * LOCK ORDER (must match everywhere money decisions are made):
 *   1. cases of the order   2. the order   3. obligations / captures
 * The refund path (`lockedFinancialContext`) and the obligation graph lock in this order;
 * dispute ingestion locks cases then the order. Taking them in a different order
 * deadlocks under concurrency (covered by tests/integration/dispute-guard.db.test.ts).
 */

/**
 * Reads the dispute guard state for every PayPal capture on an order.
 *
 * Callers on the money path must hold the order row lock (`for update of o`) in the same
 * transaction (it takes a TransactionSql for that reason). Dispute ingestion takes the same lock before writing, so the two are
 * serialised: a refund decision always sees every dispute committed before it.
 */
export async function readOrderDisputeState(sql: TransactionSql, orderId: string): Promise<OrderDisputeSnapshot> {
  const rows = await sql<{ provider_dispute_id: string; guard_state: DisputeGuardState }[]>`
    select d.provider_dispute_id, d.guard_state
    from captures c
    join payment_disputes d on d.provider = 'PAYPAL' and d.provider_capture_id = c.provider_capture_id
    where c.order_id = ${orderId} and c.provider = 'PAYPAL'
    order by d.provider_dispute_id`;
  const blocking = rows.filter((row) => row.guard_state === "OPEN" || row.guard_state === "BUYER_PAID");
  return Object.freeze({
    state: aggregateOrderDisputeState(rows.map((row) => row.guard_state)),
    blockingDisputeIds: Object.freeze([...new Set(blocking.map((row) => row.provider_dispute_id))]),
  });
}

/** Postgres raises this from the `actions_dispute_guard` trigger (migration 0009). */
export function isDisputeGuardViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && "message" in error && (error as { message?: unknown }).message === "DISPUTE_GUARD_BLOCKED";
}
