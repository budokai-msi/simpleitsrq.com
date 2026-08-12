// Per-website email crawler and lightweight website intelligence extractor.
// Fetches a bounded set of public pages, respects root robots.txt, extracts
// contact emails plus observable site signals that help explain prospect fit.

const PAGE_BYTES_CAP = 250 * 1024;
const HOST_PAGES_CAP = 6;
const FETCH_TIMEOUT_MS = 8000;

const CONTACT_PATHS = [
  "/contact", "/contact-us", "/contact.html", "/contactus",
  "/about", "/about-us", "/about.html", "/team", "/staff", "/people",
  "/support", "/help",
];

const REJECT_SUBSTR = [
  "example.com", "example.org", "domain.com", "yourdomain",
  "@sentry.io", "@wix.com", "@wixsite", "@squarespace.com",
  "@godaddy.com", "@1and1.com", "u003c", "u003e",
];
const REJECT_LOCAL = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "postmaster", "abuse", "webmaster", "hostmaster", "mailer-daemon",
]);
const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,24})/gi;

function ua() {
  return process.env.LEADGEN_USER_AGENT
    || "simpleitsrq-leadgen/1.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
}
function originOf(url) { try { return new URL(url).origin; } catch { return null; } }
function safeUrl(input, base) { try { return new URL(input, base).toString(); } catch { return null; } }

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": ua(), Accept: "text/html,*/*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}

async function fetchBodyCapped(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { ok: false, status: res.status, body: "", finalUrl: res.url, headers: res.headers };
  const ct = res.headers.get("content-type") || "";
  if (!/text\/|application\/(xhtml|json)/.test(ct)) {
    return { ok: false, status: 415, body: "", finalUrl: res.url, headers: res.headers };
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, PAGE_BYTES_CAP), finalUrl: res.url, headers: res.headers };
  }
  const chunks = [];
  let total = 0;
  while (total < PAGE_BYTES_CAP) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.length; }
  }
  try { await reader.cancel(); } catch {}
  const body = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(chunks.flatMap((c) => Array.from(c))));
  return { ok: true, status: res.status, body, finalUrl: res.url, headers: res.headers };
}

async function robotsAllowsRoot(origin) {
  try {
    const r = await fetchWithTimeout(`${origin}/robots.txt`, 4000);
    if (!r.ok) return true;
    const text = await r.text();
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
  } catch { return true; }
}

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  if (REJECT_SUBSTR.some((s) => lower.includes(s))) return true;
  const local = lower.split("@")[0];
  if (REJECT_LOCAL.has(local)) return true;
  return /\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(lower);
}
function snippet(body, idx, len) {
  return body.slice(Math.max(0, idx - 60), Math.min(body.length, idx + len + 60)).replace(/\s+/g, " ").trim();
}
function extractFromPage(body, pageUrl) {
  const found = new Map();
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#]+)/gi;
  let m;
  while ((m = mailtoRe.exec(body)) !== null) {
    const raw = decodeURIComponent(m[1]).trim().toLowerCase();
    if (!raw || isJunkEmail(raw)) continue;
    found.set(raw, { email: raw, source: "website_mailto", source_url: pageUrl, context_snippet: snippet(body, m.index, m[0].length), confidence: 1.0 });
  }
  let m2;
  EMAIL_RE.lastIndex = 0;
  while ((m2 = EMAIL_RE.exec(body)) !== null) {
    const raw = m2[0].toLowerCase();
    if (isJunkEmail(raw) || found.has(raw)) continue;
    const roleAddrs = new Set(["info","sales","contact","hello","support","admin","office","reception"]);
    const conf = roleAddrs.has(raw.split("@")[0]) ? 0.8 : 0.5;
    found.set(raw, { email: raw, source: "website_text", source_url: pageUrl, context_snippet: snippet(body, m2.index, m2[0].length), confidence: conf });
  }
  return Array.from(found.values());
}
function extractContactCandidates(homepageBody, origin) {
  const set = new Set(CONTACT_PATHS.map((p) => `${origin}${p}`));
  const linkRe = /href\s*=\s*["']([^"'#]+)/gi;
  let m;
  while ((m = linkRe.exec(homepageBody)) !== null && set.size < HOST_PAGES_CAP * 4) {
    const u = safeUrl(m[1], origin);
    if (!u || originOf(u) !== origin) continue;
    const path = new URL(u).pathname.toLowerCase();
    if (CONTACT_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) set.add(u);
  }
  return Array.from(set);
}

function extractWebsiteSignals(body, finalUrl, headers) {
  const html = String(body || "");
  const lower = html.toLowerCase();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] || null;
  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() || null;
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() || null;
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasContactForm = /<form[\s\S]{0,8000}(contact|message|inquiry|quote|email)/i.test(html);
  const hasCareers = /href=["'][^"']*(careers|jobs|join-us|employment)/i.test(html) || /\b(careers|we'?re hiring|join our team)\b/i.test(text);
  const hasBooking = /href=["'][^"']*(calendly|acuityscheduling|book|appointment|schedule)/i.test(html);
  const phoneVisible = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text);
  const social = {
    linkedin: /linkedin\.com/i.test(lower), facebook: /facebook\.com/i.test(lower),
    instagram: /instagram\.com/i.test(lower), youtube: /youtube\.com|youtu\.be/i.test(lower),
  };
  const tech = [];
  const detectors = [
    ["WordPress", /wp-content|wp-includes|wordpress/i], ["Wix", /wixstatic|wix\.com/i],
    ["Squarespace", /squarespace/i], ["Shopify", /cdn\.shopify|shopify/i],
    ["Webflow", /webflow/i], ["HubSpot", /hubspot|hs-scripts/i],
    ["Google Analytics", /googletagmanager|google-analytics|gtag\(/i],
  ];
  for (const [name, re] of detectors) if (re.test(html)) tech.push(name);
  const yearMatches = Array.from(text.matchAll(/\b(?:19|20)\d{2}\b/g)).map((m) => Number(m[0])).filter((y) => y >= 1900 && y <= new Date().getFullYear());
  const earliestYearMention = yearMatches.length ? Math.min(...yearMatches) : null;
  return {
    source: "website_observation",
    source_url: finalUrl,
    fetched_at: new Date().toISOString(),
    title, description, generator,
    secure: finalUrl.startsWith("https://"),
    server: headers?.get?.("server") || null,
    has_viewport: hasViewport,
    has_schema: hasSchema,
    has_contact_form: hasContactForm,
    has_careers_signal: hasCareers,
    has_booking_signal: hasBooking,
    phone_visible: phoneVisible,
    social,
    technologies: tech,
    text_length: text.length,
    earliest_year_mention: earliestYearMention,
  };
}

export async function crawlEmails(websiteUrl) {
  const origin = originOf(websiteUrl);
  if (!origin) return { ok: false, error: "invalid_url", emails: [], websiteSignals: null };
  const robotsAllowed = await robotsAllowsRoot(origin);
  if (!robotsAllowed) return { ok: true, host: origin, robotsAllowed: false, pagesFetched: 0, emails: [], websiteSignals: null };

  const home = await fetchBodyCapped(origin).catch((e) => ({ ok: false, error: String(e.message || e) }));
  if (!home.ok) return { ok: false, host: origin, error: home.error || `home_${home.status}`, emails: [], websiteSignals: null };

  const websiteSignals = extractWebsiteSignals(home.body, home.finalUrl, home.headers);
  const out = new Map();
  for (const e of extractFromPage(home.body, home.finalUrl)) out.set(e.email, e);
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
    websiteSignals,
    emails: Array.from(out.values()).sort((a, b) => b.confidence - a.confidence),
  };
}
