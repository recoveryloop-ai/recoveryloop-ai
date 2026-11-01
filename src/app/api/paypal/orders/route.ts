import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOperator } from "@/server/auth/require-operator";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { createCheckoutService } from "@/server/modules/payments/service-factory";

const formSchema = z.object({ request_id: z.uuid() });

export async function POST(request: Request) {
  const authorization = await requireOperator(request);
  if (!authorization.authorized) {
    return NextResponse.json(
      { code: authorization.code, message: "Operator access is required.", retryable: false, correlation_id: crypto.randomUUID() },
      { status: authorization.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    assertTrustedOrigin(request);
    const form = formSchema.parse(Object.fromEntries(await request.formData()));
    const checkout = await createCheckoutService().createOrder(authorization.principalId, form.request_id);
    return NextResponse.redirect(checkout.approvalUrl, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
