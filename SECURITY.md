# Security Runbook — Simple IT SRQ

## Active incident: Vercel April 2026 breach

**Status:** Vercel disclosed on **2026-04-20** that a threat actor
("ShinyHunters" / denied) compromised Context.ai (a third-party AI tool
used by a Vercel employee), took over that employee's Google Workspace
account, pivoted into Vercel internal systems, and **decrypted non-
sensitive environment variables** for a limited subset of projects.
Sources:
- [Vercel KB — Vercel April 2026 security incident](https://vercel.com/kb/bulletin/vercel-april-2026-security-incident)
- [TechCrunch — App host Vercel confirms security incident](https://techcrunch.com/2026/04/20/app-host-vercel-confirms-security-incident-says-customer-data-was-stolen-via-breach-at-context-ai/)
- [BleepingComputer — Vercel confirms breach as hackers claim to be selling stolen data](https://www.bleepingcomputer.com/news/security/vercel-confirms-breach-as-hackers-claim-to-be-selling-stolen-data/)

**What Vercel says was exposed:** every env var **not** marked as
"Sensitive" in the Vercel dashboard. Sensitive-typed vars are encrypted
with customer-side keys that the Vercel platform cannot decrypt —
those are untouched.

### Immediate action checklist (rotate in this order)

Each item is a distinct credential. Rotate at the upstream provider
first, push the new value to Vercel, redeploy, then revoke the old one.

- [ ] **Vercel account** → enable MFA (authenticator app or hardware
      key); revoke every personal access token in Settings → Tokens;
      disconnect + reconnect the GitHub integration to rotate the
      install token; set **Deployment Protection → Standard** minimum
      on every project.
- [ ] `DATABASE_URL` (Neon) — primary Postgres; rotate the role
      password in Neon Console → Project → Roles, update Vercel env,
      redeploy.
- [ ] `ANTHROPIC_API_KEY` — Anthropic Console → API Keys. This one
      burns real money if leaked; the agent cron would pay for anyone
      else's inference. Set a spending limit even after rotation.
- [ ] `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys.
      Roll the live key, immediately inspect the last 90 days of
      events for anomalous charges/refunds before you disable the old
      key; Stripe keeps a 7-day grace period for payment links.
- [ ] `RESEND_API_KEY` — Resend Dashboard → API Keys. Revoke, create
      a new one scoped to "send only" (not full-access).
- [ ] `TURNSTILE_SECRET_KEY` — Cloudflare Dashboard → Turnstile →
      your site → Regenerate.
- [ ] `GITHUB_TOKEN` — GitHub Settings → Developer settings → Personal
      access tokens → delete + reissue. Prefer fine-grained with only
      the scopes `api/portal.js` actually uses (contents:read/write).
- [ ] `GITHUB_CLIENT_SECRET` — GitHub OAuth App → Settings →
      Regenerate client secret.
- [ ] `GOOGLE_CLIENT_SECRET` — Google Cloud Console → APIs & Services
      → Credentials → OAuth 2.0 Client ID → Reset secret.
- [ ] `AUTH_SECRET` — local signing key for session cookies. Rotating
      this invalidates every live signed-in portal session (forces
      clients to sign in again). Safe.
- [ ] `CRON_SECRET` — Vercel Cron bearer. Rotate + update any manual
      trigger tooling that uses it.
- [ ] `VITE_AFF_*_REF` + `VITE_AFF_AMAZON_TAG` — these are public by
      design (VITE_ prefix → shipped to client bundle). Not at risk
      beyond the normal tag-switching someone could do if they knew
      your Amazon Associates tag. Rotation optional.
- [ ] `VITE_ADSENSE_CLIENT` — public. No rotation needed.
- [ ] `VITE_GA_MEASUREMENT_ID` — public. No rotation needed.
- [ ] `VITE_TURNSTILE_SITE_KEY` — public. No rotation needed.
- [ ] `VITE_PRODUCT_*_BUY_URL`, `VITE_CYBER_INSURANCE_PARTNER_URL`,
      `VITE_AUDIT_PARTNER_*_URL` — public referral URLs. Only rotate
      if the partner program requires it.

### After rotation

- [ ] Mark every secret env var as **Sensitive** in Vercel so the next
      decryption-side breach can't touch them. Non-sensitive-typed
      vars should only hold public `VITE_*` values going forward.
- [ ] Run `vercel env ls` (or the dashboard) and confirm every secret
      row shows the Sensitive badge.
- [ ] Review the Vercel project's **Activity** log for deployments or
      env changes you didn't make. Delete any suspicious deployment
      so promotion can't resurrect it.
- [ ] Review the `security_events` table (`/portal` → Threat Intel →
      Events) for anomalous sign-ins or admin actions post-2026-04-17.
- [ ] Re-invite any admin users to rotate their Vercel team membership
      MFA.

### Going forward

- Every new secret goes in as a **Sensitive** env var — never as
  the default type.
- `api/_lib/env.js` throws on missing required secrets in production,
  so forgetting to re-add a rotated value fails the cold-start loudly.
- The audit hash-chain (`auditVerify()` + the `/portal` integrity
  dashboard) will flag any tampering with the `security_events` table
  after a breach — review it quarterly.

---

## Reporting a security issue

If you believe you've found a security issue on **simpleitsrq.com**,
email `hello@simpleitsrq.com` with the subject line **Security**. We
respond within one business day and won't pursue researchers who
report responsibly. A bug bounty program is not currently offered, but
we'll credit the finder in a public advisory if desired.
