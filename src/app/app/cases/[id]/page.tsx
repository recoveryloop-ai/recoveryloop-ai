import Link from "next/link";
import { AppError } from "@/server/http/app-error";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { CaseWorkspace } from "@/components/case-workspace";
import { InvestigationPanel } from "@/components/investigation-panel";
import { OperatorCasework } from "@/components/operator-casework";
import { requireOperator } from "@/server/auth/require-operator";
import { readLatestInvestigation } from "@/server/modules/investigation/investigator-service";
import { readCaseWorkspace } from "@/server/modules/casework/service";
import type { CaseWorkspace as WorkspaceData } from "@/server/modules/casework/contracts";
import type { InvestigationResult } from "@/server/modules/investigation/contracts";
import type { AuthorizationResult } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^RG-\d{4,10}$/.test(id)) notFound();
  let workspace: WorkspaceData;
  let latest: InvestigationResult | null;
  let authorization: AuthorizationResult;
  try {
    [workspace, latest, authorization] = await Promise.all([
      readCaseWorkspace(process.env.DATABASE_URL ?? "", id),
      readLatestInvestigation(process.env.DATABASE_URL ?? "", id),
      requireOperator(),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    return <AppShell active="/app/cases"><section className="panel s7-panel"><h1>Case evidence unavailable</h1><p>The stored records could not be loaded. No changes or provider writes were made.</p><Link className="button secondary" href={`/app/cases/${id}`}>Retry this case</Link></section></AppShell>;
  }

  return (
    <AppShell active="/app/cases">
      <CaseWorkspace caseRef={id} initial={workspace} />
      {authorization.authorized ? <OperatorCasework caseRef={id} /> : null}
      <details className="accepted-investigation">
        <summary>Accepted v1 investigation · Investigation</summary>
        <p>Stored canonical v1 baseline. Synthetic challenges affect the case workspace above.</p>
        <InvestigationPanel caseRef={id} initial={latest} canRun={authorization.authorized} />
      </details>
    </AppShell>
  );
}
