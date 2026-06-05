import { visit, SKIP } from "unist-util-visit";

const INLINE_HEADING_RE = /\s+##\s+([^:\n]+):\s*/g;
const SHORTCODE_RE = /\[\[([^\]]+)\]\]/g;

function textNode(value) {
  return { type: "text", value };
}

function isEmptyText(node) {
  return node?.type === "text" && !String(node.value || "").trim();
}

function trimTextEdges(children) {
  const out = children.filter((child) => !isEmptyText(child));
  if (out[0]?.type === "text") out[0] = textNode(out[0].value.replace(/^\s+/, ""));
  const last = out[out.length - 1];
  if (last?.type === "text") out[out.length - 1] = textNode(last.value.replace(/\s+$/, ""));
  return out.filter((child) => !isEmptyText(child));
}

function splitInlineHeadings(paragraph) {
  const blocks = [];
  let current = [];

  function pushParagraph() {
    const children = trimTextEdges(current);
    if (children.length) blocks.push({ type: "paragraph", children });
    current = [];
  }

  for (const child of paragraph.children || []) {
    if (child.type !== "text") {
      current.push(child);
      continue;
    }

    const value = child.value || "";
    let cursor = 0;
    let match;
    INLINE_HEADING_RE.lastIndex = 0;

    while ((match = INLINE_HEADING_RE.exec(value)) !== null) {
      if (match.index > cursor) current.push(textNode(value.slice(cursor, match.index)));
      pushParagraph();
      blocks.push({
        type: "heading",
        depth: 2,
        children: [textNode(match[1].trim())],
      });
      cursor = INLINE_HEADING_RE.lastIndex;
    }

    if (cursor < value.length) current.push(textNode(value.slice(cursor)));
  }

  pushParagraph();
  return blocks.length > 1 ? blocks : null;
}

function shortcodeNode(token) {
  if (token.startsWith("tool:")) {
    return {
      type: "mdxJsxTextElement",
      name: "Tool",
      attributes: [{ type: "mdxJsxAttribute", name: "id", value: token.slice(5).trim() }],
      children: [],
    };
  }

  return {
    type: "mdxJsxTextElement",
    name: "Affiliate",
    attributes: [{ type: "mdxJsxAttribute", name: "token", value: token.trim() }],
    children: [],
  };
}

function splitShortcodes(value) {
  const children = [];
  let cursor = 0;
  let match;
  SHORTCODE_RE.lastIndex = 0;

  while ((match = SHORTCODE_RE.exec(value)) !== null) {
    if (match.index > cursor) children.push(textNode(value.slice(cursor, match.index)));
    children.push(shortcodeNode(match[1]));
    cursor = SHORTCODE_RE.lastIndex;
  }

  if (cursor < value.length) children.push(textNode(value.slice(cursor)));
  return children.length ? children : null;
}

export default function remarkGeneratedPostCleanup() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return;

    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      if (child?.type !== "paragraph") continue;
      const replacement = splitInlineHeadings(child);
      if (!replacement) continue;
      tree.children.splice(i, 1, ...replacement);
      i += replacement.length - 1;
    }

    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || !Array.isArray(parent.children)) return;
      const value = node.value || "";
      SHORTCODE_RE.lastIndex = 0;
      if (!SHORTCODE_RE.test(value)) return;
      const replacement = splitShortcodes(value);
      if (!replacement) return;
      parent.children.splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
