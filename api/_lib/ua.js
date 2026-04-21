// api/_lib/ua.js — tiny user-agent classifier.
//
// We deliberately do not ship a heavy npm parser (ua-parser-js, bowser…).
// For visitor analytics we only need "what's the browser family, OS, and
// form factor". Anything more accurate comes from the raw UA string which
// we also store verbatim.

/** @typedef {import('./types.js').UAParsed} UAParsed */

/**
 * Classify a user-agent string into a coarse { browser, os, device } triple
 * for analytics. Returns all-null fields when given an empty / nullish UA.
 *
 * @param {string} [ua]
 * @returns {UAParsed}
 */
export function parseUA(ua = "") {
  if (!ua) return { browser: null, os: null, device: null };
  const s = String(ua);

  let browser = "Other";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/Chrome\/|CriOS/.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (/MSIE|Trident/.test(s)) browser = "IE";
  else if (/bot|crawler|spider|slurp/i.test(s)) browser = "Bot";

  let os = "Other";
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/Mac OS X/.test(s) && !/iPhone|iPad/.test(s)) os = "macOS";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Linux/.test(s)) os = "Linux";
  else if (/CrOS/.test(s)) os = "ChromeOS";

  let device = "Desktop";
  if (/iPad|Tablet/.test(s)) device = "Tablet";
  else if (/Mobile|iPhone|Android.*Mobile|Windows Phone/.test(s)) device = "Mobile";
  else if (browser === "Bot") device = "Bot";

  return { browser, os, device };
}
