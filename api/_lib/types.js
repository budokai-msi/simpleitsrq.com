// api/_lib/types.js
//
// Pure JSDoc @typedef declarations shared across api/_lib helpers. This file
// intentionally exports nothing at runtime — it exists so other modules can
// refer to these names via `import('./types.js').TypeName` inside JSDoc
// comments without duplicating the shape in every file.
//
// Add new cross-file types here, and keep file-local shapes inside their
// owning module.

/**
 * The authenticated user shape surfaced by getSession().
 *
 * @typedef {Object} SessionUser
 * @property {string} id
 * @property {string} email
 * @property {string|null} name
 * @property {string|null} avatarUrl
 * @property {string|null} company
 * @property {string|null} phone
 * @property {boolean} isAdmin
 */

/**
 * The session envelope returned by getSession() on a valid session cookie.
 *
 * @typedef {Object} Session
 * @property {string} sessionId
 * @property {SessionUser} user
 */

/**
 * Return value from createSession(): the raw opaque token (for immediate
 * use / tests) plus the serialized Set-Cookie value the handler should send
 * back to the browser.
 *
 * @typedef {Object} SessionIssue
 * @property {string} token   64-char hex, 32 bytes of entropy.
 * @property {string} cookie  Serialized Set-Cookie header value.
 */

/**
 * Return value from destroySession(): the serialized Set-Cookie that clears
 * the session cookie on the browser.
 *
 * @typedef {Object} SessionClear
 * @property {string} cookie
 */

/**
 * Request metadata extracted from proxy headers.
 *
 * @typedef {Object} RequestMeta
 * @property {string|null} ip
 * @property {string|null} ua
 * @property {string|null} country
 * @property {string|null} city
 */

/**
 * Shape of geo data extracted from x-vercel-ip-* headers by
 * security.geoFromHeaders().
 *
 * @typedef {Object} GeoInfo
 * @property {string|null} country
 * @property {string|null} region
 * @property {string|null} city
 * @property {string|null} latitude
 * @property {string|null} longitude
 * @property {string|null} timezone
 */

/**
 * Result of the DB-backed sliding-window rate limiter. `ok` is true when the
 * caller is inside the allowed budget, false when they've exceeded it.
 * `count` may be omitted if the limiter failed open.
 *
 * @typedef {Object} RateLimitResult
 * @property {boolean} ok
 * @property {number} remaining
 * @property {number} [count]
 */

/**
 * Spec argument for validateEnv() — an object keyed by env var name whose
 * values are 'required' or 'optional'.
 *
 * @typedef {Record<string, 'required' | 'optional'>} EnvSpec
 */

/**
 * Per-env-var row returned by envSnapshot().
 *
 * @typedef {Object} EnvVarStatus
 * @property {boolean} set    True when the env var is present and non-empty.
 * @property {string}  masked A redacted preview of the value, or "(unset)".
 */

/**
 * OAuth provider configuration block held in oauth.PROVIDERS. Auth0's
 * URL fields are nullable because they're resolved dynamically from
 * AUTH0_DOMAIN at call time.
 *
 * @typedef {Object} OAuthProviderConfig
 * @property {string|null} authorizeUrl
 * @property {string|null} tokenUrl
 * @property {string|null} userInfoUrl
 * @property {string} [emailsUrl]
 * @property {string} scope
 * @property {string} clientIdEnv
 * @property {string} clientSecretEnv
 */

/**
 * Normalized user profile after fetchUserProfile() has folded the various
 * provider payloads into a common shape.
 *
 * @typedef {Object} OAuthProfile
 * @property {string} providerAccountId
 * @property {string|null} email
 * @property {boolean} emailVerified
 * @property {string|null} name
 * @property {string|null} avatarUrl
 */

/**
 * Row shape for the `users` table as returned by upsertUserFromProfile().
 * Fields mirror the schema; additional columns may be present at runtime.
 *
 * @typedef {Object} UserRow
 * @property {string} id
 * @property {string} email
 * @property {string|null} name
 * @property {string|null} avatar_url
 * @property {string|null} company
 * @property {string|null} phone
 * @property {boolean} is_admin
 */

/**
 * Input for logSecurityEvent(). Most fields are optional because security
 * events are logged from many different contexts (auth, CSRF, rate limit,
 * etc.) and not all have every field available.
 *
 * @typedef {Object} SecurityEventInput
 * @property {string} kind
 * @property {'info' | 'warn' | 'critical'} [severity]
 * @property {string|null} [ip]
 * @property {string|null} [userId]
 * @property {string|null} [userAgent]
 * @property {string|null} [path]
 * @property {Record<string, unknown>|null} [detail]
 */

/**
 * Result shape for auditVerify() — tamper-evident chain verification.
 *
 * @typedef {Object} AuditVerifyResult
 * @property {boolean} ok
 * @property {number} [totalRows]
 * @property {number} [chainedRows]
 * @property {Array<{ id: string|number, reason: string }>} [breaks]
 * @property {string} [error]
 * @property {boolean} [migrationNeeded]
 */

/**
 * Per-feed result of refreshThreatFeeds().
 *
 * @typedef {Object} OsintFeedSummary
 * @property {string} feed
 * @property {boolean} ok
 * @property {number} [fetched]
 * @property {number} [removed]
 * @property {string} [error]
 */

/**
 * Return shape of refreshThreatFeeds().
 *
 * @typedef {Object} OsintRefreshResult
 * @property {boolean} ok
 * @property {number} elapsedMs
 * @property {OsintFeedSummary[]} feeds
 */

/**
 * One OSINT match row (as surfaced in matchOsintFeeds() values).
 *
 * @typedef {Object} OsintMatch
 * @property {string} feed
 * @property {string} category
 * @property {string} cidr
 * @property {string|Date} fetchedAt
 */

/**
 * OSINT status for the admin dashboard.
 *
 * @typedef {Object} OsintStatus
 * @property {boolean} ok
 * @property {Array<{ feed_name: string, cidr_count: number, last_fetched: string|Date }>} [feeds]
 * @property {Array<{ ip: string, country: string|null, ts: string|Date, feed: string, category: string, cidr: string }>} [recentHits]
 * @property {string} [error]
 * @property {boolean} [migrationNeeded]
 */

/**
 * IP-intelligence row as written to / read from the ip_intel cache table.
 * All fields except `ip` are best-effort; any of them may be null when an
 * upstream provider fails or is unconfigured.
 *
 * @typedef {Object} IpIntel
 * @property {string} ip
 * @property {string|null} asn
 * @property {string|null} org
 * @property {string|null} isp
 * @property {string|null} country
 * @property {string|null} region
 * @property {string|null} city
 * @property {boolean} is_datacenter
 * @property {boolean} is_tor
 * @property {boolean} is_proxy
 * @property {boolean} is_vpn
 * @property {number|null} abuse_score
 * @property {number|null} abuse_reports
 * @property {string|null} abuse_last_seen
 * @property {string|null} reverse_dns
 * @property {string|null} rdap_handle
 * @property {string|null} rdap_name
 * @property {string|null} rdap_registrant
 * @property {string|null} rdap_abuse_email
 * @property {string|null} rdap_net_range
 * @property {string|null} rdap_registration_date
 * @property {string|null} rdap_source
 * @property {Record<string, unknown>|null} raw_abuseipdb
 * @property {Record<string, unknown>|null} raw_ipinfo
 * @property {Record<string, unknown>|null} raw_rdap
 * @property {boolean} [is_bot_hostname]
 */

/**
 * Parsed user-agent summary produced by ua.parseUA().
 *
 * @typedef {Object} UAParsed
 * @property {string|null} browser
 * @property {string|null} os
 * @property {string|null} device
 */

/**
 * Honeypot page identifier accepted by getHoneypotPage() / honeypotResponse().
 *
 * @typedef {'login' | 'dashboard' | 'admin' | 'profile'} HoneypotPage
 */

// No runtime exports — this module is JSDoc-only.
export {};
