import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const isStandaloneVite = process.env.STANDALONE_VITE === 'true';
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      ...(disableHmr
        ? [
            {
              name: 'disable-vite-hmr-websocket',
              apply: 'serve' as const,
              transform(code: string, id: string) {
                const cleanId = id.split('?')[0].replace(/\\/g, '/');
                if (cleanId.endsWith('/vite/dist/client/client.mjs')) {
                  return code.replace(
                    /const transport = normalizeModuleRunnerTransport\([\s\S]*?\}\)\(\)\);/,
                    'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
                  );
                }
                return null;
              },
            },
          ]
        : []),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'CivicSense AI',
          short_name: 'CivicSense',
          description:
            'Smarter Cities. Faster Responses. Better Infrastructure. Public infrastructure monitoring & prioritization.',
          theme_color: '#0F294A',
          background_color: '#F8FAFC',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,jpg}'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-cache',
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: !disableHmr,
      ws: disableHmr ? (false as const) : undefined,
      watch: disableHmr ? null : {},
      proxy: isStandaloneVite
        ? {
            '/api': 'http://localhost:3001',
            '/uploads': 'http://localhost:3001',
            '/demo-images': 'http://localhost:3001',
          }
        : undefined,
    },
  };
});
