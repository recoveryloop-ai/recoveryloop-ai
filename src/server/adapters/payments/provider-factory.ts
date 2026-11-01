import { parseBaseEnvironment, type EnvironmentInput } from "../../config/runtime-env";
import { MockPayPalProvider } from "./mock-paypal-provider";
import { PayPalSandboxProvider } from "./paypal-sandbox-provider";
import type { PaymentProvider } from "./payment-provider";

export function createPaymentProvider(
  environment: EnvironmentInput,
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
    return new PayPalSandboxProvider({
      clientId: environment.PAYPAL_CLIENT_ID ?? "",
      clientSecret: environment.PAYPAL_CLIENT_SECRET ?? "",
    });
  }

  throw new Error("UNKNOWN_PAYPAL_PROVIDER");
}

let cachedSandboxProvider: PaymentProvider | null = null;

export function getPaymentProvider(environment: EnvironmentInput): PaymentProvider {
  if ((environment.PAYPAL_PROVIDER ?? "mock") !== "sandbox") return createPaymentProvider(environment);
  cachedSandboxProvider ??= createPaymentProvider(environment);
  return cachedSandboxProvider;
}
