import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Keep the installed app up to date: check for a new version on open and whenever it comes back to the foreground,
// and reload as soon as a new version takes over.
let reloading = false
const hadController = Boolean(navigator.serviceWorker?.controller)
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloading || !hadController) return
  reloading = true
  window.location.reload()
})
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 30 * 60 * 1000)
  },
})

// No StrictMode: it double-starts the camera scanner in development.
createRoot(document.getElementById('root')).render(<App />)
