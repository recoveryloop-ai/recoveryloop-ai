import { parseBaseEnvironment } from "../../config/runtime-env.js";
import { MockPayPalProvider } from "./mock-paypal-provider.js";
import type { PaymentProvider } from "./payment-provider.js";

export function createPaymentProvider(
  environment: NodeJS.ProcessEnv,
): PaymentProvider {
  const base = parseBaseEnvironment(environment);
  const provider = environment.PAYPAL_PROVIDER ?? "mock";

  if (provider === "mock") {
    if (base.DEMO_MODE !== "true") {
      throw new Error("MOCK_PAYPAL_REQUIRES_DEMO_MODE");
    }
    return new MockPayPalProvider();
  }

  if (provider === "sandbox") {
    throw new Error("PAYPAL_SANDBOX_ADAPTER_NOT_CONFIGURED");
  }

  throw new Error("UNKNOWN_PAYPAL_PROVIDER");
}
