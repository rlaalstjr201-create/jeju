import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules'],
  },
});
