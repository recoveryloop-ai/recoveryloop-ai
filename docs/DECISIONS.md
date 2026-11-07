# RecoveryLoop AI — Approved Architecture Decisions

**Status:** Owner-approved baseline, 31 October 2026 (Asia/Karachi). None of these product choices require further confirmation before Sprint S0. Credentials and capabilities still need to be verified.

| ID | Approved decision | Status | Verification / limitations |
|---|---|---|---|
| ADR-001 | RecoveryLoop AI brand; ResolutionGraph engine | ACCEPTED | Trademark clearance not performed |
| ADR-002 | Electronics/accessories demonstration merchant; generalizable platform design | ACCEPTED | One merchant and seeded orders in hackathon MVP |
| ADR-003 | USD, integer cents, no cross-currency refunds | ACCEPTED | Tests enforce this |
| ADR-004 | Next.js/TypeScript modular monolith + Tailwind/shadcn | ACCEPTED | One public Vercel deployment |
| ADR-005 | Supabase PostgreSQL with Drizzle migrations | ACCEPTED, VERIFIED S1 | RecoveryLoop project migrated, rolled back, re-applied, seeded and verified 1 November 2026 |
| ADR-006 | Legitimately created PayPal Developer sandbox, no live payments | ACCEPTED, S2 VERIFIED | Real `$250.00` sandbox order approved, captured, independently read back and persisted 3 November 2026; duplicate replay retained exactly one capture row |
| ADR-007 | EasyPost test mode + explicitly labeled synthetic overlays | ACCEPTED, S3 VERIFIED | Real EasyPost test tracker ingested with `PROVIDER_TEST` events; item mapping remains visibly `SYNTHETIC`; replay is idempotent |
| ADR-008 | OpenAI API as AI investigator; read-only tools and structured responses | SUPERSEDED by ADR-015 | Owner changed provider on 1 November 2026 |
| ADR-009 | Public live and navigable Vercel production URL | ACCEPTED, VERIFIED PRE-S4 | `https://recoveryloop-ai.vercel.app` returns 200 anonymously; deployed desktop/mobile/operator browser suite passes |
| ADR-010 | Public judge: safe interactive scenarios and read-only provider proofs; operator: authenticated PayPal writes | ACCEPTED | Anonymous public session must never approve or execute real refunds |
| ADR-011 | Supabase Auth or equivalent server-verified auth, allowlisted operator | ACCEPTED | Verify authentication at every money-action endpoint |
| ADR-012 | USD one demonstration merchant; no Shopify OAuth in MVP | ACCEPTED | Minimal electronics storefront in the app |
| ADR-013 | Human approval, reservations, provider read-back, fail-closed unknowns | REQUIRED | Financial security release blocker |
| ADR-014 | No live courier claim submissions, no real seller/buyer records, no production payment API | REQUIRED | Accurate claims in demo and documentation |
| ADR-015 | Z.ai standard Model API with `glm-5.3`, behind a provider-neutral AI adapter | ACCEPTED | Owner-approved 1 November 2026; same read-only tool, evidence, structured-output, budget and no-money-authority rules as ADR-008 |
| ADR-016 | Mock PayPal adapter permitted before credentials, always labeled `SYNTHETIC` and never accepted as provider proof | ACCEPTED, TEMPORARY | Owner-approved for S0 development; real PayPal sandbox OAuth/order remains the S0 exit gate and replacement condition |
| ADR-017 | Deterministic versioned-policy engine is the sole authority for obligation amounts; simulations are provider-write-free | ACCEPTED, S4 VERIFIED | Integer-cent F01-F07/F11/F14 fixtures pass; F02 allows `$100.00`, F03/F04 block, every persisted graph edge cites evidence |
| ADR-018 | Z.ai GLM 5.3 investigator is explanatory only, with eight scoped read-only tools, strict schema/citation validation and durable rules fallback | ACCEPTED, S5 VERIFIED | Real F02 run cites two stored records; prompt injection, fabricated citations, stale input, unavailable AI and forbidden write-tool attempts are tested and fail closed |
| ADR-019 | Refund execution requires immutable deterministic proposal, explicit operator approval, database reservation, stable PayPal request ID and provider GET before completion | ACCEPTED, S6 VERIFIED | Real `$100.00` partial sandbox refund against the verified `$250.00` capture is GET-confirmed; one action/refund/allocation/certificate exists and a second proposal is blocked before network |
| ADR-020 | Public judge state uses signed random HttpOnly cookies plus hashed, expiring database sessions and allowlisted synthetic overlays; reset is session-scoped and canonical financial records remain immutable | ACCEPTED, S7 VERIFIED | 45-minute sessions, atomic request cap, two-context isolation, refresh persistence, scoped reset and canonical-ledger fingerprint stability are tested; public investigation is cached/rules-only and makes no provider or fresh AI call |
| ADR-021 | Publish the hackathon release under MIT with a reproducible public repository, automated no-provider-write release verification and owner-reviewed YouTube/Devpost handoff | ACCEPTED, S8 TECHNICALLY VERIFIED | README, license, release verifier, recording script, demo narration and submission copy are versioned; external YouTube publication and Devpost submission remain owner-controlled |
| ADR-022 | PayPal dispute guard: one money path per item. An open dispute, or one that paid the buyer, blocks refund proposal, approval and execution; unknown dispute states fail closed; a database trigger backs up the application check | PROPOSED, FEATURE BRANCH `feature/dispute-guard` | Not merged to `main`; owner go/no-go before merge. See `docs/DISPUTE_GUARD_IMPLEMENTATION_REPORT.md` |

## Owner provisioning items

- [x] Create PayPal Developer account and sandbox app; merchant API credentials verified.
- [x] Provide sandbox Personal/buyer access and complete the required S2 approval and capture proof.
- [x] Create EasyPost account and obtain **test** API key.
- [x] Create the dedicated Supabase project and confirm PostgreSQL read/write access.
- [x] Configure Supabase server-side Auth and the allowlisted operator during the authorized foundation sprint.
- [x] Confirm Z.ai standard API key and `glm-5.3` access.
- [x] Confirm Vercel project permissions and production domain hosting.

Never paste credentials in chat; keep `.env.local` out of version control and configure server-only environment variables in hosting. The coding agent must report observed provider responses, not just say access is available.

## Superseded proposals

- Old `public read-only demo` replaced with **interactive public judge experience limited to synthetic evidence**.
- Old `AI provider flexible/unselected` was replaced by OpenAI, then superseded by **Z.ai GLM (`glm-5.3`)** in ADR-015.
- Old `merchant vertical pending` replaced with **electronics/accessories**.
