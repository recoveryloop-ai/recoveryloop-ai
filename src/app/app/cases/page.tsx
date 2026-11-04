import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { readWorkspaceData } from "@/server/modules/demo/workspace-data";

export const dynamic = "force-dynamic";
export default async function CasesPage() {
  const { cases } = await readWorkspaceData();
  return <AppShell active="/app/cases"><header className="workspace-header s7-header"><div><p className="eyebrow">Evidence queue</p><h1>Cases</h1><p>Deterministic status with transparent source provenance.</p></div><span className="status-pill">{cases.length} canonical records</span></header>
    <section className="panel s7-panel"><div className="table-shell"><table className="s7-table"><thead><tr><th>Case</th><th>Order</th><th>Signal</th><th>Source</th><th>Status</th></tr></thead><tbody>{cases.map((item) => <tr key={item.external_ref}><td><Link className="table-link" href={`/app/cases/${item.external_ref}`}>{item.external_ref}</Link></td><td>{item.order_ref}</td><td>{item.kind.replaceAll("_", " ")}</td><td><span className="source-label">{item.source_tier.replaceAll("_", " ")}</span></td><td><span className={`state-chip ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div></section>
  </AppShell>;
}
