import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5177,
    proxy: {
      // In dev, forward API + WebSocket (realtime) calls to the bun gateway.
      '/api': {
        target: process.env.VITE_DEV_PROXY || 'http://localhost:3006',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})