import { NextResponse } from "next/server";
import { z } from "zod";

import { routeErrorResponse } from "@/server/http/route-error";
import { createRefundActionService } from "@/server/modules/refunds/service-factory";

export const dynamic = "force-dynamic";

const caseRefSchema = z.string().regex(/^RG-\d{4,10}$/);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const certificate = await createRefundActionService().getCertificate(caseRefSchema.parse(id));
    return NextResponse.json(certificate, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
