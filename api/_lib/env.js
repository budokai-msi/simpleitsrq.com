// Startup env-var validation.
//
// WHY THIS EXISTS:
// Vercel serverless functions read process.env lazily — a missing or
// misspelled production secret tends to surface as a cryptic 500 the first
// time a real user hits the endpoint, long after the deploy has been marked
// "Ready". That's a terrible failure mode: the outage is silent, the error
// only shows up in runtime logs, and the root cause (a config gap) is miles
// away from the stack trace.
//
// Instead we validate at MODULE SCOPE in the handlers that depend on a given
// secret. Vercel's Fluid Compute imports the module once per cold start, so
// a throw here surfaces as an immediate, loud, and diagnosable deploy/boot
// failure — the function returns 500 with a clear message in the logs right
// at boot, and the operator sees it the moment they smoke-test the deploy
// instead of six hours later when a customer tries to submit the contact
// form.
//
// DEV / PREVIEW IS PERMISSIVE BY DESIGN:
// Requiring every secret at cold start would break local `vercel dev` and
// preview deploys where iterators often don't have (or shouldn't have) the
// full production secret set. Preserving the existing "fail open in dev"
// behavior matters — a dev running `npm run dev` without a Turnstile secret
// should still be able to submit the contact form. So validateEnv() is
// strict ONLY when NODE_ENV === 'production' or VERCEL_ENV === 'production'.
// Preview/dev log a warning and keep booting.
//
// The module also exposes envSnapshot() so ops tooling can render a masked
// summary of what's configured without ever emitting raw secrets.

/** @typedef {import('./types.js').EnvSpec} EnvSpec */
/** @typedef {import('./types.js').EnvVarStatus} EnvVarStatus */

/**
 * True when the runtime is production on either Node or Vercel.
 *
 * @returns {boolean}
 */
function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/**
 * Return the value of the named env var, or throw with an operator-friendly
 * message if it's unset / empty. Use when the calling code genuinely cannot
 * proceed without the value (e.g. Resend send after body validation).
 *
 * @param {string} name
 * @returns {string}
 * @throws {Error} when the variable is unset or empty.
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `Missing required env var ${name} (set it in Vercel → Settings → Environment Variables)`,
    );
  }
  return value;
}

/**
 * Return the value of the named env var, or the provided fallback. Never
 * throws. Use for truly optional config where a sensible default exists.
 *
 * @template T
 * @param {string} name
 * @param {T} fallback
 * @returns {string | T}
 */
export function optionalEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

/**
 * Validate a group of env vars in one shot. `spec` is an object keyed by env
 * var name whose values are either 'required' or 'optional'. Collects ALL
 * missing required vars and throws a single combined error so the operator
 * sees every gap at once instead of fixing them one cold-start at a time.
 *
 * In non-production environments this only logs a warning, preserving the
 * "fail open for iteration" UX that contact.js and friends already rely on.
 *
 * @param {EnvSpec} spec
 * @returns {void}
 * @throws {Error} in production when any required var is missing.
 */
export function validateEnv(spec) {
  const missing = [];
  for (const [name, requirement] of Object.entries(spec)) {
    if (requirement !== "required") continue;
    const value = process.env[name];
    if (value === undefined || value === null || value === "") {
      missing.push(name);
    }
  }
  if (missing.length === 0) return;

  const message =
    `Missing required env var${missing.length > 1 ? "s" : ""}: ` +
    `${missing.join(", ")} ` +
    `(set in Vercel → Settings → Environment Variables)`;

  if (isProduction()) {
    throw new Error(message);
  }
  // Dev / preview: noisy but non-fatal.
  console.warn(`[env] ${message} — continuing because NODE_ENV !== 'production'`);
}

/**
 * Mask a secret for ops visibility: first 4 + "..." + last 4. For very short
 * values (< 8 chars) we just return "(set)" rather than leak more than half
 * the secret.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
function maskValue(value) {
  if (value === undefined || value === null || value === "") return "(unset)";
  const s = String(value);
  if (s.length < 8) return "(set)";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

/**
 * Return a masked snapshot of the named env vars. Shape:
 *   { DATABASE_URL: { set: true,  masked: "post...uire" },
 *     RESEND_API_KEY: { set: false, masked: "(unset)"   } }
 * Never returns raw secret values — safe to log or expose behind an admin-
 * authenticated debug endpoint.
 *
 * @param {string[] | EnvSpec | null | undefined} names
 *   Either an array of env var names, or an object whose keys are env var names
 *   (typically an EnvSpec — the `required` / `optional` values are ignored).
 * @returns {Record<string, EnvVarStatus>}
 */
export function envSnapshot(names) {
  /** @type {Record<string, EnvVarStatus>} */
  const out = {};
  const list = Array.isArray(names) ? names : Object.keys(names || {});
  for (const name of list) {
    const value = process.env[name];
    const set = !(value === undefined || value === null || value === "");
    out[name] = { set, masked: maskValue(value) };
  }
  return out;
}
