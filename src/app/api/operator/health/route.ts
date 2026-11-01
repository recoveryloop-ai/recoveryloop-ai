import { NextResponse } from "next/server";

import { requireOperator } from "@/server/auth/require-operator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireOperator(request);
  if (!authorization.authorized) {
    return NextResponse.json(
      { code: authorization.code, message: "Operator access is required.", retryable: false },
      { status: authorization.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      status: "ready",
      scope: "s1-foundation",
      role: authorization.role,
      providers: {
        database: "configured",
        payments: "sandbox-only",
        ai: "zai",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
