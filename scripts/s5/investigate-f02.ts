import { createHash } from "node:crypto";

import type { AiTurnResponse, InvestigatorProvider } from "../../src/server/modules/investigation/contracts";
import { InvestigatorService } from "../../src/server/modules/investigation/investigator-service";
import { createInvestigatorService } from "../../src/server/modules/investigation/service-factory";
import { createDatabase } from "../../src/server/db/client";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");

class UnavailableProofProvider implements InvestigatorProvider {
  readonly model = "glm-5.3";
  async generate(): Promise<AiTurnResponse> {
    throw new Error("S5_INTENTIONAL_UNAVAILABLE_PROOF");
  }
}

async function ledgerHash(): Promise<string> {
  const { client } = createDatabase(databaseUrl);
  try {
    const rows = await client<Record<string, unknown>[]>`select 'capture' as kind, id, order_id, provider,
        provider_capture_id as provider_id, status, captured_minor as amount_minor, currency, verified_at
      from captures
      union all
      select 'refund' as kind, r.id, c.order_id, c.provider, r.provider_refund_id as provider_id,
        r.status, r.amount_minor, r.currency, r.verified_at
      from refunds r join captures c on c.id = r.capture_id
      order by kind, id`;
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  } finally {
    await client.end();
  }
}

const before = await ledgerHash();
const fallback = await new InvestigatorService({
  databaseUrl,
  provider: new UnavailableProofProvider(),
}).investigate("RG-2048");
const validated = await createInvestigatorService().investigate("RG-2048");
const after = await ledgerHash();

if (fallback.status !== "FALLBACK" || fallback.validationCode !== "AI_UNAVAILABLE") {
  throw new Error(`S5_FALLBACK_PROOF_FAILED:${fallback.status}:${fallback.validationCode}`);
}
if (validated.status !== "VALIDATED") {
  throw new Error(`S5_ZAI_VALIDATION_FAILED:${validated.validationCode}`);
}
if (before !== after) throw new Error("S5_PAYMENT_LEDGER_MUTATED");

console.log(JSON.stringify({
  status: "PASS",
  operation: "s5-investigate-f02",
  model: validated.model,
  promptVersion: validated.promptVersion,
  validatedStatus: validated.status,
  findingCount: validated.output.findings.length,
  citationCount: new Set(validated.output.findings.flatMap((finding) => finding.evidence_ids)).size,
  fallbackStatus: fallback.status,
  fallbackReason: fallback.validationCode,
  paymentLedgerUnchanged: before === after,
  providerWrites: 0,
}));
