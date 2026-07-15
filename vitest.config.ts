import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/back/src/**/*.test.ts',
      'apps/front/src/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
    ],
  },
});
