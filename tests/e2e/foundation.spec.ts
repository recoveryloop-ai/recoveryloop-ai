import { expect, test } from "@playwright/test";

test("public foundation renders and emits browser security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /See the whole order/i })).toBeVisible();
  await expect(page.getByText("0", { exact: true })).toBeVisible();

  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("workspace fixtures remain usable at desktop and mobile widths", async ({ page }, testInfo) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();
  await expect(page.getByText("F05", { exact: true })).toBeVisible();
  await expect(page.getByText("EasyPost test · synthetic item mapping", { exact: false })).toBeVisible();
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
