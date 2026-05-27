import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const userStage = env.VITE_APP_USER || 'employee'

  const base =
    userStage === 'admin'
      ? '/xpertlabuat/front/xperttalk/admin/'
      : userStage === 'employee'
      ? '/xpertlabuat/front/xperttalk/'
      : ''

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          importScripts: [
            'https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js',
            'https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js',
            'firebase-sw-addon.js',
          ],
          globPatterns: [
            '**/*.{js,css,html,ico,png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,eot}',
          ],
          navigateFallbackDenylist: [/\/ws/, /\/wss/],
          runtimeCaching: [
            {
              urlPattern: /\.(?:js|css|woff2?|ttf|eot)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-assets',
                expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /\/chatapp\//i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
        },
        manifest: {
          short_name: 'XpertTalk',
          name: 'XpertTalk',
          icons: [
            { src: 'media/logos/xperttalk-logo-96.png', sizes: '96x96', type: 'image/png' },
            { src: 'media/logos/xperttalk-logo-128.png', sizes: '128x128', type: 'image/png' },
            { src: 'media/logos/xperttalk-favilogo.png', sizes: '512x512', type: 'image/png' },
          ],
          start_url: base,
          scope: base,
          id: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#000000',
          background_color: '#000000',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-emoji': ['@emoji-mart/data', '@emoji-mart/react'],
            'vendor-firebase': ['firebase/messaging', 'firebase/app'],
          },
        },
      },
    },
  }
})
