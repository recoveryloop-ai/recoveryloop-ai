import { createDatabase } from "../../src/server/db/client";
import { hashAuditDetails } from "../../src/server/modules/casework/audit-hash";
import { loadCaseworkContext } from "../../src/server/modules/casework/scenarios";
import { validateCasework } from "../../src/server/modules/casework/decision";
import type { CaseworkScenario } from "../../src/server/modules/casework/contracts";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const url=requireEnvironment("DATABASE_URL");const {client}=createDatabase(url);
try {
 const runs=await client<{id:string;case_id:string;scenario:CaseworkScenario;model:string;prompt_version:string;evidence_hash:string;output_json:unknown;provider_response_hash:string;external_ref:string}[]>`select r.*,cs.external_ref from casework_runs r join cases cs on cs.id=r.case_id where r.prompt_version='casework-v2' order by r.created_at`;
 let appended=0;
 for(const run of runs) {
  const context=await loadCaseworkContext(url,run.external_ref,run.scenario);
  if(!validateCasework(run.output_json,context).output)throw Error("RUN_ATTESTATION_VALIDATION_FAILED");
  await client.begin(async sql=>{
   await sql`select id from cases where id=${run.case_id} for update`;
   const [existing]=await sql<{id:string}[]>`select id from audit_events where event_type='CASEWORK_RUN_ATTESTED' and details->>'runId'=${run.id}`;
   if(existing)return;
   const prior=await sql<{id:string}[]>`select id from audit_events where event_type='CASEWORK_RUN_RECORDED' and details->>'runId'=${run.id}`;
   const details={runId:run.id,scenario:run.scenario,model:run.model,promptVersion:run.prompt_version,evidenceHash:run.evidence_hash,providerResponseHash:run.provider_response_hash,source:"STORED_VALIDATED_RUN",priorAuditIds:prior.map(row=>row.id),reason:"PREPARATION_AUDIT_HASH_CORRECTION",providerWrite:false};
   await sql`insert into audit_events(merchant_id,actor,case_id,event_type,details_hash,details) select o.merchant_id,'system:casework-attestation',cs.id,'CASEWORK_RUN_ATTESTED',${hashAuditDetails(details)},${JSON.stringify(details)}::jsonb from cases cs join orders o on o.id=cs.order_id where cs.id=${run.case_id}`;
   appended++;
  });
 }
 console.log(JSON.stringify({status:"PASS",validatedStoredRuns:runs.length,appendOnlyAttestations:appended,originalAuditRowsChanged:0,providerCalls:0,financialWrites:0}));
}finally{await client.end();}
