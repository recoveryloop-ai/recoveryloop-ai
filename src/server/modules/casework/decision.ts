import { caseworkOutputSchema, type CaseworkContext, type CaseworkOutput, type WorkProduct } from "./contracts";
import { allowedIssue } from "./scenarios";
export const decisionRequirements: Record<CaseworkOutput["issue"], {
  outcomes: readonly CaseworkOutput["outcome"][];
  missing: readonly CaseworkOutput["missing_evidence"][number][];
}> = {
  RETURN_TO_SENDER: { outcomes: ["READY_FOR_POLICY_REVIEW", "REQUEST_EVIDENCE"], missing: ["carrier_terms"] },
  REMEDY_COMPLETED: { outcomes: ["NO_ACTION"], missing: [] },
  PAYMENT_UNRESOLVED: { outcomes: ["MONITOR_PAYMENT"], missing: ["final_payment_status"] },
  DELIVERY_CONFLICT: { outcomes: ["REQUEST_EVIDENCE", "ROUTE_TO_OPERATOR"], missing: ["delivery_confirmation", "buyer_receipt_account"] },
  ITEM_CONDITION_UNCONFIRMED: { outcomes: ["REQUEST_EVIDENCE", "ROUTE_TO_OPERATOR"], missing: ["item_photos", "item_condition"] },
  DISPUTE_EVIDENCE_REQUEST: { outcomes: ["ROUTE_TO_OPERATOR", "REQUEST_EVIDENCE"], missing: ["dispute_deadline"] },
  IDENTITY_UNCONFIRMED: { outcomes: ["ROUTE_TO_OPERATOR"], missing: ["independent_identity_check"] },
};
export function validateCasework(raw: unknown, context: CaseworkContext): {
  output?: CaseworkOutput;
  code: string;
} {
  const parsed = caseworkOutputSchema.safeParse(raw);
  if (!parsed.success)
    return { code: "CASEWORK_SCHEMA_INVALID" };
  const output = parsed.data;
  if (output.case_id !== context.case.id)
    return { code: "CASEWORK_SCOPE_VIOLATION" };
  if (output.evidence_hash !== context.evidenceHash)
    return { code: "STALE_CASE_INPUT" };
  const citations = [...new Set(output.findings.flatMap(f => f.evidence_ids))];
  const allowed = new Set(context.evidence.map(e => e.id));
  if (citations.length < 2 || citations.some(id => !allowed.has(id)))
    return { code: "UNSUPPORTED_CITATION" };
  if (context.scenario !== "BASELINE" && !citations.includes(context.evidence.at(-1)!.id))
    return { code: "SCENARIO_CITATION_REQUIRED" };
  if (output.issue !== allowedIssue(context))
    return { code: "UNSUPPORTED_CLASSIFICATION" };
  const requirements = decisionRequirements[output.issue];
  if (!requirements.outcomes.includes(output.outcome))
    return { code: "CASEWORK_TRANSITION_FORBIDDEN" };
  if (output.outcome === "READY_FOR_POLICY_REVIEW" && context.obligation.decision !== "ALLOWED")
    return { code: "POLICY_REVIEW_NOT_READY" };
  if (requirements.missing.some(key => !output.missing_evidence.includes(key)))
    return { code: "MISSING_PROOF_NOT_ACKNOWLEDGED" };
  if (!["RETURN_TO_SENDER", "REMEDY_COMPLETED"].includes(output.issue) && (output.confidence !== "uncertain" || !output.findings.some(f => f.certainty !== "supported")))
    return { code: "UNCERTAINTY_REQUIRED" };
  return { output, code: "VALIDATED" };
}
export function rulesCasework(context: CaseworkContext): CaseworkOutput {
  const issue = allowedIssue(context);
  const requirements = decisionRequirements[issue];
  const uncertain = !["RETURN_TO_SENDER", "REMEDY_COMPLETED"].includes(issue);
  const ids = [...new Set([context.evidence[0]!.id, context.evidence.at(-1)!.id, ...context.evidence.slice(0, 2).map(e => e.id)])];
  return { case_id: context.case.id, evidence_hash: context.evidenceHash, issue, outcome: issue === "RETURN_TO_SENDER" && context.obligation.decision !== "ALLOWED" ? "REQUEST_EVIDENCE" : requirements.outcomes[0]!, confidence: uncertain ? "uncertain" : "supported", findings: [{ evidence_ids: ids, certainty: uncertain ? "unknown" : "supported" }], missing_evidence: [...requirements.missing] };
}
const checklistLabels: Record<CaseworkOutput["missing_evidence"][number], string> = {
  item_photos: "Request photographs of the item, packaging and affected component.", item_condition: "Confirm received item condition and the applicable return inspection policy.",
  delivery_confirmation: "Obtain carrier delivery confirmation and destination match through an approved private channel.", buyer_receipt_account: "Ask the buyer to clarify receipt, household delivery and any available delivery evidence.",
  final_payment_status: "Read the existing provider refund status; retain the reservation until final reconciliation. Never retry an UNKNOWN refund POST.", carrier_terms: "Check carrier reimbursement terms and proof of value; no recovery has been paid.",
  dispute_deadline: "Confirm an actual provider dispute identifier and deadline before preparing a response.", independent_identity_check: "Review independent identifiers manually. A name match is not identity proof or fraud evidence; do not withhold a remedy.",
};
const briefs: Record<CaseworkOutput["issue"], string> = { RETURN_TO_SENDER: "The affected item returned to sender while other fulfillment and captured payment require reconciliation. Deterministic policy controls any remedy.", REMEDY_COMPLETED: "A completed remedy already satisfies this obligation. Do not duplicate it.", PAYMENT_UNRESOLVED: "A reservation exists without a final confirmed payment outcome. Monitor and reconcile before further action.", DELIVERY_CONFLICT: "Delivery records and the buyer account conflict. Gather independent proof and route for human review without accusation.", ITEM_CONDITION_UNCONFIRMED: "The buyer reports damaged or incorrect condition. Item photos and inspection remain unverified; no automatic entitlement is established.", DISPUTE_EVIDENCE_REQUEST: "Prepare an evidence bundle for a synthetic inquiry. No actual PayPal dispute or submission is verified.", IDENTITY_UNCONFIRMED: "Fictional identity records illustrate an unconfirmed lead. Different identifiers prevent treating a shared name as proof." };
export function buildWorkProduct(output: CaseworkOutput, context: CaseworkContext): WorkProduct {
  const ids = new Set(output.findings.flatMap(f => f.evidence_ids));
  const checklist = output.missing_evidence.map(key => checklistLabels[key]);
  return { brief: briefs[output.issue], checklist, draftRequest: checklist.length ? `Draft for operator review: Please help us confirm the following before the case proceeds. ${checklist.join(" ")}` : "No additional customer request is prepared. Review the existing completed-remedy evidence.", evidenceBundle: context.evidence.filter(e => ids.has(e.id)).map(e => ({ id: e.id, source: `${e.provider} / ${e.sourceTier}`, observedAt: e.observedAt })), status: "DRAFT_NOT_SENT", caveat: "Internal preparation only. No external message, dispute response or carrier claim has been submitted. Hypothetical recovery is not cash." };
}
