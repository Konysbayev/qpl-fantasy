import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// packages/core типтері мен ережелері репозиторий түбірінен импортталады
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [path.resolve(__dirname, '..', '..')] } },
  build: { outDir: 'dist', target: 'es2020' }
});
