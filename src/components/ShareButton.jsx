import { useState } from "react";
import { Share2, Link as LinkIcon, Check } from "lucide-react";
import { track } from "../lib/analytics";

// Web Share API button with clipboard fallback. On mobile this opens the
// system share sheet (iOS, Android, Mac Safari). On browsers without
// navigator.share — primarily desktop Chrome / Firefox — it copies the
// URL to the clipboard with a "Link copied" affordance.
//
// Both paths fire a "share_click" analytics event with the channel,
// so the operator can see which mechanism is actually being used and
// from which post.
export default function ShareButton({ title, url, slug, className = "" }) {
  const [state, setState] = useState("idle"); // idle | copied | error
  const fullUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const fullTitle = title || (typeof document !== "undefined" ? document.title : "");

  const onClick = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: fullTitle, url: fullUrl });
        track("share_click", { channel: "native", slug });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
        setState("copied");
        track("share_click", { channel: "clipboard", slug });
        setTimeout(() => setState("idle"), 1800);
        return;
      }
      // Last-ditch: select+copy via temp element
      const ta = document.createElement("textarea");
      ta.value = fullUrl;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setState("copied");
      track("share_click", { channel: "execCommand", slug });
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      // AbortError fires when the user dismisses the share sheet — not
      // a real failure, swallow it silently.
      if (err?.name === "AbortError") return;
      setState("error");
      setTimeout(() => setState("idle"), 1800);
    }
  };

  return (
    <button
      type="button"
      className={`share-btn ${className}`.trim()}
      onClick={onClick}
      data-state={state}
      aria-label={state === "copied" ? "Link copied" : "Share this post"}
    >
      {state === "copied" ? (
        <><Check size={14} /> Copied</>
      ) : (
        <>
          {/* Native share API gets the share icon; fallback browsers see
              a link icon to telegraph "this will copy a link". */}
          {typeof navigator !== "undefined" && typeof navigator.share === "function"
            ? <Share2 size={14} />
            : <LinkIcon size={14} />}
          Share
        </>
      )}
    </button>
  );
}
