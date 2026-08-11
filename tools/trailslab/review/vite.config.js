import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local review tool. The dev server binds 127.0.0.1 (not 0.0.0.0) and proxies
// /api to the FastAPI process, so the browser only ever talks to one origin
// and the API needs no CORS opening at all. Port 5174 keeps it clear of the
// main app's 5173.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: false,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
