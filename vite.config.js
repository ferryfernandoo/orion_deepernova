import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        api_hit: './api_hit/index.html'
      }
    }
  },
  server: {
    middlewareMode: false
  }
})
