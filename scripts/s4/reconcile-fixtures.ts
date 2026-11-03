import { reconcileCaseObligationGraph } from "../../src/server/modules/obligations/obligation-graph-service";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");
const caseRefs = ["RG-2048", "RG-2049", "RG-2050", "RG-2051"] as const;

for (const caseRef of caseRefs) await reconcileCaseObligationGraph(databaseUrl, caseRef);

console.log(JSON.stringify({
  status: "PASS",
  operation: "s4-reconcile-fixtures",
  cases: caseRefs,
  providerWrites: 0,
}));
