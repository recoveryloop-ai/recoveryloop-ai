import { expect, test } from "@playwright/test";

test("six-tab judge workspace is navigable without authentication", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const routes = [
    ["/app", "Recovery command"],
    ["/app/cases", "Cases"],
    ["/app/orders", "Orders"],
    ["/app/recovery", "Recovery map"],
    ["/app/actions", "Action center"],
    ["/app/demo", "Evidence challenge"],
  ] as const;
  for (const [route, heading] of routes) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.goto("/app/actions");
  await expect(page.getByText("Public read-only view")).toBeVisible();
  await expect(page.getByText("Money controls are locked")).toBeVisible();
});

test("anonymous evidence overlays persist, remain isolated, and reset safely", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    firstPage.on("pageerror", (error) => pageErrors.push(error.message));
    firstPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await firstPage.goto("/app/demo");
    await expect(firstPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    const overlayResponse = firstPage.waitForResponse((response) => response.url().endsWith("/api/demo/overlay"));
    await firstPage.getByRole("button", { name: /Already refunded/ }).click();
    expect((await overlayResponse).status()).toBe(200);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(firstPage.url()).toContain("/app/demo");
    await expect(firstPage.locator(".source-banner")).toContainText("SYNTHETIC SESSION OVERLAY", { timeout: 15_000 });
    await expect(firstPage.locator(".comparison-card.after").getByText("BLOCKED")).toBeVisible();
    await firstPage.reload();
    await expect(firstPage.getByText("SYNTHETIC SESSION OVERLAY", { exact: true })).toBeVisible({ timeout: 15_000 });

    await secondPage.goto("/app/demo");
    await expect(secondPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".comparison-card.after").getByText("ALLOWED")).toBeVisible();

    await firstPage.getByRole("button", { name: "Reset safely" }).click();
    await expect(firstPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(firstPage.locator(".comparison-card.after").getByText("ALLOWED")).toBeVisible();
    await secondPage.reload();
    await expect(secondPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await first.close();
    await second.close();
  }
});

test("judge path reaches investigation, recovery map, and redacted sandbox proof", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  await page.goto("/app/cases/RG-2048");
  await expect(page.getByRole("heading", { name: "Investigation" })).toBeVisible();
  await page.getByRole("link", { name: /Open recovery map/ }).click();
  await expect(page.getByRole("heading", { name: "Recovery map" })).toBeVisible();
  await page.goto("/app/demo");
  await page.getByRole("link", { name: "View sandbox certificate" }).click();
  await expect(page.getByRole("heading", { name: "Sandbox recovery certificate" })).toBeVisible();
  await expect(page.locator(".certificate-seal")).toContainText("VERIFIED");
  await expect(page.locator(".certificate-seal")).toContainText("SANDBOX");
  await expect(page.getByText("PROVIDER_VERIFIED")).toBeVisible();
  await expect(page.locator(".certificate-sheet")).not.toContainText(process.env.PAYPAL_CLIENT_SECRET ?? "never-present-secret");
});

test("buyer dispute overlay blocks the refund as a double payout, stays isolated, and resets", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    const pageErrors: string[] = [];
    firstPage.on("pageerror", (error) => pageErrors.push(error.message));
    await firstPage.goto("/app/demo");
    await expect(firstPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    const overlayResponse = firstPage.waitForResponse((response) => response.url().endsWith("/api/demo/overlay"));
    await firstPage.getByRole("button", { name: /Buyer opened a dispute/ }).click();
    expect((await overlayResponse).status()).toBe(200);
    await expect(firstPage.locator(".source-banner")).toContainText("SYNTHETIC SESSION OVERLAY", { timeout: 15_000 });
    const after = firstPage.locator(".comparison-card.after");
    await expect(after.getByText("BLOCKED")).toBeVisible();
    await expect(after).toContainText("DISPUTE_OPEN");
    await expect(after).toContainText("$0.00");
    await expect(firstPage.locator(".diff-card")).toContainText("DISPUTE_OPEN");
    expect(pageErrors).toEqual([]);

    await firstPage.getByRole("button", { name: "Investigate" }).click();
    await expect(firstPage.getByText(/Rules-only fallback: .*PayPal dispute/)).toBeVisible({ timeout: 15_000 });

    await secondPage.goto("/app/demo");
    await expect(secondPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".comparison-card.after").getByText("ALLOWED")).toBeVisible();

    await firstPage.getByRole("button", { name: "Reset safely" }).click();
    await expect(firstPage.getByText("CANONICAL LEDGER", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(firstPage.locator(".comparison-card.after").getByText("ALLOWED")).toBeVisible();
  } finally {
    await first.close();
    await second.close();
  }
});
