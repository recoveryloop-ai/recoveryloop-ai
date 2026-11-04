# RecoveryLoop AI — Final Demo Script (2:50 target)

Record at 1440×900 in a fresh signed-out browser. Hide bookmarks, notifications and personal browser profiles. Do not record `.env.local`, provider dashboards, credentials or the operator login password.

| Time | Screen and action | Narration |
|---:|---|---|
| 0:00–0:15 | Landing → **Explore live demo** | “A failed order is rarely one record. Payment, fulfillment, policy and prior remedies live in different systems. RecoveryLoop turns them into one auditable obligation before money moves.” |
| 0:15–0:35 | Command Center → Cases | “This public demo uses an electronics test merchant. Every amount is sourced from the stored ledger, and every record is labeled PayPal Sandbox, EasyPost test or synthetic.” |
| 0:35–0:58 | Open `RG-2048` Investigation; expand cited evidence | “Z.ai GLM explains the incident using scoped read-only tools and stored evidence IDs. It cannot set a refund amount or call a payment endpoint; policy remains deterministic.” |
| 0:58–1:18 | Recovery Map | “The order captured two hundred fifty sandbox dollars. One returned item creates a one-hundred-dollar customer obligation, so policy v1 allows a one-hundred-dollar simulated remedy.” |
| 1:18–1:45 | Demo Lab → **Already refunded** | “Now I add a synthetic prior-refund fact in this anonymous session. The engine changes the additional remedy to zero and records `REFUND_ALREADY_SETTLED`. This overlay is isolated and cannot mutate PayPal.” |
| 1:45–1:58 | Click **Reset safely** | “Reset deletes only my overlay. The canonical provider ledger and audit certificate remain unchanged.” |
| 1:58–2:20 | Action Center | “Actual sandbox writes are separate. An authenticated operator approved one immutable proposal with a stable request ID. Anonymous direct calls to propose, approve, execute or reconcile return an authorization denial before provider traffic.” |
| 2:20–2:42 | Open sandbox certificate | “PayPal returned the one-hundred-dollar partial refund, then RecoveryLoop independently retrieved it before closing the obligation. The public certificate masks provider IDs and preserves the evidence and policy hash.” |
| 2:42–2:50 | Settings or landing | “The duplicate is blocked, unknown outcomes fail closed, and the public demo remains safe to explore. RecoveryLoop: explain with AI, decide with policy, execute with proof.” |

## Recording acceptance

- Final duration is at most **2:55**; target 2:50 leaves upload/transcode margin.
- Show actual running production code, not slides alone.
- Keep the pointer still while narrating and use no copyrighted music or unnecessary third-party logos.
- If a remote request cold-starts, pause before recording again rather than cutting away from an unresolved state.
- The displayed release must match the public GitHub main branch and Devpost links.
