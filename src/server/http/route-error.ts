import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { PayPalProviderError } from "../adapters/payments/paypal-sandbox-provider";
import { AppError } from "./app-error";

export function routeErrorResponse(error: unknown): NextResponse {
  const correlationId = crypto.randomUUID();
  if (error instanceof AppError) {
    return NextResponse.json(
      { code: error.code, message: "The request could not be completed.", retryable: error.retryable, correlation_id: correlationId },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { code: "REQUEST_VALIDATION_FAILED", message: "The request was invalid.", retryable: false, correlation_id: correlationId },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (error instanceof PayPalProviderError) {
    return NextResponse.json(
      { code: error.message, message: "PayPal sandbox did not complete the request.", retryable: error.retryable, correlation_id: correlationId },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const providerCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  console.error("route_error", {
    correlationId,
    name: error instanceof Error ? error.name : "unknown",
    ...(providerCode ? { providerCode } : {}),
  });
  return NextResponse.json(
    { code: "INTERNAL_ERROR", message: "The request could not be completed.", retryable: false, correlation_id: correlationId },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
