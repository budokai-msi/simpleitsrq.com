# Cloudflare Zero Trust / Access — walling off /portal

Goal: put the admin portal behind a second, Cloudflare-enforced login so that even if OAuth + session code has a 0-day, the attacker can't reach the portal at all. This is the single highest-leverage security improvement available — it removes the portal from the public internet.

**Cost:** free for up to 50 users (we need 1–3).
**Time to set up:** ~20 minutes, all in the Cloudflare dashboard.
**Code changes required:** zero, as long as the domain stays `simpleitsrq.com`. If you later move portal to `portal.simpleitsrq.com`, 3 env-var updates (documented at the end).

---

## Prereqs

- Cloudflare account (free tier is fine)
- Access to the DNS for `simpleitsrq.com` — currently GoDaddy per infra memory

---

## Step 1 — Move DNS to Cloudflare (one-time)

Without Cloudflare in front of the site, Cloudflare Zero Trust can't enforce anything.

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Add a site** → enter `simpleitsrq.com` → Free plan
3. Cloudflare will auto-detect all existing DNS records (A, AAAA, MX, TXT). Verify that MX records are present (otherwise email breaks).
4. Cloudflare gives you 2 nameservers (usually `something.ns.cloudflare.com`). Go to GoDaddy → Nameservers → change to Cloudflare's. Takes 5–60 min to propagate.
5. Verify at cloudflare.com that status is "Active" before proceeding.

**Check that nothing broke:**
- `https://simpleitsrq.com` still loads
- Send yourself a test email to hello@simpleitsrq.com — should arrive
- `curl -I https://simpleitsrq.com` shows `server: cloudflare`

---

## Step 2 — Enable Zero Trust

1. In Cloudflare dashboard → left sidebar → **Zero Trust** → opens a new section
2. First time: pick a team name (becomes `<teamname>.cloudflareaccess.com`), select Free plan
3. **Settings** → **Authentication** → **Add new login method**:
   - Pick **Google**
   - Follow Cloudflare's OAuth setup (creates an OAuth app in your Google Cloud Console; they give you the exact redirect URI to paste)
   - Alternatively add **One-time PIN** as a fallback (Cloudflare emails a 6-digit code)

---

## Step 3 — Create the Access policy for /portal

1. Zero Trust dashboard → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Application config:
   - **Application name:** Simple IT SRQ Admin Portal
   - **Session duration:** 24 hours (we want re-auth daily)
   - **Application domain:** `simpleitsrq.com/portal*` (covers /portal, /portal/, /portal/anything)
3. Policies:
   - **Policy name:** Admin email allowlist
   - **Action:** Allow
   - **Configure rules:**
     - Include → Emails → `ivanovspccenter@gmail.com` (and any other admin emails)
   - Save
4. (Optional) **Require** rule for added friction: Include → Authentication method → **Google**
5. Save the application.

---

## Step 4 — Verify

1. Open an incognito window, go to `https://simpleitsrq.com/portal`
2. Cloudflare intercepts BEFORE the request reaches Vercel
3. Cloudflare shows its login page — sign in with Google using the allowlisted email
4. On success, Cloudflare issues a `CF_Authorization` JWT cookie and redirects back to /portal
5. Vercel sees the request and runs the normal OAuth/session flow (second factor)

**What an attacker sees if they hit /portal without a Cloudflare-approved email:**
- Cloudflare login page (cannot be bypassed from the attacker's side)
- Blocked at the edge, never reaches your Vercel functions
- Your Vercel logs show nothing because the request never arrived

---

## Step 5 — Also put /api/portal behind the policy

The admin API is also sensitive. Add a second Application or expand the first:

- **Application domain:** `simpleitsrq.com/api/portal*`
- Same policy (allowlisted emails)

**Important:** this blocks all unauthenticated API access, including the `action=health` check. Either:
- Accept that and run health checks from an allowlisted source, OR
- Split health off to a different path (e.g. `/api/health`) and leave that public

Recommended: split it. I can make that code change in ~10 minutes when you're ready.

---

## Step 6 — Optional: move portal to a subdomain (cleaner)

Right now portal is at `simpleitsrq.com/portal`. The cleaner architecture is `portal.simpleitsrq.com` — separate origin, fully isolated cookies, Cloudflare policy applies to the whole subdomain.

**Changes required if you want to do this later:**
1. Cloudflare DNS → add CNAME record: `portal` → `cname.vercel-dns.com`
2. Vercel project → add custom domain `portal.simpleitsrq.com`
3. Update Google OAuth redirect URI: add `https://portal.simpleitsrq.com/api/auth/callback/google`
4. Update GitHub OAuth redirect URI similarly
5. Set env var `APP_URL=https://portal.simpleitsrq.com` in Vercel (portal build)
6. Update the `csrfCheck` allowlist in `api/portal.js` to include the new origin

This is a ~20-minute change I'm happy to do when you want it. Ship without first, then move when convenient.

---

## Why this is high-leverage

The portal has ~30 state-mutating admin actions. Every one is protected by Google OAuth + session + requireAdmin() + CSRF origin check. That's four layers — but they all run inside Vercel's public-internet perimeter, so any novel bug in OAuth, session handling, or the portal's dispatch logic is an attack surface.

Cloudflare Access adds a fifth, completely out-of-band, layer. An attacker hitting `/portal` doesn't see your Vercel response at all until they're through Cloudflare. To bypass Cloudflare Access they'd need a Cloudflare 0-day — a different problem class.

For a small-business marketing site this is overkill. For a site that hosts an operational-security dashboard with live threat-actor data, IP blocklist controls, and draft-publish-to-GitHub powers, it's proportionate.

---

## When to NOT do this

- If you don't want to move DNS to Cloudflare (we rely on GoDaddy DNS today)
- If you have non-Google-auth team members who need portal access
- If you have service accounts that hit `/api/portal` programmatically (they'd need service tokens configured in Cloudflare Access)

None of those apply currently. Recommended next step.
