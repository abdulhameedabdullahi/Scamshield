import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'manifest.json',
      devOptions: { enabled: false },
      manifest: {
        name: 'ScamShield',
        short_name: 'ScamShield',
        description: 'Check any message before you trust it. ScamShield detects SMS, WhatsApp and email scams privately on your phone.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#2D1657',
        theme_color: '#2D1657',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        share_target: {
          action: '/',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { text: 'text', title: 'title', url: 'url' },
        },
        categories: ['utilities', 'security'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
})
