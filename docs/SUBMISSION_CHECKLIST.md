# RecoveryLoop AI — S8 Submission Checklist

**Internal cutoff:** 12 November 2026, 18:00 PKT  
**Official close:** 13 November 2026, 01:00 PKT

## Verified technical release gates

- [x] Public GitHub repository is anonymously readable.
- [x] MIT `LICENSE` and reproducible setup instructions are present.
- [x] Production Vercel domain uses HTTPS and returns `200` without Vercel/team login.
- [x] All six application tabs and the judge journey are publicly navigable.
- [x] An isolated synthetic overlay produces a meaningful deterministic difference and safely resets.
- [x] Two anonymous sessions do not share overlays.
- [x] Anonymous proposal, approval, execute, reconcile and checkout routes deny access before provider traffic.
- [x] PayPal Sandbox capture/refund certificate is redacted and read-only.
- [x] PayPal Sandbox, EasyPost test, synthetic and AI-derived sources are labeled accurately.
- [x] Local lint, typecheck, unit, build, database and desktop/mobile E2E gates pass.
- [x] Production browser coverage and GitHub Actions CI pass.
- [x] Repository secret scan and `npm audit --audit-level=high` pass.
- [x] Devpost copy and a 2:55-or-shorter recording script are prepared.

## Owner-controlled completion gates

- [ ] Confirm PayPal AI Hackathon registration/eligibility in the owner's Devpost account.
- [ ] Record the final video using `docs/DEMO_SCRIPT.md`; verify duration is **2:55 or shorter**.
- [ ] Upload the exact final recording publicly to YouTube and add the URL below.
- [ ] Review `docs/DEVPOST_SUBMISSION.md` for factual accuracy and paste it into the Devpost form.
- [ ] Confirm the GitHub, live-app and YouTube links all show the same release version.
- [ ] Submit Devpost before the internal cutoff and add the public submission URL below.

## Release links

| Item | URL / state |
|---|---|
| Live app | https://recoveryloop-ai.vercel.app |
| Source | https://github.com/recoveryloop-ai/recoveryloop-ai |
| YouTube | **OWNER TO ADD AFTER PUBLICATION** |
| Devpost | **OWNER TO ADD AFTER SUBMISSION** |

## Final manual review

- Open all links in a fresh incognito browser while signed out.
- Ensure no credentials, buyer identities, email addresses, access tokens or unredacted provider IDs appear.
- Keep the labels `PAYPAL SANDBOX`, `EASYPOST TEST`, `SYNTHETIC SESSION OVERLAY` and `PROVIDER_VERIFIED` visible.
- Do not claim live funds, recovered carrier cash, automated carrier-claim submission or production merchant usage.
- Do not show the operator password, `.env.local`, terminal environment output or provider dashboards containing secrets in the video.
