import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'client', // Set root to client folder where index.html resides
  build: {
    outDir: '../dist', // Build to src/dist (outside client)
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src')
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000', // Proxy API requests to backend
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
});
