import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// No StrictMode: it double-starts the camera scanner in development.
createRoot(document.getElementById('root')).render(<App />)
