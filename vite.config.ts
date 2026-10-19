import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// @ts-ignore: Node built-in; the project's TS types are browser-only (vite runs this file in Node).
import { execSync } from 'node:child_process';
import { freshUrl } from './src/build';

/** Build stamp shown in the menu header (commit and UTC date), to tell which version is running. */
function buildStamp(): string {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* not a git checkout */
  }
  return `${sha} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

/**
 * Which address this build is for: '' for the game, 'next' for the work-in-progress copy at
 * /SWVR/next/ (the Pages workflow sets VITE_CHANNEL). Shown in the menu and the tab title.
 */
const CHANNEL = process.env.VITE_CHANNEL === 'next' ? 'next' : '';
const BUILD = (CHANNEL ? 'NEXT ' : '') + buildStamp();

/**
 * `build.json` beside the pages: which build the site is serving now. A line of script at
 * the top of each page (before the game loads) fetches it past the caches and reloads the
 * page, once, if it's behind (the rule is src/build.ts freshUrl, inlined here), so two
 * players don't end up on different builds after a push. Builds only: the dev server has no
 * build.json and never reloads.
 */
const buildFile = () => ({
  name: 'swvr-build-json',
  apply: 'build' as const,
  generateBundle(this: { emitFile(f: { type: 'asset'; fileName: string; source: string }): void }) {
    this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ app: BUILD }) });
  },
  transformIndexHtml(html: string) {
    const script = `<script>(function(){var mine=${JSON.stringify(BUILD)},href=location.href,freshUrl=${freshUrl.toString()};fetch(new URL('build.json?t='+Date.now(),href).toString(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){var u=freshUrl(mine,j&&typeof j.app==='string'?j.app:null,href);if(u)location.replace(u)}).catch(function(){})})()</script>`;
    return html.replace('<head>', `<head>${script}`);
  },
});

// HTTPS is required for WebXR on anything other than localhost. basicSsl generates
// a self-signed certificate, so the Quest browser shows a one-time warning on the LAN.
export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/SWVR/) and locally.
  base: './',
  plugins: [basicSsl(), buildFile()],
  define: { __BUILD__: JSON.stringify(BUILD), __CHANNEL__: JSON.stringify(CHANNEL) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // The Shipyard's trials run in a worker that imports the game's modules: an ES module worker.
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Three pages: the game, the hull study viewer (hulls.html; src/hulls/, not part of the
      // game) and the Shipyard (shipyard.html; src/shipyard/, which builds boats for it).
      input: { main: 'index.html', hulls: 'hulls.html', shipyard: 'shipyard.html' },
      output: {
        // three.js in its own chunk: it only changes when we upgrade it, so the headset
        // browser keeps it cached across our (frequent) game-code deploys.
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
