import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initBotId } from 'botid/client/core'
import './index.css'
import App from './App.jsx'

// Vercel BotID — invisible bot detection on the contact form.
// Free Basic mode; protected paths must match the server route exactly.
initBotId({
  protect: [
    { path: '/api/contact', method: 'POST' },
  ],
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
