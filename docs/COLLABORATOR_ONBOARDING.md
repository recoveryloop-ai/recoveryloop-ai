# RecoveryLoop AI — Collaborator Onboarding

This repository is the source of truth for the RecoveryLoop AI architecture and implementation. Start with `START_HERE.md`, `AGENTS.md`, and `docs/MASTER_TECHNICAL_BLUEPRINT.md` before changing code.

## Accept the invitations

Accept the invitations sent to your own email address for:

1. **GitHub** — join the `recoveryloop-ai` organization. Organization members have Write access to the RecoveryLoop repository.
2. **Supabase** — join the `RecoveryLoop AI` organization as a Developer. This organization contains only the RecoveryLoop project.
3. **EasyPost** — accept the Developer Agent invitation. This role includes integration-oriented dashboard areas and API keys.

Create an account with the invited email when a platform asks for one. Do not use or request access to the project owner's Gmail account.

## Clone and verify the project

```bash
git clone https://github.com/recoveryloop-ai/recoveryloop-ai.git
cd recoveryloop-ai
npm install
npm run env:init
npm run typecheck
npm run lint
npm test
```

Use Node.js 22 or newer. Never commit `.env.local`, provider credentials, passwords, access tokens, checkout handoff files, or customer data.

## Configure your own local environment

`npm run env:init` creates a Git-ignored `.env.local` from `.env.example`. Populate it locally:

- Retrieve the RecoveryLoop project URL and API keys from the Supabase dashboard after accepting the Developer invitation.
- Retrieve the EasyPost **test** API key from the EasyPost dashboard after accepting the Developer Agent invitation.
- Use only PayPal **sandbox** credentials. A collaborator may use a separately owned sandbox app locally; live PayPal credentials and live payment endpoints are forbidden.
- Use a separately owned Z.ai development key when a shared-key transfer is not available. `ZAI_MODEL` remains `glm-5.3`.
- Keep `DEMO_MODE=true` and `PUBLIC_JUDGE_DEMO=true`.
- Set `DEMO_OPERATOR_EMAIL` to your own email and `DEMO_OPERATOR_PASSWORD` to your own local-only password. Do not use the project owner's Gmail credentials.

Secrets stay only in each developer's `.env.local`. They are not stored in Git, documentation, issues, pull requests, chat, or email.

## Create your own local operator identity

After accepting Supabase access, create a Supabase Auth user for your own email in **Authentication → Users** and give it a strong password known only to you. Set its trusted application metadata to include:

```json
{ "role": "operator" }
```

The authorization code reads `app_metadata`, never user-editable `user_metadata`. Your local `DEMO_OPERATOR_EMAIL` must match your own Auth user. This provides an independent local operator login without access to the owner's email or password.

## Provider boundaries

- GitHub, Supabase, and EasyPost access is individual and auditable.
- Vercel dashboard team collaboration is not available on the no-cost Hobby plan. Until the deployment sprint, contributors work through GitHub and local development.
- PayPal sandbox buyer approval requires a sandbox personal account. Client credentials alone cannot approve a checkout.
- S2 is blocked until a legitimate PayPal sandbox buyer approves an order and the real capture/read-back evidence is persisted.
- Do not begin a later sprint without owner approval recorded in the project workflow.

## Working agreement

- Create a branch for each change and open a pull request.
- Do not rewrite shared history or force-push the default branch.
- Run typecheck, lint, tests, and a production build before requesting review.
- Preserve fail-closed financial behavior, integer-cent money handling, idempotency, RLS, and server-side authorization.
- Never claim a provider action succeeded without recorded provider evidence.
