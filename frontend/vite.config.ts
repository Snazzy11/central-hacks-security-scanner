import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // "@/lib/api" -> "src/lib/api". Keep in sync with tsconfig "paths".
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The frontend calls /api/... and Vite forwards it to FastAPI (no CORS needed).
    proxy: { '/api': 'http://localhost:8000' },
  },
});
