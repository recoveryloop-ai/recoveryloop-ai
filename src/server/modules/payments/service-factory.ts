import { getPaymentProvider } from "../../adapters/payments/provider-factory";
import { CheckoutService } from "./checkout-service";

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export function createCheckoutService(): CheckoutService {
  return new CheckoutService({
    databaseUrl: requireEnvironment("DATABASE_URL"),
    paymentProvider: getPaymentProvider(process.env),
    appBaseUrl: requireEnvironment("APP_BASE_URL").replace(/\/$/, ""),
  });
}
