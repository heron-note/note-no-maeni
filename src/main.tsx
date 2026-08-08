import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

// ===== DEBUG: #clear でlocalStorageを全消去 =====
const DEBUG_CLEAR_ENABLED = true
if (DEBUG_CLEAR_ENABLED && window.location.hash === '#clear') {
  localStorage.clear()
  window.location.replace(import.meta.env.BASE_URL)
}
// ================================================

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
