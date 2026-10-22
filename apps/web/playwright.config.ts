import { defineConfig } from '@playwright/test';

// Скриншоттар: орнатылған Chromium (/opt/pw-browsers), витрина Vite dev-серверінен
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://localhost:5199', launchOptions: { executablePath: process.env.CHROMIUM_PATH } },
  webServer: { command: 'VITE_SUPABASE_URL=http://mock.supabase.test VITE_SUPABASE_ANON_KEY=mock VITE_DEV_INIT_DATA=dev npx vite --port 5199 --strictPort', url: 'http://localhost:5199/showcase.html', reuseExistingServer: true, timeout: 60_000 }
});
