import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireOperator } from "@/server/auth/require-operator";
import { readWorkspaceData } from "@/server/modules/demo/workspace-data";
import { formatMoney, money } from "@/shared/money";

export const dynamic = "force-dynamic";
export default async function ActionsPage() {
  const [authorization, data] = await Promise.all([requireOperator(), readWorkspaceData()]);
  return <AppShell active="/app/actions"><header className="workspace-header s7-header"><div><p className="eyebrow">Operator control plane</p><h1>Action center</h1><p>Provider writes require an authenticated operator, fresh approval snapshot, and explicit confirmation.</p></div><span className={authorization.authorized ? "operator-pill" : "status-pill muted"}>{authorization.authorized ? "Operator authorized" : "Public read-only view"}</span></header>
    {!authorization.authorized ? <section className="access-banner"><div><strong>Money controls are locked</strong><p>Anonymous visitors can inspect status, but cannot propose, approve, execute, or reconcile a refund.</p></div><Link className="button primary compact" href="/login">Operator sign in</Link></section> : null}
    <section className="panel s7-panel"><div className="section-heading"><div><p className="eyebrow">Durable action ledger</p><h2>Sandbox remedies</h2></div></div><div className="data-list">{data.actions.map((action) => <article className="data-row" key={action.id}><span className="case-monogram">$</span><span><strong>{action.case_ref} · {formatMoney(money(action.amount_minor))}</strong><small>{action.provider_resource_id ? "Provider resource redacted" : "Awaiting provider resource"} · {authorization.authorized ? "operator view" : "public preview"}</small></span><span className={`state-chip ${action.state.toLowerCase()}`}>{action.state.replaceAll("_", " ")}</span></article>)}</div></section>
  </AppShell>;
}
