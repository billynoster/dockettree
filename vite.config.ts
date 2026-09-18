import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 43217),
    host: '127.0.0.1',
    strictPort: true,
    // The API runs in its own process during development.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 43218}` },
  },
})
