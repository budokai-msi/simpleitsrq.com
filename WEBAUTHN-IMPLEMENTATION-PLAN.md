# WebAuthn / Passkey Enforcement — Implementation Plan

**Status:** planned, not yet shipped.

**Why it's not shipped yet:** WebAuthn done right needs ~300 lines of code across 6 files, careful handling of attestation formats, a recovery UX for lost keys, and a migration strategy so existing admin logins don't lock themselves out. That's a dedicated session, not a 10-minute add to a batch. Shipping half of it would be security theater.

**What this document is:** a complete spec so the work can be picked up cleanly in one pass, by me or anyone else.

---

## Goal

Admin portal routes (everything behind `requireAdmin()`) require a verified passkey / FIDO2 hardware key in addition to OAuth session. A stolen Google password + session token is not enough — the attacker also needs physical possession of a registered security key.

Regular client users are unchanged (OAuth + session is fine).

## Out of scope for v1

- Second-factor for regular (non-admin) clients — not worth the UX friction
- WebAuthn as a replacement for OAuth — additive, not replacement
- Usernameless / discoverable credentials — use the simpler resident key flow first

## Architecture

### Libraries

- `@simplewebauthn/server` — server-side attestation + assertion verification (production-grade, from the main SimpleWebAuthn maintainer at Duo)
- `@simplewebauthn/browser` — thin wrapper around the browser's `navigator.credentials.*` API

Both are small, zero-runtime-dep, well-maintained as of 2026.

### Schema (db/migrations/002_webauthn.sql)

```sql
CREATE TABLE webauthn_credentials (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   BYTEA NOT NULL UNIQUE,           -- from browser, base64url-decoded
  public_key      BYTEA NOT NULL,                  -- CBOR-encoded COSE key
  counter         BIGINT NOT NULL DEFAULT 0,       -- monotonic replay protection
  device_type     TEXT,                            -- "single-device" | "multi-device"
  backed_up       BOOLEAN DEFAULT FALSE,           -- whether credential is cloud-backed
  transports      TEXT[],                          -- ["usb","nfc","internal"] etc.
  label           TEXT,                            -- user-provided nickname ("YubiKey 5C")
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);

CREATE TABLE webauthn_challenges (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge   BYTEA NOT NULL,
  kind        TEXT NOT NULL,   -- "registration" | "authentication"
  created_at  TIMESTAMPTZ DEFAULT now(),
  consumed_at TIMESTAMPTZ
);

-- Challenges are single-use and expire after 5 min. Cron job prunes.
CREATE INDEX idx_webauthn_challenges_user_created ON webauthn_challenges(user_id, created_at DESC);
```

### Session state

Add two columns to the session cookie payload (or sessions table if it exists):
- `webauthn_verified_at: Date | null` — when the current session last proved webauthn
- `webauthn_required: boolean` — computed on each admin request

### API actions (all live inside the existing api/portal.js — no new serverless function)

| Action | Method | Purpose |
|---|---|---|
| `webauthn-list` | GET | Return the user's registered credentials (id, label, created_at, last_used_at) |
| `webauthn-register-begin` | POST | Generate registration challenge, return options to browser |
| `webauthn-register-finish` | POST | Verify attestation, store credential |
| `webauthn-auth-begin` | POST | Generate authentication challenge, return options |
| `webauthn-auth-finish` | POST | Verify assertion, update session `webauthn_verified_at` |
| `webauthn-delete` | POST | Remove a credential (requires current webauthn proof) |

### Enforcement

`requireAdmin(session)` becomes:
```js
async function requireAdmin(session) {
  if (!session?.user?.is_admin) return forbidden();
  // If user has any registered webauthn credentials, require recent verification.
  const hasCreds = await sql`SELECT 1 FROM webauthn_credentials WHERE user_id = ${session.user.id} LIMIT 1`;
  if (hasCreds.length > 0) {
    const verified = session.webauthn_verified_at;
    if (!verified || (Date.now() - new Date(verified).getTime()) > 1000 * 60 * 60 * 8) {
      return json(401, { ok: false, error: "webauthn_required" });
    }
  }
  return null;
}
```

8-hour reverification window: tight enough to matter, long enough that admins don't hate it.

### UX flow

**Enrollment (one-time per admin, per key):**
1. Admin signs into portal as usual (Google OAuth)
2. Portal UI shows "Security keys: 0 registered — Add one"
3. Click → browser prompts to insert / touch key → `@simplewebauthn/browser` fires `navigator.credentials.create()`
4. Server verifies attestation, stores credential
5. Admin can label the key ("YubiKey 5C office", "Touch ID MacBook")

**Login with passkey (after enrollment):**
1. Admin signs into portal via Google OAuth (existing flow)
2. First admin action triggers 401 `{error: "webauthn_required"}`
3. Frontend interceptor shows a "Touch your key to continue" modal
4. `navigator.credentials.get()` → server verifies → session marked webauthn_verified
5. Admin action retries automatically, succeeds

**Lost / broken key:**
1. Admin has 0 remaining keys
2. `requireAdmin` blocks every admin action
3. Recovery: a separate admin with a working key removes the lost credential via `webauthn-delete`, then the locked-out admin enrolls a new key
4. If ALL admins lose keys simultaneously: break-glass procedure — direct SQL DELETE on webauthn_credentials, documented in the recovery runbook. Proves why the Cloudflare Zero Trust layer matters as a separate, recoverable locker.

### Testing plan before merge

- Register a key on Chrome (macOS Touch ID)
- Register a second key on the same account (YubiKey USB)
- Register a key on an iPhone (platform authenticator)
- Verify counter increments across each use
- Intentionally replay an old assertion payload → server must reject (counter regression)
- Delete a key → admin can no longer use it
- Delete the last key → `webauthn_required` gate still fires but responses explain "re-enroll or call a co-admin"

### Rollout

- Ship behind env var `WEBAUTHN_ENFORCED=true` that defaults false
- First deploy: enrollment UI works, enforcement off — admins can register keys at their convenience
- After 1 week, flip `WEBAUTHN_ENFORCED=true` — any admin who hasn't enrolled has 1 week of warning-mode (returns a soft 200 with a banner) before hard 401

### Estimated implementation time

Accurate: 3–4 hours of focused work, including tests. Not a "squeeze into the end of a batch" task.

---

## When to do this

**Do it when:**
- You're ready to invest a focused session
- You have a YubiKey or similar hardware key on hand (or intend to use platform authenticators only — both work)
- The risk model justifies it (if Cloudflare Zero Trust already walls off /portal, WebAuthn is a second factor *inside* the locker — belt-and-suspenders)

**Skip it if:**
- Cloudflare Zero Trust is set up (that already means only allowlisted emails reach the portal, and Google's SSO is itself enforcing MFA via your Google account settings — diminishing returns)

My current recommendation: **do Cloudflare Zero Trust first** (Step 1–4 of `CLOUDFLARE-ZERO-TRUST-SETUP.md`). If after living with it for a month you feel you need WebAuthn on top, that's the trigger to schedule this work.
