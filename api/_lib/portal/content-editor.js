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

// ────────────────────────────────────────────────────────────
// GitHub commit helper (mirrors the working publish-draft pattern).
//
// Every overrides edit is dual-written: it lands in the Neon tables
// (authoritative) AND is committed to `content/overrides.json` on main so
// the change becomes part of the codebase permanently and triggers Vercel's
// auto-deploy. The GitHub push is best-effort: it is wrapped in try/catch
// so a GitHub failure NEVER breaks the DB write + revision insert.
// ────────────────────────────────────────────────────────────

async function githubGetFile(path, headers, branch) {
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  return fetch(getUrl, { headers });
}

async function commitGithubFile({ path, content, message, sha, headers }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) return { ok: false, error: "github_token_not_set" };

  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const safeHeaders = headers || {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-agent",
  };
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    committer: {
      name: "Simple IT SRQ Agent",
      email: "agent@simpleitsrq.com",
    },
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(base, {
    method: "PUT",
    headers: { ...safeHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    if (putRes.status === 409) {
      return { ok: false, error: "github_conflict" };
    }
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 300) };
  }
  const putData = await putRes.json();
  return { ok: true, commitSha: putData.commit?.sha, path };
}

// Read the current overrides + design tokens and commit them as a versioned
// manifest to content/overrides.json on main. Pushing to main triggers
// Vercel's auto-deploy. Always returns { ok: boolean }; never throws.
async function commitOverridesManifest() {
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";
  const path = "content/overrides.json";
  if (!token) return { ok: false, error: "github_token_not_set" };

  try {
    const [contentRows, tokenRows] = await Promise.all([
      sql`SELECT page, key, value FROM content_overrides`.catch(() => []),
      sql`SELECT token, value, theme FROM design_token_overrides`.catch(() => []),
    ]);

    const content = {};
    for (const r of contentRows) {
      if (!r || !r.page || !r.key) continue;
      content[`${r.page}.${r.key}`] = r.value;
    }
    const designTokens = {};
    for (const r of tokenRows) {
      if (!r || !r.token) continue;
      designTokens[r.token] = { value: r.value, theme: r.theme || "both" };
    }

    const manifest = {
      version: 1,
      updated_at: new Date().toISOString(),
      content,
      design_tokens: designTokens,
    };

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "simpleitsrq-agent",
    };

    const getRes = await githubGetFile(path, headers, branch);
    if (!getRes.ok) {
      if (getRes.status !== 404) return { ok: false, error: `github_get_${getRes.status}` };
      return commitGithubFile({
        path,
        content: JSON.stringify(manifest, null, 2) + "\n",
        message: "content: update overrides manifest",
        headers,
      });
    }
    const meta = await getRes.json();
    return commitGithubFile({
      path,
      content: JSON.stringify(manifest, null, 2) + "\n",
      message: "content: update overrides manifest",
      sha: meta.sha,
      headers,
    });
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Best-effort GitHub sync that NEVER throws. The DB write + revision insert
// always succeed; this is fire-and-forget and only logged on failure.
async function syncToGitHubBestEffort() {
  await commitOverridesManifest().catch((e) => {
    console.error("[content-editor] GitHub manifest sync failed:", e?.message || e);
  });
}

// Publish-all action. Commits the current full override + design-token
// manifest to content/overrides.json on GitHub main -> triggers Vercel
// auto-deploy. This is the one-click "make every drafted change permanent
// and version-controlled" action. It does NOT touch the DB itself (drafts
// are already written there); it only pushes the consolidated manifest.
export async function handleContentPublish(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const res = await commitOverridesManifest();
  if (res.ok) {
    return json(200, { ok: true, pushed: true });
  }
  return json(500, { ok: false, error: res.error || "publish_failed" });
}

// Record a row in the content_revisions audit-history table.
async function recordRevision({ kind, refKey, oldValue, newValue, editorNote, createdBy }) {
  await sql`
    INSERT INTO content_revisions (kind, ref_key, old_value, new_value, editor_note, created_by)
    VALUES (${kind}, ${refKey}, ${oldValue ?? ""}, ${newValue ?? ""}, ${editorNote ?? null}, ${createdBy ?? null})
  `.catch(() => {});
}

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

  // Coverage stats so the editor UI can show how much of each page has been
  // overridden (e.g. "24 overrides across 9 pages").
  const byPage = {};
  for (const r of rows) {
    byPage[r.page] = (byPage[r.page] || 0) + 1;
  }

  return json(200, {
    ok: true,
    overrides,
    pages: KNOWN_PAGES,
    total: rows.length,
    countsByPage: byPage,
  });
}

export async function handleContentSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const page = String(body.page || "").trim();
  const key = String(body.key || "").trim();
  const value = String(body.value ?? "");
  const editorNote = String(body.editor_note ?? "").trim() || null;
  const publish = body.publish === true;

  if (!page || !key) {
    return json(400, { ok: false, error: "page_and_key_required" });
  }

  // Read the current value so we can record the audit trail (old -> new).
  const currentRows = await sql`
    SELECT value FROM content_overrides WHERE page = ${page} AND key = ${key}
  `.catch(() => []);
  const oldValue = (currentRows && currentRows[0]?.value) ?? "";

  await sql`
    INSERT INTO content_overrides (page, key, value)
    VALUES (${page}, ${key}, ${value})
    ON CONFLICT (page, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `.catch(() => {});

  await recordRevision({
    kind: "content",
    refKey: `${page}.${key}`,
    oldValue,
    newValue: value,
    editorNote,
    createdBy: session?.user?.email,
  });

  // GitHub + Vercel sync only when the admin explicitly publishes — "save
  // draft" (publish=false) writes to Neon + the revision audit only. The DB
  // write + revision insert above always run; this is pure additive gating.
  // Never blocks or breaks the DB save.
  if (publish) await syncToGitHubBestEffort();

  return json(200, { ok: true });
}

export async function handleContentDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const page = String(body.page || "").trim();
  const key = String(body.key || "").trim();
  const publish = body.publish === true;

  if (!page || !key) {
    return json(400, { ok: false, error: "page_and_key_required" });
  }

  const currentRows = await sql`
    SELECT value FROM content_overrides WHERE page = ${page} AND key = ${key}
  `.catch(() => []);
  const oldValue = (currentRows && currentRows[0]?.value) ?? "";

  await sql`
    DELETE FROM content_overrides WHERE page = ${page} AND key = ${key}
  `.catch(() => {});

  // A delete is recorded as a revision whose new value is empty (the reset).
  await recordRevision({
    kind: "content",
    refKey: `${page}.${key}`,
    oldValue,
    newValue: "",
    editorNote: null,
    createdBy: session?.user?.email,
  });

  // GitHub + Vercel sync only when explicitly published (see handleContentSave).
  if (publish) await syncToGitHubBestEffort();

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
  const publish = body.publish === true;

  if (!token) {
    return json(400, { ok: false, error: "token_required" });
  }
  if (!["both", "light", "dark"].includes(theme)) {
    return json(400, { ok: false, error: "invalid_theme" });
  }

  const currentRows = await sql`
    SELECT value FROM design_token_overrides WHERE token = ${token}
  `.catch(() => []);
  const oldValue = (currentRows && currentRows[0]?.value) ?? "";

  await sql`
    INSERT INTO design_token_overrides (token, value, theme)
    VALUES (${token}, ${value}, ${theme})
    ON CONFLICT (token) DO UPDATE SET
      value = EXCLUDED.value,
      theme = EXCLUDED.theme,
      updated_at = now()
  `.catch(() => {});

  await recordRevision({
    kind: "design_token",
    refKey: token,
    oldValue,
    newValue: value,
    editorNote: null,
    createdBy: session?.user?.email,
  });

  // GitHub + Vercel sync only when explicitly published (see handleContentSave).
  if (publish) await syncToGitHubBestEffort();

  return json(200, { ok: true });
}

export async function handleDesignTokenDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* ignore malformed body */ }

  const token = String(body.token || "").trim();
  const publish = body.publish === true;
  if (!token) {
    return json(400, { ok: false, error: "token_required" });
  }

  const currentRows = await sql`
    SELECT value FROM design_token_overrides WHERE token = ${token}
  `.catch(() => []);
  const oldValue = (currentRows && currentRows[0]?.value) ?? "";

  await sql`
    DELETE FROM design_token_overrides WHERE token = ${token}
  `.catch(() => {});

  // A delete is recorded as a revision whose new value is empty (the reset).
  await recordRevision({
    kind: "design_token",
    refKey: token,
    oldValue,
    newValue: "",
    editorNote: null,
    createdBy: session?.user?.email,
  });

  // GitHub + Vercel sync only when explicitly published (see handleContentSave).
  if (publish) await syncToGitHubBestEffort();

  return json(200, { ok: true });
}

// ────────────────────────────────────────────────────────────
// Manifest + revision readers
// ────────────────────────────────────────────────────────────
//
// GET content-manifest    -> the full manifest (content + design tokens) in
//                            ONE round-trip (two SELECTs run concurrently).
// GET content-revisions   -> the last 100 audit/history rows.

export async function handleContentManifest(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  // Two concurrent SELECTs = one round-trip from the frontend's point of view.
  const [contentRows, tokenRows] = await Promise.all([
    sql`SELECT page, key, value, updated_at FROM content_overrides`.catch(() => []),
    sql`SELECT token, value, theme, updated_at FROM design_token_overrides`.catch(() => []),
  ]);

  const content = {};
  let maxUpdated = 0;
  for (const r of contentRows) {
    if (!r || !r.page || !r.key) continue;
    content[`${r.page}.${r.key}`] = r.value;
    const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    if (t > maxUpdated) maxUpdated = t;
  }

  const designTokens = {};
  for (const r of tokenRows) {
    if (!r || !r.token) continue;
    designTokens[r.token] = { value: r.value, theme: r.theme || "both" };
    const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    if (t > maxUpdated) maxUpdated = t;
  }

  return json(200, {
    ok: true,
    version: 1,
    updated_at: maxUpdated ? new Date(maxUpdated).toISOString() : null,
    content,
    design_tokens: designTokens,
    pages: KNOWN_PAGES,
  });
}

export async function handleContentRevisions(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const rows = await sql`
    SELECT id, kind, ref_key, old_value, new_value, editor_note, created_by, created_at
    FROM content_revisions
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `.catch(() => []);

  const revisions = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    ref_key: r.ref_key,
    old_value: r.old_value,
    new_value: r.new_value,
    editor_note: r.editor_note,
    created_by: r.created_by,
    created_at: r.created_at,
  }));

  return json(200, { ok: true, revisions });
}
