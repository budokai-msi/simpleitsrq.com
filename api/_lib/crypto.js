// Application-level encryption for integration credentials (CRM API keys,
// webhook secrets, etc.).
//
// WHY: storing third-party API keys as plaintext jsonb relies on Neon's
// disk-level TDE, which protects against a stolen disk but NOT against anyone
// who can read the table (a leaked DATABASE_URL, a SQL-injection, a backup
// dump, a curious operator). For secrets that grant access to a customer's
// CRM, that's not good enough — we encrypt at the application layer so the
// ciphertext is useless without INTEGRATIONS_ENC_KEY, which lives only in the
// serverless runtime env, never in the database.
//
// AES-256-GCM (authenticated): the stored token is base64(iv[12] | ct | tag[16]).
// Wrapped in a small envelope { v, data } so we can rotate the scheme later
// and so legacy plaintext rows (written before this shipped) still decode.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { optionalEnv } from "./env.js";

const ALGO = "aes-256-gcm";

function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/** @returns {Buffer | null} the 32-byte key, or null if unset. */
function getKey() {
  const raw = optionalEnv("INTEGRATIONS_ENC_KEY", "");
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "INTEGRATIONS_ENC_KEY must be a base64-encoded 32-byte key " +
      "(generate: `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`)",
    );
  }
  return key;
}

/** True when an encryption key is configured. */
export function encryptionAvailable() {
  return getKey() !== null;
}

/**
 * Encrypt a JSON-serialisable config object into a storage envelope.
 * Production REQUIRES a key (never silently stores plaintext). Dev/preview
 * without a key falls back to a clearly-marked, reversible v:0 envelope so
 * local iteration keeps working — and so an un-keyed value is never mistaken
 * for real ciphertext.
 *
 * @param {Record<string, unknown>} obj
 * @returns {{ v: number, data: string }}
 */
export function encryptSecret(obj) {
  const plaintext = Buffer.from(JSON.stringify(obj ?? {}), "utf8");
  const key = getKey();
  if (!key) {
    if (isProduction()) {
      throw new Error(
        "INTEGRATIONS_ENC_KEY is required to store integration credentials in production",
      );
    }
    return { v: 0, data: plaintext.toString("base64") };
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, data: Buffer.concat([iv, ct, tag]).toString("base64") };
}

/**
 * Reverse {@link encryptSecret}. Also tolerates:
 *  - legacy plaintext rows: a bare config object with no { v, data } envelope.
 *  - v:0 dev envelopes (base64 plaintext).
 *
 * @param {unknown} stored  the value read from user_integrations.config
 * @returns {Record<string, unknown>}
 */
export function decryptSecret(stored) {
  if (!stored || typeof stored !== "object") return {};
  const env = /** @type {Record<string, unknown>} */ (stored);

  // Legacy plaintext: config written directly (no envelope). Pass through.
  if (env.v === undefined && typeof env.data !== "string") return env;

  if (env.v === 0) {
    try {
      return JSON.parse(Buffer.from(String(env.data), "base64").toString("utf8"));
    } catch {
      return {};
    }
  }

  if (env.v === 1) {
    const key = getKey();
    if (!key) {
      throw new Error(
        "INTEGRATIONS_ENC_KEY is missing — cannot decrypt integration credentials",
      );
    }
    const buf = Buffer.from(String(env.data), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString("utf8"));
  }

  return {};
}
