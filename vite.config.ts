import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  server: {
    port: 5173,
    proxy: {
      // Forward all /api/* requests to the Express backend on port 3000
      // so the frontend works exactly like the production server (which
      // serves dist/ on :3000 with /api on the same origin).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
