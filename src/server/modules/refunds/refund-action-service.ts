import { createHash, randomUUID } from "node:crypto";

import type { TransactionSql } from "postgres";

import type { PaymentProvider, PaymentRefund } from "../../adapters/payments/payment-provider";
import { PayPalProviderError } from "../../adapters/payments/paypal-sandbox-provider";
import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { deriveObligation, type ObligationEngineOutput } from "../obligations/obligation-engine";
import {
  actionAllowsProviderPost,
  approvalPhrase,
  assertApprovalConfirmation,
  maskProviderIdentifier,
  providerFailureState,
  type ProposalSnapshot,
  type RefundActionState,
} from "./contracts";

type OperatorContext = { userId: string; merchantId: string };

type FinancialRow = {
  case_id: string;
  case_ref: string;
  order_id: string;
  order_ref: string;
  fixture_id: string | null;
  order_currency: string;
  policy_version_id: string;
  policy_version: string;
  item_id: string;
  fulfillment_status: "DELIVERED" | "RETURNED_TO_SENDER";
  quantity: number;
  unit_minor: number;
  tax_minor: number;
  shipping_minor: number;
  obligation_id: string;
  obligation_reason_key: string;
  obligation_currency: string;
  entitled_minor: number;
  capture_id: string;
  provider_capture_id: string;
  capture_status: string;
  captured_minor: number;
  capture_currency: string;
  capture_verified_at: Date | string | null;
};

type LockedFinancialContext = {
  row: FinancialRow;
  obligation: ObligationEngineOutput;
  evidenceIds: string[];
  evidenceHash: string;
};

export interface RefundActionServiceOptions {
  readonly databaseUrl: string;
  readonly paymentProvider: PaymentProvider;
}

export interface ProposalResult {
  readonly proposalId: string;
  readonly caseRef: string;
  readonly status: "PROPOSED";
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly evidenceHash: string;
  readonly snapshotHash: string;
  readonly confirmation: string;
}

export interface ApprovalResult {
  readonly proposalId: string;
  readonly actionId: string;
  readonly state: "RESERVED";
  readonly requestId: string;
}

export interface ExecutionResult {
  readonly actionId: string;
  readonly state: string;
  readonly providerRefundId: string | null;
  readonly providerWrite: boolean;
  readonly verifiedByGet: boolean;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function iso(value: Date | string | null): string {
  if (!value) throw new AppError("CAPTURE_VERIFICATION_MISSING", 409);
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function assertProviderRefundBinding(refund: PaymentRefund, expectedId: string | null, amountMinor: number): void {
  if (
    (expectedId !== null && refund.providerRefundId !== expectedId)
    || refund.amountMinor !== amountMinor
    || refund.currency !== "USD"
    || refund.synthetic
    || refund.sourceTier !== "PROVIDER_VERIFIED"
  ) throw new AppError("REFUND_READ_BACK_MISMATCH", 502);
}

async function operatorContext(sql: TransactionSql, authSubject: string): Promise<OperatorContext> {
  const [context] = await sql<OperatorContext[]>`select id as "userId", merchant_id as "merchantId"
    from users where auth_subject = ${authSubject} and role in ('operator', 'admin') limit 1`;
  if (!context) throw new AppError("OPERATOR_MERCHANT_SCOPE_MISSING", 403);
  return context;
}

async function lockedFinancialContext(
  sql: TransactionSql,
  caseRef: string,
  merchantId: string,
  excludedActionId: string | null,
  requestedMinor?: number,
): Promise<LockedFinancialContext> {
  const [row] = await sql<FinancialRow[]>`select cs.id as case_id, cs.external_ref as case_ref,
      o.id as order_id, o.external_ref as order_ref, o.fixture_key as fixture_id, o.currency as order_currency,
      o.policy_version_id, pv.version as policy_version,
      oi.id as item_id, oi.fulfillment_status, oi.quantity, oi.unit_minor, oi.tax_minor,
      oi.shipping_allocation_minor as shipping_minor,
      ob.id as obligation_id, ob.reason_key as obligation_reason_key, ob.currency as obligation_currency,
      ob.entitled_minor,
      c.id as capture_id, c.provider_capture_id, c.status as capture_status, c.captured_minor,
      c.currency as capture_currency, c.verified_at as capture_verified_at
    from cases cs
    join orders o on o.id = cs.order_id
    join policy_versions pv on pv.id = o.policy_version_id
    join obligations ob on ob.case_id = cs.id
    join order_items oi on oi.id = ob.item_id
    join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
    where cs.external_ref = ${caseRef} and o.merchant_id = ${merchantId}
    order by ob.id, c.id limit 1
    for update of cs, o, ob, c`;
  if (!row) throw new AppError("PROVIDER_VERIFIED_CASE_NOT_FOUND", 404);
  if (row.capture_status !== "COMPLETED" || !row.capture_verified_at) {
    throw new AppError("CAPTURE_NOT_COMPLETED", 409);
  }
  if (row.order_currency !== "USD" || row.obligation_currency !== "USD" || row.capture_currency !== "USD") {
    throw new AppError("CURRENCY_MISMATCH", 409);
  }

  const evidence = await sql<{ id: string; payload_hash: string }[]>`select id, payload_hash from evidence
    where case_id = ${row.case_id} order by id`;
  if (evidence.length === 0) throw new AppError("CASE_EVIDENCE_NOT_FOUND", 409);
  const evidenceIds = evidence.map((item) => item.id);
  const evidenceHash = hashJson(evidence.map((item) => `${item.id}:${item.payload_hash}`));

  const [balances] = await sql<{
    completed_allocated_minor: number;
    reserved_allocated_minor: number;
    action_reserved_minor: number;
    unallocated_completed_refund_minor: number;
    unallocated_pending_refund_minor: number;
    unknown_actions: number;
  }[]>`select
      coalesce((select sum(oa.amount_minor)::int from obligation_allocations oa
        where oa.obligation_id = ${row.obligation_id} and oa.state = 'COMPLETED'), 0) as completed_allocated_minor,
      coalesce((select sum(oa.amount_minor)::int from obligation_allocations oa
        where oa.obligation_id = ${row.obligation_id} and oa.state = 'RESERVED'), 0) as reserved_allocated_minor,
      coalesce((select sum(p.amount_minor)::int from actions a join proposals p on p.id = a.proposal_id
        where a.obligation_id = ${row.obligation_id}
          and a.state in ('APPROVED', 'RESERVED', 'EXECUTING', 'PENDING', 'UNKNOWN')
          and (${excludedActionId}::uuid is null or a.id <> ${excludedActionId}::uuid)), 0) as action_reserved_minor,
      coalesce((select sum(greatest(0, r.amount_minor - coalesce(x.allocated_minor, 0)))::int
        from refunds r join captures rc on rc.id = r.capture_id
        left join lateral (select sum(oa.amount_minor)::int as allocated_minor from obligation_allocations oa where oa.refund_id = r.id) x on true
        where rc.order_id = ${row.order_id} and r.status = 'COMPLETED'), 0) as unallocated_completed_refund_minor,
      coalesce((select sum(greatest(0, r.amount_minor - coalesce(x.allocated_minor, 0)))::int
        from refunds r join captures rc on rc.id = r.capture_id
        left join lateral (select sum(oa.amount_minor)::int as allocated_minor from obligation_allocations oa where oa.refund_id = r.id) x on true
        where rc.order_id = ${row.order_id} and r.status = 'PENDING'), 0) as unallocated_pending_refund_minor,
      coalesce((select count(*)::int from actions a where a.obligation_id = ${row.obligation_id}
        and a.state = 'UNKNOWN' and (${excludedActionId}::uuid is null or a.id <> ${excludedActionId}::uuid)), 0) as unknown_actions`;
  if (!balances) throw new AppError("REFUND_BALANCE_READ_FAILED", 500);

  const obligation = deriveObligation({
    fixtureId: row.fixture_id ?? row.case_ref,
    orderId: row.order_id,
    itemId: row.item_id,
    obligationKey: `${row.order_id}:${row.item_id}:${row.obligation_reason_key}`,
    policyVersion: row.policy_version,
    currency: row.obligation_currency,
    captureCurrency: row.capture_currency,
    fulfillmentStatus: row.fulfillment_status,
    quantity: row.quantity,
    unitMinor: row.unit_minor,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    completedCaptureMinor: row.captured_minor,
    completedAllocatedMinor: balances.completed_allocated_minor,
    reservedAllocatedMinor: balances.reserved_allocated_minor + balances.action_reserved_minor,
    unallocatedCompletedRefundMinor: balances.unallocated_completed_refund_minor,
    unallocatedPendingRefundMinor: balances.unallocated_pending_refund_minor,
    requestedMinor: requestedMinor ?? row.entitled_minor,
    evidenceIds,
    evidenceHash,
    unknownPaymentOutcome: balances.unknown_actions > 0,
  });
  return { row, obligation, evidenceIds, evidenceHash };
}

function proposalSnapshot(context: LockedFinancialContext): ProposalSnapshot {
  const { row, obligation, evidenceHash, evidenceIds } = context;
  return {
    caseId: row.case_id,
    caseRef: row.case_ref,
    orderId: row.order_id,
    orderRef: row.order_ref,
    obligationId: row.obligation_id,
    obligationKey: obligation.obligationKey,
    captureId: row.capture_id,
    providerCaptureId: row.provider_capture_id,
    amountMinor: obligation.proposedRefundMinor,
    currency: "USD",
    evidenceHash,
    evidenceIds,
    policyVersionId: row.policy_version_id,
    policyVersion: row.policy_version,
    captureVerifiedAt: iso(row.capture_verified_at),
  };
}

export class RefundActionService {
  constructor(private readonly options: RefundActionServiceOptions) {
    if (options.paymentProvider.implementation !== "sandbox") throw new Error("S6_REQUIRES_PAYPAL_SANDBOX");
  }

  async createProposal(authSubject: string, caseRef: string): Promise<ProposalResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      return await client.begin(async (sql) => {
        const actor = await operatorContext(sql, authSubject);
        const context = await lockedFinancialContext(sql, caseRef, actor.merchantId, null);
        if (context.obligation.decision !== "ALLOWED" || context.obligation.proposedRefundMinor <= 0) {
          throw new AppError(context.obligation.reasonCodes[0] ?? "REFUND_NOT_ALLOWED", 409);
        }
        const snapshot = proposalSnapshot(context);
        const snapshotHash = hashJson(snapshot);
        const [inserted] = await sql<{ id: string; status: string }[]>`insert into proposals
          (case_id, obligation_id, kind, amount_minor, currency, evidence_hash, policy_version_id,
            snapshot_hash, snapshot_json, status)
          values (${snapshot.caseId}, ${snapshot.obligationId}, 'PAYPAL_REFUND', ${snapshot.amountMinor}, 'USD',
            ${snapshot.evidenceHash}, ${snapshot.policyVersionId}, ${snapshotHash}, ${JSON.stringify(snapshot)}::jsonb, 'PROPOSED')
          on conflict (snapshot_hash) do update set updated_at = proposals.updated_at
          returning id, status`;
        if (!inserted) throw new AppError("PROPOSAL_CREATE_FAILED", 500);
        if (inserted.status !== "PROPOSED") throw new AppError("PROPOSAL_ALREADY_PROCESSED", 409);
        await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
          values (${actor.merchantId}, ${authSubject}, ${snapshot.caseId}, 'REFUND_PROPOSAL_CREATED', ${snapshotHash},
            ${JSON.stringify({ proposalId: inserted.id, snapshotHash, amountMinor: snapshot.amountMinor, currency: "USD" })}::jsonb)`;
        return {
          proposalId: inserted.id,
          caseRef,
          status: "PROPOSED" as const,
          amountMinor: snapshot.amountMinor,
          currency: "USD" as const,
          evidenceHash: snapshot.evidenceHash,
          snapshotHash,
          confirmation: approvalPhrase(snapshot.amountMinor),
        };
      });
    } finally {
      await client.end();
    }
  }

  async approveProposal(
    authSubject: string,
    proposalId: string,
    input: { snapshotHash: string; confirmation: string },
  ): Promise<ApprovalResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      try {
        const result = await client.begin(async (sql) => {
          const actor = await operatorContext(sql, authSubject);
          const [proposal] = await sql<{
            id: string; case_ref: string; case_id: string; obligation_id: string; amount_minor: number;
            evidence_hash: string; snapshot_hash: string; policy_version_id: string; status: string;
          }[]>`select p.id, cs.external_ref as case_ref, p.case_id, p.obligation_id, p.amount_minor,
              p.evidence_hash, p.snapshot_hash, p.policy_version_id, p.status
            from proposals p join cases cs on cs.id = p.case_id join orders o on o.id = cs.order_id
            where p.id = ${proposalId} and o.merchant_id = ${actor.merchantId}
            for update of p`;
          if (!proposal) throw new AppError("PROPOSAL_NOT_FOUND", 404);
          const [existing] = await sql<{ id: string; request_id: string; state: string }[]>`select id, request_id, state
            from actions where proposal_id = ${proposal.id}`;
          if (existing) {
            if (existing.state !== "RESERVED") throw new AppError("PROPOSAL_ALREADY_PROCESSED", 409);
            return { proposalId: proposal.id, actionId: existing.id, state: "RESERVED" as const, requestId: existing.request_id };
          }
          if (proposal.status !== "PROPOSED") throw new AppError("PROPOSAL_NOT_APPROVABLE", 409);
          if (input.snapshotHash !== proposal.snapshot_hash) throw new AppError("APPROVAL_STALE", 409);
          try {
            assertApprovalConfirmation(input.confirmation, proposal.amount_minor);
          } catch {
            throw new AppError("APPROVAL_CONFIRMATION_MISMATCH", 400);
          }

          const context = await lockedFinancialContext(sql, proposal.case_ref, actor.merchantId, null, proposal.amount_minor);
          const stale = context.evidenceHash !== proposal.evidence_hash
            || context.row.policy_version_id !== proposal.policy_version_id
            || context.obligation.proposedRefundMinor !== proposal.amount_minor
            || context.obligation.decision !== "ALLOWED";
          if (stale) {
            await sql`update proposals set status = 'BLOCKED', updated_at = now() where id = ${proposal.id}`;
            await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
              values (${actor.merchantId}, ${authSubject}, ${proposal.case_id}, 'REFUND_APPROVAL_BLOCKED',
                ${hashJson({ proposalId, code: "APPROVAL_STALE" })},
                ${JSON.stringify({ proposalId, code: "APPROVAL_STALE" })}::jsonb)`;
            return { blockedCode: "APPROVAL_STALE" as const };
          }

          const actionId = randomUUID();
          const requestId = randomUUID();
          await sql`insert into actions
            (id, proposal_id, obligation_id, approved_by, approved_at, request_id, state)
            values (${actionId}, ${proposal.id}, ${proposal.obligation_id}, ${actor.userId}, now(), ${requestId}, 'RESERVED')`;
          await sql`update proposals set status = 'APPROVED', approved_by = ${actor.userId}, approved_at = now(), updated_at = now()
            where id = ${proposal.id}`;
          await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
            values (${actor.merchantId}, ${authSubject}, ${proposal.case_id}, ${actionId}, 'REFUND_APPROVED_AND_RESERVED',
              ${hashJson({ actionId, proposalId, requestId, amountMinor: proposal.amount_minor })},
              ${JSON.stringify({ actionId, proposalId, requestId, amountMinor: proposal.amount_minor, currency: "USD" })}::jsonb)`;
          return { proposalId: proposal.id, actionId, state: "RESERVED" as const, requestId };
        });
        if ("blockedCode" in result) throw new AppError(result.blockedCode, 409);
        return result;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError("REFUND_RESERVED", 409);
        throw error;
      }
    } finally {
      await client.end();
    }
  }

  async executeAction(authSubject: string, actionId: string): Promise<ExecutionResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      const [preview] = await client<{
        case_ref: string; merchant_id: string; request_id: string; state: string; amount_minor: number;
        provider_capture_id: string; captured_minor: number; capture_currency: "USD";
      }[]>`select cs.external_ref as case_ref, o.merchant_id, a.request_id, a.state, p.amount_minor,
          c.provider_capture_id, c.captured_minor, c.currency as capture_currency
        from actions a join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
        join orders o on o.id = cs.order_id join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
        join users u on u.auth_subject = ${authSubject} and u.merchant_id = o.merchant_id and u.role in ('operator', 'admin')
        where a.id = ${actionId} order by c.id limit 1`;
      if (!preview) throw new AppError("ACTION_NOT_FOUND", 404);
      if (preview.state === "VERIFIED_CLOSED" || preview.state === "COMPLETED") {
        const [done] = await client<{ provider_resource_id: string | null }[]>`select provider_resource_id from actions where id = ${actionId}`;
        return { actionId, state: preview.state, providerRefundId: done?.provider_resource_id ?? null, providerWrite: false, verifiedByGet: true };
      }
      if (preview.state === "UNKNOWN" || preview.state === "PENDING" || preview.state === "EXECUTING") {
        throw new AppError("REFUND_RECONCILIATION_REQUIRED", 409);
      }
      if (!actionAllowsProviderPost(preview.state as RefundActionState)) throw new AppError("ACTION_NOT_EXECUTABLE", 409);

      const providerCapture = await this.options.paymentProvider.getCapture(preview.provider_capture_id);
      if (!providerCapture || providerCapture.status !== "COMPLETED" || providerCapture.synthetic
        || providerCapture.sourceTier !== "PROVIDER_VERIFIED" || providerCapture.currency !== "USD"
        || providerCapture.amountMinor !== preview.captured_minor) {
        throw new AppError("CAPTURE_READ_BACK_MISMATCH", 409);
      }

      const claim = await client.begin(async (sql) => {
        const actor = await operatorContext(sql, authSubject);
        const [action] = await sql<{
          id: string; proposal_id: string; state: string; case_id: string; case_ref: string;
          amount_minor: number; evidence_hash: string; policy_version_id: string; request_id: string;
        }[]>`select a.id, a.proposal_id, a.state, p.case_id, cs.external_ref as case_ref,
            p.amount_minor, p.evidence_hash, p.policy_version_id, a.request_id
          from actions a join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
          join orders o on o.id = cs.order_id
          where a.id = ${actionId} and o.merchant_id = ${actor.merchantId}
          for update of a`;
        if (!action) throw new AppError("ACTION_NOT_FOUND", 404);
        if (action.state !== "RESERVED") throw new AppError("ACTION_NOT_EXECUTABLE", 409);
        const context = await lockedFinancialContext(sql, action.case_ref, actor.merchantId, action.id, action.amount_minor);
        const stale = context.evidenceHash !== action.evidence_hash
          || context.row.policy_version_id !== action.policy_version_id
          || context.obligation.decision !== "ALLOWED"
          || context.obligation.proposedRefundMinor !== action.amount_minor;
        if (stale) {
          await sql`update actions set state = 'BLOCKED', failure_code = 'APPROVAL_STALE', updated_at = now() where id = ${action.id}`;
          await sql`update proposals set status = 'BLOCKED', updated_at = now() where id = ${action.proposal_id}`;
          await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
            values (${actor.merchantId}, ${authSubject}, ${action.case_id}, ${action.id}, 'REFUND_EXECUTION_BLOCKED',
              ${hashJson({ actionId, code: "APPROVAL_STALE" })}, ${JSON.stringify({ actionId, code: "APPROVAL_STALE" })}::jsonb)`;
          return { blockedCode: "APPROVAL_STALE" as const };
        }
        await sql`update actions set state = 'EXECUTING', executed_at = now(), updated_at = now() where id = ${action.id}`;
        await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
          values (${actor.merchantId}, ${authSubject}, ${action.case_id}, ${action.id}, 'PAYPAL_REFUND_EXECUTING',
            ${hashJson({ actionId, requestId: action.request_id })},
            ${JSON.stringify({ actionId, requestId: action.request_id, provider: "PAYPAL_SANDBOX" })}::jsonb)`;
        return { blockedCode: null, requestId: action.request_id, amountMinor: action.amount_minor, caseId: action.case_id };
      });
      if (claim.blockedCode) throw new AppError(claim.blockedCode, 409);

      let initial: PaymentRefund;
      try {
        initial = await this.options.paymentProvider.refundCapture({
          requestId: claim.requestId,
          providerCaptureId: preview.provider_capture_id,
          amountMinor: claim.amountMinor,
          currency: "USD",
          customId: actionId,
        });
        assertProviderRefundBinding(initial, null, claim.amountMinor);
        await client`update actions set provider_resource_id = ${initial.providerRefundId},
          provider_response_hash = ${hashJson(initial)}, updated_at = now() where id = ${actionId}`;
      } catch (error) {
        const retryable = !(error instanceof PayPalProviderError) || error.retryable;
        const failureState = providerFailureState(retryable);
        await this.recordProviderFailure(client, authSubject, actionId, failureState, error);
        if (failureState === "FAILED") throw error;
        return { actionId, state: "UNKNOWN", providerRefundId: null, providerWrite: true, verifiedByGet: false };
      }

      let verified: PaymentRefund | null;
      try {
        verified = await this.options.paymentProvider.getRefund(initial.providerRefundId);
      } catch (error) {
        await this.recordProviderFailure(client, authSubject, actionId, "UNKNOWN", error);
        return { actionId, state: "UNKNOWN", providerRefundId: initial.providerRefundId, providerWrite: true, verifiedByGet: false };
      }
      if (!verified) {
        await this.recordProviderFailure(client, authSubject, actionId, "UNKNOWN", new Error("REFUND_READ_BACK_MISSING"));
        return { actionId, state: "UNKNOWN", providerRefundId: initial.providerRefundId, providerWrite: true, verifiedByGet: false };
      }
      assertProviderRefundBinding(verified, initial.providerRefundId, claim.amountMinor);
      return await this.persistReadBack(client, authSubject, actionId, verified, true);
    } finally {
      await client.end();
    }
  }

  async reconcileAction(authSubject: string, actionId: string): Promise<ExecutionResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      const [action] = await client<{
        provider_resource_id: string | null; state: string; amount_minor: number;
      }[]>`select a.provider_resource_id, a.state, p.amount_minor from actions a
        join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
        join orders o on o.id = cs.order_id join users u on u.auth_subject = ${authSubject}
          and u.merchant_id = o.merchant_id and u.role in ('operator', 'admin')
        where a.id = ${actionId}`;
      if (!action) throw new AppError("ACTION_NOT_FOUND", 404);
      if (action.state === "VERIFIED_CLOSED" || action.state === "COMPLETED") {
        return { actionId, state: action.state, providerRefundId: action.provider_resource_id, providerWrite: false, verifiedByGet: true };
      }
      if (action.state !== "UNKNOWN" && action.state !== "PENDING" && action.state !== "EXECUTING") {
        throw new AppError("ACTION_NOT_RECONCILABLE", 409);
      }
      if (!action.provider_resource_id) throw new AppError("UNKNOWN_PROVIDER_RESOURCE_MISSING", 409);
      const verified = await this.options.paymentProvider.getRefund(action.provider_resource_id);
      if (!verified) throw new AppError("REFUND_READ_BACK_MISSING", 502, true);
      assertProviderRefundBinding(verified, action.provider_resource_id, action.amount_minor);
      return await this.persistReadBack(client, authSubject, actionId, verified, false);
    } finally {
      await client.end();
    }
  }

  async getCertificate(caseRef: string): Promise<Record<string, unknown>> {
    const { client } = createDatabase(this.options.databaseUrl);
    try {
      const [certificate] = await client<{ certificate_hash: string; payload_json: Record<string, unknown>; created_at: Date | string }[]>`
        select cert.certificate_hash, cert.payload_json, cert.created_at from certificates cert
        join cases cs on cs.id = cert.case_id where cs.external_ref = ${caseRef}
        order by cert.created_at desc limit 1`;
      if (!certificate) throw new AppError("CERTIFICATE_NOT_FOUND", 404);
      const payload = certificate.payload_json;
      return {
        ...payload,
        captureId: typeof payload.captureId === "string" ? maskProviderIdentifier(payload.captureId) : null,
        refundId: typeof payload.refundId === "string" ? maskProviderIdentifier(payload.refundId) : null,
        certificateHash: certificate.certificate_hash,
        issuedAt: iso(certificate.created_at),
        disclaimer: "Sandbox audit certificate; not a legally binding certificate.",
      };
    } finally {
      await client.end();
    }
  }

  private async recordProviderFailure(
    client: ReturnType<typeof createDatabase>["client"],
    authSubject: string,
    actionId: string,
    state: "FAILED" | "UNKNOWN",
    error: unknown,
  ): Promise<void> {
    const code = error instanceof PayPalProviderError ? error.message
      : error instanceof AppError ? error.code
        : error instanceof Error ? error.name : "UNKNOWN_PROVIDER_ERROR";
    await client.begin(async (sql) => {
      const actor = await operatorContext(sql, authSubject);
      const [action] = await sql<{ case_id: string }[]>`select p.case_id from actions a join proposals p on p.id = a.proposal_id
        where a.id = ${actionId} for update of a`;
      if (!action) throw new AppError("ACTION_NOT_FOUND", 404);
      await sql`update actions set state = ${state}, failure_code = ${code}, updated_at = now() where id = ${actionId}`;
      await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
        values (${actor.merchantId}, ${authSubject}, ${action.case_id}, ${actionId}, ${state === "UNKNOWN" ? "PAYPAL_REFUND_UNKNOWN" : "PAYPAL_REFUND_FAILED"},
          ${hashJson({ actionId, state, code })}, ${JSON.stringify({ actionId, state, code })}::jsonb)`;
    });
  }

  private async persistReadBack(
    client: ReturnType<typeof createDatabase>["client"],
    authSubject: string,
    actionId: string,
    refund: PaymentRefund,
    providerWrite: boolean,
  ): Promise<ExecutionResult> {
    return client.begin(async (sql) => {
      const actor = await operatorContext(sql, authSubject);
      const [action] = await sql<{
        proposal_id: string; obligation_id: string; case_id: string; case_ref: string; order_ref: string;
        amount_minor: number; evidence_hash: string; policy_version: string; capture_id: string;
        provider_capture_id: string; captured_minor: number; approved_at: Date | string; approved_by: string;
      }[]>`select a.proposal_id, a.obligation_id, p.case_id, cs.external_ref as case_ref, o.external_ref as order_ref,
          p.amount_minor, p.evidence_hash, pv.version as policy_version, c.id as capture_id,
          c.provider_capture_id, c.captured_minor, a.approved_at, a.approved_by
        from actions a join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
        join orders o on o.id = cs.order_id join policy_versions pv on pv.id = p.policy_version_id
        join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
        where a.id = ${actionId} order by c.id limit 1 for update of a`;
      if (!action) throw new AppError("ACTION_NOT_FOUND", 404);
      assertProviderRefundBinding(refund, refund.providerRefundId, action.amount_minor);

      const normalizedStatus = refund.status === "COMPLETED" ? "COMPLETED"
        : refund.status === "PENDING" || refund.status === "UNKNOWN" ? refund.status
          : refund.status === "CANCELLED" ? "CANCELLED" : "FAILED";
      const [storedRefund] = await sql<{ id: string }[]>`insert into refunds
        (capture_id, provider_refund_id, status, amount_minor, currency, verified_at)
        values (${action.capture_id}, ${refund.providerRefundId}, ${normalizedStatus}, ${refund.amountMinor}, 'USD',
          case when ${refund.status === "COMPLETED"} then now() else null end)
        on conflict (provider_refund_id) do update set status = excluded.status,
          amount_minor = excluded.amount_minor, currency = excluded.currency, verified_at = excluded.verified_at
        returning id`;
      if (!storedRefund) throw new AppError("REFUND_PERSIST_FAILED", 500);

      if (refund.status === "COMPLETED") {
        await sql`insert into obligation_allocations (obligation_id, refund_id, amount_minor, state)
          values (${action.obligation_id}, ${storedRefund.id}, ${refund.amountMinor}, 'COMPLETED')
          on conflict (obligation_id, refund_id) do update set amount_minor = excluded.amount_minor, state = 'COMPLETED'`;
        await sql`update obligations set status = 'SATISFIED' where id = ${action.obligation_id}`;
        await sql`update cases set status = 'VERIFIED_CLOSED', closed_at = now(), updated_at = now() where id = ${action.case_id}`;
        await sql`update actions set state = 'VERIFIED_CLOSED', provider_resource_id = ${refund.providerRefundId},
          provider_response_hash = ${hashJson(refund)}, failure_code = null, verified_at = now(), updated_at = now()
          where id = ${actionId}`;
        const sourceRows = await sql<{ source_tier: string }[]>`select distinct source_tier from evidence where case_id = ${action.case_id} order by source_tier`;
        const certificatePayload = {
          caseRef: action.case_ref,
          orderRef: action.order_ref,
          policyVersion: action.policy_version,
          evidenceHash: action.evidence_hash,
          provenance: sourceRows.map((row) => row.source_tier),
          captureId: action.provider_capture_id,
          captureAmountMinor: action.captured_minor,
          captureStatus: "COMPLETED",
          refundId: refund.providerRefundId,
          refundAmountMinor: refund.amountMinor,
          refundStatus: "COMPLETED",
          approvedBy: action.approved_by,
          approvedAt: iso(action.approved_at),
          obligationBalanceMinor: 0,
          unresolvedConditions: ["Carrier recovery is not verified."],
          provider: "PAYPAL_SANDBOX",
        };
        const certificateHash = hashJson(certificatePayload);
        await sql`insert into certificates (case_id, action_id, certificate_hash, payload_json)
          values (${action.case_id}, ${actionId}, ${certificateHash}, ${JSON.stringify(certificatePayload)}::jsonb)
          on conflict (action_id) do update set certificate_hash = excluded.certificate_hash, payload_json = excluded.payload_json`;
        await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
          values (${actor.merchantId}, ${authSubject}, ${action.case_id}, ${actionId}, 'PAYPAL_REFUND_VERIFIED_CLOSED',
            ${hashJson({ actionId, refundId: refund.providerRefundId, certificateHash })},
            ${JSON.stringify({ actionId, refundId: refund.providerRefundId, status: "COMPLETED", certificateHash, sourceTier: "PROVIDER_VERIFIED" })}::jsonb)`;
        return { actionId, state: "VERIFIED_CLOSED", providerRefundId: refund.providerRefundId, providerWrite, verifiedByGet: true };
      }

      const state = refund.status === "PENDING" ? "PENDING"
        : refund.status === "UNKNOWN" ? "UNKNOWN"
          : refund.status === "CANCELLED" ? "CANCELLED" : "FAILED";
      await sql`update actions set state = ${state}, provider_resource_id = ${refund.providerRefundId},
        provider_response_hash = ${hashJson(refund)}, failure_code = ${state === "FAILED" || state === "CANCELLED" ? `PAYPAL_REFUND_${state}` : null},
        verified_at = now(), updated_at = now() where id = ${actionId}`;
      await sql`insert into audit_events (merchant_id, actor, case_id, action_id, event_type, details_hash, details)
        values (${actor.merchantId}, ${authSubject}, ${action.case_id}, ${actionId}, ${`PAYPAL_REFUND_${state}`},
          ${hashJson({ actionId, refundId: refund.providerRefundId, state })},
          ${JSON.stringify({ actionId, refundId: refund.providerRefundId, state, sourceTier: "PROVIDER_VERIFIED" })}::jsonb)`;
      return { actionId, state, providerRefundId: refund.providerRefundId, providerWrite, verifiedByGet: true };
    });
  }
}

export { assertProviderRefundBinding, hashJson };
