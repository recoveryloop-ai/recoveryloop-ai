import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createRefundActionService } from "@/server/modules/refunds/service-factory";
import { formatMoney, money } from "@/shared/money";

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let certificate: Record<string, unknown>;
  try { certificate = await createRefundActionService().getCertificate(id); } catch { notFound(); }
  const value = (key: string) => typeof certificate[key] === "string" ? certificate[key] as string : "—";
  const amount = (key: string) => typeof certificate[key] === "number" ? formatMoney(money(certificate[key] as number)) : "—";
  return <AppShell active="/app/actions"><div className="certificate-toolbar"><Link className="quiet-link" href="/app/actions">← Action center</Link><span className="status-pill">Print-ready layout</span></div><article className="certificate-sheet">
    <header><div><p className="eyebrow">RecoveryLoop audit proof</p><h1>Sandbox recovery certificate</h1></div><span className="certificate-seal">VERIFIED<br />SANDBOX</span></header>
    <p className="certificate-intro">A redacted, durable record that a customer obligation was closed only after independent PayPal Sandbox read-back.</p>
    <section className="certificate-amount"><span>Verified customer refund</span><strong>{amount("refundAmountMinor")}</strong><small>USD · sandbox funds only</small></section>
    <dl className="certificate-grid"><div><dt>Case</dt><dd>{value("caseRef")}</dd></div><div><dt>Order</dt><dd>{value("orderRef")}</dd></div><div><dt>Provider</dt><dd>{value("provider")}</dd></div><div><dt>Refund status</dt><dd>{value("refundStatus")}</dd></div><div><dt>Capture amount</dt><dd>{amount("captureAmountMinor")}</dd></div><div><dt>Capture status</dt><dd>{value("captureStatus")}</dd></div><div><dt>Capture ID</dt><dd>{value("captureId")}</dd></div><div><dt>Refund ID</dt><dd>{value("refundId")}</dd></div><div><dt>Obligation balance</dt><dd>{amount("obligationBalanceMinor")}</dd></div><div><dt>Policy</dt><dd>{value("policyVersion")}</dd></div></dl>
    <section className="certificate-hash"><span>Certificate hash</span><code>{value("certificateHash")}</code><small>Issued {value("issuedAt")}</small></section>
    <footer><strong>PROVIDER_VERIFIED</strong><p>{value("disclaimer")}</p></footer>
  </article></AppShell>;
}
