import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from GitHub Pages at https://<user>.github.io/keep-it-running/
export default defineConfig({
  base: '/keep-it-running/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Keep It Running',
        short_name: 'Keep It Running',
        description: 'Run a CNC router in a small Melbourne factory. Keep it cutting, keep the margin.',
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
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // Phaser's bundle is ~1.3 MB
      },
    }),
  ],
});
