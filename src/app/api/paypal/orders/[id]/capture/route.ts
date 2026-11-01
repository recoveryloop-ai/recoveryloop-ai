import { NextResponse } from "next/server";

import { requireOperator } from "@/server/auth/require-operator";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { AppError } from "@/server/http/app-error";
import { routeErrorResponse } from "@/server/http/route-error";
import { createCheckoutService } from "@/server/modules/payments/service-factory";

const providerIdPattern = /^[A-Z0-9_-]{8,128}$/;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireOperator(request);
  if (!authorization.authorized) {
    return NextResponse.json(
      { code: authorization.code, message: "Operator access is required.", retryable: false, correlation_id: crypto.randomUUID() },
      { status: authorization.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    assertTrustedOrigin(request);
    const { id } = await context.params;
    if (!providerIdPattern.test(id)) throw new AppError("INVALID_PAYPAL_ORDER_ID", 400);
    const result = await createCheckoutService().captureOrder(authorization.principalId, id);
    return NextResponse.redirect(new URL(`/app/orders/${result.localOrderId}`, request.url), {
      status: 303,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
