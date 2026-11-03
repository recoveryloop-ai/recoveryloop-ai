import { getPaymentProvider } from "../../adapters/payments/provider-factory";
import { RefundActionService } from "./refund-action-service";

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export function createRefundActionService(): RefundActionService {
  const provider = getPaymentProvider(process.env);
  if (provider.implementation !== "sandbox") throw new Error("S6_REQUIRES_PAYPAL_SANDBOX");
  return new RefundActionService({
    databaseUrl: requireEnvironment("DATABASE_URL"),
    paymentProvider: provider,
  });
}
