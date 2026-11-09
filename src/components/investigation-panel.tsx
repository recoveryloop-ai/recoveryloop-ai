"use client";

import { useState } from "react";

import type { InvestigationResult } from "@/server/modules/investigation/contracts";
import { formatMoney, money } from "@/shared/money";

export function InvestigationPanel({ caseRef, initial, canRun = false }: {
  readonly caseRef: string;
  readonly initial: InvestigationResult | null;
  readonly canRun?: boolean;
}) {
  const [result, setResult] = useState(initial);
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState("");

  async function runInvestigation() {
    setState("running");
    setMessage("");
    try {
      const response = await fetch(`/api/cases/${caseRef}/investigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai" }),
      });
      const payload = await response.json() as InvestigationResult & { code?: string };
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("Operator sign-in is required to run Z.ai.");
        throw new Error(payload.code ?? "INVESTIGATION_FAILED");
      }
      setResult(payload);
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Investigation failed.");
      setState("error");
    }
  }

  if (!result) {
    return (
      <section className="panel investigation-empty">
        <p className="eyebrow">Evidence-grounded investigator</p>
        <h2>No investigation has been recorded yet</h2>
        <p>An authenticated operator can run the bounded Z.ai investigator. Financial decisions remain deterministic.</p>
        <button className="button primary compact" disabled={!canRun || state === "running"} onClick={runInvestigation} type="button">
          {state === "running" ? "Investigating…" : "Run investigation"}
        </button>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
      </section>
    );
  }

  const citedIds = new Set(result.output.findings.flatMap((finding) => finding.evidence_ids));
  const citedEvidence = result.evidence.filter((record) => citedIds.has(record.id));

  return (
    <div className="investigation-layout">
      <section className="panel investigation-report">
        <div className="section-heading">
          <div><p className="eyebrow">Evidence-grounded investigator</p><h2>Case narrative</h2></div>
          <span className={result.status === "VALIDATED" ? "status-pill" : "status-pill muted"}>
            {result.source === "ZAI_VALIDATED" ? "Z.ai validated" : "Rules-only fallback"}
          </span>
        </div>
        <p className="investigation-summary">{result.output.summary}</p>
        <div className="finding-list">
          {result.output.findings.map((finding, index) => (
            <article key={`${finding.type}-${index}`}>
              <strong>{finding.type.replaceAll("_", " ")}</strong>
              <span>{finding.certainty} · {finding.evidence_ids.length} cited record{finding.evidence_ids.length === 1 ? "" : "s"}</span>
            </article>
          ))}
        </div>
        <div className="ai-boundary">
          <span>AI suggestion</span><strong>{result.output.proposed_action_type.replaceAll("_", " ")}</strong>
          <small>No amount or provider action is authorized by the model.</small>
        </div>
        <p className="investigation-caveat">{result.output.caveat}</p>
        <button className="button secondary compact" disabled={!canRun || state === "running"} onClick={runInvestigation} type="button">
          {!canRun ? "Operator sign-in required for fresh AI" : state === "running" ? "Investigating…" : "Run fresh investigation"}
        </button>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
      </section>

      <aside className="investigation-side">
        <section className="panel deterministic-card">
          <p className="eyebrow">Deterministic truth</p>
          <strong>{result.deterministic.decision}</strong>
          <span>{formatMoney(money(result.deterministic.proposedRefundMinor))} simulated policy amount</span>
          <small>{result.deterministic.reasonCodes.join(" · ")}</small>
        </section>
        <section className="panel evidence-drawer">
          <div><p className="eyebrow">Provenance drawer</p><h2>Cited evidence</h2></div>
          {citedEvidence.map((record) => (
            <details key={record.id}>
              <summary><span>{record.provider}</span><small>{record.sourceTier}</small></summary>
              <dl>
                <div><dt>Record</dt><dd>{record.id}</dd></div>
                <div><dt>Observed</dt><dd>{new Date(record.observedAt).toLocaleString()}</dd></div>
                <div><dt>Safe fields</dt><dd><code>{JSON.stringify(record.facts)}</code></dd></div>
              </dl>
            </details>
          ))}
        </section>
      </aside>
    </div>
  );
}
