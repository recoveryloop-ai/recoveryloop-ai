import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SmokeResult = {
  provider: "PayPal" | "EasyPost" | "Z.ai" | "Supabase";
  status: "PASS" | "BLOCKED" | "FAIL";
  capability: string;
  evidence?: Record<string, boolean | number | string | null>;
  blocker?: string;
};

let loaded = false;

export function loadLocalEnvironment(): void {
  if (loaded) return;
  config({ path: ".env.local", quiet: true });
  loaded = true;
}

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export function redactIdentifier(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    let message = error.message.replaceAll(
      /(sk-[A-Za-z0-9_-]+|EZ(?:TK|AK)[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)/g,
      "[REDACTED]",
    );
    for (const name of ["ZAI_API_KEY", "EASYPOST_API_KEY", "PAYPAL_CLIENT_SECRET"]) {
      const secret = process.env[name];
      if (secret) message = message.replaceAll(secret, "[REDACTED]");
    }
    return message;
  }
  return "Unknown error";
}

export function printResult(result: SmokeResult): void {
  console.log(JSON.stringify(result, null, 2));
}

export function directExecution(importMetaUrl: string): boolean {
  return (
    process.argv[1] !== undefined &&
    fileURLToPath(importMetaUrl) === resolve(process.argv[1])
  );
}
