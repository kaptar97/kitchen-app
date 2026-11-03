import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Kitchen',
        short_name: 'Kitchen',
        description: 'Our shared kitchen & house inventory',
        theme_color: '#2f7d4f',
        background_color: '#f6f4ef',
        display: 'standalone',
        start_url: '/',
        share_target: { action: '/', method: 'GET', params: { title: 'shared_title', text: 'shared_text', url: 'shared_url' } },
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never cache Supabase API calls — always fresh data.
        navigateFallbackDenylist: [/^\/api/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
