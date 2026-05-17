import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules',
      'tests/e2e/**',
      'src/interface/api/server.test.ts',
    ],
  },
});
