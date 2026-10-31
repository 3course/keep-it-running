import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The commit this build is from: in the corner tag, and in <meta name="build-commit"> so a deploy can be checked.
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; } })();

// Served from GitHub Pages at https://keepitrunning.fyi/: this (world) build at the root, the main branch's panel
// prototype at /panel/ (the deploy workflow sets VITE_BASE for each).
const base = (process.env.VITE_BASE || '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  define: { __BUILD_COMMIT__: JSON.stringify(commit) },
  plugins: [
    { name: 'build-commit', transformIndexHtml: html => html.replace('</head>', `  <meta name="build-commit" content="${commit}" />\n  </head>`) },
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
