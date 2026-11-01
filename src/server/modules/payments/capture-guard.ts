import { AppError } from "../../http/app-error";

export type CaptureDecision = "RETURN_EXISTING" | "START_CAPTURE";

export function decideCapture(
  localStatus: string,
  providerOrderStatus: string,
  hasPersistedCapture: boolean,
): CaptureDecision {
  if (localStatus === "COMPLETED" && hasPersistedCapture) return "RETURN_EXISTING";
  if (["CAPTURING", "UNKNOWN", "PENDING", "DENIED", "DECLINED"].includes(localStatus)) {
    throw new AppError(`CAPTURE_${localStatus}`, 409, localStatus !== "UNKNOWN");
  }
  if (providerOrderStatus !== "APPROVED") {
    throw new AppError(`PAYPAL_ORDER_${providerOrderStatus}`, 409);
  }
  return "START_CAPTURE";
}
