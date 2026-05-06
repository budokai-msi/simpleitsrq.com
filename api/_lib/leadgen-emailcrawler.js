// Per-website email crawler. Given a business URL, fetches the homepage
// plus a small set of likely contact pages, extracts mailto: links and
// regex-matched email strings, and assigns a confidence score to each.
//
// Design constraints:
//   - Pure fetch, no headless browser. JS-rendered SPAs return zero
//     emails — that's acceptable; we deprioritize those leads.
//   - Respect robots.txt at minimum: skip the host entirely if Disallow:
//     covers /. We don't enforce per-path rules; if you put your contact
//     in a Disallow'd folder you don't want to be contacted anyway.
//   - Hard cap on bytes per page (250 KB) and pages per host (6) so a
//     misbehaving site can't tie up a serverless function.
//   - Filter out junk addresses (image extensions, common third-party
//     trackers, sentry / GA / wix support stubs, etc).
//
// Output:
//   {
//     ok, host, pagesFetched, robotsAllowed,
//     emails: [
//       { email, source: 'mailto'|'text', source_url, context_snippet,
//         confidence }
//     ]
//   }

const PAGE_BYTES_CAP   = 250 * 1024;
const HOST_PAGES_CAP   = 6;
const FETCH_TIMEOUT_MS = 8000;

const CONTACT_PATHS = [
  "/contact", "/contact-us", "/contact.html", "/contactus",
  "/about",   "/about-us",   "/about.html",
  "/team",    "/staff",      "/people",
  "/support", "/help",
];

// Email-like substrings we *never* want to keep. Mostly stock template
// placeholders and SaaS support emails that aren't the business owner.
const REJECT_SUBSTR = [
  "example.com", "example.org", "domain.com", "yourdomain",
  "@sentry.io", "@wix.com", "@wixsite", "@squarespace.com",
  "@godaddy.com", "@1and1.com",
  "u003c", "u003e", // escaped HTML brackets that bleed into JSON
];

const REJECT_LOCAL = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "postmaster", "abuse", "webmaster", "hostmaster", "mailer-daemon",
]);

// Match "things that look like email addresses". Conservative — we'd rather
// miss a weird address than absorb HTML/JS noise.
const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,24})/gi;

function ua() {
  return process.env.LEADGEN_USER_AGENT
    || "simpleitsrq-leadgen/1.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function safeUrl(input, base) {
  try { return new URL(input, base).toString(); } catch { return null; }
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua(), Accept: "text/html,*/*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Fetch up to PAGE_BYTES_CAP bytes of body. Streams via the underlying
// Web stream and bails as soon as we hit the cap, so a 50 MB image-rich
// page won't OOM the function.
async function fetchBodyCapped(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { ok: false, status: res.status, body: "", finalUrl: res.url };
  const ct = res.headers.get("content-type") || "";
  if (!/text\/|application\/(xhtml|json)/.test(ct)) {
    return { ok: false, status: 415, body: "", finalUrl: res.url };
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, PAGE_BYTES_CAP), finalUrl: res.url };
  }
  const chunks = [];
  let total = 0;
  while (total < PAGE_BYTES_CAP) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const body = new TextDecoder("utf-8", { fatal: false }).decode(
    new Uint8Array(chunks.flatMap((c) => Array.from(c)))
  );
  return { ok: true, status: res.status, body, finalUrl: res.url };
}

// ---------- robots.txt ----------

async function robotsAllowsRoot(origin) {
  try {
    const r = await fetchWithTimeout(`${origin}/robots.txt`, 4000);
    if (!r.ok) return true; // missing robots.txt → allowed
    const text = await r.text();
    // Walk only the * agent block. If a Disallow: / is present, refuse.
    const lines = text.split(/\r?\n/);
    let inStar = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) inStar = v === "*";
      else if (inStar && /^disallow$/i.test(k) && v === "/") return false;
    }
    return true;
  } catch {
    return true;
  }
}

// ---------- email extraction ----------

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  if (REJECT_SUBSTR.some((s) => lower.includes(s))) return true;
  const local = lower.split("@")[0];
  if (REJECT_LOCAL.has(local)) return true;
  // Filter image-like @ patterns ("foo@2x.png" sneaks through EMAIL_RE).
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(lower)) return true;
  return false;
}

function snippet(body, idx, len) {
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + len + 60);
  return body.slice(start, end).replace(/\s+/g, " ").trim();
}

// Extract { mailto: [...], text: [...] } from an HTML page body. Each
// item carries the original snippet for review and the page URL.
function extractFromPage(body, pageUrl) {
  const found = new Map(); // email -> entry (keep best)
  // 1. mailto: links — highest confidence
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#]+)/gi;
  let m;
  while ((m = mailtoRe.exec(body)) !== null) {
    const raw = decodeURIComponent(m[1]).trim().toLowerCase();
    if (!raw || isJunkEmail(raw)) continue;
    const entry = {
      email: raw,
      source: "website_mailto",
      source_url: pageUrl,
      context_snippet: snippet(body, m.index, m[0].length),
      confidence: 1.0,
    };
    found.set(raw, entry);
  }
  // 2. plain-text email regex matches
  let m2;
  EMAIL_RE.lastIndex = 0;
  while ((m2 = EMAIL_RE.exec(body)) !== null) {
    const raw = m2[0].toLowerCase();
    if (isJunkEmail(raw)) continue;
    if (found.has(raw)) continue;
    const local = raw.split("@")[0];
    // Role addresses (info@, sales@, contact@, hello@) score higher than
    // a random handle scraped from a footer link to a personal blog.
    const roleAddrs = new Set(["info","sales","contact","hello","support","admin","office","reception"]);
    const conf = roleAddrs.has(local) ? 0.8 : 0.5;
    found.set(raw, {
      email: raw,
      source: "website_text",
      source_url: pageUrl,
      context_snippet: snippet(body, m2.index, m2[0].length),
      confidence: conf,
    });
  }
  return Array.from(found.values());
}

// Pick contact-page candidates from the homepage HTML — anchor hrefs that
// look like /contact, /about, etc. Caps at HOST_PAGES_CAP - 1.
function extractContactCandidates(homepageBody, origin) {
  const set = new Set();
  for (const p of CONTACT_PATHS) set.add(`${origin}${p}`);
  const linkRe = /href\s*=\s*["']([^"'#]+)/gi;
  let m;
  while ((m = linkRe.exec(homepageBody)) !== null && set.size < HOST_PAGES_CAP * 4) {
    const u = safeUrl(m[1], origin);
    if (!u) continue;
    if (originOf(u) !== origin) continue;
    const path = new URL(u).pathname.toLowerCase();
    if (CONTACT_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      set.add(u);
    }
  }
  return Array.from(set);
}

// ---------- public entry ----------

export async function crawlEmails(websiteUrl) {
  const origin = originOf(websiteUrl);
  if (!origin) return { ok: false, error: "invalid_url", emails: [] };

  const robotsAllowed = await robotsAllowsRoot(origin);
  if (!robotsAllowed) {
    return { ok: true, host: origin, robotsAllowed: false, pagesFetched: 0, emails: [] };
  }

  // 1. Fetch homepage.
  const home = await fetchBodyCapped(origin).catch((e) => ({ ok: false, error: String(e.message || e) }));
  if (!home.ok) {
    return { ok: false, host: origin, error: home.error || `home_${home.status}`, emails: [] };
  }

  const out = new Map();
  for (const e of extractFromPage(home.body, home.finalUrl)) out.set(e.email, e);

  // 2. Fetch contact-ish pages, deduplicating against the homepage.
  const candidates = extractContactCandidates(home.body, origin).slice(0, HOST_PAGES_CAP - 1);
  let pagesFetched = 1;
  for (const url of candidates) {
    if (pagesFetched >= HOST_PAGES_CAP) break;
    const r = await fetchBodyCapped(url).catch(() => null);
    if (!r || !r.ok) continue;
    pagesFetched += 1;
    for (const e of extractFromPage(r.body, r.finalUrl)) {
      const prev = out.get(e.email);
      if (!prev || e.confidence > prev.confidence) out.set(e.email, e);
    }
  }

  return {
    ok: true,
    host: origin,
    robotsAllowed: true,
    pagesFetched,
    emails: Array.from(out.values()).sort((a, b) => b.confidence - a.confidence),
  };
}
