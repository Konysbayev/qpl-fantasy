import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'scripts/**/test/**/*.test.ts', 'supabase/functions/test/**/*.test.ts', 'apps/web/test/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['apps/web/**', 'jsdom']]
  }
});
