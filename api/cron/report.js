// GET /api/cron/report
//
// Daily visitor intelligence report. Triggered by Vercel Cron at 07:00 ET.
// Compiles the last 24 hours of visit data into a structured JSON report
// and emails it to the admin via Resend.
//
// Secured by CRON_SECRET — Vercel injects the Authorization header on
// cron-triggered requests; manual calls require the same bearer token.

import { sql } from "../_lib/db.js";
import { refreshThreatFeeds } from "../_lib/osint.js";
import { Resend } from "resend";
import { timingSafeEqual } from "node:crypto";

const REPORT_TO = process.env.CONTACT_TO_EMAIL || "hello@simpleitsrq.com";
const FROM = "Simple IT SRQ Analytics <analytics@simpleitsrq.com>";

function verifyCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

export async function GET(request) {
  if (!verifyCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Refresh OSINT threat feeds before the report runs so the summary below
  // reflects the freshest Spamhaus/ET cache. Folded into the existing daily
  // cron to stay under the Hobby 12-function limit; failures are logged but
  // don't block the report itself.
  const osint = await refreshThreatFeeds().catch((err) => {
    console.error("[cron/report] osint refresh failed", err);
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  });

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // --- Aggregate stats ---
  const [statsRow] = await sql`
    SELECT
      COUNT(*)::int                                        AS total_visits,
      COUNT(DISTINCT COALESCE(anon_id, ip))::int           AS unique_visitors,
      COUNT(DISTINCT device_hash) FILTER (WHERE device_hash IS NOT NULL)::int AS unique_devices,
      COUNT(DISTINCT ip)::int                              AS unique_ips,
      COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int     AS authenticated_visits
    FROM visits
    WHERE ts > ${since.toISOString()}
  `;

  // --- Top pages ---
  const topPages = await sql`
    SELECT path, COUNT(*)::int AS hits
    FROM visits WHERE ts > ${since.toISOString()}
    GROUP BY path ORDER BY hits DESC LIMIT 20
  `;

  // --- Top devices (by fingerprint) ---
  const topDevices = await sql`
    SELECT device_hash,
           MAX(ip) AS last_ip,
           MAX(browser) AS browser,
           MAX(os) AS os,
           MAX(device) AS device_type,
           MAX(screen) AS screen,
           MAX(platform) AS platform,
           MAX(cores::text) AS cores,
           MAX(country) AS country,
           MAX(city) AS city,
           COUNT(*)::int AS hits,
           MIN(ts) AS first_seen,
           MAX(ts) AS last_seen
    FROM visits
    WHERE ts > ${since.toISOString()} AND device_hash IS NOT NULL
    GROUP BY device_hash
    ORDER BY hits DESC
    LIMIT 30
  `;

  // --- Top IPs ---
  const topIps = await sql`
    SELECT ip,
           MAX(country) AS country,
           MAX(city) AS city,
           MAX(browser) AS browser,
           MAX(os) AS os,
           COUNT(*)::int AS hits,
           COUNT(DISTINCT path)::int AS pages,
           ARRAY_AGG(DISTINCT device_hash) FILTER (WHERE device_hash IS NOT NULL) AS device_hashes
    FROM visits
    WHERE ts > ${since.toISOString()}
    GROUP BY ip ORDER BY hits DESC LIMIT 20
  `;

  // --- Top referrers ---
  const topReferrers = await sql`
    SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*)::int AS hits
    FROM visits WHERE ts > ${since.toISOString()}
    GROUP BY referrer ORDER BY hits DESC LIMIT 15
  `;

  // --- Top countries ---
  const topCountries = await sql`
    SELECT COALESCE(country, '?') AS country, COUNT(*)::int AS hits,
           COUNT(DISTINCT COALESCE(anon_id, ip))::int AS uniques
    FROM visits WHERE ts > ${since.toISOString()}
    GROUP BY country ORDER BY hits DESC LIMIT 15
  `;

  // --- Security events ---
  const securityEvents = await sql`
    SELECT kind, severity, ip, path, detail, ts
    FROM security_events
    WHERE ts > ${since.toISOString()}
    ORDER BY ts DESC
    LIMIT 50
  `;

  // --- New sign-ups ---
  const newUsers = await sql`
    SELECT id, email, name, created_at
    FROM users
    WHERE created_at > ${since.toISOString()}
    ORDER BY created_at DESC
  `;

  // --- Threat actors (honeypot hits) ---
  const threatActors = await sql`
    SELECT ip, country, city, user_agent, device_hash, path, method,
           headers_json, threat_class, ts
    FROM threat_actors
    WHERE ts > ${since.toISOString()}
    ORDER BY ts DESC
    LIMIT 50
  `;

  // --- Session anomalies ---
  const sessionAnomalies = await sql`
    SELECT event, session_id, user_id, ip, user_agent, country, city,
           device_hash, detail, ts
    FROM session_tracking
    WHERE event IN ('anomaly')
      AND ts > ${since.toISOString()}
    ORDER BY ts DESC
    LIMIT 50
  `;

  // --- DNS integrity check ---
  const DNS_CHECKS = [
    { domain: "simpleitsrq.com", type: "CNAME", expected: "cname.vercel-dns.com" },
    { domain: "simpleitsrq.com", type: "A", expected: null }, // just log what it resolves to
  ];
  const dnsResults = [];
  for (const check of DNS_CHECKS) {
    try {
      const res = await fetch(
        `https://dns.google/resolve?name=${check.domain}&type=${check.type}`,
        { headers: { Accept: "application/dns-json" } }
      );
      const data = await res.json();
      const answers = (data.Answer || []).map((a) => a.data).sort();
      const actual = answers.join(", ") || "(empty)";
      const match = check.expected ? answers.some((a) => a.includes(check.expected)) : true;
      dnsResults.push({
        domain: check.domain,
        type: check.type,
        expected: check.expected || "(any)",
        actual,
        match,
      });
      // Persist to DB for history.
      sql`
        INSERT INTO dns_integrity (domain, record_type, expected, actual, match, resolver)
        VALUES (${check.domain}, ${check.type}, ${check.expected || '(any)'}, ${actual}, ${match}, 'dns.google')
      `.catch(() => {});
    } catch (err) {
      dnsResults.push({
        domain: check.domain,
        type: check.type,
        expected: check.expected || "(any)",
        actual: `ERROR: ${err.message}`,
        match: false,
      });
    }
  }

  // --- Assemble report ---
  const report = {
    generated: now.toISOString(),
    period: { from: since.toISOString(), to: now.toISOString() },
    summary: {
      totalVisits: statsRow?.total_visits || 0,
      uniqueVisitors: statsRow?.unique_visitors || 0,
      uniqueDevices: statsRow?.unique_devices || 0,
      uniqueIps: statsRow?.unique_ips || 0,
      authenticatedVisits: statsRow?.authenticated_visits || 0,
      newSignups: newUsers.length,
      securityEvents: securityEvents.length,
      threatActors: threatActors.length,
      sessionAnomalies: sessionAnomalies.length,
      dnsHealthy: dnsResults.every((d) => d.match),
      osintRefresh: osint,
    },
    topPages,
    topDevices: topDevices.map((d) => ({
      deviceHash: d.device_hash,
      lastIp: d.last_ip,
      browser: d.browser,
      os: d.os,
      deviceType: d.device_type,
      screen: d.screen,
      platform: d.platform,
      cores: d.cores,
      country: d.country,
      city: d.city,
      hits: d.hits,
      firstSeen: d.first_seen,
      lastSeen: d.last_seen,
    })),
    topIps: topIps.map((r) => ({
      ip: r.ip,
      country: r.country,
      city: r.city,
      browser: r.browser,
      os: r.os,
      hits: r.hits,
      pages: r.pages,
      deviceHashes: r.device_hashes,
    })),
    topReferrers,
    topCountries,
    securityEvents: securityEvents.map((e) => ({
      kind: e.kind,
      severity: e.severity,
      ip: e.ip,
      path: e.path,
      detail: e.detail,
      ts: e.ts,
    })),
    newUsers: newUsers.map((u) => ({
      email: u.email,
      name: u.name,
      createdAt: u.created_at,
    })),
    threatActors: threatActors.map((t) => ({
      ip: t.ip,
      country: t.country,
      city: t.city,
      ua: t.user_agent,
      deviceHash: t.device_hash,
      path: t.path,
      method: t.method,
      threatClass: t.threat_class,
      ts: t.ts,
    })),
    sessionAnomalies: sessionAnomalies.map((s) => ({
      event: s.event,
      sessionId: s.session_id,
      ip: s.ip,
      country: s.country,
      city: s.city,
      deviceHash: s.device_hash,
      detail: s.detail,
      ts: s.ts,
    })),
    dnsIntegrity: dnsResults,
  };

  const jsonStr = JSON.stringify(report, null, 2);

  // --- Email ---
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(jsonStr, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resend = new Resend(apiKey);
  const subject = `[SimpleIT] Daily Report — ${report.summary.totalVisits} visits, ${report.summary.uniqueDevices} devices, ${report.summary.securityEvents} security events`;

  const htmlBody = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a">
      <div style="padding:16px 20px;background:#0F6CBD;color:#fff;border-radius:10px 10px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.85">Daily Intelligence Report</div>
        <div style="font-size:18px;font-weight:700;margin-top:2px">simpleitsrq.com — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>
      <div style="padding:20px;background:#fff;border:1px solid #e5e7eb;border-top:none">
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
          <tr><td style="color:#6b7280">Total visits</td><td><strong>${report.summary.totalVisits}</strong></td></tr>
          <tr><td style="color:#6b7280">Unique visitors</td><td><strong>${report.summary.uniqueVisitors}</strong></td></tr>
          <tr><td style="color:#6b7280">Unique devices</td><td><strong>${report.summary.uniqueDevices}</strong></td></tr>
          <tr><td style="color:#6b7280">Unique IPs</td><td><strong>${report.summary.uniqueIps}</strong></td></tr>
          <tr><td style="color:#6b7280">Authenticated visits</td><td><strong>${report.summary.authenticatedVisits}</strong></td></tr>
          <tr><td style="color:#6b7280">New sign-ups</td><td><strong>${report.summary.newSignups}</strong></td></tr>
          <tr><td style="color:#6b7280">Security events</td><td><strong>${report.summary.securityEvents}</strong></td></tr>
          <tr><td style="color:#6b7280">Threat actors (honeypot)</td><td><strong style="color:${report.summary.threatActors > 0 ? '#DC2626' : 'inherit'}">${report.summary.threatActors}</strong></td></tr>
          <tr><td style="color:#6b7280">Session anomalies</td><td><strong style="color:${report.summary.sessionAnomalies > 0 ? '#D97706' : 'inherit'}">${report.summary.sessionAnomalies}</strong></td></tr>
          <tr><td style="color:#6b7280">DNS integrity</td><td><strong style="color:${report.summary.dnsHealthy ? '#107C10' : '#DC2626'}">${report.summary.dnsHealthy ? 'HEALTHY' : 'ALERT — MISMATCH'}</strong></td></tr>
        </table>
      </div>
      <div style="padding:16px 20px;background:#f7f7f8;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
        <p style="margin:0;font-size:12px;color:#6b7280">Full JSON report attached. Generated ${report.generated}.</p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM,
      to: [REPORT_TO],
      subject,
      html: htmlBody,
      text: `Daily Report — ${report.summary.totalVisits} visits\n\n${jsonStr}`,
      attachments: [
        {
          filename: `simpleitsrq-report-${now.toISOString().slice(0, 10)}.json`,
          content: Buffer.from(jsonStr, "utf-8").toString("base64"),
          type: "application/json",
        },
      ],
    });
  } catch (err) {
    console.error("[cron/report] email failed", err);
  }

  return new Response(jsonStr, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
