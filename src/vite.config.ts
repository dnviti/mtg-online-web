import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import * as path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'MTG Draft Maker',
        short_name: 'MTG Draft',
        description: 'Multiplayer Magic: The Gathering Draft Simulator',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
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
    host: '0.0.0.0', // Expose to network
    proxy: {
      '/api': 'http://localhost:3000', // Proxy API requests to backend
      '/cards': 'http://localhost:3000', // Proxy cached card images
      '/images': 'http://localhost:3000', // Proxy static images
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
});
