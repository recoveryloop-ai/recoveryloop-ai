import { z } from "zod";

const booleanString = z.enum(["true", "false"]);

export const baseEnvironmentSchema = z.object({
  DEMO_MODE: booleanString.default("true"),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
});

export type BaseEnvironment = z.infer<typeof baseEnvironmentSchema>;
export type EnvironmentInput = Record<string, string | undefined>;

export function assertPayPalSandbox(environment: BaseEnvironment): void {
  if (environment.DEMO_MODE === "true" && environment.PAYPAL_ENV !== "sandbox") {
    throw new Error("PAYPAL_LIVE_FORBIDDEN_IN_DEMO_MODE");
  }
}

export function parseBaseEnvironment(
  environment: EnvironmentInput,
): BaseEnvironment {
  const parsed = baseEnvironmentSchema.parse(environment);
  assertPayPalSandbox(parsed);
  return parsed;
}
