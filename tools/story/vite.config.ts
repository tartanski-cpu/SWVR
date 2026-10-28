/**
 * Builds the development-story deck (docs for people, not part of the game): the live demos
 * in story.ts, bundled with the game's own modules, as one ES module `dist/story.js`, with
 * the deck page and its pictures (page/) copied beside it. See README.md.
 *
 *   npx vite build --config tools/story/vite.config.ts
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  // The demos import the game's code as @game/...; nothing in src/ imports the deck.
  resolve: { alias: { '@game': fileURLToPath(new URL('../../src', import.meta.url)) } },
  worker: { format: 'es' },
  // The deck page and its screenshots go to dist/ as they are.
  publicDir: 'page',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    lib: { entry: `${here}story.ts`, formats: ['es'], fileName: () => 'story.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
