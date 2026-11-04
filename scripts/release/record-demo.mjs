import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

const baseUrl = (process.env.RELEASE_BASE_URL ?? "https://recoveryloop-ai.vercel.app").replace(/\/$/, "");
const outputPath = resolve(process.env.RELEASE_VIDEO_PATH ?? "artifacts/recoveryloop-demo-draft.webm");
await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: dirname(outputPath), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const video = page.video();

async function hold(milliseconds = 2_500) {
  await page.waitForTimeout(milliseconds);
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await hold(3_000);
  await page.getByRole("link", { name: /Explore live demo/i }).click();
  await page.getByRole("heading", { name: "Recovery command" }).waitFor({ timeout: 30_000 });
  await hold();

  await page.goto(`${baseUrl}/app/cases/RG-2048`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Investigation" }).waitFor({ timeout: 30_000 });
  await hold(3_500);
  const evidence = page.locator(".evidence-drawer details").first();
  if (await evidence.isVisible()) await evidence.click();
  await hold(2_500);

  await page.getByRole("link", { name: /Open recovery map/i }).click();
  await page.getByRole("heading", { name: "Recovery map" }).waitFor({ timeout: 30_000 });
  await hold(4_000);

  await page.goto(`${baseUrl}/app/demo`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText("CANONICAL LEDGER", { exact: true }).waitFor({ timeout: 30_000 });
  await hold(3_000);
  await page.getByRole("button", { name: /Already refunded/i }).click();
  await page.getByText("SYNTHETIC SESSION OVERLAY", { exact: true }).waitFor({ timeout: 30_000 });
  await hold(4_000);
  await page.getByRole("button", { name: "Reset safely" }).click();
  await page.getByText("CANONICAL LEDGER", { exact: true }).waitFor({ timeout: 30_000 });
  await hold(2_500);

  await page.goto(`${baseUrl}/app/actions`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Action center" }).waitFor({ timeout: 30_000 });
  await hold(3_000);
  await page.goto(`${baseUrl}/app/cases/RG-2052/certificate`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Sandbox recovery certificate" }).waitFor({ timeout: 30_000 });
  await hold(5_000);

  await page.goto(`${baseUrl}/app/settings`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Settings & safeguards" }).waitFor({ timeout: 30_000 });
  await hold(3_000);

  await page.close();
  if (!video) throw new Error("PLAYWRIGHT_VIDEO_UNAVAILABLE");
  await video.saveAs(outputPath);
} finally {
  if (!page.isClosed()) await page.close();
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ status: "PASS", operation: "record-s8-demo-draft", baseUrl, outputPath, containsCredentials: false }));
