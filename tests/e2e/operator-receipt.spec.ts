import { expect, test } from "@playwright/test";
import postgres from "postgres";

const hasOperatorEnvironment = Boolean(
  process.env.DATABASE_URL && process.env.DEMO_OPERATOR_EMAIL && process.env.DEMO_OPERATOR_PASSWORD,
);

test("operator can open the provider-verified receipt and malformed IDs return 404", async ({ page }, testInfo) => {
  test.skip(!hasOperatorEnvironment, "Operator credentials and database are intentionally absent in public CI.");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  let orderId: string;
  try {
    const [row] = await sql<{ id: string }[]>`select o.id
      from orders o
      join captures c on c.order_id = o.id and c.provider = 'PAYPAL' and c.status = 'COMPLETED'
      order by c.created_at desc limit 1`;
    if (!row) throw new Error("VERIFIED_RECEIPT_FIXTURE_MISSING");
    orderId = row.id;
  } finally {
    await sql.end();
  }

  await page.goto("/login");
  await page.getByLabel("Operator email").fill(process.env.DEMO_OPERATOR_EMAIL!);
  await page.getByLabel("Password").fill(process.env.DEMO_OPERATOR_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/store$/);
  await expect(page.getByText("Operator authorized")).toBeVisible();

  await page.goto(`/app/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Sandbox payment" })).toBeVisible();
  await expect(page.getByText("COMPLETED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$250.00", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("verified-receipt.png"), fullPage: true });

  const malformedResponse = await page.goto("/app/orders/not-a-uuid");
  expect(malformedResponse?.status()).toBe(404);

  await page.goto("/store");
  await page.getByRole("button", { name: "Sign out operator" }).click();
  await expect(page).toHaveURL(/\/$/);
});
