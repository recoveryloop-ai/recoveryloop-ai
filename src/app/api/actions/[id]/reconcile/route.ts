import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOperator } from "@/server/auth/require-operator";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { createRefundActionService } from "@/server/modules/refunds/service-factory";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const requestSchema = z.object({ mode: z.literal("provider_readback") }).strict();

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
    const actionId = idSchema.parse(id);
    requestSchema.parse(await request.json());
    const result = await createRefundActionService().reconcileAction(authorization.principalId, actionId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
