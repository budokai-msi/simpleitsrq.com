// Bounded public website contact finder for Leadgen.
// Purposefully narrow: emails, contact-form presence, and public social links.
// No DNS scoring, domain-age scoring, PageSpeed, technology fingerprinting, or
// speculative business signals.

import dns from "node:dns/promises";
import net from "node:net";

const PAGE_BYTES_CAP = 220 * 1024;
const HOST_PAGES_CAP = 4;
const FETCH_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 3;
const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/staff"];
const REJECT_SUBSTR = ["example.com", "example.org", "domain.com", "yourdomain", "@sentry.io", "@wix.com", "@wixsite", "@squarespace.com", "u003c", "u003e"];
const REJECT_LOCAL = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "abuse", "webmaster", "hostmaster", "mailer-daemon"]);
const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,24})/gi;

function ua() {
  return process.env.LEADGEN_USER_AGENT || "simpleitsrq-leadgen/3.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
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
  try { return new URL(input, base).toString(); } catch { return null; }
}

async function fetchWithTimeout(input, ms = FETCH_TIMEOUT_MS, redirects = 0) {
  const url = await assertPublicUrl(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": ua(), Accept: "text/html,text/plain,*/*;q=0.5" },
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= MAX_REDIRECTS) throw new Error("too_many_redirects");
      const location = response.headers.get("location");
      if (!location) return response;
      return fetchWithTimeout(new URL(location, url).toString(), ms, redirects + 1);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBodyCapped(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { ok: false, status: res.status, body: "", finalUrl: res.url, headers: res.headers };
  const contentType = res.headers.get("content-type") || "";
  if (!/text\/|application\/xhtml/i.test(contentType)) return { ok: false, status: 415, body: "", finalUrl: res.url, headers: res.headers };
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
    if (!value) continue;
    const remaining = PAGE_BYTES_CAP - total;
    chunks.push(value.slice(0, remaining));
    total += Math.min(value.length, remaining);
  }
  try { await reader.cancel(); } catch {}
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return { ok: true, status: res.status, body: new TextDecoder().decode(joined), finalUrl: res.url, headers: res.headers };
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

function extractContactLinks(homepageBody, origin) {
  const set = new Set(CONTACT_PATHS.map((path) => `${origin}${path}`));
  const linkRe = /href\s*=\s*["']([^"'#]+)/gi;
  let match;
  while ((match = linkRe.exec(homepageBody)) !== null && set.size < HOST_PAGES_CAP * 4) {
    const url = safeUrl(match[1], origin);
    if (!url || originOf(url) !== origin) continue;
    const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
    if (CONTACT_PATHS.some((candidate) => path === candidate || path.startsWith(`${candidate}/`))) set.add(url);
  }
  return Array.from(set);
}

function extractContactSignals(body, finalUrl) {
  const html = String(body || "");
  const social = {};
  const patterns = {
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s<>]+/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>]+/i,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = html.match(pattern);
    if (match) social[key] = match[0].replace(/&amp;/g, "&");
  }
  return {
    source: "website_contact_check",
    source_url: finalUrl,
    fetched_at: new Date().toISOString(),
    has_contact_form: /<form[\s\S]{0,10000}(contact|message|inquiry|quote|email)/i.test(html),
    social,
  };
}

export async function crawlEmails(websiteUrl) {
  const origin = originOf(websiteUrl);
  if (!origin) return { ok: false, error: "invalid_url", emails: [], websiteSignals: null };
  try { await assertPublicUrl(origin); }
  catch { return { ok: false, error: "unsafe_host", emails: [], websiteSignals: null }; }

  const robotsAllowed = await robotsAllowsRoot(origin);
  if (!robotsAllowed) return { ok: true, host: origin, robotsAllowed: false, pagesFetched: 0, emails: [], websiteSignals: null };

  const home = await fetchBodyCapped(origin).catch((error) => ({ ok: false, error: String(error?.message || error) }));
  if (!home.ok) return { ok: false, host: origin, error: home.error || `home_${home.status}`, emails: [], websiteSignals: null };

  const websiteSignals = extractContactSignals(home.body, home.finalUrl);
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
    const extraSignals = extractContactSignals(response.body, response.finalUrl);
    websiteSignals.has_contact_form ||= extraSignals.has_contact_form;
    websiteSignals.social = { ...websiteSignals.social, ...extraSignals.social };
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
