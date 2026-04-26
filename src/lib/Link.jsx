import { Link as RouterLink } from "react-router-dom";
import { forwardRef } from "react";

// Drop-in replacement for react-router-dom's <Link> that opts every
// navigation into the View Transitions API. Browsers that don't
// support the API (older Firefox releases, ancient mobile Safari) fall
// back to a plain SPA navigation — no polyfill, no JS overhead, no
// behavior change. The actual transition curves live in index.css
// under ::view-transition-old/new(root).
//
// To make a specific element MORPH between pages instead of crossfading
// with the rest of the page, give it a unique `view-transition-name`
// in CSS (e.g. the persistent navbar logo). One name per page max —
// duplicate names abort the transition.
const Link = forwardRef(function Link(props, ref) {
  return <RouterLink ref={ref} viewTransition {...props} />;
});

export { Link };
export default Link;
