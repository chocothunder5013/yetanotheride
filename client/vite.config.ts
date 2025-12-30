import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 1. Listen on all network interfaces (0.0.0.0)
    host: true, 
    // 2. Ensure we are on the correct port
    port: 5173,
    // 3. (Optional) Polling is often needed for Docker file-watching to work on Windows/WSL
    watch: {
      usePolling: true,
    },
  },
})
