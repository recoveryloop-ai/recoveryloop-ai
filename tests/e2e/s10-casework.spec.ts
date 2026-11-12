import { expect,test } from "@playwright/test";

test("anonymous callers cannot run models or create/override merchant tasks",async({request})=>{
 for(const data of [{action:"investigate"},{action:"record_task",runId:"11111111-1111-4111-8111-111111111111"},{action:"override",taskId:"11111111-1111-4111-8111-111111111111",revision:0,reason:"OPERATOR_REVIEW_REQUIRED"}]) {
  const response=await request.post("/api/cases/RG-2048/casework",{data});
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({code:"AUTHENTICATION_REQUIRED"});
 }
});

test("S10 self-run: item, bounded decisions, synthetic challenges and separate certificate",async({page},testInfo)=>{
 test.skip(!process.env.DATABASE_URL,"DB-backed S10 self-run requires configured server credentials.");
 test.setTimeout(180_000);
 const wrongTurns:string[]=[];
 const browserErrors:string[]=[];page.on("pageerror",error=>browserErrors.push(error.message));
 page.on("console",message=>{if(message.type()==="error")browserErrors.push(message.text());});
 const stages:string[]=[];const interactions:string[]=[];
 await page.goto("/");stages.push("landing");
 await page.getByRole("link",{name:/Explore live demo/i}).click();stages.push("explore clicked");interactions.push("Explore live demo");
 await expect(page).toHaveURL(/\/app$/,{timeout:30_000});
 await page.getByRole("link",{name:/Cases/}).first().click();stages.push("cases clicked");interactions.push("Cases");
 await page.getByRole("link",{name:"RG-2048",exact:true}).click();interactions.push("RG-2048");
 await expect(page).toHaveURL(/\/app\/cases\/RG-2048$/,{timeout:30_000});
 await expect(page.getByRole("heading",{name:"Return To Sender",exact:true})).toBeVisible({timeout:30_000});
 await expect(page.getByRole("heading",{name:/Orbit Mechanical Keyboard/})).toBeVisible();
 await expect(page.getByText("Case projection current.",{exact:true})).toBeVisible({timeout:30_000});
 await expect(page.locator(".cw-money")).toContainText("SYNTHETIC FIXTURE");
 await expect(page.locator(".cw-decision")).toContainText("Policy owns any proposed amount");
 await page.getByText("Run provenance and cited records",{exact:true}).click();interactions.push("Open provenance");
 await expect(page.locator(".cw-provenance")).toContainText("no fresh public model call");
 expect(await page.locator(".cw-citations details").count()).toBeGreaterThanOrEqual(2);
 await page.screenshot({path:testInfo.outputPath("s10-baseline.png"),fullPage:true});
 expect(browserErrors).toEqual([]);
 const cases=[
  ["ALREADY_REFUNDED","No Action","$0.00"],
  ["PENDING_REFUND","Monitor Payment","$0.00"],
  ["DAMAGED_ITEM","Request Evidence","$0.00"],
  ["NOT_RECEIVED","Route To Operator","$0.00"],
 ] as const;
 for(const [scenario,outcome,amount] of cases) {
  const refreshed=page.waitForResponse(response=>response.url().includes("/api/demo/casework?")&&response.request().method()==="GET");
  await page.getByLabel("Choose a scenario").selectOption(scenario);interactions.push(`Select ${scenario}`);
  expect((await refreshed).ok()).toBe(true);
  await expect(page.getByText("Case projection current.",{exact:true})).toBeVisible({timeout:30_000});
  await expect(page.locator(".cw-money")).toContainText("SYNTHETIC SESSION OVERLAY",{timeout:30_000});
  // A validated model may choose request-evidence or routing for unresolved delivery.
  if(scenario==="NOT_RECEIVED") await expect(page.locator(".cw-decision-result")).toContainText(/Route To Operator|Request Evidence/);
  else await expect(page.locator(".cw-decision-result")).toContainText(outcome);
  const proposed=page.locator(".cw-bucket").filter({hasText:"Proposed remedy"});
  await expect(proposed).toContainText(amount);
  if(scenario==="PENDING_REFUND") {
   await expect(page.locator(".cw-bucket").filter({hasText:"Pending reservation"})).toContainText("$100.00");
   await expect(page.locator(".cw-bucket").filter({hasText:"Completed refund"})).toContainText("$0.00");
  }
 }
 await page.screenshot({path:testInfo.outputPath("s10-conflict.png"),fullPage:true});
 await page.getByRole("button",{name:"Reset to baseline"}).click();interactions.push("Reset to baseline");
 await expect(page.getByText("Case projection current.",{exact:true})).toBeVisible({timeout:30_000});
 await expect(page.locator(".cw-bucket").filter({hasText:"Proposed remedy"})).toContainText("$100.00");
 await page.locator(".cw-verification").getByRole("link",{name:/Separate verified PayPal sandbox result/}).click();interactions.push("Separate certificate");
 await expect(page.getByRole("heading",{name:/Sandbox recovery certificate/i})).toBeVisible();
 await expect(page.locator("body")).toContainText("RG-2052");
 await page.screenshot({path:testInfo.outputPath("s10-certificate.png"),fullPage:true});
 await testInfo.attach("self-run-not-customer-validation",{body:JSON.stringify({interactions:interactions.length,actions:interactions,wrongTurns,stages,browserErrors,answers:{item:"Orbit Mechanical Keyboard",state:"Returned to sender",ai:"nonfinancial case step",policy:"money eligibility and amount",challenge:"synthetic only; no PayPal refund",certificate:"RG-2052 is separate"}}),contentType:"application/json"});
});

test("S10 projection and overlay stay isolated between anonymous sessions",async({browser})=>{
 test.skip(!process.env.DATABASE_URL,"DB-backed isolation requires server credentials.");
 test.setTimeout(90_000);
 const a=await browser.newContext(),b=await browser.newContext();
 try {
  const initial=await a.request.get("/api/demo/casework?case=RG-2048");expect(initial.ok()).toBe(true);
  const changed=await a.request.post("/api/demo/overlay",{data:{scenario:"DAMAGED_ITEM"},headers:{origin:"http://127.0.0.1:4173"}});expect(changed.ok()).toBe(true);
  const [left,right]=await Promise.all([a.request.get("/api/demo/casework?case=RG-2048"),b.request.get("/api/demo/casework?case=RG-2048")]);
  expect(await left.json()).toMatchObject({scenario:"DAMAGED_ITEM",providerWrite:false,aiCallMade:false,run:{output:{issue:"ITEM_CONDITION_UNCONFIRMED"}}});
  expect(await right.json()).toMatchObject({scenario:"BASELINE",providerWrite:false,aiCallMade:false});
  const denied=await a.request.post("/api/demo/overlay",{data:{scenario:"DAMAGED_ITEM",amount_minor:10000},headers:{origin:"http://127.0.0.1:4173"}});expect(denied.status()).toBe(400);
 }finally{await a.close();await b.close();}
});
