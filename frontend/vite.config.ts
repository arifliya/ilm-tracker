import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true, // This is the missing piece for Docker
      interval: 1000,   // Optional: checks for changes every 1 second
    },
    hmr: {
      host: 'localhost',
      port: 5173
    }
  }
});