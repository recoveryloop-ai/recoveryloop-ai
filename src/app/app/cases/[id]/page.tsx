import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { InvestigationPanel } from "@/components/investigation-panel";
import { readLatestInvestigation } from "@/server/modules/investigation/investigator-service";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^RG-\d{4,10}$/.test(id)) notFound();
  let latest;
  try {
    latest = await readLatestInvestigation(process.env.DATABASE_URL ?? "", id);
  } catch {
    notFound();
  }

  return (
    <AppShell active="/app/cases">
      <header className="workspace-header">
        <div><p className="eyebrow">Case {id}</p><h1>Investigation</h1><p>Read-only AI narrative grounded in stored evidence and deterministic policy.</p></div>
        <div className="header-actions"><span className="status-pill"><span className="pulse-dot" /> No provider writes</span><Link className="button secondary compact" href="/app/recovery">Open recovery map →</Link></div>
      </header>
      <InvestigationPanel caseRef={id} initial={latest} />
    </AppShell>
  );
}
