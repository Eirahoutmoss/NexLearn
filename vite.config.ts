/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);
/** Android (Capacitor) kabuğu: dosyalar uygulama içinden gelir, service worker gerekmez. */
const isAndroid = process.env.NEX_TARGET === 'android';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    react(),
    // Tauri paketinde dosyalar zaten yerel; service worker yalnızca web/PWA için (Tauri'de devre dışı).
    VitePWA({
            disable: isTauri || isAndroid,
            registerType: 'prompt',
            injectRegister: false,
            includeAssets: ['favicon.svg', 'icons/*.png'],
            manifest: {
              name: 'NexLearn',
              short_name: 'NexLearn',
              description: 'Oku · Anla · Hatırla · Uygula — ücretsiz, yerel öncelikli öğrenme uygulaması',
              lang: 'tr',
              theme_color: '#FBF7F0',
              background_color: '#FBF7F0',
              display: 'standalone',
              start_url: './',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
              // OCR dosyaları (~9 MB) ilk kurulumda indirilmez; ilk kullanımda önbelleğe alınır.
              globIgnores: ['ocr/**', 'zihin/**'],
              runtimeCaching: [{ urlPattern: /\/ocr\//, handler: 'CacheFirst', options: { cacheName: 'nexlearn-ocr' } }],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: 'index.html',
            },
          }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/tests/setup.ts'],
  },
});
