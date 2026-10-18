import { defineConfig } from 'vitest/config';

// Tests run in plain Node: simulation code must never need a DOM or a WebGL context.
export default defineConfig({
  // A few tests simulate minutes of play (a slipway landing, the weather director, a skiff on
  // her painter): about 5 s each alone, longer when every worker is busy. 20 s keeps a loaded
  // machine from failing them.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'], testTimeout: 20000 },
});
