import { defineConfig } from 'vite';

// Served from GitHub Pages. main builds at /keep-it-running/; the deploy workflow builds the world
// branch at /keep-it-running/preview/ by setting VITE_BASE.
const base = (process.env.VITE_BASE || '/keep-it-running/').replace(/\/?$/, '/');

export default defineConfig({
  base,
});
