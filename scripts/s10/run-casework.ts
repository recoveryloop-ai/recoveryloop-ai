import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
import { ZaiInvestigatorProvider } from "../../src/server/adapters/ai/zai-investigator-provider";
import { caseworkScenarios } from "../../src/server/modules/casework/contracts";
import { loadCaseworkContext } from "../../src/server/modules/casework/scenarios";
import { investigateCasework } from "../../src/server/modules/casework/investigator";
import { readCaseworkRun, persistCaseworkRun } from "../../src/server/modules/casework/service";
loadLocalEnvironment();
const url = requireEnvironment("DATABASE_URL");
const provider = new ZaiInvestigatorProvider({ apiKey: requireEnvironment("ZAI_API_KEY"), model: requireEnvironment("ZAI_MODEL"), baseUrl: requireEnvironment("ZAI_BASE_URL") });
const selected = process.argv[2];
for (const scenario of caseworkScenarios.filter(s => selected === "CHALLENGES" ? s !== "BASELINE" : !selected || s === selected)) {
  const context = await loadCaseworkContext(url, "RG-2048", scenario);
  const existing = await readCaseworkRun(url, context);
  if (existing.mode === "STORED_VALIDATED") {
    console.log(JSON.stringify({ scenario, status: "SKIPPED_CURRENT_VALIDATED", providerCalls: 0 }));
    continue;
  }
  const run = await investigateCasework(context, provider, () => loadCaseworkContext(url, "RG-2048", scenario));
  const id = await persistCaseworkRun(url, context, run);
  console.log(JSON.stringify({ scenario, status: run.mode, validationCode: run.validationCode, runStored: Boolean(id), issue: run.output.issue, outcome: run.output.outcome, model: run.model, toolCalls: run.toolLog.map(t => ({ name: t.toolName, by: t.initiatedBy })), citations: [...new Set(run.output.findings.flatMap(f => f.evidence_ids))], promptTokens: run.promptTokens, completionTokens: run.completionTokens, providerWrites: 0 }));
  if (run.mode !== "FRESH_VALIDATED" || !id) {
    process.exitCode = 1;
    break;
  }
}
