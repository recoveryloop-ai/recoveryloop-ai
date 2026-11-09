import { expect,test } from "@playwright/test";

test("final case provenance is honest and task reads remain protected",async({page},testInfo)=>{
 test.skip(!process.env.DATABASE_URL,"Final local smoke requires stored demo records.");
 test.setTimeout(60_000);
 await page.goto("/app/cases/RG-2048");
 await expect(page.getByText("Case context",{exact:true})).toBeVisible();
 await expect(page.getByText(/No buyer statement is stored/)).toBeVisible();
 await expect(page.locator(".cw-state")).toContainText("Returned To Sender");
 await expect(page.locator(".cw-mode")).toHaveText("STORED_VALIDATED");
 await expect(page.getByRole("link",{name:/View verified certificate/})).toBeVisible();
 const denied=await page.request.get("/api/cases/RG-2048/casework");
 expect(denied.status()).toBe(401);
 await page.screenshot({path:testInfo.outputPath("s10-final-case.png"),fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 expect(overflow).toBe(false);
});
