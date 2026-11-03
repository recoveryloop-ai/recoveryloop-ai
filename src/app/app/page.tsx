import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { formatMoney, money } from "@/shared/money";

const fixtureCards = [
  { id: "F01", label: "Clean delivery", state: "Resolved", source: "Synthetic fixture", amount: 0 },
  { id: "F02", label: "Return to sender", state: "Needs review", source: "EasyPost test · synthetic item mapping", amount: 10_000 },
  { id: "F03", label: "Already refunded", state: "Protected", source: "Synthetic fixture", amount: 0 },
  { id: "F04", label: "Refund pending", state: "Monitoring", source: "Synthetic fixture", amount: 10_000 },
  { id: "F05", label: "Independent item", state: "Needs review", source: "Synthetic fixture", amount: 3_000 },
] as const;

export default function CommandCenterPage() {
  return (
    <AppShell active="/app">
      <header className="workspace-header">
        <div><p className="eyebrow">Loop Devices · Demo merchant</p><h1>Command center</h1><p>Foundation records for five deterministic recovery scenarios.</p></div>
        <Link className="button secondary compact" href="/store">Inspect order total</Link>
      </header>
      <section className="metric-grid" aria-label="Fixture overview">
        <article><span>Seeded orders</span><strong>5</strong><small>F01–F05 loaded</small></article>
        <article><span>Open obligations</span><strong>{formatMoney(money(13_000))}</strong><small>Policy-derived, not cash moved</small></article>
        <article><span>Currency</span><strong>USD</strong><small>Mixed currency rejected</small></article>
      </section>
      <section className="panel scenario-panel">
        <div className="section-heading"><div><p className="eyebrow">Fixture ledger</p><h2>Recovery scenarios</h2></div><span className="status-pill muted">Mixed test provenance</span></div>
        <div className="scenario-list">
          {fixtureCards.map((fixture) => (
            <article className="scenario-row" key={fixture.id}>
              <span className="fixture-id">{fixture.id}</span>
              <div><strong>{fixture.label}</strong><small>{fixture.state} · {fixture.source}</small></div>
              {fixture.id === "F02" ? <Link className="amount attention" href="/app/cases/RG-2048">Open case →</Link> : <span className={fixture.amount ? "amount attention" : "amount"}>{fixture.amount ? formatMoney(money(fixture.amount)) : "No action"}</span>}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
