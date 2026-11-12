import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperator } from "@/server/auth/require-operator";
import { ZaiInvestigatorProvider } from "@/server/adapters/ai/zai-investigator-provider";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { AppError } from "@/server/http/app-error";
import { assertCaseMerchant, createInternalTask, overrideInternalTask, readInternalTasks } from "@/server/modules/casework/task-gateway";
import { loadCaseworkContext } from "@/server/modules/casework/scenarios";
import { investigateCasework } from "@/server/modules/casework/investigator";
import { persistCaseworkRun } from "@/server/modules/casework/service";
export const dynamic = "force-dynamic";
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("investigate") }).strict(),
  z.object({ action: z.literal("record_task"), runId: z.uuid() }).strict(),
  z.object({ action: z.literal("override"), taskId: z.uuid(), revision: z.number().int().nonnegative(), reason: z.enum(["OPERATOR_REVIEW_REQUIRED", "EVIDENCE_CHANGED", "TASK_NOT_APPLICABLE"]) }).strict(),
]);
export async function POST(request: Request, { params }: {
  params: Promise<{
    id: string;
  }>;
}) {
  const authorization = await requireOperator(request);
  if (!authorization.authorized)
    return NextResponse.json({ code: authorization.code }, { status: authorization.status, headers: { "Cache-Control": "private, no-store" } });
  try {
    assertTrustedOrigin(request);
    const { id } = await params;
    const caseRef = z.string().regex(/^RG-\d{4,10}$/).parse(id);
    const body = bodySchema.parse(await request.json());
    const url = process.env.DATABASE_URL ?? "";
    await assertCaseMerchant(url, caseRef, authorization.principalId);
    if (body.action === "override")
      return NextResponse.json({ task: await overrideInternalTask(url, caseRef, authorization.principalId, body.taskId, body.revision, body.reason), providerWrite: false }, { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "record_task")
      return NextResponse.json({ task: await createInternalTask(url, caseRef, authorization.principalId, body.runId), providerWrite: false }, { headers: { "Cache-Control": "private, no-store" } });
    const context = await loadCaseworkContext(url, caseRef);
    const provider = new ZaiInvestigatorProvider({ apiKey: process.env.ZAI_API_KEY ?? "", model: process.env.ZAI_MODEL ?? "", baseUrl: process.env.ZAI_BASE_URL ?? "" });
    const run = await investigateCasework(context, provider, () => loadCaseworkContext(url, caseRef));
    const runId = await persistCaseworkRun(url, context, run);
    if (run.mode === "FRESH_VALIDATED" && !runId)
      throw new AppError("STALE_CASE_INPUT", 409);
    const task = runId ? await createInternalTask(url, caseRef, authorization.principalId, runId) : null;
    return NextResponse.json({ run: { ...run, id: runId }, task, providerWrite: false, financialAuthority: "DETERMINISTIC_ENGINE_ONLY" }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) {
    return routeErrorResponse(error);
  }
}
export async function GET(request: Request, { params }: {
  params: Promise<{
    id: string;
  }>;
}) {
  const authorization = await requireOperator(request);
  if (!authorization.authorized)
    return NextResponse.json({ code: authorization.code }, { status: authorization.status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const { id } = await params;
    const caseRef = z.string().regex(/^RG-\d{4,10}$/).parse(id);
    const tasks = await readInternalTasks(process.env.DATABASE_URL ?? "", caseRef, authorization.principalId);
    return NextResponse.json({ tasks, providerWrite: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) {
    return routeErrorResponse(error);
  }
}
