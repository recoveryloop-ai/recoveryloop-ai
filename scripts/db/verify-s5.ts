import { investigatorOutputSchema } from "../../src/server/modules/investigation/contracts";
import { readOnlyToolNames } from "../../src/server/modules/investigation/read-only-tools";
import { createDatabase } from "../../src/server/db/client";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

try {
  const [latest] = await client<{
    id: string;
    case_id: string;
    model: string;
    prompt_version: string;
    evidence_hash: string;
    input_hash: string;
    status: string;
    validation_code: string;
    output_json: unknown;
    tool_log: unknown;
    provider_response_hash: string | null;
    prompt_tokens: number;
    completion_tokens: number;
  }[]>`select i.id, i.case_id, i.model, i.prompt_version, i.evidence_hash, i.input_hash,
      i.status, i.validation_code, i.output_json, i.tool_log, i.provider_response_hash,
      i.prompt_tokens, i.completion_tokens
    from investigations i join cases c on c.id = i.case_id
    where c.external_ref = 'RG-2048'
    order by i.created_at desc, i.id desc limit 1`;
  if (!latest || latest.status !== "VALIDATED" || latest.validation_code !== "VALIDATED"
    || latest.model !== "glm-5.3" || latest.prompt_version !== "investigator-v1"
    || latest.evidence_hash.length !== 64 || latest.input_hash.length !== 64
    || latest.provider_response_hash?.length !== 64
    || latest.prompt_tokens <= 0 || latest.completion_tokens <= 0) {
    throw new Error(`S5_LATEST_INVARIANT_FAILED:${JSON.stringify(latest)}`);
  }
  const output = investigatorOutputSchema.parse(latest.output_json);
  const citedIds = [...new Set(output.findings.flatMap((finding) => finding.evidence_ids))];
  if (citedIds.length < 2) throw new Error("S5_INSUFFICIENT_CITATIONS");
  const [validCitations] = await client<{ count: number }[]>`select count(*)::int as count from evidence
    where case_id = ${latest.case_id} and id = any(${citedIds}::uuid[])`;
  if (validCitations?.count !== citedIds.length) throw new Error("S5_UNSUPPORTED_CITATION_PERSISTED");

  if (!Array.isArray(latest.tool_log) || latest.tool_log.length > 8) throw new Error("S5_TOOL_LOG_INVALID");
  const loggedNames = latest.tool_log.map((entry) => (
    typeof entry === "object" && entry !== null && "toolName" in entry ? entry.toolName : null
  ));
  if (loggedNames.some((name) => typeof name !== "string" || !readOnlyToolNames.includes(name as typeof readOnlyToolNames[number]))) {
    throw new Error(`S5_FORBIDDEN_TOOL_LOGGED:${JSON.stringify(loggedNames)}`);
  }

  const [fallback] = await client<{ count: number }[]>`select count(*)::int as count from investigations i
    join cases c on c.id = i.case_id
    where c.external_ref = 'RG-2048' and i.status = 'FALLBACK' and i.validation_code = 'AI_UNAVAILABLE'`;
  if ((fallback?.count ?? 0) < 1) throw new Error("S5_DURABLE_FALLBACK_MISSING");

  const [audit] = await client<{ count: number }[]>`select count(*)::int as count from audit_events
    where case_id = ${latest.case_id} and event_type = 'INVESTIGATION_RECORDED'`;
  if ((audit?.count ?? 0) < 2) throw new Error("S5_AUDIT_TRAIL_MISSING");

  const [table] = await client<{ rowsecurity: boolean }[]>`select rowsecurity from pg_tables
    where schemaname = 'public' and tablename = 'investigations'`;
  if (!table?.rowsecurity) throw new Error("S5_RLS_MISSING");
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count
    from information_schema.role_table_grants where table_schema = 'public'
      and table_name = 'investigations' and grantee in ('anon', 'authenticated')`;
  if (grants?.count !== 0) throw new Error(`S5_PUBLIC_GRANTS_FOUND:${grants?.count}`);
  const indexes = await client<{ indexname: string }[]>`select indexname from pg_indexes where schemaname = 'public'
    and indexname in ('investigations_case_created_idx', 'investigations_evidence_hash_idx') order by indexname`;
  if (indexes.length !== 2) throw new Error(`S5_INDEX_INVARIANT_FAILED:${JSON.stringify(indexes)}`);

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s5",
    model: latest.model,
    promptVersion: latest.prompt_version,
    validatedCitations: citedIds.length,
    toolCalls: latest.tool_log.length,
    forbiddenTools: 0,
    durableFallbacks: fallback?.count ?? 0,
    auditEvents: audit?.count ?? 0,
    rls: table.rowsecurity,
    anonAuthenticatedGrants: grants.count,
    requiredIndexes: indexes.length,
  }));
} finally {
  await client.end();
}
