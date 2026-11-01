# Sprint S1 — Foundation & Fixtures Report

**Status:** COMPLETE  
**Completed:** 1 November 2026 (Asia/Karachi)  
**Scope boundary:** S1 only. No checkout, PayPal capture, refund execution, EasyPost ingestion, or Z.ai investigation behavior was added.

## Delivered

- Next.js 16 App Router application with TypeScript, Tailwind CSS, a reusable application shell, `/`, `/app`, and `/store`.
- Static two-line electronics cart with a server-calculated exact total of 25,000 USD cents (`$250.00`). Checkout is disabled and explicitly deferred to S2.
- Drizzle schema and two generated SQL migrations for one demo merchant, users/roles, policy snapshots, orders/items, captures/refunds, cases, obligations, evidence, and audit events.
- Integer-only USD money helpers that reject fractional, negative, unsafe, and mixed-currency inputs.
- Supabase SSR server client and protected operator boundary requiring a verified Supabase user, the configured email allowlist, and `app_metadata.role` of `operator` or `admin`.
- Seeded policy v1 and fixtures F01–F05. All fixture provider identifiers and evidence are explicitly synthetic.
- Guarded S1 rollback, idempotent seed, database verification, duplicate external-reference test, and CI production build.

## Database acceptance evidence

The final migration sequence was executed against Supabase project `zaghhfsylnyywxbqtzug`:

1. Migration up: PASS (both Drizzle migrations applied).
2. Guarded exact S1 down: PASS; public table inventory returned empty.
3. Migration up again: PASS (both migrations applied from zero).
4. Seed F01–F05 and the allowlisted Auth operator mapping: PASS.
5. Verification: PASS — 1 merchant, 1 policy, 1 operator mapping, 5 orders, 6 order items, 5 captures, 2 synthetic refunds, 4 cases/obligations/evidence records.
6. Stored totals equal calculated item totals exactly: F01 15,000; F02 25,000; F03 10,000; F04 10,000; F05 3,000 cents.
7. Duplicate `(merchant_id, external_ref)` insert rejected with PostgreSQL unique-violation `23505`.

All 12 public tables, including migration history, have RLS enabled. CRUD privileges for both Supabase `anon` and `authenticated` are zero. No direct Data API policies are installed in S1; this is intentionally fail-closed while server handlers enforce operator authorization.

## Checks

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 6 files, 18 tests |
| `npm run build` | PASS — 3 static pages, 1 dynamic protected route |
| `npm audit` | PASS — 0 known vulnerabilities |
| `/`, `/app`, `/store` local HTTP smoke | PASS — 200 each |
| Anonymous `GET /api/operator/health` | PASS — 401, `AUTHENTICATION_REQUIRED`, `private, no-store` |
| Browser console review | PASS — no errors or warnings |
| Responsive visual review | PASS — compact and desktop layouts reviewed |

## Security and provider record

- `.env.local` remains ignored by Git and owner-readable only (`0600`). No secret was added to tracked files or logs.
- The Supabase secret key is used only by the local seed script to locate the already-created Auth operator; authorization uses verified user data and `app_metadata`, never `user_metadata`.
- No PayPal, EasyPost, or Z.ai API call was made during S1. No financial provider mutation exists in the new application routes.
- Supabase security advisor reports one external warning: leaked-password protection is disabled. This is a project/Auth setting, not an S1 code failure. RLS-with-no-policy notices are informational and match the intentional deny-by-default Data API posture.

## Failing-test disclosure and blockers

During implementation, the stock Drizzle runner attempted a database-level `CREATE SCHEMA` beyond the dedicated role's privileges; it was replaced with a transactional, hash-tracked runner that preserves the narrower privilege boundary. The first seed attempt also exposed a JSON parameter binding mismatch and was corrected before any data committed. Final checks have no failures.

There are no S1 blockers. S2 has not started and requires explicit owner approval.
