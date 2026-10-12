import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is required for WebXR on anything other than localhost. basicSsl generates
// a self-signed certificate, so the Quest browser shows a one-time warning on the LAN.
export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/SWVR/) and locally.
  base: './',
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
