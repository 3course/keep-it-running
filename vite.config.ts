import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from GitHub Pages at https://keepitrunning.fyi/: this (world) build at the root, the main branch's panel
// prototype at /panel/ (the deploy workflow sets VITE_BASE for each).
const base = (process.env.VITE_BASE || '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // The service worker lives at <base>sw.js and controls everything under <base>: at the root that includes
      // /panel/ and /preview/, which aren't this app (see navigateFallbackDenylist).
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
        // offline, any page under the scope gets this app's index.html — except the panel build and the old
        // /preview/ address, which must reach the network (the panel app, and the redirect to the root)
        navigateFallbackDenylist: [/^\/panel(\/|$)/, /^\/preview(\/|$)/],
      },
    }),
  ],
});
