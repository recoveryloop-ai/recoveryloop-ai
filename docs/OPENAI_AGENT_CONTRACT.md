# OpenAI AI Investigator — Tool and Evidence Contract v1.0

## Goal
Provide evidence-grounded explanations and candidate resolutions for financial incident cases; do not calculate authorized refund amounts or execute financial actions.

**Backend:** OpenAI API; model selected/configured in `OPENAI_MODEL` after S0 compatibility smoke test. Use supported structured outputs/tool calling (Responses API or current documented equivalent). All API calls server-side with rate and token limits. Never expose `OPENAI_API_KEY` in client.

## Read-only tool roster
- `get_order(order_id)`
- `get_paypal_capture(capture_id)`
- `get_paypal_refunds(capture_id)`
- `get_shipments(order_id)`
- `get_merchant_policy(version)`
- `get_obligation_balance(order_id)`
- `get_case_evidence(case_id)`
- `run_counterfactual(case_id, option)` — pure deterministic computation

**Explicitly forbidden:** approve/reject refund, call payment captures/refunds, change ledger rows, submit carrier claims, dispute submissions, arbitrary external fetch, raw SQL, shell, unrestricted browser automation. Enforce at code level rather than via prompting alone.

## Input bundle
`case_id`, merchant scoping, sanitized order/item summary, provider evidence IDs and trust tiers, normalized shipment events, immutable policy version, obligation and refund allocations, known unknowns, evidence snapshot hash, UTC timestamps. Remove raw PII and reject prompt instructions embedded inside tracking/customer notes.

## Structured return
```json
{
  "case_id": "case-2048",
  "summary": "Item B was returned to sender and is eligible for a policy-backed refund.",
  "findings": [
    {"type": "PARTIAL_FULFILLMENT", "evidence_ids": ["ev-order", "ev-tracker"], "certainty": "supported"}
  ],
  "missing_evidence": ["carrier_reimbursement_terms"],
  "proposed_action_type": "REFUND_OBLIGATION",
  "reason_codes": ["ITEM_RETURNED_TO_SENDER"],
  "merchant_questions": [],
  "caveat": "Carrier reimbursement is not verified."
}
```

## Mandatory validation
- Zod validates exact schema; unexpected fields rejected or ignored safely.
- Every `evidence_id` must exist within the case evidence snapshot. Invalid citation blocks the AI finding.
- Numeric payout amounts are computed and authorized **only** by the deterministic engine.
- The model must distinguish provider-verified sandbox records, provider test tracker events and synthetic fixtures.
- An AI response cannot transition a proposal to `APPROVED` or an action to `EXECUTING`.
- OpenAI error, invalid schema, unsupported citation or budget exhaustion -> durable rules-only fallback with visible label.

## Evaluation tests
T1 valid returned item; T2 completed refund; T3 pending refund; T4 stale snapshot; T5 malicious shipment note; T6 fabricated evidence ID; T7 contradictory proof; T8 unknown carrier liability. Capture tests with exact input fixture, expected reason code, output validity, and no forbidden write. Provide real test report; never invent accuracy metrics.

Official docs: https://platform.openai.com/docs/guides/function-calling and https://platform.openai.com/docs/guides/structured-outputs
