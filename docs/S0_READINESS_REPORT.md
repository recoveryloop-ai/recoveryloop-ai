# Sprint S0 — Provider and Environment Readiness

**Status:** In progress / blocked at PayPal gate  
**Date:** 1 November 2026 (Asia/Karachi)

## Scope

Sprint S0 only: repository/toolchain setup, local environment template, safe server-side provider smoke checks, Supabase/GitHub project readiness, and redacted evidence. No product UI, canonical schema, payment capture, or refund execution is in scope.

## Provider status

| Provider | Account available? | Tested capability | Actual status | Redacted proof | Blocker |
|---|---|---|---|---|---|
| PayPal | No credentials yet | Sandbox OAuth + create uncaptured order | BLOCKED | Not called | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` |
| EasyPost | Key not installed locally | Create test tracker `EZ5000000005` | BLOCKED | Not called | `EASYPOST_API_KEY` |
| OpenAI | Key not installed locally | Strict read-only tool call + JSON-schema output | BLOCKED | Not called | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Supabase | Connected account available | Project creation and DB read/write | PENDING | Connected organization discovered | Owner organization/region confirmation and project provisioning |
| GitHub | Yes | Public repository creation/push | PASS | `Faheel101/recoveryloop-ai`, commit `a1714c1` | None |
| Vercel | Not tested in S0 yet | Account/project deploy readiness | PENDING | Not called | GitHub repository must exist first |

## Security and financial invariants

- `.env.local` is ignored and created with owner-only filesystem permissions.
- No secret is written to `.env.example`, source, logs, chat, or provider evidence.
- `DEMO_MODE=true` rejects `PAYPAL_ENV=live` in code and tests.
- PayPal smoke creates no capture and no refund.
- EasyPost smoke requires the returned tracker to report `mode=test`.
- OpenAI smoke exposes only a synthetic read-only `lookup_case` function.
- Supabase smoke uses a temporary table that is dropped on commit; it does not create the S1 application schema.

## Commands and observed results

| Command | Result |
|---|---|
| `npm install` | PASS — 46 packages installed; 0 audit vulnerabilities |
| `npm run env:init` | PASS — `.env.local` created with mode `600`; demo signing secret generated |
| `npm run typecheck` | PASS — TypeScript reported no errors |
| `npm test` | PASS — 1 file, 3 tests |
| `npm run smoke:all` | Expected BLOCKED — exact missing local variables reported; no provider calls attempted |
| tracked secret-pattern scan | PASS — no OpenAI, EasyPost, Supabase, or GitHub secret patterns found |
| GitHub repository create/push | PASS — public `Faheel101/recoveryloop-ai`, branch `main` |

## Gate

S0 cannot pass, and S1 must not begin, until real PayPal sandbox OAuth plus a permitted sandbox order API call are observed. Missing credentials are a genuine blocker, not a simulated pass.
