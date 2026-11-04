import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { readWorkspaceData } from "@/server/modules/demo/workspace-data";
import { formatMoney, money } from "@/shared/money";

export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  const { orders } = await readWorkspaceData();
  return <AppShell active="/app/orders"><header className="workspace-header s7-header"><div><p className="eyebrow">Commerce graph</p><h1>Orders</h1><p>Order totals and payment state from the canonical ledger.</p></div></header>
    <section className="order-card-grid">{orders.map((order) => <article className="panel s7-panel order-card" key={order.id}><div><span className="source-label">{order.fixture_key ?? "LIVE SANDBOX"}</span><h2>{order.external_ref}</h2><p>{order.item_count} item{order.item_count === 1 ? "" : "s"} · {order.status.replaceAll("_", " ")}</p></div><div><strong>{formatMoney(money(order.total_minor))}</strong><small>{order.capture_status ?? "No capture"}</small></div>{order.capture_status ? <Link className="quiet-link" href={`/app/orders/${order.id}`}>Verified receipt →</Link> : <span className="quiet-text">Synthetic fixture</span>}</article>)}</section>
  </AppShell>;
}
