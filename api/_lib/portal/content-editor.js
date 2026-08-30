// api/_lib/portal/content-editor.js
//
// Content-override store for the admin content editor. Lets the sole admin
// edit the text on any page without touching code. Overrides live in the
// `content_overrides` table (see db/migrations/026_content_overrides.sql)
// and are read by the frontend `useContent()` hook, which falls back to the
// hardcoded string whenever no override exists.
//
// Actions:
//   GET  content-list    -> all overrides + the known page list
//   POST content-save    -> upsert { page, key, value }
//   POST content-delete  -> delete { page, key }

import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

// Known pages surfaced in the editor's page picker. Pages not listed here
// can still be edited via the API, but the picker only shows these.
const KNOWN_PAGES = [
  "home",
  "services",
  "book",
  "support",
  "leadgen",
  "stack",
  "tools",
  "exposure-scan",
  "compare",
  "glossary",
  "legal",
  "about",
  "contact",
];

export async function handleContentList(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const rows = await sql`
    SELECT page, key, value, updated_at
    FROM content_overrides
    ORDER BY page, key
  `.catch(() => []);

  const overrides = rows.map((r) => ({
    page: r.page,
    key: r.key,
    value: r.value,
    updated_at: r.updated_at,
  }));

  return json(200, { ok: true, overrides, pages: KNOWN_PAGES });
}

export async function handleContentSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const page = String(body.page || "").trim();
  const key = String(body.key || "").trim();
  const value = String(body.value ?? "");

  if (!page || !key) {
    return json(400, { ok: false, error: "page_and_key_required" });
  }

  await sql`
    INSERT INTO content_overrides (page, key, value)
    VALUES (${page}, ${key}, ${value})
    ON CONFLICT (page, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `.catch(() => {});

  return json(200, { ok: true });
}

export async function handleContentDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const page = String(body.page || "").trim();
  const key = String(body.key || "").trim();

  if (!page || !key) {
    return json(400, { ok: false, error: "page_and_key_required" });
  }

  await sql`
    DELETE FROM content_overrides WHERE page = ${page} AND key = ${key}
  `.catch(() => {});

  return json(200, { ok: true });
}
