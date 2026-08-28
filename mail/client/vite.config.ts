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
    port: 5174,
    proxy: {
      // In dev, forward API calls to the bun gateway server.
      '/api': {
        target: process.env.VITE_DEV_PROXY || 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
})