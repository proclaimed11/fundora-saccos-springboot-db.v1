import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // in development every /api call is forwarded to the backend, so the browser never hits CORS
      '/api': {
        target: 'http://3.127.183.244',
        changeOrigin: true,
      },
    },
  },
})