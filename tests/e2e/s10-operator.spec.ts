import { expect,test } from "@playwright/test";
import postgres from "postgres";

test("authenticated operator records, reloads and overrides internal work without financial writes",async({page},testInfo)=>{
 test.skip(!process.env.DATABASE_URL||!process.env.DEMO_OPERATOR_PASSWORD,"Operator integration needs server credentials.");
 test.setTimeout(150_000);
 const sql=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});
 let taskId:string|undefined;
 try {
  const projection=await page.request.get("/api/demo/casework?case=RG-2048");
  expect(projection.ok()).toBe(true);
  const workspace=await projection.json() as {run:{id:string|null;mode:string}};
  expect(workspace.run.mode).toBe("STORED_VALIDATED");expect(workspace.run.id).toBeTruthy();
  const [prior]=await sql<{count:number}[]>`select count(*)::int as count from casework_tasks where run_id=${workspace.run.id!}`;
  test.skip(Boolean(prior?.count),"Preserve an existing operator task; do not override it for verification.");
  await page.goto("/login");
  await page.getByLabel("Operator email").fill(process.env.DEMO_OPERATOR_EMAIL!);
  await page.getByLabel("Password").fill(process.env.DEMO_OPERATOR_PASSWORD!);
  await page.getByRole("button",{name:"Sign in securely"}).click();
  await expect(page).toHaveURL(/\/store$/);
  const headers={origin:new URL(testInfo.project.use.baseURL as string).origin};
  const response=await page.request.post("/api/cases/RG-2048/casework",{headers,data:{action:"record_task",runId:workspace.run.id}});
  expect(response.status()).toBe(200);
  const created=await response.json() as {task:{id:string;revision:number;state:string};providerWrite:false};
  taskId=created.task.id;expect(created.providerWrite).toBe(false);expect(created.task.state).toBe("OPEN");
  const replay=await page.request.post("/api/cases/RG-2048/casework",{headers,data:{action:"record_task",runId:workspace.run.id}});
  expect((await replay.json()).task.id).toBe(taskId);
  await page.goto("/app/cases/RG-2048");
  await expect(page.getByRole("button",{name:"Override: operator review required"})).toBeVisible({timeout:30_000});
  await page.getByRole("button",{name:"Override: operator review required"}).click();
  await expect(page.getByText("Internal task overridden. Audit recorded; no financial state changed.")).toBeVisible({timeout:30_000});
  await expect(page.getByText(/Internal task:.*OVERRIDDEN/)).toBeVisible();
  const get=await page.request.get("/api/cases/RG-2048/casework");
  expect((await get.json()).tasks).toEqual(expect.arrayContaining([expect.objectContaining({id:taskId,state:"OVERRIDDEN",revision:1})]));
  const [audit]=await sql<{count:number}[]>`select count(*)::int as count from audit_events where details->>'taskId'=${taskId} and event_type in ('CASEWORK_TASK_CREATED','CASEWORK_TASK_OVERRIDDEN')`;
  expect(audit?.count).toBe(2);
  await page.screenshot({path:testInfo.outputPath("s10-operator-task.png"),fullPage:true});
 }finally {
  if(taskId){await sql`delete from casework_tasks where id=${taskId}`;await sql`delete from audit_events where details->>'taskId'=${taskId}`;}
  await sql.end();
 }
});
