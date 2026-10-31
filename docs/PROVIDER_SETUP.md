# S0 Provider and Environment Readiness Checklist

**Status:** accounts are the owner's responsibility; engineering tests are Codex's responsibility once credentials are available. Nothing below asserts the accounts are already verified.

## 1. PayPal Developer
- Create a legitimate Developer account and sandbox REST application from your real jurisdiction.
- Obtain sandbox client ID/secret, and sandbox buyer/business identities if permitted.
- Test server-only client-credentials OAuth at the sandbox host.
- Create one authorized sandbox order (or otherwise perform a documented permitted API smoke test), observe response ID/status.
- Record only redacted output and failure codes. Never commit payment credentials or sandbox buyer passwords.
- If signup from Pakistan is blocked, use the hackathon's official FAQ/Discord help path. No fake identity/VPN workaround.

Official: https://developer.paypal.com/api/make-api-requests/ | https://developer.paypal.com/api/rest/integration/orders-api

## 2. EasyPost
- Create account, copy **test** API key.
- Create/retrieve a tracker using known test tracking code and record API response. Test mode simulates shipping states; it does not prove delivery.
- Webhooks are optional for the early MVP; if enabled, configure HTTPS endpoint and official signature verification.

Official: https://docs.easypost.com/docs/trackers | https://docs.easypost.com/docs/webhooks

## 3. Z.ai GLM API
- Create/select a Z.ai standard API project, generate key, confirm quota/billing.
- Verify `glm-5.3` supports function calls and JSON-mode output; store ID as `ZAI_MODEL`.
- Run a small server-only structured-output and tool-call smoke test, log token usage where available, and set spending/request limits.

Official: https://docs.z.ai/guides/overview/quick-start | https://docs.z.ai/guides/capabilities/function-calling | https://docs.z.ai/guides/capabilities/struct-output

## 4. Supabase
- Use existing project: obtain server DB connection string, publishable client key, service role key server-only.
- Confirm migration privileges, test one read/write to a disposable development table, verify operator Auth setup and server-side session checks.

Official: https://supabase.com/docs/guides/auth/server-side

## 5. Vercel
- Connect the Git repo to the user's existing Vercel account, set server-side environment variables, deploy after tests.
- Public production domain must load in an incognito window without team login. Protect preview deployments as appropriate; application controls protect operator actions.
- Confirm read-only judge endpoints work and attempt direct POST to refund returns 401/403.

Official: https://vercel.com/docs/deployment-protection

## S0 acceptance report template
| Provider | Account available? | Tested endpoint / capability | Actual status | Redacted proof | Blocker |
|---|---|---|---|---|---|
| PayPal | | | | | |
| EasyPost | | | | | |
| Z.ai | | | | | |
| Supabase | | | | | |
| Vercel | | | | | |

Fail S0 if real PayPal sandbox API access is absent. Other pending integrations must be reported, not marked successful without an observed response.
