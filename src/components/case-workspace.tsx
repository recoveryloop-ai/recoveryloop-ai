"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CaseWorkspace as WorkspaceData, CaseworkScenario } from "@/server/modules/casework/contracts";
import { formatMoney, money } from "@/shared/money";
import "@/app/case-workspace.css";

const scenarios: { id: CaseworkScenario; label: string }[] = [
  { id: "BASELINE", label: "Baseline · return to sender" },
  { id: "ALREADY_REFUNDED", label: "Already refunded" },
  { id: "CONTRADICTORY_DELIVERY", label: "Contradictory delivery" },
  { id: "PENDING_REFUND", label: "Pending / unknown refund" },
  { id: "DAMAGED_ITEM", label: "Damaged item" },
  { id: "NOT_RECEIVED", label: "Delivered, buyer says not received" },
  { id: "DISPUTE_INQUIRY", label: "Dispute evidence inquiry" },
  { id: "ENTITY_REVIEW", label: "Fictional identity review" },
];
const moneyBuckets = [
  ["capturedMinor", "Captured"], ["completedRefundMinor", "Completed refund"],
  ["pendingReservationMinor", "Pending reservation"], ["obligationMinor", "Policy obligation"],
  ["proposedRemedyMinor", "Proposed remedy"], ["hypotheticalRecoveryMinor", "Hypothetical carrier recovery"],
] as const;
const pretty = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function CaseWorkspace({ caseRef, initial }: { caseRef: string; initial: WorkspaceData }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/demo/casework?case=${encodeURIComponent(caseRef)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Case evidence could not be refreshed. Try again.");
    setData(await response.json() as WorkspaceData);
  }, [caseRef]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/demo/casework?case=${encodeURIComponent(caseRef)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The case session could not be opened. Reload to try again.");
        return await response.json() as WorkspaceData;
      })
      .then((workspace) => { if (active) setData(workspace); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Case unavailable."); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [caseRef]);

  async function changeScenario(scenario: CaseworkScenario) {
    setBusy(true); setError("");
    try {
      const reset = scenario === "BASELINE";
      const response = await fetch(reset ? "/api/demo/reset" : "/api/demo/overlay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        ...(!reset ? { body: JSON.stringify({ scenario }) } : {}),
      });
      if (!response.ok) throw new Error("That synthetic challenge was rejected. Your current case view is unchanged.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the case."); }
    finally { setBusy(false); }
  }

  const citedIds = useMemo(() => new Set(data.run.output.findings.flatMap((finding) => finding.evidence_ids)), [data.run.output.findings]);
  const cited = data.evidence.filter((record) => citedIds.has(record.id));
  const newestTimeline = [...data.timeline].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const olderTimeline = newestTimeline.slice(4);
  const modelState = data.run.mode === "STORED_VALIDATED" ? "Stored validated run" : data.run.mode === "RULES_ONLY" ? "Rules-only result" : "Fresh validated run";
  const title = pretty(data.run.output.issue);

  return <div className="case-workspace" aria-busy={busy || refreshing}>
    <header className="cw-header">
      <div><p className="cw-kicker">{data.caseRef} <span>·</span> Order {data.orderRef}</p><h1>{title}</h1><p>One item, its evidence trail, and the next safe step.</p></div>
      <div className="cw-header-status"><span className="cw-safe"><i /> No provider writes</span><Link className="button secondary compact" href={`/app/recovery?case=${encodeURIComponent(caseRef)}`}>Open recovery map →</Link><Link className="button primary compact cw-certificate-primary" href={data.certificate.href}>View verified certificate · RG-2052</Link></div>
    </header>

    <section className="cw-item" aria-labelledby="cw-item-heading">
      <div className="cw-item-mark" aria-hidden="true">{data.item.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>
      <div className="cw-item-copy"><p className="cw-label">Affected item</p><h2 id="cw-item-heading">{data.item.name}</h2><p>{data.item.sku} <span>·</span> Source: {data.item.source}</p></div>
      <div className="cw-state"><span>Latest state</span><strong>{pretty(data.item.state)}</strong></div>
      <div className="cw-claim"><span>Buyer claim</span><p>{data.buyerClaim}</p></div>
    </section>

    {data.caseRef === "RG-2048" ? <section className="cw-challenge" aria-labelledby="cw-challenge-heading"><div><p className="cw-label">Synthetic evidence challenge</p><h2 id="cw-challenge-heading">See how this case changes</h2><p>Changes are isolated to this browser session. The refreshed server projection is the source of every displayed result.</p></div><div className="cw-challenge-controls"><label htmlFor="cw-scenario">Choose a scenario</label><select id="cw-scenario" value={data.scenario} disabled={busy || refreshing} onChange={(event) => void changeScenario(event.target.value as CaseworkScenario)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select><button className="button secondary compact" disabled={busy || refreshing || data.scenario === "BASELINE"} onClick={() => void changeScenario("BASELINE")} type="button">{busy ? "Refreshing case…" : "Reset to baseline"}</button></div></section> : null}

    <section className="cw-section cw-money" aria-labelledby="cw-money-heading">
      <div className="cw-section-title"><div><p className="cw-label">USD · case financials</p><h2 id="cw-money-heading">Payment and remedy</h2></div><span className="cw-source-note">{data.money.source}</span></div>
      <div className="cw-bucket-grid">{moneyBuckets.map(([key, label]) => <div className="cw-bucket" key={key}><span>{label}</span><strong>{formatMoney(money(data.money[key]))}</strong></div>)}</div>
      <p className="cw-money-note">Completed cash, pending reservations, policy obligations, proposed remedies and hypothetical recovery are distinct amounts.</p>
    </section>

    <div className="cw-columns">
      <section className="cw-section cw-timeline" aria-labelledby="cw-timeline-heading">
        <div className="cw-section-title"><div><p className="cw-label">Evidence trail</p><h2 id="cw-timeline-heading">What happened</h2></div><span className="cw-count">{data.timeline.length} records</span></div>
        {data.timeline.length ? <><ol>{newestTimeline.slice(0, 4).map((entry) => <li key={`${entry.id}-${entry.observedAt}`}><i aria-hidden="true" /><div><strong>{entry.label}</strong><p>{entry.source}</p><time dateTime={entry.observedAt}>{new Date(entry.observedAt).toLocaleString()}</time></div></li>)}</ol>{olderTimeline.length ? <details className="cw-older-timeline"><summary>Earlier records · {olderTimeline.length}</summary><ol>{olderTimeline.map((entry) => <li key={`${entry.id}-${entry.observedAt}`}><i aria-hidden="true" /><div><strong>{entry.label}</strong><p>{entry.source}</p><time dateTime={entry.observedAt}>{new Date(entry.observedAt).toLocaleString()}</time></div></li>)}</ol></details> : null}</> : <p className="cw-muted">No timeline records are available for this case.</p>}
      </section>

      <section className="cw-section cw-decision" aria-labelledby="cw-decision-heading">
        <div className="cw-section-title"><div><p className="cw-label">Bounded investigation</p><h2 id="cw-decision-heading">Investigation & policy</h2></div><span className={data.run.mode === "RULES_ONLY" ? "cw-mode cw-mode-rules" : "cw-mode"}>{data.run.mode}</span></div>
        <div className="cw-decision-result"><span>{data.run.mode === "RULES_ONLY" ? "Rules-selected issue" : "AI-classified issue"}</span><strong>{pretty(data.run.output.issue)}</strong><span>{data.run.mode === "RULES_ONLY" ? "Rules-only next step" : "AI nonfinancial decision"}</span><strong>{pretty(data.run.output.outcome)}</strong><span>Confidence</span><strong>{pretty(data.run.output.confidence)}</strong></div>
        <div className="cw-policy"><div><span>Deterministic policy · {data.policy.version}</span><strong>{pretty(data.policy.decision)}</strong></div><p>{data.policy.reasons.map(pretty).join(" · ") || "No additional policy reason recorded."}</p><small>Policy owns any proposed amount. The model cannot set money or execute a provider action.</small></div>
        <details className="cw-provenance"><summary>Run provenance and cited records</summary>
          <dl><div><dt>Run type</dt><dd>{modelState} · no fresh public model call</dd></div><div><dt>Model / version</dt><dd>{data.run.model ?? "None · deterministic rules"} / {data.run.promptVersion}</dd></div><div><dt>Recorded at</dt><dd>{data.run.createdAt ? new Date(data.run.createdAt).toLocaleString() : "Rules-only projection"}</dd></div><div><dt>Run ID</dt><dd>{data.run.id ?? "No stored run"}</dd></div><div><dt>Validation</dt><dd>{data.run.validationCode}</dd></div></dl>
          <details className="cw-hash-details"><summary>Full evidence hash</summary><code>{data.run.evidenceHash}</code></details>
          <h3>Model-selected read-only tools</h3>{data.run.toolLog.length ? <ul>{data.run.toolLog.map((tool, index) => <li key={`${tool.toolName}-${index}`}><strong>{tool.toolName}</strong><span>Selected by {tool.initiatedBy === "MODEL" ? "model" : "orchestrator"}</span><details className="cw-hash-details"><summary>Tool argument and result hashes</summary><span>Arguments: <code>{tool.argumentsHash}</code></span><span>Result: <code>{tool.responseHash}</code></span></details></li>)}</ul> : <p className="cw-muted">No tool calls are attached to this {data.run.mode === "RULES_ONLY" ? "rules-only result" : "stored run"}.</p>}
          <h3>Cited stored evidence</h3>{cited.length ? <div className="cw-citations">{cited.map((record) => <details key={record.id}><summary>{record.provider} · {record.sourceTier} <span>{record.id}</span></summary><dl><div><dt>Observed</dt><dd>{new Date(record.observedAt).toLocaleString()}</dd></div><div><dt>Evidence ID</dt><dd><code>{record.id}</code></dd></div><div><dt>Stored facts</dt><dd><code>{JSON.stringify(record.facts)}</code></dd></div></dl></details>)}</div> : <p className="cw-muted">No current evidence IDs were cited by this run.</p>}
        </details>
      </section>
    </div>

    <section className="cw-section cw-work" aria-labelledby="cw-work-heading">
      <div className="cw-section-title"><div><p className="cw-label">Prepared from this evidence</p><h2 id="cw-work-heading">Work product <span>{data.workProduct.status}</span></h2></div></div>
      <p className="cw-brief">{data.workProduct.brief}</p>
      <div className="cw-work-grid"><div><h3>Evidence checklist</h3><ul>{data.workProduct.checklist.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Draft buyer request</h3><blockquote>{data.workProduct.draftRequest}</blockquote></div><div><details className="cw-bundle"><summary><strong>Evidence bundle · draft</strong><span>{data.workProduct.evidenceBundle.length} stored records</span></summary><ul>{data.workProduct.evidenceBundle.map((record) => <li key={record.id}><strong>{record.source}</strong><code>{record.id}</code><time dateTime={record.observedAt}>{new Date(record.observedAt).toLocaleString()}</time></li>)}</ul></details></div></div>
      <p className="cw-draft-note">{data.workProduct.caveat} Nothing here is sent or submitted.</p>
    </section>

    {error ? <p className="cw-error" role="alert">{error}<button type="button" onClick={() => { setError(""); setRefreshing(true); void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Refresh failed.")).finally(() => setRefreshing(false)); }}>Retry refresh</button></p> : null}
    <p className="cw-verification">Separate outcome proof: <Link href={data.certificate.href}>{data.certificate.label} ↗</Link></p>
    <div className="cw-live-status" role="status" aria-live="polite">{busy ? "Updating synthetic case projection…" : refreshing ? "Loading current session projection…" : "Case projection current."}</div>
  </div>;
}
