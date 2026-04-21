import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initBotId } from 'botid/client/core'
import { createDOMRenderer, RendererProvider } from '@griffel/react'
import './index.css'
import App from './App.jsx'

// CSP nonce wiring — the middleware injects a per-request nonce into the
// <meta name="csp-nonce"> tag and sets a matching `style-src 'nonce-<value>'`
// directive on the response. We hand that same nonce to Griffel (Fluent UI's
// CSS-in-JS engine) so every runtime-emitted <style> tag carries
// nonce="<value>" and is accepted by the browser under the strict CSP.
//
// If the substitution didn't happen (e.g. middleware bypass, local `vite
// dev`), the meta value is the literal "__CSP_NONCE__"; we treat that as
// "no nonce" and let Griffel run without the attribute (the dev CSP is
// relaxed anyway, and prod always has the middleware).
const nonceMeta = document.querySelector('meta[name="csp-nonce"]')
const rawNonce = nonceMeta?.getAttribute('content') || ''
const cspNonce = rawNonce && rawNonce !== '__CSP_NONCE__' ? rawNonce : null
const griffelRenderer = createDOMRenderer(
  document,
  cspNonce ? { styleElementAttributes: { nonce: cspNonce } } : {},
)

// Vercel BotID — invisible bot detection on the contact form.
// Free Basic mode; protected paths must match the server route exactly.
initBotId({
  protect: [
    { path: '/api/contact', method: 'POST' },
  ],
})

// Sentry — lazy-loaded so the SDK (~35 kB gzipped with Replay) stays off
// the critical path. We kick off the dynamic import before render so
// early errors are still captured by the top-level `captureException`
// call inside our ErrorBoundary (which awaits module init implicitly via
// the shared singleton in src/lib/sentry.js).
const bootSentry = () => import('./lib/sentry.js').then((m) => m.initSentry())
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(bootSentry, { timeout: 2000 })
  } else {
    setTimeout(bootSentry, 0)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RendererProvider renderer={griffelRenderer} targetDocument={document}>
      <App />
    </RendererProvider>
  </StrictMode>,
)
