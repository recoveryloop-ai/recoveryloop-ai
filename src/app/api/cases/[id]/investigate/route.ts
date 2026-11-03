import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOperator } from "@/server/auth/require-operator";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { createInvestigatorService } from "@/server/modules/investigation/service-factory";

export const dynamic = "force-dynamic";

const caseRefSchema = z.string().regex(/^RG-\d{4,10}$/);
const requestSchema = z.object({ mode: z.literal("ai") }).strict();

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
    const caseRef = caseRefSchema.parse(id);
    requestSchema.parse(await request.json());
    const result = await createInvestigatorService().investigate(caseRef);
    return NextResponse.json(
      { ...result, providerWrite: false, financialAuthority: "DETERMINISTIC_ENGINE_ONLY" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
