import { createHash, randomUUID } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

class VerificationRollback extends Error {}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

try {
  const [proof] = await client<{
    case_id: string; case_status: string; obligation_id: string; obligation_status: string;
    entitled_minor: number; action_id: string; action_state: string; request_id: string;
    provider_resource_id: string; refund_id: string; refund_status: string; refund_minor: number;
    allocation_minor: number; allocation_state: string; certificate_hash: string;
    capture_minor: number; capture_status: string;
  }[]>`select cs.id as case_id, cs.status as case_status, ob.id as obligation_id, ob.status as obligation_status,
      ob.entitled_minor, a.id as action_id, a.state as action_state, a.request_id, a.provider_resource_id,
      r.id as refund_id, r.status as refund_status, r.amount_minor as refund_minor,
      oa.amount_minor as allocation_minor, oa.state as allocation_state, cert.certificate_hash,
      c.captured_minor as capture_minor, c.status as capture_status
    from cases cs join obligations ob on ob.case_id = cs.id
    join proposals p on p.case_id = cs.id and p.obligation_id = ob.id and p.status = 'APPROVED'
    join actions a on a.proposal_id = p.id
    join captures c on c.order_id = cs.order_id and c.provider = 'PAYPAL'
    join refunds r on r.capture_id = c.id and r.provider_refund_id = a.provider_resource_id
    join obligation_allocations oa on oa.obligation_id = ob.id and oa.refund_id = r.id
    join certificates cert on cert.action_id = a.id
    where cs.external_ref = 'RG-2052'
    order by a.created_at desc limit 1`;
  if (!proof) throw new Error("S6_VERIFIED_REFUND_PROOF_MISSING");
  if (
    proof.case_status !== "VERIFIED_CLOSED" || proof.obligation_status !== "SATISFIED"
    || proof.entitled_minor !== 10_000 || proof.action_state !== "VERIFIED_CLOSED"
    || proof.refund_status !== "COMPLETED" || proof.refund_minor !== 10_000
    || proof.allocation_minor !== 10_000 || proof.allocation_state !== "COMPLETED"
    || proof.capture_minor !== 25_000 || proof.capture_status !== "COMPLETED"
    || proof.certificate_hash.length !== 64
  ) throw new Error(`S6_FINANCIAL_INVARIANT_FAILED:${JSON.stringify(proof)}`);

  const [counts] = await client<{
    actions: number; requests: number; refunds: number; allocations: number; certificates: number;
    stale_blocks: number; verified_audits: number;
  }[]>`select
      (select count(*)::int from actions where obligation_id = ${proof.obligation_id}) as actions,
      (select count(distinct request_id)::int from actions where obligation_id = ${proof.obligation_id}) as requests,
      (select count(*)::int from refunds where id = ${proof.refund_id}) as refunds,
      (select count(*)::int from obligation_allocations where obligation_id = ${proof.obligation_id} and state = 'COMPLETED') as allocations,
      (select count(*)::int from certificates where action_id = ${proof.action_id}) as certificates,
      (select count(*)::int from audit_events where case_id = ${proof.case_id} and event_type = 'REFUND_APPROVAL_BLOCKED') as stale_blocks,
      (select count(*)::int from audit_events where action_id = ${proof.action_id} and event_type = 'PAYPAL_REFUND_VERIFIED_CLOSED') as verified_audits`;
  if (!counts || counts.actions !== 1 || counts.requests !== 1 || counts.refunds !== 1 || counts.allocations !== 1
    || counts.certificates !== 1 || counts.stale_blocks < 1 || counts.verified_audits !== 1) {
    throw new Error(`S6_DURABILITY_INVARIANT_FAILED:${JSON.stringify(counts)}`);
  }

  const [unjustified] = await client<{ count: number }[]>`select count(*)::int as count from proposals
    where obligation_id = ${proof.obligation_id} and status = 'PROPOSED'`;
  if (unjustified?.count !== 0) throw new Error(`S6_SECOND_PROPOSAL_NOT_BLOCKED:${unjustified?.count}`);

  let competingApprovalBlocked = false;
  let unknownReservationPreserved = false;
  try {
    await client.begin(async (sql) => {
      const [user] = await sql<{ id: string }[]>`select id from users where role in ('operator', 'admin') order by id limit 1`;
      const [caseRow] = await sql<{ policy_version_id: string }[]>`select o.policy_version_id from cases cs join orders o on o.id = cs.order_id
        where cs.id = ${proof.case_id}`;
      if (!user || !caseRow) throw new Error("S6_CONCURRENCY_FIXTURE_MISSING");
      const proposalIds = [randomUUID(), randomUUID()];
      for (const [index, proposalId] of proposalIds.entries()) {
        await sql`insert into proposals
          (id, case_id, obligation_id, kind, amount_minor, currency, evidence_hash, policy_version_id,
            snapshot_hash, snapshot_json, status)
          values (${proposalId}, ${proof.case_id}, ${proof.obligation_id}, 'PAYPAL_REFUND', 10000, 'USD',
            ${hash(`evidence-${proposalId}`)}, ${caseRow.policy_version_id}, ${hash(`snapshot-${proposalId}`)},
            ${JSON.stringify({ verification: true, index })}::jsonb, 'APPROVED')`;
      }
      const requestId = randomUUID();
      await sql`insert into actions
        (proposal_id, obligation_id, approved_by, approved_at, request_id, state)
        values (${proposalIds[0]!}, ${proof.obligation_id}, ${user.id}, now(), ${requestId}, 'UNKNOWN')`;
      const second = await sql<{ id: string }[]>`insert into actions
        (proposal_id, obligation_id, approved_by, approved_at, request_id, state)
        values (${proposalIds[1]!}, ${proof.obligation_id}, ${user.id}, now(), ${randomUUID()}, 'RESERVED')
        on conflict do nothing returning id`;
      competingApprovalBlocked = second.length === 0;
      const [unknown] = await sql<{ request_id: string; state: string }[]>`select request_id, state from actions
        where proposal_id = ${proposalIds[0]!}`;
      unknownReservationPreserved = unknown?.state === "UNKNOWN" && unknown.request_id === requestId;
      throw new VerificationRollback();
    });
  } catch (error) {
    if (!(error instanceof VerificationRollback)) throw error;
  }
  if (!competingApprovalBlocked || !unknownReservationPreserved) {
    throw new Error(`S6_CONCURRENCY_GUARD_FAILED:${JSON.stringify({ competingApprovalBlocked, unknownReservationPreserved })}`);
  }

  const tables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename, rowsecurity from pg_tables
    where schemaname = 'public' and tablename in ('actions', 'proposals', 'certificates') order by tablename`;
  if (tables.length !== 3 || tables.some((table) => !table.rowsecurity)) throw new Error(`S6_RLS_FAILED:${JSON.stringify(tables)}`);
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('actions', 'proposals', 'certificates')
      and grantee in ('anon', 'authenticated')`;
  if (grants?.count !== 0) throw new Error(`S6_PUBLIC_GRANTS_FAILED:${grants?.count}`);
  const indexes = await client<{ indexname: string }[]>`select indexname from pg_indexes where schemaname = 'public'
    and indexname in ('actions_request_unique', 'actions_active_obligation_unique', 'actions_provider_resource_unique',
      'proposals_snapshot_unique', 'certificates_action_unique') order by indexname`;
  if (indexes.length !== 5) throw new Error(`S6_REQUIRED_INDEXES_MISSING:${JSON.stringify(indexes)}`);

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s6",
    caseRef: "RG-2052",
    captureMinor: proof.capture_minor,
    refundMinor: proof.refund_minor,
    remainingCaptureMinor: proof.capture_minor - proof.refund_minor,
    actionState: proof.action_state,
    providerReadBackVerified: true,
    stableRequestIds: counts.requests,
    semanticRefunds: counts.refunds,
    staleApprovalBlocks: counts.stale_blocks,
    competingApprovalBlocked,
    unknownReservationPreserved,
    certificateDurable: counts.certificates === 1,
    rlsTables: tables.length,
    anonAuthenticatedGrants: grants.count,
    requiredIndexes: indexes.length,
  }));
} finally {
  await client.end();
}
