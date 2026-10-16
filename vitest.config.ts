import { defineConfig } from 'vitest/config';

// Tests run in plain Node: simulation code must never need a DOM or a WebGL context.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'] },
});
