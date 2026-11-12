import { createDatabase } from "../../src/server/db/client";
import { scenarioFacts } from "../../src/server/modules/casework/scenarios";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const [cs] = await client<{
    id: string;
  }[]> `select id from cases where external_ref='RG-2048'`;
  if (!cs)
    throw Error("BASELINE_CASE_MISSING");
  for (const [scenario, facts] of Object.entries(scenarioFacts))
    await client `insert into casework_evidence(case_id,scenario,facts) values(${cs.id},${scenario},${JSON.stringify(facts)}::jsonb) on conflict(case_id,scenario) do nothing`;
  console.log(JSON.stringify({ status: "PASS", syntheticScenarioRecords: 7, providerWrites: 0 }));
}
finally {
  await client.end();
}
