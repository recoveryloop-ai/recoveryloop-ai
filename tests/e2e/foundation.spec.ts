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

test("workspace fixtures remain usable at desktop and mobile widths", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();
  await expect(page.getByText("F05", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
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
