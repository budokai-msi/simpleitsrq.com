// Shared draft-publish helpers. Used by both the admin portal
// (api/portal.js) and the daily cron (api/cron/agent.js).
//
// The live blog system is MDX-first: content/posts/<slug>.mdx is read by
// scripts/generate-posts-meta.mjs, sitemap/RSS generation, and the static
// /blog/<slug>.html stubs. Generated posts must publish there, not into the
// legacy src/data/posts.js array.

function strikeApostrophes(text) {
  return String(text || "").replace(/\u2019|'/g, "");
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function slugSafe(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizedDraft(draft, overrides = {}) {
  const title = strikeApostrophes(overrides.title ?? draft.title);
  const slug = slugSafe(overrides.slug ?? draft.slug);
  const metaDescription = strikeApostrophes(
    overrides.metaDescription ?? draft.metaDescription ?? draft.meta_desc ?? "",
  );
  const excerpt = strikeApostrophes(overrides.excerpt ?? draft.excerpt ?? "");
  const category = overrides.category ?? draft.category ?? "Business Tech";
  const body = String(overrides.body ?? draft.body ?? "").trim();
  const draftTags = Array.isArray(draft.tags) && draft.tags.length ? draft.tags : null;
  const tags = Array.isArray(overrides.tags) && overrides.tags.length
    ? overrides.tags
    : draftTags || ["hacker-news", "local-it", "smb"];
  const heroAlt = overrides.heroAlt ?? draft.heroAlt ?? `A local business technology note about ${title}.`;
  const sourceUrl = overrides.sourceUrl ?? draft.sourceUrl ?? "";
  return { title, slug, metaDescription, excerpt, category, body, tags, heroAlt, sourceUrl };
}

export function formatDraftAsMdx(draft, overrides = {}) {
  const post = normalizedDraft(draft, overrides);
  if (!post.slug) throw new Error("missing_slug");
  if (!post.title) throw new Error("missing_title");
  if (!post.body) throw new Error("missing_body");

  const today = new Date().toISOString().slice(0, 10);
  const tags = post.tags
    .map((tag) => `  - ${yamlString(tag)}`)
    .join("\n");
  const sourceUrl = post.sourceUrl ? `sourceUrl: ${yamlString(post.sourceUrl)}\n` : "";

  return `---
slug: ${yamlString(post.slug)}
title: ${yamlString(post.title)}
metaDescription: ${yamlString(post.metaDescription)}
date: ${yamlString(today)}
author: "Simple IT SRQ Team"
category: ${yamlString(post.category)}
tags:
${tags}
excerpt: ${yamlString(post.excerpt)}
heroAlt: ${yamlString(post.heroAlt)}
${sourceUrl}---

${post.body}
`;
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
  const draftTags = Array.isArray(draft.tags) && draft.tags.length ? draft.tags : null;
  const tags     = Array.isArray(overrides.tags) && overrides.tags.length
    ? overrides.tags
    : draftTags || ["ai", "smb"];
  const heroAlt  = overrides.heroAlt  ?? `An illustration accompanying ${title}.`;
  const sourceUrl = overrides.sourceUrl ?? draft.sourceUrl ?? "https://simpleitsrq.com/blog";
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

async function githubGetFile(path, headers, branch) {
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  return fetch(getUrl, { headers });
}

async function commitGithubFile({ path, content, message, sha }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) return { ok: false, error: "github_token_not_set" };

  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
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
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    if (putRes.status === 409) {
      return {
        ok: false,
        error: "github_conflict",
        hint: `${path} changed on GitHub between read and write.`,
      };
    }
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 300) };
  }
  const putData = await putRes.json();
  return {
    ok: true,
    commitSha: putData.commit?.sha,
    htmlUrl: putData.commit?.html_url,
    path,
  };
}

// Create content/posts/<slug>.mdx through the GitHub Contents API.
// Returns { ok, commitSha?, htmlUrl?, error?, alreadyInFile? }.
export async function publishDraftToGitHub(draft, overrides = {}) {
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token) {
    return { ok: false, error: "github_token_not_set" };
  }

  const post = normalizedDraft(draft, overrides);
  const mdx = formatDraftAsMdx(draft, overrides);
  const path = `content/posts/${post.slug}.mdx`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-agent",
  };
  const getRes = await githubGetFile(path, headers, branch);
  if (!getRes.ok) {
    if (getRes.status === 404) {
      return commitGithubFile({
        path,
        content: mdx,
        message: `Publish blog post: ${post.title}`,
      });
    }
    const txt = await getRes.text().catch(() => "");
    return { ok: false, error: `github_get_${getRes.status}`, detail: txt.slice(0, 300) };
  }

  const meta = await getRes.json();
  const currentFile = Buffer.from(meta.content || "", "base64").toString("utf8");
  if (currentFile.includes(`slug: ${yamlString(post.slug)}`) || currentFile.includes(`slug: "${post.slug}"`)) {
    return { ok: true, alreadyInFile: true };
  }

  return commitGithubFile({
    path,
    content: mdx,
    message: `Update blog post: ${post.title}`,
    sha: meta.sha,
  });
}
