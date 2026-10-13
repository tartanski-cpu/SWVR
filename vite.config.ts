import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// @ts-ignore: Node built-in; the project's TS types are browser-only (vite runs this file in Node).
import { execSync } from 'node:child_process';

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

// HTTPS is required for WebXR on anything other than localhost. basicSsl generates
// a self-signed certificate, so the Quest browser shows a one-time warning on the LAN.
export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/SWVR/) and locally.
  base: './',
  plugins: [basicSsl()],
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // three.js in its own chunk: it only changes when we upgrade it, so the headset
        // browser keeps it cached across our (frequent) game-code deploys.
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
