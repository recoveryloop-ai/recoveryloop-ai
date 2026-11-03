import { NextResponse } from "next/server";
import { z } from "zod";

import { routeErrorResponse } from "@/server/http/route-error";
import { readCaseObligation } from "@/server/modules/obligations/obligation-graph-service";
import { runCounterfactual, simulationOptions } from "@/server/modules/simulation/counterfactual-engine";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ option: z.enum(simulationOptions) }).strict();
const caseRefSchema = z.string().regex(/^RG-\d{4,10}$/);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const caseRef = caseRefSchema.parse(id);
    const body = requestSchema.parse(await request.json());
    const obligation = await readCaseObligation(process.env.DATABASE_URL ?? "", caseRef);
    const simulation = runCounterfactual(obligation, body.option);

    return NextResponse.json(
      {
        case_ref: caseRef,
        mode: "SIMULATION_ONLY",
        provider_write: false,
        obligation,
        simulation,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
