import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base: './'` so the built bundle works when FastAPI serves it from the same
// origin. The dev proxy sends /api straight to uvicorn, which keeps the fetch
// paths identical in development and in the built app — no environment switch,
// no CORS handling in the frontend.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
