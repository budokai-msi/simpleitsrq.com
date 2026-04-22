/* Google Analytics 4 bootstrap — Consent Mode v2 compliant.
 *
 * Runs BEFORE the app bundle so gtag + dataLayer exist when React mounts.
 * Consent defaults are DENIED; the analytics library (src/lib/analytics.js)
 * upgrades them on visitor opt-in via the consent banner. Until then GA
 * operates in cookieless-ping mode (modeled data only, no identifiers).
 *
 * Measurement ID: read from window.__GA_ID__ (which the app bundle sets
 * from import.meta.env.VITE_GA_MEASUREMENT_ID), with a hardcoded fallback
 * so the page still measures if the env var is unset.
 */
(function () {
  var DEFAULT_GA_ID = "G-YBMM01FMVW";

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // Consent Mode v2 — everything denied by default. The consent banner
  // (via src/lib/analytics.js) flips these to "granted" on opt-in.
  gtag("consent", "default", {
    ad_storage:             "denied",
    ad_user_data:           "denied",
    ad_personalization:     "denied",
    analytics_storage:      "denied",
    functionality_storage:  "granted", // needed to remember the consent choice itself
    security_storage:       "granted", // CSRF, session safety
    wait_for_update:        500,       // ms; gtag holds pings this long while
                                       // the app resolves the persisted choice
  });

  // Load the gtag runtime. It respects the defaults above — until
  // analytics_storage flips to "granted" it runs in cookieless mode.
  var gaId = window.__GA_ID__ || DEFAULT_GA_ID;
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + gaId;
  document.head.appendChild(s);

  gtag("js", new Date());
  gtag("config", gaId, {
    anonymize_ip: true,
    // Disable automatic page_view on initial load — the SPA router owns
    // pageview emission (src/lib/analytics.js). Without this we'd double-
    // count the landing page.
    send_page_view: false,
  });
})();
