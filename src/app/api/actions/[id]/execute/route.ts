import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOperator } from "@/server/auth/require-operator";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { AppError } from "@/server/http/app-error";
import { routeErrorResponse } from "@/server/http/route-error";
import { createRefundActionService } from "@/server/modules/refunds/service-factory";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const requestSchema = z.object({ confirmation: z.literal("EXECUTE SANDBOX REFUND") }).strict();

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
    const body = requestSchema.parse(await request.json());
    if (body.confirmation !== "EXECUTE SANDBOX REFUND") throw new AppError("EXECUTION_CONFIRMATION_MISMATCH", 400);
    const result = await createRefundActionService().executeAction(authorization.principalId, actionId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
