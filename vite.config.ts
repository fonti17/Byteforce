import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            // ship a new service worker as soon as one is built, no user prompt
            registerType: 'autoUpdate',
            // makes the app installable from `npm run dev`, not just from a build
            devOptions: {
                enabled: true,
                type: 'module',
            },
            // copied verbatim into dist/ and precached
            includeAssets: ['favicon.ico', 'icons.svg', 'images/apple-touch-icon.png'],
            // generates 'manifest.webmanifest' file on build
            manifest: {
                id: '/',
                name: 'Byte Force - Event in a Box',
                short_name: 'Byte Force',
                description: 'Plan and organise your event end to end, in one box.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                display_override: ['standalone', 'minimal-ui'],
                orientation: 'portrait',
                background_color: '#ffffff',
                theme_color: '#E20026',
                icons: [
                    {
                        src: '/images/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/images/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/images/icon-192x192-maskable.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: '/images/icon-512x512-maskable.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                // defining cached files formats
                globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
                // serve index.html for any in-app route so the installed app works offline
                navigateFallback: '/index.html',
                // never let the SW intercept the dev proxy / API calls
                navigateFallbackDenylist: [/^\/api\//],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
            }
        })
    ],
  server: {
    proxy: {
      '/api/stoney': {
        target: 'https://llm.stoney-cloud.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stoney/, ''),
      },
      '/api/onprem': {
        target: 'https://llm-api2.b.onprem.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/onprem/, ''),
      },
      '/api/prodega': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/prodega/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@heroui') || id.includes('react-aria') || id.includes('react-stately')) {
              return 'vendor-heroui';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            return 'vendor';
          }
        },
      },
    },
  },
})
