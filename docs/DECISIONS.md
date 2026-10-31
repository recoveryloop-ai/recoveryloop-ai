# RecoveryLoop AI — Approved Architecture Decisions

**Status:** Owner-approved baseline, 31 October 2026 (Asia/Karachi). None of these product choices require further confirmation before Sprint S0. Credentials and capabilities still need to be verified.

| ID | Approved decision | Status | Verification / limitations |
|---|---|---|---|
| ADR-001 | RecoveryLoop AI brand; ResolutionGraph engine | ACCEPTED | Trademark clearance not performed |
| ADR-002 | Electronics/accessories demonstration merchant; generalizable platform design | ACCEPTED | One merchant and seeded orders in hackathon MVP |
| ADR-003 | USD, integer cents, no cross-currency refunds | ACCEPTED | Tests enforce this |
| ADR-004 | Next.js/TypeScript modular monolith + Tailwind/shadcn | ACCEPTED | One public Vercel deployment |
| ADR-005 | Supabase PostgreSQL with Drizzle migrations | ACCEPTED | Owner already has account; DB connectivity still to be tested |
| ADR-006 | Legitimately created PayPal Developer sandbox, no live payments | ACCEPTED, ACCOUNT PENDING | Owner will create; OAuth and capture/refund smoke tests in S0/S2/S6 |
| ADR-007 | EasyPost test mode + explicitly labeled synthetic overlays | ACCEPTED, ACCOUNT PENDING | Owner will create; test key must be validated |
| ADR-008 | OpenAI API as AI investigator; read-only tools and structured responses | ACCEPTED | Key/model limits and exact model to verify at S0 |
| ADR-009 | Public live and navigable Vercel production URL | ACCEPTED | Owner already has Vercel; verify incognito judge access |
| ADR-010 | Public judge: safe interactive scenarios and read-only provider proofs; operator: authenticated PayPal writes | ACCEPTED | Anonymous public session must never approve or execute real refunds |
| ADR-011 | Supabase Auth or equivalent server-verified auth, allowlisted operator | ACCEPTED | Verify authentication at every money-action endpoint |
| ADR-012 | USD one demonstration merchant; no Shopify OAuth in MVP | ACCEPTED | Minimal electronics storefront in the app |
| ADR-013 | Human approval, reservations, provider read-back, fail-closed unknowns | REQUIRED | Financial security release blocker |
| ADR-014 | No live courier claim submissions, no real seller/buyer records, no production payment API | REQUIRED | Accurate claims in demo and documentation |

## Owner provisioning items

- [ ] Create PayPal Developer account and sandbox app, plus appropriate sandbox test users.
- [ ] Create EasyPost account and obtain **test** API key.
- [ ] Confirm Supabase project Postgres access and server-side Auth configuration.
- [ ] Confirm OpenAI API project/key, model access, billing/limits.
- [ ] Confirm Vercel project permissions and production domain hosting.

Never paste credentials in chat; keep `.env.local` out of version control and configure server-only environment variables in hosting. The coding agent must report observed provider responses, not just say access is available.

## Superseded proposals

- Old `public read-only demo` replaced with **interactive public judge experience limited to synthetic evidence**.
- Old `AI provider flexible/unselected` replaced with **OpenAI API**, exact model chosen after credential check.
- Old `merchant vertical pending` replaced with **electronics/accessories**.
