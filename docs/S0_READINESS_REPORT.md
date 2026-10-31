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
| GitHub | Connected account available | Public repository creation/push | PENDING | Authenticated owner discovered | Local verification and initial push |
| Vercel | Not tested in S0 yet | Account/project deploy readiness | PENDING | Not called | GitHub repository must exist first |

## Security and financial invariants

- `.env.local` is ignored and created with owner-only filesystem permissions.
- No secret is written to `.env.example`, source, logs, chat, or provider evidence.
- `DEMO_MODE=true` rejects `PAYPAL_ENV=live` in code and tests.
- PayPal smoke creates no capture and no refund.
- EasyPost smoke requires the returned tracker to report `mode=test`.
- OpenAI smoke exposes only a synthetic read-only `lookup_case` function.
- Supabase smoke uses a temporary table that is dropped on commit; it does not create the S1 application schema.

## Gate

S0 cannot pass, and S1 must not begin, until real PayPal sandbox OAuth plus a permitted sandbox order API call are observed. Missing credentials are a genuine blocker, not a simulated pass.
