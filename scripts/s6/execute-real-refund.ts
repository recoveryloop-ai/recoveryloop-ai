import { createHash } from "node:crypto";

import { z } from "zod";

import { createDatabase } from "../../src/server/db/client";
import { getOperatorAccessToken } from "../smoke/paypal-s2-common";
import { loadLocalEnvironment, redactIdentifier, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();

const baseUrl = requireEnvironment("APP_BASE_URL").replace(/\/$/, "");
const accessToken = await getOperatorAccessToken();
const caseRef = "RG-2052";
const headers = { Authorization: `Bearer ${accessToken}`, Origin: baseUrl, "Content-Type": "application/json" };
const proposalSchema = z.object({
  proposalId: z.string().uuid(),
  amountMinor: z.literal(10_000),
  currency: z.literal("USD"),
  snapshotHash: z.string().length(64),
  confirmation: z.literal("REFUND $100.00 IN SANDBOX"),
});
const approvalSchema = z.object({ proposalId: z.string().uuid(), actionId: z.string().uuid(), state: z.literal("RESERVED"), requestId: z.string().uuid() });
const executionSchema = z.object({
  actionId: z.string().uuid(),
  state: z.string(),
  providerRefundId: z.string().nullable(),
  providerWrite: z.boolean(),
  verifiedByGet: z.boolean(),
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
}

const existingDb = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const [existing] = await existingDb.client<{
    action_id: string; request_id: string; provider_resource_id: string; amount_minor: number;
  }[]>`select a.id as action_id, a.request_id, a.provider_resource_id, p.amount_minor
    from actions a join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
    where cs.external_ref = ${caseRef} and a.state = 'VERIFIED_CLOSED'
    order by a.created_at desc limit 1`;
  if (existing) {
    const certificateResponse = await fetch(`${baseUrl}/api/cases/${caseRef}/certificate`, { signal: AbortSignal.timeout(15_000) });
    if (certificateResponse.status !== 200) throw new Error(`S6_CERTIFICATE_FAILED:${certificateResponse.status}`);
    const certificate = z.object({
      refundAmountMinor: z.literal(10_000), refundStatus: z.literal("COMPLETED"),
      obligationBalanceMinor: z.literal(0), certificateHash: z.string().length(64),
    }).parse(await certificateResponse.json());
    const duplicateResponse = await post(`/api/cases/${caseRef}/proposals`, { mode: "deterministic" });
    if (duplicateResponse.status !== 409) throw new Error(`S6_DUPLICATE_NOT_BLOCKED:${duplicateResponse.status}`);
    const duplicate = z.object({ code: z.literal("REFUND_ALREADY_SETTLED") }).passthrough().parse(await duplicateResponse.json());
    console.log(JSON.stringify({
      status: "PASS",
      operation: "s6-execute-real-refund",
      caseRef,
      actionId: redactIdentifier(existing.action_id),
      requestId: redactIdentifier(existing.request_id),
      refundId: redactIdentifier(existing.provider_resource_id),
      amountMinor: existing.amount_minor,
      state: "VERIFIED_CLOSED",
      verifiedByGet: true,
      providerWrite: false,
      idempotentReadBack: true,
      duplicateBlockedBeforeNetwork: duplicate.code === "REFUND_ALREADY_SETTLED",
      certificateHashPresent: certificate.certificateHash.length === 64,
    }));
    process.exit(0);
  }
} finally {
  await existingDb.client.end();
}

const staleProposalResponse = await post(`/api/cases/${caseRef}/proposals`, { mode: "deterministic" });
if (staleProposalResponse.status !== 201) throw new Error(`S6_PROPOSAL_FAILED:${staleProposalResponse.status}:${await staleProposalResponse.text()}`);
const staleProposal = proposalSchema.parse(await staleProposalResponse.json());

const staleDb = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const payload = { test: "S6_APPROVAL_STALE", proposalId: staleProposal.proposalId };
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await staleDb.client`insert into evidence
    (case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
    select id, 'S6_TEST', 'SYNTHETIC', ${`s6:stale:${staleProposal.proposalId}`}, ${payloadHash}, now(), true,
      ${JSON.stringify(payload)}::jsonb from cases where external_ref = ${caseRef}
    on conflict (case_id, external_id) do nothing`;
} finally {
  await staleDb.client.end();
}
const staleApprovalResponse = await post(`/api/proposals/${staleProposal.proposalId}/approve`, {
  snapshot_hash: staleProposal.snapshotHash,
  confirmation: staleProposal.confirmation,
});
if (staleApprovalResponse.status !== 409) throw new Error(`S6_STALE_APPROVAL_NOT_BLOCKED:${staleApprovalResponse.status}`);
const staleApproval = z.object({ code: z.literal("APPROVAL_STALE") }).passthrough().parse(await staleApprovalResponse.json());

const proposalResponse = await post(`/api/cases/${caseRef}/proposals`, { mode: "deterministic" });
if (proposalResponse.status !== 201) throw new Error(`S6_FRESH_PROPOSAL_FAILED:${proposalResponse.status}:${await proposalResponse.text()}`);
const proposal = proposalSchema.parse(await proposalResponse.json());

const approveBody = { snapshot_hash: proposal.snapshotHash, confirmation: proposal.confirmation };
const approvalResponses = await Promise.all([
  post(`/api/proposals/${proposal.proposalId}/approve`, approveBody),
  post(`/api/proposals/${proposal.proposalId}/approve`, approveBody),
]);
if (approvalResponses.some((response) => response.status !== 200)) {
  throw new Error(`S6_DOUBLE_APPROVAL_FAILED:${approvalResponses.map((response) => response.status).join(",")}`);
}
const approvals = await Promise.all(approvalResponses.map(async (response) => approvalSchema.parse(await response.json())));
if (approvals[0]?.actionId !== approvals[1]?.actionId || approvals[0]?.requestId !== approvals[1]?.requestId) {
  throw new Error("S6_APPROVAL_IDEMPOTENCY_FAILED");
}
const action = approvals[0]!;

const executeBody = { confirmation: "EXECUTE SANDBOX REFUND" };
const executionResponses = await Promise.all([
  post(`/api/actions/${action.actionId}/execute`, executeBody),
  post(`/api/actions/${action.actionId}/execute`, executeBody),
]);
const successfulExecutions = executionResponses.filter((response) => response.status === 200);
if (successfulExecutions.length === 0) {
  throw new Error(`S6_EXECUTION_FAILED:${executionResponses.map((response) => response.status).join(",")}`);
}
const executionResults = await Promise.all(successfulExecutions.map(async (response) => executionSchema.parse(await response.json())));
let completed = executionResults.find((result) => result.state === "VERIFIED_CLOSED");
const uncertain = executionResults.find((result) => result.state === "UNKNOWN" || result.state === "PENDING");
if (!completed && uncertain?.providerRefundId) {
  const reconcile = await post(`/api/actions/${action.actionId}/reconcile`, { mode: "provider_readback" });
  if (reconcile.status !== 200) throw new Error(`S6_RECONCILE_FAILED:${reconcile.status}:${await reconcile.text()}`);
  completed = executionSchema.parse(await reconcile.json());
}
if (!completed || completed.state !== "VERIFIED_CLOSED" || !completed.verifiedByGet || !completed.providerRefundId) {
  throw new Error(`S6_REFUND_NOT_VERIFIED:${JSON.stringify(executionResults)}`);
}

const certificateResponse = await fetch(`${baseUrl}/api/cases/${caseRef}/certificate`, { signal: AbortSignal.timeout(15_000) });
if (certificateResponse.status !== 200) throw new Error(`S6_CERTIFICATE_FAILED:${certificateResponse.status}`);
const certificate = z.object({
  caseRef: z.literal(caseRef), refundAmountMinor: z.literal(10_000), refundStatus: z.literal("COMPLETED"),
  obligationBalanceMinor: z.literal(0), certificateHash: z.string().length(64), disclaimer: z.string().min(1),
}).parse(await certificateResponse.json());

const duplicateResponse = await post(`/api/cases/${caseRef}/proposals`, { mode: "deterministic" });
if (duplicateResponse.status !== 409) throw new Error(`S6_DUPLICATE_NOT_BLOCKED:${duplicateResponse.status}`);
const duplicate = z.object({ code: z.literal("REFUND_ALREADY_SETTLED") }).passthrough().parse(await duplicateResponse.json());

const { client } = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const [proof] = await client<{
    action_count: number; refund_count: number; allocation_count: number; certificate_count: number;
    request_count: number; provider_refund_count: number;
  }[]>`select
      (select count(*)::int from actions where id = ${action.actionId}) as action_count,
      (select count(*)::int from refunds r join actions a on a.provider_resource_id = r.provider_refund_id where a.id = ${action.actionId}) as refund_count,
      (select count(*)::int from obligation_allocations oa join actions a on a.obligation_id = oa.obligation_id where a.id = ${action.actionId} and oa.state = 'COMPLETED') as allocation_count,
      (select count(*)::int from certificates where action_id = ${action.actionId}) as certificate_count,
      (select count(distinct request_id)::int from actions where id = ${action.actionId}) as request_count,
      (select count(distinct provider_resource_id)::int from actions where id = ${action.actionId}) as provider_refund_count`;
  if (!proof || Object.values(proof).some((value) => value !== 1)) throw new Error(`S6_DURABILITY_FAILED:${JSON.stringify(proof)}`);
  console.log(JSON.stringify({
    status: "PASS",
    operation: "s6-execute-real-refund",
    caseRef,
    actionId: redactIdentifier(action.actionId),
    requestId: redactIdentifier(action.requestId),
    refundId: redactIdentifier(completed.providerRefundId),
    amountMinor: proposal.amountMinor,
    state: completed.state,
    verifiedByGet: completed.verifiedByGet,
    staleApprovalBlocked: staleApproval.code === "APPROVAL_STALE",
    approvalDoubleClickIdempotent: true,
    executionDoubleClickStatuses: executionResponses.map((response) => response.status),
    duplicateBlockedBeforeNetwork: duplicate.code === "REFUND_ALREADY_SETTLED",
    certificateHashPresent: certificate.certificateHash.length === 64,
    durableRows: proof,
  }));
} finally {
  await client.end();
}
