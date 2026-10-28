import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Determine backend target: explicit BACKEND_URL > Docker default > local default
const backendTarget =
  process.env.BACKEND_URL ||
  (process.env.RUNNING_IN_DOCKER === 'true' ? 'http://backend:8000' : 'http://localhost:8000');

console.log(`[vite] Proxy target: ${backendTarget}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
