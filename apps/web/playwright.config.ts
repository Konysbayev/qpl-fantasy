import { defineConfig } from '@playwright/test';

// Скриншоттар: орнатылған Chromium (/opt/pw-browsers), витрина Vite dev-серверінен
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://localhost:5199', launchOptions: { executablePath: process.env.CHROMIUM_PATH } },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199/showcase.html', reuseExistingServer: true, timeout: 60_000 }
});
