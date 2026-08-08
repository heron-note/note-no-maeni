import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['assets/**/*'],
      manifest: {
        name: 'noteのまえに',
        short_name: 'noteのまえに',
        description: '書く日も、読む日も、休む日も。',
        theme_color: '#FFF8F0',
        background_color: '#FFF8F0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ogg,mp3}'],
      },
    }),
  ],
})
