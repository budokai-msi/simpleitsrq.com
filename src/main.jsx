import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initBotId } from 'botid/client/core'
import './index.css'
import App from './App.jsx'

// Griffel (Fluent's CSS-in-JS engine) used to be initialized here so its
// runtime <style> tags would carry our CSP nonce. It moved INTO
// src/pages/ClientPortal.jsx — the only Fluent consumer in the app — so
// the homepage entry chunk no longer ships @griffel/react. The
// RendererProvider in ClientPortal reads the same csp-nonce meta tag.

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
    <App />
  </StrictMode>,
)
