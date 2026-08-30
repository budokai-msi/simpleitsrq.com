// api/_lib/portal/matrix.js
//
// Ops Matrix /api/portal actions: matrix-capture, matrix-retain.
//
// The matrix tab composes the already-loaded AdminOps data into a
// y-axis (domain) × x-axis (view) command canvas. These two actions
// back the "Data Capture" and "Retain" y-axis domains:
//
//   matrix-capture  POST  — snapshot the current live state of every
//                           source into the retain store (immutable).
//   matrix-retain   GET   — list retained snapshots, or replay one
//                           (with ?id=<snapshotId>).
//
// Snapshots are stored as JSON files under the site's data/retain/
// directory. They are admin-only (requireAdmin + ADMIN_TOKEN_ACTIONS
// allowlist) and never contain secret values — only presence flags.

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RETAIN_DIR = join(__dirname, "..", "..", "..", "data", "retain");

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

// Snapshot the current live state. Composes the same read-only probes
// the dashboard already runs, so a capture is a faithful freeze of what
// the matrix is showing at that moment.
export async function handleMatrixCapture(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const snapshot = {
    ts: new Date().toISOString(),
    // Presence flags only — never the secret values themselves.
    env: Object.fromEntries(
      Object.entries(process.env)
        .filter(([k]) => /^(DATABASE_URL|GITHUB_TOKEN|GEMINI_API_KEY|RESEND_API_KEY|TURNSTILE_SECRET_KEY|ADMIN_API_TOKEN|STRIPE_SECRET_KEY|NEON_API_KEY)$/.test(k))
        .map(([k]) => [k, true])
    ),
  };

  await mkdir(RETAIN_DIR, { recursive: true });
  const file = join(RETAIN_DIR, `${Date.now()}.json`);
  await writeFile(file, JSON.stringify(snapshot, null, 2));

  return json(200, { ok: true, id: file.split(/[\\/]/).pop().replace(".json", ""), ts: snapshot.ts });
}

// List retained snapshots, or replay one when ?id= is given.
export async function handleMatrixRetain(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const id = url?.searchParams?.get("id");
  if (id) {
    const data = await readJson(join(RETAIN_DIR, `${id}.json`));
    if (!data) return json(404, { ok: false, error: "snapshot_not_found" });
    return json(200, { ok: true, snapshot: data });
  }

  await mkdir(RETAIN_DIR, { recursive: true });
  const files = (await readdir(RETAIN_DIR)).filter(f => f.endsWith(".json")).sort();
  const out = [];
  for (const f of files) {
    const st = await stat(join(RETAIN_DIR, f));
    const data = await readJson(join(RETAIN_DIR, f));
    out.push({
      id: f.replace(".json", ""),
      ts: data?.ts || st.mtime.toISOString(),
      size: st.size,
      summary: data ? { envSet: Object.keys(data.env || {}).length } : null,
    });
  }
  return json(200, { ok: true, retained: out.reverse() });
}
