import { expect, test } from "@playwright/test";

test("public foundation renders and emits browser security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /See the whole order/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore live demo/i })).toHaveAttribute("href", "/app");
  await expect(page.locator(".status-pill")).toHaveText(/Public sandbox demo/);
  await expect(page.getByText("0", { exact: true })).toBeVisible();

  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("workspace fixtures remain usable at desktop and mobile widths", async ({ page }, testInfo) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Recovery command" })).toBeVisible();
  await expect(page.getByText("Canonical orders", { exact: true })).toBeVisible();
  await expect(page.getByText("PayPal sandbox read-back", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.screenshot({ path: testInfo.outputPath("s3-command-center.png"), fullPage: true });
});

test("untrusted signout request returns a structured denial", async ({ request }) => {
  const response = await request.post("/auth/signout", { headers: { origin: "https://attacker.invalid" } });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    code: "ORIGIN_NOT_ALLOWED",
    retryable: false,
    correlation_id: expect.any(String),
  });
});

test("S4 simulator is deterministic and cannot write to a provider", async ({ request }) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const eligible = await request.post("/api/cases/RG-2048/simulate", {
    data: { option: "ISSUE_POLICY_REFUND" },
  });
  expect(eligible.status()).toBe(200);
  await expect(eligible.json()).resolves.toMatchObject({
    case_ref: "RG-2048",
    mode: "SIMULATION_ONLY",
    provider_write: false,
    obligation: {
      decision: "ALLOWED",
      proposedRefundMinor: 10_000,
      conditionalRecoveryMinor: 0,
    },
    simulation: {
      newRefundMinor: 10_000,
      safeguardResult: "PASS",
    },
  });

  const duplicate = await request.post("/api/cases/RG-2049/simulate", {
    data: { option: "ISSUE_POLICY_REFUND" },
  });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({
    provider_write: false,
    obligation: {
      decision: "BLOCKED",
      proposedRefundMinor: 0,
      reasonCodes: ["REFUND_ALREADY_SETTLED"],
    },
    simulation: { newRefundMinor: 0, safeguardResult: "BLOCK" },
  });
});

test("S5 case narrative exposes validated citations and deterministic authority", async ({ page }, testInfo) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const response = await page.goto("/app/cases/RG-2048");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Return To Sender", exact: true })).toBeVisible();
  await page.getByText("Accepted v1 investigation · Investigation", { exact: true }).click();
  await expect(page.getByText("Z.ai validated", { exact: true })).toBeVisible();
  await expect(page.getByText("No provider writes", { exact: false })).toBeVisible();
  await expect(page.getByText("$100.00 simulated policy amount", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cited evidence" })).toBeVisible();
  expect(await page.locator(".evidence-drawer details").count()).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath("s5-investigation.png"), fullPage: true });
});

test("anonymous visitors cannot spend AI quota", async ({ request }) => {
  const response = await request.post("/api/cases/RG-2048/investigate", {
    data: { mode: "ai" },
    headers: { origin: "http://127.0.0.1:4173" },
  });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ code: "AUTHENTICATION_REQUIRED", retryable: false });
});

test("anonymous visitors cannot propose, approve, execute, or reconcile refunds", async ({ request }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const attempts = [
    ["/api/cases/RG-2048/proposals", { mode: "deterministic" }],
    [`/api/proposals/${id}/approve`, { snapshot_hash: "a".repeat(64), confirmation: "REFUND $100.00 IN SANDBOX" }],
    [`/api/actions/${id}/execute`, { confirmation: "EXECUTE SANDBOX REFUND" }],
    [`/api/actions/${id}/reconcile`, { mode: "provider_readback" }],
  ] as const;
  for (const [path, data] of attempts) {
    const response = await request.post(path, { data, headers: { origin: "https://attacker.invalid" } });
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTHENTICATION_REQUIRED", retryable: false });
  }
});

test("S6 certificate is read-only, redacted, and provider-verified", async ({ request }) => {
  test.skip(!process.env.DATABASE_URL, "The public CI job intentionally has no database credential.");
  const response = await request.get("/api/cases/RG-2052/certificate");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    caseRef: "RG-2052",
    provider: "PAYPAL_SANDBOX",
    captureAmountMinor: 25_000,
    captureStatus: "COMPLETED",
    refundAmountMinor: 10_000,
    refundStatus: "COMPLETED",
    obligationBalanceMinor: 0,
    captureId: expect.stringMatching(/…/),
    refundId: expect.stringMatching(/…/),
    certificateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    disclaimer: expect.stringContaining("not a legally binding certificate"),
  });
});
