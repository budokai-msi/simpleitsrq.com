// Shared draft-publish helpers. Used by both the admin portal
// (api/portal.js) and the daily cron (api/cron/agent.js).

function strikeApostrophes(text) {
  return String(text || "").replace(/\u2019|'/g, "");
}

// Format a draft row into the exact shape the existing posts.js array
// uses. Keeps schema in lock-step with the hand-authored posts.
export function formatDraftAsPostEntry(draft, overrides = {}) {
  const slug     = overrides.slug     ?? draft.slug;
  const title    = strikeApostrophes(overrides.title    ?? draft.title);
  const metaDesc = strikeApostrophes(overrides.metaDescription ?? draft.metaDescription ?? draft.meta_desc ?? "");
  const excerpt  = strikeApostrophes(overrides.excerpt  ?? draft.excerpt);
  const category = overrides.category ?? draft.category;
  const body     = strikeApostrophes(overrides.body     ?? draft.body);
  const tags     = Array.isArray(overrides.tags) && overrides.tags.length
    ? overrides.tags
    : ["ai", "smb"];
  const heroAlt  = overrides.heroAlt  ?? `An illustration accompanying ${title}.`;
  const sourceUrl = overrides.sourceUrl ?? "https://simpleitsrq.com/blog";
  const today = new Date().toISOString().slice(0, 10);

  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tagList = tags.map((t) => `"${esc(t)}"`).join(", ");

  return `  {
    slug: "${esc(slug)}",
    title: "${esc(title)}",
    metaDescription: "${esc(metaDesc)}",
    date: "${today}",
    author: "Simple IT SRQ Team",
    category: "${esc(category)}",
    tags: [${tagList}],
    excerpt: "${esc(excerpt)}",
    sourceUrl: "${esc(sourceUrl)}",
    heroAlt: "${esc(heroAlt)}",
    content: \`${body.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`
  },
`;
}

// Insert a new post entry into the existing posts.js array string by
// anchoring on the closing "];" of the array followed by the default
// export. Tolerates 0-2 newlines and optional \r between them.
export function spliceIntoPostsFile(fileContent, entry) {
  const re = /\];\s*\r?\nexport\s+default\s+posts;/;
  const match = re.exec(fileContent);
  if (!match) return null;
  const before = fileContent.slice(0, match.index);
  const after = fileContent.slice(match.index);
  return before + entry + after;
}

// Commit a file change to GitHub via the Contents API. Expects a GitHub
// fine-grained PAT with contents:write scope on the target repo in the
// GITHUB_TOKEN env var. Caller passes the SHA from the same fetch they
// used to build newContent so there is no race between read and write.
export async function commitPostsFile(newContent, commitMessage, fileSha) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  const path  = "src/data/posts.js";

  if (!token) {
    return { ok: false, error: "github_token_not_set" };
  }

  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-agent",
  };

  const body = {
    message: commitMessage,
    content: Buffer.from(newContent, "utf8").toString("base64"),
    sha: fileSha,
    branch,
    committer: {
      name:  "Simple IT SRQ Agent",
      email: "agent@simpleitsrq.com",
    },
  };

  const putRes = await fetch(base, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    if (putRes.status === 409) {
      return { ok: false, error: "github_conflict",
        hint: "posts.js was modified on GitHub between read and write." };
    }
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 200) };
  }
  const putData = await putRes.json();
  return { ok: true, commitSha: putData.commit?.sha, htmlUrl: putData.commit?.html_url };
}

// Fetch current posts.js from GitHub, splice in the draft entry, commit.
// Returns { ok, commitSha?, htmlUrl?, error?, alreadyInFile? }.
export async function publishDraftToGitHub(draft) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token) {
    return { ok: false, error: "github_token_not_set" };
  }

  const entry = formatDraftAsPostEntry(draft);

  const getUrl = `https://api.github.com/repos/${repo}/contents/src/data/posts.js?ref=${encodeURIComponent(branch)}`;
  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "simpleitsrq-agent",
    },
  });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => "");
    return { ok: false, error: `github_get_${getRes.status}`, detail: txt.slice(0, 300) };
  }

  const meta = await getRes.json();
  const currentFile = Buffer.from(meta.content, "base64").toString("utf8");
  const fileSha = meta.sha;

  if (currentFile.includes(`slug: "${draft.slug}"`)) {
    return { ok: true, alreadyInFile: true };
  }

  const spliced = spliceIntoPostsFile(currentFile, entry);
  if (!spliced) {
    return { ok: false, error: "posts_file_anchor_missing" };
  }

  return commitPostsFile(spliced, `Publish blog post: ${draft.title}`, fileSha);
}
