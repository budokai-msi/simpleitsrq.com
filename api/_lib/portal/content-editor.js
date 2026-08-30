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

// ────────────────────────────────────────────────────────────
// Design-token overrides
//
// Lets the sole admin edit the site's design tokens (CSS custom
// properties from src/index.css) at runtime. Overrides live in the
// `design_token_overrides` table (see db/migrations/027_design_token_overrides.sql)
// and are injected by the frontend `useDesignTokens()` hook, which falls
// back to the hardcoded token whenever no override exists.
//
// Actions:
//   GET  design-token-list    -> all overrides + the known token list
//   POST design-token-save    -> upsert { token, value, theme }
//   POST design-token-delete  -> delete { token }

// Known design tokens surfaced in the editor. Mirrors the CSS custom
// properties defined in src/index.css (light + dark themes). Each entry
// carries a human label and a category so the editor can group/filter.
const KNOWN_TOKENS = [
  // ── color ────────────────────────────────────────────────
  { token: "--bg",            label: "Page background",        category: "color" },
  { token: "--bg-elevated",   label: "Elevated background",    category: "color" },
  { token: "--surface",       label: "Surface (cards)",        category: "color" },
  { token: "--surface-2",     label: "Surface 2 (recessed)",   category: "color" },
  { token: "--surface-3",     label: "Surface 3 (deepest)",    category: "color" },
  { token: "--mica",          label: "Mica (sticky chrome)",   category: "color" },
  { token: "--brand",         label: "Brand",                  category: "color" },
  { token: "--brand-hover",   label: "Brand hover",            category: "color" },
  { token: "--brand-pressed", label: "Brand pressed",          category: "color" },
  { token: "--brand-subtle",  label: "Brand subtle",           category: "color" },
  { token: "--brand-glow",    label: "Brand glow",             category: "color" },
  { token: "--brand-rgb",     label: "Brand RGB triplet",      category: "color" },
  { token: "--surface-rgb",   label: "Surface RGB triplet",    category: "color" },
  { token: "--text-1",        label: "Primary text",           category: "color" },
  { token: "--text-2",        label: "Secondary text",        category: "color" },
  { token: "--text-3",        label: "Tertiary text",         category: "color" },
  { token: "--text-on-accent",label: "Text on accent",         category: "color" },
  { token: "--border",         label: "Border",                 category: "color" },
  { token: "--border-strong", label: "Border strong",          category: "color" },
  { token: "--success",        label: "Success",                category: "color" },
  { token: "--success-bg",     label: "Success background",     category: "color" },
  { token: "--warning",        label: "Warning",                category: "color" },
  { token: "--error",          label: "Error",                  category: "color" },
  { token: "--error-bg",       label: "Error background",      category: "color" },
  { token: "--accent",         label: "Accent",                 category: "color" },
  { token: "--accent-teal",    label: "Accent teal",            category: "color" },
  { token: "--accent-teal-bg", label: "Accent teal background", category: "color" },
  { token: "--accent-violet",  label: "Accent violet",          category: "color" },
  { token: "--accent-violet-bg", label: "Accent violet background", category: "color" },
  { token: "--accent-amber",   label: "Accent amber",           category: "color" },
  { token: "--accent-amber-bg", label: "Accent amber background", category: "color" },
  { token: "--mesh-1",         label: "Mesh stop 1",            category: "color" },
  { token: "--mesh-2",         label: "Mesh stop 2",            category: "color" },
  { token: "--mesh-3",         label: "Mesh stop 3",            category: "color" },
  { token: "--mesh-4",         label: "Mesh stop 4",            category: "color" },
  // ── radius ───────────────────────────────────────────────
  { token: "--r-sm",           label: "Radius small",           category: "radius" },
  { token: "--r-md",           label: "Radius medium",          category: "radius" },
  { token: "--r-lg",           label: "Radius large",           category: "radius" },
  { token: "--r-xl",           label: "Radius extra-large",     category: "radius" },
  // ── spacing ──────────────────────────────────────────────
  { token: "--space-1",        label: "Space 1 (4px)",          category: "spacing" },
  { token: "--space-2",        label: "Space 2 (8px)",          category: "spacing" },
  { token: "--space-3",        label: "Space 3 (12px)",         category: "spacing" },
  { token: "--space-4",        label: "Space 4 (16px)",         category: "spacing" },
  { token: "--space-5",        label: "Space 5 (24px)",         category: "spacing" },
  { token: "--space-6",        label: "Space 6 (32px)",         category: "spacing" },
  { token: "--space-7",        label: "Space 7 (48px)",         category: "spacing" },
  { token: "--space-8",        label: "Space 8 (64px)",         category: "spacing" },
  { token: "--space-9",        label: "Space 9 (96px)",         category: "spacing" },
  { token: "--space-10",       label: "Space 10 (128px)",       category: "spacing" },
  // ── shadow ───────────────────────────────────────────────
  { token: "--shadow2",        label: "Shadow 2",               category: "shadow" },
  { token: "--shadow4",        label: "Shadow 4",               category: "shadow" },
  { token: "--shadow8",        label: "Shadow 8",               category: "shadow" },
  { token: "--shadow16",       label: "Shadow 16",              category: "shadow" },
  { token: "--shadow-glow",    label: "Shadow glow",            category: "shadow" },
  { token: "--shadow-luminate", label: "Shadow luminate",       category: "shadow" },
  // ── easing ───────────────────────────────────────────────
  { token: "--ease-out",       label: "Ease out",               category: "easing" },
  { token: "--ease-in-out",    label: "Ease in-out",            category: "easing" },
  { token: "--ease-spring",   label: "Ease spring",            category: "easing" },
  // ── font ─────────────────────────────────────────────────
  { token: "--font-sans",      label: "Sans-serif font stack",  category: "font" },
  { token: "--font-mono",      label: "Monospace font stack",   category: "font" },
  // ── effect ───────────────────────────────────────────────
  { token: "--shadow-glow",    label: "Glow effect",            category: "effect" },
  { token: "--shadow-luminate", label: "Luminate effect",       category: "effect" },
];

export async function handleDesignTokenList(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const rows = await sql`
    SELECT token, value, theme, updated_at
    FROM design_token_overrides
    ORDER BY token
  `.catch(() => []);

  const tokens = rows.map((r) => ({
    token: r.token,
    value: r.value,
    theme: r.theme,
    updated_at: r.updated_at,
  }));

  return json(200, { ok: true, tokens, known: KNOWN_TOKENS });
}

export async function handleDesignTokenSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const token = String(body.token || "").trim();
  const value = String(body.value ?? "");
  const theme = String(body.theme || "both").trim();

  if (!token) {
    return json(400, { ok: false, error: "token_required" });
  }
  if (!["both", "light", "dark"].includes(theme)) {
    return json(400, { ok: false, error: "invalid_theme" });
  }

  await sql`
    INSERT INTO design_token_overrides (token, value, theme)
    VALUES (${token}, ${value}, ${theme})
    ON CONFLICT (token) DO UPDATE SET
      value = EXCLUDED.value,
      theme = EXCLUDED.theme,
      updated_at = now()
  `.catch(() => {});

  return json(200, { ok: true });
}

export async function handleDesignTokenDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const token = String(body.token || "").trim();
  if (!token) {
    return json(400, { ok: false, error: "token_required" });
  }

  await sql`
    DELETE FROM design_token_overrides WHERE token = ${token}
  `.catch(() => {});

  return json(200, { ok: true });
}
