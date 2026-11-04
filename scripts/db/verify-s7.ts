import { createHash, randomUUID } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import { resetDemoOverlay, setDemoOverlay } from "../../src/server/modules/demo/judge-session-service";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));
const ids = [randomUUID(), randomUUID()];

async function ledgerFingerprint(): Promise<string> {
  const [row] = await client<{ proof: string }[]>`select jsonb_build_object(
    'captures', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id, status, captured_minor, provider_capture_id, verified_at from captures) t),
    'refunds', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id, status, amount_minor, provider_refund_id, verified_at from refunds) t),
    'allocations', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id, obligation_id, refund_id, amount_minor, state from obligation_allocations) t),
    'actions', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id, state, request_id, provider_resource_id, verified_at from actions) t),
    'certificates', (select jsonb_agg(to_jsonb(t) order by t.id) from (select id, action_id, certificate_hash from certificates) t)
  )::text as proof`;
  return createHash("sha256").update(String(row?.proof ?? "")).digest("hex");
}

try {
  const before = await ledgerFingerprint();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  for (const id of ids) {
    const tokenHash = createHash("sha256").update(String(id)).digest("hex");
    await client`insert into judge_sessions (id, token_hash, expires_at) values (${id}, ${tokenHash}, ${expiresAt})`;
  }
  await setDemoOverlay(ids[0]!, "ALREADY_REFUNDED");
  await setDemoOverlay(ids[1]!, "CONTRADICTORY_DELIVERY");
  const overlays = await client<{ session_id: string; scenario: string }[]>`select session_id, scenario from demo_overlays where session_id in (${ids[0]!}, ${ids[1]!}) order by session_id`;
  if (overlays.length !== 2 || new Set(overlays.map((row) => row.scenario)).size !== 2) throw new Error(`S7_SESSION_ISOLATION_FAILED:${JSON.stringify(overlays)}`);
  const removed = await resetDemoOverlay(ids[0]!);
  const remaining = await client<{ session_id: string }[]>`select session_id from demo_overlays where session_id in (${ids[0]!}, ${ids[1]!})`;
  if (removed !== 1 || remaining.length !== 1 || remaining[0]?.session_id !== ids[1]) throw new Error(`S7_SCOPED_RESET_FAILED:${JSON.stringify({ removed, remaining })}`);
  const after = await ledgerFingerprint();
  if (before !== after) throw new Error("S7_CANONICAL_LEDGER_MUTATED");

  const tables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename, rowsecurity from pg_tables
    where schemaname = 'public' and tablename in ('judge_sessions', 'demo_overlays') order by tablename`;
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('judge_sessions', 'demo_overlays') and grantee in ('anon', 'authenticated')`;
  const indexes = await client<{ indexname: string }[]>`select indexname from pg_indexes where schemaname = 'public' and indexname in
    ('judge_sessions_token_hash_unique', 'judge_sessions_expires_idx', 'demo_overlays_session_case_unique', 'demo_overlays_session_expires_idx')`;
  if (tables.length !== 2 || tables.some((table) => !table.rowsecurity) || grants?.count !== 0 || indexes.length !== 4) throw new Error("S7_DATABASE_SECURITY_FAILED");
  console.log(JSON.stringify({ status: "PASS", operation: "verify-s7", isolatedSessions: 2, scopedReset: true, canonicalLedgerStable: true, rlsTables: 2, publicGrants: 0, requiredIndexes: 4 }));
} finally {
  await client`delete from judge_sessions where id in (${ids[0]!}, ${ids[1]!})`;
  await client.end();
}
