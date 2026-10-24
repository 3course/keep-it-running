import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from GitHub Pages. main builds at /keep-it-running/; the deploy workflow builds the world
// branch at /keep-it-running/preview/ by setting VITE_BASE.
const base = (process.env.VITE_BASE || '/keep-it-running/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // The service worker lives at <base>sw.js and only controls <base>, so the /preview/ install
      // and anything at /keep-it-running/ stay separate (Workbox also names its caches by scope).
      scope: base,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Keep It Running',
        short_name: 'Keep It Running',
        description: 'Run a CNC router in a small Melbourne factory. Keep it cutting, keep the margin.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14110f',
        theme_color: '#14110f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
