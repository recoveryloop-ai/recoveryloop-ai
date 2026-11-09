import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { requireOperator } from "@/server/auth/require-operator";
import { createDatabase } from "@/server/db/client";
import { isUuid } from "@/shared/identifiers";
import { formatMoney, money } from "@/shared/money";
import { toIsoTimestamp } from "@/shared/timestamp";

export const dynamic = "force-dynamic";

function maskProviderId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 4)}••••${value.slice(-6)}`;
}

export default async function OrderReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireOperator();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  if (!authorization.authorized) {
    const { client: publicClient } = createDatabase(process.env.DATABASE_URL ?? "");
    let caseRef: string | undefined;
    try {
      const [row] = await publicClient<{ external_ref: string }[]>`select cs.external_ref from cases cs join orders o on o.id = cs.order_id where o.id = ${id} and cs.external_ref ~ '^RG-[0-9]{4,10}$' order by cs.created_at limit 1`;
      caseRef = row?.external_ref;
    } finally { await publicClient.end(); }
    if (caseRef) redirect(`/app/cases/${caseRef}`);
    // Public order list remains available when no case exists; provider receipt stays protected.
    redirect("/app/orders");
  }
  const { client } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const [receipt] = await client<{
      order_id: string;
      external_ref: string;
      order_status: string;
      total_minor: number;
      paypal_order_id: string;
      paypal_status: string;
      provider_capture_id: string | null;
      capture_status: string | null;
      captured_minor: number | null;
      verified_at: Date | string | null;
    }[]>`select o.id as order_id, o.external_ref, o.status as order_status, o.total_minor,
      po.paypal_order_id, po.status as paypal_status, c.provider_capture_id, c.status as capture_status,
      c.captured_minor, c.verified_at
      from orders o
      join users u on u.merchant_id = o.merchant_id and u.auth_subject = ${authorization.principalId}
      join paypal_orders po on po.order_id = o.id
      left join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
      where o.id = ${id} limit 1`;
    if (!receipt) notFound();
    return (
      <AppShell active="/store">
        <header className="workspace-header"><div><p className="eyebrow">Provider-verified receipt</p><h1>Sandbox payment</h1><p>PayPal capture and independent read-back persisted to the canonical ledger.</p></div><span className="provider-badge">PayPal sandbox · verified</span></header>
        <section className="receipt-panel">
          <div className="receipt-total"><span>Captured amount</span><strong>{formatMoney(money(receipt.captured_minor ?? receipt.total_minor))}</strong><small>USD · sandbox funds only</small></div>
          <dl className="receipt-grid">
            <div><dt>Local order</dt><dd>{receipt.external_ref}</dd></div>
            <div><dt>Ledger status</dt><dd>{receipt.order_status}</dd></div>
            <div><dt>PayPal order ID</dt><dd>{maskProviderId(receipt.paypal_order_id)}</dd></div>
            <div><dt>PayPal order status</dt><dd>{receipt.paypal_status}</dd></div>
            <div><dt>Capture ID</dt><dd>{receipt.provider_capture_id ? maskProviderId(receipt.provider_capture_id) : "Not captured"}</dd></div>
            <div><dt>Capture status</dt><dd>{receipt.capture_status ?? "Not captured"}</dd></div>
            <div><dt>Verified at</dt><dd>{toIsoTimestamp(receipt.verified_at) ?? "Awaiting read-back"}</dd></div>
            <div><dt>Source tier</dt><dd>PROVIDER_VERIFIED</dd></div>
          </dl>
          <Link className="button secondary" href="/store">Return to demo store</Link>
        </section>
      </AppShell>
    );
  } finally {
    await client.end();
  }
}
