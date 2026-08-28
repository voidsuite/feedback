import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The repo keeps a single `.env` at the repo root (one level above the
// client), so Vite loads env files from there — the client build-time env,
// the server proxy target, and any other VITE_ vars.
const envDir = path.resolve(import.meta.dirname, "..")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "")
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5176,
      proxy: {
        // In dev, forward API calls to the bun gateway server.
        '/api': {
          target: env.VITE_DEV_PROXY || 'http://localhost:3005',
          changeOrigin: true,
        },
      },
    },
  }
})