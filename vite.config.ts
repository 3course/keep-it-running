import { defineConfig } from 'vite';

// Served from GitHub Pages at https://keepitrunning.fyi/: this (main, the panel prototype) build at /panel/, the
// world branch's 3D game at the root (the deploy workflow sets VITE_BASE for each).
const base = (process.env.VITE_BASE || '/keep-it-running/').replace(/\/?$/, '/');

export default defineConfig({
  base,
});
