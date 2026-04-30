import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ml': {
        target: 'http://127.0.0.1:5000',
        rewrite: (path) => path.replace(/^\/ml/, '/api'),
      },
    },
  },
  define: {
    global: 'globalThis',
  },
})
