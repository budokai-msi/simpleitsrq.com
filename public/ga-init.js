/* Google Analytics 4 bootstrap — kept out of index.html so the site's strict
   CSP (no 'unsafe-inline') can load it from 'self' without an inline-hash. */
(function () {
  var GA_ID = 'G-YBMM01FMVW';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_ID, { anonymize_ip: true });
})();
