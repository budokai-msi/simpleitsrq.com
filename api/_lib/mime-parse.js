// api/_lib/mime-parse.js
//
// Minimal RFC 822 / MIME extractor. The Cloudflare Email Worker forwards the
// raw message to us; this pulls the text/plain and text/html bodies out so the
// reply parser can do its job. Handles nested multipart (alternative / mixed /
// related), quoted-printable, and base64 transfer encodings. Not a full MIME
// implementation — just enough for inbound ticket replies. Never throws.

/** Split a raw message (or part) into its header block and body. */
function splitHeadersBody(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m) return { head: raw, body: "" };
  return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

/** Parse a header block into a lowercase-keyed map, unfolding wrapped lines. */
function parseHeaders(head) {
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s?(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return headers;
}

function decodeQuotedPrintable(body) {
  const s = body.replace(/=\r?\n/g, ""); // soft line breaks
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeBody(body, encoding) {
  const enc = (encoding || "").trim().toLowerCase();
  if (enc === "base64") {
    try { return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"); }
    catch { return body; }
  }
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

/** Split a multipart body on its boundary, dropping preamble + closing marker. */
function splitMultipart(body, boundary) {
  const out = [];
  for (let seg of body.split("--" + boundary)) {
    if (seg === "" || seg === "--" || seg.startsWith("--")) continue; // closing delimiter
    seg = seg.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (seg) out.push(seg);
  }
  return out;
}

function walk(head, body, out, depth) {
  if (depth > 8) return; // guard against pathological nesting
  const h = parseHeaders(head);
  const ct = h["content-type"] || "text/plain";
  const type = (ct.match(/^\s*([^;]+)/)?.[1] || "text/plain").trim().toLowerCase();

  if (type.startsWith("multipart/")) {
    const boundary = ct.match(/boundary="?([^";]+)"?/i)?.[1];
    if (!boundary) return;
    for (const part of splitMultipart(body, boundary)) {
      const { head: ph, body: pb } = splitHeadersBody(part);
      walk(ph, pb, out, depth + 1);
    }
    return;
  }

  // Skip attachments — we only want the message text.
  if (/attachment/i.test(h["content-disposition"] || "")) return;

  const decoded = decodeBody(body, h["content-transfer-encoding"]);
  if (type === "text/plain" && !out.text) out.text = decoded;
  else if (type === "text/html" && !out.html) out.html = decoded;
}

/**
 * Extract the text and html bodies from a raw RFC 822 message.
 * @param {string} raw
 * @returns {{ text: string, html: string }}
 */
export function parseRawEmail(raw) {
  const text = String(raw || "");
  const { head, body } = splitHeadersBody(text);
  const out = { text: "", html: "" };
  try { walk(head, body, out, 0); } catch { /* fall through */ }
  if (!out.text && !out.html) out.text = body || text; // last-ditch: raw as text
  return out;
}
