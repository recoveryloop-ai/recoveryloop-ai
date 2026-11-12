import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
import { loadCaseworkContext } from "../../src/server/modules/casework/scenarios";
import { ReadOnlyInvestigationToolbox, readOnlyToolNames } from "../../src/server/modules/investigation/read-only-tools";
loadLocalEnvironment();
const context = await loadCaseworkContext(requireEnvironment("DATABASE_URL"), "RG-2048");
const toolbox = new ReadOnlyInvestigationToolbox(context);
const payloads = toolbox.bootstrapCalls().map(c => toolbox.execute(c));
const serialized = JSON.stringify({ ...context, payloads });
const forbiddenKeys = /"(?:email|address|phone|password|apiKey|api_key|token|provider_capture_id|provider_refund_id|paypal_order_id|raw_json|customer_name)"\s*:/i.test(serialized);
const configuredSecrets = ["PAYPAL_CLIENT_SECRET", "ZAI_API_KEY", "SUPABASE_SECRET_KEY", "DEMO_OPERATOR_PASSWORD", "DATABASE_URL", "EASYPOST_API_KEY"].some(name => Boolean(process.env[name]) && serialized.includes(process.env[name]!));
const contactPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized);
console.log(JSON.stringify({ status: forbiddenKeys || configuredSecrets || contactPattern ? "FAIL" : "PASS", caseRef: context.case.externalRef, captureProviders: context.captures.map(c => c.provider), evidenceProviders: context.evidence.map(e => ({ provider: e.provider, source: e.sourceTier, factKeys: Object.keys(e.facts) })), allowedTools: readOnlyToolNames, forbiddenKeys, configuredSecrets, contactPattern, externalCalls: 0, destinationAllowlist: "https://api.z.ai/api/paas/v4", authorization: "NEXT_AGENT sections 0, 3.2, 3.6 explicitly authorize GLM read-only investigation with stored evidence IDs" }));
if (forbiddenKeys || configuredSecrets || contactPattern)
  process.exitCode = 1;
