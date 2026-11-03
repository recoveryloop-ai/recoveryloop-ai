import { NextResponse } from "next/server";

import { requireOperator } from "@/server/auth/require-operator";
import { routeErrorResponse } from "@/server/http/route-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authorization = await requireOperator(request);
    if (!authorization.authorized) {
      return NextResponse.json(
        { code: authorization.code, message: "Operator access is required.", retryable: false, correlation_id: crypto.randomUUID() },
        { status: authorization.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ready",
        scope: "s5-complete",
        role: authorization.role,
        providers: {
          database: "configured",
          payments: "sandbox-only",
          ai: "zai",
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
