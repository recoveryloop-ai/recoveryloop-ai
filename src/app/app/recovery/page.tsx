import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { readCaseObligation } from "@/server/modules/obligations/obligation-graph-service";
import { formatMoney, money } from "@/shared/money";

export const dynamic = "force-dynamic";
export default async function RecoveryPage() {
  const obligation = await readCaseObligation(process.env.DATABASE_URL ?? "", "RG-2048");
  return <AppShell active="/app/recovery"><header className="workspace-header s7-header"><div><p className="eyebrow">Case RG-2048</p><h1>Recovery map</h1><p>The deterministic path from evidence to an eligible customer remedy.</p></div><Link className="button secondary compact" href="/app/demo">Open what-if lab</Link></header>
    <section className="recovery-flow" aria-label="Recovery decision flow"><article><span>01</span><small>Signal</small><strong>Return to sender</strong><em>EasyPost test</em></article><i>→</i><article><span>02</span><small>Obligation</small><strong>{formatMoney(money(obligation.outstandingMinor))}</strong><em>Policy v1</em></article><i>→</i><article><span>03</span><small>Safeguard</small><strong>{obligation.decision}</strong><em>{obligation.reasonCodes.join(" · ")}</em></article><i>→</i><article><span>04</span><small>Proposed remedy</small><strong>{formatMoney(money(obligation.proposedRefundMinor))}</strong><em>Simulation only</em></article></section>
    <section className="panel s7-panel map-note"><div><p className="eyebrow">Authority boundary</p><h2>AI explains. Policy decides. Operators execute.</h2></div><p>Public flows may alter synthetic evidence overlays, but they cannot mutate payment, refund, allocation, action, or certificate records.</p></section>
  </AppShell>;
}
