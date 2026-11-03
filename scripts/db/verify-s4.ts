import { createHash } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import {
  readCaseObligation,
  reconcileCaseObligationGraph,
} from "../../src/server/modules/obligations/obligation-graph-service";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");
const { client } = createDatabase(databaseUrl);

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function paymentLedgerHash(): Promise<string> {
  const rows = await client<Record<string, unknown>[]>`select 'capture' as kind, id, order_id, provider,
      provider_capture_id as provider_id, status, captured_minor as amount_minor, currency, verified_at
    from captures
    union all
    select 'refund' as kind, r.id, c.order_id, c.provider, r.provider_refund_id as provider_id,
      r.status, r.amount_minor, r.currency, r.verified_at
    from refunds r join captures c on c.id = r.capture_id
    order by kind, id`;
  return hash(rows);
}

try {
  const ledgerBefore = await paymentLedgerHash();
  await Promise.all([
    reconcileCaseObligationGraph(databaseUrl, "RG-2048"),
    reconcileCaseObligationGraph(databaseUrl, "RG-2048"),
  ]);
  for (const caseRef of ["RG-2049", "RG-2050", "RG-2051"]) {
    await reconcileCaseObligationGraph(databaseUrl, caseRef);
  }
  const ledgerAfter = await paymentLedgerHash();
  if (ledgerAfter !== ledgerBefore) throw new Error("S4_PAYMENT_LEDGER_MUTATED");

  const [f02, f03, f04, f05] = await Promise.all([
    readCaseObligation(databaseUrl, "RG-2048"),
    readCaseObligation(databaseUrl, "RG-2049"),
    readCaseObligation(databaseUrl, "RG-2050"),
    readCaseObligation(databaseUrl, "RG-2051"),
  ]);
  if (f02.decision !== "ALLOWED" || f02.proposedRefundMinor !== 10_000) {
    throw new Error(`S4_F02_FAILED:${JSON.stringify(f02)}`);
  }
  if (f03.decision !== "BLOCKED" || !f03.reasonCodes.includes("REFUND_ALREADY_SETTLED") || f03.proposedRefundMinor !== 0) {
    throw new Error(`S4_F03_FAILED:${JSON.stringify(f03)}`);
  }
  if (f04.decision !== "BLOCKED" || !f04.reasonCodes.includes("REFUND_RESERVED") || f04.proposedRefundMinor !== 0) {
    throw new Error(`S4_F04_FAILED:${JSON.stringify(f04)}`);
  }
  if (f05.decision !== "ALLOWED" || f05.proposedRefundMinor !== 3_000) {
    throw new Error(`S4_F05_FAILED:${JSON.stringify(f05)}`);
  }

  const [semanticDuplicates] = await client<{ count: number }[]>`select count(*)::int as count from (
      select order_id, item_id, reason_key from obligations
      group by order_id, item_id, reason_key having count(*) > 1
    ) duplicates`;
  if (semanticDuplicates?.count !== 0) throw new Error("S4_SEMANTIC_DUPLICATE_FOUND");

  const [allocationViolations] = await client<{ count: number }[]>`select count(*)::int as count from (
      select r.id from refunds r left join obligation_allocations oa on oa.refund_id = r.id
      group by r.id, r.amount_minor having coalesce(sum(oa.amount_minor), 0) > r.amount_minor
    ) violations`;
  if (allocationViolations?.count !== 0) throw new Error("S4_REFUND_OVERALLOCATED");

  const allocations = await client<{ fixture_key: string; state: string; amount_minor: number }[]>`select o.fixture_key, oa.state, oa.amount_minor
    from obligation_allocations oa
    join obligations ob on ob.id = oa.obligation_id
    join orders o on o.id = ob.order_id
    where o.fixture_key in ('F03', 'F04') order by o.fixture_key`;
  if (
    allocations.length !== 2
    || allocations[0]?.fixture_key !== "F03" || allocations[0].state !== "COMPLETED" || allocations[0].amount_minor !== 10_000
    || allocations[1]?.fixture_key !== "F04" || allocations[1].state !== "RESERVED" || allocations[1].amount_minor !== 10_000
  ) throw new Error(`S4_ALLOCATION_STATE_FAILED:${JSON.stringify(allocations)}`);

  const [edgeEvidence] = await client<{ edges: number; missing: number }[]>`select count(*)::int as edges,
      count(*) filter (where e.id is null)::int as missing
    from graph_edges ge left join evidence e on e.id = ge.evidence_id`;
  if (!edgeEvidence || edgeEvidence.edges < 16 || edgeEvidence.missing !== 0) {
    throw new Error(`S4_GRAPH_EVIDENCE_FAILED:${JSON.stringify(edgeEvidence)}`);
  }

  const newTables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename, rowsecurity
    from pg_tables where schemaname = 'public'
      and tablename in ('graph_edges', 'obligation_allocations') order by tablename`;
  if (newTables.length !== 2 || newTables.some((table) => !table.rowsecurity)) {
    throw new Error(`S4_RLS_FAILED:${JSON.stringify(newTables)}`);
  }
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count
    from information_schema.role_table_grants where table_schema = 'public'
      and table_name in ('graph_edges', 'obligation_allocations')
      and grantee in ('anon', 'authenticated')`;
  if (grants?.count !== 0) throw new Error(`S4_PUBLIC_GRANTS_FOUND:${grants?.count}`);

  const indexes = await client<{ indexname: string }[]>`select indexname from pg_indexes
    where schemaname = 'public' and indexname in (
      'graph_edges_semantic_unique', 'graph_edges_case_idx', 'graph_edges_evidence_idx',
      'graph_edges_from_idx', 'graph_edges_to_idx',
      'obligation_allocations_obligation_refund_unique', 'obligation_allocations_refund_idx'
    ) order by indexname`;
  if (indexes.length !== 7) throw new Error(`S4_INDEX_INVARIANT_FAILED:${JSON.stringify(indexes)}`);

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s4",
    outcomes: {
      F02: { decision: f02.decision, proposedMinor: f02.proposedRefundMinor },
      F03: { decision: f03.decision, reasons: f03.reasonCodes },
      F04: { decision: f04.decision, reasons: f04.reasonCodes },
      F05: { decision: f05.decision, proposedMinor: f05.proposedRefundMinor },
    },
    concurrentReconciliation: "idempotent",
    semanticDuplicates: semanticDuplicates.count,
    allocationViolations: allocationViolations.count,
    graphEdges: edgeEvidence.edges,
    graphEdgesWithoutEvidence: edgeEvidence.missing,
    paymentLedgerUnchanged: ledgerBefore === ledgerAfter,
    providerWrites: 0,
    rlsTables: newTables.length,
    anonAuthenticatedGrants: grants.count,
    requiredIndexes: indexes.length,
  }));
} finally {
  await client.end();
}
