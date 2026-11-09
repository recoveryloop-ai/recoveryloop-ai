import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { readWorkspaceData } from "@/server/modules/demo/workspace-data";
import { formatMoney, money } from "@/shared/money";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const { summary, cases } = await readWorkspaceData();
  return (
    <AppShell active="/app">
      <header className="workspace-header s7-header">
        <div><p className="eyebrow">Live sandbox ledger</p><h1>Recovery command</h1><p>One accountable view of payment, fulfillment, obligation, and remedy.</p></div>
        <Link className="button primary compact" href="/app/cases/RG-2048">Open reference case <span>→</span></Link>
      </header>
      <section className="metric-grid s7-metrics" aria-label="Ledger overview">
        <article><span>Canonical orders</span><strong>{summary.order_count}</strong><small>Persisted merchant records</small></article>
        <article><span>Open obligation</span><strong>{formatMoney(money(summary.open_obligation_minor))}</strong><small>Policy-derived, not cash moved</small></article>
        <article><span>Verified refunds</span><strong>{formatMoney(money(summary.refunded_minor))}</strong><small>PayPal sandbox read-back</small></article>
        <article><span>Closed actions</span><strong>{summary.verified_actions}</strong><small>Durable audit certificate</small></article>
      </section>
      <section className="panel s7-panel">
        <div className="section-heading"><div><p className="eyebrow">Priority queue</p><h2>Cases requiring context</h2></div><Link className="quiet-link" href="/app/cases">View all cases →</Link></div>
        <div className="data-list">
          {cases.slice(0, 5).map((item) => <Link className="data-row" href={`/app/cases/${item.external_ref}`} key={item.external_ref}>
            <span className="case-monogram">{item.external_ref.slice(-2)}</span><span><strong>{item.external_ref}</strong><small>{item.kind.replaceAll("_", " ")} · {item.order_ref}</small></span>
            <span className={`state-chip ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span>
          </Link>)}
        </div>
      </section>
    </AppShell>
  );
}
