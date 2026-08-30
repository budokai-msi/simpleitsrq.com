// Bounded public website contact finder for Leadgen.
// Purposefully narrow: contact details, contact-form/social evidence, and a
// small brand asset discovered from the same public pages.
// No DNS scoring, domain-age scoring, PageSpeed, or technology fingerprinting.

import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";

const PAGE_BYTES_CAP = 220 * 1024;
const HOST_PAGES_CAP = 4;
const FETCH_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 3;
const BRAND_BYTES_CAP = 48 * 1024;
const BRAND_FETCH_TIMEOUT_MS = 4500;
const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/staff"];
const REJECT_SUBSTR = ["example.com", "example.org", "domain.com", "yourdomain", "@sentry.io", "@wix.com", "@wixsite", "@squarespace.com", "u003c", "u003e"];
const REJECT_LOCAL = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "abuse", "webmaster", "hostmaster", "mailer-daemon"]);
const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,24})/gi;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);

function ua() {
  // Present as a normal recent Chrome on Windows. Custom UAs ("simpleitsrq-leadgen/3.1")
  // trip WAF bot-blocking rules at Cloudflare/PerimeterX/Akamai even when
  // robots.txt would allow the crawl. The contact-discovery use case is
  // narrow (4 pages max per host) and explicitly opt-in via the Find
  // contacts button, so a stock browser UA is appropriate. Override via
  // LEADGEN_USER_AGENT if you ever need a stricter identifying UA for
  // robots.txt compliance audits.
  return process.env.LEADGEN_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
}

function isPrivateAddress(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
      || p[0] >= 224;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower);
  }
  return true;
}

async function assertPublicUrl(input) {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported_protocol");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("private_host");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("private_host");
    return url;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("private_host");
  return url;
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function safeUrl(input, base) {
  try {
    const url = new URL(input, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}

async function fetchWithTimeout(input, ms = FETCH_TIMEOUT_MS, redirects = 0, { followRedirects = true } = {}) {
  const url = await assertPublicUrl(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, {
      // Stock browser headers so the request blends with normal traffic.
      // Sites behind Cloudflare or other WAFs often allow-list common
      // browser Accept / Accept-Language combos and reject anything that
      // looks "off" even when the UA itself is a real browser string.
      //
      // Skip Upgrade-Insecure-Requests: that header tells servers to
      // upgrade an http:// request to https://, which is exactly what
      // we DON'T want when we're falling back from a failing HTTPS
      // origin to plain HTTP.
      headers: {
        "User-Agent": ua(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (followRedirects && response.status >= 300 && response.status < 400) {
      if (redirects >= MAX_REDIRECTS) throw new Error("too_many_redirects");
      const location = response.headers.get("location");
      if (!location) return response;
      return fetchWithTimeout(new URL(location, url).toString(), ms, redirects + 1, { followRedirects });
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function readBytesCapped(res, cap, { truncate = false } = {}) {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > cap && !truncate) throw new Error("asset_too_large");
  const reader = res.body?.getReader();
  if (!reader) {
    if (declared > cap) throw new Error("asset_too_large");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > cap) throw new Error("asset_too_large");
    return bytes;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.length > cap) {
      if (!truncate) {
        try { await reader.cancel(); } catch {}
        throw new Error("asset_too_large");
      }
      const remaining = cap - total;
      if (remaining > 0) {
        chunks.push(value.slice(0, remaining));
        total += remaining;
      }
      try { await reader.cancel(); } catch {}
      break;
    }
    chunks.push(value);
    total += value.length;
    if (truncate && total >= cap) {
      try { await reader.cancel(); } catch {}
      break;
    }
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

async function fetchBodyCapped(url, opts = {}) {
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, 0, opts);
  if (!res.ok) return { ok: false, status: res.status, body: "", finalUrl: res.url, headers: res.headers };
  const contentType = res.headers.get("content-type") || "";
  if (!/text\/|application\/xhtml/i.test(contentType)) return { ok: false, status: 415, body: "", finalUrl: res.url, headers: res.headers };
  const bytes = await readBytesCapped(res, PAGE_BYTES_CAP, { truncate: true });
  return { ok: true, status: res.status, body: new TextDecoder().decode(bytes), finalUrl: res.url, headers: res.headers };
}

async function robotsAllowsRoot(origin) {
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, 3500);
    if (!response.ok) return true;
    const text = await response.text();
    let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      const index = line.indexOf(":");
      if (index < 0) continue;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      if (key === "user-agent") applies = value === "*";
      if (applies && key === "disallow" && value === "/") return false;
    }
    return true;
  } catch { return true; }
}

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  if (REJECT_SUBSTR.some((part) => lower.includes(part))) return true;
  const local = lower.split("@")[0];
  if (REJECT_LOCAL.has(local)) return true;
  return /\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(lower);
}

function snippet(body, index, len) {
  return body.slice(Math.max(0, index - 60), Math.min(body.length, index + len + 60)).replace(/\s+/g, " ").trim();
}

function extractEmails(body, pageUrl) {
  const found = new Map();
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#]+)/gi;
  let match;
  while ((match = mailtoRe.exec(body)) !== null) {
    let raw = "";
    try { raw = decodeURIComponent(match[1]).trim().toLowerCase(); } catch { raw = match[1].trim().toLowerCase(); }
    if (!raw || isJunkEmail(raw)) continue;
    found.set(raw, { email: raw, source: "website_mailto", source_url: pageUrl, context_snippet: snippet(body, match.index, match[0].length), confidence: 1.0 });
  }
  EMAIL_RE.lastIndex = 0;
  let textMatch;
  while ((textMatch = EMAIL_RE.exec(body)) !== null) {
    const raw = textMatch[0].toLowerCase();
    if (isJunkEmail(raw) || found.has(raw)) continue;
    const role = new Set(["info", "sales", "contact", "hello", "support", "office", "reception"]);
    found.set(raw, { email: raw, source: "website_text", source_url: pageUrl, context_snippet: snippet(body, textMatch.index, textMatch[0].length), confidence: role.has(raw.split("@")[0]) ? 0.8 : 0.55 });
  }
  return Array.from(found.values());
}

function walkLogo(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkLogo(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    if (value.logo) {
      const found = walkLogo(value.logo);
      if (found) return found;
    }
    for (const key of ["url", "contentUrl", "@id"]) {
      if (typeof value[key] === "string") return value[key];
    }
    if (value["@graph"]) return walkLogo(value["@graph"]);
  }
  return null;
}

function brandCandidates($, pageUrl) {
  const out = [];
  const add = (href, type, confidence) => {
    const url = safeUrl(href, pageUrl);
    if (!url || out.some((item) => item.url === url)) return;
    out.push({ url, type, confidence });
  };

  $('link[rel~="apple-touch-icon"][href]').each((_, el) => add($(el).attr("href"), "apple-touch-icon", 1.0));
  $('link[rel~="icon"][href]').each((_, el) => add($(el).attr("href"), "favicon", 0.95));

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const logo = walkLogo(parsed);
      if (logo) add(logo, "structured-logo", 0.9);
    } catch {}
  });

  $('img[src]').each((_, el) => {
    const node = $(el);
    const hint = `${node.attr("id") || ""} ${node.attr("class") || ""} ${node.attr("alt") || ""}`.toLowerCase();
    if (/\blogo\b|brand/.test(hint)) add(node.attr("src"), "page-logo", 0.82);
  });

  const og = $('meta[property="og:image"][content]').first().attr("content");
  if (og) add(og, "open-graph", 0.45);

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function extractDocumentSignals(body, finalUrl) {
  const $ = cheerio.load(String(body || ""));
  const social = {};
  const socialPatterns = {
    linkedin: /(?:^|\.)linkedin\.com$/i,
    facebook: /(?:^|\.)facebook\.com$/i,
    instagram: /(?:^|\.)instagram\.com$/i,
  };

  $("a[href]").each((_, el) => {
    const href = safeUrl($(el).attr("href"), finalUrl);
    if (!href) return;
    try {
      const host = new URL(href).hostname;
      for (const [key, pattern] of Object.entries(socialPatterns)) {
        if (!social[key] && pattern.test(host)) social[key] = href;
      }
    } catch {}
  });

  const hasContactForm = $("form").toArray().some((el) => {
    const node = $(el);
    const text = `${node.attr("id") || ""} ${node.attr("class") || ""} ${node.text()}`.toLowerCase();
    return /contact|message|inquiry|quote|email/.test(text);
  });

  return {
    source: "website_contact_check",
    source_url: finalUrl,
    fetched_at: new Date().toISOString(),
    has_contact_form: hasContactForm,
    social,
    brand_candidates: brandCandidates($, finalUrl),
  };
}

function extractContactLinks(body, origin) {
  const $ = cheerio.load(String(body || ""));
  const set = new Set(CONTACT_PATHS.map((path) => `${origin}${path}`));
  $("a[href]").each((_, el) => {
    if (set.size >= HOST_PAGES_CAP * 4) return;
    const url = safeUrl($(el).attr("href"), origin);
    if (!url || originOf(url) !== origin) return;
    const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
    if (CONTACT_PATHS.some((candidate) => path === candidate || path.startsWith(`${candidate}/`))) set.add(url);
  });
  return Array.from(set);
}

async function resolveBrandAsset(candidates) {
  for (const candidate of candidates || []) {
    try {
      const response = await fetchWithTimeout(candidate.url, BRAND_FETCH_TIMEOUT_MS);
      if (!response.ok) continue;
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!IMAGE_TYPES.has(contentType)) continue;
      const bytes = await readBytesCapped(response, BRAND_BYTES_CAP);
      if (!bytes.length) continue;
      return {
        type: candidate.type,
        confidence: candidate.confidence,
        source_url: candidate.url,
        content_type: contentType,
        bytes: bytes.length,
        data_uri: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
      };
    } catch {}
  }
  return null;
}

// Classify a fetch() rejection into our short error-code vocabulary.
// Node's undici-based fetch wraps every network failure as a TypeError;
// the underlying cause is on err.cause. We surface a friendly code
// rather than leaking "TypeError: fetch failed" / SSL codes.
function classifyFetchError(error) {
  // AbortController timeout → AbortError
  if (error?.name === "AbortError") {
    return { ok: false, status: undefined, error: "timeout" };
  }
  const cause = error?.cause;
  const causeCode = String(cause?.code || cause?.errno || "").toUpperCase();
  const causeMsg = String(cause?.message || error?.message || "").toLowerCase();
  // SSL/TLS handshake problems (hostname mismatch, expired, untrusted CA).
  // WordPress.com parking pages, GoDaddy landers, and stale certs hit this.
  if (
    causeCode === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    causeCode === "CERT_HAS_EXPIRED" ||
    causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    causeCode === "SELF_SIGNED_CERT_IN_CHAIN" ||
    causeCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    causeCode === "ERR_TLS_CERT_ALTNAME" ||
    causeCode === "EPROTO" ||
    /wrong principal|cert.*(expired|invalid|mismatch|untrusted)|self.signed/i.test(causeMsg)
  ) {
    return { ok: false, status: undefined, error: "ssl_error" };
  }
  // DNS resolution failure
  if (causeCode === "ENOTFOUND" || /getaddrinfo.*notfound/i.test(causeMsg)) {
    return { ok: false, status: undefined, error: "dns_failure" };
  }
  // Connection refused / network unreachable
  if (causeCode === "ECONNREFUSED" || causeCode === "ECONNRESET" ||
      causeCode === "ENETUNREACH" || causeCode === "EHOSTUNREACH" ||
      causeCode === "ETIMEDOUT" || causeCode === "EAI_AGAIN") {
    return { ok: false, status: undefined, error: "connection_error" };
  }
  // Generic network failure fallback (the literal "fetch failed" TypeError
  // surfaces when undici can't categorize the cause).
  return { ok: false, status: undefined, error: String(error?.message || "unreachable") };
}

// Map the classification result to a stable short code. Centralized so
// the API layer only has to know one vocabulary.
function mapFetchErrorToCode(home) {
  // Classification from classifyFetchError
  if (home.error && ["timeout", "ssl_error", "dns_failure", "connection_error"].includes(home.error)) {
    return home.error;
  }
  // asset_too_large comes from fetchBodyCapped's read path, not from
  // the network — pass through if we ever see it here.
  if (home.error === "asset_too_large") return "too_large";
  // HTTP status-based errors
  if (home.status === 403) return "forbidden";
  if (home.status === 404) return "not_found";
  if (home.status === 410) return "gone";
  if (home.status === 415) return "wrong_type";
  if (home.status === 429) return "rate_limited";
  if (home.status === 500 || home.status === 502 || home.status === 503 || home.status === 504) {
    return "server_error";
  }
  return "unreachable";
}

export async function crawlEmails(websiteUrl) {
  const origin = originOf(websiteUrl);
  if (!origin) return { ok: false, error: "invalid_url", emails: [], websiteSignals: null };
  try { await assertPublicUrl(origin); }
  catch { return { ok: false, error: "unsafe_host", emails: [], websiteSignals: null }; }

  const robotsAllowed = await robotsAllowsRoot(origin);
  if (!robotsAllowed) return { ok: true, host: origin, robotsAllowed: false, pagesFetched: 0, emails: [], websiteSignals: null };

  let home = await fetchBodyCapped(origin).catch((error) => classifyFetchError(error));
  // SSL handshake failure is often a parked domain or stale cert. Try
  // HTTP as a fallback before giving up — many parked domains respond
  // on HTTP with a clearer "domain not found" 404, which the UI can
  // present accurately instead of a confusing certificate message.
  if (!home.ok && home.error === "ssl_error") {
    const httpOrigin = origin.replace(/^https:/i, "http:");
    if (httpOrigin !== origin) {
      // Disable redirect following on the fallback: a 301 → https on
      // plain HTTP would otherwise loop us back onto the failing
      // HTTPS origin. A parked domain that returns 404 on HTTP is the
      // signal we want to surface, not a loop back to SSL.
      const fallback = await fetchBodyCapped(httpOrigin, { followRedirects: false }).catch((error) => classifyFetchError(error));
      // Priority for choosing what to report:
      //   1. HTTP 404 (parked domain) wins — most actionable signal.
      //   2. HTTP 2xx success wins — HTTP version of the site works
      //      (rare but possible; e.g. dev environments).
      //   3. HTTP 3xx that redirects back to https on the same host
      //      is the same SSL problem — keep ssl_error.
      //   4. Anything else (5xx, network error on HTTP, weird 3xx)
      //      keeps ssl_error because HTTPS was the real failure.
      const fallbackLocation = fallback?.headers?.get?.("location") || "";
      const fallbackPointsBack = /^https:/i.test(fallbackLocation) && fallbackLocation.includes(new URL(origin).hostname);
      if (fallback.ok === false && fallback.status === 404) {
        home = fallback;
      } else if (fallback.ok) {
        home = fallback;
      } else if (fallbackPointsBack) {
        // Keep the original ssl_error.
      } else {
        // Keep the original ssl_error — HTTP didn't give us anything better.
      }
    }
  }
  if (!home.ok) {
    // Translate raw HTTP status codes into user-facing copy. The UI used
    // to show "home_403" / "home_404" / "home_500" — leaked internal
    // jargon. Now we hand back a short code that the API layer maps to a
    // real sentence.
    const errorCode = mapFetchErrorToCode(home);
    return { ok: false, host: origin, error: errorCode, emails: [], websiteSignals: null };
  }

  const homeSignals = extractDocumentSignals(home.body, home.finalUrl);
  const websiteSignals = {
    source: homeSignals.source,
    source_url: homeSignals.source_url,
    fetched_at: homeSignals.fetched_at,
    has_contact_form: homeSignals.has_contact_form,
    social: homeSignals.social,
    brand_asset: await resolveBrandAsset(homeSignals.brand_candidates),
  };

  const out = new Map();
  for (const email of extractEmails(home.body, home.finalUrl)) out.set(email.email, email);

  const candidates = extractContactLinks(home.body, origin).slice(0, HOST_PAGES_CAP - 1);
  let pagesFetched = 1;
  for (const url of candidates) {
    if (pagesFetched >= HOST_PAGES_CAP) break;
    const response = await fetchBodyCapped(url).catch(() => null);
    if (!response?.ok) continue;
    pagesFetched += 1;
    for (const email of extractEmails(response.body, response.finalUrl)) {
      const previous = out.get(email.email);
      if (!previous || email.confidence > previous.confidence) out.set(email.email, email);
    }
    const extra = extractDocumentSignals(response.body, response.finalUrl);
    websiteSignals.has_contact_form ||= extra.has_contact_form;
    websiteSignals.social = { ...websiteSignals.social, ...extra.social };
    if (!websiteSignals.brand_asset && extra.brand_candidates.length) {
      websiteSignals.brand_asset = await resolveBrandAsset(extra.brand_candidates);
    }
  }

  websiteSignals.pages_fetched = pagesFetched;
  websiteSignals.robots_allowed = true;
  return {
    ok: true,
    host: origin,
    robotsAllowed: true,
    pagesFetched,
    websiteSignals,
    emails: Array.from(out.values()).sort((a, b) => b.confidence - a.confidence),
  };
}
