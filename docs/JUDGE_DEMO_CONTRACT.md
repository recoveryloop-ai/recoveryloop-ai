# Public Vercel Judge Demo — Signed-off Contract v1.0

## Purpose
Judges must be able to **use** RecoveryLoop AI, not watch a static presentation. Public exploration must be safe even when anonymous visitors manipulate synthetic case evidence. Actual PayPal sandbox refunds must stay in a separate authenticated operator workflow.

## User journeys
**Public visitor:** `/` -> `Explore live demo` -> `/app` command center -> `/app/cases/RG-2048` -> `Investigation` -> `Recovery Map` -> `What if already refunded?` -> read-only updated resolution -> `Demo Lab` reset. All six navigation tabs must load and contain coherent seeded data. Public user can view redacted snapshots of real sandbox captures/refunds produced by the operator, with source and verification timestamps.

**Protected operator:** `/login` -> server-verified Supabase Auth -> `/app/actions` -> review obligation/policy/evidence snapshot -> explicit approval of sandbox-only refund -> backend obtains lock and stable idempotency key -> PayPal sandbox refund POST -> GET verification -> durable receipt/certificate.

## Mandatory trust boundary
| Permission | Public session | Operator |
|---|---|---|
| View seeded cases, orders, graphs | Allowed | Allowed |
| Explore synthetic scenario overlays | Allowed, per-session | Allowed, per-session |
| Bounded AI investigation + deterministic rules | Allowed, quota-limited | Allowed |
| Obtain raw PayPal/EasyPost/OpenAI secrets | Forbidden | Forbidden from browser |
| POST capture/refund/approve/retry | Forbidden | Allowed only after authorization and validation |
| Mutate canonical provider/payment ledger | Forbidden | Only via audited server action |
| View full customer PII | Forbidden | Not needed in demo |

## Isolation model
- Signed random HttpOnly/Secure/SameSite=Lax session cookie and a short-lived `judge_sessions` DB entry.
- Synthetic overlay written only to `demo_overlays` keyed by judge session ID and scenario ID; TTL 30–60 minutes.
- Base evidence, actual PayPal captures, refunds, canonical audit and real provider IDs are immutable to anonymous visitors.
- Overlay values are allowlisted (e.g., item shipment status, evidence completeness, simulated prior refund) with bounded amounts. No arbitrary URLs, API resource IDs or external fetch.
- Reset deletes only the caller's overlay rows; it cannot undo a real refund or replay a previously spent capture.
- Rate limit IP+session, enforce OpenAI call budget, cache default reports and show explicit rules-only fallback.

## Public screen inventory
1. **Command Center**: case counts and correctly labeled financial amounts.
2. **Cases**: sortable/filterable seeded cases with source and state.
3. **Orders**: per-item fulfillment, PayPal IDs masked, courier event timeline.
4. **Recovery Map**: obligations, refund allocations, graph and counterfactual simulator.
5. **Action Center**: public preview of possible actions; buttons to execute provider writes are absent/disabled, with explanation. Protected operator sees actionable approval UX.
6. **Demo Lab**: selectable fixture and synthetic overlay controls, rerun, before/after diff and safe reset.
7. **Settings**: public architecture/status page without keys; provider health private to operator.

## Required browser tests
- Incognito opens production Vercel domain without Vercel-team access.
- Two anonymous browser sessions modify separate evidence fields; never leak across sessions.
- Public direct POST to approve, execute, capture and refund responds 401/403 without provider traffic.
- Public source disclosure labels test trackers vs synthetic evidence vs real PayPal sandbox receipts.
- Demo reset leaves genuine sandbox payment ledger and audit unchanged.
- Zero OpenAI quota: deterministic rules and scenario simulation still work with visible degraded label.
- Authentication and authorization are checked server-side on each operator route.
- Mobile/responsive enough to navigate; prioritize polished 1280×720 and 1440×900 desktop.

## Release criterion
The public app is an interactive working application, but public judges only simulate financial actions. The video and operator evidence show real sandbox money-action integration. Never imply a public simulated refund was executed via PayPal.

## v1.1 — S10 case-centered journey and decisions

The case workspace is the primary public journey: `/` → `/app/cases/RG-2048` → affected item, evidence timeline, financial buckets, bounded investigation/work product → inline synthetic challenge → separate `/app/cases/RG-2052/certificate`. Existing navigation routes remain available. Baseline RG-2048 is not the provider-refund certificate case RG-2052.

Per ADR-022, the AI may select one allowlisted **nonfinancial** outcome after scoped read-only investigation. Display model/version, stored versus fresh run, tool log, citations, uncertainty and the server validator result. Public challenges use stored validated work when current or explicit rules-only output; `aiCallMade=false`. They never create durable merchant tasks. Operator runs may record an internal task after server-verified identity, merchant scope and current-evidence validation; overrides are audited. Draft requests/bundles are not sent or submitted. Policy alone supplies money values; completed cash, reservations and hypothetical recoveries stay separate.

Allowlisted synthetic challenges add pending/UNKNOWN refund, damaged/not-as-described, delivered-but-not-received, dispute inquiry and fictional entity-resolution leads. These are not actual PayPal disputes or external fraud records. No real-person accusations or automated remedy denial. Every challenge reads a server projection; reset remains session-scoped. No fresh anonymous inference budget is opened in S10.
