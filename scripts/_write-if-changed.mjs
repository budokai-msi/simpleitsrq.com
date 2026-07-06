// Shared "don't rewrite what didn't change" helpers for the prebuild
// generators. The prebuild pipeline regenerates every artifact on every
// run (Vercel, CI, and fresh checkouts all start without the .og-cache
// sidecar), so the generators must be safe to re-run on an unchanged
// tree: `git status` has to stay clean. These helpers make that the
// default by comparing the freshly generated content against what is
// already on disk and skipping the write when nothing changed.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

// Write a UTF-8 text artifact only when its content changed. The
// comparison ignores CRLF/LF differences so a Windows checkout
// (core.autocrlf=true smudges committed LF to CRLF) isn't rewritten
// with LF bytes — that would leave a phantom modification in
// `git status` even though the content is identical.
// Returns true when the file was (re)written.
export function writeTextIfChanged(path, content) {
  if (existsSync(path)) {
    let existing = null;
    try {
      existing = readFileSync(path, "utf8");
    } catch {
      // Unreadable — fall through and rewrite.
    }
    if (
      existing !== null &&
      existing.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n")
    ) {
      return false;
    }
  }
  writeFileSync(path, content, "utf8");
  return true;
}

// Write a PNG artifact only when its *pixels* changed. Byte-compare
// first (cheap, catches the common deterministic-encoder case), then
// fall back to decoding both images to raw RGBA and comparing pixels —
// PNG container bytes can vary across sharp/libvips versions even when
// the rendered image is identical, and rewriting committed cards on
// every environment change caused endless artifact churn.
// Returns true when the file was (re)written.
export async function writePngIfChanged(path, pngBuffer) {
  if (existsSync(path)) {
    try {
      const existing = readFileSync(path);
      if (existing.equals(pngBuffer)) return false;
      const [oldPixels, newPixels] = await Promise.all([
        sharp(existing).ensureAlpha().raw().toBuffer(),
        sharp(pngBuffer).ensureAlpha().raw().toBuffer(),
      ]);
      if (oldPixels.equals(newPixels)) return false;
    } catch {
      // Existing file unreadable/corrupt — fall through and rewrite.
    }
  }
  writeFileSync(path, pngBuffer);
  return true;
}
