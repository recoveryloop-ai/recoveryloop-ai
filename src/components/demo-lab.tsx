"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { DemoProjection } from "@/server/modules/demo/demo-projection";
import { formatMoney, money } from "@/shared/money";

type DemoState = DemoProjection & { session: { expiresAt: string } };

function formatSignedMoney(minor: number): string {
  const absolute = formatMoney(money(Math.abs(minor)));
  return minor < 0 ? `−${absolute}` : minor > 0 ? `+${absolute}` : absolute;
}

export function DemoLab() {
  const [data, setData] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/demo/state", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load the isolated demo session.");
        return response.json() as Promise<DemoState>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Demo unavailable.");
      });
    return () => controller.abort();
  }, []);

  async function mutate(path: string, body?: object) {
    setBusy(true); setError(""); setAnalysis("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error("The isolated demo change was rejected.");
      const scenario = path.endsWith("/reset") ? "BASELINE" : (body as { scenario: DemoState["scenario"] }).scenario;
      const current = data;
      if (!current) throw new Error("The demo state is not ready.");
      const after = scenario === "BASELINE" ? current.before : scenario === "ALREADY_REFUNDED"
        ? { ...current.before, decision: "BLOCKED" as const, reasonCodes: ["REFUND_ALREADY_SETTLED"] as const, realizedRefundMinor: current.before.entitledMinor, outstandingMinor: 0, proposedRefundMinor: 0, avoidedDuplicateExposureMinor: current.before.entitledMinor }
        : { ...current.before, decision: "BLOCKED" as const, reasonCodes: ["EVIDENCE_CONTRADICTS_ADDRESS"] as const, proposedRefundMinor: 0 };
      setData({ ...current, scenario, sourceTier: scenario === "BASELINE" ? "CANONICAL_LEDGER" : "SYNTHETIC_SESSION_OVERLAY", after,
        diff: { decision: { before: current.before.decision, after: after.decision },
          proposedRefundMinor: { before: current.before.proposedRefundMinor, after: after.proposedRefundMinor, delta: after.proposedRefundMinor - current.before.proposedRefundMinor },
          outstandingMinor: { before: current.before.outstandingMinor, after: after.outstandingMinor, delta: after.outstandingMinor - current.before.outstandingMinor },
          avoidedDuplicateExposureMinor: { before: current.before.avoidedDuplicateExposureMinor, after: after.avoidedDuplicateExposureMinor, delta: after.avoidedDuplicateExposureMinor - current.before.avoidedDuplicateExposureMinor },
          reasonCodesAdded: after.reasonCodes.filter((code) => !current.before.reasonCodes.includes(code)) } });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Demo change failed."); }
    finally { setBusy(false); }
  }

  async function investigate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/demo/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { mode?: string; fallback?: { summary: string }; investigation?: { output?: { summary?: string } } };
      if (!response.ok) throw new Error("Investigation unavailable.");
      setAnalysis(`${payload.mode === "CACHED_VALIDATED" ? "Cached validated analysis" : "Rules-only fallback"}: ${payload.fallback?.summary ?? payload.investigation?.output?.summary ?? "Evidence reviewed."}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Investigation failed."); }
    finally { setBusy(false); }
  }

  if (!data) return <section className="panel s7-panel demo-loading"><span className="pulse-dot" /><strong>{error || "Opening an isolated judge session…"}</strong></section>;
  return <div className="demo-stack">
    <section className="demo-controls" aria-label="Evidence challenge scenarios">
      <button disabled={busy} onClick={() => mutate("/api/demo/reset")} type="button" className={data.scenario === "BASELINE" ? "scenario-button selected" : "scenario-button"}><span>01</span><strong>Partial loss</strong><small>Canonical baseline</small></button>
      <button disabled={busy} onClick={() => mutate("/api/demo/overlay", { scenario: "ALREADY_REFUNDED" })} type="button" className={data.scenario === "ALREADY_REFUNDED" ? "scenario-button selected" : "scenario-button"}><span>02</span><strong>Already refunded</strong><small>Duplicate safeguard</small></button>
      <button disabled={busy} onClick={() => mutate("/api/demo/overlay", { scenario: "CONTRADICTORY_DELIVERY" })} type="button" className={data.scenario === "CONTRADICTORY_DELIVERY" ? "scenario-button selected" : "scenario-button"}><span>03</span><strong>Contradictory evidence</strong><small>Evidence safeguard</small></button>
    </section>
    <div className="source-banner"><span className={data.sourceTier === "CANONICAL_LEDGER" ? "source-dot canonical" : "source-dot synthetic"} /><strong>{data.sourceTier.replaceAll("_", " ")}</strong><small>Session expires {new Date(data.session.expiresAt).toLocaleTimeString()} · provider writes disabled</small></div>
    <section className="comparison-grid">
      <article className="panel s7-panel comparison-card"><p className="eyebrow">Before · canonical</p><strong className="decision-value">{data.before.decision}</strong><dl><div><dt>Proposed remedy</dt><dd>{formatMoney(money(data.before.proposedRefundMinor))}</dd></div><div><dt>Outstanding</dt><dd>{formatMoney(money(data.before.outstandingMinor))}</dd></div><div><dt>Reason</dt><dd>{data.before.reasonCodes.join(" · ")}</dd></div></dl></article>
      <article className="panel s7-panel comparison-card after"><p className="eyebrow">After · current scenario</p><strong className="decision-value">{data.after.decision}</strong><dl><div><dt>Proposed remedy</dt><dd>{formatMoney(money(data.after.proposedRefundMinor))}</dd></div><div><dt>Outstanding</dt><dd>{formatMoney(money(data.after.outstandingMinor))}</dd></div><div><dt>Reason</dt><dd>{data.after.reasonCodes.join(" · ")}</dd></div></dl></article>
      <aside className="diff-card"><p className="eyebrow">Machine diff</p><strong>{formatSignedMoney(data.diff.proposedRefundMinor.delta)}</strong><span>proposal delta</span><code>{data.diff.reasonCodesAdded.join(" + ") || "NO_NEW_REASON"}</code></aside>
    </section>
    <section className="demo-footer panel s7-panel"><div><p className="eyebrow">Read-only investigator</p><h2>Explain the active evidence state</h2><p>{analysis || "Uses the stored validated analysis for baseline and an explicit rules fallback for synthetic overlays."}</p></div><div className="demo-actions"><button className="button secondary compact" disabled={busy} onClick={investigate} type="button">{busy ? "Working…" : "Investigate"}</button><button className="button secondary compact" disabled={busy || data.scenario === "BASELINE"} onClick={() => mutate("/api/demo/reset")} type="button">Reset safely</button><Link className="button primary compact" href="/app/cases/RG-2052/certificate">View sandbox certificate</Link></div></section>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
